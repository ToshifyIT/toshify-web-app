// ============================================================
// Módulo principal de Visitas / Agendamiento
// Orquesta: calendario, formulario, detalle, export
// ============================================================

import { useState, useEffect, useCallback } from 'react';
import { Plus, Download, Calendar as CalendarIcon, List, Eye, Settings } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns';
import Swal from 'sweetalert2';
import { showSuccess } from '../../utils/toast';
import { useAuth } from '../../contexts/AuthContext';
import { usePermissions } from '../../contexts/PermissionsContext';
import { useSede } from '../../contexts/SedeContext';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { DataTable } from '../../components/ui/DataTable';
import type { ColumnDef } from '@tanstack/react-table';
import type {
  VisitaCategoria,
  VisitaMotivo,
  VisitaCompleta,
  VisitaCalendarEvent,
  CalendarResource,
  VisitaFormData,
  VisitaEstado,
  VisitaAtendedor,
} from '../../types/visitas.types';
import { VISITA_ESTADOS } from '../../types/visitas.types';
import {
  fetchCategorias,
  fetchMotivos,
  fetchAtendedores,
  fetchVisitas,
  createVisita,
  updateVisita,
  updateVisitaEstado,
  cancelarVisitaConMotivo,
  deleteVisita,
  toCalendarEvents,
  toCalendarResources,
  autoUpdateEstados,
} from '../../services/visitasService';
import { VisitasCalendario } from './components/VisitasCalendario';
import { VisitasFormModal } from './components/VisitasFormModal';
import { VisitaDetalleModal } from './components/VisitaDetalleModal';
import { VisitasParametrosTab } from './components/VisitasParametrosTab';
import './VisitasModule.css';

type MainTab = 'calendario' | 'parametros';
type ViewMode = 'calendario' | 'tabla';
type CalendarView = 'week' | 'month';

