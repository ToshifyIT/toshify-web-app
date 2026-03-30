import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { fetchGuias, getCabifyDatosPorSemanas } from './guiasService'
import { format, startOfISOWeek, endOfISOWeek, setISOWeek, addHours, previousSunday, startOfDay, endOfDay, subWeeks, nextSunday, addWeeks } from 'date-fns'
import { WeekSelector } from './components/WeekSelector'
import { 
  AlertTriangle, 
  Users, 
  DollarSign, 
  Filter, 
  Eye, 
  PhoneCall,
  Phone,
  CheckCircle,
  Pencil,
  ArrowLeftRight,
  Search,
  History,
  Book,
  Heart,
  Star,
  Target,
  GraduationCap,
  Triangle,
  X
} from 'lucide-react'
import { DataTable } from '../../components/ui/DataTable'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { type ColumnDef } from '@tanstack/react-table'
import type { ConductorWithRelations } from '../../types/database.types'
import Swal from 'sweetalert2'
import { DriverDetailModal } from './components/DriverDetailModal'
import { DriverHistoryModal } from './components/DriverHistoryModal'
import { AnotacionesEditorModal, type Nota } from './components/AnotacionesEditorModal'
import { AnotacionesModal, type Anotacion } from './components/AnotacionesModal'
import { ReporteEscuelaModal, type ConductorEscuela } from './components/ReporteEscuelaModal'
import { ReasignacionModal } from './components/ReasignacionModal'
import { CabifyHistoricoModal } from './components/CabifyHistoricoModal'
import GestionConductores from './components/GestionConductores'
import { useAuth } from '../../contexts/AuthContext'
import { useSede } from '../../contexts/SedeContext'
import './GuiasModule.css'
import './GuiasToolbar.css'
import iconNotas from './Iconos/notas.png'
import { getEstadoConductorDisplay } from '../../utils/conductorUtils'
import { normalizeDni } from '../../utils/normalizeDocuments'

const getCurrentWeek = () => {
  return format(new Date(), "R-'W'II");
};

interface Guia {
  id: string
  email: string
  full_name: string
  is_active: boolean
  created_at: string
  role_name: string
  role_description: string
}

