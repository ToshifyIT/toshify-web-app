// ============================================================
// Componente de calendario para visitas
// Responsabilidad: renderizar el calendario con react-big-calendar
// ============================================================

import { useState, useMemo, useCallback, useRef } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import { X, Clock, User, Tag, FileText } from 'lucide-react';
import type { VisitaCalendarEvent, VisitaCompleta, CalendarResource, VisitaEstado } from '../../../types/visitas.types';
import { VISITA_ESTADOS } from '../../../types/visitas.types';

import 'react-big-calendar/lib/css/react-big-calendar.css';

// Obtener la hora actual en Argentina (para la línea roja del calendario)
function getNowInArgentina(): Date {
  const now = new Date()
  const argTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Argentina/Buenos_Aires' }))
  return argTime
}

// --- Localizer date-fns (español) ---
const locales = { es };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// --- Mensajes en español ---
const messages = {
  allDay: 'Todo el día',
  previous: 'Anterior',
  next: 'Siguiente',
  today: 'Hoy',
  month: 'Mes',
  week: 'Semana',
  day: 'Día',
  agenda: 'Agenda',
  date: 'Fecha',
  time: 'Hora',
  event: 'Cita',
  noEventsInRange: 'No hay citas en este rango.',
  showMore: (total: number) => `+${total} más`,
};

interface VisitasCalendarioProps {
  events: VisitaCalendarEvent[];
  resources: CalendarResource[];
  currentDate: Date;
  currentView: 'week' | 'month' | 'day';
  onNavigate: (date: Date) => void;
  onViewChange: (view: 'week' | 'month' | 'day') => void;
  onSelectSlot: (slotInfo: { start: Date; end: Date; resourceId?: string | number }) => void;
  onSelectEvent: (event: VisitaCalendarEvent) => void;
}