export function VisitasModule() {
  // === HOOKS ===
  const { user, profile } = useAuth();
  const { canEditInSubmenu, isAdmin } = usePermissions();
  const { sedeActualId, sedeUsuario } = useSede();
  const canEdit = isAdmin() || canEditInSubmenu('visitas');

  // === STATE: tabs ===
  const [mainTab, setMainTab] = useState<MainTab>('calendario');

  // === STATE: data ===
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<VisitaCategoria[]>([]);
  const [motivos, setMotivos] = useState<VisitaMotivo[]>([]);
  const [atendedores, setAtendedores] = useState<VisitaAtendedor[]>([]);
  const [visitas, setVisitas] = useState<VisitaCompleta[]>([]);

  // === STATE: calendar ===
  const [calendarEvents, setCalendarEvents] = useState<VisitaCalendarEvent[]>([]);
  const [calendarResources, setCalendarResources] = useState<CalendarResource[]>([]);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [currentCalendarView, setCurrentCalendarView] = useState<CalendarView>('week');

  // === STATE: UI ===
  const [viewMode, setViewMode] = useState<ViewMode>('calendario');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDetalleModal, setShowDetalleModal] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [selectedVisita, setSelectedVisita] = useState<VisitaCompleta | null>(null);
  const [prefillDate, setPrefillDate] = useState<Date | undefined>();
  const [prefillResourceId, setPrefillResourceId] = useState<string | undefined>();

  // === RANGO DE CONSULTA (expandido para cubrir vista mes) ===
  const getQueryRange = useCallback((date: Date) => {
    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    const rangeStart = startOfWeek(subMonths(monthStart, 1), { weekStartsOn: 1 });
    const rangeEnd = endOfWeek(addMonths(monthEnd, 1), { weekStartsOn: 1 });
    return {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
    };
  }, []);

  // === CARGA DE DATOS ===
  const cargarCatalogos = useCallback(async () => {
    const [cats, mots, atends] = await Promise.all([
      fetchCategorias(),
      fetchMotivos(),
      fetchAtendedores(sedeActualId),
    ]);
    setCategorias(cats);
    setMotivos(mots);
    setAtendedores(atends);
    setCalendarResources(toCalendarResources(atends));
  }, [sedeActualId]);

  const cargarVisitas = useCallback(async () => {
    const { start, end } = getQueryRange(currentDate);
    const raw = await fetchVisitas(sedeActualId, start, end);
    // Auto-transicionar estados según hora actual (pendiente→en_curso→completada)
    const updated = await autoUpdateEstados(raw);
    // Filtrar citas "Directivo": solo visibles para el creador y admins
    const data = updated.filter((v) => {
      if (v.categoria_nombre?.toLowerCase() !== 'directivo') return true;
      if (isAdmin()) return true;
      return v.citador_id === user?.id;
    });
    setVisitas(data);
    setCalendarEvents(toCalendarEvents(data));
  }, [sedeActualId, currentDate, getQueryRange, isAdmin, user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      try {
        await cargarCatalogos();
        if (!cancelled) await cargarVisitas();
      } catch {
        Swal.fire('Error', 'No se pudieron cargar los datos', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    init();
    return () => { cancelled = true; };
  }, [cargarCatalogos, cargarVisitas]);

  // Re-evaluar estados automáticamente cada 60s
  useEffect(() => {
    const interval = setInterval(() => {
      cargarVisitas();
    }, 60_000);
    return () => clearInterval(interval);
  }, [cargarVisitas]);

  // === HANDLERS: Calendar ===
  function handleSelectSlot(slotInfo: { start: Date; end: Date; resourceId?: string | number }) {
    if (!canEdit) return;
    setPrefillDate(slotInfo.start);
    setPrefillResourceId(slotInfo.resourceId?.toString());
    setModalMode('create');
    setSelectedVisita(null);
    setShowFormModal(true);
  }

  function handleSelectEvent(event: VisitaCalendarEvent) {
    setSelectedVisita(event.visita);
    setShowDetalleModal(true);
  }

  function handleNavigate(date: Date) {
    setCurrentDate(date);
  }

  function handleViewChange(view: CalendarView) {
    setCurrentCalendarView(view);
  }

  // === HANDLERS: CRUD ===
  async function handleSaveVisita(formData: VisitaFormData) {
    const sedeId = sedeActualId ?? sedeUsuario?.id;
    if (!sedeId || !user?.id) {
      Swal.fire('Error', 'No se pudo determinar la sede o el usuario', 'error');
      return;
    }

    const citadorNombre = profile?.nombre_completo
      ?? profile?.nombres
      ?? user.email
      ?? 'Sistema';

    if (modalMode === 'create') {
      await createVisita(formData, sedeId, user.id, citadorNombre);
      showSuccess('Cita agendada correctamente');
    } else if (selectedVisita) {
      await updateVisita(selectedVisita.id, formData);
      showSuccess('Cita actualizada correctamente');
    }

    setShowFormModal(false);
    await cargarVisitas();
  }

  async function handleChangeEstado(estado: VisitaEstado) {
    if (!selectedVisita) return;
    const info = VISITA_ESTADOS[estado];

    if (estado === 'cancelada') {
      // Cancelar requiere motivo obligatorio
      const result = await Swal.fire({
        title: 'Cancelar cita',
        text: 'Ingresá el motivo de la cancelación:',
        input: 'text',
        inputPlaceholder: 'Ej: No asistió, reprogramada, etc.',
        inputValidator: (value) => {
          if (!value || !value.trim()) return 'Debés ingresar un motivo';
          return null;
        },
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: 'Cancelar cita',
        cancelButtonText: 'Volver',
        confirmButtonColor: '#6b7280',
      });
      if (!result.isConfirmed) return;

      try {
        const motivoCancelacion = result.value as string;
        await cancelarVisitaConMotivo(selectedVisita.id, motivoCancelacion, selectedVisita.nota);
        showSuccess('Cita cancelada');
        setShowDetalleModal(false);
        await cargarVisitas();
      } catch {
        Swal.fire('Error', 'No se pudo cancelar la cita', 'error');
      }
    } else {
      const result = await Swal.fire({
        title: `Cambiar a "${info.label}"`,
        text: `¿Confirma cambiar el estado de esta cita a "${info.label}"?`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonText: 'Sí, cambiar',
        cancelButtonText: 'Cancelar',
      });
      if (!result.isConfirmed) return;

      try {
        await updateVisitaEstado(selectedVisita.id, estado);
        showSuccess(`Estado cambiado a "${info.label}"`);
        setShowDetalleModal(false);
        await cargarVisitas();
      } catch {
        Swal.fire('Error', 'No se pudo cambiar el estado', 'error');
      }
    }
  }

  async function handleDeleteVisita() {
    if (!selectedVisita) return;
    const result = await Swal.fire({
      title: 'Eliminar cita',
      text: `¿Eliminar la cita de ${selectedVisita.nombre_visitante}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#ef4444',
    });
    if (!result.isConfirmed) return;

    try {
      await deleteVisita(selectedVisita.id);
      showSuccess('Cita eliminada');
      setShowDetalleModal(false);
      await cargarVisitas();
    } catch {
      Swal.fire('Error', 'No se pudo eliminar la cita', 'error');
    }
  }

  function handleEditFromDetalle() {
    setShowDetalleModal(false);
    setModalMode('edit');
    setShowFormModal(true);
  }

  function handleNuevaCita() {
    setModalMode('create');
    setSelectedVisita(null);
    setPrefillDate(undefined);
    setPrefillResourceId(undefined);
    setShowFormModal(true);
  }

  // === EXPORT EXCEL ===
  async function handleExportarExcel() {
    if (visitas.length === 0) {
      Swal.fire('Sin datos', 'No hay citas para exportar', 'info');
      return;
    }
    const XLSX = await import('xlsx');
    const dataExport = visitas.map((v) => ({
      'Fecha': format(new Date(v.fecha_hora), 'dd/MM/yyyy'),
      'Hora': format(new Date(v.fecha_hora), 'HH:mm'),
      'Duración (min)': v.duracion_minutos,
      'Categoría': v.categoria_nombre,
      'Motivo': v.motivo_nombre ?? '',
      'Visitante': v.nombre_visitante,
      'DNI': v.dni_visitante ?? '',
      'Patente': v.patente ?? '',
      'Anfitrión': v.atendedor_nombre,
      'Estado': VISITA_ESTADOS[v.estado]?.label ?? v.estado,
      'Citador': v.citador_nombre,
      'Nota': v.nota ?? '',
    }));

    const ws = XLSX.utils.json_to_sheet(dataExport);
    ws['!cols'] = [
      { wch: 12 }, { wch: 6 }, { wch: 10 }, { wch: 16 }, { wch: 24 },
      { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 18 },
      { wch: 12 }, { wch: 18 }, { wch: 30 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Visitas');
    const fecha = format(new Date(), 'yyyy-MM-dd');
    XLSX.writeFile(wb, `Visitas_${fecha}.xlsx`);
  }

  // === COLUMNAS DATATABLE (vista tabla) ===
  const columns: ColumnDef<VisitaCompleta>[] = [
    {
      accessorKey: 'fecha_hora',
      header: 'Fecha/Hora',
      cell: ({ getValue }) => {
        const dt = new Date(getValue() as string);
        return `${format(dt, 'dd/MM/yyyy')} ${format(dt, 'HH:mm')}`;
      },
      size: 140,
    },
    { accessorKey: 'categoria_nombre', header: 'Categoría', size: 120 },
    { accessorKey: 'motivo_nombre', header: 'Motivo', size: 150, cell: ({ getValue }) => (getValue() as string) || '-' },
    { accessorKey: 'nombre_visitante', header: 'Visitante', size: 180 },
    { accessorKey: 'dni_visitante', header: 'DNI', size: 100, cell: ({ getValue }) => (getValue() as string) || '-' },
    { accessorKey: 'patente', header: 'Patente', size: 90, cell: ({ getValue }) => (getValue() as string) || '-' },
    { accessorKey: 'atendedor_nombre', header: 'Anfitrión', size: 150 },
    {
      accessorKey: 'estado',
      header: 'Estado',
      size: 110,
      cell: ({ getValue }) => {
        const estado = getValue() as VisitaEstado;
        const info = VISITA_ESTADOS[estado];
        return (
          <span className="visita-estado-badge" style={{ backgroundColor: info?.color ?? '#6b7280' }}>
            {info?.label ?? estado}
          </span>
        );
      },
    },
    {
      accessorKey: 'citador_nombre',
      header: 'Citador',
      size: 140,
      cell: ({ getValue }) => {
        const val = (getValue() as string) || '-';
        return (
          <span title={val} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '130px' }}>
            {val}
          </span>
        );
      },
    },
    {
      accessorKey: 'duracion_minutos',
      header: 'Duración',
      size: 80,
      cell: ({ getValue }) => `${getValue()} min`,
    },
    {
      id: 'acciones',
      header: '',
      size: 50,
      cell: ({ row }) => (
        <button
          className="btn-icon"
          title="Ver detalle"
          onClick={() => {
            setSelectedVisita(row.original);
            setShowDetalleModal(true);
          }}
        >
          <Eye size={16} />
        </button>
      ),
    },
  ];

  return (
    <div className="visitas-module">
      {/* Main Tabs */}
      <div className="visitas-tabs">
        <button
          className={`visitas-tab ${mainTab === 'calendario' ? 'active' : ''}`}
          onClick={() => setMainTab('calendario')}
        >
          <CalendarIcon size={16} />
          Calendario
        </button>
        <button
          className={`visitas-tab ${mainTab === 'parametros' ? 'active' : ''}`}
          onClick={() => setMainTab('parametros')}
        >
          <Settings size={16} />
          Parámetros
        </button>
      </div>

      {/* Tab content */}
      {mainTab === 'calendario' && (
        <div className="visitas-tab-content">
          <LoadingOverlay show={loading} message="Cargando visitas..." />

          {/* Header */}
          <div className="visitas-header">
            <div className="visitas-view-toggle">
              <button
                className={`visitas-view-btn ${viewMode === 'calendario' ? 'active' : ''}`}
                onClick={() => setViewMode('calendario')}
              >
                <CalendarIcon size={16} /> Calendario
              </button>
              <button
                className={`visitas-view-btn ${viewMode === 'tabla' ? 'active' : ''}`}
                onClick={() => setViewMode('tabla')}
              >
                <List size={16} /> Tabla
              </button>
            </div>
            <div className="visitas-header-actions">
              <button className="btn-secondary" onClick={handleExportarExcel}>
                <Download size={16} /> Exportar
              </button>
              {canEdit && (
                <button className="btn-primary" onClick={handleNuevaCita}>
                  <Plus size={16} /> Nueva Cita
                </button>
              )}
            </div>
          </div>

          {/* Contenido */}
          {viewMode === 'calendario' ? (
            <VisitasCalendario
              events={calendarEvents}
              resources={calendarResources}
              currentDate={currentDate}
              currentView={currentCalendarView}
              onNavigate={handleNavigate}
              onViewChange={handleViewChange}
              onSelectSlot={handleSelectSlot}
              onSelectEvent={handleSelectEvent}
            />
          ) : (
            <DataTable
              data={visitas}
              columns={columns}
              searchPlaceholder="Buscar visitas..."
            />
          )}

          {/* Modales */}
          {showFormModal && (
            <VisitasFormModal
              mode={modalMode}
              visita={selectedVisita}
              categorias={categorias}
              motivos={motivos}
              atendedores={atendedores}
              prefillDate={prefillDate}
              prefillResourceId={prefillResourceId}
              onSave={handleSaveVisita}
              onClose={() => setShowFormModal(false)}
            />
          )}

          {showDetalleModal && selectedVisita && (
            <VisitaDetalleModal
              visita={selectedVisita}
              canEdit={canEdit}
              onEdit={handleEditFromDetalle}
              onChangeEstado={handleChangeEstado}
              onDelete={handleDeleteVisita}
              onClose={() => setShowDetalleModal(false)}
            />
          )}
        </div>
      )}

      {mainTab === 'parametros' && (
        <div className="visitas-tab-content">
          <VisitasParametrosTab />
        </div>
      )}
    </div>
  );
}
