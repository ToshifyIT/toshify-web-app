import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { 
  Users, 
  TrendingUp, 
  TrendingDown,
  CheckCircle, 
  Clock, 
  Search
} from 'lucide-react';
import { format, addHours, previousSunday, subWeeks, nextSunday, addWeeks, startOfDay, endOfDay } from 'date-fns';
import { DataTable } from '../../components/ui/DataTable';
import { type ColumnDef } from '@tanstack/react-table';
import { DateFilterPill } from './DateFilterPill';
import './EscuelaModule.css';

interface MetricData {
  promGan: number;
  horas: number;
  porcOcup: number;
  acept: number;
}

interface ConductorEscuelaRow {
  id: string;
  nombre: string;
  dni: string;
  estado: string;
  fechaCap: string; // Formatted DD/MM/YYYY
  fechaCapRaw: string; // ISO string for filtering
  previo: MetricData;
  post: MetricData;
}

export function EscuelaModule() {
  const [conductores, setConductores] = useState<ConductorEscuelaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');
  
  // Filtros de fecha
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [activeStatFilter, setActiveStatFilter] = useState<string | null>(null);

  const handleDateFilterChange = useCallback(({ month, year }: { month: number; year: number }) => {
    setSelectedMonth(month - 1); // Component returns 1-12, Date uses 0-11
    setSelectedYear(year);
  }, []);

  useEffect(() => {
    loadEscuelaData();
  }, []);

  const loadEscuelaData = async () => {
    setLoading(true);
    try {
      // 1. Fetch drivers with school date
      const { data: drivers, error } = await supabase
        .from('conductores')
        .select(`
          id,
          nombres,
          apellidos,
          numero_dni,
          fecha_escuela,
          conductores_estados (
            descripcion
          )
        `)
        .not('fecha_escuela', 'is', null)
        .order('fecha_escuela', { ascending: false });

      if (error) throw error;

      if (!drivers || drivers.length === 0) {
        setConductores([]);
        setLoading(false);
        return;
      }

      // 2. Process metrics for each driver
      const processedData = await Promise.all(drivers.map(async (d) => {
        const fechaEscuela = d.fecha_escuela;
        const fechaEscuelaDate = addHours(new Date(fechaEscuela), 12);
        
        // Helper for metrics query (Specific Sundays) - Logic ported from GuiasModule (School Report)
        const getMetrics = async (targetDates: Date[]): Promise<MetricData> => {
           let totalGanancia = 0;
           let totalHoras = 0;
           let totalOcupacion = 0;
           let totalAceptacion = 0;
           let count = 0;

           for (const targetDate of targetDates) {
               // Rango de búsqueda: desde 60 días antes hasta el final del día objetivo
               const endDateISO = endOfDay(targetDate).toISOString();
               const startDateISO = startOfDay(subWeeks(targetDate, 9)).toISOString(); // ~63 días atrás

               const dniOriginal = d.numero_dni ? String(d.numero_dni).trim() : '';
               const cleanDni = dniOriginal.replace(/\./g, '');

               let metrics = null;

               // 1. Búsqueda optimizada por DNI (Rango completo)
               if (dniOriginal) {
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
                   metrics = dataDni;
               }

               if (!metrics) {
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

        // 1. PREVIO A CAPACITACIÓN (2 domingos anteriores)
        const sundayPrev1 = previousSunday(fechaEscuelaDate);
        const sundayPrev2 = subWeeks(sundayPrev1, 1);
        
        console.log(`[Dates] ${d.nombres} ${d.apellidos} - School: ${format(fechaEscuelaDate, 'yyyy-MM-dd')}`);
        
        const metricsPrev = await getMetrics([sundayPrev1, sundayPrev2]);

        // 2. POST CAPACITACIÓN (2 domingos posteriores)
        // Note: nextSunday returns the *next* Sunday. 
        // If school is Wed, next Sunday is end of that week. 
        // We want the 2 weeks *after* the school week? Or including?
        // Usually "Post" comparison implies "Result of applying knowledge".
        // Let's take the next 2 Sundays.
        const sundayPost1 = nextSunday(fechaEscuelaDate);
        const sundayPost2 = addWeeks(sundayPost1, 1);

        const metricsPost = await getMetrics([sundayPost1, sundayPost2]);

        return {
          id: d.id,
          nombre: `${d.nombres} ${d.apellidos}`,
          dni: d.numero_dni || '-',
          estado: Array.isArray(d.conductores_estados) ? d.conductores_estados[0]?.descripcion : ((d.conductores_estados as any)?.descripcion || '-'),
          fechaCap: format(fechaEscuelaDate, 'dd/MM/yyyy'),
          fechaCapRaw: fechaEscuela,
          previo: metricsPrev,
          post: metricsPost
        };
      }));

      setConductores(processedData);

    } catch (err) {
      console.error('Error loading escuela data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Base filtered data (by date) for Stats Calculation
  const baseData = useMemo(() => {
    return conductores.filter(c => {
      const date = addHours(new Date(c.fechaCapRaw), 12);
      return date.getMonth() === selectedMonth && date.getFullYear() === selectedYear;
    });
  }, [conductores, selectedMonth, selectedYear]);

  // Final filtered data for Table
  const filteredData = useMemo(() => {
    let result = baseData;

    // Apply Active Stat Filter
    if (activeStatFilter) {
      switch (activeStatFilter) {
        case 'mejoraron_ingresos':
          result = result.filter(c => c.post.promGan > c.previo.promGan);
          break;
        case 'empeoraron_ingresos':
          result = result.filter(c => c.post.promGan < c.previo.promGan);
          break;
        case 'alta_aceptacion':
          result = result.filter(c => c.post.acept >= 80); // Filter high acceptance
          break;
        case 'buena_conexion':
          result = result.filter(c => c.post.horas >= 5); // Filter good hours (e.g. > 5h avg)
          break;
      }
    }

    // Global Search
    if (globalSearch) {
      const search = globalSearch.toLowerCase();
      result = result.filter(c => 
        c.nombre.toLowerCase().includes(search) || 
        c.dni.includes(search)
      );
    }

    return result;
  }, [baseData, activeStatFilter, globalSearch]);

  // Stats Calculation (Always based on baseData to maintain context)
  const stats = useMemo(() => {
    const total = baseData.length;
    if (total === 0) return {
      totalConductores: 0,
      mejoraronIngresos: 0,
      empeoraronIngresos: 0,
      altaAceptacion: 0,
      buenaConexion: 0
    };

    let countMejoraronIngresos = 0;
    let countEmpeoraronIngresos = 0;
    let countAltaAceptacion = 0;
    let countBuenaConexion = 0;

    baseData.forEach(c => {
      if (c.post.promGan > c.previo.promGan) countMejoraronIngresos++;
      if (c.post.promGan < c.previo.promGan) countEmpeoraronIngresos++;
      if (c.post.acept >= 80) countAltaAceptacion++;
      if (c.post.horas >= 5) countBuenaConexion++;
    });

    return {
      totalConductores: total,
      mejoraronIngresos: countMejoraronIngresos,
      empeoraronIngresos: countEmpeoraronIngresos,
      altaAceptacion: countAltaAceptacion,
      buenaConexion: countBuenaConexion
    };
  }, [baseData]);

  // Columns Definition
  const columns = useMemo<ColumnDef<ConductorEscuelaRow>[]>(
    () => [
      {
        accessorKey: "nombre",
        header: "NOMBRE",
        cell: ({ row }) => (
          <div className="flex flex-col items-center justify-center w-full">
            <span style={{ fontWeight: 600 }}>{row.original.nombre}</span>
            <span style={{ fontSize: '11px', color: '#6b7280' }}>{row.original.dni}</span>
          </div>
        ),
      },
      {
        accessorKey: "estado",
        header: "ESTADO",
        cell: ({ getValue }) => {
          const val = (getValue() as string) || '';
          const lowerVal = val.toLowerCase();
          
          let displayVal = 'BAJA';
          let badgeClass = 'badge badge-estado-baja';

          if (lowerVal.includes('activo')) {
            displayVal = 'ACTIVO';
            badgeClass = 'badge badge-estado-activo';
          }

          return (
            <div className="flex justify-center items-center w-full">
              <span className={badgeClass}>{displayVal}</span>
            </div>
          );
        }
      },
      {
        accessorKey: "fechaCap",
        header: "FECHA CAP.",
        cell: ({ getValue }) => (
          <div className="flex justify-center items-center w-full">
            {getValue() as string}
          </div>
        )
      },
      // PREVIO GROUP
      {
        id: "prev_ganancia",
        header: "PREV. GANANCIA",
        accessorFn: (row) => row.previo.promGan,
        cell: ({ getValue }) => (
           <div className="flex justify-center items-center w-full td-money">
             {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(getValue() as number)}
           </div>
        )
      },
      {
        id: "prev_horas",
        header: "PREV. HORAS",
        accessorFn: (row) => row.previo.horas,
        cell: ({ getValue }) => (
          <div className="flex justify-center items-center w-full td-porcentaje">
            {(getValue() as number).toFixed(2)}
          </div>
        )
      },
      {
        id: "prev_ocup",
        header: "PREV. %OCUP",
        accessorFn: (row) => row.previo.porcOcup,
        cell: ({ getValue }) => (
          <div className="flex justify-center items-center w-full td-porcentaje">
            {(getValue() as number).toFixed(0)}%
          </div>
        )
      },
      {
        id: "prev_acept",
        header: "PREV. ACEPT",
        accessorFn: (row) => row.previo.acept,
        cell: ({ getValue }) => (
          <div className="flex justify-center items-center w-full td-porcentaje">
            {(getValue() as number).toFixed(0)}%
          </div>
        )
      },
      // POST GROUP
      {
        id: "post_ganancia",
        header: "POST GANANCIA",
        accessorFn: (row) => row.post.promGan,
        cell: ({ getValue }) => (
           <div className="flex justify-center items-center w-full td-money" style={{ fontWeight: 700 }}>
             {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(getValue() as number)}
           </div>
        )
      },
      {
        id: "post_horas",
        header: "POST HORAS",
        accessorFn: (row) => row.post.horas,
        cell: ({ getValue }) => (
          <div className="flex justify-center items-center w-full td-porcentaje">
            {(getValue() as number).toFixed(2)}
          </div>
        )
      },
      {
        id: "post_ocup",
        header: "POST %OCUP",
        accessorFn: (row) => row.post.porcOcup,
        cell: ({ getValue }) => (
          <div className="flex justify-center items-center w-full td-porcentaje">
            {(getValue() as number).toFixed(0)}%
          </div>
        )
      },
      {
        id: "post_acept",
        header: "POST ACEPT",
        accessorFn: (row) => row.post.acept,
        cell: ({ getValue }) => {
            const val = getValue() as number;
            let colorClass = "badge-baja";
            if (val >= 90) colorClass = "badge-muy-alta";
            else if (val >= 80) colorClass = "badge-alta";
            else if (val >= 70) colorClass = "badge-media";
            
            return (
              <div className="flex justify-center items-center w-full">
                <span className={`badge ${colorClass}`}>{val.toFixed(0)}%</span>
              </div>
            );
        }
      },
    ],
    []
  );

  return (
    <div className="escuela-module">
       {/* Stats */}
      <div className="escuela-stats">
        <div className="escuela-stats-grid">
          <div 
            className="stat-card cursor-pointer transition-all hover:bg-gray-50"
            onClick={() => setActiveStatFilter(null)}
          >
            <Users className="stat-icon" size={18} />
            <div className="stat-content">
              <span className="stat-value">{stats.totalConductores}</span>
              <span className="stat-label">CONDUCTORES LISTADOS</span>
            </div>
          </div>
          
          <div 
            className="stat-card cursor-pointer transition-all hover:bg-gray-50"
            onClick={() => setActiveStatFilter(activeStatFilter === 'mejoraron_ingresos' ? null : 'mejoraron_ingresos')}
          >
            <TrendingUp className="stat-icon text-green-600" size={18} />
            <div className="stat-content">
              <span className="stat-value">{stats.mejoraronIngresos}</span>
              <span className="stat-label">MEJORARON INGRESOS</span>
            </div>
          </div>

          <div 
            className="stat-card cursor-pointer transition-all hover:bg-gray-50"
            onClick={() => setActiveStatFilter(activeStatFilter === 'empeoraron_ingresos' ? null : 'empeoraron_ingresos')}
          >
            <TrendingDown className="stat-icon text-red-600" size={18} />
            <div className="stat-content">
              <span className="stat-value">{stats.empeoraronIngresos}</span>
              <span className="stat-label">BAJARON INGRESOS</span>
            </div>
          </div>

          <div 
            className="stat-card cursor-pointer transition-all hover:bg-gray-50"
            onClick={() => setActiveStatFilter(activeStatFilter === 'alta_aceptacion' ? null : 'alta_aceptacion')}
          >
            <CheckCircle className="stat-icon text-purple-600" size={18} />
            <div className="stat-content">
              <span className="stat-value">{stats.altaAceptacion}</span>
              <span className="stat-label">ALTA ACEPTACIÓN ({'>'}80%)</span>
            </div>
          </div>

          <div 
            className="stat-card cursor-pointer transition-all hover:bg-gray-50"
            onClick={() => setActiveStatFilter(activeStatFilter === 'buena_conexion' ? null : 'buena_conexion')}
          >
            <Clock className="stat-icon text-orange-600" size={18} />
            <div className="stat-content">
              <span className="stat-value">{stats.buenaConexion}</span>
              <span className="stat-label">BUENA CONEXIÓN ({'>'}5H)</span>
            </div>
          </div>
        </div>
      </div>

       {/* Filters */}
       <div className="escuela-filters-container">
         <div className="escuela-filters-bar">
           <div className="escuela-search-wrapper">
             <Search className="escuela-search-icon" size={20} />
             <input
               type="text"
               className="escuela-search-input"
               placeholder="Buscar por nombre o DNI..."
               value={globalSearch}
               onChange={(e) => setGlobalSearch(e.target.value)}
             />
           </div>
           
           <div className="flex gap-3">
            <DateFilterPill onChange={handleDateFilterChange} />
          </div>
         </div>

         {/* Table */}
         <div className="escuela-table-container">
            <DataTable
              columns={columns}
              data={filteredData}
              loading={loading}
              showSearch={false}
              emptyIcon={<Users size={64} />}
              emptyTitle="No hay conductores"
              emptyDescription="No se encontraron registros de capacitación con los filtros actuales."
            />
         </div>
       </div>
    </div>
  );
}