export function GuiasModule() {
  const [guias, setGuias] = useState<Guia[]>([])
  const [selectedGuiaId, setSelectedGuiaId] = useState<string | null>(null)
  const [selectedWeek, setSelectedWeek] = useState(getCurrentWeek())
  const [loading, setLoading] = useState(true)
  const [drivers, setDrivers] = useState<any[]>([])
  const [currentWeekDrivers, setCurrentWeekDrivers] = useState<any[]>([])
  const [loadingDrivers, setLoadingDrivers] = useState(false)
  const [searchParams] = useSearchParams()
  const { id: paramId } = useParams()
  const { profile } = useAuth()
  const { sedeActualId, aplicarFiltroSede } = useSede()
  const urlGuiaId = paramId || searchParams.get('id')
  const hasDistributedRef = useRef(false)
  const hasSyncedRef = useRef(false)
  const [syncFinished, setSyncFinished] = useState(false)
  // Estados para filtros (replicados de ConductoresModule)
  const [nombreFilter, setNombreFilter] = useState<string[]>([])
  const [cbuFilter] = useState<string[]>([]) // Reutilizado para CUIL
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState<string[]>([])
  const [categoriaFilter] = useState<string[]>([])
  const [asignacionFilter, setAsignacionFilter] = useState<string[]>([])
  const [efectivoFilter, setEfectivoFilter] = useState<string[]>([])
  const [appFilter, setAppFilter] = useState<string[]>([])
  const [totalFilter, setTotalFilter] = useState<string[]>([])
  const [cabifyDataFilter, setCabifyDataFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  const [filterDropdownPos, setFilterDropdownPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const [sinGncFilter, setSinGncFilter] = useState(false)
  const [conSaldoFilter, setConSaldoFilter] = useState(false)
  const [showAllDrivers, setShowAllDrivers] = useState(false)
  
  // Estados para búsqueda dentro de filtros
  const [nombreSearch, setNombreSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [cbuSearch] = useState('')



  // Estados para modal de detalles
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedConductor, setSelectedConductor] = useState<ConductorWithRelations | null>(null)
  const [selectedConductorHistory, setSelectedConductorHistory] = useState<any | null>(null)
  const [historyRows, setHistoryRows] = useState<any[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [seguimientoRules, setSeguimientoRules] = useState<any[]>([])
  const [seguimientoLoaded, setSeguimientoLoaded] = useState(false)
  const [accionesImplementadas, setAccionesImplementadas] = useState<any[]>([])
  
  // Estado para filtro por métricas (solo semana actual)
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null)

  // Resetear filtro de métricas al cambiar de semana
  useEffect(() => {
    setActiveStatFilter(null);
  }, [selectedWeek]);
  
  // Estados para modal de anotaciones (Editor - Semana Actual)
  const [anotacionesModalOpen, setAnotacionesModalOpen] = useState(false)
  const [selectedRowForAnotaciones] = useState<{ id: string, anotaciones: Nota[], conductorName: string } | null>(null)

  // Estados para modal de Historial de Notas (Viewer - Todas las semanas)
  const [historyNotesModalOpen, setHistoryNotesModalOpen] = useState(false);
  const [historyNotesData, setHistoryNotesData] = useState<Anotacion[]>([]);
  const [historyNotesDriverName, setHistoryNotesDriverName] = useState("");
  const [historyNotesDriverDni, setHistoryNotesDriverDni] = useState("");
  const [historyNotesTotal, setHistoryNotesTotal] = useState(0);

  // Estados para modal de Reporte Escuela
  const [schoolReportModalOpen, setSchoolReportModalOpen] = useState(false);
  const [schoolReportData, setSchoolReportData] = useState<ConductorEscuela[]>([]);
  const [schoolReportPage, setSchoolReportPage] = useState(1);
  const [precalculatedSchoolReport, setPrecalculatedSchoolReport] = useState<ConductorEscuela[]>([]);
  const [isSchoolReportCalculated, setIsSchoolReportCalculated] = useState(false);

  // Estado para el modal de Gestión de Conductores
  const [gestionConductoresModalOpen, setGestionConductoresModalOpen] = useState(false);

  // Estado para el modal de Cabify Histórico
  const [cabifyHistoricoModalOpen, setCabifyHistoricoModalOpen] = useState(false);
  const [cabifyHistoricoConductor, setCabifyHistoricoConductor] = useState<{ id: string; nombres: string; apellidos: string; numero_dni: string } | null>(null);

  // Efecto para precargar reporte de escuela en segundo plano
  useEffect(() => {
    if (drivers.length > 0) {
      calculateSchoolReportBackground();
    }
  }, [drivers]);

  const calculateSchoolReportBackground = async () => {
    const conductoresEscuela = drivers.filter(d => d.fecha_escuela);
    if (conductoresEscuela.length === 0) {
      setPrecalculatedSchoolReport([]);
      setIsSchoolReportCalculated(true);
      return;
    }

    try {
      const emptyMetrics = { promGan: 0, horas: '0', porcOcup: '0%', acept: '-' };

      // --- BATCH OPTIMIZATION (replaces N+1 per-conductor queries) ---
      // Before: 4-12 Supabase queries PER conductor = 80-240 total queries
      // After: 1-2 batch queries total, results distributed in JavaScript

      // Step 1: Compute per-conductor target dates and the global date range
      let globalMinDate: Date | null = null;
      let globalMaxDate: Date | null = null;

      interface ConductorDateInfo {
        conductorId: string;
        prevDates: Date[];
        postDates: Date[];
      }
      const conductorDateInfos: ConductorDateInfo[] = [];

      for (const d of conductoresEscuela) {
        if (!d.fecha_escuela || !d.numero_dni) continue;

        const fechaEscuelaDate = addHours(new Date(d.fecha_escuela), 12);
        const sundayPrev1 = previousSunday(fechaEscuelaDate);
        const sundayPrev2 = subWeeks(sundayPrev1, 1);
        const sundayPost1 = nextSunday(fechaEscuelaDate);
        const sundayPost2 = addWeeks(sundayPost1, 1);

        const allTargetDates = [sundayPrev1, sundayPrev2, sundayPost1, sundayPost2];

        for (const targetDate of allTargetDates) {
          const rangeStart = startOfDay(subWeeks(targetDate, 9)); // ~63 days back
          const rangeEnd = endOfDay(targetDate);
          if (!globalMinDate || rangeStart < globalMinDate) globalMinDate = rangeStart;
          if (!globalMaxDate || rangeEnd > globalMaxDate) globalMaxDate = rangeEnd;
        }

        conductorDateInfos.push({
          conductorId: d.id,
          prevDates: [sundayPrev1, sundayPrev2],
          postDates: [sundayPost1, sundayPost2],
        });
      }

      // Step 2: Collect all DNIs (normalized)
      const allDnisSet = new Set<string>();
      for (const d of conductoresEscuela) {
        if (!d.fecha_escuela || !d.numero_dni) continue;
        const dniNorm = normalizeDni(d.numero_dni);
        if (dniNorm) allDnisSet.add(dniNorm);
      }
      const allDnis = Array.from(allDnisSet);

      // Step 3: ONE batch query by DNI for ALL conductors
      type CabifyRow = { dni: string; nombre: string; apellido: string; ganancia_total: number; horas_conectadas: number; tasa_ocupacion: number; tasa_aceptacion: number; fecha_inicio: string };
      let allCabifyRows: CabifyRow[] = [];

      if (globalMinDate && globalMaxDate && allDnis.length > 0) {
        const { data: batchData } = await supabase
          .from('cabify_historico')
          .select('dni, nombre, apellido, ganancia_total, horas_conectadas, tasa_ocupacion, tasa_aceptacion, fecha_inicio')
          .in('dni', allDnis)
          .gte('fecha_inicio', globalMinDate.toISOString())
          .lte('fecha_inicio', globalMaxDate.toISOString());

        if (batchData) allCabifyRows = batchData;
      }

      // Build lookup: normalizedDni -> rows sorted by fecha_inicio desc
      const cabifyByDni = new Map<string, CabifyRow[]>();
      for (const row of allCabifyRows) {
        const key = normalizeDni(row.dni);
        if (!key) continue;
        const arr = cabifyByDni.get(key) || [];
        arr.push(row);
        cabifyByDni.set(key, arr);
      }
      for (const [, arr] of cabifyByDni) {
        arr.sort((a, b) => new Date(b.fecha_inicio).getTime() - new Date(a.fecha_inicio).getTime());
      }

      // Step 4: Identify conductors not found by DNI for name-based fallback
      const conductorsNeedingNameFallback: string[] = [];
      for (const d of conductoresEscuela) {
        if (!d.fecha_escuela || !d.numero_dni) continue;
        const dniNorm = normalizeDni(d.numero_dni);
        if (!cabifyByDni.has(dniNorm)) {
          conductorsNeedingNameFallback.push(d.id);
        }
      }

      // Fallback: ONE broad query for name matching (only if needed)
      const cabifyByName = new Map<string, CabifyRow[]>();
      if (conductorsNeedingNameFallback.length > 0 && globalMinDate && globalMaxDate) {
        const { data: nameData } = await supabase
          .from('cabify_historico')
          .select('dni, nombre, apellido, ganancia_total, horas_conectadas, tasa_ocupacion, tasa_aceptacion, fecha_inicio')
          .gte('fecha_inicio', globalMinDate.toISOString())
          .lte('fecha_inicio', globalMaxDate.toISOString());

        if (nameData) {
          for (const row of nameData) {
            const fullName = `${row.nombre || ''} ${row.apellido || ''}`.trim().toLowerCase();
            if (!fullName) continue;
            const arr = cabifyByName.get(fullName) || [];
            arr.push(row);
            cabifyByName.set(fullName, arr);
          }
          for (const [, arr] of cabifyByName) {
            arr.sort((a, b) => new Date(b.fecha_inicio).getTime() - new Date(a.fecha_inicio).getTime());
          }
        }
      }

      // Step 5: Distribute results to each conductor in JavaScript
      const findMetricForDate = (rows: CabifyRow[] | undefined, targetDate: Date) => {
        if (!rows || rows.length === 0) return null;
        const rangeEnd = endOfDay(targetDate).getTime();
        const rangeStart = startOfDay(subWeeks(targetDate, 9)).getTime();
        // rows are sorted desc, first match in range is the most recent
        for (const row of rows) {
          const t = new Date(row.fecha_inicio).getTime();
          if (t >= rangeStart && t <= rangeEnd) return row;
        }
        return null;
      };

      const getMetricsFromRows = (rows: CabifyRow[] | undefined, datesToQuery: Date[]) => {
        let totalGanancia = 0;
        let totalHoras = 0;
        let totalOcupacion = 0;
        let totalAceptacion = 0;
        let count = 0;

        for (const targetDate of datesToQuery) {
          const metrics = findMetricForDate(rows, targetDate);
          if (metrics) {
            totalGanancia += Number(metrics.ganancia_total || 0);
            totalHoras += Number(metrics.horas_conectadas || 0);
            totalOcupacion += Number(metrics.tasa_ocupacion || 0);
            totalAceptacion += Number(metrics.tasa_aceptacion || 0);
            count++;
          }
        }

        return {
          promGan: count > 0 ? totalGanancia / count : 0,
          horas: count > 0 ? totalHoras / count : 0,
          porcOcup: count > 0 ? totalOcupacion / count : 0,
          acept: count > 0 ? totalAceptacion / count : 0,
        };
      };

      const formatM = (m: { promGan: number; horas: number; porcOcup: number; acept: number }) => ({
        promGan: m.promGan,
        horas: m.horas.toFixed(1),
        porcOcup: m.porcOcup.toFixed(0) + '%',
        acept: m.acept.toFixed(0) + '%',
      });

      const updatedData = conductoresEscuela.map((d) => {
        const baseData = {
          id: d.id,
          nombre: `${d.nombres} ${d.apellidos}`,
          fechaCap: d.fecha_escuela ? format(addHours(new Date(d.fecha_escuela), 12), 'dd/MM/yyyy') : '-',
          semanas2: { ...emptyMetrics },
          semanas4: { ...emptyMetrics },
        };

        if (!d.fecha_escuela || !d.numero_dni) {
          return { ...baseData, previo: { ...emptyMetrics }, semanas2: { ...emptyMetrics } };
        }

        const info = conductorDateInfos.find(ci => ci.conductorId === d.id);
        if (!info) {
          return { ...baseData, previo: { ...emptyMetrics }, semanas2: { ...emptyMetrics } };
        }

        // Resolve rows: try DNI first, then name fallback
        const dniNorm = normalizeDni(d.numero_dni);
        let conductorRows = cabifyByDni.get(dniNorm);

        if (!conductorRows || conductorRows.length === 0) {
          const nombres = (d.nombres || '').trim().toLowerCase();
          const apellidos = (d.apellidos || '').trim().toLowerCase();
          if (nombres && apellidos) {
            for (const [key, rows] of cabifyByName) {
              if (key.includes(nombres) && key.includes(apellidos)) {
                conductorRows = rows;
                break;
              }
            }
          }
        }

        const metricsPrev = getMetricsFromRows(conductorRows, info.prevDates);
        const metricsPost = getMetricsFromRows(conductorRows, info.postDates);

        return {
          ...baseData,
          previo: formatM(metricsPrev),
          semanas2: formatM(metricsPost),
        };
      });

      setPrecalculatedSchoolReport(updatedData);
      setIsSchoolReportCalculated(true);

    } catch {
      // silently ignored
    }
  };

  // Efecto para cerrar filtros al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = () => {
      // Si el clic llega al document, significa que fue fuera del dropdown (que tiene stopPropagation)
      setOpenColumnFilter(null);
    };

    if (openColumnFilter) {
      document.addEventListener('click', handleClickOutside);
    }

    return () => {
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openColumnFilter]);

  // Función para abrir el modal de Reporte Escuela
  /* const handleOpenSchoolReport = () => {
    // Si ya se calculó, usar los datos precargados
    if (isSchoolReportCalculated) {
        setSchoolReportData(precalculatedSchoolReport);
        setSchoolReportModalOpen(true);
        return;
    }

    // Si aún no se calculó, abrir con placeholders (el efecto actualizará cuando termine)
    const conductoresEscuela = drivers.filter(d => d.fecha_escuela);
    const initialData: ConductorEscuela[] = conductoresEscuela.map(d => ({
      id: d.id,
      nombre: `${d.nombres} ${d.apellidos}`,
      fechaCap: d.fecha_escuela ? format(addHours(new Date(d.fecha_escuela), 12), 'dd/MM/yyyy') : '-',
      previo: { promGan: 0, horas: 'Cargando...', porcOcup: '-', acept: '-' },
      semanas2: { promGan: 0, horas: '...', porcOcup: '...', acept: '-' },
      semanas4: { promGan: 0, horas: '...', porcOcup: '...', acept: '-' }
    }));
    
    setSchoolReportData(initialData);
    setSchoolReportModalOpen(true);
  }; */

  // Efecto para actualizar el modal si se abre antes de terminar el cálculo
  useEffect(() => {
    if (schoolReportModalOpen && isSchoolReportCalculated) {
      setSchoolReportData(precalculatedSchoolReport);
    }
  }, [schoolReportModalOpen, isSchoolReportCalculated, precalculatedSchoolReport]);


  // Función para abrir el modal de EDICIÓN (Semana Actual) - Se mantiene por compatibilidad si se usa desde otros lados
  // const handleOpenAnotacionesEditor = (row: any) => {
  //   if (!row.original.historial_id) {
  //     Swal.fire('Error', 'Este registro no tiene historial asociado aún.', 'warning');
  //     return;
  //   }
  //
  //   setSelectedRowForAnotaciones({
  //     id: row.original.historial_id,
  //     anotaciones: row.original.anotaciones_extra || [],
  //     conductorName: `${row.original.nombres} ${row.original.apellidos}`
  //   });
  //   setAnotacionesModalOpen(true);
  // };

  // Función para abrir el modal de HISTORIAL (Todas las semanas)
  const handleViewHistoryNotes = async (row: any) => {
    const driverId = row.original.id; // ID del conductor
    const driverName = `${row.original.nombres} ${row.original.apellidos}`;
    const driverDni = row.original.numero_dni || '';
    
    try {
      // Consultar historial de todas las semanas para este conductor
      const { data, error } = await supabase
        .from('guias_historial_semanal')
        .select('semana, anotaciones_extra')
        .eq('id_conductor', driverId)
        .order('semana', { ascending: false });

      if (error) throw error;

      const allNotes: Anotacion[] = [];
      
      (data ?? []).forEach((record: any) => {
        if (!Array.isArray(record.anotaciones_extra)) return;
        const notesFromWeek = record.anotaciones_extra.map((nota: any, index: number) => ({
          id: nota.id || `${record.semana}-${index}`,
          texto: nota.texto,
          fecha: nota.fecha,
          usuario: nota.usuario,
          avatarColor: nota.avatarColor || '#3b82f6',
          semana: record.semana
        }));
        allNotes.push(...notesFromWeek);
      });

      setHistoryNotesData(allNotes);
      setHistoryNotesTotal(allNotes.length);
      setHistoryNotesDriverName(driverName);
      setHistoryNotesDriverDni(driverDni ? String(driverDni) : '');
      setHistoryNotesModalOpen(true);

    } catch {
      Swal.fire('Error', 'No se pudieron cargar las notas históricas', 'error');
    }
  };

  // Estados para modal de reasignación
  const [reasignacionModalOpen, setReasignacionModalOpen] = useState(false)
  const [selectedConductorForReassign, setSelectedConductorForReassign] = useState<any>(null)

  const handleSaveAnotaciones = async (nuevasAnotaciones: Nota[]) => {
    if (!selectedRowForAnotaciones) return;

    try {
      const { error } = await supabase
        .from('guias_historial_semanal')
        .update({ anotaciones_extra: nuevasAnotaciones } as any)
        .eq('id', selectedRowForAnotaciones.id);

      if (error) throw error;

      // Actualizar estado local
      setDrivers(prev => prev.map(d => {
        if (d.historial_id === selectedRowForAnotaciones.id) {
          return { ...d, anotaciones_extra: nuevasAnotaciones };
        }
        return d;
      }));
      
    } catch (error) {
      Swal.fire('Error', 'No se pudieron guardar las anotaciones', 'error');
      throw error;
    }
  };

  const handleConfirmReasignacion = async (newGuideId: string) => {
    if (!selectedConductorForReassign) return;

    try {
      // 1. Actualizar tabla conductores
      const { error: errorConductor } = await supabase
        .from('conductores')
        .update({ id_guia: newGuideId } as any)
        .eq('id', selectedConductorForReassign.id);
      if (errorConductor) throw errorConductor;

      // 2. Actualizar registro específico en guias_historial_semanal
      if (selectedConductorForReassign.historial_id) {
        const { error: errorHistorial } = await supabase
          .from('guias_historial_semanal')
          .update({ id_guia: newGuideId } as any)
          .eq('id', selectedConductorForReassign.historial_id);
        if (errorHistorial) throw errorHistorial;
      }

      Swal.mixin({
        toast: true,
        position: 'top',
        showConfirmButton: false,
        timer: 2000,
        timerProgressBar: true,
        customClass: { popup: 'toast-popup', title: 'toast-title' }
      }).fire({ icon: 'success', title: 'Reasignación exitosa' });

      // Recargar conductores del guía actual para reflejar que se fue
      if (!selectedGuiaId) return;
      loadDrivers(selectedGuiaId);
      loadCurrentWeekMetrics(selectedGuiaId);
    } catch {
      Swal.fire('Error', 'No se pudo completar la reasignación', 'error');
    }
  };

  const handleViewHistory = async (driver: any) => {
    setSelectedConductorHistory(driver);
    setShowHistoryModal(true);
    setHistoryRows([]);

    try {
      // 1. Get history rows from guias_historial_semanal (solo metadata)
      const { data: historyData, error: historyError } = await supabase
        .from('guias_historial_semanal')
        .select('semana, seguimiento, id_accion_imp, fecha_llamada, anotaciones_extra')
        .eq('id_conductor', driver.id)
        .order('semana', { ascending: false });

      if (historyError) throw historyError;

      if (!historyData || historyData.length === 0) return;

      // 2. Obtener datos financieros con consulta directa a cabify_historico (filtrada por DNI)
      const semanas = historyData.map((d: any) => d.semana);
      const cabifyDataMap = new Map<string, Map<string, { cobroApp: number; cobroEfectivo: number }>>();
      const dniNorm = driver.numero_dni ? normalizeDni(String(driver.numero_dni)) : '';
      if (dniNorm && semanas.length > 0) {
        try {
          const weekDates = semanas.map(s => {
            const [yStr, wStr] = s.split('-W');
            const y = parseInt(yStr); const w = parseInt(wStr);
            const jan4 = new Date(Date.UTC(y, 0, 4));
            const dow = jan4.getUTCDay() || 7;
            const mondayW1 = new Date(jan4.getTime() - (dow - 1) * 86400000);
            const monday = new Date(mondayW1.getTime() + (w - 1) * 7 * 86400000);
            const sunday = new Date(monday.getTime() + 6 * 86400000);
            return { monday, sunday };
          });
          const minDate = new Date(Math.min(...weekDates.map(w => w.monday.getTime())));
          const maxDate = new Date(Math.max(...weekDates.map(w => w.sunday.getTime())));

          const { data: cabifyRows } = await supabase
            .from('cabify_historico')
            .select('dni, cobro_efectivo, cobro_app, fecha_inicio')
            .eq('dni', dniNorm)
            .gte('fecha_inicio', minDate.toISOString())
            .lte('fecha_inicio', new Date(Date.UTC(maxDate.getUTCFullYear(), maxDate.getUTCMonth(), maxDate.getUTCDate(), 23, 59, 59, 999)).toISOString());

          if (cabifyRows && cabifyRows.length > 0) {
            for (const row of cabifyRows) {
              const fechaDate = new Date(row.fecha_inicio);
              const monday = startOfISOWeek(fechaDate);
              const semanaKey = format(monday, "R-'W'II");
              let semanaMap = cabifyDataMap.get(semanaKey);
              if (!semanaMap) { semanaMap = new Map(); cabifyDataMap.set(semanaKey, semanaMap); }
              const existing = semanaMap.get(driver.id) || { cobroApp: 0, cobroEfectivo: 0 };
              existing.cobroApp += Number(row.cobro_app) || 0;
              existing.cobroEfectivo += Number(row.cobro_efectivo) || 0;
              semanaMap.set(driver.id, existing);
            }
          }
        } catch {
          // Cabify falló — se mostrará $0
        }
      }

      const rows = historyData.map(d => {
        const cabifyEntry = cabifyDataMap.get(d.semana)?.get(driver.id);
        const app = cabifyEntry ? Number(cabifyEntry.cobroApp.toFixed(2)) : 0;
        const efectivo = cabifyEntry ? Number(cabifyEntry.cobroEfectivo.toFixed(2)) : 0;
        const total = Number((app + efectivo).toFixed(2));

        let seguimientoLabel = 'SEMANAL';
        const rawSeguimiento = (d as any).seguimiento;
        if (rawSeguimiento && typeof rawSeguimiento === 'string' && rawSeguimiento.trim() !== '') {
          seguimientoLabel = rawSeguimiento.trim().toUpperCase();
        } else if (seguimientoRules && seguimientoRules.length > 0) {
          for (const rule of seguimientoRules) {
            const desde = Number(rule.desde || 0);
            const hasta = rule.hasta !== null && rule.hasta !== undefined ? Number(rule.hasta) : Infinity;
            if (app >= desde && app <= hasta) {
              seguimientoLabel = (rule.rango_nombre || 'SEMANAL').toString().toUpperCase();
              break;
            }
          }
        }

        // Accion nombre
        const accionObj = accionesImplementadas.find(a => a.id === d.id_accion_imp);
        const accionNombre = accionObj ? accionObj.nombre : (d.id_accion_imp === 1 ? 'CAPACITACION CABIFY' : '-');

        return {
          semana: d.semana,
          efectivo,
          app,
          total,
          llamada: d.fecha_llamada ? 'Realizada' : 'Pendiente',
          fechaLlamada: d.fecha_llamada ? format(new Date(d.fecha_llamada), 'dd/MM/yyyy') : null,
          accionImp: accionNombre,
          seguimiento: seguimientoLabel,
          notas: d.anotaciones_extra || []
        };
      });
      setHistoryRows(rows);
    } catch {
      Swal.fire('Error', 'No se pudo cargar el historial', 'error');
    }
  };

  useEffect(() => {
    loadGuias()
    loadSeguimientoRules()
    loadAccionesImplementadas()
  }, [])

  const loadAccionesImplementadas = async () => {
    try {
      const { data, error } = await supabase.from('guias_acciones_implementadas').select('id, nombre').order('id', { ascending: true });
      if (error) throw error;
      if (data) setAccionesImplementadas(data);
    } catch {
      // silently ignored
    }
  };

  const loadSeguimientoRules = async () => {
    try {
      const { data, error } = await supabase
        .from('guias_seguimiento')
        .select('id, rango_nombre, sub_rango_nombre, desde, hasta, color')
        .order('desde', { ascending: true });
      if (error) throw error;
      if (data) setSeguimientoRules(data);
    } catch {
      // silently ignored
    } finally {
      setSeguimientoLoaded(true);
    }
  };

  useEffect(() => {
    if (urlGuiaId && guias.some(g => g.id === urlGuiaId)) {
      setSelectedGuiaId(urlGuiaId)
    }
  }, [urlGuiaId, guias])

  useEffect(() => {
    if (!seguimientoLoaded) {
      return;
    }
    if (selectedGuiaId) {
      loadDrivers(selectedGuiaId);
    } else {
      setDrivers([]);
    }
  }, [selectedGuiaId, selectedWeek, sedeActualId, seguimientoLoaded])

  useEffect(() => {
    if (!seguimientoLoaded) {
      return;
    }
    if (selectedGuiaId) {
      // Si ya estamos en la semana actual, loadDrivers ya setea currentWeekDrivers
      if (selectedWeek === getCurrentWeek()) return;
      loadCurrentWeekMetrics(selectedGuiaId);
    } else {
      setCurrentWeekDrivers([]);
    }
  }, [selectedGuiaId, sedeActualId, seguimientoLoaded])

  // Auto-refresco silencioso cada 10 minutos
  useEffect(() => {
    if (!seguimientoLoaded || !selectedGuiaId) return;

    const intervalId = setInterval(async () => {
      try {
        const [driversData, metricsData] = await Promise.all([
          fetchDriversData(selectedGuiaId, selectedWeek),
          fetchDriversData(selectedGuiaId, getCurrentWeek()),
        ]);
        setDrivers(driversData);
        setCurrentWeekDrivers(metricsData);
      } catch {
        // Silencioso: no mostrar errores al usuario en refresco automático
      }
    }, 10 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [selectedGuiaId, selectedWeek, sedeActualId, seguimientoLoaded])

  const fetchDriversData = async (guiaId: string, targetWeek: string) => {
    const isCurrentWeek = targetWeek === getCurrentWeek();
    try {
      
      // 1. Obtener historial con relación explícita
      let query = supabase
        .from("guias_historial_semanal")
        .select(`
          *,
          conductores:conductores!id_conductor!inner (
            id,
            nombres,
            apellidos,
            numero_dni,
            numero_cuit,
            preferencia_turno,
            licencia_vencimiento,
            telefono_contacto,
            fecha_contratacion,
            fecha_terminacion,
            fecha_escuela,
            motivo_baja,
            estado_id,
            created_at,
            updated_at,
            drive_folder_url,
            conductores_estados (id, codigo, descripcion),
            conductores_licencias_categorias (
              licencias_categorias (id, codigo, descripcion)
            ),
            asignaciones_conductores!left (
              horario,
              asignaciones!left (
                estado,
                horario,
                vehiculos (id, patente, marca, modelo, gnc)
              )
            )
          )
        `)
        .eq('id_guia', guiaId)
        .eq('semana', targetWeek);

      // Aplicar filtro de sede si está seleccionada (Optimización: filtro en DB)
      if (sedeActualId) {
        query = query.eq('conductores.sede_id', sedeActualId);
      }

      const { data: historialData, error: historialError } = await query.order("created_at", { ascending: false });

      if (historialError) throw historialError;

      // --------------------------------------------------------------------------------
      // OPTIMIZACIÓN 2: Ejecutar consultas secundarias EN PARALELO con Promise.all
      // En lugar de esperar secuencialmente: Cabify -> Vehículos -> Asignaciones -> Historial
      // --------------------------------------------------------------------------------
      
      // Preparar promesas para ejecución paralela

      // Identificar IDs de conductores para consultas masivas
      const conductorIds = Array.from(new Set((historialData || []).map((h: any) => h.id_conductor).filter((id: string | null) => !!id)));

      // Calcular semana anterior para la RPC de Cabify
      const [tYearStr, tWeekStr] = targetWeek.split('-W');
      const tYear = parseInt(tYearStr);
      const tWeek = parseInt(tWeekStr);
      const tBaseDate = new Date(tYear, 0, 4);
      const tWeekDate = setISOWeek(tBaseDate, tWeek);
      const tMondayLocal = startOfISOWeek(tWeekDate);
      const prevMondayForCabify = subWeeks(tMondayLocal, 1);
      const prevWeekLabelForCabify = format(prevMondayForCabify, "R-'W'II");

      // RPC Cabify: buscar datos financieros para semana objetivo Y semana anterior
      const cabifySemanasToFetch = [targetWeek, prevWeekLabelForCabify];
      // Construir mapa UUID → DNI y mapa UUID → nombres/apellidos para consulta en cabifyHistoricalService
      const conductorDniMap = new Map<string, string>();
      const conductorNamesMap = new Map<string, { nombres: string; apellidos: string }>();
      (historialData || []).forEach((h: any) => {
        if (h.id_conductor) {
          if (h.conductores?.numero_dni) {
            conductorDniMap.set(h.id_conductor, String(h.conductores.numero_dni));
          }
          if (h.conductores?.nombres || h.conductores?.apellidos) {
            conductorNamesMap.set(h.id_conductor, {
              nombres: String(h.conductores.nombres || ''),
              apellidos: String(h.conductores.apellidos || ''),
            });
          }
        }
      });
      const cabifyPromise = conductorIds.length > 0
        ? getCabifyDatosPorSemanas(conductorIds, cabifySemanasToFetch, conductorDniMap, sedeActualId, conductorNamesMap)
        : Promise.resolve(new Map<string, Map<string, { cobroApp: number; cobroEfectivo: number }>>());
      
      const vehiculosPromise = (async () => {
        if (conductorIds.length === 0) return new Map<string, number>();
        const { data: vehiculosHistorial } = await supabase
          .from('asignaciones_conductores')
          .select(`conductor_id, asignaciones (vehiculos (id, patente, marca, modelo, anio, gnc))`)
          .in('conductor_id', conductorIds);
          
        const map = new Map<string, number>();
        if (vehiculosHistorial) {
          const tmpMap = new Map<string, Set<string>>();
          vehiculosHistorial.forEach((ac: any) => {
            const conductorId = ac.conductor_id;
            const veh = ac.asignaciones?.vehiculos;
            if (!conductorId || !veh) return;
            const key = veh.id || veh.patente || `${veh.marca || ''}-${veh.modelo || ''}-${veh.anio || ''}`;
            if (!key) return;
            if (!tmpMap.has(conductorId)) tmpMap.set(conductorId, new Set());
            tmpMap.get(conductorId)!.add(key);
          });
          tmpMap.forEach((set, cid) => map.set(cid, set.size));
        }
        return map;
      })();

      const prevWeekDataPromise = (async () => {
        if (conductorIds.length === 0) return {
          assignmentsMap: new Map(),
          prevLabel: null,
          detailMap: new Map()
        };

        try {
          const [yearStr, weekStr] = targetWeek.split('-W');
          if (!yearStr || !weekStr) throw new Error("Invalid week format");

          const year = parseInt(yearStr);
          const week = parseInt(weekStr);
          const baseDate = new Date(year, 0, 4);
          const weekDate = setISOWeek(baseDate, week);
          const mondayLocal = startOfISOWeek(weekDate);
          const sundayLocal = endOfISOWeek(weekDate);
          const prevMondayLocal = subWeeks(mondayLocal, 1);
          const prevSundayLocal = subWeeks(sundayLocal, 1);
          const prevWeekLabel = format(prevMondayLocal, "R-'W'II");

          const prevStartDate = new Date(Date.UTC(prevMondayLocal.getFullYear(), prevMondayLocal.getMonth(), prevMondayLocal.getDate(), 0, 0, 0, 0));
          const prevEndDate = new Date(Date.UTC(prevSundayLocal.getFullYear(), prevSundayLocal.getMonth(), prevSundayLocal.getDate(), 23, 59, 59, 999));

          // Consultas de asignaciones anteriores (sin consulta financiera - ahora viene de RPC Cabify)
          const baseSelect = `id, conductor_id, horario, estado, asignaciones!inner (id, codigo, estado, horario, modalidad, fecha_inicio, fecha_fin, sede_id)`;

          let qA: any = supabase.from('asignaciones_conductores').select(baseSelect).in('conductor_id', conductorIds).lte('asignaciones.fecha_inicio', prevEndDate.toISOString()).is('asignaciones.fecha_fin', null);
          qA = aplicarFiltroSede(qA, 'asignaciones.sede_id');

          let qB: any = supabase.from('asignaciones_conductores').select(baseSelect).in('conductor_id', conductorIds).lte('asignaciones.fecha_inicio', prevEndDate.toISOString()).gte('asignaciones.fecha_fin', prevStartDate.toISOString());
          qB = aplicarFiltroSede(qB, 'asignaciones.sede_id');

          const [resA, resB] = await Promise.all([qA, qB]);

          // Procesar Asignaciones
          const prevAssignmentsRaw = [...(resA.data || []), ...(resB.data || [])];
          const assignmentsMap = new Map<string, { total: number; diurno: number; nocturno: number; cargo: number }>();
          const detailMap = new Map<string, any[]>();
          const seen = new Set<string>();

          prevAssignmentsRaw.filter((ac: any) => {
             const key = `${ac.asignaciones?.id || ac.id}-${ac.conductor_id}`;
             if (seen.has(key)) return false;
             seen.add(key);
             return true;
          }).forEach((ac: any) => {
             const cid = ac.conductor_id;
             const asig = ac.asignaciones;
             if (!cid || !asig) return;

             const stats = assignmentsMap.get(cid) || { total: 0, diurno: 0, nocturno: 0, cargo: 0 };
             stats.total++;
             const mod = (asig.horario || asig.modalidad || '').toString().toUpperCase();
             if (mod === 'TURNO') {
                const h = (ac.horario || '').toString().toLowerCase();
                if (h === 'diurno' || h === 'd') stats.diurno++;
                else if (h === 'nocturno' || h === 'n') stats.nocturno++;
                else stats.cargo++;
             } else {
                stats.cargo++;
             }
             assignmentsMap.set(cid, stats);

             const det = { asignacion_id: asig.id, codigo: asig.codigo, modalidad: asig.horario || asig.modalidad, estado: asig.estado, fecha_inicio: asig.fecha_inicio, fecha_fin: asig.fecha_fin, turno_conductor: ac.horario };
             const arr = detailMap.get(cid) || [];
             arr.push(det);
             detailMap.set(cid, arr);
          });

          return { assignmentsMap, prevLabel: prevWeekLabel, detailMap };
        } catch {
          return { assignmentsMap: new Map(), prevLabel: null, detailMap: new Map() };
        }
      })();

      // Consultar datos de facturación (Alquiler, Garantía, Proyectado) desde facturacion_conductores
      // Si no existe periodo guardado, calcula estimación desde conceptos_nomina + asignaciones
      const facturacionBillingPromise = (async () => {
        if (conductorIds.length === 0) return new Map<string, { alquiler: number; garantia: number; total: number; proyectado: number }>();
        // Parsear semana y año desde el formato ISO "2026-W11"
        const [fYearStr, fWeekStr] = targetWeek.split('-W');
        const fYear = parseInt(fYearStr);
        const fWeek = parseInt(fWeekStr);

        // Calcular rango de la semana (lunes → domingo)
        const jan4 = new Date(Date.UTC(fYear, 0, 4));
        const dowJ = jan4.getUTCDay() || 7;
        const mondayW1 = new Date(jan4.getTime() - (dowJ - 1) * 86400000);
        const mondayDate = new Date(mondayW1.getTime() + (fWeek - 1) * 7 * 86400000);
        const sundayDate = new Date(mondayDate.getTime() + 6 * 86400000);

        // Buscar el periodo_facturacion que coincida con semana y año (filtrado por sede)
        // Solo usar datos guardados si el período está CERRADO (datos definitivos).
        // Si está abierto/procesando, los montos pueden estar desactualizados o proyectados
        // a 7 días completos, así que se recalcula en tiempo real.
        let periodoQuery = supabase
          .from('periodos_facturacion')
          .select('id, estado')
          .eq('semana', fWeek)
          .eq('anio', fYear);
        periodoQuery = aplicarFiltroSede(periodoQuery);
        const { data: periodoData } = await periodoQuery
          .limit(1)
          .maybeSingle();

        const map = new Map<string, { alquiler: number; garantia: number; total: number; proyectado: number }>();

        if (periodoData && (periodoData as any).estado === 'cerrado') {
          // Periodo cerrado: obtener facturacion_conductores + precio_unitario para proyectado
          const { data: facturacionRows } = await supabase
            .from('facturacion_conductores')
            .select('id, conductor_id, subtotal_alquiler, subtotal_garantia, turnos_cobrados, estado')
            .eq('periodo_id', periodoData.id)
            .in('conductor_id', conductorIds);

          // Obtener precio_unitario desde facturacion_detalle (para saber si tiene datos de alquiler)
          const facIds = (facturacionRows || []).map((r: any) => r.id).filter(Boolean)
          const puMap = new Map<string, number>()
          if (facIds.length > 0) {
            const { data: alquilerDetalle } = await (supabase.from('facturacion_detalle') as any)
              .select('facturacion_id, precio_unitario')
              .in('facturacion_id', facIds)
              .in('concepto_codigo', ['P001', 'P002', 'P013', 'P014', 'P015', 'P016'])
            ;(alquilerDetalle || []).forEach((d: any) => {
              const pu = Number(d.precio_unitario) || 0
              if (pu > 0) puMap.set(d.facturacion_id, pu)
            })
          }

          // Obtener primera fecha de asignación por conductor y fecha fin del período
          const { data: periodoFechas } = await supabase
            .from('periodos_facturacion')
            .select('fecha_fin')
            .eq('id', periodoData.id)
            .single()
          const fechaFinPeriodo = periodoFechas ? new Date((periodoFechas as any).fecha_fin) : sundayDate

          const asigCondIds = (facturacionRows || []).map((r: any) => r.conductor_id).filter(Boolean)
          const primeraFechaMap = new Map<string, Date>()
          if (asigCondIds.length > 0) {
            const { data: asigData } = await (supabase.from('asignaciones_conductores') as any)
              .select('conductor_id, fecha_inicio, asignaciones!inner(estado, fecha_inicio)')
              .in('conductor_id', asigCondIds)
              .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado'])
            ;(asigData || []).forEach((ac: any) => {
              const asignacion = ac.asignaciones
              if (!asignacion) return
              const estadoPadre = (asignacion.estado || '').toLowerCase()
              if (['programado', 'programada', 'cancelado', 'cancelada'].includes(estadoPadre)) return
              const acInicioStr = ac.fecha_inicio || asignacion.fecha_inicio
              if (!acInicioStr) return
              const acInicio = new Date(acInicioStr)
              const existing = primeraFechaMap.get(ac.conductor_id)
              if (!existing || acInicio < existing) {
                primeraFechaMap.set(ac.conductor_id, acInicio)
              }
            })
          }

          (facturacionRows || []).forEach((row: any) => {
            const alquiler = Number(row.subtotal_alquiler) || 0;
            const garantia = Number(row.subtotal_garantia) || 0;
            const diasRaw = Number(row.turnos_cobrados) || 0;
            const pu = puMap.get(row.id) || 0;

            let proyectado = alquiler;
            // Misma lógica que ReporteFacturacionTab
            if (pu > 0 && diasRaw > 0) {
              const primeraFecha = primeraFechaMap.get(row.conductor_id)
              let diasCalendario = 7
              if (primeraFecha) {
                diasCalendario = Math.min(7, Math.max(1,
                  Math.round((fechaFinPeriodo.getTime() - primeraFecha.getTime()) / (1000 * 60 * 60 * 24)) + 1
                ))
              }
              const diasProyectados = Math.max(1, diasCalendario)
              if (diasRaw < diasProyectados) {
                proyectado = Math.round((alquiler / diasRaw) * diasProyectados)
              }
            }

            map.set(row.conductor_id, { alquiler, garantia, total: alquiler + garantia, proyectado });
          });
          return map;
        }

        // Sin periodo guardado: calcular con prorrateo por días efectivos
        // (misma lógica que Vista Previa de ReporteFacturacionTab)

        // Helper: convertir timestamp a fecha YYYY-MM-DD en timezone Argentina
        const ARG_TZ_FB = 'America/Argentina/Buenos_Aires';
        const argDateFmtFB = new Intl.DateTimeFormat('en-CA', { timeZone: ARG_TZ_FB, year: 'numeric', month: '2-digit', day: '2-digit' });
        const toArgDateFB = (ts: string | null | undefined): string => {
          if (!ts) return '';
          return argDateFmtFB.format(new Date(ts));
        };

        // Rango de la semana en formato YYYY-MM-DD
        const weekStartStr = mondayDate.toISOString().split('T')[0];
        const weekEndStr = sundayDate.toISOString().split('T')[0];

        // Tope de días: MIN(hoy, domingo) — igual que Vista Previa (no proyecta días futuros)
        // Usar timezone Argentina para "hoy" (consistente sin importar desde dónde se conecte el usuario)
        const hoyStr = toArgDateFB(new Date().toISOString());
        const weekCapStr = hoyStr < weekEndStr ? hoyStr : weekEndStr;

        // Fecha semana como Date para comparaciones
        const weekStartDate = new Date(weekStartStr + 'T00:00:00');
        const weekCapDate = new Date(weekCapStr + 'T00:00:00');

        // Query SEPARADA para asignaciones con fechas (no toca el query principal)
        const [{ data: conceptosData }, { data: garantiasData }, { data: asignacionesConFechas }, { data: conductoresExtraData }] = await Promise.all([
          supabase
            .from('conceptos_nomina')
            .select('codigo, precio_base, precio_final')
            .eq('activo', true)
            .in('codigo', ['P001', 'P002', 'P003', 'P013', 'P014', 'P015', 'P016']),
          supabase
            .from('garantias_conductores')
            .select('conductor_id, estado, monto_total, monto_pagado, monto_cuota_semanal, cuotas_pagadas, cuotas_totales')
            .in('conductor_id', conductorIds)
            .in('estado', ['activa', 'pendiente']),
          supabase
            .from('asignaciones_conductores')
            .select('conductor_id, horario, fecha_inicio, fecha_fin, asignaciones!inner(estado, horario, fecha_inicio, fecha_fin, vehiculo_id, vehiculos(gnc))')
            .in('conductor_id', conductorIds)
            .in('estado', ['asignado', 'activo', 'activa', 'finalizado', 'finalizada', 'completado', 'cancelado', 'cancelada']),
          supabase
            .from('conductores')
            .select('id, fecha_terminacion, sede_id')
            .in('id', conductorIds),
        ]);

        // Mapa conductor_id → fecha_terminacion (tope de días para conductores de baja)
        const fechaTermFBMap = new Map<string, Date>();
        const conductorSedeFBMap = new Map<string, string>();
        (conductoresExtraData || []).forEach((c: any) => {
          if (c.fecha_terminacion) {
            fechaTermFBMap.set(c.id, new Date(c.fecha_terminacion.substring(0, 10) + 'T00:00:00'));
          }
          if (c.sede_id) conductorSedeFBMap.set(c.id, c.sede_id);
        });

        const precios = new Map<string, number>();
        (conceptosData || []).forEach((c: any) => {
          precios.set(c.codigo, c.precio_final ?? c.precio_base ?? 0);
        });

        const garantiasMap = new Map<string, any>();
        (garantiasData || []).forEach((g: any) => {
          garantiasMap.set(g.conductor_id, g);
        });

        const cuotaGarantiaSemanalDefault = Math.round((precios.get('P003') || 7143) * 7);

        // Mapa de código de concepto por modalidad y GNC (igual que Facturación)
        const getCodigoPorModalidad = (modalidad: string, tieneGnc: boolean): string => {
          if (modalidad === 'CARGO') return tieneGnc ? 'P002' : 'P016'
          if (modalidad === 'TURNO_NOCTURNO') return tieneGnc ? 'P013' : 'P015'
          return tieneGnc ? 'P001' : 'P014'
        };

        // Agrupar asignaciones por conductor
        const asigPorConductor = new Map<string, any[]>();
        (asignacionesConFechas || []).forEach((ac: any) => {
          // Filtrar por sede si hay sede seleccionada
          if (sedeActualId && conductorSedeFBMap.get(ac.conductor_id) !== sedeActualId) return;
          const arr = asigPorConductor.get(ac.conductor_id) || [];
          arr.push(ac);
          asigPorConductor.set(ac.conductor_id, arr);
        });

        // Calcular prorrateo para cada conductor
        for (const cid of conductorIds) {
          // Filtrar por sede
          if (sedeActualId && conductorSedeFBMap.get(cid) !== sedeActualId) continue;

          const asignaciones = asigPorConductor.get(cid) || [];
          const fechasContadas = new Set<string>();
          let montoTotal = 0;
          let primeraFechaAsig: Date | null = null;

          for (const ac of asignaciones) {
            const asignacion = ac.asignaciones;
            if (!asignacion) continue;

            const estadoPadre = (asignacion.estado || '').toLowerCase();
            if (['programado', 'programada'].includes(estadoPadre)) continue;
            if (['finalizada', 'finalizado', 'cancelada', 'cancelado'].includes(estadoPadre) && !asignacion.fecha_fin) continue;

            // Determinar modalidad (misma lógica que Vista Previa)
            const modalidadAsig = (asignacion.horario || '').toUpperCase();
            const horarioCond = (ac.horario || '').toLowerCase().trim();
            let modalidad: string;
            if (modalidadAsig === 'TODO_DIA' || horarioCond === 'todo_dia') {
              modalidad = 'CARGO';
            } else if (modalidadAsig === 'TURNO') {
              modalidad = (horarioCond === 'nocturno' || horarioCond === 'n') ? 'TURNO_NOCTURNO' : 'TURNO_DIURNO';
            } else {
              modalidad = 'CARGO';
            }

            // Fecha inicio: MAX(conductor.fecha_inicio, asignacion.fecha_inicio)
            // (no cobrar antes de la entrega real — misma lógica que Vista Previa)
            const condInicioStr = ac.fecha_inicio ? toArgDateFB(ac.fecha_inicio) : '';
            const padreInicioStr = asignacion.fecha_inicio ? toArgDateFB(asignacion.fecha_inicio) : '';
            const condInicioDate = condInicioStr ? new Date(condInicioStr + 'T00:00:00') : null;
            const padreInicioDate = padreInicioStr ? new Date(padreInicioStr + 'T00:00:00') : null;
            const acInicioDate = condInicioDate && padreInicioDate
              ? (condInicioDate > padreInicioDate ? condInicioDate : padreInicioDate)
              : (condInicioDate || padreInicioDate || weekStartDate);

            // Fecha fin: MIN(conductor.fecha_fin, asignacion.fecha_fin)
            // Si ninguno tiene fin → usar tope semana (MIN(hoy, domingo))
            const condFinStr = ac.fecha_fin ? toArgDateFB(ac.fecha_fin) : '';
            const padreFinStr = asignacion.fecha_fin ? toArgDateFB(asignacion.fecha_fin) : '';
            const condFinDate = condFinStr ? new Date(condFinStr + 'T00:00:00') : null;
            const padreFinDate = padreFinStr ? new Date(padreFinStr + 'T00:00:00') : null;
            const acFinDate = condFinDate && padreFinDate
              ? (condFinDate < padreFinDate ? condFinDate : padreFinDate)
              : (condFinDate || padreFinDate || weekCapDate);

            // Rango efectivo dentro de la semana
            const efectivoInicio = acInicioDate < weekStartDate ? weekStartDate : acInicioDate;
            let efectivoFin = acFinDate > weekCapDate ? weekCapDate : acFinDate;

            // Tope por fecha_terminacion (igual que Vista Previa):
            // Solo aplica si la asignación NO tiene fecha_fin propia
            // y la asignación empezó ANTES de la fecha_terminacion
            const tieneFinPropio = ac.fecha_fin || asignacion.fecha_fin;
            const fechaTermCond = fechaTermFBMap.get(ac.conductor_id);
            if (fechaTermCond && !tieneFinPropio && efectivoFin > fechaTermCond && acInicioDate <= fechaTermCond) {
              efectivoFin = fechaTermCond;
            }

            if (efectivoInicio > efectivoFin) continue;

            // Rastrear primera fecha de asignación (para proyectado)
            if (!primeraFechaAsig || efectivoInicio < primeraFechaAsig) {
              primeraFechaAsig = efectivoInicio;
            }

            // Contar días y sumar montos (deduplicando por fecha)
            const tieneGnc = asignacion.vehiculos?.gnc === true;
            const codigo = getCodigoPorModalidad(modalidad, tieneGnc);
            const precioDiario = precios.get(codigo) || 0;
            const cursor = new Date(efectivoInicio);
            while (cursor <= efectivoFin) {
              const key = cursor.toISOString().split('T')[0];
              if (!fechasContadas.has(key)) {
                fechasContadas.add(key);
                montoTotal += precioDiario;
              }
              cursor.setDate(cursor.getDate() + 1);
            }
          }

          const alquiler = montoTotal;
          const dias = fechasContadas.size;
          if (alquiler === 0 && dias === 0) continue;

          // Proyectado: misma lógica que ReporteFacturacionTab
          // diasProyectados = días calendario desde primera asignación hasta domingo
          let proyectado = alquiler;
          if (dias > 0) {
            // Conductor de baja: no proyectar
            const fechaTermCond = fechaTermFBMap.get(cid);
            const esDeBaja = fechaTermCond && fechaTermCond <= weekCapDate;
            if (!esDeBaja) {
              let diasCalendario = 7;
              if (primeraFechaAsig) {
                diasCalendario = Math.min(7, Math.max(1,
                  Math.round((sundayDate.getTime() - primeraFechaAsig.getTime()) / (1000 * 60 * 60 * 24)) + 1
                ));
              }
              const diasProyectados = Math.max(1, diasCalendario);
              if (dias < diasProyectados) {
                proyectado = Math.round((alquiler / dias) * diasProyectados);
              }
            }
          }

          // Garantía: usar datos reales si existen, sino cuota por defecto
          let garantia = cuotaGarantiaSemanalDefault;
          const garantiaData = garantiasMap.get(cid);
          if (garantiaData) {
            if (garantiaData.estado === 'completada' || garantiaData.monto_pagado >= garantiaData.monto_total) {
              garantia = 0;
            } else {
              const cuotaNormal = garantiaData.monto_cuota_semanal || cuotaGarantiaSemanalDefault;
              const pendiente = garantiaData.monto_total - garantiaData.monto_pagado;
              garantia = Math.min(cuotaNormal, pendiente);
            }
          }
          if (dias === 0) garantia = 0;

          map.set(cid, { alquiler, garantia, total: alquiler + garantia, proyectado });
        }

        return map;
      })();

      // Consultar saldos de conductores (deuda/a favor)
      const saldosPromise = conductorIds.length > 0
        ? (supabase.from('saldos_conductores') as any)
            .select('conductor_id, saldo_actual')
            .in('conductor_id', conductorIds)
            .then((res: any) => {
              const map = new Map<string, number>();
              (res.data || []).forEach((s: any) => map.set(s.conductor_id, s.saldo_actual ?? 0));
              return map;
            })
        : Promise.resolve(new Map<string, number>());

      // Ejecutar todo en paralelo
      const [cabifyDataMap, vehiculosMap, prevWeekData, saldosMap, facturacionBillingMap] = await Promise.all([cabifyPromise, vehiculosPromise, prevWeekDataPromise, saldosPromise, facturacionBillingPromise]);

      // cabifyDataMap: Map<semana, Map<id_conductor, { cobroApp, cobroEfectivo }>>
      const cabifyTargetWeekMap = cabifyDataMap.get(targetWeek) || new Map<string, { cobroApp: number; cobroEfectivo: number }>();
      const cabifyPrevWeekMap = cabifyDataMap.get(prevWeekLabelForCabify) || new Map<string, { cobroApp: number; cobroEfectivo: number }>();
      const vehiculosHistorialCountMap = vehiculosMap;
      const prevWeekAssignmentsMap = prevWeekData.assignmentsMap;
      const prevWeekLabel = prevWeekData.prevLabel;
      // --------------------------------------------------------------------------------

      // Optimización N+1: Copiar fechas de llamadas de semana anterior si faltan en actual (Batch Update)
      if (isCurrentWeek && historialData && historialData.length > 0 && prevWeekLabel) {
        const conductoresSinFecha = historialData
          .filter((h: any) => !h.fecha_llamada && h.id_conductor)
          .map((h: any) => h.id_conductor as string);
        const uniqueIds = Array.from(new Set(conductoresSinFecha));

        if (uniqueIds.length > 0) {
           const altPrevWeekLabel = prevWeekLabel.replace('W', '');
           const { data: prevCalls } = await supabase
              .from('guias_historial_semanal')
              .select('id_conductor, fecha_llamada')
              .or(`semana.eq.${prevWeekLabel},semana.eq.${altPrevWeekLabel}`)
              .eq('id_guia', guiaId)
              .in('id_conductor', uniqueIds)
              .not('fecha_llamada', 'is', null)
              .order('semana', { ascending: false }) // Priorizar la más reciente
              .limit(uniqueIds.length * 2); // Limit safety

           if (prevCalls && prevCalls.length > 0) {
             const bestFechaByConductor = new Map<string, string>();
             prevCalls.forEach((row: any) => {
               if (row.id_conductor && row.fecha_llamada && !bestFechaByConductor.has(row.id_conductor)) {
                 bestFechaByConductor.set(row.id_conductor, row.fecha_llamada);
               }
             });

             if (bestFechaByConductor.size > 0) {
               // Update local state first for immediate UI feedback
               historialData.forEach((h: any) => {
                  const f = bestFechaByConductor.get(h.id_conductor);
                  if (!h.fecha_llamada && f) h.fecha_llamada = f;
               });
               
               // Background update (fire and forget for UI speed)
               const updates = Array.from(bestFechaByConductor.entries()).map(([cid, fecha]) => 
                  supabase.from('guias_historial_semanal').update({ fecha_llamada: fecha })
                  .eq('semana', targetWeek).eq('id_guia', guiaId).eq('id_conductor', cid).is('fecha_llamada', null)
               );
                Promise.all(updates).catch(() => {});
             }
           }
        }
      }

      // Procesar conductores desde el historial
      if (!historialData || historialData.length === 0) return [];

      const processedDrivers: any[] = [];
        const updatesToPerform: any[] = [];
        
        // Pre-agrupar seguimientoRules por turno dominante — O(1) por conductor en vez de O(rules) c/u
        // Clave especial '__ALL__' para reglas sin sub_rango (aplican a todos los turnos)
        const seguimientoRulesByTurno = new Map<string, any[]>()
        ;(seguimientoRules || []).forEach((rule: any) => {
          let sub = (rule.sub_rango_nombre || '').toString().toUpperCase().trim()
          if (sub) {
            sub = sub.replace(/[_\s]+/g, ' ').trim()
            if (sub === 'A CARGO') sub = 'CARGO'
          }
          const key = sub || '__ALL__'
          const arr = seguimientoRulesByTurno.get(key) || []
          arr.push(rule)
          seguimientoRulesByTurno.set(key, arr)
        })

        for (const historial of historialData) {
          const conductor = historial.conductores;
          
          const baseConductor: any = { 
            ...conductor,
            // Mantener campos del historial en el nivel superior para la tabla
            ...historial,
            // Fix: Asegurar explícitamente que los campos clave del historial tengan prioridad
            fecha_llamada: historial.fecha_llamada,
            id_accion_imp: historial.id_accion_imp,
            meta_sem_cumplida: historial.meta_sem_cumplida,
            // Restaurar ID del conductor como ID principal (para que funcionen los modales y acciones)
            id: conductor.id,
            // Guardar ID del historial por si se necesita
            historial_id: historial.id,
            row_id: `${conductor.id}-${historial.semana}`
          };
          baseConductor.conductor_created_at = conductor.created_at;

          if (conductor.conductores_licencias_categorias?.length > 0) {
            baseConductor.licencias_categorias = conductor.conductores_licencias_categorias
              .map((c: any) => c.licencias_categorias?.codigo)
              .filter((c: any) => c !== null && c !== undefined);
          }

          // Extraer vehículo asignado (si tiene asignación activa)
          if (conductor.asignaciones_conductores?.length > 0) {
            // Filtrar asignaciones activas
            const asignacionActiva = conductor.asignaciones_conductores.find((ac: any) => 
              ac.asignaciones?.estado === 'activo' || ac.asignaciones?.estado === 'activa'
            );
            
            if (asignacionActiva?.asignaciones?.vehiculos) {
              baseConductor.vehiculo_asignado = asignacionActiva.asignaciones.vehiculos;
              
              // Extraer información de turno/modalidad
              baseConductor.asignacion_info = {
                modalidad: asignacionActiva.asignaciones.horario, // 'turno' o 'todo_dia'
                turno_conductor: asignacionActiva.horario // 'diurno' o 'nocturno'
              };
            }
          }
 
          const vehiculosCountFromMap = vehiculosHistorialCountMap.get(conductor.id) ?? 0;
          if (vehiculosCountFromMap > 0) {
            baseConductor.vehiculos_historial_count = vehiculosCountFromMap;
          } else if (Array.isArray(conductor.asignaciones_conductores)) {
            // Fallback: usar relación cargada en este query
            const vehiculosSet = new Set<string>();
            conductor.asignaciones_conductores.forEach((ac: any) => {
              const veh = ac.asignaciones?.vehiculos;
              if (veh) {
                const key = veh.id || veh.patente || `${veh.marca || ''}-${veh.modelo || ''}-${veh.anio || ''}`;
                if (key) {
                  vehiculosSet.add(key);
                }
              }
            });
            baseConductor.vehiculos_historial_count = vehiculosSet.size;
          } else {
            baseConductor.vehiculos_historial_count = 0;
          }
          
          const prevWeekStats = prevWeekAssignmentsMap.get(conductor.id) || { total: 0, diurno: 0, nocturno: 0, cargo: 0 };
          baseConductor.prev_week_turnos = prevWeekStats;
          
          let dominantTurno: string | null = null;
          const counts = [
            { key: 'DIURNO', value: prevWeekStats.diurno },
            { key: 'NOCTURNO', value: prevWeekStats.nocturno },
            { key: 'CARGO', value: prevWeekStats.cargo },
          ];
          counts.sort((a, b) => b.value - a.value);
          if (counts[0].value > 0) {
            dominantTurno = counts[0].key;
          }

          let matchingSeguimientoRules: any[] = [];
          if (dominantTurno && seguimientoRules && seguimientoRules.length > 0) {
            // O(1) lookup en Map pre-agrupado — antes: O(rules) con .filter() por conductor
            matchingSeguimientoRules = [
              ...(seguimientoRulesByTurno.get(dominantTurno) || []),
              ...(seguimientoRulesByTurno.get('__ALL__') || []),
            ]
          }

          const estadoCodigo = baseConductor.conductores_estados?.codigo?.toLowerCase();
          const tieneAsignacion = !!baseConductor.vehiculo_asignado;
          let searchMetadata = "";
          
          if (estadoCodigo === 'activo' && !tieneAsignacion) {
            searchMetadata += "Disponible ";
          }
          if (tieneAsignacion) {
            searchMetadata += "Asignado ";
          }
          
          baseConductor.searchMetadata = searchMetadata;

          // Datos financieros: SOLO desde cabify_historico via RPC (única fuente de verdad)
          const cabifyEntry = cabifyTargetWeekMap.get(conductor.id);
          const facturacionApp = cabifyEntry ? Number(cabifyEntry.cobroApp.toFixed(2)) : 0;
          const facturacionEfectivo = cabifyEntry ? Number(cabifyEntry.cobroEfectivo.toFixed(2)) : 0;
          const facturacionTotal = Number((facturacionApp + facturacionEfectivo).toFixed(2));
          const hasCabifyData = !!cabifyEntry;

          baseConductor.facturacion_app = facturacionApp;
          baseConductor.facturacion_efectivo = facturacionEfectivo;
          baseConductor.facturacion_total = facturacionTotal;
          baseConductor.hasCabifyData = hasCabifyData;

          const getFilterDisplayValue = (value: number) => {
            if (value === 0 && !hasCabifyData) return "N/A";
            return new Intl.NumberFormat('es-AR', {
              style: 'currency',
              currency: 'ARS',
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            }).format(value);
          };

          baseConductor.facturacion_efectivo_filter = getFilterDisplayValue(facturacionEfectivo);
          baseConductor.facturacion_app_filter = getFilterDisplayValue(facturacionApp);
          baseConductor.facturacion_total_filter = getFilterDisplayValue(facturacionTotal);

          // Saldo del conductor (negativo = deuda, positivo = a favor, 0 = sin saldo)
          const saldoRaw = saldosMap.get(conductor.id) ?? 0;
          baseConductor.saldo_conductor = saldoRaw;

          // Datos de facturación billing (Alquiler, Garantía, Cuota Semanal, Proyectado)
          const billingEntry = facturacionBillingMap.get(conductor.id);
          baseConductor.billing_alquiler = billingEntry ? billingEntry.alquiler : 0;
          baseConductor.billing_garantia = billingEntry ? billingEntry.garantia : 0;
          baseConductor.billing_cuota_semanal = billingEntry ? billingEntry.total : 0;
          baseConductor.billing_proyectado = billingEntry ? billingEntry.proyectado : 0;
          baseConductor.hasBillingData = !!billingEntry;

          // Cálculo de app de la semana anterior (desde cabify_historico via RPC)
          // Se usa para determinar el seguimiento (DIARIO/CERCANO/SEMANAL)
          const prevCabifyEntry = cabifyPrevWeekMap.get(conductor.id);
          const prevAppParsed = prevCabifyEntry ? Number(prevCabifyEntry.cobroApp.toFixed(2)) : 0;

          let prevSeguimientoRule: any | null = null;
          if (matchingSeguimientoRules && matchingSeguimientoRules.length > 0) {
            for (const rule of matchingSeguimientoRules) {
              const desde = Number(rule.desde || 0);
              const hasHasta = rule.hasta !== null && rule.hasta !== undefined;
              const hasta = hasHasta ? Number(rule.hasta) : null;
              const matchesLower = prevAppParsed >= desde;
              const matchesUpper = hasHasta ? prevAppParsed <= (hasta as number) : true;
              if (matchesLower && matchesUpper) {
                prevSeguimientoRule = rule;
                break;
              }
            }
          }

          baseConductor.prev_week_total_monetario = prevAppParsed;
          baseConductor.prev_week_matching_rules = (matchingSeguimientoRules || [])
            .slice()
            .sort((a: any, b: any) => {
              const aSub = (a.sub_rango_nombre || '').toString().trim();
              const bSub = (b.sub_rango_nombre || '').toString().trim();
              // Priorizar reglas con sub_rango_nombre definido por sobre genéricas
              if (aSub && !bSub) return -1;
              if (!aSub && bSub) return 1;
              return 0;
            })
            .map((r: any) => ({
              id: r.id,
              rango_nombre: r.rango_nombre,
              sub_rango_nombre: r.sub_rango_nombre,
              desde: r.desde,
              hasta: r.hasta,
              color: r.color
            }));
          baseConductor.prev_week_seguimiento = prevSeguimientoRule ? prevSeguimientoRule.rango_nombre : null;
          baseConductor.prev_week_seguimiento_color = prevSeguimientoRule ? prevSeguimientoRule.color : null;

          const rawSeguimientoDb = typeof historial.seguimiento === 'string'
            ? historial.seguimiento.trim().toUpperCase()
            : '';
          let autoSeguimiento = rawSeguimientoDb;
          if (!autoSeguimiento && prevSeguimientoRule) {
            const nombre = (prevSeguimientoRule.rango_nombre || '').toString().toUpperCase();
            if (nombre.includes('DIARIO')) {
              autoSeguimiento = 'DIARIO';
            } else if (nombre.includes('CERCANO')) {
              autoSeguimiento = 'CERCANO';
            } else if (nombre.includes('SEMANAL')) {
              autoSeguimiento = 'SEMANAL';
            } else {
              autoSeguimiento = nombre;
            }
          }
          if (autoSeguimiento) {
            baseConductor.seguimiento = autoSeguimiento;
          }

          // Lógica de actualización automática del seguimiento (ya no se escriben app/efectivo/total)
          // Solo si estamos en la semana actual y hay un seguimiento auto-calculado que falta en DB
          if (isCurrentWeek && !rawSeguimientoDb && autoSeguimiento) {
            updatesToPerform.push({
              id: historial.id,
              seguimiento: autoSeguimiento
            });
          }
          processedDrivers.push(baseConductor);
        }

      // Ejecutar actualizaciones masivas si hay cambios detectados
      if (updatesToPerform.length > 0) {
        await Promise.all(updatesToPerform.map(u => {
          const { id, ...payload } = u;
          return supabase
            .from('guias_historial_semanal')
            .update(payload)
            .eq('id', id)
        }));
      }

      return processedDrivers;
    } catch {
      return [];
    }
  }

  const loadDrivers = async (guiaId: string) => {
    try {
      setLoadingDrivers(true);
      const data = await fetchDriversData(guiaId, selectedWeek);
      setDrivers(data);
      // Si estamos viendo la semana actual, reutilizar para métricas (evita doble consulta)
      if (selectedWeek === getCurrentWeek()) {
        setCurrentWeekDrivers(data);
      }
    } catch {
      setDrivers([]);
    } finally {
      setLoadingDrivers(false);
    }
  }

  const loadCurrentWeekMetrics = async (guiaId: string) => {
    try {
      const data = await fetchDriversData(guiaId, getCurrentWeek());
      setCurrentWeekDrivers(data);
    } catch {
      // Current week metrics load failed
    }
  }

  // Nueva función para clonar historial de la semana anterior
  const syncWeeklyHistory = async () => {
    const currentWeek = getCurrentWeek();
    try {
      await supabase.rpc('sync_weekly_history', { p_semana: currentWeek });
    } finally {
      setSyncFinished(true);
    }
  };

  // 1. Efecto de inicialización de semana (Clonación)
  // Se ejecuta una sola vez al montar, sin depender de 'guias'
  useEffect(() => {
    const runSync = async () => {
       if (!hasSyncedRef.current) {
          hasSyncedRef.current = true;
          await syncWeeklyHistory();
       }
    };
    runSync();
  }, []);

  // 2. Efecto de distribución de carga (solo después de sincronizar y tener guías)
  useEffect(() => {
    if (syncFinished && !hasDistributedRef.current && guias.length > 0) {
      hasDistributedRef.current = true
      distributeDrivers();
    }
  }, [syncFinished, guias])


  const distributeDrivers = async () => {
    try {
      if (guias.length === 0) return;

      const { data: assignedDrivers, error: assignedError } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select('id, id_guia')
        .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2')
        .eq('guia_asignado', true))

      if (assignedError) return;

      // Modificación estricta: Usamos !inner en todas las relaciones jerárquicas para forzar
      // que existan los registros hijos. Si no hay vehiculo, no trae el conductor.
      const { data: rawUnassignedDrivers, error: unassignedError } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select(`
          id,
          nombres,
          apellidos,
          asignaciones_conductores!inner (
            asignaciones!inner (
              estado,
              vehiculo_id,
              vehiculos!inner (
                id,
                patente
              )
            )
          )
        `)
        .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2')
        .or('guia_asignado.is.null,guia_asignado.eq.false')
        .in('asignaciones_conductores.asignaciones.estado', ['activo', 'activa']));

      if (unassignedError) return;

      // Filtrar en memoria para asegurar que tengan vehículo y eliminar duplicados
      const unassignedDriversMap = new Map();
      rawUnassignedDrivers?.forEach((d: any) => {
        // CORRECCION CRITICA: Validar estrictamente que el vehículo pertenezca a una asignación ACTIVA.
        const tieneVehiculoActivo = d.asignaciones_conductores?.some((ac: any) => {
           const asignacion = ac.asignaciones;
           if (!asignacion) return false;
           
           const estado = asignacion.estado?.toLowerCase();
           const esActivo = estado === 'activo' || estado === 'activa';
           // Verificamos ambas posibilidades de nombre de columna para el ID del vehículo
           const tieneIdVehiculo = !!asignacion.id_vehiculo || !!asignacion.vehiculo_id;
           const tieneObjetoVehiculo = !!asignacion.vehiculos;
           const tienePatente = !!asignacion.vehiculos?.patente;
           
           const isValid = esActivo && tieneIdVehiculo && tieneObjetoVehiculo && tienePatente;
           
           return isValid;
        });

        if (tieneVehiculoActivo) {
          unassignedDriversMap.set(d.id, d);
        }
      });
      const unassignedDrivers = Array.from(unassignedDriversMap.values());

      if (unassignedDrivers.length === 0) return;

      const guideLoad = new Map<string, number>()
      guias.forEach(g => guideLoad.set(g.id, 0))

      assignedDrivers?.forEach((d: any) => {
        if (d.id_guia && guideLoad.has(d.id_guia)) {
          guideLoad.set(d.id_guia, guideLoad.get(d.id_guia)! + 1)
        }
      })

      const updates: any[] = []
      const guideIds = guias.map(g => g.id)
      
      for (const driver of unassignedDrivers) {
        let minLoad = Infinity
        guideIds.forEach(id => {
          const load = guideLoad.get(id) || 0
          if (load < minLoad) minLoad = load
        })

        const candidates = guideIds.filter(id => (guideLoad.get(id) || 0) === minLoad)
        
        if (candidates.length === 0) continue

        const selectedGuideId = candidates[Math.floor(Math.random() * candidates.length)]
        
        guideLoad.set(selectedGuideId, (guideLoad.get(selectedGuideId) || 0) + 1)
        
        updates.push({
          id: driver.id,
          guia_asignado: true,
          id_guia: selectedGuideId
        })
      }

      if (updates.length === 0) return;

      // Usamos Promise.all con update individual para evitar problemas de constraints (not-null)
      // con upsert si faltan campos obligatorios en el objeto parcial.
      const updatePromises = updates.map(update => 
        supabase
          .from('conductores')
          .update({ 
            guia_asignado: update.guia_asignado, 
            id_guia: update.id_guia 
          })
          .eq('id', update.id)
          .select()
      );

      const results = await Promise.all(updatePromises);
      
      // Verificar errores en las actualizaciones individuales
      const errors = results.filter(r => r.error).map(r => r.error);
      if (errors.length > 0) throw errors[0];

      // Insertar en historial semanal
      const currentWeek = getCurrentWeek()
      
      // Verificar historial existente para esta semana para evitar duplicados
      // Esto asegura que solo se creen registros para NUEVAS asignaciones
      const { data: existingHistory } = await supabase
        .from('guias_historial_semanal')
        .select('id_conductor')
        .eq('semana', currentWeek);
        
      const existingHistoryIds = new Set(existingHistory?.map((h: any) => h.id_conductor));
      const historyInserts: any[] = [];

      // 1. Identify drivers needing history
      const driversToInsert = updates.filter(u => !existingHistoryIds.has(u.id));
      
      if (driversToInsert.length > 0) {
        // 2. Fetch latest history for these drivers to preserve fecha_llamada and id_accion_imp
         const driverIds = driversToInsert.map(u => u.id);
         const lastHistoryMap = new Map();

         try {
           const { data: latestHistory } = await supabase
             .from('guias_historial_semanal')
             .select('id_conductor, fecha_llamada, id_accion_imp, semana')
             .in('id_conductor', driverIds)
             .or('fecha_llamada.not.is.null,id_accion_imp.not.is.null') 
             .order('semana', { ascending: false });

           // Map: id_conductor -> { fecha_llamada, id_accion_imp }
           if (latestHistory) {
             latestHistory.forEach((h: any) => {
               if (!lastHistoryMap.has(h.id_conductor)) {
                 lastHistoryMap.set(h.id_conductor, {
                   fecha_llamada: h.fecha_llamada,
                   id_accion_imp: h.id_accion_imp
                 });
               }
             });
           }
          } catch {
            // Proceed without previous history
          }

         // 3. Prepare inserts
         driversToInsert.forEach(u => {
            const preservedData = lastHistoryMap.get(u.id);
            
            historyInserts.push({
             id_conductor: u.id,
             id_guia: u.id_guia,
             semana: currentWeek,
             id_accion_imp: preservedData?.id_accion_imp || 1, // Default action: "CAPACITACION CABIFY"
             fecha_llamada: preservedData?.fecha_llamada || null
           });
           // Add to set just in case
           existingHistoryIds.add(u.id);
         });
      }

      if (historyInserts.length > 0) {
        const { error: historyError } = await supabase
          .from('guias_historial_semanal')
          .insert(historyInserts)

        if (historyError) {
          // History insert failed
        }
      }

      // Solo recargar si se insertaron registros de historial que afecten la vista actual
      if (historyInserts.length > 0 && selectedGuiaId) {
           loadDrivers(selectedGuiaId);
      }

    } catch {
      // Distribution failed
    }
  }

  const loadGuias = async () => {
    try {
      setLoading(true)
      const formattedGuias = await fetchGuias()
      setGuias(formattedGuias)
      
      // Seleccionar la guía del URL o la primera disponible
      if (urlGuiaId) {
        const matchedGuia = formattedGuias.find(g => g.id === urlGuiaId)
        setSelectedGuiaId(matchedGuia?.id ?? formattedGuias[0]?.id ?? null)
      } else if (formattedGuias.length > 0) {
        setSelectedGuiaId(formattedGuias[0].id)
      }
    } catch {
      // Guias load failed
    } finally {
      setLoading(false)
    }
  }

  const selectedGuia = guias.find(g => g.id === selectedGuiaId)

  const getTurnoKeyForFilter = (conductor: any): string => {
    const info = conductor.asignacion_info;
    if (info) {
      if (info.modalidad === 'todo_dia') {
        return 'A_CARGO';
      }
      const turnoAsignado = info.turno_conductor ? info.turno_conductor.toString().toUpperCase() : '';
      if (turnoAsignado === 'DIURNO') return 'DIURNO';
      if (turnoAsignado === 'NOCTURNO') return 'NOCTURNO';
    }

    const preferenciaRaw = conductor.preferencia_turno;
    const preferencia = preferenciaRaw ? preferenciaRaw.toString().toUpperCase() : '';

    if (!preferencia) return 'SIN_PREFERENCIA';
    if (preferencia === 'DIURNO' || preferencia === 'MAÑANA' || preferencia === 'MANANA') return 'DIURNO';
    if (preferencia === 'NOCTURNO' || preferencia === 'NOCHE') return 'NOCTURNO';
    if (preferencia === 'A_CARGO') return 'A_CARGO';
    if (preferencia === 'SIN_PREFERENCIA') return 'SIN_PREFERENCIA';

    return 'SIN_PREFERENCIA';
  };

  // Valores únicos para filtros
  const nombresUnicos = useMemo(() => {
    const nombres = drivers.map(c => `${c.nombres} ${c.apellidos}`).filter(Boolean);
    return [...new Set(nombres)].sort();
  }, [drivers]);

  const cuilsUnicos = useMemo(() => {
    const cuils = drivers.map(c => c.numero_cuit).filter(Boolean) as string[];
    return [...new Set(cuils)].sort();
  }, [drivers]);

  const turnosUnicos = ['DIURNO', 'NOCTURNO', 'A_CARGO'];
  const turnoLabels: Record<string, string> = {
    'DIURNO': 'Diurno',
    'NOCTURNO': 'Nocturno',
    'A_CARGO': 'A Cargo'
  };

  // Opciones filtradas por búsqueda
  const nombresFiltrados = useMemo(() => {
    if (!nombreSearch) return nombresUnicos;
    return nombresUnicos.filter(n => n.toLowerCase().includes(nombreSearch.toLowerCase()));
  }, [nombresUnicos, nombreSearch]);

  const cuilsFiltrados = useMemo(() => {
    if (!cbuSearch) return cuilsUnicos;
    return cuilsUnicos.filter(c => c.toLowerCase().includes(cbuSearch.toLowerCase()));
  }, [cuilsUnicos, cbuSearch]);

  const toggleNombreFilter = (nombre: string) => {
    setNombreFilter(prev =>
      prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre]
    );
  };

  const toggleEstadoFilter = (estado: string) => {
    setEstadoFilter(prev =>
      prev.includes(estado) ? prev.filter(e => e !== estado) : [...prev, estado]
    );
  };

  const toggleTurnoFilter = (turno: string) => {
    setTurnoFilter(prev =>
      prev.includes(turno) ? prev.filter(t => t !== turno) : [...prev, turno]
    );
  };

  const toggleAsignacionFilter = (asignacion: string) => {
    setAsignacionFilter(prev =>
      prev.includes(asignacion) ? prev.filter(a => a !== asignacion) : [...prev, asignacion]
    );
  };

  const toggleCabifyDataFilter = (val: string) => {
    setCabifyDataFilter(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const filteredDrivers = useMemo(() => {
    let result = drivers;

    // Por defecto solo mostrar conductores activos; si showAllDrivers, mostrar todos (activos + baja)
    if (!showAllDrivers) {
      result = result.filter(c => {
        const codigo = (c as any).conductores_estados?.codigo?.toLowerCase();
        return codigo === 'activo';
      });
    }

    if (nombreFilter.length > 0) {
      result = result.filter(c =>
        nombreFilter.includes(`${c.nombres} ${c.apellidos}`)
      );
    }

    if (cbuFilter.length > 0) {
      result = result.filter(c =>
        cbuFilter.includes(c.numero_cuit || '')
      );
    }

    if (estadoFilter.length > 0) {
      result = result.filter(c => {
        const codigo = c.conductores_estados?.codigo || '';
        return estadoFilter.includes(codigo);
      });
    }

    if (turnoFilter.length > 0) {
      result = result.filter(c => turnoFilter.includes(getTurnoKeyForFilter(c as any)));
    }

    if (categoriaFilter.length > 0) {
      result = result.filter(c => {
        const categorias = c.licencias_categorias;
        if (!Array.isArray(categorias) || categorias.length === 0) return false;
        return categorias.some((cat: any) => categoriaFilter.includes(cat.codigo));
      });
    }

    if (asignacionFilter.length > 0) {
      result = result.filter(c => {
        const tieneAsignacion = !!(c as any).vehiculo_asignado;
        const esActivo = c.conductores_estados?.codigo?.toLowerCase() === 'activo';
        if (asignacionFilter.includes('asignado') && tieneAsignacion) return true;
        if (asignacionFilter.includes('disponible') && !tieneAsignacion && esActivo) return true;
        return false;
      });
    }

    if (efectivoFilter.length > 0) {
      result = result.filter(c => {
         const val = (c as any).facturacion_efectivo_filter || "N/A";
         return efectivoFilter.includes(val);
      });
    }

    if (appFilter.length > 0) {
      result = result.filter(c => {
         const val = (c as any).facturacion_app_filter || "N/A";
         return appFilter.includes(val);
      });
    }

    if (totalFilter.length > 0) {
      result = result.filter(c => {
         const val = (c as any).facturacion_total_filter || "N/A";
         return totalFilter.includes(val);
      });
    }

    if (cabifyDataFilter.length > 0) {
      result = result.filter(c => {
        const hasCabify = !!(c as any).hasCabifyData;
        if (cabifyDataFilter.includes('con_datos') && hasCabify) return true;
        if (cabifyDataFilter.includes('sin_datos') && !hasCabify) return true;
        return false;
      });
    }

    // Filtro por métricas (solo semana actual)
    if (activeStatFilter && selectedWeek === getCurrentWeek()) {
      switch (activeStatFilter) {
        case 'totalConductores':
          // No filter (show all)
          break;
        case 'totalFacturado':
          result = result.filter(d => (Number(d.facturacion_total) || 0) > 0);
          break;
        case 'totalEfectivo':
          result = result.filter(d => (Number(d.facturacion_efectivo) || 0) > 0);
          break;
        case 'totalApp':
          result = result.filter(d => (Number(d.facturacion_app) || 0) > 0);
          break;
        case 'llamadasRealizadas':
          result = result.filter(d => !!d.fecha_llamada);
          break;
        case 'llamadasPendientes':
          result = result.filter(d => !d.fecha_llamada);
          break;
        case 'seguimientoDiario':
        case 'seguimientoCercano':
        case 'seguimientoSemanal':
          result = result.filter(d => {
            const total = Number((d as any).facturacion_app) || 0;
            let ruleMatch = null;
            if (seguimientoRules && seguimientoRules.length > 0) {
              for (const rule of seguimientoRules) {
                const desde = Number(rule.desde || 0);
                const hasta = rule.hasta !== null && rule.hasta !== undefined ? Number(rule.hasta) : null;
                const matchesLower = total >= desde;
                const matchesUpper = hasta === null || total <= hasta;
                
                if (matchesLower && matchesUpper) {
                  ruleMatch = rule;
                  break;
                }
              }
            }
            if (!ruleMatch) return false;
            const nombre = ruleMatch.rango_nombre?.toLowerCase() || '';
            
            if (activeStatFilter === 'seguimientoDiario') return nombre.includes('diario');
            if (activeStatFilter === 'seguimientoCercano') return nombre.includes('cercano');
            if (activeStatFilter === 'seguimientoSemanal') return nombre.includes('semanal');
            return false;
          });
          break;
        case 'conductoresEscuela':
          result = result.filter(d => !!d.fecha_escuela);
          break;
        case 'capacitacionCabify':
        case 'capacitacionToshify':
        case 'seguimientoControl':
        case 'motivacional':
        case 'fidelizacion':
          result = result.filter(d => {
            if (!d.id_accion_imp) return false;
            const accion = accionesImplementadas.find(a => a.id === d.id_accion_imp);
            if (!accion) return false;
            const nombre = accion.nombre?.toLowerCase() || '';
            
            if (activeStatFilter === 'capacitacionCabify') return nombre.includes('capacitacion cabify') || nombre.includes('capacitación cabify');
            if (activeStatFilter === 'capacitacionToshify') return nombre.includes('capacitacion toshify') || nombre.includes('capacitación toshify');
            if (activeStatFilter === 'seguimientoControl') return nombre.includes('seguimiento y control');
            if (activeStatFilter === 'motivacional') return nombre.includes('motivacional');
            if (activeStatFilter === 'fidelizacion') return nombre.includes('fidelizacion') || nombre.includes('fidelización');
            return false;
          });
          break;
      }
    }

    if (sinGncFilter) {
      result = result.filter(c => {
        const vehiculo = (c as any).vehiculo_asignado;
        return vehiculo && vehiculo.gnc !== true;
      });
    }

    if (conSaldoFilter) {
      result = result.filter(c => {
        const saldo = (c as any).saldo_conductor ?? 0;
        return saldo < 0; // negativo = tiene deuda
      });
    }

    return result;
  }, [drivers, nombreFilter, cbuFilter, estadoFilter, turnoFilter, categoriaFilter, asignacionFilter, activeStatFilter, selectedWeek, seguimientoRules, efectivoFilter, appFilter, totalFilter, cabifyDataFilter, sinGncFilter, conSaldoFilter, showAllDrivers]);

  const uniqueEstados = useMemo(() => {
    const estados = new Map<string, string>();
    drivers.forEach(c => {
      if (c.conductores_estados?.codigo) {
        estados.set(c.conductores_estados.codigo, getEstadoConductorDisplay(c.conductores_estados));
      }
    });
    return Array.from(estados.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [drivers]);

  const uniqueCategorias = useMemo(() => {
    const categorias = new Map<string, string>();
    drivers.forEach(c => {
      if (Array.isArray(c.licencias_categorias)) {
        c.licencias_categorias.forEach((cat: any) => {
          if (cat?.codigo) {
            categorias.set(cat.codigo, cat.codigo);
          }
        });
      }
    });
    return Array.from(categorias.keys()).sort();
  }, [drivers]);

  const columns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: "nombres",
        header: () => (
          <div className="dt-column-filter">
            <span>Nombre {nombreFilter.length > 0 && `(${nombreFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${nombreFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setFilterDropdownPos({ top: rect.bottom + 4, left: rect.left });
                setOpenColumnFilter(openColumnFilter === 'nombre' ? null : 'nombre');
              }}
              title="Filtrar por nombre"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'nombre' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left }} onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={nombreSearch}
                  onChange={(e) => setNombreSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {nombresFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    nombresFiltrados.slice(0, 50).map(nombre => (
                      <label key={nombre} className={`dt-column-filter-checkbox ${nombreFilter.includes(nombre) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={nombreFilter.includes(nombre)}
                          onChange={() => toggleNombreFilter(nombre)}
                        />
                        <span>{nombre}</span>
                      </label>
                    ))
                  )}
                </div>
                {nombreFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setNombreFilter([]); setNombreSearch(''); }}
                  >
                    Limpiar ({nombreFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const createdAtRaw = (row.original as any).conductor_created_at;
          let label = '';
          if (createdAtRaw) {
            let createdAt: Date | null = null;
            if (createdAtRaw instanceof Date) {
              createdAt = createdAtRaw;
            } else {
              const str = String(createdAtRaw).trim();
              const parts = str.split(' ');
              if (parts.length >= 2) {
                const datePart = parts[0];
                const timePartWithOffset = parts[1];
                const timePart = timePartWithOffset.split('+')[0];
                const iso = `${datePart}T${timePart}Z`;
                const parsed = new Date(iso);
                if (!isNaN(parsed.getTime())) {
                  createdAt = parsed;
                }
              }
              if (!createdAt) {
                const fallback = new Date(str);
                if (!isNaN(fallback.getTime())) {
                  createdAt = fallback;
                }
              }
            }
            if (createdAt) {
              const cutoff = new Date('2026-01-16T00:00:00Z');
              label = createdAt < cutoff ? 'ANTIGUO' : 'NUEVO';
            }
          }
          const dni = row.original.numero_dni;
          const estado = (row.original as any).conductores_estados;
          const estadoCodigo = estado?.codigo?.toLowerCase();
          let estadoColor = '#6b7280'; // gris por defecto
          if (estadoCodigo === 'activo') estadoColor = '#16a34a';
          else if (estadoCodigo === 'baja') estadoColor = '#dc2626';
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
              <strong style={{ textTransform: 'uppercase', fontSize: '12.5px', lineHeight: 1.2 }}>{`${row.original.nombres} ${row.original.apellidos}`}</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
                {label && (
                  <span style={{ fontSize: '9.5px', color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                    {label}
                  </span>
                )}
                {dni && (
                  <span style={{ fontSize: '9.5px', color: 'var(--text-tertiary)' }}>
                    {label ? '·' : ''} {dni}
                  </span>
                )}
                {estado?.codigo && (
                  <span style={{ fontSize: '9.5px', color: estadoColor, fontWeight: 600, textTransform: 'uppercase' }}>
                    · {getEstadoConductorDisplay(estado)}
                  </span>
                )}
              </div>
            </div>
          );
        },
        enableSorting: true,
        size: 120,
      },

      ...(selectedWeek === getCurrentWeek() ? [{
        id: 'turno',
        header: () => (
          <div className="dt-column-filter">
            <span>Turno {turnoFilter.length > 0 && `(${turnoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${turnoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setFilterDropdownPos({ top: rect.bottom + 4, left: rect.left });
                setOpenColumnFilter(openColumnFilter === 'turno' ? null : 'turno');
              }}
              title="Filtrar por turno"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'turno' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left }} onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {turnosUnicos.map(turno => (
                    <label key={turno} className={`dt-column-filter-checkbox ${turnoFilter.includes(turno) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={turnoFilter.includes(turno)}
                        onChange={() => toggleTurnoFilter(turno)}
                      />
                      <span>{turnoLabels[turno] || turno}</span>
                    </label>
                  ))}
                </div>
                {turnoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => setTurnoFilter([])}
                  >
                    Limpiar ({turnoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        accessorFn: (row: any) => {
          const asignacionInfo = (row as any).asignacion_info;
          if (asignacionInfo) {
            if (asignacionInfo.modalidad === 'todo_dia') return 'A';
            if (asignacionInfo.turno_conductor) {
              const t = asignacionInfo.turno_conductor.toUpperCase();
              if (t === 'DIURNO') return 'D';
              if (t === 'NOCTURNO') return 'N';
              return t.charAt(0);
            }
          }
          const preferencia = ((row as any).preferencia_turno || '').toString().toLowerCase();
          if (!preferencia) return 'S';
          if (preferencia === 'diurno' || preferencia === 'mañana') return 'D';
          if (preferencia === 'nocturno' || preferencia === 'noche') return 'N';
          if (preferencia === 'sin preferencia') return 'S';
          return preferencia.charAt(0).toUpperCase();
        },
        cell: ({ row }: any) => {
          const estadoCodigo = (row.original as any).conductores_estados?.codigo?.toLowerCase() || '';
          const isBaja = estadoCodigo === 'baja' || estadoCodigo.includes('baja');
          if (isBaja) {
            return <span className="vehiculo-cell-na">N/A</span>;
          }
          const chip = (bg: string, color: string, txt: string) => (
            <span
              style={{
                fontSize: '12px',
                lineHeight: 1,
                padding: '2px 6px',
                borderRadius: 9999,
                backgroundColor: bg,
                color,
                display: 'inline-block',
                whiteSpace: 'nowrap',
              }}
            >
              {txt}
            </span>
          );
          const asignacionInfo = (row.original as any).asignacion_info;
          if (asignacionInfo) {
            if (asignacionInfo.modalidad === 'todo_dia') {
              return chip('#EDE9FE', '#6D28D9', 'A Cargo');
            }
            const turno = asignacionInfo.turno_conductor?.toLowerCase();
            if (turno === 'diurno') {
              return chip('#FEF3C7', '#9A3412', 'Diurno');
            }
            if (turno === 'nocturno') {
              return chip('#DBEAFE', '#1D4ED8', 'Nocturno');
            }
            if (turno) {
              return chip('#E5E7EB', '#374151', turno.charAt(0).toUpperCase());
            }
          }
          const preferenciaRaw = (row.original as any).preferencia_turno;
          const preferencia = preferenciaRaw ? preferenciaRaw.toString().toLowerCase() : '';
          let label = 'Sin preferencia';
          let bg = '#E5E7EB';
          let color = '#374151';
          if (preferencia === 'diurno' || preferencia === 'mañana') {
            label = 'Diurno';
            bg = '#FEF3C7';
            color = '#9A3412';
          } else if (preferencia === 'nocturno' || preferencia === 'noche') {
            label = 'Nocturno';
            bg = '#DBEAFE';
            color = '#1D4ED8';
          } else if (preferencia && preferencia !== 'sin preferencia') {
            label = preferencia.charAt(0).toUpperCase();
          }
          return chip(bg, color, label);
        },
        filterFn: (row: any, id: string, filterValue: any) => {
          if (!filterValue.length) return true
          const val = row.getValue(id) as string
          return filterValue.includes(val)
        },
        size: 80,
      }] : []),

      {
        id: "vehiculo_asignado",
        header: () => (
          <div className="dt-column-filter">
            <span>Asignación {asignacionFilter.length > 0 && `(${asignacionFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${asignacionFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setFilterDropdownPos({ top: rect.bottom + 4, left: rect.left });
                setOpenColumnFilter(openColumnFilter === 'asignacion' ? null : 'asignacion');
              }}
              title="Filtrar por asignación"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'asignacion' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left }} onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  <label className={`dt-column-filter-checkbox ${asignacionFilter.includes('asignado') ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={asignacionFilter.includes('asignado')}
                      onChange={() => toggleAsignacionFilter('asignado')}
                    />
                    <span>Asignados</span>
                  </label>
                  <label className={`dt-column-filter-checkbox ${asignacionFilter.includes('disponible') ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={asignacionFilter.includes('disponible')}
                      onChange={() => toggleAsignacionFilter('disponible')}
                    />
                    <span>Disponibles</span>
                  </label>
                </div>
                {asignacionFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => setAsignacionFilter([])}
                  >
                    Limpiar ({asignacionFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const estadoCodigo = (row.original as any).conductores_estados?.codigo?.toLowerCase() || '';
          const isBaja = estadoCodigo === 'baja' || estadoCodigo.includes('baja');
          
          if (isBaja) {
            return <span className="vehiculo-cell-na">-</span>;
          }
          
          const vehiculo = (row.original as any).vehiculo_asignado;
          if (vehiculo) {
            const tieneGnc = vehiculo.gnc === true;
            return (
              <div className="vehiculo-cell">
                <div className="vehiculo-cell-patente">{vehiculo.patente}</div>
                <div className="vehiculo-cell-info">
                  {vehiculo.marca} {vehiculo.modelo}
                </div>
                <span
                  className={`dt-badge badge-no-dot ${tieneGnc ? 'dt-badge-green' : 'dt-badge-yellow'}`}
                  style={{ fontSize: '10px', marginTop: '4px' }}
                >
                  {tieneGnc ? 'CON GNC' : 'SIN GNC'}
                </span>
              </div>
            );
          }
          const isActivo = estadoCodigo === 'activo';
          if (isActivo) {
            return <span className="dt-badge dt-badge-green badge-no-dot">Disponible</span>;
          }
          return <span className="vehiculo-cell-na">-</span>;
        },
        enableSorting: false,
        size: 120,
      },
      {
        id: "seguimiento",
        header: "Seguimiento",
        accessorFn: (row) => {
          const rawSeguimientoDb = (row as any).seguimiento;
          const rawTotalPrev = (row as any).prev_week_total_monetario;
          const matchingRules = ((row as any).prev_week_matching_rules || []) as any[];

          const rawDb = typeof rawSeguimientoDb === 'string' ? rawSeguimientoDb.trim().toUpperCase() : '';
          if (rawDb) return rawDb;

          const parse = (val: any): number => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const str = String(val).trim();
            if (!isNaN(Number(str))) return Number(str);
            return parseFloat(str.replace(/\./g, '').replace(',', '.'));
          };

          const total = parse(rawTotalPrev);

          let ruleMatch: any = null;
          if (matchingRules && matchingRules.length > 0) {
            for (const rule of matchingRules) {
              const desde = Number(rule.desde || 0);
              const hasHasta = rule.hasta !== null && rule.hasta !== undefined;
              const hasta = hasHasta ? Number(rule.hasta) : null;
              const matchesLower = total >= desde;
              const matchesUpper = hasHasta ? total <= (hasta as number) : true;
              if (matchesLower && matchesUpper) {
                ruleMatch = rule;
                break;
              }
            }
          }

          if (ruleMatch) {
            const nombre = (ruleMatch.rango_nombre || '').toString().toUpperCase();
            if (nombre.includes('DIARIO')) return 'DIARIO';
            if (nombre.includes('CERCANO')) return 'CERCANO';
            if (nombre.includes('SEMANAL')) return 'SEMANAL';
            return nombre || '-';
          }

          if (!matchingRules || matchingRules.length === 0) return 'SIN REGISTRO';
          return '-';
        },
        cell: ({ row }) => {
          const rawSeguimientoDb = (row.original as any).seguimiento;
          const rawTotalPrev = (row.original as any).prev_week_total_monetario;
          const matchingRules = ((row.original as any).prev_week_matching_rules || []) as any[];

          const parseTotal = (val: any): number => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const str = String(val).trim();
            if (!isNaN(Number(str))) return Number(str);
            return parseFloat(str.replace(/\./g, '').replace(',', '.'));
          };

          const total = parseTotal(rawTotalPrev);

          const getBadgeColor = (color: string) => {
            const c = color?.toLowerCase().trim();
            if (c === 'verde') return 'dt-badge dt-badge-green badge-no-dot';
            if (c === 'amarillo') return 'dt-badge dt-badge-yellow badge-no-dot';
            if (c === 'rojo') return 'dt-badge dt-badge-red badge-no-dot';
            return 'dt-badge dt-badge-gray badge-no-dot';
          };

          const rawDb = typeof rawSeguimientoDb === 'string' ? rawSeguimientoDb.trim().toUpperCase() : '';

          // Saldo del conductor
          const saldoConductor = (row.original as any).saldo_conductor ?? 0;
          const tieneSaldo = saldoConductor < 0; // negativo = deuda
          const saldoDisplay = tieneSaldo
            ? new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 }).format(Math.abs(saldoConductor))
            : null;

          const saldoElement = (
            <div style={{ marginTop: '4px', fontSize: '10px', fontWeight: 600, textAlign: 'center' }}>
              {tieneSaldo ? (
                <span style={{ color: '#dc2626' }}>{saldoDisplay}</span>
              ) : (
                <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>Sin Saldo</span>
              )}
            </div>
          );

          if (rawDb) {
            let manualClass = 'dt-badge dt-badge-gray badge-no-dot';
            if (rawDb === 'SEMANAL') manualClass = 'dt-badge dt-badge-green badge-no-dot';
            else if (rawDb === 'CERCANO') manualClass = 'dt-badge dt-badge-yellow badge-no-dot';
            else if (rawDb === 'DIARIO') manualClass = 'dt-badge dt-badge-red badge-no-dot';
            return (
              <div className="flex justify-center" style={{ flexDirection: 'column', alignItems: 'center' }}>
                <span className={manualClass}>{rawDb}</span>
                {saldoElement}
              </div>
            );
          }

          let ruleMatch = null;

          if (matchingRules && matchingRules.length > 0) {
            for (const rule of matchingRules) {
              const desde = Number(rule.desde || 0);
              const hasHasta = rule.hasta !== null && rule.hasta !== undefined;
              const hasta = hasHasta ? Number(rule.hasta) : null;
              const matchesLower = total >= desde;
              const matchesUpper = hasHasta ? total <= (hasta as number) : true;
              if (matchesLower && matchesUpper) {
                ruleMatch = rule;
                break;
              }
            }
          }

          return (
            <div className="flex justify-center" style={{ flexDirection: 'column', alignItems: 'center' }}>
              {ruleMatch ? (
                <span className={getBadgeColor(ruleMatch.color)}>
                  {ruleMatch.rango_nombre}
                </span>
              ) : matchingRules.length === 0 ? (
                <span className="dt-badge dt-badge-gray badge-no-dot">
                  SIN REGISTRO
                </span>
              ) : (
                <span style={{ color: 'var(--text-tertiary)' }}>-</span>
              )}
              {saldoElement}
            </div>
          );
        },
        enableSorting: true,
        size: 105,
      },
      {
        id: "datos_cabify",
        header: () => (
          <div className="dt-column-filter">
            <span>Datos Cabify {cabifyDataFilter.length > 0 && `(${cabifyDataFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${cabifyDataFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                setFilterDropdownPos({ top: rect.bottom + 4, left: rect.left });
                setOpenColumnFilter(openColumnFilter === 'cabifyData' ? null : 'cabifyData');
              }}
              title="Filtrar por datos Cabify"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'cabifyData' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" style={{ top: filterDropdownPos.top, left: filterDropdownPos.left }} onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  <label className={`dt-column-filter-checkbox ${cabifyDataFilter.includes('con_datos') ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={cabifyDataFilter.includes('con_datos')}
                      onChange={() => toggleCabifyDataFilter('con_datos')}
                    />
                    <span>Con datos</span>
                  </label>
                  <label className={`dt-column-filter-checkbox ${cabifyDataFilter.includes('sin_datos') ? 'selected' : ''}`}>
                    <input
                      type="checkbox"
                      checked={cabifyDataFilter.includes('sin_datos')}
                      onChange={() => toggleCabifyDataFilter('sin_datos')}
                    />
                    <span>N/A</span>
                  </label>
                </div>
                {cabifyDataFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => setCabifyDataFilter([])}
                  >
                    Limpiar ({cabifyDataFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const hasCabify = (row.original as any).hasCabifyData;
          const appRaw = (row.original as any).facturacion_app as number | null | undefined;
          const efectivoRaw = (row.original as any).facturacion_efectivo as number | null | undefined;
          const totalRaw = (row.original as any).facturacion_total as number | null | undefined;
          const formatMoney = (v: number | null | undefined) => {
            const n = v ? Number(Number(v).toFixed(2)) : v as any;
            if (n && n > 0) {
              return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n as number);
            }
            if (!hasCabify) {
              return <span className="italic" style={{ color: 'var(--text-tertiary)' }} title="Sin datos de Cabify">N/A</span>;
            }
            if (n === undefined || n === null) return "-";
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(Number(n).toFixed(2)));
          };
          return (
            <div style={{ display: 'inline-grid', gridTemplateColumns: 'auto auto', columnGap: 4, rowGap: 1, fontSize: '12px', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>App:</span><span style={{ textAlign: 'right' }}>{formatMoney(appRaw) as any}</span>
              <span style={{ fontWeight: 600 }}>Efectivo:</span><span style={{ textAlign: 'right' }}>{formatMoney(efectivoRaw) as any}</span>
              <span style={{ fontWeight: 600 }}>Total:</span><span style={{ textAlign: 'right' }}>{formatMoney(totalRaw) as any}</span>
            </div>
          );
        },
        enableSorting: false,
        size: 145,
      },

      {
        id: "cuota_semanal",
        header: "Facturación",
        cell: ({ row }) => {
          const hasBilling = (row.original as any).hasBillingData;
          const alquiler = (row.original as any).billing_alquiler as number;
          const garantia = (row.original as any).billing_garantia as number;
          const cuota = (row.original as any).billing_cuota_semanal as number;
          const fmtBilling = (v: number) => {
            if (!hasBilling) return <span className="italic" style={{ color: 'var(--text-tertiary)' }} title="Sin datos de facturación">N/A</span>;
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
          };
          return (
            <div style={{ display: 'inline-grid', gridTemplateColumns: 'auto auto', columnGap: 4, rowGap: 1, fontSize: '12px', alignItems: 'baseline' }}>
              <span style={{ fontWeight: 600 }}>Alquiler:</span><span style={{ textAlign: 'right' }}>{fmtBilling(alquiler) as any}</span>
              <span style={{ fontWeight: 600 }}>Garantía:</span><span style={{ textAlign: 'right' }}>{fmtBilling(garantia) as any}</span>
              <span style={{ fontWeight: 600, borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: 1 }}>Total:</span><span style={{ textAlign: 'right', fontWeight: 700, borderTop: '1px solid var(--border-color, #e5e7eb)', paddingTop: 1 }}>{fmtBilling(cuota) as any}</span>
            </div>
          );
        },
        enableSorting: false,
        size: 130,
      },

      {
        id: "proyectado",
        header: "Proyectado",
        accessorFn: (row) => (row as any).billing_proyectado || 0,
        cell: ({ row }) => {
          const hasBilling = (row.original as any).hasBillingData;
          const proyectado = (row.original as any).billing_proyectado as number;
          const alquiler = (row.original as any).billing_alquiler as number;

          if (!hasBilling || proyectado === 0) {
            return <span className="italic" style={{ color: 'var(--text-tertiary)', fontSize: '11px' }} title="Sin datos de facturación">-</span>;
          }

          const porcentaje = proyectado > 0 ? Math.min(100, Math.round((alquiler / proyectado) * 100)) : 0;
          const completo = alquiler >= proyectado && alquiler > 0;

          return (
            <div style={{ fontSize: '11px', minWidth: '80px' }}>
              <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(proyectado)}
              </div>
              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#e5e7eb',
                borderRadius: '4px',
                overflow: 'hidden',
                border: '1px solid #d1d5db'
              }}>
                <div style={{
                  width: `${Math.max(porcentaje, 0)}%`,
                  height: '100%',
                  backgroundColor: completo ? '#10b981' : porcentaje >= 70 ? '#f59e0b' : '#ef4444',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease',
                  minWidth: porcentaje > 0 ? '4px' : '0'
                }} />
              </div>
              <div style={{
                fontSize: '9px',
                color: completo ? '#10b981' : '#6b7280',
                marginTop: '3px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span>{porcentaje}%</span>
                {completo && <span style={{ color: '#10b981', fontWeight: 600 }}>✓</span>}
              </div>
            </div>
          );
        },
        enableSorting: true,
        size: 110,
      },

      {
        id: "llamada_status",
        header: "Llamada",
        accessorFn: (row) => {
          const fecha = (row as any).fecha_llamada as string | null;
          const hasFecha = !!fecha;
          return hasFecha ? 'Realizada' : 'Pendientes';
        },
        cell: ({ row }) => {
          const fecha = (row.original as any).fecha_llamada as string | null;
          const hasFecha = !!fecha;
          const formatted = hasFecha ? new Date(fecha).toLocaleDateString('es-AR') : null;
          const isRealizada = hasFecha;
          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              <span className={isRealizada ? 'dt-badge dt-badge-green badge-no-dot' : 'dt-badge dt-badge-yellow badge-no-dot'}>
                {isRealizada ? 'Realizada' : 'Pendientes'}
              </span>
              {isRealizada && formatted && (
                <span
                  style={{
                    marginTop: 4,
                    fontSize: '13px',
                    color: '#111827',
                    backgroundColor: '#e5e7eb',
                    padding: '2px 8px',
                    borderRadius: 9999,
                    display: 'inline-block',
                  }}
                >
                  {formatted}
                </span>
              )}
            </div>
          );
        },
        enableSorting: true,
        size: 95,
      },
      {
        id: "accion_imple",
        header: "Accion Imple.",
        accessorFn: (row) => {
          const idAccion = (row as any).id_accion_imp;
          const targetId = idAccion || 1;
          const accion = accionesImplementadas.find(a => a.id === targetId);
          const rawName = accion ? accion.nombre : (idAccion || "-");
          return (rawName || "").toString().toUpperCase();
        },
        cell: ({ getValue }) => {
          const name = ((getValue() as string) || "").toString().toUpperCase();
          const parts = name.split(" ");
          const first = parts[0] || "";
          const second = parts.slice(1).join(" ") || null;
          return (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span>{first}</span>
              {second && <span>{second}</span>}
            </div>
          );
        },
        enableSorting: true,
        size: 130,
      },
      {
        id: "escuela",
        header: "Escuela",
        accessorFn: (row) => (row as any).fecha_escuela ? "SI" : "NO",
        cell: ({ row }) => {
          const hasDate = !!(row.original as any).fecha_escuela;
          return (
            <span className={`dt-badge ${hasDate ? 'dt-badge-green' : 'dt-badge-gray'} badge-no-dot`}>
              {hasDate ? "SI" : "NO"}
            </span>
          );
        },
        enableSorting: true,
        size: 65,
      },
      {
        id: "acciones",
        header: "Acciones",
        cell: ({ row }) => {
          const isCurrent = selectedWeek === getCurrentWeek();
          
          return (
            <ActionsMenu
              actions={[
                {
                  icon: isCurrent ? <Pencil size={15} /> : <Eye size={15} />,
                  label: isCurrent ? 'Editar' : 'Ver detalles',
                  onClick: () => {
                    setSelectedConductor(row.original as any);
                    setShowDetailsModal(true);
                  }
                },
                {
                  icon: <History size={15} />,
                  label: 'Historial',
                  onClick: () => handleViewHistory(row.original)
                },
                {
                  icon: <img src={iconNotas} width={18} height={18} alt="Notas" style={{ filter: 'brightness(0)', opacity: 0.3 }} />,
                  label: 'Historial Notas',
                  onClick: () => handleViewHistoryNotes(row)
                },
                {
                  icon: <DollarSign size={15} />,
                  label: 'Ver Cabify',
                  onClick: () => {
                    setCabifyHistoricoConductor({
                      id: row.original.id,
                      nombres: row.original.nombres,
                      apellidos: row.original.apellidos,
                      numero_dni: row.original.numero_dni || '',
                    });
                    setCabifyHistoricoModalOpen(true);
                  }
                },
                ...(isCurrent ? [{
                  icon: <ArrowLeftRight size={15} />,
                  label: 'Reasignacion Guia',
                  onClick: () => {
                    setSelectedConductorForReassign(row.original as any);
                    setReasignacionModalOpen(true);
                  }
                }] : [])
              ]}
            />
          );
        },
        size: 150,
      },
    ],
    [
      nombreFilter, cbuFilter, estadoFilter, turnoFilter,
      categoriaFilter, asignacionFilter, openColumnFilter,
      nombresFiltrados, cuilsFiltrados, uniqueCategorias, uniqueEstados,
      nombreSearch, cbuSearch, selectedWeek, seguimientoRules, accionesImplementadas,
      efectivoFilter, appFilter, totalFilter, cabifyDataFilter
    ]
  );

  const handleClearAllFilters = () => {
    setNombreFilter([]);
    setEstadoFilter([]);
    setTurnoFilter([]);
    setAsignacionFilter([]);
    setEfectivoFilter([]);
    setAppFilter([]);
    setTotalFilter([]);
    setCabifyDataFilter([]);
    setActiveStatFilter(null);
    setSinGncFilter(false);
    setGlobalSearch('');
  };

  const handleToggleStatFilter = (filterName: string) => {
    if (selectedWeek !== getCurrentWeek()) return;
    setActiveStatFilter(prev => prev === filterName ? null : filterName);
  };

  const handleDriverUpdate = () => {
    if (!selectedGuiaId) return;
    loadDrivers(selectedGuiaId);
    loadCurrentWeekMetrics(selectedGuiaId);
  };

  return (
    <div className="guias-module">
      {/* Header */}
      

      {loading ? (
        <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Cargando guías...
        </div>
      ) : (
        <>
          {/* Selected Guide Content */}
          {selectedGuia ? (
            <>
              {/* Metrics */}
              <div className="guias-stats">

                
                {(() => {
                  // Cálculo de métricas USANDO SIEMPRE currentWeekDrivers
                  const isCurrentWeek = selectedWeek === getCurrentWeek();
                  const statCardClass = `stat-card ${isCurrentWeek ? 'cursor-pointer hover:opacity-80' : ''}`;
                  const totalConductores = currentWeekDrivers.length;
                  
                  const totalFacturado = currentWeekDrivers.reduce((acc, d) => acc + (Number(d.facturacion_total) || 0), 0);
                  const totalEfectivo = currentWeekDrivers.reduce((acc, d) => acc + (Number(d.facturacion_efectivo) || 0), 0);
                  const totalApp = currentWeekDrivers.reduce((acc, d) => acc + (Number(d.facturacion_app) || 0), 0);
                  
                  // Métrica Conductores en Escuela
                  const conductoresEscuelaCount = currentWeekDrivers.filter(d => !!d.fecha_escuela).length;

                  const llamadasRealizadas = currentWeekDrivers.filter(d => !!d.fecha_llamada).length;
                  const llamadasPendientes = currentWeekDrivers.filter(d => !d.fecha_llamada).length;

                  let seguimientoDiario = 0;
                  let seguimientoCercano = 0;
                  let seguimientoSemanal = 0;

                  currentWeekDrivers.forEach(d => {
                    const rawSeguimiento = (d as any).seguimiento;
                    if (rawSeguimiento && typeof rawSeguimiento === 'string' && rawSeguimiento.trim() !== '') {
                      const nombre = rawSeguimiento.trim().toLowerCase();
                      if (nombre === 'diario') {
                        seguimientoDiario++;
                      } else if (nombre === 'cercano') {
                        seguimientoCercano++;
                      } else if (nombre === 'semanal') {
                        seguimientoSemanal++;
                      }
                      return;
                    }

                    const total = Number((d as any).facturacion_app) || 0;
                    let ruleMatch = null;

                    if (seguimientoRules && seguimientoRules.length > 0) {
                      for (const rule of seguimientoRules) {
                        const desde = Number(rule.desde || 0);
                        const hasta = rule.hasta !== null && rule.hasta !== undefined ? Number(rule.hasta) : null;
                        const matchesLower = total >= desde;
                        const matchesUpper = hasta === null || total <= hasta;
                        
                        if (matchesLower && matchesUpper) {
                          ruleMatch = rule;
                          break;
                        }
                      }
                    }

                    if (ruleMatch) {
                      const nombre = ruleMatch.rango_nombre?.toLowerCase() || '';
                      if (nombre.includes('diario')) seguimientoDiario++;
                      else if (nombre.includes('cercano')) seguimientoCercano++;
                      else if (nombre.includes('semanal')) seguimientoSemanal++;
                    }
                  });

                  // Conteo de acciones implementadas (5 nuevas métricas)
                  const getActionCount = (name: string) => {
                    const action = accionesImplementadas.find(a => a.nombre?.toLowerCase().includes(name.toLowerCase()));
                    if (!action) return 0;
                    return currentWeekDrivers.filter(d => d.id_accion_imp === action.id).length;
                  };

                  const capacitacionCabifyCount = getActionCount('capacitacion cabify') || getActionCount('capacitación cabify');
                  const capacitacionToshifyCount = getActionCount('capacitacion toshify') || getActionCount('capacitación toshify');
                  const seguimientoControlCount = getActionCount('seguimiento y control');
                  const motivacionalCount = getActionCount('motivacional');
                  const fidelizacionCount = getActionCount('fidelizacion') || getActionCount('fidelización');

                  // Formateador de moneda
                  const formatCurrency = (val: number) => {
                    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
                  };

                  return (
                    <div className="guias-stats-grid grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                      {/* Fila 1 */}
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('totalConductores')}
                      >
                        <Users className="stat-icon" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{totalConductores}</span>
                          <span className="stat-label">TOTAL DE CONDUCTORES</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('totalFacturado')}
                      >
                        <DollarSign className="stat-icon" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalFacturado)}</span>
                          <span className="stat-label">TOTAL FACTURADO</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('totalEfectivo')}
                      >
                        <DollarSign className="stat-icon text-green-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalEfectivo)}</span>
                          <span className="stat-label">FACTURACIÓN EFECTIVO</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('totalApp')}
                      >
                        <DollarSign className="stat-icon text-blue-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalApp)}</span>
                          <span className="stat-label">FACTURACIÓN APP</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('conductoresEscuela')}
                      >
                        <GraduationCap className="stat-icon text-purple-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{conductoresEscuelaCount}</span>
                          <span className="stat-label">CONDUCTORES EN ESCUELA</span>
                        </div>
                      </div>

                      {/* Fila 2 */}
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('llamadasRealizadas')}
                      >
                        <Phone className="stat-icon text-green-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{llamadasRealizadas}</span>
                          <span className="stat-label">LLAMADAS REALIZADAS</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('llamadasPendientes')}
                      >
                        <PhoneCall className="stat-icon text-orange-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{llamadasPendientes}</span>
                          <span className="stat-label">LLAMADAS PENDIENTES</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('seguimientoDiario')}
                      >
                        <AlertTriangle className="stat-icon text-red-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoDiario}</span>
                          <span className="stat-label">SEGUIMIENTO DIARIO</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('seguimientoCercano')}
                      >
                        <AlertTriangle className="stat-icon text-yellow-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoCercano}</span>
                          <span className="stat-label">SEGUIMIENTO CERCANO</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('seguimientoSemanal')}
                      >
                        <CheckCircle className="stat-icon text-green-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoSemanal}</span>
                          <span className="stat-label">SEGUIMIENTO SEMANAL</span>
                        </div>
                      </div>

                      {/* Fila 3 - Nuevas Métricas */}
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('capacitacionCabify')}
                      >
                        <Book className="stat-icon text-blue-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{capacitacionCabifyCount}</span>
                          <span className="stat-label">CAPACITACION CABIFY</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('capacitacionToshify')}
                      >
                        <Book className="stat-icon text-indigo-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{capacitacionToshifyCount}</span>
                          <span className="stat-label">CAPACITACION TOSHIFY</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('seguimientoControl')}
                      >
                        <Target className="stat-icon text-red-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoControlCount}</span>
                          <span className="stat-label">SEGUIMIENTO Y CONTROL</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('motivacional')}
                      >
                        <Star className="stat-icon text-yellow-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{motivacionalCount}</span>
                          <span className="stat-label">ACCION MOTIVACIONAL</span>
                        </div>
                      </div>
                      <div 
                        className={statCardClass}
                        onClick={() => handleToggleStatFilter('fidelizacion')}
                      >
                        <Heart className="stat-icon text-pink-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{fidelizacionCount}</span>
                          <span className="stat-label">ACCION DE FIDELIZACION</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Filters & Table Container */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Filters Row: Quick filters + Search + Week Selector + Button */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '8px',
                  background: 'var(--bg-secondary)',
                  padding: '12px',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-sm)',
                }}>
                  {/* Quick filters row */}
                  {(() => {
                    const countSinGnc = drivers.filter(c => {
                      const vehiculo = (c as any).vehiculo_asignado;
                      return vehiculo && vehiculo.gnc !== true;
                    }).length;
                    const countConSaldo = drivers.filter(c => {
                      const saldo = (c as any).saldo_conductor ?? 0;
                      return saldo < 0;
                    }).length;
                    return (
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {countSinGnc > 0 && (
                          <button
                            onClick={() => setSinGncFilter(prev => !prev)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              borderRadius: '14px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: sinGncFilter ? '2px solid #d97706' : '1px solid var(--border-primary)',
                              background: sinGncFilter ? 'rgba(245,158,11,0.12)' : 'transparent',
                              color: sinGncFilter ? '#d97706' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Sin GNC <span style={{ opacity: 0.7 }}>{countSinGnc}</span>
                          </button>
                        )}
                        {countConSaldo > 0 && (
                          <button
                            onClick={() => setConSaldoFilter(prev => !prev)}
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '5px',
                              padding: '4px 10px',
                              borderRadius: '14px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: conSaldoFilter ? '2px solid #dc2626' : '1px solid var(--border-primary)',
                              background: conSaldoFilter ? 'rgba(220,38,38,0.08)' : 'transparent',
                              color: conSaldoFilter ? '#dc2626' : 'var(--text-secondary)',
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                              whiteSpace: 'nowrap',
                            }}
                          >
                            Con Saldo <span style={{ opacity: 0.7 }}>{countConSaldo}</span>
                          </button>
                        )}
                        <button
                          onClick={() => setShowAllDrivers(prev => !prev)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '4px 10px',
                            borderRadius: '14px',
                            fontSize: '11px',
                            fontWeight: 600,
                            border: showAllDrivers ? '2px solid #6366f1' : '1px solid var(--border-primary)',
                            background: showAllDrivers ? 'rgba(99,102,241,0.10)' : 'transparent',
                            color: showAllDrivers ? '#6366f1' : 'var(--text-secondary)',
                            cursor: 'pointer',
                            transition: 'all 0.15s',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {showAllDrivers ? 'Ver solo activos' : 'Ver total conductores'}
                        </button>
                      </div>
                    );
                  })()}
                  {/* Search + Week Selector + Gestión row */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    flexWrap: 'wrap',
                  }}>
                  {/* Search Input */}
                  <div className="dt-search-wrapper" style={{ flex: 1, minWidth: '200px' }}>
                    <Search className="dt-search-icon" size={20} />
                    <input
                      type="text"
                      className="dt-search-input"
                      placeholder="Buscar en esta lista..."
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                    />
                  </div>

                  {/* Week Selector */}
                  <WeekSelector 
                    selectedWeek={selectedWeek} 
                    onWeekChange={setSelectedWeek} 
                  />

                  {/* Botón Gestión de Conductores */}
                  <button 
                    onClick={() => setGestionConductoresModalOpen(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      height: '42px',
                      padding: '0 16px',
                      background: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-primary)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      transition: 'all 0.15s',
                    }}
                  >
                    <Users size={16} />
                    <span>Gestión de Conductores</span>
                  </button>
                  </div>
                </div>

                {/* Filtros Activos */}
                {(nombreFilter.length > 0 || estadoFilter.length > 0 || turnoFilter.length > 0 || asignacionFilter.length > 0 || cabifyDataFilter.length > 0 || activeStatFilter || sinGncFilter || conSaldoFilter || showAllDrivers) && (
                  <div className="active-filters-container">
                    <div className="active-filters-label">
                      <Triangle size={8} fill="var(--color-primary)" stroke="var(--color-primary)" style={{ transform: 'rotate(180deg)' }} />
                      Filtros activos:
                    </div>
                    
                    {nombreFilter.map(f => (
                      <span key={`nom-${f}`} className="active-filter-tag">
                        Nombre: {f}
                        <button onClick={() => toggleNombreFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}
                    {estadoFilter.map(f => (
                      <span key={`est-${f}`} className="active-filter-tag">
                        Estado: {getEstadoConductorDisplay({ codigo: f })}
                        <button onClick={() => toggleEstadoFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}

                    {turnoFilter.map(f => (
                      <span key={`tur-${f}`} className="active-filter-tag">
                        Turno: {turnoLabels[f] || f}
                        <button onClick={() => toggleTurnoFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}

                    {asignacionFilter.map(f => (
                      <span key={`asig-${f}`} className="active-filter-tag">
                        Asignación: {f === 'asignado' ? 'Asignado' : 'Disponible'}
                        <button onClick={() => toggleAsignacionFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}

                    {cabifyDataFilter.map(f => (
                      <span key={`cab-${f}`} className="active-filter-tag">
                        Cabify: {f === 'con_datos' ? 'Con datos' : 'N/A'}
                        <button onClick={() => toggleCabifyDataFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}

                    {sinGncFilter && (
                      <span className="active-filter-tag">
                        Sin GNC
                        <button onClick={() => setSinGncFilter(false)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    )}

                    {conSaldoFilter && (
                      <span className="active-filter-tag">
                        Con Saldo
                        <button onClick={() => setConSaldoFilter(false)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    )}

                    {showAllDrivers && (
                      <span className="active-filter-tag">
                        Total conductores
                        <button onClick={() => setShowAllDrivers(false)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    )}

                    {activeStatFilter && (
                      <span className="active-filter-tag">
                        Métrica: {
                          {
                            'totalConductores': 'Total Conductores',
                            'totalFacturado': 'Total Facturado',
                            'totalEfectivo': 'Facturación Efectivo',
                            'totalApp': 'Facturación App',
                            'conductoresEscuela': 'Conductores en Escuela',
                            'llamadasRealizadas': 'Llamadas Realizadas',
                            'llamadasPendientes': 'Llamadas Pendientes',
                            'seguimientoDiario': 'Seguimiento Diario',
                            'seguimientoCercano': 'Seguimiento Cercano',
                            'seguimientoSemanal': 'Seguimiento Semanal',
                            'capacitacionCabify': 'Capacitación Cabify',
                            'capacitacionToshify': 'Capacitación Toshify',
                            'seguimientoControl': 'Seguimiento y Control',
                            'motivacional': 'Acción Motivacional',
                            'fidelizacion': 'Acción de Fidelización'
                          }[activeStatFilter] || activeStatFilter
                        }
                        <button onClick={() => setActiveStatFilter(null)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    )}

                    <button 
                      onClick={handleClearAllFilters}
                      className="active-filters-clear"
                    >
                      Limpiar todos
                    </button>
                  </div>
                )}

                {/* Table */}
                <div className="guias-table-container">
                  <DataTable
                    columns={columns}
                    data={filteredDrivers}
                    loading={loadingDrivers}
                    showSearch={false}
                    globalFilter={globalSearch}
                    onGlobalFilterChange={setGlobalSearch}
                    stickyFirstColumn
                    emptyIcon={<Users size={64} />}
                    emptyTitle="No hay conductores asignados"
                    emptyDescription="Este guía no tiene conductores asignados o no cumplen con los filtros."
                  />
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              {guias.length === 0 
                ? "No se encontraron usuarios con rol 'guia'."
                : "Seleccione una guía del menú lateral para ver su gestión."}
            </div>
          )}
        </>
      )}
      {showDetailsModal && selectedConductor && (
        <DriverDetailModal
          driver={selectedConductor}
          onClose={() => setShowDetailsModal(false)}
          onDriverUpdate={handleDriverUpdate}
          accionesImplementadas={accionesImplementadas}
          currentProfile={profile}
          readOnly={selectedWeek !== getCurrentWeek()}
        />
      )}
      {showHistoryModal && selectedConductorHistory && (
        <DriverHistoryModal
          isOpen={showHistoryModal}
          onClose={() => setShowHistoryModal(false)}
          conductor={{
            nombre: `${selectedConductorHistory.nombres} ${selectedConductorHistory.apellidos}`,
            dni: selectedConductorHistory.numero_dni || ''
          }}
          historial={historyRows}
        />
      )}
      {anotacionesModalOpen && selectedRowForAnotaciones && (
        <AnotacionesEditorModal
          isOpen={anotacionesModalOpen}
          onClose={() => setAnotacionesModalOpen(false)}
          initialAnotaciones={selectedRowForAnotaciones.anotaciones}
          onSave={handleSaveAnotaciones}
          currentUser={profile?.full_name || profile?.email || 'Usuario'}
          title={selectedRowForAnotaciones.conductorName}
        />
      )}

      {historyNotesModalOpen && (
        <AnotacionesModal
          isOpen={historyNotesModalOpen}
          onClose={() => setHistoryNotesModalOpen(false)}
          anotaciones={historyNotesData}
          totalAnotaciones={historyNotesTotal}
          title="Historial de Anotaciones"
          driverName={historyNotesDriverName}
          driverDni={historyNotesDriverDni}
        />
      )}

      {schoolReportModalOpen && (
        <ReporteEscuelaModal
          isOpen={schoolReportModalOpen}
          onClose={() => setSchoolReportModalOpen(false)}
          conductores={schoolReportData}
          totalConductores={schoolReportData.length}
          paginaActual={schoolReportPage}
          onPageChange={setSchoolReportPage}
          totalPaginas={Math.ceil(schoolReportData.length / 5)}
        />
      )}
      
      <ReasignacionModal
        isOpen={reasignacionModalOpen}
        onClose={() => setReasignacionModalOpen(false)}
        conductor={selectedConductorForReassign}
        guides={guias}
        onConfirm={handleConfirmReasignacion}
      />

      {/* Modal de Gestión de Conductores */}
      {gestionConductoresModalOpen && (
        <GestionConductores
          isOpen={gestionConductoresModalOpen}
          onClose={() => setGestionConductoresModalOpen(false)}
        />
      )}

      {/* Modal de Cabify Histórico */}
      {cabifyHistoricoModalOpen && (
        <CabifyHistoricoModal
          isOpen={cabifyHistoricoModalOpen}
          onClose={() => {
            setCabifyHistoricoModalOpen(false);
            setCabifyHistoricoConductor(null);
          }}
          conductor={cabifyHistoricoConductor}
          semana={selectedWeek}
        />
      )}
    </div>
  )
}
