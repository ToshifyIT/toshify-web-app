import { useState, useEffect, useRef, useMemo } from 'react'
import { useSearchParams, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { format, startOfISOWeek, endOfISOWeek, setISOWeek, addHours, previousSunday, startOfDay, endOfDay, subWeeks, nextSunday, addWeeks } from 'date-fns'
import { WeekSelector } from './components/WeekSelector'
import { 
  AlertTriangle, 
  Car, 
  Users, 
  DollarSign, 
  Filter, 
  Eye, 
  FolderOpen, 
  FolderPlus,
  PhoneCall,
  Phone,
  CheckCircle,
  MessageSquare,
  MessageSquarePlus,
  Pencil,
  ArrowLeftRight,
  Search,
  History,
  Clock,
  ClipboardList
} from 'lucide-react'
import { DataTable } from '../../components/ui/DataTable'
import { ActionsMenu } from '../../components/ui/ActionsMenu'
import { ExcelColumnFilter } from '../../components/ui/DataTable/ExcelColumnFilter'
import { type ColumnDef } from '@tanstack/react-table'
import type { ConductorWithRelations } from '../../types/database.types'
import Swal from 'sweetalert2'
import { DriverDetailModal } from './components/DriverDetailModal'
import { DriverHistoryModal } from './components/DriverHistoryModal'
import { AnotacionesEditorModal, type Nota } from './components/AnotacionesEditorModal'
import { AnotacionesModal, type Anotacion } from './components/AnotacionesModal'
import { ReporteEscuelaModal, type ConductorEscuela } from './components/ReporteEscuelaModal'
import { ReasignacionModal } from './components/ReasignacionModal'
import { useAuth } from '../../contexts/AuthContext'
import './GuiasModule.css'
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
  const [searchParams, setSearchParams] = useSearchParams()
  const { id: paramId } = useParams()
  const { profile } = useAuth()
  const urlGuiaId = paramId || searchParams.get('id')
  const hasDistributedRef = useRef(false)
  const hasSyncedRef = useRef(false)
  const [syncFinished, setSyncFinished] = useState(false)

  // Estados para filtros (replicados de ConductoresModule)
  const [nombreFilter, setNombreFilter] = useState<string[]>([])
  const [dniFilter, setDniFilter] = useState<string[]>([])
  const [cbuFilter, setCbuFilter] = useState<string[]>([]) // Reutilizado para CUIL
  const [estadoFilter, setEstadoFilter] = useState<string[]>([])
  const [turnoFilter, setTurnoFilter] = useState<string[]>([])
  const [categoriaFilter, setCategoriaFilter] = useState<string[]>([])
  const [asignacionFilter, setAsignacionFilter] = useState<string[]>([])
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null)
  
  // Estados para búsqueda dentro de filtros
  const [nombreSearch, setNombreSearch] = useState('')
  const [dniSearch, setDniSearch] = useState('')
  const [globalSearch, setGlobalSearch] = useState('')
  const [cbuSearch, setCbuSearch] = useState('')

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
  const [selectedRowForAnotaciones, setSelectedRowForAnotaciones] = useState<{ id: string, anotaciones: Nota[], conductorName: string } | null>(null)

  // Estados para modal de Historial de Notas (Viewer - Todas las semanas)
  const [historyNotesModalOpen, setHistoryNotesModalOpen] = useState(false);
  const [historyNotesData, setHistoryNotesData] = useState<Anotacion[]>([]);
  const [historyNotesDriverName, setHistoryNotesDriverName] = useState("");
  const [historyNotesTotal, setHistoryNotesTotal] = useState(0);

  // Estados para modal de Reporte Escuela
  const [schoolReportModalOpen, setSchoolReportModalOpen] = useState(false);
  const [schoolReportData, setSchoolReportData] = useState<ConductorEscuela[]>([]);
  const [schoolReportPage, setSchoolReportPage] = useState(1);
  const [precalculatedSchoolReport, setPrecalculatedSchoolReport] = useState<ConductorEscuela[]>([]);
  const [isSchoolReportCalculated, setIsSchoolReportCalculated] = useState(false);

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
      console.log('🔄 Iniciando precálculo de reporte escuela en segundo plano...');
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
                let { data: dataDni, error: errorDni } = await supabase
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

      console.log('✅ Precálculo de reporte escuela finalizado', updatedData);
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
  const handleOpenSchoolReport = () => {
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
  };

  // Efecto para actualizar el modal si se abre antes de terminar el cálculo
  useEffect(() => {
    if (schoolReportModalOpen && isSchoolReportCalculated) {
      setSchoolReportData(precalculatedSchoolReport);
    }
  }, [schoolReportModalOpen, isSchoolReportCalculated, precalculatedSchoolReport]);


  // Función para abrir el modal de EDICIÓN (Semana Actual) - Se mantiene por compatibilidad si se usa desde otros lados
  const handleOpenAnotacionesEditor = (row: any) => {
    if (!row.original.historial_id) {
      Swal.fire('Error', 'Este registro no tiene historial asociado aún.', 'warning');
      return;
    }

    setSelectedRowForAnotaciones({
      id: row.original.historial_id,
      anotaciones: row.original.anotaciones_extra || [],
      conductorName: `${row.original.nombres} ${row.original.apellidos}`
    });
    setAnotacionesModalOpen(true);
  };

  // Función para abrir el modal de HISTORIAL (Todas las semanas)
  const handleViewHistoryNotes = async (row: any) => {
    const driverId = row.original.id; // ID del conductor
    const driverName = `${row.original.nombres} ${row.original.apellidos}`;
    
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

      // 2. Get Cabify data for cross-referencing (to fill 0s)
      let cabifyByWeek: Record<string, { app: number, efectivo: number }> = {};
      
      // Ensure we have a clean DNI for matching
      const cleanDni = driver.numero_dni ? driver.numero_dni.replace(/\./g, '').trim() : '';
      const cleanName = driver.nombres ? driver.nombres.trim() : '';
      const cleanSurname = driver.apellidos ? driver.apellidos.trim() : '';
      
      if (cleanDni || (cleanName && cleanSurname)) {
         let query = supabase
            .from('cabify_historico')
            .select('fecha_inicio, cobro_app, cobro_efectivo, dni, nombre, apellido');
            
         const orConditions: string[] = [];
         if (cleanDni) {
             orConditions.push(`dni.eq.${driver.numero_dni}`);
             orConditions.push(`dni.eq.${cleanDni}`);
         }
         // Add name match condition if name exists (case insensitive)
         if (cleanName && cleanSurname) {
             orConditions.push(`and(nombre.ilike.${cleanName},apellido.ilike.${cleanSurname})`);
         }
         
         if (orConditions.length > 0) {
             query = query.or(orConditions.join(','));
         }

         const { data: cabifyData, error: cabifyError } = await query;
         
         if (!cabifyError && cabifyData) {
            cabifyData.forEach(d => {
               let match = false;

               // 1. Check DNI match
               const dbDni = d.dni ? d.dni.replace(/\./g, '').trim() : '';
               if (cleanDni && dbDni === cleanDni) {
                   match = true;
               }
               
               // 2. Check Name match if no DNI match yet
               if (!match && cleanName && cleanSurname) {
                   const dbName = d.nombre ? d.nombre.trim().toLowerCase() : '';
                   const dbSurname = d.apellido ? d.apellido.trim().toLowerCase() : '';
                   if (dbName === cleanName.toLowerCase() && dbSurname === cleanSurname.toLowerCase()) {
                       match = true;
                   }
               }

               if (!match) return;

               if (d.fecha_inicio) {
                  const date = new Date(d.fecha_inicio);
                  // Format: YYYY-Www (same as guias_historial_semanal.semana)
                  const weekStr = format(date, "R-'W'II");
                  
                  if (!cabifyByWeek[weekStr]) {
                     cabifyByWeek[weekStr] = { app: 0, efectivo: 0 };
                  }
                  
                  cabifyByWeek[weekStr].app += parseCustomCurrency(d.cobro_app);
                  cabifyByWeek[weekStr].efectivo += parseCustomCurrency(d.cobro_efectivo);
               }
            });
         }
      }

      if (historyData) {
        const rows = historyData.map(d => {
           // Priority: DB Value > Cabify Data (aggregated) > 0
          // Si la base de datos ya tiene información (incluso 0 si fue guardado explícitamente, pero asumiremos que si es 0 intentamos buscar respaldo),
          // la respetamos. Aquí la lógica es: si DB tiene valor > 0, usar DB. Si no, fallback a Cabify.
          
          // CORRECCIÓN: Las columnas en guias_historial_semanal son 'app' y 'efectivo', NO 'cobro_app'/'cobro_efectivo'.
          const dbApp = parseCustomCurrency(d.app);
          const dbEfectivo = parseCustomCurrency(d.efectivo);
          
          const cabifyWeek = cabifyByWeek[d.semana];
          
          // Usamos el valor de DB si es mayor a 0, de lo contrario intentamos usar el recálculo
          const app = dbApp > 0 ? dbApp : (cabifyWeek ? cabifyWeek.app : 0);
          const efectivo = dbEfectivo > 0 ? dbEfectivo : (cabifyWeek ? cabifyWeek.efectivo : 0);
          
          // Si dbTotal existe y es coherente, usarlo. Si no, sumar componentes.
          // A veces el total guardado puede diferir por redondeos, priorizamos lo guardado si existe.
          const dbTotal = parseCustomCurrency(d.total);
          const total = dbTotal > 0 ? dbTotal : (app + efectivo);
           
           // Calculate seguimiento
           let seguimientoLabel = 'SEMANAL'; 
           if (seguimientoRules && seguimientoRules.length > 0) {
              for (const rule of seguimientoRules) {
                 const desde = Number(rule.desde || 0);
                 const hasta = rule.hasta !== null && rule.hasta !== undefined ? Number(rule.hasta) : Infinity;
                 if (total >= desde && total <= hasta) {
                    seguimientoLabel = rule.rango_nombre || 'SEMANAL';
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
      const { data, error } = await supabase.from('guias_seguimiento').select('*');
      if (error) throw error;
      if (data) {
        console.log("Seguimiento rules loaded:", data);
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
  }, [selectedGuiaId, selectedWeek])

  useEffect(() => {
    if (selectedGuiaId) {
      loadCurrentWeekMetrics(selectedGuiaId)
    } else {
      setCurrentWeekDrivers([])
    }
  }, [selectedGuiaId])

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
      let cabifyDriversMapByDni = new Map();
      let cabifyDriversMapByName = new Map();
      
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

          if (cabifyError) {
             console.error('Error fetching cabify_historico:', cabifyError);
          } else if (cabifyDataRaw && cabifyDataRaw.length > 0) {
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
      } catch (err) {
        console.error("Error loading Cabify data for cross-reference:", err);
      }

      // Procesar conductores desde el historial
      if (historialData && historialData.length > 0) {
        const processedDrivers: any[] = [];
        const updatesToPerform: any[] = [];
        
        historialData.forEach((historial: any) => {
          const conductor = historial.conductores;
          // Flatten conductor data
          const baseConductor: any = { 
            ...conductor,
            // Mantener campos del historial en el nivel superior para la tabla
            ...historial,
            // Restaurar ID del conductor como ID principal (para que funcionen los modales y acciones)
            id: conductor.id,
            // Guardar ID del historial por si se necesita
            historial_id: historial.id,
            row_id: `${conductor.id}-${historial.semana}`
          };

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
        });

      // Ejecutar actualizaciones masivas si hay cambios detectados
      if (updatesToPerform.length > 0) {
        console.log(`GuiasModule: Updating ${updatesToPerform.length} records in guias_historial_semanal...`);
        // Promise.all para actualizaciones individuales seguras
        await Promise.all(updatesToPerform.map(u => {
          const { id, ...payload } = u; // Separar ID del resto de datos a actualizar
          return supabase
            .from('guias_historial_semanal')
            .update(payload)
            .eq('id', id)
        }));
        console.log('GuiasModule: Actualizaciones completadas.');
      }

      return processedDrivers;
      } else {
        return [];
      }
    } catch (error) {
      console.error('Error loading drivers:', error)
      return [];
    }
  }

  const loadDrivers = async (guiaId: string) => {
    try {
      setLoadingDrivers(true);
      const data = await fetchDriversData(guiaId, selectedWeek);
      setDrivers(data);
    } catch (error) {
      console.error('Error loading drivers:', error);
      setDrivers([]);
    } finally {
      setLoadingDrivers(false);
    }
  }

  const loadCurrentWeekMetrics = async (guiaId: string) => {
    try {
      const data = await fetchDriversData(guiaId, getCurrentWeek());
      setCurrentWeekDrivers(data);
    } catch (error) {
      console.error('Error loading current week metrics:', error);
    }
  }

  // Nueva función para clonar historial de la semana anterior
  const syncWeeklyHistory = async () => {
    const currentWeek = getCurrentWeek();
    console.log(`GuiasModule: Checking sync for week ${currentWeek}`);
    
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
        console.log(`GuiasModule: Week ${currentWeek} already has ${count} records. Skipping cloning.`);
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
      
      console.log(`GuiasModule: Cloning from previous week ${prevWeek} to ${currentWeek}`);

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
        console.log('GuiasModule: No data found in previous week to clone.');
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
          id_accion_imp: 1, // Por defecto (ej. CAPACITACION CABIFY) o null según regla de negocio
          
          created_at: new Date().toISOString()
        }));

      if (newRecords.length === 0) {
        console.log('GuiasModule: No valid active drivers with vehicle found to clone.');
        return;
      }

      console.log(`GuiasModule: Cloning ${newRecords.length} records...`);

      // E. Insertar masivamente
      const { error: insertError } = await supabase
        .from('guias_historial_semanal')
        .insert(newRecords);

      if (insertError) throw insertError;

      console.log('GuiasModule: Cloning completed successfully.');
      
      // Opcional: Mostrar notificación discreta
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

    } catch (error) {
      console.error('GuiasModule: Error executing weekly sync:', error);
      // No bloqueamos la UI, solo logueamos, la distribución continua servirá de fallback
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
    console.log('GuiasModule: useEffect checking distribution', { 
      syncFinished,
      hasDistributed: hasDistributedRef.current, 
      guiasLength: guias.length 
    });
    
    if (syncFinished && !hasDistributedRef.current && guias.length > 0) {
      hasDistributedRef.current = true
      console.log('GuiasModule: Triggering distributeDrivers');
      distributeDrivers();
    }
  }, [syncFinished, guias])


  const distributeDrivers = async () => {
    console.log('GuiasModule: Starting distributeDrivers execution - STRICT MODE (vehiculo_id fix)');
    try {
      if (guias.length === 0) {
        console.log('GuiasModule: No guias found, aborting distribution');
        return
      }

      console.log('GuiasModule: Fetching currently assigned drivers...');
      const { data: assignedDrivers, error: assignedError } = await supabase
        .from('conductores')
        .select('id, id_guia')
        .eq('estado_id', '57e9de5f-e6fc-4ff7-8d14-cf8e13e9dbe2')
        .eq('guia_asignado', true)

      if (assignedError) {
        console.error('Error fetching assigned drivers:', assignedError)
        return
      }
      console.log('GuiasModule: Assigned drivers found:', assignedDrivers?.length || 0);

      console.log('GuiasModule: Fetching unassigned drivers...');
      // Modificación estricta: Usamos !inner en todas las relaciones jerárquicas para forzar
      // que existan los registros hijos. Si no hay vehiculo, no trae el conductor.
      const { data: rawUnassignedDrivers, error: unassignedError } = await supabase
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
        .in('asignaciones_conductores.asignaciones.estado', ['activo', 'activa']);

      if (unassignedError) {
        console.error('Error fetching unassigned drivers:', unassignedError)
        return
      }

      console.log(`GuiasModule: Total candidatos crudos recuperados de DB: ${rawUnassignedDrivers?.length || 0}`);

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
           
           if (isValid) {
               // Guardamos la patente válida en el objeto del conductor para mostrarla en el log final
               d._debug_patente = asignacion.vehiculos.patente;
               console.log(`GuiasModule: Conductor VÁLIDO para asignación: ${d.nombres} ${d.apellidos} - Patente: ${asignacion.vehiculos.patente}, Estado: ${estado}`);
           }
           
           return isValid;
        });

        if (tieneVehiculoActivo) {
          unassignedDriversMap.set(d.id, d);
        } else {
          console.warn(`GuiasModule: Conductor RECHAZADO (Sin vehículo activo válido): ${d.nombres} ${d.apellidos} - ID: ${d.id}`);
        }
      });
      const unassignedDrivers = Array.from(unassignedDriversMap.values());

      console.log(`GuiasModule: === RESUMEN FINAL DE FILTRADO ===`);
      console.log(`GuiasModule: Total Aceptados: ${unassignedDrivers.length}`);
      console.log(`GuiasModule: Detalle de conductores aceptados:`, unassignedDrivers.map(d => ({
          id: d.id,
          nombre: `${d.nombres} ${d.apellidos}`,
          patente: d._debug_patente || 'N/A'
      })));
      console.log(`GuiasModule: =================================`);

      console.log('GuiasModule: Unassigned drivers found:', unassignedDrivers.length);

      if (unassignedDrivers.length === 0) {
        console.log('GuiasModule: No unassigned drivers to distribute.');
        return
      }

      const guideLoad = new Map<string, number>()
      guias.forEach(g => guideLoad.set(g.id, 0))

      assignedDrivers?.forEach((d: any) => {
        if (d.id_guia && guideLoad.has(d.id_guia)) {
          guideLoad.set(d.id_guia, guideLoad.get(d.id_guia)! + 1)
        }
      })
      
      console.log('GuiasModule: Current guide loads:', Object.fromEntries(guideLoad));

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
        
        console.log(`GuiasModule: Planificando asignación - Conductor: ${driver.id} -> Guía: ${selectedGuideId}`);

        updates.push({
          id: driver.id,
          guia_asignado: true,
          id_guia: selectedGuideId
        })
      }

      console.log('GuiasModule: Updates prepared:', updates.length);

      if (updates.length > 0) {
        console.log('GuiasModule: Performing updates to conductores...', updates);
        
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
          console.error('Errores actualizando conductores:', errors);
          throw errors[0]; // Lanzamos el primero para que caiga en el catch
        }

        console.log(`Asignados ${updates.length} conductores a guías.`);

        // Insertar en historial semanal
        const currentWeek = getCurrentWeek()
        console.log('GuiasModule: Preparing history inserts for week:', currentWeek);
        
        // Verificar historial existente para esta semana para evitar duplicados
        // Esto asegura que solo se creen registros para NUEVAS asignaciones
        const { data: existingHistory } = await supabase
          .from('guias_historial_semanal')
          .select('id_conductor')
          .eq('semana', currentWeek);
          
        const existingHistoryIds = new Set(existingHistory?.map((h: any) => h.id_conductor));
        const historyInserts: any[] = [];

        updates.forEach(u => {
          if (!existingHistoryIds.has(u.id)) {
            historyInserts.push({
              id_conductor: u.id,
              id_guia: u.id_guia,
              semana: currentWeek,
              id_accion_imp: 1 // Default action: "CAPACITACION CABIFY"
            });
            // Añadir al set local para evitar duplicados en el mismo lote
            existingHistoryIds.add(u.id);
          }
        });

        if (historyInserts.length > 0) {
          console.log(`GuiasModule: Performing bulk insert of ${historyInserts.length} records to guias_historial_semanal...`, historyInserts);
          const { error: historyError } = await supabase
            .from('guias_historial_semanal')
            .insert(historyInserts)

          if (historyError) {
            console.error('Error creando historial semanal:', historyError)
          } else {
            console.log(`Creados ${historyInserts.length} registros en historial semanal.`)
          }
        } else {
          console.log('GuiasModule: No new history records needed (all drivers already have history for this week).');
        }
        
        // Recargar datos para reflejar cambios
        if (selectedGuiaId) {
             loadDrivers(selectedGuiaId);
        }
      }

    } catch (error) {
      console.error('Error distribuyendo conductores:', error)
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
    } catch (error) {
      console.error('Error loading guias:', error)
    } finally {
      setLoading(false)
    }
  }

  const selectedGuia = guias.find(g => g.id === selectedGuiaId)

  const handleGuiaSelect = (id: string) => {
    setSelectedGuiaId(id)
    setSearchParams({ id })
  }

  // Valores únicos para filtros
  const nombresUnicos = useMemo(() => {
    const nombres = drivers.map(c => `${c.nombres} ${c.apellidos}`).filter(Boolean);
    return [...new Set(nombres)].sort();
  }, [drivers]);

  const dnisUnicos = useMemo(() => {
    const dnis = drivers.map(c => c.numero_dni).filter(Boolean) as string[];
    return [...new Set(dnis)].sort();
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

  const dnisFiltrados = useMemo(() => {
    if (!dniSearch) return dnisUnicos;
    return dnisUnicos.filter(d => d.toLowerCase().includes(dniSearch.toLowerCase()));
  }, [dnisUnicos, dniSearch]);

  const cuilsFiltrados = useMemo(() => {
    if (!cbuSearch) return cuilsUnicos;
    return cuilsUnicos.filter(c => c.toLowerCase().includes(cbuSearch.toLowerCase()));
  }, [cuilsUnicos, cbuSearch]);

  const toggleNombreFilter = (nombre: string) => {
    setNombreFilter(prev =>
      prev.includes(nombre) ? prev.filter(n => n !== nombre) : [...prev, nombre]
    );
  };

  const toggleDniFilter = (dni: string) => {
    setDniFilter(prev =>
      prev.includes(dni) ? prev.filter(d => d !== dni) : [...prev, dni]
    );
  };

  const toggleCbuFilter = (cbu: string) => {
    setCbuFilter(prev =>
      prev.includes(cbu) ? prev.filter(c => c !== cbu) : [...prev, cbu]
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

  const filteredDrivers = useMemo(() => {
    let result = drivers;

    if (nombreFilter.length > 0) {
      result = result.filter(c =>
        nombreFilter.includes(`${c.nombres} ${c.apellidos}`)
      );
    }

    if (dniFilter.length > 0) {
      result = result.filter(c =>
        dniFilter.includes(c.numero_dni || '')
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
      result = result.filter(c =>
        turnoFilter.includes((c as any).preferencia_turno || 'SIN_PREFERENCIA')
      );
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
      }
    }

    return result;
  }, [drivers, nombreFilter, dniFilter, cbuFilter, estadoFilter, turnoFilter, categoriaFilter, asignacionFilter, activeStatFilter, selectedWeek, seguimientoRules]);

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
        cell: ({ row }) => (
          <strong style={{ textTransform: 'uppercase' }}>{`${row.original.nombres} ${row.original.apellidos}`}</strong>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "numero_dni",
        header: () => (
          <div className="dt-column-filter">
            <span>DNI {dniFilter.length > 0 && `(${dniFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${dniFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenColumnFilter(openColumnFilter === 'dni' ? null : 'dni');
              }}
              title="Filtrar por DNI"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'dni' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={dniSearch}
                  onChange={(e) => setDniSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {dnisFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    dnisFiltrados.slice(0, 50).map(dni => (
                      <label key={dni} className={`dt-column-filter-checkbox ${dniFilter.includes(dni) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={dniFilter.includes(dni)}
                          onChange={() => toggleDniFilter(dni)}
                        />
                        <span>{dni}</span>
                      </label>
                    ))
                  )}
                </div>
                {dniFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setDniFilter([]); setDniSearch(''); }}
                  >
                    Limpiar ({dniFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ getValue }) => (getValue() as string) || "-",
        enableSorting: true,
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
        accessorFn: (row) => {
          // 1. Priorizar turno real de la asignación actual
          const asignacionInfo = (row as any).asignacion_info;
          if (asignacionInfo) {
            if (asignacionInfo.modalidad === 'CARGO') return 'A_CARGO';
            if (asignacionInfo.turno_conductor) {
               const t = asignacionInfo.turno_conductor.toUpperCase();
               return t === 'DIURNO' ? 'DIURNO' : t === 'NOCTURNO' ? 'NOCTURNO' : t;
            }
          }
          // 2. Fallback a preferencia de turno si no hay asignación
          return (row as any).preferencia_turno || 'SIN_PREFERENCIA'
        },
        cell: ({ row }) => {
          const asignacionInfo = (row.original as any).asignacion_info;
          
          // Si tiene asignación activa, mostrar el turno real
          if (asignacionInfo) {
            if (asignacionInfo.modalidad === 'CARGO') {
               return (
                 <span className="dt-badge dt-badge-purple badge-with-dot">
                   A Cargo
                 </span>
               );
            }
            const turno = asignacionInfo.turno_conductor?.toLowerCase();
            if (turno === 'diurno') {
               return (
                 <span className="dt-badge dt-badge-orange badge-with-dot">
                   Diurno
                 </span>
               );
            } else if (turno === 'nocturno') {
               return (
                 <span className="dt-badge dt-badge-blue badge-with-dot">
                   Nocturno
                 </span>
               );
            }
          }

          // Fallback original: Preferencia de turno
          const preferencia = (row.original as any).preferencia_turno?.toLowerCase();
          
          if (!preferencia) {
            return (
              <span className="dt-badge dt-badge-gray badge-with-dot">
                Sin pref.
              </span>
            );
          }

          if (preferencia === 'diurno' || preferencia === 'mañana') {
            return (
              <span className="dt-badge dt-badge-orange badge-with-dot">
                Diurno
              </span>
            );
          }
          
          if (preferencia === 'nocturno' || preferencia === 'noche') {
            return (
              <span className="dt-badge dt-badge-blue badge-with-dot">
                Nocturno
              </span>
            );
          }

          return (
            <span className="dt-badge dt-badge-gray badge-with-dot">
              {preferencia}
            </span>
          );
        },
        filterFn: (row, id, filterValue) => {
          if (!filterValue.length) return true
          const val = row.getValue(id) as string
          return filterValue.includes(val)
        },
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
      },
      {
        accessorKey: "facturacion_efectivo",
        header: "EFECTIVO",
        cell: ({ row, getValue }) => {
          const val = getValue() as number;
          // Si el valor es mayor a 0, lo mostramos siempre (sea manual o automático)
          if (val && val > 0) {
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
          }
          // Si es 0 y no hay datos de Cabify en semana actual, mostramos N/A
          if (selectedWeek === getCurrentWeek() && !(row.original as any).cabifyData) {
            return <span className="text-gray-400 italic" title="Sin datos de Cabify">N/A</span>;
          }
          // Si es 0 pero hay datos (o semana pasada), mostramos $0
          if (val === undefined || val === null) return "-";
          return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
        },
        enableSorting: true,
      },
      {
        accessorKey: "facturacion_app",
        header: "APP",
        cell: ({ row, getValue }) => {
          const val = getValue() as number;
          // Si el valor es mayor a 0, lo mostramos siempre (sea manual o automático)
          if (val && val > 0) {
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
          }
          // Si es 0 y no hay datos de Cabify en semana actual, mostramos N/A
          if (selectedWeek === getCurrentWeek() && !(row.original as any).cabifyData) {
            return <span className="text-gray-400 italic" title="Sin datos de Cabify">N/A</span>;
          }
          if (val === undefined || val === null) return "-";
          return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
        },
        enableSorting: true,
      },
      {
        accessorKey: "facturacion_total",
        header: "TOTAL",
        cell: ({ row, getValue }) => {
          const val = getValue() as number;
          // Si el valor es mayor a 0, lo mostramos siempre (sea manual o automático)
          if (val && val > 0) {
            return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
          }
          // Si es 0 y no hay datos de Cabify en semana actual, mostramos N/A
          if (selectedWeek === getCurrentWeek() && !(row.original as any).cabifyData) {
            return <span className="text-gray-400 italic" title="Sin datos de Cabify">N/A</span>;
          }
          if (val === undefined || val === null) return "-";
          return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val);
        },
        enableSorting: true,
      },

      {
        id: "llamada_status",
        header: "Llamada",
        accessorFn: (row) => (row as any).fecha_llamada,
        cell: ({ getValue }) => {
          const fecha = getValue();
          return fecha ? (
            <span className="dt-badge dt-badge-green badge-no-dot">Realizada</span>
          ) : (
            <span className="dt-badge dt-badge-yellow badge-no-dot">Pendientes</span>
          );
        },
        enableSorting: true,
      },
      {
        accessorKey: "fecha_llamada",
        header: "Fecha Llamada",
        cell: ({ getValue }) => {
          const fecha = getValue() as string;
          if (!fecha) return "-";
          return new Date(fecha).toLocaleDateString("es-AR");
        },
        enableSorting: true,
      },
      {
        accessorKey: "id_accion_imp",
        header: "Acción Implementada",
        cell: ({ row }) => {
           const idAccion = (row.original as any).id_accion_imp;
           // Si no hay ID o es nulo, asumimos 1 (CAPACITACION CABIFY) por defecto visualmente, 
           // aunque idealmente debería venir de la DB.
           const targetId = idAccion || 1; 
           const accion = accionesImplementadas.find(a => a.id === targetId);
           return accion ? accion.nombre : (idAccion || "-");
        },
        enableSorting: true,
      },
      {
        id: "seguimiento",
        header: "Seguimiento",
        accessorFn: (row) => (row as any).fecha_llamada,
        cell: ({ row }) => {
          // Logic for Financial Status
          const rawTotal = (row.original as any).facturacion_total;
          
          // Helper to ensure we have a valid number
          const parseTotal = (val: any): number => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            // Handle string formats if any remain (e.g. "123.456,78" or "123456.78")
            const str = String(val).trim();
            // Simple check: if it looks like standard JS number
            if (!isNaN(Number(str))) return Number(str);
            // If it has comma decimal separator
            return parseFloat(str.replace(/\./g, '').replace(',', '.'));
          };

          const total = parseTotal(rawTotal);
          
          // DEBUG LOGS (Temporary for debugging)
          console.log(`[Seguimiento] Row: ${(row.original as any).nombres} | Total: ${total} (Raw: ${rawTotal})`);
          // console.log('Rules:', seguimientoRules);

          let ruleMatch = null;
          
          if (seguimientoRules && seguimientoRules.length > 0) {
            for (const rule of seguimientoRules) {
              // Direct numeric comparison using 'desde' and 'hasta' fields
              const desde = Number(rule.desde || 0);
              const hasta = rule.hasta !== null && rule.hasta !== undefined ? Number(rule.hasta) : null;

              const matchesLower = total >= desde;
              const matchesUpper = hasta === null || total <= hasta;
              
              if (matchesLower && matchesUpper) {
                console.log(`  -> Match found: ${rule.rango_nombre} (${desde} - ${hasta})`);
                ruleMatch = rule;
                break;
              }
            }
            if (!ruleMatch) {
                console.log(`  -> No match found for total ${total}`);
            }
          } else {
             console.warn('[Seguimiento] No rules loaded!');
          }

          const getBadgeColor = (color: string) => {
            const c = color?.toLowerCase().trim();
            if (c === 'verde') return 'dt-badge dt-badge-green badge-no-dot';
            if (c === 'amarillo') return 'dt-badge dt-badge-yellow badge-no-dot';
            if (c === 'rojo') return 'dt-badge dt-badge-red badge-no-dot';
            return 'dt-badge dt-badge-gray badge-no-dot';
          };

          return (
            <div className="flex justify-center">
              {ruleMatch ? (
                <span className={getBadgeColor(ruleMatch.color)}>
                  {ruleMatch.rango_nombre}
                </span>
              ) : (
                <span className="text-gray-400">-</span>
              )}
            </div>
          );
        },
        enableSorting: true,
      },
      {
        id: "acciones",
        header: "Acciones",
        cell: ({ row }) => {
          const driveUrl = (row.original as any).drive_folder_url;
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
      },
    ],
    [
      nombreFilter, dniFilter, cbuFilter, estadoFilter, turnoFilter, 
      categoriaFilter, asignacionFilter, openColumnFilter,
      nombresFiltrados, dnisFiltrados, cuilsFiltrados, uniqueCategorias, uniqueEstados,
      nombreSearch, dniSearch, cbuSearch, selectedWeek, seguimientoRules, accionesImplementadas
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

                  const llamadasRealizadas = currentWeekDrivers.filter(d => !!d.fecha_llamada).length;
                  const llamadasPendientes = currentWeekDrivers.filter(d => !d.fecha_llamada).length;
                  const porcentajeCompletadas = totalConductores > 0 ? ((llamadasRealizadas / totalConductores) * 100).toFixed(0) : '0';

                  // Conteo de seguimiento
                  let seguimientoDiario = 0;
                  let seguimientoCercano = 0;
                  let seguimientoSemanal = 0;

                  currentWeekDrivers.forEach(d => {
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

                  // Formateador de moneda
                  const formatCurrency = (val: number) => {
                    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(val);
                  };

                  return (
                    <div className="guias-stats-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
                      {/* Fila 1 */}
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalConductores' ? null : 'totalConductores')}
                      >
                        <Users className="stat-icon" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{totalConductores}</span>
                          <span className="stat-label">TOTAL DE CONDUCTORES</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalFacturado' ? null : 'totalFacturado')}
                      >
                        <DollarSign className="stat-icon" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalFacturado)}</span>
                          <span className="stat-label">TOTAL FACTURADO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalEfectivo' ? null : 'totalEfectivo')}
                      >
                        <DollarSign className="stat-icon text-green-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalEfectivo)}</span>
                          <span className="stat-label">FACTURACIÓN EFECTIVO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'totalApp' ? null : 'totalApp')}
                      >
                        <DollarSign className="stat-icon text-blue-600" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{formatCurrency(totalApp)}</span>
                          <span className="stat-label">FACTURACIÓN APP</span>
                        </div>
                      </div>
                      <div className="stat-card">
                        <CheckCircle className="stat-icon" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{porcentajeCompletadas}%</span>
                          <span className="stat-label">% LLAMADAS COMPLETADAS</span>
                        </div>
                      </div>

                      {/* Fila 2 */}
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'llamadasRealizadas' ? null : 'llamadasRealizadas')}
                      >
                        <Phone className="stat-icon text-green-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{llamadasRealizadas}</span>
                          <span className="stat-label">LLAMADAS REALIZADAS</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'llamadasPendientes' ? null : 'llamadasPendientes')}
                      >
                        <PhoneCall className="stat-icon text-orange-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{llamadasPendientes}</span>
                          <span className="stat-label">LLAMADAS PENDIENTES</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'seguimientoDiario' ? null : 'seguimientoDiario')}
                      >
                        <AlertTriangle className="stat-icon text-red-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoDiario}</span>
                          <span className="stat-label">SEGUIMIENTO DIARIO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'seguimientoCercano' ? null : 'seguimientoCercano')}
                      >
                        <AlertTriangle className="stat-icon text-yellow-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoCercano}</span>
                          <span className="stat-label">SEGUIMIENTO CERCANO</span>
                        </div>
                      </div>
                      <div 
                        className={`stat-card ${selectedWeek === getCurrentWeek() ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                        onClick={() => selectedWeek === getCurrentWeek() && setActiveStatFilter(activeStatFilter === 'seguimientoSemanal' ? null : 'seguimientoSemanal')}
                      >
                        <CheckCircle className="stat-icon text-green-500" size={18} />
                        <div className="stat-content">
                          <span className="stat-value">{seguimientoSemanal}</span>
                          <span className="stat-label">SEGUIMIENTO SEMANAL</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Filters & Table Container */}
              <div className="guias-filters-container" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Filters Row: Week Selector + Search */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', backgroundColor: 'white', padding: '12px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                  
                  {/* External Search Input - 80% width */}
                  <div className="dt-search-wrapper" style={{ flex: '0 0 80%', height: '36px', background: '#f9fafb', borderRadius: '6px' }}>
                    <Search className="dt-search-icon" size={20} />
                    <input
                      type="text"
                      className="dt-search-input"
                      style={{ paddingBottom: '5px', paddingTop: '10px' }}
                      placeholder="Buscar en esta lista..."
                      value={globalSearch}
                      onChange={(e) => setGlobalSearch(e.target.value)}
                    />
                  </div>

                  {/* Week Selector - Remaining width */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <WeekSelector 
                      selectedWeek={selectedWeek} 
                      onWeekChange={setSelectedWeek} 
                      onSchoolTrackingClick={handleOpenSchoolReport} 
                    />
                  </div>
                </div>

                {/* Table */}
                <div className="guias-table-container">
                  <DataTable
                    columns={columns}
                    data={filteredDrivers}
                    loading={loadingDrivers}
                    showSearch={false}
                    globalFilter={globalSearch}
                    onGlobalFilterChange={setGlobalSearch}
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
          title={`Historial de Anotaciones - ${historyNotesDriverName}`}
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
    </div>
  )
}
