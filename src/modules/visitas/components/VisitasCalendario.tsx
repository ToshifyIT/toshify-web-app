// ============================================================
// Componente de calendario para visitas
// Responsabilidad: renderizar el calendario con react-big-calendar
// ============================================================

import { useMemo, useCallback } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import { es } from 'date-fns/locale/es';
import type { VisitaCalendarEvent, VisitaCompleta, CalendarResource, VisitaEstado } from '../../../types/visitas.types';
import { VISITA_ESTADOS } from '../../../types/visitas.types';

import 'react-big-calendar/lib/css/react-big-calendar.css';

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
  currentView: 'week' | 'month';
  onNavigate: (date: Date) => void;
  onViewChange: (view: 'week' | 'month') => void;
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

  // Tooltip content
  const tooltipAccessor = useCallback((event: VisitaCalendarEvent) => {
    const v = event.visita;
    // Citas Directivo enmascaradas: tooltip genérico
    const masked = (v as VisitaCompleta & { _masked?: boolean })._masked;
    if (masked) return 'Reservado';
    const estadoInfo = VISITA_ESTADOS[v.estado];
    return `${v.nombre_visitante}\n${v.categoria_nombre}${v.motivo_nombre ? ' - ' + v.motivo_nombre : ''}\nAnfitrión: ${v.atendedor_nombre}\nEstado: ${estadoInfo.label}\nDuración: ${v.duracion_minutos} min`;
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

  // Recursos no se muestran (vista día removida)
  const showResources = false;

  return (
    <div className="visitas-calendario-wrapper">
      <Calendar<VisitaCalendarEvent, CalendarResource>
        localizer={localizer}
        culture="es"
        messages={messages}
        events={events}
        resources={showResources ? resources : undefined}
        resourceIdAccessor="id"
        resourceTitleAccessor="title"
        date={currentDate}
        view={currentView}
        views={['week', 'month']}
        onNavigate={onNavigate}
        onView={onViewChange as (view: string) => void}
        selectable
        onSelectSlot={onSelectSlot}
        onSelectEvent={onSelectEvent}
        eventPropGetter={eventStyleGetter}
        tooltipAccessor={tooltipAccessor}
        step={60}
        timeslots={1}
        min={minTime}
        max={maxTime}
        defaultView="week"
        popup
        showMultiDayTimes
      />
    </div>
  );
}