export function VisitasCalendario({
  events,
  resources,
  currentDate,
  currentView,
  onNavigate,
  onViewChange,
  onSelectSlot,
  onSelectEvent,
}: VisitasCalendarioProps) {
  void resources; // Reservado para futuro uso con vista por recurso

  // Color del evento por categoría + opacidad por estado
  const eventStyleGetter = useCallback((event: VisitaCalendarEvent) => {
    const v = event.visita;
    const masked = (v as VisitaCompleta & { _masked?: boolean })._masked;

    // Citas Directivo enmascaradas: gris sólido, sin detalles
    if (masked) {
      return {
        style: {
          backgroundColor: '#d1d5db',
          opacity: 0.85,
          borderRadius: '6px',
          border: 'none',
          borderLeft: '3px solid #9ca3af',
          color: '#6b7280',
          fontSize: '11px',
          padding: '3px 8px',
          fontWeight: 500 as const,
          cursor: 'default',
        },
      };
    }

    const estado = v.estado as VisitaEstado;
    const baseColor = v.categoria_color || '#3b82f6';
    const isDone = estado === 'completada' || estado === 'cancelada' || estado === 'no_asistio';
    return {
      style: {
        backgroundColor: baseColor,
        opacity: isDone ? 0.45 : 0.95,
        borderRadius: '6px',
        border: 'none',
        borderLeft: `3px solid ${baseColor}`,
        color: '#fff',
        fontSize: '11px',
        padding: '3px 8px',
        fontWeight: 500 as const,
      },
    };
  }, []);

  // Horario visible del calendario (8am - 20pm)
  const minTime = useMemo(() => {
    const d = new Date();
    d.setHours(7, 0, 0, 0);
    return d;
  }, []);

  const maxTime = useMemo(() => {
    const d = new Date();
    d.setHours(20, 0, 0, 0);
    return d;
  }, []);

  // Modal para ver citas de un slot cuando hay muchas solapadas
  const [slotModalDate, setSlotModalDate] = useState<Date | null>(null);
  const [slotModalTimeKey, setSlotModalTimeKey] = useState<string | null>(null);

  const slotModalEvents = useMemo(() => {
    if (!slotModalDate) return [];
    const dayStr = format(slotModalDate, 'yyyy-MM-dd');
    let filtered = events.filter((e) => format(e.start, 'yyyy-MM-dd') === dayStr);
    // Si viene de un evento sintético, filtrar solo la franja horaria
    if (slotModalTimeKey) {
      filtered = filtered.filter((e) => format(e.start, 'yyyy-MM-dd_HH:mm') === slotModalTimeKey);
    }
    return filtered.sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [slotModalDate, slotModalTimeKey, events]);

  // Pre-procesar eventos: si hay más de 1 solapado, reemplazar por un solo bloque "+X citas"
  const processedEvents = useMemo(() => {
    if (currentView !== 'week') return events;

    // Agrupar eventos por día + hora de inicio
    const groups = new Map<string, VisitaCalendarEvent[]>();
    for (const ev of events) {
      const key = format(ev.start, 'yyyy-MM-dd_HH:mm');
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(ev);
    }

    const result: VisitaCalendarEvent[] = [];
    for (const [, group] of groups) {
      if (group.length <= 2) {
        // 1-2 citas: mostrar lado a lado normal
        result.push(...group);
      } else {
        // 3+ citas solapadas: un solo bloque "+X citas"
        const synth: VisitaCalendarEvent = {
          id: `more_${format(group[0].start, 'yyyy-MM-dd_HH:mm')}`,
          title: `${group.length} citas`,
          start: group[0].start,
          end: group[0].end,
          resourceId: group[0].resourceId,
          visita: {
            ...group[0].visita,
            nombre_visitante: `${group.length} citas`,
            categoria_nombre: '',
            categoria_color: '',
            _synthetic: true,
          } as VisitaCompleta & { _synthetic: boolean },
        };
        result.push(synth);
      }
    }
    return result;
  }, [events, currentView]);

  // Click en evento: si es sintético "+X más", abrir modal del día
  const handleEventClick = useCallback((event: VisitaCalendarEvent) => {
    // deno-lint-ignore no-explicit-any
    if ((event.visita as any)._synthetic) {
      setSlotModalTimeKey(format(event.start, 'yyyy-MM-dd_HH:mm'));
      setSlotModalDate(event.start);
      return;
    }
    onSelectEvent(event);
  }, [onSelectEvent]);

  // Handler para click en "+X más" en vista mes
  const handleShowMore = useCallback((_events: VisitaCalendarEvent[], date: Date) => {
    setSlotModalTimeKey(null); // Mostrar todas las del día
    setSlotModalDate(date);
  }, []);

  // Handler para click en día del header
  const handleDrillDown = useCallback((date: Date) => {
    setSlotModalTimeKey(null); // Mostrar todas las del día
    setSlotModalDate(date);
  }, []);

  // Estilo especial para el bloque "+X citas"
  const enhancedEventStyleGetter = useCallback((event: VisitaCalendarEvent) => {
    // deno-lint-ignore no-explicit-any
    if ((event.visita as any)._synthetic) {
      return {
        style: {
          backgroundColor: '#f1f5f9',
          borderRadius: '6px',
          border: '1.5px dashed #94a3b8',
          color: '#475569',
          fontSize: '12px',
          padding: '4px 8px',
          fontWeight: 600 as const,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          letterSpacing: '0.2px',
        },
      };
    }
    return eventStyleGetter(event);
  }, [eventStyleGetter]);

  // --- Hover tooltip state ---
  const [hoveredEvent, setHoveredEvent] = useState<VisitaCalendarEvent | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const tooltipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEventMouseEnter = useCallback((event: VisitaCalendarEvent, e: React.MouseEvent) => {
    // deno-lint-ignore no-explicit-any
    if ((event.visita as any)._synthetic || (event.visita as any)._masked) return;
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTooltipPos({ x: rect.right + 8, y: rect.top });
    setHoveredEvent(event);
  }, []);

  const handleEventMouseLeave = useCallback(() => {
    tooltipTimeout.current = setTimeout(() => setHoveredEvent(null), 150);
  }, []);

  // Custom event wrapper que captura hover
  const EventWrapperComponent = useMemo(() => {
    return function EventWrapper({ event, children }: { event: VisitaCalendarEvent; children: React.ReactNode }) {
      return (
        <div
          onMouseEnter={(e) => handleEventMouseEnter(event, e)}
          onMouseLeave={handleEventMouseLeave}
        >
          {children}
        </div>
      );
    };
  }, [handleEventMouseEnter, handleEventMouseLeave]);

  // Desactivar tooltip nativo del browser
  const noTooltip = useCallback(() => '', []);

  return (
    <div className="visitas-calendario-wrapper">
      <div className="visitas-timezone-badge">
        <Clock size={14} />
        <span>Argentina (GMT-3)</span>
      </div>
      <Calendar<VisitaCalendarEvent, CalendarResource>
        localizer={localizer}
        culture="es"
        messages={messages}
        events={processedEvents}
        date={currentDate}
        view={currentView}
        views={['week', 'month']}
        onNavigate={onNavigate}
        onView={onViewChange as (view: string) => void}
        selectable
        onSelectSlot={onSelectSlot}
        onSelectEvent={handleEventClick}
        onShowMore={handleShowMore}
        onDrillDown={handleDrillDown}
        drilldownView={null}
        eventPropGetter={enhancedEventStyleGetter}
        tooltipAccessor={noTooltip}
        components={{
          eventWrapper: EventWrapperComponent as any,
        }}
        step={60}
        timeslots={1}
        min={minTime}
        max={maxTime}
        getNow={getNowInArgentina}
        scrollToTime={getNowInArgentina()}
        defaultView="week"
        popup
        popupOffset={10}
        showMultiDayTimes
      />

      {/* Tooltip hover estilo Google Calendar */}
      {hoveredEvent && (() => {
        const v = hoveredEvent.visita;
        const estadoInfo = VISITA_ESTADOS[v.estado as VisitaEstado];
        const color = v.categoria_color || '#3b82f6';
        // Ajustar posición para que no se salga de la pantalla
        const adjustedX = tooltipPos.x + 300 > window.innerWidth ? tooltipPos.x - 316 : tooltipPos.x;
        const adjustedY = tooltipPos.y + 200 > window.innerHeight ? window.innerHeight - 210 : tooltipPos.y;
        return (
          <div
            className="visita-hover-tooltip"
            style={{ left: adjustedX, top: adjustedY }}
            onMouseEnter={() => { if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current); }}
            onMouseLeave={() => setHoveredEvent(null)}
          >
            <div className="visita-hover-tooltip-color" style={{ backgroundColor: color }} />
            <div className="visita-hover-tooltip-content">
              <div className="visita-hover-tooltip-title">{v.nombre_visitante}</div>
              <div className="visita-hover-tooltip-time">
                <Clock size={13} />
                {format(hoveredEvent.start, 'HH:mm')} - {format(hoveredEvent.end, 'HH:mm')} ({v.duracion_minutos} min)
              </div>
              <div className="visita-hover-tooltip-row">
                <Tag size={13} />
                <span>{v.categoria_nombre}{v.motivo_nombre ? ` - ${v.motivo_nombre}` : ''}</span>
              </div>
              <div className="visita-hover-tooltip-row">
                <User size={13} />
                <span>{v.atendedor_nombre}</span>
              </div>
              {v.nota && (
                <div className="visita-hover-tooltip-row">
                  <FileText size={13} />
                  <span className="visita-hover-tooltip-obs">{v.nota}</span>
                </div>
              )}
              <div className="visita-hover-tooltip-estado" style={{
                backgroundColor: estadoInfo?.color ? `${estadoInfo.color}20` : '#f0f0f0',
                color: estadoInfo?.color || '#666'
              }}>
                {estadoInfo?.label || v.estado}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Modal de citas del día */}
      {slotModalDate && (
        <div className="visitas-day-modal-overlay" onClick={() => { setSlotModalDate(null); setSlotModalTimeKey(null); }}>
          <div className="visitas-day-modal" onClick={(e) => e.stopPropagation()}>
            <div className="visitas-day-modal-header">
              <h3>
                Citas del {format(slotModalDate, "EEEE d 'de' MMMM", { locale: es })}
                {slotModalTimeKey && ` - ${format(slotModalDate, 'HH:mm')}`}
              </h3>
              <button className="visitas-day-modal-close" onClick={() => { setSlotModalDate(null); setSlotModalTimeKey(null); }}>
                <X size={18} />
              </button>
            </div>
            <div className="visitas-day-modal-body">
              {slotModalEvents.length === 0 ? (
                <p className="visitas-day-modal-empty">No hay citas este día</p>
              ) : (
                slotModalEvents.map((ev: VisitaCalendarEvent) => {
                  const v = ev.visita;
                  const masked = (v as VisitaCompleta & { _masked?: boolean })._masked;
                  const estadoInfo = VISITA_ESTADOS[v.estado as VisitaEstado];
                  return (
                    <div
                      key={ev.id}
                      className={`visitas-day-modal-event ${masked ? 'masked' : ''}`}
                      onClick={() => { if (!masked) onSelectEvent(ev); }}
                      style={masked ? undefined : { borderLeftColor: v.categoria_color || '#3b82f6' }}
                    >
                      <div className="visitas-day-modal-event-time">
                        {format(ev.start, 'HH:mm')} - {format(ev.end, 'HH:mm')}
                      </div>
                      <div className="visitas-day-modal-event-info">
                        <span className="visitas-day-modal-event-title">
                          {masked ? 'Reservado' : v.nombre_visitante}
                        </span>
                        {!masked && (
                          <span className="visitas-day-modal-event-cat">
                            {v.categoria_nombre}{v.motivo_nombre ? ` - ${v.motivo_nombre}` : ''}
                          </span>
                        )}
                      </div>
                      {!masked && (
                        <span className={`visitas-day-modal-event-estado ${v.estado}`}>
                          {estadoInfo?.label || v.estado}
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
