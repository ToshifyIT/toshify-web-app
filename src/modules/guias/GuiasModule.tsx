import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
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
import GestionConductores from './components/GestionConductores'
import { useAuth } from '../../contexts/AuthContext'
import { useSede } from '../../contexts/SedeContext'
import './GuiasModule.css'
import './GuiasToolbar.css'
import iconNotas from './Iconos/notas.png'

// Helpers copiados de ConductoresModule para consistencia visual
const getEstadoConductorDisplay = (estado: { codigo?: string; descripcion?: string | null } | null | undefined): string => {
  if (!estado) return "N/A";
  const codigo = estado.codigo?.toLowerCase();
  const displayMap: Record<string, string> = {
    'activo': 'Activo',
    'baja': 'Baja',
    'suspendido': 'Suspendido',
    'vacaciones': 'Vacaciones',
    'licencia': 'Licencia',
    'inactivo': 'Inactivo',
  };
  return displayMap[codigo || ''] || estado.codigo || estado.descripcion || "N/A";
};

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
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  
  // Estados para búsqueda dentro de filtros
  const [nombreSearch, setNombreSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [cbuSearch] = useState('')
  const [efectivoSearch, setEfectivoSearch] = useState('')
  const [appSearch, setAppSearch] = useState('')
  const [totalSearch, setTotalSearch] = useState('')

  // Estados para modal de detalles
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [selectedConductor, setSelectedConductor] = useState<ConductorWithRelations | null>(null)
  const [selectedConductorHistory, setSelectedConductorHistory] = useState<any | null>(null)
  const [historyRows, setHistoryRows] = useState<any[]>([])
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [seguimientoRules, setSeguimientoRules] = useState<any[]>([])
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
      const updatedData = await Promise.all(conductoresEscuela.map(async (d) => {
        const baseData = {
            id: d.id,
            nombre: `${d.nombres} ${d.apellidos}`,
            fechaCap: d.fecha_escuela ? format(addHours(new Date(d.fecha_escuela), 12), 'dd/MM/yyyy') : '-',
            semanas2: { promGan: 0, horas: '0', porcOcup: '0%', acept: '-' },
            semanas4: { promGan: 0, horas: '0', porcOcup: '0%', acept: '-' }
        };

        if (!d.fecha_escuela || !d.numero_dni) {
             return {
                 ...baseData,
                 previo: { promGan: 0, horas: '0', porcOcup: '0%', acept: '-' },
                 semanas2: { promGan: 0, horas: '0', porcOcup: '0%', acept: '-' }
             };
        }

        // Función optimizada para buscar métricas (Rango de 60 días en una sola query)
        const getMetricsOptimized = async (datesToQuery: Date[]) => {
            let totalGanancia = 0;
            let totalHoras = 0;
            let totalOcupacion = 0;
            let totalAceptacion = 0;
            let count = 0;

            for (const targetDate of datesToQuery) {
                // Rango de búsqueda: desde 60 días antes hasta el final del día objetivo
                // Esto reemplaza el bucle while día por día
                const endDateISO = endOfDay(targetDate).toISOString();
                const startDateISO = startOfDay(subWeeks(targetDate, 9)).toISOString(); // ~63 días atrás

                const dniOriginal = d.numero_dni ? String(d.numero_dni).trim() : '';
                const cleanDni = dniOriginal.replace(/\./g, '');

                let metrics = null;

                // 1. Búsqueda optimizada por DNI (Rango completo)
                let { data: dataDni } = await supabase
                    .from('cabify_historico')
                    .select('ganancia_total, horas_conectadas, tasa_ocupacion, tasa_aceptacion, fecha_inicio')
                    .eq('dni', dniOriginal)
                    .gte('fecha_inicio', startDateISO)
                    .lte('fecha_inicio', endDateISO)
                    .order('fecha_inicio', { ascending: false }) // El más reciente primero
                    .limit(1)
                    .maybeSingle();

                // 1b. Retry con DNI limpio
                if (!dataDni && cleanDni && cleanDni !== dniOriginal) {
                     const { data: dataDniClean } = await supabase
                        .from('cabify_historico')
                        .select('ganancia_total, horas_conectadas, tasa_ocupacion, tasa_aceptacion, fecha_inicio')
                        .eq('dni', cleanDni)
                        .gte('fecha_inicio', startDateISO)
                        .lte('fecha_inicio', endDateISO)
                        .order('fecha_inicio', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                     
                     if (dataDniClean) dataDni = dataDniClean;
                }

                if (dataDni) {
                    metrics = dataDni;
                } else {
                    // 2. Fallback búsqueda por Nombre (Rango completo)
                    const { data: dataName } = await supabase
                        .from('cabify_historico')
                        .select('ganancia_total, horas_conectadas, tasa_ocupacion, tasa_aceptacion, fecha_inicio')
                        .ilike('nombre', `%${d.nombres}%`) 
                        .ilike('apellido', `%${d.apellidos}%`)
                        .gte('fecha_inicio', startDateISO)
                        .lte('fecha_inicio', endDateISO)
                        .order('fecha_inicio', { ascending: false })
                        .limit(1)
                        .maybeSingle();
                    
                    if (dataName) metrics = dataName;
                }

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
                acept: count > 0 ? totalAceptacion / count : 0
            };
        };

        const fechaEscuelaDate = addHours(new Date(d.fecha_escuela), 12);
        
        // 1. PREVIO A CAPACITACIÓN
        const sundayPrev1 = previousSunday(fechaEscuelaDate);
        const sundayPrev2 = subWeeks(sundayPrev1, 1);
        const metricsPrev = await getMetricsOptimized([sundayPrev1, sundayPrev2]);

        // 2. 2 SEMANAS DESDE CAPACITACIÓN
        const sundayPost1 = nextSunday(fechaEscuelaDate);
        const sundayPost2 = addWeeks(sundayPost1, 1);
        const metricsPost = await getMetricsOptimized([sundayPost1, sundayPost2]);

        const formatM = (m: any) => ({
            promGan: m.promGan,
            horas: m.horas.toFixed(1),
            porcOcup: m.porcOcup.toFixed(0) + '%',
            acept: m.acept.toFixed(0) + '%'
        });

        return {
            ...baseData,
            previo: formatM(metricsPrev),
            semanas2: formatM(metricsPost)
        };
      }));

      setPrecalculatedSchoolReport(updatedData);
      setIsSchoolReportCalculated(true);

    } catch (error) {
      console.error("Error calculating school report metrics (background):", error);
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

      let allNotes: Anotacion[] = [];
      
      if (data) {
        data.forEach((record: any) => {
          if (Array.isArray(record.anotaciones_extra)) {
            // Mapear notas y asegurar que tengan ID (si no tienen, generar uno temporal)
            const notesFromWeek = record.anotaciones_extra.map((nota: any, index: number) => ({
              id: nota.id || `${record.semana}-${index}`,
              texto: nota.texto,
              fecha: nota.fecha, // Asumimos formato string guardado
              usuario: nota.usuario,
              avatarColor: nota.avatarColor || '#3b82f6', // Color por defecto si no existe
              semana: record.semana // Agregamos el campo semana
            }));
            allNotes = [...allNotes, ...notesFromWeek];
          }
        });
      }

      setHistoryNotesData(allNotes);
      setHistoryNotesTotal(allNotes.length);
      setHistoryNotesDriverName(driverName);
      setHistoryNotesDriverDni(driverDni ? String(driverDni) : '');
      setHistoryNotesModalOpen(true);

    } catch (error) {
      console.error('Error fetching history notes:', error);
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
      console.error('Error saving annotations:', error);
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

      Swal.fire({
        title: 'Reasignación Exitosa',
        text: 'El conductor ha sido reasignado correctamente.',
        icon: 'success',
        timer: 2000,
        showConfirmButton: false
      });

      // Recargar conductores del guía actual para reflejar que se fue
      if (selectedGuiaId) {
        loadDrivers(selectedGuiaId);
        loadCurrentWeekMetrics(selectedGuiaId);
      }

    } catch (error) {
      console.error('Error reassigning driver:', error);
      Swal.fire('Error', 'No se pudo completar la reasignación', 'error');
    }
  };

  const handleViewHistory = async (driver: any) => {
    setSelectedConductorHistory(driver);
    setShowHistoryModal(true);
    setHistoryRows([]);

    // Helper for currency parsing (same as in fetchDriversData)
    const parseCustomCurrency = (val: any) => {
      if (val === null || val === undefined) return 0;
      if (typeof val === 'number') return val;
      
      let str = String(val).trim();
      
      // Remove currency symbols and other non-numeric chars (except . , and -)
      str = str.replace(/[^0-9.,-]/g, '');
      
      if (str === '') return 0;

      if (str.includes('.') && !str.includes(',') && /^\d+\.\d{1,2}$/.test(str)) {
         return parseFloat(str);
      }
      const clean = str.replace(/\./g, '').replace(',', '.');
      const parsed = parseFloat(clean);
      return isNaN(parsed) ? 0 : parsed;
    };

    try {
      // 1. Get history rows from guias_historial_semanal
      const { data: historyData, error: historyError } = await supabase
        .from('guias_historial_semanal')
        .select('*')
        .eq('id_conductor', driver.id)
        .order('semana', { ascending: false });

      if (historyError) throw historyError;

      if (historyData) {
        const rows = historyData.map(d => {
          const dbApp = parseCustomCurrency(d.app);
          const dbEfectivo = parseCustomCurrency(d.efectivo);
          const dbTotal = parseCustomCurrency(d.total);
          const app = dbApp;
          const efectivo = dbEfectivo;
          const total = dbTotal > 0 ? dbTotal : (app + efectivo);
           
           let seguimientoLabel = 'SEMANAL';
           const rawSeguimiento = (d as any).seguimiento;
           if (rawSeguimiento && typeof rawSeguimiento === 'string' && rawSeguimiento.trim() !== '') {
             seguimientoLabel = rawSeguimiento.trim().toUpperCase();
           } else if (seguimientoRules && seguimientoRules.length > 0) {
             for (const rule of seguimientoRules) {
               const desde = Number(rule.desde || 0);
               const hasta = rule.hasta !== null && rule.hasta !== undefined ? Number(rule.hasta) : Infinity;
               if (total >= desde && total <= hasta) {
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
             efectivo: efectivo,
             app: app,
             total: total,
             llamada: d.fecha_llamada ? 'Realizada' : 'Pendiente',
             fechaLlamada: d.fecha_llamada ? format(new Date(d.fecha_llamada), 'dd/MM/yyyy') : null,
             accionImp: accionNombre,
             seguimiento: seguimientoLabel,
             notas: d.anotaciones_extra || []
           };
        });
        setHistoryRows(rows);
      }
    } catch (err) {
      console.error("Error loading history:", err);
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
      const { data, error } = await supabase.from('guias_acciones_implementadas').select('*').order('id', { ascending: true });
      if (error) throw error;
      if (data) {
        setAccionesImplementadas(data);
      }
    } catch (err) {
      console.error("Error loading acciones implementadas:", err);
    }
  };

  const loadSeguimientoRules = async () => {
    try {
      const { data, error } = await supabase
        .from('guias_seguimiento')
        .select('*')
        .order('desde', { ascending: true });
      if (error) throw error;
      if (data) {
        setSeguimientoRules(data);
      }
    } catch (err) {
      console.error("Error loading seguimiento rules:", err);
    }
  };

  useEffect(() => {
    if (urlGuiaId && guias.some(g => g.id === urlGuiaId)) {
      setSelectedGuiaId(urlGuiaId)
    }
  }, [urlGuiaId, guias])

  useEffect(() => {
    if (selectedGuiaId) {
      loadDrivers(selectedGuiaId)
    } else {
      setDrivers([])
    }
  }, [selectedGuiaId, selectedWeek, sedeActualId])

  useEffect(() => {
    if (selectedGuiaId) {
      loadCurrentWeekMetrics(selectedGuiaId)
    } else {
      setCurrentWeekDrivers([])
    }
  }, [selectedGuiaId, sedeActualId])

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
            asignaciones_conductores (
              horario,
              asignaciones (
                estado,
                horario,
                vehiculos (id, patente, marca, modelo)
              )
            )
          )
        `)
        .eq('id_guia', guiaId)
        .eq('semana', targetWeek);

      // SOLO en la semana actual filtramos por asignación activa.
      // En semanas pasadas queremos ver TODO el historial, incluso si ya no tienen asignación hoy.
      if (isCurrentWeek) {
        query = query.filter('conductores.asignaciones_conductores.asignaciones.estado', 'in', '("activo","activa")');
      }

      const { data: historialData, error: historialError } = await query.order("created_at", { ascending: false });

      if (historialError) throw historialError;

      // Cargar datos de Cabify para cruce de facturación
      const cabifyDriversMapByDni = new Map();
      const cabifyDriversMapByName = new Map();
      
      try {
        const [yearStr, weekStr] = targetWeek.split('-W');
        if (yearStr && weekStr) {
          const year = parseInt(yearStr);
          const week = parseInt(weekStr);
          // 4 de enero siempre cae en la primera semana ISO o cerca
          const baseDate = new Date(year, 0, 4);
          const weekDate = setISOWeek(baseDate, week);
          // Ajuste para coincidir con CabifyIntegrationService:
          // Usar fechas UTC puras (00:00 UTC Lunes a 23:59:59 UTC Domingo)
          const mondayLocal = startOfISOWeek(weekDate);
          const sundayLocal = endOfISOWeek(weekDate);

          const startDate = new Date(Date.UTC(
            mondayLocal.getFullYear(),
            mondayLocal.getMonth(),
            mondayLocal.getDate(),
            0, 0, 0, 0
          ));

          const endDate = new Date(Date.UTC(
            sundayLocal.getFullYear(),
            sundayLocal.getMonth(),
            sundayLocal.getDate(),
            23, 59, 59, 999
          ));

          // Nueva lógica: Consultar directamente cabify_historico
          const { data: cabifyDataRaw, error: cabifyError } = await supabase
            .from('cabify_historico')
            .select('dni, nombre, apellido, cobro_app, cobro_efectivo')
            .gte('fecha_inicio', startDate.toISOString())
            .lte('fecha_inicio', endDate.toISOString());

           if (!cabifyError && cabifyDataRaw && cabifyDataRaw.length > 0) {
             cabifyDataRaw.forEach(d => {
               const cobroApp = Number(d.cobro_app) || 0;
               const cobroEfectivo = Number(d.cobro_efectivo) || 0;

               // 1. Map by DNI
               if (d.dni) {
                 const dni = d.dni.replace(/\./g, '').trim();
                 if (!cabifyDriversMapByDni.has(dni)) {
                   cabifyDriversMapByDni.set(dni, { cobroApp: 0, cobroEfectivo: 0 });
                 }
                 const entry = cabifyDriversMapByDni.get(dni);
                 entry.cobroApp += cobroApp;
                 entry.cobroEfectivo += cobroEfectivo;
               }

               // 2. Map by Name (nombre + apellido)
               const fullName = `${d.nombre || ''} ${d.apellido || ''}`.trim().toLowerCase();
               if (fullName) {
                 if (!cabifyDriversMapByName.has(fullName)) {
                   cabifyDriversMapByName.set(fullName, { cobroApp: 0, cobroEfectivo: 0 });
                 }
                 const entry = cabifyDriversMapByName.get(fullName);
                 entry.cobroApp += cobroApp;
                 entry.cobroEfectivo += cobroEfectivo;
               }
             });
          }
        }
      } catch {
        // Cabify data cross-reference failed silently
      }

      const vehiculosHistorialCountMap = new Map<string, number>();
      const prevWeekAssignmentsMap = new Map<string, { total: number; diurno: number; nocturno: number; cargo: number }>();
      const prevWeekFinancialMap = new Map<string, { app: any; efectivo: any; total: any }>();
      let prevWeekLabel: string | null = null;
      try {
        const conductorIds = Array.from(
          new Set(
            (historialData || [])
              .map((h: any) => h.id_conductor)
              .filter((id: string | null) => !!id)
          )
        );

        if (conductorIds.length > 0) {
          const { data: vehiculosHistorial } = await supabase
            .from('asignaciones_conductores')
            .select(`
              conductor_id,
              asignaciones (
                vehiculos (id, patente, marca, modelo, anio)
              )
            `)
            .in('conductor_id', conductorIds);

          if (vehiculosHistorial) {
            const tmpMap = new Map<string, Set<string>>();

            vehiculosHistorial.forEach((ac: any) => {
              const conductorId = ac.conductor_id as string | null;
              const veh = ac.asignaciones?.vehiculos;
              if (!conductorId || !veh) return;

              const key = veh.id || veh.patente || `${veh.marca || ''}-${veh.modelo || ''}-${veh.anio || ''}`;
              if (!key) return;

              if (!tmpMap.has(conductorId)) {
                tmpMap.set(conductorId, new Set<string>());
              }
              tmpMap.get(conductorId)!.add(key);
            });

            tmpMap.forEach((set, conductorId) => {
              vehiculosHistorialCountMap.set(conductorId, set.size);
            });
          }
        }

        if (conductorIds.length > 0) {
          const [yearStr, weekStr] = targetWeek.split('-W');
          if (yearStr && weekStr) {
            const year = parseInt(yearStr);
            const week = parseInt(weekStr);
            const baseDate = new Date(year, 0, 4);
            const weekDate = setISOWeek(baseDate, week);
            const mondayLocal = startOfISOWeek(weekDate);
            const sundayLocal = endOfISOWeek(weekDate);

            const prevMondayLocal = subWeeks(mondayLocal, 1);
            const prevSundayLocal = subWeeks(sundayLocal, 1);
            prevWeekLabel = format(prevMondayLocal, "R-'W'II");

            const prevStartDate = new Date(Date.UTC(
              prevMondayLocal.getFullYear(),
              prevMondayLocal.getMonth(),
              prevMondayLocal.getDate(),
              0, 0, 0, 0
            ));

            const prevEndDate = new Date(Date.UTC(
              prevSundayLocal.getFullYear(),
              prevSundayLocal.getMonth(),
              prevSundayLocal.getDate(),
              23, 59, 59, 999
            ));

            const baseSelect = `
              id,
              conductor_id,
              horario,
              estado,
              asignaciones!inner (
                id,
                codigo,
                estado,
                horario,
                modalidad,
                fecha_inicio,
                fecha_fin,
                sede_id
              )
            `;
            // A: fecha_fin IS NULL y fecha_inicio <= finSemana
            let qA: any = supabase
              .from('asignaciones_conductores')
              .select(baseSelect)
              .in('conductor_id', conductorIds)
              .lte('asignaciones.fecha_inicio', prevEndDate.toISOString())
              .is('asignaciones.fecha_fin', null);
            qA = aplicarFiltroSede(qA, 'asignaciones.sede_id');

            // B: fecha_fin >= inicioSemana y fecha_inicio <= finSemana
            let qB: any = supabase
              .from('asignaciones_conductores')
              .select(baseSelect)
              .in('conductor_id', conductorIds)
              .lte('asignaciones.fecha_inicio', prevEndDate.toISOString())
              .gte('asignaciones.fecha_fin', prevStartDate.toISOString());
            qB = aplicarFiltroSede(qB, 'asignaciones.sede_id');

            const [resA, resB] = await Promise.all([qA, qB]);
            if (resA.error) {
              console.error('GuiasModule: error consultando asignaciones (A - fin NULL)', {
                message: (resA.error as any).message,
                details: (resA.error as any).details,
                hint: (resA.error as any).hint
              });
            }
            if (resB.error) {
              console.error('GuiasModule: error consultando asignaciones (B - fin >= inicioSemana)', {
                message: (resB.error as any).message,
                details: (resB.error as any).details,
                hint: (resB.error as any).hint
              });
            }
            const prevAssignmentsRaw = [...(resA.data || []), ...(resB.data || [])];
            // De-duplicar por (asignacion_id + conductor_id) si es posible; si no, por (id + conductor_id)
            const seen = new Set<string>();
            const prevAssignments = prevAssignmentsRaw.filter((ac: any) => {
              const key = `${ac.asignaciones?.id || ac.id}-${ac.conductor_id}`;
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });

            const prevWeekAssignmentsDetailMap = new Map<string, any[]>();
            if (prevAssignments) {
              prevAssignments.forEach((ac: any) => {
                const conductorId = ac.conductor_id as string | null;
                if (!conductorId) return;
                const asignacion = ac.asignaciones;
                if (!asignacion) return;

                const currentStats = prevWeekAssignmentsMap.get(conductorId) || { total: 0, diurno: 0, nocturno: 0, cargo: 0 };
                currentStats.total += 1;

                const modalidadRaw = asignacion.horario || asignacion.modalidad || '';
                const modalidad = modalidadRaw ? modalidadRaw.toString().toUpperCase() : '';

                if (modalidad === 'TURNO') {
                  const hRaw = ac.horario || '';
                  const h = hRaw ? hRaw.toString().toLowerCase() : '';
                  if (h === 'diurno' || h === 'd') {
                    currentStats.diurno += 1;
                  } else if (h === 'nocturno' || h === 'n') {
                    currentStats.nocturno += 1;
                  } else {
                    currentStats.cargo += 1;
                  }
                } else {
                  currentStats.cargo += 1;
                }

                prevWeekAssignmentsMap.set(conductorId, currentStats);
                
                const detail = {
                  asignacion_id: asignacion.id,
                  codigo: asignacion.codigo,
                  modalidad: asignacion.horario || asignacion.modalidad || null,
                  estado: asignacion.estado,
                  fecha_inicio: asignacion.fecha_inicio,
                  fecha_fin: asignacion.fecha_fin,
                  turno_conductor: ac.horario
                };
                const arr = prevWeekAssignmentsDetailMap.get(conductorId) || [];
                arr.push(detail);
                prevWeekAssignmentsDetailMap.set(conductorId, arr);
              });
            }

            // Consultar totales (app/efectivo/total) de la semana anterior por conductor
            if (prevWeekLabel && conductorIds.length > 0) {
              const altPrevWeekLabel = prevWeekLabel.replace('W', '');
              const { data: prevHist, error: prevHistError } = await supabase
                .from('guias_historial_semanal')
                .select('id_conductor, app, efectivo, total')
                .or(`semana.eq.${prevWeekLabel},semana.eq.${altPrevWeekLabel}`)
                .eq('id_guia', guiaId)
                .in('id_conductor', conductorIds);
              
              if (prevHistError) {
                console.error('GuiasModule: error consultando totales de semana anterior', {
                  message: (prevHistError as any).message,
                  details: (prevHistError as any).details,
                  hint: (prevHistError as any).hint
                });
              } else if (prevHist && prevHist.length > 0) {
                prevHist.forEach((row: any) => {
                  if (row?.id_conductor) {
                    prevWeekFinancialMap.set(row.id_conductor, {
                      app: row.app,
                      efectivo: row.efectivo,
                      total: row.total
                    });
                  }
                });
              }
              const missingConductorIds = conductorIds.filter(id => !prevWeekFinancialMap.has(id));
              if (missingConductorIds.length > 0) {
                const { data: prevHistAny } = await supabase
                  .from('guias_historial_semanal')
                  .select('id_conductor, app, efectivo, total, id_guia')
                  .or(`semana.eq.${prevWeekLabel},semana.eq.${altPrevWeekLabel}`)
                  .in('id_conductor', missingConductorIds);
                if (prevHistAny && prevHistAny.length > 0) {
                  const parseAmt = (v: any) => {
                    if (v === null || v === undefined) return 0;
                    if (typeof v === 'number') return v;
                    const s = String(v).trim();
                    if (s.includes('.') && !s.includes(',') && /^\d+\.\d{1,2}$/.test(s)) return parseFloat(s);
                    const clean = s.replace(/\./g, '').replace(',', '.');
                    const n = parseFloat(clean);
                    return isNaN(n) ? 0 : n;
                  };
                  const bestByConductor = new Map<string, { app: any; efectivo: any; total: any }>();
                  prevHistAny.forEach((row: any) => {
                    const idc = row?.id_conductor;
                    if (!idc) return;
                    const candidate = { app: row.app, efectivo: row.efectivo, total: row.total };
                    const current = bestByConductor.get(idc);
                    if (!current || parseAmt(candidate.total) >= parseAmt(current.total)) {
                      bestByConductor.set(idc, candidate);
                    }
                  });
                  bestByConductor.forEach((v, k) => {
                    if (!prevWeekFinancialMap.has(k)) {
                      prevWeekFinancialMap.set(k, v);
                    }
                  });
                }
              }
            }

            console.log('GuiasModule: resumen asignaciones semana anterior', {
              guiaId,
              semanaReferencia: targetWeek,
              semanaBuscada: prevWeekLabel,
              rangoSemanaBuscada: {
                inicio: prevStartDate.toISOString(),
                fin: prevEndDate.toISOString()
              },
              conductoresEvaluados: conductorIds.length,
              asignacionesEncontradas: prevAssignments?.length || 0
            });
            
            // Log de diagnóstico: top 5 asignaciones por primer conductor (si existen)
            const firstConductorId = conductorIds[0];
            if (firstConductorId) {
              console.log('GuiasModule: muestra asignaciones solapadas (primer conductor)', {
                conductorId: firstConductorId,
                semanaBuscada: prevWeekLabel,
                detalles: (prevWeekAssignmentsDetailMap.get(firstConductorId) || []).slice(0, 5)
              });
            }
          }
        }
      } catch {
      }

      // Procesar conductores desde el historial
      if (historialData && historialData.length > 0) {
        const processedDrivers: any[] = [];
        const updatesToPerform: any[] = [];
        
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
                modalidad: asignacionActiva.asignaciones.horario, // 'TURNO' o 'CARGO'
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
            matchingSeguimientoRules = seguimientoRules.filter((rule: any) => {
              let sub = (rule.sub_rango_nombre || '').toString().toUpperCase().trim();
              if (sub) {
                sub = sub.replace(/[_\s]+/g, ' ').trim();
                if (sub === 'A CARGO') sub = 'CARGO';
              }
              return !sub || sub === dominantTurno;
            });
          }

          const totalPrevWeek = typeof prevWeekStats.total === 'number'
            ? prevWeekStats.total
            : (prevWeekStats.diurno + prevWeekStats.nocturno + prevWeekStats.cargo);
          
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

          // Helper para parsear moneda con formato ES-AR (puntos miles, coma decimal)
          // REGLA USUARIO: "consideres que la , es el separador de decimal y que el punto es el separador de centesimas" (interpretado como miles)
          const parseCustomCurrency = (val: any) => {
            if (val === null || val === undefined) return 0;
            if (typeof val === 'number') return val;
            const str = String(val).trim();
            
            // Heurística de seguridad: Si tiene punto pero no coma, y parece un float estándar (1 o 2 decimales)
            // asumimos que es formato DB/JS estándar ("1234.56") para evitar multiplicar por 1000.
            // Si tiene 3 decimales ("1.234"), asumimos que es miles según regla del usuario.
            if (str.includes('.') && !str.includes(',') && /^\d+\.\d{1,2}$/.test(str)) {
               return parseFloat(str);
            }

            // Eliminar puntos de miles y reemplazar coma por punto para formato estándar JS
            const clean = str.replace(/\./g, '').replace(',', '.');
            const parsed = parseFloat(clean);
            return isNaN(parsed) ? 0 : parsed;
          };

          // Lógica de cruce con Cabify (Facturación y Efectivo)
          // Usamos el valor de base de datos por defecto (para semanas pasadas o si falla la API)
          let facturacionApp = parseCustomCurrency(historial.app);
          let facturacionEfectivo = parseCustomCurrency(historial.efectivo);
          let facturacionTotal = parseCustomCurrency(historial.total);
          let cabifyData = null;

          const dni = baseConductor.numero_dni?.replace(/\./g, '').trim();
          const nombreCompleto = `${baseConductor.nombres || ''} ${baseConductor.apellidos || ''}`.trim().toLowerCase();

          // Solo buscamos datos frescos de Cabify si estamos en la semana actual
          if (isCurrentWeek) {
            if (dni && cabifyDriversMapByDni.has(dni)) {
              cabifyData = cabifyDriversMapByDni.get(dni);
              facturacionApp = parseCustomCurrency(cabifyData.cobroApp);
              facturacionEfectivo = parseCustomCurrency(cabifyData.cobroEfectivo);
            } else if (cabifyDriversMapByName.has(nombreCompleto)) {
              cabifyData = cabifyDriversMapByName.get(nombreCompleto);
              facturacionApp = parseCustomCurrency(cabifyData.cobroApp);
              facturacionEfectivo = parseCustomCurrency(cabifyData.cobroEfectivo);
            }
            // Recalculamos total si estamos en semana actual
            facturacionTotal = Number((facturacionApp + facturacionEfectivo).toFixed(2));
          }

          baseConductor.facturacion_app = facturacionApp;
          baseConductor.facturacion_efectivo = facturacionEfectivo;
          baseConductor.facturacion_total = facturacionTotal;
          baseConductor.cabifyData = cabifyData;

          // Cálculo parseado de app/efectivo/total de la semana anterior (monetario) para logging
          let prevFinancialRow = prevWeekFinancialMap.get(conductor.id);
          // Fallback puntual por conductor: si no hay datos aún, buscar directamente por id_conductor + semana
          if (!prevFinancialRow && prevWeekLabel) {
            try {
              const altPrevWeekLabel = prevWeekLabel.replace('W', '');
              const { data: singlePrev } = await supabase
                .from('guias_historial_semanal')
                .select('app, efectivo, total')
                .eq('id_conductor', conductor.id)
                .or(`semana.eq.${prevWeekLabel},semana.eq.${altPrevWeekLabel}`)
                .maybeSingle();
              if (singlePrev) {
                prevFinancialRow = {
                  app: singlePrev.app,
                  efectivo: singlePrev.efectivo,
                  total: singlePrev.total
                };
                prevWeekFinancialMap.set(conductor.id, prevFinancialRow);
              }
            } catch {
              // Ignorar silenciosamente fallback fallido
            }
          }
          let prevAppParsed = 0;
          let prevEfectivoParsed = 0;
          let prevTotalParsed = 0;
          if (prevFinancialRow) {
            prevAppParsed = parseCustomCurrency(prevFinancialRow.app);
            prevEfectivoParsed = parseCustomCurrency(prevFinancialRow.efectivo);
            prevTotalParsed = parseCustomCurrency(prevFinancialRow.total);
          }

          let prevSeguimientoRule: any | null = null;
          if (matchingSeguimientoRules && matchingSeguimientoRules.length > 0) {
            for (const rule of matchingSeguimientoRules) {
              const desde = Number(rule.desde || 0);
              const hasHasta = rule.hasta !== null && rule.hasta !== undefined;
              const hasta = hasHasta ? Number(rule.hasta) : null;
              const matchesLower = prevTotalParsed >= desde;
              const matchesUpper = hasHasta ? prevTotalParsed <= (hasta as number) : true;
              if (matchesLower && matchesUpper) {
                prevSeguimientoRule = rule;
                break;
              }
            }
          }

          baseConductor.prev_week_total_monetario = prevTotalParsed;
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

          console.log('GuiasModule: asignaciones semana anterior por conductor', {
            guiaId,
            semanaReferencia: targetWeek,
            semanaBuscada: prevWeekLabel,
            conductorId: conductor.id,
            nombre: `${conductor.nombres || ''} ${conductor.apellidos || ''}`.trim(),
            created_at_conductor: conductor.created_at,
            stats: prevWeekStats,
            totalSemanaAnterior: totalPrevWeek,
            totalMonetarioSemanaAnterior: prevTotalParsed,
            totalMonetarioSemanaAnteriorApp: prevAppParsed,
            totalMonetarioSemanaAnteriorEfectivo: prevEfectivoParsed,
            turnoDominante: dominantTurno,
            reglasSubRangoCoincidentes: (matchingSeguimientoRules || []).map((r: any) => ({
              id: r.id,
              rango_nombre: r.rango_nombre,
              sub_rango_nombre: r.sub_rango_nombre,
              desde: r.desde,
              hasta: r.hasta,
              color: r.color
            })),
            reglaSeleccionadaPorTotalMonetario: prevSeguimientoRule
          });

          // Lógica de actualización automática de las columnas 'app', 'efectivo' y 'total'
          // Solo si estamos en la semana actual
          if (isCurrentWeek) {
            const updates: any = {};
            let needsUpdate = false;

            // Verificamos cambio en APP (comparando numéricamente)
            if (Math.abs(parseCustomCurrency(historial.app) - facturacionApp) > 0.01) {
               updates.app = facturacionApp;
               needsUpdate = true;
            }

            // Verificamos cambio en EFECTIVO (comparando numéricamente)
            if (Math.abs(parseCustomCurrency(historial.efectivo) - facturacionEfectivo) > 0.01) {
               updates.efectivo = facturacionEfectivo;
               needsUpdate = true;
            }

            // Verificamos cambio en TOTAL (comparando numéricamente)
            if (Math.abs(parseCustomCurrency(historial.total) - facturacionTotal) > 0.01) {
               updates.total = facturacionTotal;
               needsUpdate = true;
            }

            if (needsUpdate) {
              updatesToPerform.push({
                id: historial.id,
                ...updates
              });
            }
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
      } else {
        return [];
      }
    } catch {
      return [];
    }
  }

  const loadDrivers = async (guiaId: string) => {
    try {
      setLoadingDrivers(true);
      const data = await fetchDriversData(guiaId, selectedWeek);
      setDrivers(data);
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
      // A. Verificar si ya hay datos para la semana actual
      const { count, error: countError } = await supabase
        .from('guias_historial_semanal')
        .select('*', { count: 'exact', head: true })
        .eq('semana', currentWeek);

      if (countError) throw countError;

      // Si ya hay registros significativos (> 0), asumimos que la semana ya fue inicializada.
      // Podríamos poner un umbral bajo, pero >0 es lo más seguro para no duplicar.
      if (count !== null && count > 0) {
        return;
      }

      // B. Calcular semana anterior
      // Formato esperado "YYYY-Www"
      const [yearStr, weekStr] = currentWeek.split('-W');
      const year = parseInt(yearStr);
      const week = parseInt(weekStr);
      
      // Usar date-fns para restar una semana de forma segura
      // Creamos una fecha arbitraria en la semana actual
      const currentWeekDate = setISOWeek(new Date(year, 0, 4), week);
      const prevWeekDate = addHours(currentWeekDate, -24 * 7); // Restar 7 días
      const prevWeek = format(prevWeekDate, "R-'W'II");
      


      // C. Obtener candidatos de la semana anterior
      // - Semana anterior
      // - Conductores ACTIVOS (estado_id específico)
      // - Con asignación activa (vehículo)
      // Nota: Filtramos por estado_id en la query principal y luego verificaremos asignación
      const { data: prevData, error: prevError } = await supabase
        .from('guias_historial_semanal')
        .select(`
          id_conductor,
          id_guia,
          fecha_llamada,
          conductores!inner (
            id,
            estado_id,
            asignaciones_conductores!inner (
              asignaciones!inner (
                estado
              )
            )
          )
        `)
        .eq('semana', prevWeek)
        .eq('conductores.estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2'); // ID Activo

      if (prevError) throw prevError;

      if (!prevData || prevData.length === 0) {
        return;
      }

      // D. Filtrar y Preparar nuevos registros
      const newRecords = prevData
        .filter((item: any) => {
          // Validar asignación activa
          const hasActiveAsignacion = item.conductores.asignaciones_conductores.some((ac: any) => 
            ac.asignaciones?.estado === 'activo' || ac.asignaciones?.estado === 'activa'
          );
          return hasActiveAsignacion;
        })
        .map((item: any) => ({
          id_conductor: item.id_conductor,
          id_guia: item.id_guia, // Mantenemos el mismo guía
          semana: currentWeek,
          id_accion_imp: item.id_accion_imp || 1, // Persistir acción o usar default
          fecha_llamada: item.fecha_llamada,
          
          created_at: new Date().toISOString()
        }));

      if (newRecords.length === 0) {
        return;
      }

      // E. Insertar masivamente
      const { error: insertError } = await supabase
        .from('guias_historial_semanal')
        .insert(newRecords);

      if (insertError) throw insertError;

      // Mostrar notificación discreta
      const Toast = Swal.mixin({
        toast: true,
        position: 'top-end',
        showConfirmButton: false,
        timer: 3000,
        timerProgressBar: true
      });
      Toast.fire({
        icon: 'success',
        title: `Se inició la semana con ${newRecords.length} conductores`
      });

    } catch {
      // No bloqueamos la UI, la distribución continua servirá de fallback
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
      if (guias.length === 0) {
        return
      }
      const { data: assignedDrivers, error: assignedError } = await aplicarFiltroSede(supabase
        .from('conductores')
        .select('id, id_guia')
        .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2')
        .eq('guia_asignado', true))

      if (assignedError) {
        return
      }
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

      if (unassignedError) {
        return
      }

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

      if (unassignedDrivers.length === 0) {
        return
      }

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

      if (updates.length > 0) {
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
        if (errors.length > 0) {
          throw errors[0];
        }

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
        
        // Recargar datos para reflejar cambios
        if (selectedGuiaId) {
             loadDrivers(selectedGuiaId);
        }
      }

    } catch {
      // Distribution failed
    }
  }

  const loadGuias = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('user_profiles')
        .select(`
          *,
          roles!inner (
            name,
            description
          )
        `)
        .eq('roles.name', 'guia')
        .order('created_at', { ascending: false })

      if (error) throw error

      const formattedGuias: Guia[] = data.map((item: any) => ({
        id: item.id,
        email: item.email,
        full_name: item.full_name,
        is_active: item.is_active,
        created_at: item.created_at,
        role_name: item.roles?.name,
        role_description: item.roles?.description
      }))

      setGuias(formattedGuias)
      
      const initialId = urlGuiaId && formattedGuias.some(g => g.id === urlGuiaId) 
        ? urlGuiaId 
        : (formattedGuias.length > 0 ? formattedGuias[0].id : null)
      
      if (initialId) {
        setSelectedGuiaId(initialId)
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
      if (info.modalidad === 'CARGO') {
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

  const turnosUnicos = ['DIURNO', 'NOCTURNO', 'SIN_PREFERENCIA', 'A_CARGO'];
  const turnoLabels: Record<string, string> = {
    'DIURNO': 'Diurno',
    'NOCTURNO': 'Nocturno',
    'SIN_PREFERENCIA': 'Sin Preferencia',
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

  const toggleEfectivoFilter = (val: string) => {
    setEfectivoFilter(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const toggleAppFilter = (val: string) => {
    setAppFilter(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const toggleTotalFilter = (val: string) => {
    setTotalFilter(prev =>
      prev.includes(val) ? prev.filter(v => v !== val) : [...prev, val]
    );
  };

  const filteredDrivers = useMemo(() => {
    let result = drivers;

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

    const formatCurrencyForFilter = (val: number | undefined | null) => {
      // Misma lógica que en cell para consistencia
      if (val && val > 0) {
        return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
      }
      if (selectedWeek === getCurrentWeek() && !(activeStatFilter)) { // Simplificación, revisar contexto
         // Aquí hay un detalle: en cell usamos row.original.cabifyData para decidir si mostrar N/A
         // Pero en filter no tenemos row fácilmente accesible si no lo pasamos.
         // Sin embargo, filteredDrivers itera sobre drivers (que es la data).
         // Vamos a usar una lógica simplificada: formatear el valor numérico.
      }
      if (val === undefined || val === null) return "-";
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
    };

    if (efectivoFilter.length > 0) {
      result = result.filter(c => {
         const val = formatCurrencyForFilter((c as any).facturacion_efectivo);
         return efectivoFilter.includes(val);
      });
    }

    if (appFilter.length > 0) {
      result = result.filter(c => {
         const val = formatCurrencyForFilter((c as any).facturacion_app);
         return appFilter.includes(val);
      });
    }

    if (totalFilter.length > 0) {
      result = result.filter(c => {
         const val = formatCurrencyForFilter((c as any).facturacion_total);
         return totalFilter.includes(val);
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
            const total = Number(d.facturacion_total) || 0;
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

    return result;
  }, [drivers, nombreFilter, cbuFilter, estadoFilter, turnoFilter, categoriaFilter, asignacionFilter, activeStatFilter, selectedWeek, seguimientoRules, efectivoFilter, appFilter, totalFilter]);

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

  const formatCurrencyValue = (val: number | undefined | null) => {
      if (val === undefined || val === null) return "-";
      return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
  };

  const uniqueEfectivo = useMemo(() => {
    const values = drivers.map(c => formatCurrencyValue(c.facturacion_efectivo));
    return [...new Set(values)].sort();
  }, [drivers]);

  const uniqueApp = useMemo(() => {
    const values = drivers.map(c => formatCurrencyValue(c.facturacion_app));
    return [...new Set(values)].sort();
  }, [drivers]);

  const uniqueTotal = useMemo(() => {
    const values = drivers.map(c => formatCurrencyValue(c.facturacion_total));
    return [...new Set(values)].sort();
  }, [drivers]);

  const efectivoFiltrados = useMemo(() => {
    if (!efectivoSearch) return uniqueEfectivo;
    return uniqueEfectivo.filter(v => v.toLowerCase().includes(efectivoSearch.toLowerCase()));
  }, [uniqueEfectivo, efectivoSearch]);

  const appFiltrados = useMemo(() => {
    if (!appSearch) return uniqueApp;
    return uniqueApp.filter(v => v.toLowerCase().includes(appSearch.toLowerCase()));
  }, [uniqueApp, appSearch]);

  const totalFiltrados = useMemo(() => {
    if (!totalSearch) return uniqueTotal;
    return uniqueTotal.filter(v => v.toLowerCase().includes(totalSearch.toLowerCase()));
  }, [uniqueTotal, totalSearch]);

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
                setOpenColumnFilter(openColumnFilter === 'nombre' ? null : 'nombre');
              }}
              title="Filtrar por nombre"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'nombre' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
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
          return (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <strong style={{ textTransform: 'uppercase' }}>{`${row.original.nombres} ${row.original.apellidos}`}</strong>
              {label && (
                <span
                  className="dt-badge dt-badge-gray badge-no-dot"
                  style={{ fontSize: '11px', marginTop: 4, alignSelf: 'flex-start' }}
                >
                  {label}
                </span>
              )}
              {dni && (
                <span
                  className="dt-badge dt-badge-gray badge-with-dot"
                  style={{ fontSize: '11px', marginTop: 4, alignSelf: 'flex-start' }}
                >
                  {dni}
                </span>
              )}
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
                setOpenColumnFilter(openColumnFilter === 'turno' ? null : 'turno');
              }}
              title="Filtrar por turno"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'turno' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
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
            if (asignacionInfo.modalidad === 'CARGO') return 'A';
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
          const asignacionInfo = (row.original as any).asignacion_info;
          
          if (asignacionInfo) {
            if (asignacionInfo.modalidad === 'CARGO') {
              return (
                <span className="dt-badge dt-badge-purple badge-with-dot">
                  A
                </span>
              );
            }
            const turno = asignacionInfo.turno_conductor?.toLowerCase();
            if (turno === 'diurno') {
              return (
                <span className="dt-badge dt-badge-orange badge-with-dot">
                  D
                </span>
              );
            }
            if (turno === 'nocturno') {
              return (
                <span className="dt-badge dt-badge-blue badge-with-dot">
                  N
                </span>
              );
            }
            if (turno) {
              return (
                <span className="dt-badge dt-badge-gray badge-with-dot">
                  {turno.charAt(0).toUpperCase()}
                </span>
              );
            }
          }

          const preferenciaRaw = (row.original as any).preferencia_turno;
          const preferencia = preferenciaRaw ? preferenciaRaw.toString().toLowerCase() : '';

          let label = 'S';
          let badgeClass = 'dt-badge dt-badge-gray badge-with-dot';

          if (preferencia === 'diurno' || preferencia === 'mañana') {
            label = 'D';
            badgeClass = 'dt-badge dt-badge-orange badge-with-dot';
          } else if (preferencia === 'nocturno' || preferencia === 'noche') {
            label = 'N';
            badgeClass = 'dt-badge dt-badge-blue badge-with-dot';
          } else if (preferencia && preferencia !== 'sin preferencia') {
            label = preferencia.charAt(0).toUpperCase();
          }

          return (
            <span className={badgeClass}>
              {label}
            </span>
          );
        },
        filterFn: (row: any, id: string, filterValue: any) => {
          if (!filterValue.length) return true
          const val = row.getValue(id) as string
          return filterValue.includes(val)
        },
        size: 90,
      }] : []),

      {
        accessorKey: "conductores_estados.codigo",
        header: () => (
          <div className="dt-column-filter">
            <span>Estado {estadoFilter.length > 0 && `(${estadoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${estadoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenColumnFilter(openColumnFilter === 'estado' ? null : 'estado');
              }}
              title="Filtrar por estado"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'estado' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <div className="dt-excel-filter-list">
                  {uniqueEstados.map(([codigo, descripcion]) => (
                    <label key={codigo} className={`dt-column-filter-checkbox ${estadoFilter.includes(codigo) ? 'selected' : ''}`}>
                      <input
                        type="checkbox"
                        checked={estadoFilter.includes(codigo)}
                        onChange={() => toggleEstadoFilter(codigo)}
                      />
                      <span>{descripcion}</span>
                    </label>
                  ))}
                </div>
                {estadoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => setEstadoFilter([])}
                  >
                    Limpiar ({estadoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => {
          const estado = row.original.conductores_estados;
          if (!estado?.codigo) return "-";
          const codigoLower = estado.codigo.toLowerCase();

          let badgeClass = "dt-badge dt-badge-solid-blue badge-no-dot";
          if (codigoLower === "baja") {
            badgeClass = "dt-badge dt-badge-solid-gray badge-no-dot";
          } else if (codigoLower === "activo") {
            badgeClass = "dt-badge dt-badge-solid-green badge-no-dot";
          }

          return <span className={badgeClass}>{getEstadoConductorDisplay(estado)}</span>;
        },
        enableSorting: true,
        size: 80,
      },
      {
        id: "vehiculo_asignado",
        header: () => (
          <div className="dt-column-filter">
            <span>Asignación {asignacionFilter.length > 0 && `(${asignacionFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${asignacionFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenColumnFilter(openColumnFilter === 'asignacion' ? null : 'asignacion');
              }}
              title="Filtrar por asignación"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'asignacion' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
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
            return (
              <div className="vehiculo-cell">
                <div className="vehiculo-cell-patente">{vehiculo.patente}</div>
                <div className="vehiculo-cell-info">
                  {vehiculo.marca} {vehiculo.modelo}
                </div>
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
        accessorKey: "facturacion_efectivo",
        header: () => (
          <div className="dt-column-filter">
            <span>Efectivo {efectivoFilter.length > 0 && `(${efectivoFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${efectivoFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenColumnFilter(openColumnFilter === 'efectivo' ? null : 'efectivo');
              }}
              title="Filtrar por efectivo"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'efectivo' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={efectivoSearch}
                  onChange={(e) => setEfectivoSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {efectivoFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    efectivoFiltrados.slice(0, 50).map(val => (
                      <label key={val} className={`dt-column-filter-checkbox ${efectivoFilter.includes(val) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={efectivoFilter.includes(val)}
                          onChange={() => toggleEfectivoFilter(val)}
                        />
                        <span>{val}</span>
                      </label>
                    ))
                  )}
                </div>
                {efectivoFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setEfectivoFilter([]); setEfectivoSearch(''); }}
                  >
                    Limpiar ({efectivoFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row, getValue }) => {
          const val = getValue() as number;
          // Si el valor es mayor a 0, lo mostramos siempre (sea manual o automático)
          if (val && val > 0) {
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
          }
          // Si es 0 y no hay datos de Cabify en semana actual, mostramos N/A
          if (selectedWeek === getCurrentWeek() && !(row.original as any).cabifyData) {
            return <span className="italic" style={{ color: 'var(--text-tertiary)' }} title="Sin datos de Cabify">N/A</span>;
          }
          // Si es 0 pero hay datos (o semana pasada), mostramos $0
          if (val === undefined || val === null) return "-";
          return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
        },
        enableSorting: true,
        size: 110,
      },
      {
        accessorKey: "facturacion_app",
        header: () => (
          <div className="dt-column-filter">
            <span>APP {appFilter.length > 0 && `(${appFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${appFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenColumnFilter(openColumnFilter === 'app' ? null : 'app');
              }}
              title="Filtrar por APP"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'app' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={appSearch}
                  onChange={(e) => setAppSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {appFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    appFiltrados.slice(0, 50).map(val => (
                      <label key={val} className={`dt-column-filter-checkbox ${appFilter.includes(val) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={appFilter.includes(val)}
                          onChange={() => toggleAppFilter(val)}
                        />
                        <span>{val}</span>
                      </label>
                    ))
                  )}
                </div>
                {appFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setAppFilter([]); setAppSearch(''); }}
                  >
                    Limpiar ({appFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row, getValue }) => {
          const val = getValue() as number;
          // Si el valor es mayor a 0, lo mostramos siempre (sea manual o automático)
          if (val && val > 0) {
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
          }
          // Si es 0 y no hay datos de Cabify en semana actual, mostramos N/A
          if (selectedWeek === getCurrentWeek() && !(row.original as any).cabifyData) {
            return <span className="italic" style={{ color: 'var(--text-tertiary)' }} title="Sin datos de Cabify">N/A</span>;
          }
          if (val === undefined || val === null) return "-";
          return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
        },
        enableSorting: true,
        size: 110,
      },
      {
        accessorKey: "facturacion_total",
        header: () => (
          <div className="dt-column-filter">
            <span>TOTAL {totalFilter.length > 0 && `(${totalFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${totalFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenColumnFilter(openColumnFilter === 'total' ? null : 'total');
              }}
              title="Filtrar por Total"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'total' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={totalSearch}
                  onChange={(e) => setTotalSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {totalFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    totalFiltrados.slice(0, 50).map(val => (
                      <label key={val} className={`dt-column-filter-checkbox ${totalFilter.includes(val) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={totalFilter.includes(val)}
                          onChange={() => toggleTotalFilter(val)}
                        />
                        <span>{val}</span>
                      </label>
                    ))
                  )}
                </div>
                {totalFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setTotalFilter([]); setTotalSearch(''); }}
                  >
                    Limpiar ({totalFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row, getValue }) => {
          const val = getValue() as number;
          // Si el valor es mayor a 0, lo mostramos siempre (sea manual o automático)
          if (val && val > 0) {
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
          }
          // Si es 0 y no hay datos de Cabify en semana actual, mostramos N/A
          if (selectedWeek === getCurrentWeek() && !(row.original as any).cabifyData) {
            return <span className="italic" style={{ color: 'var(--text-tertiary)' }} title="Sin datos de Cabify">N/A</span>;
          }
          if (val === undefined || val === null) return "-";
          return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
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
        size: 160,
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
          if (rawDb) {
            let manualClass = 'dt-badge dt-badge-gray badge-no-dot';
            if (rawDb === 'SEMANAL') manualClass = 'dt-badge dt-badge-green badge-no-dot';
            else if (rawDb === 'CERCANO') manualClass = 'dt-badge dt-badge-yellow badge-no-dot';
            else if (rawDb === 'DIARIO') manualClass = 'dt-badge dt-badge-red badge-no-dot';
            return (
              <div className="flex justify-center">
                <span className={manualClass}>{rawDb}</span>
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
            <div className="flex justify-center">
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
            </div>
          );
        },
        enableSorting: true,
        size: 105,
      },
      {
        id: "acciones",
        header: "Acciones",
        cell: ({ row }) => {
          const isCurrent = selectedWeek === getCurrentWeek();
          
          return (
            <ActionsMenu
              maxVisible={4}
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
        size: 120,
      },
    ],
    [
      nombreFilter, cbuFilter, estadoFilter, turnoFilter, 
      categoriaFilter, asignacionFilter, openColumnFilter,
      nombresFiltrados, cuilsFiltrados, uniqueCategorias, uniqueEstados,
      nombreSearch, cbuSearch, selectedWeek, seguimientoRules, accionesImplementadas
    ]
  );

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

                    const total = Number(d.facturacion_total) || 0;
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
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalConductores' ? null : 'totalConductores')}
                      >
                        <Users className="stat-icon" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{totalConductores}</span>
                          <span className="stat-label">TOTAL DE CONDUCTORES</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalFacturado' ? null : 'totalFacturado')}
                      >
                        <DollarSign className="stat-icon" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalFacturado)}</span>
                          <span className="stat-label">TOTAL FACTURADO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalEfectivo' ? null : 'totalEfectivo')}
                      >
                        <DollarSign className="stat-icon text-green-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalEfectivo)}</span>
                          <span className="stat-label">FACTURACIÓN EFECTIVO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalApp' ? null : 'totalApp')}
                      >
                        <DollarSign className="stat-icon text-blue-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalApp)}</span>
                          <span className="stat-label">FACTURACIÓN APP</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'conductoresEscuela' ? null : 'conductoresEscuela')}
                      >
                        <GraduationCap className="stat-icon text-purple-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{conductoresEscuelaCount}</span>
                          <span className="stat-label">CONDUCTORES EN ESCUELA</span>
                        </div>
                      </div>

                      {/* Fila 2 */}
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'llamadasRealizadas' ? null : 'llamadasRealizadas')}
                      >
                        <Phone className="stat-icon text-green-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{llamadasRealizadas}</span>
                          <span className="stat-label">LLAMADAS REALIZADAS</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'llamadasPendientes' ? null : 'llamadasPendientes')}
                      >
                        <PhoneCall className="stat-icon text-orange-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{llamadasPendientes}</span>
                          <span className="stat-label">LLAMADAS PENDIENTES</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'seguimientoDiario' ? null : 'seguimientoDiario')}
                      >
                        <AlertTriangle className="stat-icon text-red-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoDiario}</span>
                          <span className="stat-label">SEGUIMIENTO DIARIO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'seguimientoCercano' ? null : 'seguimientoCercano')}
                      >
                        <AlertTriangle className="stat-icon text-yellow-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoCercano}</span>
                          <span className="stat-label">SEGUIMIENTO CERCANO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'seguimientoSemanal' ? null : 'seguimientoSemanal')}
                      >
                        <CheckCircle className="stat-icon text-green-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoSemanal}</span>
                          <span className="stat-label">SEGUIMIENTO SEMANAL</span>
                        </div>
                      </div>

                      {/* Fila 3 - Nuevas Métricas */}
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'capacitacionCabify' ? null : 'capacitacionCabify')}
                      >
                        <Book className="stat-icon text-blue-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{capacitacionCabifyCount}</span>
                          <span className="stat-label">CAPACITACION CABIFY</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'capacitacionToshify' ? null : 'capacitacionToshify')}
                      >
                        <Book className="stat-icon text-indigo-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{capacitacionToshifyCount}</span>
                          <span className="stat-label">CAPACITACION TOSHIFY</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'seguimientoControl' ? null : 'seguimientoControl')}
                      >
                        <Target className="stat-icon text-red-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoControlCount}</span>
                          <span className="stat-label">SEGUIMIENTO Y CONTROL</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'motivacional' ? null : 'motivacional')}
                      >
                        <Star className="stat-icon text-yellow-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{motivacionalCount}</span>
                          <span className="stat-label">ACCION MOTIVACIONAL</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:opacity-80' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'fidelizacion' ? null : 'fidelizacion')}
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
                {/* Filters Row: Search + Week Selector + Button */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  background: 'var(--bg-secondary)',
                  padding: '12px',
                  borderRadius: '8px',
                  boxShadow: 'var(--shadow-sm)',
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

                {/* Filtros Activos */}
                {(nombreFilter.length > 0 || estadoFilter.length > 0 || turnoFilter.length > 0 || asignacionFilter.length > 0 || efectivoFilter.length > 0 || appFilter.length > 0 || totalFilter.length > 0 || activeStatFilter) && (
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

                    {efectivoFilter.map(f => (
                      <span key={`efec-${f}`} className="active-filter-tag">
                        Efectivo: {f}
                        <button onClick={() => toggleEfectivoFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}

                    {appFilter.map(f => (
                      <span key={`app-${f}`} className="active-filter-tag">
                        App: {f}
                        <button onClick={() => toggleAppFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}

                    {totalFilter.map(f => (
                      <span key={`tot-${f}`} className="active-filter-tag">
                        Total: {f}
                        <button onClick={() => toggleTotalFilter(f)} className="active-filter-close"><X size={10} /></button>
                      </span>
                    ))}

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
                      onClick={() => {
                        setNombreFilter([]);
                        setEstadoFilter([]);
                        setTurnoFilter([]);
                        setAsignacionFilter([]);
                        setEfectivoFilter([]);
                        setAppFilter([]);
                        setTotalFilter([]);
                        setActiveStatFilter(null);
                        setGlobalSearch('');
                      }}
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
                    enableHorizontalScroll={true}
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
          onDriverUpdate={() => {
            if (selectedGuiaId) {
              loadDrivers(selectedGuiaId);
              loadCurrentWeekMetrics(selectedGuiaId);
            }
          }}
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
    </div>
  )
}
