// src/modules/conductores/ConductoresModule.tsx
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useMemo } from "react";
import { Eye, Edit2, Trash2, AlertTriangle, Users, UserCheck, UserX, Clock, Filter, FolderOpen, FolderPlus, Loader2, History, RefreshCw, ShieldX } from "lucide-react";
import { ActionsMenu } from "../../components/ui/ActionsMenu";
import { VerLogsButton } from "../../components/ui/VerLogsButton";

import { HistorialModal } from "../../components/ui/HistorialModal";
import { supabase } from "../../lib/supabase";
import { usePermissions } from "../../contexts/PermissionsContext";
import { useAuth } from "../../contexts/AuthContext";
import { useSede } from "../../contexts/SedeContext";
import Swal from "sweetalert2";
import { showSuccess } from "../../utils/toast";

import type {
  ConductorWithRelations,
  EstadoCivil,
  Nacionalidad,
  LicenciaCategoria,
  ConductorEstado,
  LicenciaEstado,
  LicenciaTipo,
} from "../../types/database.types";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "../../components/ui/DataTable";
import { LoadingOverlay } from "../../components/ui/LoadingOverlay";
import { ExcelColumnFilter } from "../../components/ui/DataTable/ExcelColumnFilter";
import "./ConductoresModule.css";
import { ConductorWizard } from "./components/ConductorWizard";

import { createConductorDriveFolder } from "../../services/driveService";
import { AddressAutocomplete } from "../../components/ui/AddressAutocomplete";
import { registrarHistorialConductor, registrarHistorialVehiculo } from "../../services/historialService";
import { getEstadoConductorDisplay, getEstadoConductorBadgeStyle } from "../../utils/conductorUtils";
import { normalizeDni } from "../../utils/normalizeDocuments";

// Umbral configurable: días para considerar una licencia "por vencer"
const DIAS_LICENCIA_POR_VENCER = 10;





export function ConductoresModule() {
  const { sedeActualId, aplicarFiltroSede, sedeUsuario } = useSede()
  const [conductores, setConductores] = useState<ConductorWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [selectedConductor, setSelectedConductor] =
    useState<ConductorWithRelations | null>(null);
  const [sedes, setSedes] = useState<{id: string; nombre: string}[]>([]);

  // Stats ahora se calculan con useMemo desde los datos cargados (calculatedStats)

  // Removed TanStack Table states - now handled by DataTable component

  // Catalog states
  const [estadosCiviles, setEstadosCiviles] = useState<EstadoCivil[]>([]);
  const [nacionalidades, setNacionalidades] = useState<Nacionalidad[]>([]);
  const [categoriasLicencia, setCategoriasLicencia] = useState<
    LicenciaCategoria[]
  >([]);
  const [estadosConductor, setEstadosConductor] = useState<ConductorEstado[]>(
    [],
  );
  const [estadosLicencia, setEstadosLicencia] = useState<LicenciaEstado[]>([]);
  const [tiposLicencia, setTiposLicencia] = useState<LicenciaTipo[]>([]);

  // Column filter states - Multiselect tipo Excel
  const [nombreFilter, setNombreFilter] = useState<string[]>([]);
  const [nombreSearch, setNombreSearch] = useState('');
  const [dniFilter, setDniFilter] = useState<string[]>([]);
  const [cbuFilter, setCbuFilter] = useState<string[]>([]);
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [turnoFilter, setTurnoFilter] = useState<string[]>([]);
  const [categoriaFilter, setCategoriaFilter] = useState<string[]>([]);
  const [asignacionFilter, setAsignacionFilter] = useState<string[]>([]);
  const [vencimientoFilter, setVencimientoFilter] = useState<string[]>([]);
  const [telefonoFilter, setTelefonoFilter] = useState<string[]>([]);
  const [licenciaVencerFilter] = useState(false);
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null);
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null);

  // Filtros separados para stat cards (no interfieren con filtros de columna)
  const [statCardEstadoFilter, setStatCardEstadoFilter] = useState<string[]>([]);
  const [statCardAsignacionFilter, setStatCardAsignacionFilter] = useState<string[]>([]);
  const [statCardLicenciaFilter, setStatCardLicenciaFilter] = useState(false);
  const [statCardLicenciaVencidaFilter, setStatCardLicenciaVencidaFilter] = useState(false);

  // Estados para modal de confirmación de baja
  const [showBajaConfirmModal, setShowBajaConfirmModal] = useState(false);
  const [affectedAssignments, setAffectedAssignments] = useState<any[]>([]);
  const [pendingBajaUpdate, setPendingBajaUpdate] = useState(false);
  const [asignacionesFinalizadas, setAsignacionesFinalizadas] = useState(false);

  const [historialConductor, setHistorialConductor] = useState<{ id: string; nombre: string } | null>(null);

  const { canCreateInMenu, canEditInMenu, canDeleteInMenu, isAdmin } = usePermissions();
  const { profile } = useAuth();

  // Permisos específicos para el menú de conductores
  const canCreate = canCreateInMenu("conductores");
  const canUpdate = canEditInMenu("conductores");
  const canDelete = canDeleteInMenu("conductores");

  const [formData, setFormData] = useState({
    nombres: "",
    apellidos: "",
    numero_dni: "",
    numero_cuit: "",
    cbu: "",
    monotributo: false,
    numero_licencia: "",
    licencia_categorias_ids: [] as string[], // Array de categorías de licencia
    licencia_vencimiento: "",
    licencia_estado_id: "",
    licencia_tipo_id: "",
    telefono_contacto: "",
    email: "",
    direccion: "",
    direccion_lat: null as number | null,
    direccion_lng: null as number | null,
    zona: "",
    fecha_nacimiento: "",
    estado_civil_id: "",
    nacionalidad_id: "",
    contacto_emergencia: "",
    telefono_emergencia: "",
    antecedentes_penales: false,
    cochera_propia: false,
    fecha_contratacion: "",
    fecha_reincorpoaracion: "",
    fecha_terminacion: "",
    motivo_baja: "",
    estado_id: "",
    preferencia_turno: "SIN_PREFERENCIA",
    url_documentacion: "",
    numero_ibutton: "",
    sede_id: "",
  });

  // ✅ OPTIMIZADO: Carga inicial unificada en paralelo (recarga al cambiar sede)
  useEffect(() => {
    loadAllData();
  }, [sedeActualId]);

  // Abrir detalle si viene ?id=xxx en la URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    if (idParam && !loading) {
      loadConductorDetails(idParam).then((fullDetails) => {
        if (fullDetails) {
          setSelectedConductor(fullDetails as any);
          setShowDetailsModal(true);
          // Limpiar el param de la URL sin recargar
          window.history.replaceState({}, '', window.location.pathname);
        }
      });
    }
  }, [loading]);

  // Cargar sedes para selector en wizard
  useEffect(() => {
    supabase.from('sedes').select('id, nombre').order('nombre')
      .then(({ data }) => {
        if (data) setSedes(data);
      });
  }, []);

  // Cerrar dropdown de filtro al hacer click fuera
  useEffect(() => {
    const handleClickOutside = () => {
      if (openColumnFilter) {
        setOpenColumnFilter(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openColumnFilter]);

  // Helper para obtener inicio y fin de la semana actual + semana anterior (para bajas)
  const getWeekRange = (includeLastWeek = false) => {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=domingo, 1=lunes...
    const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    
    const monday = new Date(now);
    monday.setDate(now.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);
    
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    
    // Si incluye semana anterior, retroceder 7 días el inicio
    const inicio = includeLastWeek ? new Date(monday.getTime() - 7 * 24 * 60 * 60 * 1000) : monday;
    
    return { inicio, fin: sunday };
  };

  // ✅ OPTIMIZADO: Calcular stats desde datos ya cargados (evita queries extra)
  const calculatedStats = useMemo(() => {
    const hoy = new Date();
    const enXDias = new Date();
    enXDias.setDate(enXDias.getDate() + DIAS_LICENCIA_POR_VENCER);
    const hoyStr = hoy.toISOString().split('T')[0];
    const enXDiasStr = enXDias.toISOString().split('T')[0];
    
    // Rango de la semana actual + semana anterior (para bajas)
    const { inicio: inicioSemana, fin: finSemana } = getWeekRange(true);

    // Calcular todo en UNA SOLA PASADA
    let totalConductores = 0;
    let conductoresActivos = 0;
    let conductoresBajaSemana = 0; // Bajas de la semana actual
    let conductoresAsignados = 0;
    let licenciasPorVencer = 0;
    let licenciasVencidas = 0;

    for (const c of conductores) {
      totalConductores++;

      const estadoCodigo = (c as any).conductores_estados?.codigo?.toLowerCase();

      if (estadoCodigo === 'activo') {
        conductoresActivos++;
      } else if (estadoCodigo === 'baja') {
        // Contar solo si tiene fecha_terminacion en la semana actual
        if (c.fecha_terminacion) {
          const fechaBaja = new Date(c.fecha_terminacion + 'T12:00:00');
          if (fechaBaja >= inicioSemana && fechaBaja <= finSemana) {
            conductoresBajaSemana++;
          }
        }
      }

      // Verificar si tiene vehículo asignado
      if ((c as any).vehiculo_asignado) {
        conductoresAsignados++;
      }

      // Licencias (solo conductores NO baja)
      const vencimiento = c.licencia_vencimiento;
      if (estadoCodigo !== 'baja' && vencimiento) {
        // Vencidas: fecha < hoy
        if (vencimiento < hoyStr) {
          licenciasVencidas++;
        }
        // Por vencer: entre hoy y N días
        if (estadoCodigo === 'activo' && vencimiento >= hoyStr && vencimiento <= enXDiasStr) {
          licenciasPorVencer++;
        }
      }
    }

    const conductoresDisponibles = Math.max(0, conductoresActivos - conductoresAsignados);

    return {
      totalConductores,
      conductoresActivos,
      conductoresDisponibles,
      conductoresAsignados,
      conductoresBaja: conductoresBajaSemana,
      licenciasPorVencer,
      licenciasVencidas,
    };
  }, [conductores]);

  // Helper para manejar clicks en stat cards
  // IMPORTANTE: Usar filtros separados para stat cards, NO los mismos que los filtros de columna
  const handleStatCardClick = (cardType: string) => {
    // Si se hace click en la misma card activa, solo desactivar el filtro de stat card
    if (activeStatCard === cardType) {
      setActiveStatCard(null);
      // Solo limpiar los filtros de stat card, NO los filtros de columna
      setStatCardEstadoFilter([]);
      setStatCardAsignacionFilter([]);
      setStatCardLicenciaFilter(false);
      return;
    }

    // Limpiar los filtros de stat card anteriores antes de aplicar el nuevo
    setStatCardEstadoFilter([]);
    setStatCardAsignacionFilter([]);
    setStatCardLicenciaFilter(false);
    setStatCardLicenciaVencidaFilter(false);

    // Aplicar filtro según el tipo de card (usando filtros de stat card)
    setActiveStatCard(cardType);
    switch (cardType) {
      case 'total':
        // No aplicar filtro, mostrar todos
        setActiveStatCard(null);
        break;
      case 'activos':
        setStatCardEstadoFilter(['ACTIVO']);
        break;
      case 'disponibles':
        setStatCardAsignacionFilter(['disponible']);
        break;
      case 'asignados':
        setStatCardAsignacionFilter(['asignado']);
        break;
      case 'baja':
        setStatCardEstadoFilter(['BAJA']);
        // NO filtrar por semana automáticamente, mostrar todas las bajas
        break;
      case 'licencias':
        setStatCardLicenciaFilter(true);
        break;
      case 'licenciasVencidas':
        setStatCardLicenciaVencidaFilter(true);
        break;
    }
  };

  // Generar filtros externos para mostrar en la barra de filtros del DataTable
  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = [];

    // Stat card filter
    if (activeStatCard) {
      const labels: Record<string, string> = {
        total: 'Total',
        activos: 'Activos',
        disponibles: 'Disponibles',
        asignados: 'Asignados',
        baja: 'De Baja',
        licencias: 'Licencias por Vencer',
        licenciasVencidas: 'Licencias Vencidas'
      };
      filters.push({
        id: activeStatCard,
        label: labels[activeStatCard] || activeStatCard,
        onClear: () => {
          setActiveStatCard(null);
          setStatCardEstadoFilter([]);
          setStatCardAsignacionFilter([]);
          setStatCardLicenciaFilter(false);
          setStatCardLicenciaVencidaFilter(false);
        }
      });
    }

    // Column filters
    if (nombreFilter.length > 0) {
      filters.push({
        id: 'nombre',
        label: `Nombre: ${nombreFilter.length === 1 ? nombreFilter[0] : `${nombreFilter.length} seleccionados`}`,
        onClear: () => setNombreFilter([])
      });
    }
    if (dniFilter.length > 0) {
      filters.push({
        id: 'dni',
        label: `DNI: ${dniFilter.length === 1 ? dniFilter[0] : `${dniFilter.length} seleccionados`}`,
        onClear: () => setDniFilter([])
      });
    }
    if (cbuFilter.length > 0) {
      filters.push({
        id: 'cuil',
        label: `CUIT: ${cbuFilter.length === 1 ? cbuFilter[0] : `${cbuFilter.length} seleccionados`}`,
        onClear: () => setCbuFilter([])
      });
    }
    if (turnoFilter.length > 0) {
      filters.push({
        id: 'turno',
        label: `Turno: ${turnoFilter.join(', ')}`,
        onClear: () => setTurnoFilter([])
      });
    }
    if (estadoFilter.length > 0) {
      filters.push({
        id: 'estado',
        label: `Estado: ${estadoFilter.length === 1 ? estadoFilter[0] : `${estadoFilter.length} seleccionados`}`,
        onClear: () => setEstadoFilter([])
      });
    }
    if (categoriaFilter.length > 0) {
      filters.push({
        id: 'categoria',
        label: `Categoría: ${categoriaFilter.length === 1 ? categoriaFilter[0] : `${categoriaFilter.length} seleccionados`}`,
        onClear: () => setCategoriaFilter([])
      });
    }
    if (asignacionFilter.length > 0) {
      filters.push({
        id: 'asignacion',
        label: `Asignación: ${asignacionFilter.length === 1 ? asignacionFilter[0] : `${asignacionFilter.length} seleccionados`}`,
        onClear: () => setAsignacionFilter([])
      });
    }

    return filters;
  }, [activeStatCard, nombreFilter, dniFilter, cbuFilter, turnoFilter, estadoFilter, categoriaFilter, asignacionFilter]);

  const handleClearAllFilters = () => {
    setActiveStatCard(null);
    setStatCardEstadoFilter([]);
    setStatCardAsignacionFilter([]);
    setStatCardLicenciaFilter(false);
    setNombreFilter([]);
    setDniFilter([]);
    setCbuFilter([]);
    setEstadoFilter([]);
    setTurnoFilter([]);
    setCategoriaFilter([]);
    setAsignacionFilter([]);
  };

  // ✅ OPTIMIZADO: Carga TODO en paralelo (conductores + catálogos)
  const loadAllData = async () => {
    setLoading(true);
    setError("");

    try {
      // Ejecutar TODAS las queries en paralelo
      const [
        // Query principal de conductores - SOLO campos necesarios para la tabla
        conductoresRes,
        // Query de asignaciones activas
        asignacionesRes,
        // Catálogos
        estadosCivilesRes,
        nacionalidadesRes,
        categoriasRes,
        estadosConductorRes,
        estadosLicenciaRes,
        tiposLicenciaRes,
      ] = await Promise.all([
        aplicarFiltroSede(supabase
          .from("conductores")
          .select(`
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
            motivo_baja,
            estado_id,
            created_at,
            updated_at,
            drive_folder_url,
            conductores_estados (id, codigo, descripcion),
            conductores_licencias_categorias (
              licencias_categorias (id, codigo, descripcion)
            )
          `))
          .order("created_at", { ascending: false }),
        (() => {
          const q = supabase
            .from("asignaciones_conductores")
            .select(`
              conductor_id,
              asignaciones!inner (
                estado,
                vehiculos (id, patente, marca, modelo)
              )
            `)
          if (sedeActualId) q.eq("asignaciones.sede_id", sedeActualId)
          return q.in("asignaciones.estado", ["activo", "activa"])
        })(),
        supabase.from("estados_civiles").select("id, codigo, descripcion").order("descripcion"),
        supabase.from("nacionalidades").select("id, codigo, descripcion").order("descripcion"),
        supabase.from("licencias_categorias").select("id, codigo, descripcion").order("descripcion"),
        supabase.from("conductores_estados").select("id, codigo, descripcion").order("descripcion"),
        supabase.from("licencias_estados").select("id, codigo, descripcion").order("descripcion"),
        supabase.from("licencias_tipos").select("id, codigo, descripcion").order("descripcion"),
      ]);

      // Procesar catálogos
      if (estadosCivilesRes.data) setEstadosCiviles(estadosCivilesRes.data);
      if (nacionalidadesRes.data) setNacionalidades(nacionalidadesRes.data);
      if (categoriasRes.data) setCategoriasLicencia(categoriasRes.data);
      if (estadosConductorRes.data) setEstadosConductor(estadosConductorRes.data);
      if (estadosLicenciaRes.data) setEstadosLicencia(estadosLicenciaRes.data);
      if (tiposLicenciaRes.data) setTiposLicencia(tiposLicenciaRes.data);

      // Procesar conductores
      if (conductoresRes.error) throw conductoresRes.error;

      // Crear mapa de asignaciones (optimizado con inner join)
      const asignacionesMap = new Map();
      if (asignacionesRes.data) {
        for (const asig of asignacionesRes.data as any[]) {
          if (asig?.asignaciones?.vehiculos) {
            asignacionesMap.set(asig.conductor_id, asig.asignaciones.vehiculos);
          }
        }
      }

      // Procesar conductores con sus relaciones
      if (!conductoresRes.data || conductoresRes.data.length === 0) {
        setConductores([]);
      } else {
        const conductoresConRelaciones = conductoresRes.data.map((conductor: any) => {
          const relaciones: any = { ...conductor };

          // Procesar categorías de licencia
          if (conductor.conductores_licencias_categorias?.length > 0) {
            relaciones.licencias_categorias = conductor.conductores_licencias_categorias
              .map((c: any) => c.licencias_categorias)
              .filter((c: any) => c !== null);
          }

          // Agregar vehículo asignado si existe
          if (asignacionesMap.has(conductor.id)) {
            relaciones.vehiculo_asignado = asignacionesMap.get(conductor.id);
          }

          // Agregar metadatos para búsqueda global
          const estadoCodigo = relaciones.conductores_estados?.codigo?.toLowerCase();
          const tieneAsignacion = !!relaciones.vehiculo_asignado;
          let searchMetadata = "";
          
          if (estadoCodigo === 'activo' && !tieneAsignacion) {
            searchMetadata += "Disponible ";
          }
          if (tieneAsignacion) {
            searchMetadata += "Asignado ";
          }
          
          relaciones.search_metadata = searchMetadata;

          return relaciones;
        });

        setConductores(conductoresConRelaciones);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };



  // Cargar detalles completos de un conductor (para modal de detalles/edición)
  const loadConductorDetails = async (conductorId: string) => {
    try {
      const { data, error } = await supabase
        .from("conductores")
        .select(`
          *,
          estados_civiles (id, codigo, descripcion),
          nacionalidades (id, codigo, descripcion),
          conductores_estados (id, codigo, descripcion),
          licencias_estados (id, codigo, descripcion),
          licencias_tipos (id, codigo, descripcion),
          conductores_licencias_categorias (
            licencias_categorias (id, codigo, descripcion)
          )
        `)
        .eq("id", conductorId)
        .single();

      if (error) throw error;

      // Procesar categorías
      if ((data as any)?.conductores_licencias_categorias?.length > 0) {
        (data as any).licencias_categorias = (data as any).conductores_licencias_categorias
          .map((c: any) => c.licencias_categorias)
          .filter((c: any) => c !== null);
      }

      return data;
    } catch {
      return null;
    }
  };

  const loadConductores = async (silent = false) => {
    if (!silent) setLoading(true);
    setError("");

    try {
      // ✅ OPTIMIZADO: Query paralela con campos mínimos
      const [conductoresRes, asignacionesRes] = await Promise.all([
        aplicarFiltroSede(supabase
          .from("conductores")
          .select(`
            id,
            nombres,
            apellidos,
            numero_dni,
            numero_cuit,
            preferencia_turno,
            licencia_vencimiento,
            telefono_contacto,
            fecha_contratacion,
            estado_id,
            created_at,
            drive_folder_url,
            conductores_estados (id, codigo, descripcion),
            conductores_licencias_categorias (
              licencias_categorias (id, codigo, descripcion)
            )
          `))
          .order("created_at", { ascending: false }),
        (() => {
          const q = supabase
            .from("asignaciones_conductores")
            .select(`
              conductor_id,
              asignaciones!inner (
                estado,
                vehiculos (id, patente, marca, modelo)
              )
            `)
          if (sedeActualId) q.eq("asignaciones.sede_id", sedeActualId)
          return q.in("asignaciones.estado", ["activo", "activa"])
        })()
      ]);

      if (conductoresRes.error) throw conductoresRes.error;

      // Crear mapa de asignaciones
      const asignacionesMap = new Map();
      if (asignacionesRes.data) {
        for (const asig of asignacionesRes.data as any[]) {
          if (asig?.asignaciones?.vehiculos) {
            asignacionesMap.set(asig.conductor_id, asig.asignaciones.vehiculos);
          }
        }
      }

      // Procesar conductores
      if (!conductoresRes.data || conductoresRes.data.length === 0) {
        setConductores([]);
      } else {
        const conductoresConRelaciones = conductoresRes.data.map((conductor: any) => {
          const relaciones: any = { ...conductor };

          if (conductor.conductores_licencias_categorias?.length > 0) {
            relaciones.licencias_categorias = conductor.conductores_licencias_categorias
              .map((c: any) => c.licencias_categorias)
              .filter((c: any) => c !== null);
          }

          if (asignacionesMap.has(conductor.id)) {
            relaciones.vehiculo_asignado = asignacionesMap.get(conductor.id);
          }

          return relaciones;
        });

        setConductores(conductoresConRelaciones);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!canCreate) {
      Swal.fire({
        icon: "error",
        title: "Sin permisos",
        text: "No tienes permisos para crear conductores",
        confirmButtonColor: "#ff0033",
      });
      return;
    }

    if (
      !formData.nombres ||
      !formData.apellidos ||
      !formData.licencia_vencimiento ||
      !formData.sede_id
    ) {
      Swal.fire({
        icon: "warning",
        title: "Campos requeridos",
        text: "Complete todos los campos requeridos",
        confirmButtonColor: "#ff0033",
      });
      return;
    }

    setSaving(true);
    try {
      // Validar DNI duplicado antes de crear
      if (formData.numero_dni) {
        const { data: existente } = await supabase
          .from('conductores')
          .select('id, nombres, apellidos')
          .eq('numero_dni', formData.numero_dni)
          .maybeSingle();
        if (existente) {
          setSaving(false);
          Swal.fire({
            icon: 'warning',
            title: 'DNI duplicado',
            html: `Ya existe un conductor con DNI <strong>${formData.numero_dni}</strong>:<br/><strong>${existente.apellidos}, ${existente.nombres}</strong>`,
            confirmButtonColor: '#ff0033',
          });
          return;
        }
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: newConductor, error: insertError } = await (supabase as any)
        .from("conductores")
        .insert([
          {
            nombres: formData.nombres?.toUpperCase(),
            apellidos: formData.apellidos?.toUpperCase(),
            numero_dni: formData.numero_dni || null,
            numero_cuit: formData.numero_cuit || null,
            cbu: formData.cbu || null,
            monotributo: formData.monotributo,
            numero_licencia: formData.numero_licencia || null,
            licencia_vencimiento: formData.licencia_vencimiento,
            licencia_estado_id: formData.licencia_estado_id || null,
            licencia_tipo_id: formData.licencia_tipo_id || null,
            telefono_contacto: formData.telefono_contacto || null,
            email: formData.email || null,
            direccion: formData.direccion || null,
            direccion_lat: formData.direccion_lat,
            direccion_lng: formData.direccion_lng,
            zona: formData.zona || null,
            fecha_nacimiento: formData.fecha_nacimiento || null,
            estado_civil_id: formData.estado_civil_id || null,
            nacionalidad_id: formData.nacionalidad_id || null,
            contacto_emergencia: formData.contacto_emergencia || null,
            telefono_emergencia: formData.telefono_emergencia || null,
            antecedentes_penales: formData.antecedentes_penales,
            cochera_propia: formData.cochera_propia,
            fecha_contratacion: formData.fecha_contratacion || null,
            fecha_reincorpoaracion: formData.fecha_reincorpoaracion || null,
            fecha_terminacion: formData.fecha_terminacion || null,
            motivo_baja: formData.motivo_baja || null,
            estado_id: formData.estado_id || null,
            preferencia_turno: formData.preferencia_turno || "SIN_PREFERENCIA",
            url_documentacion: formData.url_documentacion || null,
            numero_ibutton: formData.numero_ibutton || null,
            created_by: user?.id,
            created_by_name: profile?.full_name || "Sistema",
            sede_id: formData.sede_id || sedeActualId || sedeUsuario?.id,
          },
        ])
        .select();

      if (insertError) throw insertError;

      const createdConductor = newConductor?.[0];

      // Guardar categorías de licencia en la tabla de relación
      if (createdConductor && formData.licencia_categorias_ids.length > 0) {
        const categoriasRelacion = formData.licencia_categorias_ids.map((categoriaId) => ({
          conductor_id: createdConductor.id,
          licencia_categoria_id: categoriaId,
        }));

        const { error: categoriasError } = await (supabase as any)
          .from("conductores_licencias_categorias")
          .insert(categoriasRelacion);

        if (categoriasError) throw categoriasError;
      }

      // Crear carpeta en Google Drive para el conductor y guardar URL
      if (createdConductor) {
        const nombreCompleto = `${formData.nombres} ${formData.apellidos}`;

        createConductorDriveFolder(
          createdConductor.id,
          nombreCompleto,
          formData.numero_dni
        ).then(async (result) => {
          if (result.success && result.folderUrl) {
            await (supabase as any)
              .from('conductores')
              .update({ drive_folder_url: result.folderUrl })
              .eq('id', createdConductor.id);
          }
        }).catch(() => { /* silencioso */ });
      }

      showSuccess("Conductor creado");

      // Registrar historial de creación del conductor
      if (createdConductor) {
        const estadoInicial = estadosConductor.find((e: any) => e.id === formData.estado_id);
        registrarHistorialConductor({
          conductorId: createdConductor.id,
          tipoEvento: 'cambio_estado',
          estadoNuevo: estadoInicial?.codigo || 'ACTIVO',
          detalles: { nombre: `${formData.nombres} ${formData.apellidos}`, accion: 'conductor_creado' },
          modulo: 'conductores',
          sedeId: formData.sede_id || sedeActualId || sedeUsuario?.id,
        });
      }

      setShowCreateModal(false);
      resetForm();
      await loadConductores(true);
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#ff0033",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!canUpdate) {
      Swal.fire({
        icon: "error",
        title: "Sin permisos",
        text: "No tienes permisos para editar conductores",
        confirmButtonColor: "#ff0033",
      });
      return;
    }

    if (!selectedConductor) return;

    // Validar CUIT obligatorio
    const newErrors: Record<string, string> = {};
    if (!formData.numero_cuit?.trim()) {
      newErrors.numero_cuit = 'Requerido para facturación';
    }
    
    if (Object.keys(newErrors).length > 0) {
      setEditErrors(newErrors);
      Swal.fire({
        icon: "warning",
        title: "CUIT requerido",
        text: "El CUIT es obligatorio para la facturación mensual",
        confirmButtonColor: "#ff0033",
      });
      return;
    }
    setEditErrors({});

    // Detectar si está cambiando a estado "Baja"
    const bajaEstadoId = estadosConductor.find(e => e.codigo?.toLowerCase() === 'baja')?.id;
    const isChangingToBaja = bajaEstadoId &&
      formData.estado_id === bajaEstadoId &&
      selectedConductor.estado_id !== bajaEstadoId;

    if (isChangingToBaja) {
      // Validar campos obligatorios para baja
      if (!formData.fecha_terminacion) {
        Swal.fire({
          icon: "warning",
          title: "Fecha de terminación requerida",
          text: "Debes ingresar la fecha de terminación para dar de baja al conductor",
          confirmButtonColor: "#ff0033",
        });
        return;
      }
      if (!formData.motivo_baja?.trim()) {
        Swal.fire({
          icon: "warning",
          title: "Motivo de baja requerido",
          text: "Debes ingresar el motivo de baja para dar de baja al conductor",
          confirmButtonColor: "#ff0033",
        });
        return;
      }

      // Buscar asignaciones afectadas
      setSaving(true);
      const affected = await fetchAffectedAssignments(selectedConductor.id);
      setSaving(false);

      if (affected && affected.length > 0) {
        // Mostrar modal de confirmación
        setAffectedAssignments(affected);
        setShowBajaConfirmModal(true);
        return; // Detener aquí, continuar después de confirmar
      }
    }

    // No hay asignaciones afectadas o no está cambiando a Baja - proceder normalmente
    setSaving(true);
    try {
      await performConductorUpdate();

      showSuccess("Conductor actualizado");
      setShowEditModal(false);
      setSelectedConductor(null);
      resetForm();
      await loadConductores(true);
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#ff0033",
      });
    } finally {
      setSaving(false);
    }
  };

  // Función para buscar asignaciones afectadas por la baja del conductor
  const fetchAffectedAssignments = async (conductorId: string) => {
    const { data, error } = await (supabase as any)
      .from('asignaciones_conductores')
      .select(`
        id,
        asignacion_id,
        conductor_id,
        horario,
        estado,
        asignaciones!inner (
          id,
          codigo,
          horario,
          estado,
          vehiculo_id,
          notas,
          vehiculos (
            id,
            patente,
            marca,
            modelo
          )
        )
      `)
      .eq('conductor_id', conductorId)
      .in('estado', ['asignado', 'activo'])
      .in('asignaciones.estado', ['activa', 'programado']);

    if (error) {
      return [];
    }

    const rows = data || [];
    if (rows.length === 0) return [];

    // Una sola query para todos los otros conductores (evita N+1)
    const asignacionIds = rows.map((ac: any) => ac.asignacion_id);
    const { data: othersData } = await (supabase as any)
      .from('asignaciones_conductores')
      .select('id, conductor_id, horario, estado, asignacion_id')
      .in('asignacion_id', asignacionIds)
      .neq('conductor_id', conductorId)
      .in('estado', ['asignado', 'activo']);

    // Agrupar en memoria por asignacion_id
    const othersByAsignacion = new Map<string, any[]>();
    for (const oc of (othersData || [])) {
      const arr = othersByAsignacion.get(oc.asignacion_id) || [];
      arr.push(oc);
      othersByAsignacion.set(oc.asignacion_id, arr);
    }

    return rows.map((ac: any) => ({
      ...ac,
      otherConductors: othersByAsignacion.get(ac.asignacion_id) || []
    }));
  };

  // Helper para concatenar notas de asignación
  const appendNota = (notasExistentes: string | null, nuevaNota: string) =>
    notasExistentes ? `${notasExistentes}\n\n${nuevaNota}` : nuevaNota;

  // Función para procesar la finalización de asignaciones por baja
  const processConductorBaja = async (_conductorId: string, conductorNombre: string, motivoUsuario: string) => {
    const ahora = new Date().toISOString();
    const motivoBaja = `[BAJA CONDUCTOR] ${conductorNombre}: ${motivoUsuario}`;

    for (const asignacionConductor of affectedAssignments) {
      const asignacion = asignacionConductor.asignaciones;
      const horarioAsignacion = asignacion.horario; // turno or todo_dia

      if (horarioAsignacion === 'todo_dia') {
        // CARGO MODE: Cancelar asignación completa
        await handleCargoCancellation(asignacion, asignacionConductor, motivoBaja, ahora);
      } else {
        // TURNO MODE: Remover conductor del turno
        await handleTurnoCancellation(asignacionConductor, asignacion, motivoBaja, ahora);
      }
    }
  };

  // Finalización para modo CARGO
  const handleCargoCancellation = async (
    asignacion: any,
    asignacionConductor: any,
    motivoBaja: string,
    ahora: string
  ) => {
    // 1. Finalizar la asignación
    await (supabase as any)
      .from('asignaciones')
      .update({
        estado: 'completada',
        notas: appendNota(asignacion.notas, motivoBaja),
        updated_at: ahora
      })
      .eq('id', asignacion.id);

    // 2. Finalizar TODOS los registros de conductores en esta asignación (no solo el dado de baja)
    await (supabase as any)
      .from('asignaciones_conductores')
      .update({
        estado: 'completado',
        fecha_fin: ahora
      })
      .eq('asignacion_id', asignacion.id)
      .in('estado', ['asignado', 'activo']);

    // 3. Devolver vehículo a PKG_ON_BASE
    const { data: estadoPkgOn } = await (supabase as any)
      .from('vehiculos_estados')
      .select('id')
      .eq('codigo', 'PKG_ON_BASE')
      .single();

    if (estadoPkgOn && asignacion.vehiculo_id) {
      await (supabase as any)
        .from('vehiculos')
        .update({ estado_id: estadoPkgOn.id })
        .eq('id', asignacion.vehiculo_id);
    }

    // 4. Limpiar turnos ocupados
    await (supabase as any)
      .from('vehiculos_turnos_ocupados')
      .delete()
      .eq('asignacion_conductor_id', asignacionConductor.id);

    // Registrar historial para vehículo (vuelve a PKG_ON_BASE)
    if (asignacion.vehiculo_id) {
      registrarHistorialVehiculo({
        vehiculoId: asignacion.vehiculo_id,
        tipoEvento: 'asignacion_finalizada',
        estadoNuevo: 'PKG_ON_BASE',
        detalles: {
          asignacion_id: asignacion.id,
          asignacion_codigo: asignacion.codigo,
          patente: asignacion.vehiculos?.patente,
          motivo: motivoBaja,
          modo: 'CARGO',
        },
        modulo: 'conductores',
      });
    }

    // Registrar historial para conductor (asignación finalizada por baja)
    registrarHistorialConductor({
      conductorId: asignacionConductor.conductor_id,
      tipoEvento: 'asignacion_completada',
      detalles: {
        asignacion_id: asignacion.id,
        asignacion_codigo: asignacion.codigo,
        patente: asignacion.vehiculos?.patente,
        motivo: motivoBaja,
        modo: 'CARGO',
      },
      modulo: 'conductores',
    });
  };

  // Finalización para modo TURNO
  const handleTurnoCancellation = async (
    asignacionConductor: any,
    asignacion: any,
    motivoBaja: string,
    ahora: string
  ) => {
    // 1. Finalizar registro específico del conductor
    await (supabase as any)
      .from('asignaciones_conductores')
      .update({
        estado: 'completado',
        fecha_fin: ahora
      })
      .eq('id', asignacionConductor.id);

    // 2. Limpiar turnos ocupados de este conductor
    await (supabase as any)
      .from('vehiculos_turnos_ocupados')
      .delete()
      .eq('asignacion_conductor_id', asignacionConductor.id);

    // 3. Verificar si hay otro conductor activo
    // Re-consultar en tiempo real para evitar datos obsoletos del estado previo
    let otherConductors = asignacionConductor.otherConductors || [];
    if (otherConductors.length === 0) {
      // Fallback: consultar directamente la DB por si los datos precargados están desactualizados
      const { data: freshOthers } = await (supabase as any)
        .from('asignaciones_conductores')
        .select('id, conductor_id, horario, estado')
        .eq('asignacion_id', asignacion.id)
        .neq('conductor_id', asignacionConductor.conductor_id)
        .in('estado', ['asignado', 'activo']);
      otherConductors = freshOthers || [];
    }

    if (otherConductors.length > 0) {
      // Hay otro conductor - solo agregar nota de vacante
      const turnoVacante = asignacionConductor.horario === 'diurno' ? 'Turno Diurno' : 'Turno Nocturno';
      const notaVacante = `[VACANTE] ${turnoVacante} - ${motivoBaja}`;

      await (supabase as any)
        .from('asignaciones')
        .update({
          notas: appendNota(asignacion.notas, notaVacante),
          updated_at: ahora
        })
        .eq('id', asignacion.id);

      // Registrar historial para conductor (removido del turno, asignación continúa)
      registrarHistorialConductor({
        conductorId: asignacionConductor.conductor_id,
        tipoEvento: 'asignacion_completada',
        detalles: {
          asignacion_id: asignacion.id,
          asignacion_codigo: asignacion.codigo,
          patente: asignacion.vehiculos?.patente,
          motivo: motivoBaja,
          modo: 'TURNO',
          horario: asignacionConductor.horario,
          turno_vacante: turnoVacante,
          asignacion_continua: true,
        },
        modulo: 'conductores',
      });
      return;
    }

    // No hay otros conductores - finalizar asignación completa
    await (supabase as any)
      .from('asignaciones')
      .update({
        estado: 'completada',
        notas: appendNota(asignacion.notas, motivoBaja),
        updated_at: ahora
      })
      .eq('id', asignacion.id);

    // Finalizar todos los registros de asignaciones_conductores de esta asignación
    // (por si hay registros residuales con otros estados)
    await (supabase as any)
      .from('asignaciones_conductores')
      .update({ estado: 'completado', fecha_fin: ahora })
      .eq('asignacion_id', asignacion.id)
      .neq('id', asignacionConductor.id)
      .in('estado', ['asignado', 'activo']);

    // Devolver vehículo a PKG_ON_BASE
    const { data: estadoPkgOn } = await (supabase as any)
      .from('vehiculos_estados')
      .select('id')
      .eq('codigo', 'PKG_ON_BASE')
      .single();

    if (estadoPkgOn && asignacion.vehiculo_id) {
      await (supabase as any)
        .from('vehiculos')
        .update({ estado_id: estadoPkgOn.id })
        .eq('id', asignacion.vehiculo_id);
    }

    // Registrar historial para vehículo (vuelve a PKG_ON_BASE)
    if (asignacion.vehiculo_id) {
      registrarHistorialVehiculo({
        vehiculoId: asignacion.vehiculo_id,
        tipoEvento: 'asignacion_finalizada',
        estadoNuevo: 'PKG_ON_BASE',
        detalles: {
          asignacion_id: asignacion.id,
          asignacion_codigo: asignacion.codigo,
          patente: asignacion.vehiculos?.patente,
          motivo: motivoBaja,
          modo: 'TURNO',
          sin_otros_conductores: true,
        },
        modulo: 'conductores',
      });
    }

    // Registrar historial para conductor (asignación finalizada por baja)
    registrarHistorialConductor({
      conductorId: asignacionConductor.conductor_id,
      tipoEvento: 'asignacion_completada',
      detalles: {
        asignacion_id: asignacion.id,
        asignacion_codigo: asignacion.codigo,
        patente: asignacion.vehiculos?.patente,
        motivo: motivoBaja,
        modo: 'TURNO',
        horario: asignacionConductor.horario,
      },
      modulo: 'conductores',
    });
  };

  // Función que ejecuta la actualización del conductor
  const performConductorUpdate = async (motivoBajaOverride?: string) => {
    const { error: updateError } = await (supabase as any)
      .from("conductores")
      .update({
        nombres: formData.nombres?.toUpperCase(),
        apellidos: formData.apellidos?.toUpperCase(),
        numero_dni: formData.numero_dni || null,
        numero_cuit: formData.numero_cuit || null,
        cbu: formData.cbu || null,
        monotributo: formData.monotributo,
        numero_licencia: formData.numero_licencia || null,
        licencia_vencimiento: formData.licencia_vencimiento,
        licencia_estado_id: formData.licencia_estado_id || null,
        licencia_tipo_id: formData.licencia_tipo_id || null,
        telefono_contacto: formData.telefono_contacto || null,
        email: formData.email || null,
        direccion: formData.direccion || null,
        direccion_lat: formData.direccion_lat,
        direccion_lng: formData.direccion_lng,
        zona: formData.zona || null,
        fecha_nacimiento: formData.fecha_nacimiento || null,
        estado_civil_id: formData.estado_civil_id || null,
        nacionalidad_id: formData.nacionalidad_id || null,
        contacto_emergencia: formData.contacto_emergencia || null,
        telefono_emergencia: formData.telefono_emergencia || null,
        antecedentes_penales: formData.antecedentes_penales,
        cochera_propia: formData.cochera_propia,
        fecha_contratacion: formData.fecha_contratacion || null,
        fecha_reincorpoaracion: formData.fecha_reincorpoaracion || null,
        fecha_terminacion: formData.fecha_terminacion || null,
        motivo_baja: motivoBajaOverride || formData.motivo_baja || null,
        estado_id: formData.estado_id || null,
        preferencia_turno: formData.preferencia_turno || "SIN_PREFERENCIA",
        url_documentacion: formData.url_documentacion || null,
        numero_ibutton: formData.numero_ibutton || null,
        sede_id: formData.sede_id || null,
        updated_at: new Date().toISOString(),
        updated_by: profile?.full_name || "Sistema",
      })
      .eq("id", selectedConductor!.id);

    if (updateError) throw updateError;

    // Registrar historial si cambió el estado
    if (selectedConductor!.estado_id !== formData.estado_id) {
      const estadoAnterior = estadosConductor.find((e: any) => e.id === selectedConductor!.estado_id);
      const estadoNuevo = estadosConductor.find((e: any) => e.id === formData.estado_id);
      registrarHistorialConductor({
        conductorId: selectedConductor!.id,
        tipoEvento: 'cambio_estado',
        estadoAnterior: estadoAnterior?.codigo || null,
        estadoNuevo: estadoNuevo?.codigo || null,
        detalles: {
          nombre: `${formData.nombres} ${formData.apellidos}`,
          accion: 'actualizacion_conductor',
        },
        modulo: 'conductores',
        sedeId: formData.sede_id || null,
      });
    }

    // Actualizar categorías de licencia
    await (supabase as any)
      .from("conductores_licencias_categorias")
      .delete()
      .eq("conductor_id", selectedConductor!.id);

    if (formData.licencia_categorias_ids.length > 0) {
      const categoriasRelacion = formData.licencia_categorias_ids.map((categoriaId) => ({
        conductor_id: selectedConductor!.id,
        licencia_categoria_id: categoriaId,
      }));

      const { error: categoriasError } = await (supabase as any)
        .from("conductores_licencias_categorias")
        .insert(categoriasRelacion);

      if (categoriasError) throw categoriasError;
    }
  };

  // Handler para el botón "Sí" (finalizar asignaciones) y "Dar de Baja" (solo TURNO con compañero)
  // Procesa TODAS las asignaciones afectadas según su tipo:
  //   - TURNO con compañero: asignación continúa, conductor removido, turno vacante
  //   - TURNO solo / CARGO: asignación finalizada (completada), vehículo disponible
  const handleFinalizarAsignacionSi = async () => {
    if (!selectedConductor) return;

    setPendingBajaUpdate(true);
    try {
      const ahora = new Date().toISOString();
      const conductorNombre = `${selectedConductor.nombres} ${selectedConductor.apellidos}`;
      const fechaBaja = formData.fecha_terminacion || ahora.split('T')[0];
      const motivoBaja = `[BAJA CONDUCTOR] ${conductorNombre} (${fechaBaja}). Último día de facturación: ${fechaBaja}`;

      // Obtener estado PKG_ON_BASE una sola vez para todos los vehículos
      const { data: estadoPkgOn } = await (supabase as any)
        .from('vehiculos_estados')
        .select('id')
        .eq('codigo', 'PKG_ON_BASE')
        .single();

      for (const asignacionConductor of affectedAssignments) {
        const asignacion = asignacionConductor.asignaciones;
        const horarioAsignacion = asignacion.horario; // turno o todo_dia
        const tieneCompanero = asignacionConductor.otherConductors?.length > 0;

        // --- Paso común: finalizar registro del conductor dado de baja ---
        const { error: errCompletarConductor } = await (supabase as any)
          .from('asignaciones_conductores')
          .update({ estado: 'completado', fecha_fin: new Date(fechaBaja + 'T23:59:59').toISOString() })
          .eq('id', asignacionConductor.id);
        if (errCompletarConductor) throw new Error(`Error al completar conductor: ${errCompletarConductor.message}`);

        // --- Paso común: limpiar turnos ocupados del conductor dado de baja ---
        const { error: errLimpiarTurnos } = await (supabase as any)
          .from('vehiculos_turnos_ocupados')
          .delete()
          .eq('asignacion_conductor_id', asignacionConductor.id);
        if (errLimpiarTurnos) throw new Error(`Error al limpiar turnos: ${errLimpiarTurnos.message}`);

        if (horarioAsignacion === 'turno' && tieneCompanero) {
          // ─── TURNO CON COMPAÑERO: asignación continúa, turno queda vacante ───
          const turnoVacante = asignacionConductor.horario === 'diurno' ? 'Turno Diurno' : 'Turno Nocturno';
          const notaVacante = `[VACANTE] ${turnoVacante} - Baja de ${conductorNombre} (${fechaBaja}). Último día de facturación: ${fechaBaja}`;

          const { error: errNota } = await (supabase as any)
            .from('asignaciones')
            .update({
              notas: appendNota(asignacion.notas, notaVacante),
              updated_at: ahora
            })
            .eq('id', asignacion.id);
          if (errNota) throw new Error(`Error al agregar nota vacante: ${errNota.message}`);

          // Vehículo mantiene su estado (EN_USO) porque la asignación sigue activa

          // Historial conductor
          registrarHistorialConductor({
            conductorId: asignacionConductor.conductor_id,
            tipoEvento: 'asignacion_completada',
            detalles: {
              asignacion_id: asignacion.id,
              asignacion_codigo: asignacion.codigo,
              patente: asignacion.vehiculos?.patente,
              modo: 'TURNO',
              horario: asignacionConductor.horario,
              turno_vacante: turnoVacante,
              fecha_baja: fechaBaja,
              ultimo_dia_facturacion: fechaBaja,
              asignacion_continua: true,
              companero_no_afectado: true,
            },
            modulo: 'conductores',
          });

        } else {
          // ─── CARGO o TURNO SOLO: finalizar asignación completa ───
          const modo = horarioAsignacion === 'todo_dia' ? 'CARGO' : 'TURNO';

          // Finalizar la asignación
          const { error: errFinalizar } = await (supabase as any)
            .from('asignaciones')
            .update({
              estado: 'completada',
              notas: appendNota(asignacion.notas, motivoBaja),
              updated_at: ahora
            })
            .eq('id', asignacion.id);
          if (errFinalizar) throw new Error(`Error al finalizar asignación: ${errFinalizar.message}`);

          // Finalizar cualquier otro registro de conductor en esta asignación (residuales)
          await (supabase as any)
            .from('asignaciones_conductores')
            .update({ estado: 'completado', fecha_fin: new Date(fechaBaja + 'T23:59:59').toISOString() })
            .eq('asignacion_id', asignacion.id)
            .neq('id', asignacionConductor.id)
            .in('estado', ['asignado', 'activo']);

          // Vehículo a PKG_ON_BASE
          if (estadoPkgOn && asignacion.vehiculo_id) {
            await (supabase as any)
              .from('vehiculos')
              .update({ estado_id: estadoPkgOn.id })
              .eq('id', asignacion.vehiculo_id);
          }

          // Historial vehículo
          if (asignacion.vehiculo_id) {
            registrarHistorialVehiculo({
              vehiculoId: asignacion.vehiculo_id,
              tipoEvento: 'asignacion_finalizada',
              estadoNuevo: 'PKG_ON_BASE',
              detalles: {
                asignacion_id: asignacion.id,
                asignacion_codigo: asignacion.codigo,
                patente: asignacion.vehiculos?.patente,
                conductor_baja: conductorNombre,
                modo,
                fecha_baja: fechaBaja,
                ultimo_dia_facturacion: fechaBaja,
              },
              modulo: 'conductores',
            });
          }

          // Historial conductor
          registrarHistorialConductor({
            conductorId: asignacionConductor.conductor_id,
            tipoEvento: 'asignacion_completada',
            detalles: {
              asignacion_id: asignacion.id,
              asignacion_codigo: asignacion.codigo,
              patente: asignacion.vehiculos?.patente,
              modo,
              horario: asignacionConductor.horario,
              fecha_baja: fechaBaja,
              ultimo_dia_facturacion: fechaBaja,
            },
            modulo: 'conductores',
          });
        }
      }

      // Asignaciones procesadas — ahora ejecutar la baja del conductor
      await performConductorUpdate(formData.motivo_baja || 'Baja con finalización de asignaciones');

      // Registrar historial de baja
      registrarHistorialConductor({
        conductorId: selectedConductor.id,
        tipoEvento: 'baja',
        estadoAnterior: 'ACTIVO',
        estadoNuevo: 'BAJA',
        detalles: {
          nombre: `${selectedConductor.nombres} ${selectedConductor.apellidos}`,
          motivo_baja: formData.motivo_baja,
          fecha_terminacion: formData.fecha_terminacion,
          asignaciones_finalizadas: affectedAssignments?.length || 0,
        },
        modulo: 'conductores',
        sedeId: selectedConductor.sede_id,
      });

      // Cerrar modales y refrescar
      setAffectedAssignments([]);
      setAsignacionesFinalizadas(false);
      setShowBajaConfirmModal(false);
      setShowEditModal(false);
      setSelectedConductor(null);
      resetForm();
      await loadConductores(true);

      showSuccess("Baja procesada", "El conductor fue dado de baja y sus asignaciones fueron actualizadas.");
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#ff0033",
      });
    } finally {
      setPendingBajaUpdate(false);
    }
  };

  // Handler para botón "No": solo registra la baja del conductor, NO toca las asignaciones.
  // Las asignaciones quedan activas para que Onboarding/Logística las gestione después.
  const handleBajaSinFinalizar = async () => {
    if (!selectedConductor) return;

    setPendingBajaUpdate(true);
    try {
      // Solo actualizar el conductor a estado Baja
      await performConductorUpdate(formData.motivo_baja || 'Baja sin finalización de asignaciones');

      // Cerrar modales y refrescar
      setShowBajaConfirmModal(false);
      setAffectedAssignments([]);
      setShowEditModal(false);
      setSelectedConductor(null);
      resetForm();
      await loadConductores(true);

      // Registrar historial de baja
      registrarHistorialConductor({
        conductorId: selectedConductor.id,
        tipoEvento: 'baja',
        estadoAnterior: 'ACTIVO',
        estadoNuevo: 'BAJA',
        detalles: {
          nombre: `${selectedConductor.nombres} ${selectedConductor.apellidos}`,
          motivo_baja: formData.motivo_baja,
          fecha_terminacion: formData.fecha_terminacion,
          asignaciones_sin_finalizar: affectedAssignments?.length || 0,
          nota: 'Asignaciones no finalizadas - pendiente gestión por Onboarding/Logística',
        },
        modulo: 'conductores',
        sedeId: selectedConductor.sede_id,
      });

      showSuccess("Baja registrada", "El conductor fue dado de baja. Las asignaciones quedan activas para gestión de Onboarding/Logística.");
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#ff0033",
      });
    } finally {
      setPendingBajaUpdate(false);
    }
  };

  // Handler para confirmar baja con asignaciones
  const handleConfirmBaja = async (motivoBaja: string) => {
    if (!selectedConductor) return;

    setPendingBajaUpdate(true);
    try {
      // 1. Procesar cancelaciones de asignaciones
      await processConductorBaja(
        selectedConductor.id,
        `${selectedConductor.nombres} ${selectedConductor.apellidos}`,
        motivoBaja
      );

      // 2. Ejecutar actualización del conductor (incluyendo motivo)
      await performConductorUpdate(motivoBaja);

      // Cerrar modales y refrescar
      setShowBajaConfirmModal(false);
      setAffectedAssignments([]);
      setShowEditModal(false);
      setSelectedConductor(null);
      resetForm();
      await loadConductores(true);

      // Registrar historial de baja del conductor
      registrarHistorialConductor({
        conductorId: selectedConductor.id,
        tipoEvento: 'baja',
        estadoAnterior: 'ACTIVO',
        estadoNuevo: 'BAJA',
        detalles: {
          nombre: `${selectedConductor.nombres} ${selectedConductor.apellidos}`,
          motivo_baja: motivoBaja,
          fecha_terminacion: formData.fecha_terminacion,
          asignaciones_afectadas: affectedAssignments?.length || 0,
        },
        modulo: 'conductores',
        sedeId: selectedConductor.sede_id,
      });

      showSuccess("Baja procesada", "El conductor y sus asignaciones fueron actualizados");
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#ff0033",
      });
    } finally {
      setPendingBajaUpdate(false);
    }
  };

  const handleDelete = async () => {
    if (!canDelete) {
      Swal.fire({
        icon: "error",
        title: "Sin permisos",
        text: "No tienes permisos para eliminar conductores",
        confirmButtonColor: "#ff0033",
      });
      return;
    }

    if (!selectedConductor) return;

    setSaving(true);
    try {
      // Limpiar referencias en devoluciones antes de eliminar
      await (supabase as any)
        .from('devoluciones')
        .update({ conductor_id: null, conductor_nombre: null })
        .eq('conductor_id', selectedConductor.id);

      const { error: deleteError } = await supabase
        .from("conductores")
        .delete()
        .eq("id", selectedConductor.id);

      if (deleteError) throw deleteError;

      showSuccess("Conductor eliminado");
      setShowDeleteModal(false);
      setSelectedConductor(null);
      await loadConductores(true);
    } catch (err: any) {
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#ff0033",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = async (conductor: ConductorWithRelations) => {
    // Cargar detalles completos para edición
    const fullConductor = await loadConductorDetails(conductor.id);
    if (!fullConductor) return;

    setSelectedConductor(fullConductor as any);

    // Extraer IDs de categorías de licencia si existen
    const categoriasIds = Array.isArray((fullConductor as any).licencias_categorias)
      ? (fullConductor as any).licencias_categorias.map((c: any) => c.id)
      : [];

    const fc = fullConductor as any;
    setFormData({
      nombres: fc.nombres,
      apellidos: fc.apellidos,
      numero_dni: fc.numero_dni || "",
      numero_cuit: fc.numero_cuit || "",
      cbu: fc.cbu || "",
      monotributo: fc.monotributo || false,
      numero_licencia: fc.numero_licencia || "",
      licencia_categorias_ids: categoriasIds,
      licencia_vencimiento: fc.licencia_vencimiento,
      licencia_estado_id: fc.licencia_estado_id || "",
      licencia_tipo_id: fc.licencia_tipo_id || "",
      telefono_contacto: fc.telefono_contacto || "",
      email: fc.email || "",
      direccion: fc.direccion || "",
      direccion_lat: fc.direccion_lat || null,
      direccion_lng: fc.direccion_lng || null,
      zona: fc.zona || "",
      fecha_nacimiento: fc.fecha_nacimiento || "",
      estado_civil_id: fc.estado_civil_id || "",
      nacionalidad_id: fc.nacionalidad_id || "",
      contacto_emergencia: fc.contacto_emergencia || "",
      telefono_emergencia: fc.telefono_emergencia || "",
      antecedentes_penales: fc.antecedentes_penales,
      cochera_propia: fc.cochera_propia,
      fecha_contratacion: fc.fecha_contratacion || "",
      fecha_reincorpoaracion: fc.fecha_reincorpoaracion || "",
      fecha_terminacion: fc.fecha_terminacion || "",
      motivo_baja: fc.motivo_baja || "",
      estado_id: fc.estado_id || "",
      preferencia_turno: fc.preferencia_turno || "SIN_PREFERENCIA",
      url_documentacion: fc.url_documentacion || "",
      numero_ibutton: fc.numero_ibutton || "",
      sede_id: fc.sede_id || "",
    });
    setShowEditModal(true);
  };

  const openDeleteModal = (conductor: ConductorWithRelations) => {
    setSelectedConductor(conductor);
    setShowDeleteModal(true);
  };

  const resetForm = () => {
    setFormData({
      nombres: "",
      apellidos: "",
      numero_dni: "",
      numero_cuit: "",
      cbu: "",
      monotributo: false,
      numero_licencia: "",
      licencia_categorias_ids: [],
      licencia_vencimiento: "",
      licencia_estado_id: "",
      licencia_tipo_id: "",
      telefono_contacto: "",
      email: "",
      direccion: "",
      direccion_lat: null,
      direccion_lng: null,
      zona: "",
      fecha_nacimiento: "",
      estado_civil_id: "",
      nacionalidad_id: "",
      contacto_emergencia: "",
      telefono_emergencia: "",
      antecedentes_penales: false,
      cochera_propia: false,
      fecha_contratacion: "",
      fecha_reincorpoaracion: "",
      fecha_terminacion: "",
      motivo_baja: "",
      estado_id: estadosConductor.find(e => e.codigo?.toLowerCase() === 'activo')?.id || "",
      preferencia_turno: "SIN_PREFERENCIA",
      url_documentacion: "",
      numero_ibutton: "",
      sede_id: "",
    });
  };

  const getEstadoBadgeClass = (estado: string) => {
    switch (estado) {
      case "activo":
        return "badge-available";
      case "inactivo":
        return "badge-inactive";
      case "suspendido":
        return "badge-maintenance";
      default:
        return "badge-inactive";
    }
  };

  const getEstadoLabel = (estado: string) => {
    switch (estado) {
      case "activo":
        return "Activo";
      case "inactivo":
        return "Inactivo";
      case "suspendido":
        return "Suspendido";
      default:
        return estado;
    }
  };

  // Valores únicos para filtros tipo Excel
  const nombresUnicos = useMemo(() => {
    const nombres = conductores.map(c => `${c.nombres} ${c.apellidos}`).filter(Boolean);
    return [...new Set(nombres)].sort();
  }, [conductores]);



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

  // Toggle functions para multiselect
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

  // Filtrar conductores según filtros de columna Y stat cards (ambos se aplican)
  const filteredConductores = useMemo(() => {
    // ─── Sets para O(1) lookup — antes: .includes() O(k) por cada conductor ────
    const nombreSet = new Set(nombreFilter)
    const dniSet = new Set(dniFilter)
    const cbuSet = new Set(cbuFilter)
    const estadoSet = new Set(estadoFilter)
    const turnoSet = new Set(turnoFilter)
    const categoriaSet = new Set(categoriaFilter)
    const asignacionSet = new Set(asignacionFilter)
    const statCardEstadoSet = new Set(statCardEstadoFilter)
    const statCardAsigSet = new Set(statCardAsignacionFilter)

    // Calcular fechas de licencia UNA sola vez (no por conductor)
    const hoy = new Date()
    const enXDias = new Date()
    enXDias.setDate(hoy.getDate() + DIAS_LICENCIA_POR_VENCER)
    const hoyStr = hoy.toISOString().split('T')[0]
    const { inicio: inicioSemana, fin: finSemana } = (statCardEstadoSet.has('BAJA') || statCardEstadoFilter.length > 0)
      ? getWeekRange(true)
      : { inicio: new Date(0), fin: new Date(0) }

    // ─── Una sola pasada O(n) con early-return — antes: 8+ pasadas O(n) cada una ─
    const result = conductores.filter(c => {
      const estadoCodigo = c.conductores_estados?.codigo || ''
      const estadoCodigoLower = estadoCodigo.toLowerCase()
      const tieneAsignacion = !!(c as any).vehiculo_asignado
      const esActivo = estadoCodigoLower === 'activo'

      // Filtros de columna
      if (nombreSet.size > 0 && !nombreSet.has(`${c.nombres} ${c.apellidos}`)) return false
      if (dniSet.size > 0 && !dniSet.has(c.numero_dni || '')) return false
      if (cbuSet.size > 0 && !cbuSet.has(c.numero_cuit || '')) return false
      if (estadoSet.size > 0 && !estadoSet.has(estadoCodigo)) return false
      if (turnoSet.size > 0 && !turnoSet.has((c as any).preferencia_turno || 'SIN_PREFERENCIA')) return false
      if (categoriaSet.size > 0) {
        const cats = c.licencias_categorias
        if (!Array.isArray(cats) || cats.length === 0) return false
        if (!cats.some((cat: any) => categoriaSet.has(cat.codigo))) return false
      }
      if (asignacionSet.size > 0) {
        const okAsignado = asignacionSet.has('asignado') && tieneAsignacion && esActivo
        const okDisponible = asignacionSet.has('disponible') && !tieneAsignacion && esActivo
        if (!okAsignado && !okDisponible) return false
      }
      if (telefonoFilter.length > 0) {
        if (!telefonoFilter.includes((c as any).telefono_contacto || '')) return false
      }
      if (vencimientoFilter.length > 0) {
        const venc = c.licencia_vencimiento
        let categoria = 'sin_fecha'
        if (venc) {
          const fechaVenc = new Date(venc)
          if (fechaVenc < hoy) categoria = 'vencido'
          else if (fechaVenc <= enXDias) categoria = 'por_vencer'
          else categoria = 'vigente'
        }
        if (!vencimientoFilter.includes(categoria)) return false
      }
      if (licenciaVencerFilter || statCardLicenciaFilter) {
        if (estadoCodigoLower !== 'activo' || !c.licencia_vencimiento) return false
        const fechaVenc = new Date(c.licencia_vencimiento)
        if (!(fechaVenc >= hoy && fechaVenc <= enXDias)) return false
      }

      // Filtros de stat cards
      if (statCardEstadoSet.size > 0) {
        if (statCardEstadoSet.has('BAJA')) {
          if (estadoCodigo.toUpperCase() !== 'BAJA' || !c.fecha_terminacion) return false
          const fechaBaja = new Date(c.fecha_terminacion + 'T12:00:00')
          if (!(fechaBaja >= inicioSemana && fechaBaja <= finSemana)) return false
        } else {
          if (!statCardEstadoSet.has(estadoCodigo)) return false
        }
      }
      if (statCardAsigSet.size > 0) {
        const okAsignado = statCardAsigSet.has('asignado') && tieneAsignacion && esActivo
        const okDisponible = statCardAsigSet.has('disponible') && !tieneAsignacion && esActivo
        if (!okAsignado && !okDisponible) return false
      }
      if (statCardLicenciaVencidaFilter) {
        if (estadoCodigoLower === 'baja') return false
        if (!c.licencia_vencimiento || c.licencia_vencimiento >= hoyStr) return false
      }

      return true
    })

    // Ordenar: primero activos, luego baja
    return result.sort((a, b) => {
      const estadoA = a.conductores_estados?.codigo?.toLowerCase();
      const estadoB = b.conductores_estados?.codigo?.toLowerCase();
      const prioridadA = estadoA === 'activo' ? 0 : estadoA === 'baja' ? 1 : 2;
      const prioridadB = estadoB === 'activo' ? 0 : estadoB === 'baja' ? 1 : 2;
      return prioridadA - prioridadB;
    });
  }, [conductores, nombreFilter, dniFilter, cbuFilter, estadoFilter, turnoFilter, categoriaFilter, asignacionFilter, telefonoFilter, vencimientoFilter, licenciaVencerFilter, statCardEstadoFilter, statCardAsignacionFilter, statCardLicenciaFilter, statCardLicenciaVencidaFilter]);

  // Obtener lista única de estados para el filtro
  const uniqueEstados = useMemo(() => {
    const estados = new Map<string, string>();

    conductores.forEach(c => {
      if (c.conductores_estados?.codigo) {
        // Usar el helper para display consistente en el filtro
        estados.set(c.conductores_estados.codigo, getEstadoConductorDisplay(c.conductores_estados));
      }
    });

    return Array.from(estados.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [conductores]);

  // Obtener lista única de categorías de licencia para el filtro
  const uniqueCategorias = useMemo(() => {
    const categorias = new Map<string, string>();
    conductores.forEach(c => {
      if (Array.isArray(c.licencias_categorias)) {
        c.licencias_categorias.forEach((cat: any) => {
          if (cat?.codigo) {
            categorias.set(cat.codigo, cat.codigo);
          }
        });
      }
    });
    return Array.from(categorias.keys()).sort();
  }, [conductores]);

  const uniqueTelefonos = useMemo(() => {
    const tels = new Set<string>()
    conductores.forEach(c => {
      if ((c as any).telefono_contacto) tels.add((c as any).telefono_contacto)
    })
    return Array.from(tels).sort()
  }, [conductores])

  // Handler para abrir detalles de un conductor (usado en tabla y acciones)
  const handleOpenDetails = async (conductorId: string) => {
    const fullDetails = await loadConductorDetails(conductorId);
    if (fullDetails) {
      setSelectedConductor(fullDetails as any);
      setShowDetailsModal(true);
    }
  };

  // Handler para mostrar todas las categorías de licencia en popup
  const handleShowAllCategorias = (categorias: any[]) => {
    Swal.fire({
      title: 'Categorías de Licencia',
      html: `<div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; padding: 10px;">
        ${categorias.map((cat: any) => `<span style="background: rgba(59, 130, 246, 0.1); color: #3B82F6; padding: 6px 12px; border-radius: 9999px; font-size: 12px; font-weight: 600;">${cat.codigo}</span>`).join('')}
      </div>`,
      showConfirmButton: false,
      showCloseButton: true,
      width: 350,
    });
  };

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<ConductorWithRelations>[]>(
    () => [
      {
        accessorKey: "nombres",
        header: () => (
          <div className="dt-column-filter">
            <span>Conductor {nombreFilter.length > 0 && `(${nombreFilter.length})`}</span>
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
          <div style={{ textAlign: 'left' }}>
            <a
              href={`/conductores?id=${row.original.id}`}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) {
                  e.preventDefault();
                  handleOpenDetails(row.original.id);
                }
              }}
              style={{ textTransform: 'uppercase', fontWeight: 700, color: 'inherit', textDecoration: 'none', display: 'block' }}
            >
              {`${row.original.nombres} ${row.original.apellidos}`}
            </a>
            <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
              {row.original.numero_dni || '-'} · {row.original.numero_cuit || '-'}
            </span>
          </div>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "created_at",
        header: "Creación",
        cell: ({ getValue }) => {
          const val = getValue() as string;
          if (!val) return "-";
          const d = new Date(val);
          return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        },
        enableSorting: true,
      },
      {
        accessorKey: "preferencia_turno",
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
        cell: ({ getValue }) => {
          const turno = getValue() as string;
          if (!turno || turno === 'SIN_PREFERENCIA') {
            return <span className="dt-badge dt-badge-gray">Sin Pref.</span>;
          }
          if (turno === 'DIURNO') {
            return <span className="dt-badge dt-badge-yellow">Diurno</span>;
          }
          if (turno === 'NOCTURNO') {
            return <span className="dt-badge dt-badge-blue">Nocturno</span>;
          }
          if (turno === 'A_CARGO') {
            return <span className="dt-badge dt-badge-purple">A Cargo</span>;
          }
          return <span className="dt-badge dt-badge-gray">{turno}</span>;
        },
        enableSorting: true,
      },
      {
        accessorKey: "licencias_categorias",
        header: () => (
          <ExcelColumnFilter
            label="Categorias"
            options={uniqueCategorias}
            selectedValues={categoriaFilter}
            onSelectionChange={setCategoriaFilter}
            filterId="categoria"
            openFilterId={openColumnFilter}
            onOpenChange={setOpenColumnFilter}
          />
        ),
        cell: ({ row }) => {
          const categorias = row.original.licencias_categorias;
          if (Array.isArray(categorias) && categorias.length > 0) {
            const maxVisible = 1;
            const visibles = categorias.slice(0, maxVisible);
            const restantes = categorias.length - maxVisible;
            return (
              <div className="dt-categorias-cell">
                {visibles.map((cat: any, idx: number) => (
                  <span key={idx} className="dt-badge dt-badge-blue">
                    {cat.codigo}
                  </span>
                ))}
                {restantes > 0 && (
                  <button
                    type="button"
                    className="dt-badge dt-badge-gray dt-badge-more"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleShowAllCategorias(categorias);
                    }}
                    title={`Ver ${restantes} más: ${categorias.slice(maxVisible).map((c: any) => c.codigo).join(', ')}`}
                  >
                    +{restantes}
                  </button>
                )}
              </div>
            );
          }
          return "-";
        },
        enableSorting: false,
      },
      {
        accessorKey: "licencia_vencimiento",
        header: () => (
          <ExcelColumnFilter
            label="Vencimiento"
            options={['Vencido', 'Por vencer', 'Vigente', 'Sin fecha']}
            selectedValues={vencimientoFilter.map(v => v === 'vencido' ? 'Vencido' : v === 'por_vencer' ? 'Por vencer' : v === 'vigente' ? 'Vigente' : 'Sin fecha')}
            onSelectionChange={(vals) => setVencimientoFilter(vals.map(v => v === 'Vencido' ? 'vencido' : v === 'Por vencer' ? 'por_vencer' : v === 'Vigente' ? 'vigente' : 'sin_fecha'))}
            filterId="vencimiento"
            openFilterId={openColumnFilter}
            onOpenChange={setOpenColumnFilter}
          />
        ),
        cell: ({ row, getValue }) => {
          // No mostrar vencimiento para conductores de baja
          const estadoCodigo = row.original.conductores_estados?.codigo?.toLowerCase();
          if (estadoCodigo === 'baja') return '-';
          const fecha = getValue() as string;
          if (!fecha) return '-';
          return new Date(fecha).toLocaleDateString("es-AR");
        },
        enableSorting: true,
      },
      {
        accessorKey: "telefono_contacto",
        header: () => (
          <ExcelColumnFilter
            label="Teléfono"
            options={uniqueTelefonos}
            selectedValues={telefonoFilter}
            onSelectionChange={setTelefonoFilter}
            filterId="telefono"
            openFilterId={openColumnFilter}
            onOpenChange={setOpenColumnFilter}
          />
        ),
        cell: ({ getValue }) => (getValue() as string) || "-",
        enableSorting: true,
      },
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

          let badgeClass = "dt-badge dt-badge-solid-blue";
          if (codigoLower === "baja") {
            badgeClass = "dt-badge dt-badge-solid-gray";
          } else if (codigoLower === "activo") {
            badgeClass = "dt-badge dt-badge-solid-green";
          }

          const fechaTerminacion = (row.original as any).fecha_terminacion;
          const esBaja = codigoLower === "baja";

          return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
              <span className={badgeClass}>{getEstadoConductorDisplay(estado)}</span>
              {esBaja && fechaTerminacion && (
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                  {new Date(fechaTerminacion + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
              )}
            </div>
          );
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
          
          // Si está de baja, no mostrar asignación (aunque tenga datos viejos)
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
          // Mostrar "Disponible" si está activo y no tiene asignación
          const isActivo = estadoCodigo === 'activo';
          if (isActivo) {
            return <span className="dt-badge dt-badge-green">Disponible</span>;
          }
          return <span className="vehiculo-cell-na">-</span>;
        },
        enableSorting: false,
      },
      {
        id: "acciones",
        header: "",
        cell: ({ row }) => {
          const driveUrl = (row.original as any).drive_folder_url;
          
          return (
            <ActionsMenu
              actions={[
                {
                  icon: <Eye size={15} />,
                  label: 'Ver detalles',
                  onClick: () => handleOpenDetails(row.original.id)
                },
                {
                  icon: <Edit2 size={15} />,
                  label: 'Editar',
                  onClick: () => openEditModal(row.original),
                  disabled: !canUpdate,
                  variant: 'info'
                },
                {
                  icon: driveUrl ? <FolderOpen size={15} /> : <FolderPlus size={15} />,
                  label: driveUrl ? 'Ver documentos' : 'Sin carpeta',
                  onClick: () => {
                    if (driveUrl) window.open(driveUrl, '_blank')
                    else Swal.fire('Sin URL', 'Este conductor no tiene una URL de documentación configurada', 'info')
                  },
                  variant: driveUrl ? 'success' : 'default'
                },
                {
                  icon: <History size={15} />,
                  label: 'Historial',
                  onClick: () => setHistorialConductor({ id: row.original.id, nombre: `${row.original.apellidos}, ${row.original.nombres}` }),
                  hidden: !isAdmin(),
                  variant: 'info'
                },
                {
                  icon: <Trash2 size={15} />,
                  label: 'Eliminar',
                  onClick: () => openDeleteModal(row.original),
                  disabled: !canDelete,
                  variant: 'danger'
                }
              ]}
            />
          );
        },
        enableSorting: false,
      },
    ],
    [canUpdate, canDelete, nombreFilter, nombreSearch, nombresFiltrados, dniFilter, cbuFilter, estadoFilter, turnoFilter, categoriaFilter, uniqueCategorias, asignacionFilter, telefonoFilter, uniqueTelefonos, vencimientoFilter, openColumnFilter, uniqueEstados, activeStatCard],
  );

  return (
    <div className="cond-module">
      {/* Loading Overlay - bloquea toda la pantalla */}
      <LoadingOverlay show={loading} message="Cargando conductores..." size="lg" />

      {/* Stats Cards */}
      <div className="cond-stats">
        <div className="cond-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'asignados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('asignados')}
            title="Conductores activos con vehículo asignado"
          >
            <UserCheck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.conductoresAsignados}</span>
              <span className="stat-label">Activos con Auto</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'disponibles' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('disponibles')}
            title="Conductores activos esperando vehículo"
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.conductoresDisponibles}</span>
              <span className="stat-label">En Espera</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'baja' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('baja')}
            title="Conductores de baja"
          >
            <UserX size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.conductoresBaja}</span>
              <span className="stat-label">Bajas</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'licencias' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('licencias')}
            title={`Licencias por vencer en los próximos ${DIAS_LICENCIA_POR_VENCER} días (solo conductores activos)`}
          >
            <AlertTriangle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.licenciasPorVencer}</span>
              <span className="stat-label">Lic. por Vencer</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'licenciasVencidas' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('licenciasVencidas')}
            title="Conductores con licencia vencida (todos excepto baja)"
          >
            <ShieldX size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{calculatedStats.licenciasVencidas}</span>
              <span className="stat-label">Lic. Vencidas</span>
            </div>
          </div>
        </div>
      </div>

      {/* DataTable with integrated action button */}
      <DataTable
        data={filteredConductores}
        columns={columns}
        loading={loading}
        error={error}
        searchPlaceholder="Buscar por nombre, DNI, licencia..."
        emptyIcon={<Users size={64} />}
        emptyTitle="No hay conductores registrados"
        emptyDescription={
          canCreate
            ? 'Crea el primero usando el boton "+ Crear Conductor".'
            : ""
        }
        headerAction={
          <>
            <VerLogsButton tablas={['conductores', 'asignaciones', 'asignaciones_conductores']} label="Conductores" />
            <button
              className="btn-primary"
              onClick={() => {
                resetForm();
                setShowCreateModal(true);
              }}
              disabled={!canCreate}
              title={!canCreate ? "No tienes permisos para crear conductores" : ""}
            >
              + Crear Conductor
            </button>
          </>
        }
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
      />

      {/* Modales definidos en componente separado para reducir tamaño del archivo */}
      {showCreateModal && (
        <ModalCrear
          formData={formData}
          setFormData={setFormData}
          saving={saving}
          handleCreate={handleCreate}
          setShowCreateModal={setShowCreateModal}
          resetForm={resetForm}
          estadosCiviles={estadosCiviles}
          nacionalidades={nacionalidades}
          categoriasLicencia={categoriasLicencia}
          estadosConductor={estadosConductor}
          estadosLicencia={estadosLicencia}
          tiposLicencia={tiposLicencia}
          sedes={sedes}
        />
      )}
      {showEditModal && selectedConductor && (
        <ModalEditar
          formData={formData}
          setFormData={setFormData}
          saving={saving}
          handleUpdate={handleUpdate}
          setShowEditModal={setShowEditModal}
          setSelectedConductor={setSelectedConductor}
          resetForm={resetForm}
          estadosCiviles={estadosCiviles}
          nacionalidades={nacionalidades}
          categoriasLicencia={categoriasLicencia}
          estadosConductor={estadosConductor}
          estadosLicencia={estadosLicencia}
          tiposLicencia={tiposLicencia}
          sedes={sedes}
          editErrors={editErrors}
          setEditErrors={setEditErrors}
        />
      )}
      {showDeleteModal && selectedConductor && (
        <ModalEliminar
          selectedConductor={selectedConductor}
          saving={saving}
          handleDelete={handleDelete}
          setShowDeleteModal={setShowDeleteModal}
          setSelectedConductor={setSelectedConductor}
        />
      )}
      {showDetailsModal && selectedConductor && (
        <ModalDetalles
          selectedConductor={selectedConductor}
          setShowDetailsModal={setShowDetailsModal}
          getEstadoBadgeClass={getEstadoBadgeClass}
          getEstadoLabel={getEstadoLabel}
          onConductorUpdated={() => loadConductores(true)}
        />
      )}
      {showBajaConfirmModal && selectedConductor && (
        <ModalConfirmBaja
          conductor={selectedConductor}
          affectedAssignments={affectedAssignments}
          onConfirm={handleConfirmBaja}
          onCancel={() => {
            setShowBajaConfirmModal(false);
            setAffectedAssignments([]);
            setAsignacionesFinalizadas(false);
          }}
          onFinalizarSi={handleFinalizarAsignacionSi}
          onBajaSinFinalizar={handleBajaSinFinalizar}
          asignacionesFinalizadas={asignacionesFinalizadas}
          processing={pendingBajaUpdate}
        />
      )}



      {/* Modal Historial */}
      {historialConductor && (
        <HistorialModal
          tipo="conductor"
          entityId={historialConductor.id}
          entityLabel={historialConductor.nombre}
          onClose={() => setHistorialConductor(null)}
        />
      )}
    </div>
  );
}

// Componentes de modales separados para mejor organización
function ModalCrear({
  formData,
  setFormData,
  saving,
  handleCreate,
  setShowCreateModal,
  resetForm,
  estadosCiviles,
  nacionalidades,
  categoriasLicencia,
  estadosConductor,
  estadosLicencia,
  tiposLicencia,
  sedes,
}: any) {
  return (
    <div
      className="modal-overlay"
      onClick={() => !saving && setShowCreateModal(false)}
    >
      <div className="modal-content modal-wizard" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Crear Nuevo Conductor</h2>
          <button
            className="modal-close"
            onClick={() => !saving && setShowCreateModal(false)}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="modal-body" style={{ padding: 0 }}>
        <ConductorWizard
          formData={formData}
          setFormData={setFormData}
          estadosCiviles={estadosCiviles}
          nacionalidades={nacionalidades}
          categoriasLicencia={categoriasLicencia}
          estadosConductor={estadosConductor}
          estadosLicencia={estadosLicencia}
          tiposLicencia={tiposLicencia}
          sedes={sedes}
          onCancel={() => {
            setShowCreateModal(false);
            resetForm();
          }}
          onSubmit={handleCreate}
          saving={saving}
        />
        </div>
      </div>
    </div>
  );
}


function ModalEditar({
  formData,
  setFormData,
  saving,
  handleUpdate,
  setShowEditModal,
  setSelectedConductor,
  resetForm,
  estadosCiviles,
  nacionalidades,
  categoriasLicencia,
  estadosConductor,
  estadosLicencia,
  tiposLicencia,
  sedes,
  editErrors,
  setEditErrors,
}: any) {
  const [syncingEmail, setSyncingEmail] = useState(false);

  const syncEmailFromCabify = async () => {
    setSyncingEmail(true);
    try {
      const dni = normalizeDni(formData.numero_dni);
      const primerNombre = (formData.nombres || '').split(' ')[0];
      const primerApellido = (formData.apellidos || '').split(' ')[0];

      // Buscar email en cabify_historico (datos ya sincronizados)
      let email: string | null = null;

      if (dni) {
        const { data } = await supabase
          .from('cabify_historico')
          .select('email')
          .eq('dni', formData.numero_dni)
          .not('email', 'is', null)
          .neq('email', '')
          .limit(1)
          .single();
        email = data?.email || null;
      }

      if (!email && primerNombre && primerApellido) {
        const { data } = await supabase
          .from('cabify_historico')
          .select('email')
          .ilike('nombre', `%${primerNombre}%`)
          .ilike('apellido', `%${primerApellido}%`)
          .not('email', 'is', null)
          .neq('email', '')
          .limit(1)
          .single();
        email = data?.email || null;
      }

      if (!email) {
        Swal.fire({
          icon: 'info',
          title: 'Sin coincidencia',
          text: `No se encontró email en datos de Cabify con DNI "${dni || 'N/A'}" ni nombre "${primerNombre} ${primerApellido}"`,
          confirmButtonColor: '#FF0033',
        });
        return;
      }

      setFormData({ ...formData, email });
      showSuccess('Email sincronizado', email);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al sincronizar email: ' + message,
        confirmButtonColor: '#FF0033',
      });
    } finally {
      setSyncingEmail(false);
    }
  };

  return (
    <div
      className="modal-overlay"
      onClick={() => !saving && setShowEditModal(false)}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Editar Conductor</h2>
          <button
            className="modal-close"
            onClick={() => !saving && setShowEditModal(false)}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
        <div className="section-title">Información Personal</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nombres *</label>
            <input
              type="text"
              className="form-input"
              value={formData.nombres}
              onChange={(e) =>
                setFormData({ ...formData, nombres: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Apellidos *</label>
            <input
              type="text"
              className="form-input"
              value={formData.apellidos}
              onChange={(e) =>
                setFormData({ ...formData, apellidos: e.target.value })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">DNI</label>
            <input
              type="text"
              className="form-input"
              value={formData.numero_dni}
              onChange={(e) =>
                setFormData({ ...formData, numero_dni: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">CUIT *</label>
            <input
              type="text"
              className={`form-input ${editErrors.numero_cuit ? 'input-error' : ''}`}
              value={formData.numero_cuit}
              onChange={(e) => {
                setFormData({ ...formData, numero_cuit: e.target.value });
                if (editErrors.numero_cuit) setEditErrors({});
              }}
              disabled={saving}
              placeholder="20-12345678-9"
            />
            {editErrors.numero_cuit && <span className="error-message">{editErrors.numero_cuit}</span>}
          </div>
          <div className="form-group">
            <label className="form-label">Fecha de Nacimiento</label>
            <input
              type="date"
              className="form-input"
              value={formData.fecha_nacimiento}
              onChange={(e) =>
                setFormData({ ...formData, fecha_nacimiento: e.target.value })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Nacionalidad</label>
            <select
              className="form-input"
              value={formData.nacionalidad_id}
              onChange={(e) =>
                setFormData({ ...formData, nacionalidad_id: e.target.value })
              }
              disabled={saving}
            >
              <option value="">Seleccionar...</option>
              {nacionalidades.map((nacionalidad: any) => (
                <option key={nacionalidad.id} value={nacionalidad.id}>
                  {nacionalidad.descripcion}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Estado Civil</label>
            <select
              className="form-input"
              value={formData.estado_civil_id}
              onChange={(e) =>
                setFormData({ ...formData, estado_civil_id: e.target.value })
              }
              disabled={saving}
            >
              <option value="">Seleccionar...</option>
              {estadosCiviles.map((estado: any) => (
                <option key={estado.id} value={estado.id}>
                  {estado.descripcion}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Sede</label>
            <select
              className="form-input"
              value={formData.sede_id}
              onChange={(e) => setFormData({ ...formData, sede_id: e.target.value })}
              disabled={saving}
            >
              <option value="">Seleccionar...</option>
              {(sedes || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-title">Información Fiscal</div>

        <div className="form-row">
          <div className="form-group" style={{ flex: 2 }}>
            <label className="form-label">CBU</label>
            <input
              type="text"
              className="form-input"
              placeholder="0150806001000158141270"
              maxLength={22}
              value={formData.cbu}
              onChange={(e) =>
                setFormData({ ...formData, cbu: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label className="form-label">Régimen</label>
            <div
              onClick={() => !saving && setFormData({ ...formData, monotributo: !formData.monotributo })}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                padding: "10px 14px",
                backgroundColor: formData.monotributo ? "rgba(16, 185, 129, 0.1)" : "var(--bg-tertiary)",
                border: formData.monotributo ? "1px solid #10B981" : "1px solid var(--border-primary)",
                borderRadius: "8px",
                cursor: saving ? "not-allowed" : "pointer",
                transition: "all 0.2s ease",
                opacity: saving ? 0.6 : 1
              }}
            >
              <div
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "4px",
                  backgroundColor: formData.monotributo ? "#10B981" : "transparent",
                  border: formData.monotributo ? "none" : "2px solid var(--border-secondary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease"
                }}
              >
                {formData.monotributo && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6L5 9L10 3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              <span style={{ fontSize: "14px", fontWeight: "500", color: formData.monotributo ? "#10B981" : "var(--text-primary)" }}>
                Monotributo
              </span>
            </div>
          </div>
        </div>

        <div className="section-title">Licencia de Conducir</div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Nro. Licencia *</label>
            <input
              type="text"
              className="form-input"
              value={formData.numero_licencia}
              onChange={(e) =>
                setFormData({ ...formData, numero_licencia: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Categorías *</label>
            <select
              className="form-input"
              multiple
              value={formData.licencia_categorias_ids}
              onChange={(e) => {
                const selected = Array.from(
                  e.target.selectedOptions,
                  (option) => option.value
                );
                setFormData({ ...formData, licencia_categorias_ids: selected });
              }}
              disabled={saving}
              style={{ minHeight: "100px" }}
            >
              {categoriasLicencia.map((cat: any) => (
                <option key={cat.id} value={cat.id}>
                  {cat.descripcion}
                </option>
              ))}
            </select>
            <small style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px", display: "block" }}>
              Mantén presionado Ctrl (o Cmd en Mac) para seleccionar múltiples categorías
            </small>
          </div>
          <div className="form-group">
            <label className="form-label">Vencimiento *</label>
            <input
              type="date"
              className="form-input"
              value={formData.licencia_vencimiento}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  licencia_vencimiento: e.target.value,
                })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Estado Licencia</label>
            <select
              className="form-input"
              value={formData.licencia_estado_id}
              onChange={(e) =>
                setFormData({ ...formData, licencia_estado_id: e.target.value })
              }
              disabled={saving}
            >
              <option value="">Seleccionar...</option>
              {estadosLicencia.map((estado: any) => (
                <option key={estado.id} value={estado.id}>
                  {estado.descripcion}
                </option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Tipo Licencia</label>
            <select
              className="form-input"
              value={formData.licencia_tipo_id}
              onChange={(e) =>
                setFormData({ ...formData, licencia_tipo_id: e.target.value })
              }
              disabled={saving}
            >
              <option value="">Seleccionar...</option>
              {tiposLicencia.map((tipo: any) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.descripcion}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="section-title">Información de Contacto</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input
              type="tel"
              className="form-input"
              value={formData.telefono_contacto}
              onChange={(e) =>
                setFormData({ ...formData, telefono_contacto: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <input
                type="email"
                className="form-input"
                style={{ flex: 1 }}
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
                disabled={saving}
              />
              <button
                type="button"
                className="dt-btn-action dt-btn-info"
                onClick={syncEmailFromCabify}
                disabled={syncingEmail || saving}
                title="Sincronizar email desde Cabify"
                style={{ flexShrink: 0 }}
              >
                <RefreshCw size={14} className={syncingEmail ? 'spin-animation' : ''} />
              </button>
            </div>
          </div>
        </div>

        <div className="form-group" style={{ width: '100%' }}>
          <label className="form-label">Dirección</label>
          <AddressAutocomplete
            value={formData.direccion}
            onChange={(address, lat, lng) =>
              setFormData({
                ...formData,
                direccion: address,
                direccion_lat: lat ?? null,
                direccion_lng: lng ?? null
              })
            }
            disabled={saving}
            placeholder="Buscar dirección..."
          />
        </div>
        <div className="form-group" style={{ width: '100%' }}>
          <label className="form-label">Zona</label>
          <input
            type="text"
            className="form-input"
            value={formData.zona}
            onChange={(e) => setFormData({ ...formData, zona: e.target.value })}
            disabled={saving}
            placeholder="Ej: Zona Norte, CABA"
          />
        </div>

        <div className="section-title">Contacto de Emergencia</div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Nombre Contacto</label>
            <input
              type="text"
              className="form-input"
              value={formData.contacto_emergencia}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  contacto_emergencia: e.target.value,
                })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Teléfono Emergencia</label>
            <input
              type="tel"
              className="form-input"
              value={formData.telefono_emergencia}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  telefono_emergencia: e.target.value,
                })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="section-title">Información Adicional</div>

        <div className="form-row-3" style={{ marginBottom: "16px", alignItems: "center" }}>
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                className="form-checkbox"
                checked={formData.antecedentes_penales}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    antecedentes_penales: e.target.checked,
                  })
                }
                disabled={saving}
              />
              <span style={{ fontSize: "14px", fontWeight: "500" }}>
                Antecedentes Penales
              </span>
            </label>
          </div>
          <div>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                className="form-checkbox"
                checked={formData.cochera_propia}
                onChange={(e) =>
                  setFormData({ ...formData, cochera_propia: e.target.checked })
                }
                disabled={saving}
              />
              <span style={{ fontSize: "14px", fontWeight: "500" }}>
                Cochera Propia
              </span>
            </label>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Preferencia de Turno</label>
            <select
              className="form-input"
              value={formData.preferencia_turno}
              onChange={(e) =>
                setFormData({ ...formData, preferencia_turno: e.target.value })
              }
              disabled={saving}
            >
              <option value="SIN_PREFERENCIA">Ambos</option>
              <option value="DIURNO">Diurno</option>
              <option value="NOCTURNO">Nocturno</option>
              <option value="A_CARGO">A Cargo</option>
            </select>
          </div>
        </div>

        <div className="section-title">Información de Seguridad</div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Fecha de Incorporación</label>
            <input
              type="date"
              className="form-input"
              value={formData.fecha_contratacion}
              onChange={(e) =>
                setFormData({ ...formData, fecha_contratacion: e.target.value })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Fecha Reincorporación</label>
            <input
              type="date"
              className="form-input"
              value={formData.fecha_reincorpoaracion}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  fecha_reincorpoaracion: e.target.value,
                })
              }
              disabled={saving}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Estado</label>
            <select
              className="form-input"
              value={formData.estado_id}
              onChange={(e) =>
                setFormData({ ...formData, estado_id: e.target.value })
              }
              disabled={saving}
            >
              <option value="">Seleccionar...</option>
              {estadosConductor.map((estado: any) => (
                <option key={estado.id} value={estado.id}>
                  {estado.descripcion}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Campos adicionales si el estado es Baja */}
        {estadosConductor.find((e: any) => e.id === formData.estado_id)?.descripcion?.toLowerCase().includes('baja') && (
          <>
            <div className="form-row" style={{ marginTop: '12px' }}>
              <div className="form-group">
                <label className="form-label">Fecha de Terminación *</label>
                <input
                  type="date"
                  className="form-input"
                  value={formData.fecha_terminacion || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, fecha_terminacion: e.target.value })
                  }
                  disabled={saving}
                  style={{ borderColor: '#ff0033' }}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Motivo de Baja *</label>
                <textarea
                  className="form-input"
                  value={formData.motivo_baja || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, motivo_baja: e.target.value })
                  }
                  disabled={saving}
                  placeholder="Describa el motivo de la baja..."
                  rows={3}
                  style={{ borderColor: '#ff0033', resize: 'vertical' }}
                />
              </div>
            </div>
          </>
        )}

        <div className="form-section-title" style={{ marginTop: '20px' }}>Documentación e iButton</div>
        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Link de Documentación (Drive)</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                type="url"
                className="form-input"
                value={formData.url_documentacion}
                onChange={(e) =>
                  setFormData({ ...formData, url_documentacion: e.target.value })
                }
                disabled={saving}
                placeholder="https://drive.google.com/..."
                style={{ flex: 1 }}
              />
              {formData.url_documentacion && (
                <a
                  href={formData.url_documentacion}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '8px 12px' }}
                >
                  Ver
                </a>
              )}
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Número de iButton</label>
            <input
              type="text"
              className="form-input"
              value={formData.numero_ibutton}
              onChange={(e) =>
                setFormData({ ...formData, numero_ibutton: e.target.value })
              }
              disabled={saving}
              placeholder="Ej: IB-001234"
            />
          </div>
        </div>

        </div>
        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={() => {
              setShowEditModal(false);
              setSelectedConductor(null);
              resetForm();
            }}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={handleUpdate}
            disabled={saving}
          >
            {saving ? "Guardando..." : "Guardar Cambios"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEliminar({
  selectedConductor,
  saving,
  handleDelete,
  setShowDeleteModal,
  setSelectedConductor,
}: any) {
  return (
    <div
      className="modal-overlay"
      onClick={() => !saving && setShowDeleteModal(false)}
    >
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 style={{ color: "#ff0033" }}>Eliminar Conductor</h2>
          <button
            className="modal-close"
            onClick={() => !saving && setShowDeleteModal(false)}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
        <div className="delete-warning">
          <div
            className="delete-warning-title"
            style={{ display: "flex", alignItems: "center", gap: "8px" }}
          >
            <AlertTriangle size={20} /> Advertencia
          </div>
          <div className="delete-warning-text">
            Estás a punto de eliminar al conductor{" "}
            <strong>{selectedConductor.nombre_completo}</strong> (DNI:{" "}
            {selectedConductor.dni}). Esta acción es{" "}
            <strong>irreversible</strong>.
          </div>
        </div>
        <p style={{ color: "#6B7280", fontSize: "14px" }}>
          ¿Estás seguro de que deseas continuar?
        </p>
        </div>
        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={() => {
              setShowDeleteModal(false);
              setSelectedConductor(null);
            }}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={handleDelete}
            disabled={saving}
            style={{ background: "#ff0033" }}
          >
            {saving ? "Eliminando..." : "Sí, Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalDetalles({
  selectedConductor,
  setShowDetailsModal,
  onConductorUpdated,
}: any) {
  const [vehiculosAsignados, setVehiculosAsignados] = useState<any[]>([]);
  const [loadingVehiculos, setLoadingVehiculos] = useState(true);
  const [syncingEmail, setSyncingEmail] = useState(false);
  const [conductorEmail, setConductorEmail] = useState<string>(selectedConductor?.email || '');
  const [editingEmail, setEditingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);

  const saveEmail = async () => {
    if (!selectedConductor) return;
    setSavingEmail(true);
    try {
      const { error } = await supabase
        .from('conductores')
        .update({ email: conductorEmail || null })
        .eq('id', selectedConductor.id);
      if (error) throw error;
      selectedConductor.email = conductorEmail;
      onConductorUpdated?.();
      setEditingEmail(false);
      showSuccess('Email Actualizado', conductorEmail || 'Email eliminado');
    } catch (err: any) {
      Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar el email', confirmButtonColor: '#FF0033' });
    } finally {
      setSavingEmail(false);
    }
  };

  const syncEmailFromCabify = async () => {
    if (!selectedConductor) return;

    setSyncingEmail(true);
    try {
      const dni = normalizeDni(selectedConductor.numero_dni);
      const primerNombre = (selectedConductor.nombres || '').split(' ')[0];
      const primerApellido = (selectedConductor.apellidos || '').split(' ')[0];

      // Buscar email en cabify_historico (datos ya sincronizados)
      let email: string | null = null;

      if (dni) {
        const { data } = await supabase
          .from('cabify_historico')
          .select('email')
          .eq('dni', selectedConductor.numero_dni)
          .not('email', 'is', null)
          .neq('email', '')
          .limit(1)
          .single();
        email = data?.email || null;
      }

      if (!email && primerNombre && primerApellido) {
        const { data } = await supabase
          .from('cabify_historico')
          .select('email')
          .ilike('nombre', `%${primerNombre}%`)
          .ilike('apellido', `%${primerApellido}%`)
          .not('email', 'is', null)
          .neq('email', '')
          .limit(1)
          .single();
        email = data?.email || null;
      }

      if (!email) {
        Swal.fire({
          icon: 'info',
          title: 'Sin coincidencia',
          text: `No se encontró email en datos de Cabify con DNI "${dni || 'N/A'}" ni nombre "${primerNombre} ${primerApellido}"`,
          confirmButtonColor: '#FF0033',
        });
        return;
      }

      // Update in DB
      const { error } = await supabase
        .from('conductores')
        .update({ email })
        .eq('id', selectedConductor.id);

      if (error) throw error;

      setConductorEmail(email);
      selectedConductor.email = email;
      onConductorUpdated?.();
      showSuccess('Email Actualizado', `Email sincronizado: ${email}`);
    } catch (err: any) {
      const message = err instanceof Error ? err.message : String(err);
      Swal.fire({
        icon: 'error',
        title: 'Error',
        text: 'Error al sincronizar email: ' + message,
        confirmButtonColor: '#FF0033',
      });
    } finally {
      setSyncingEmail(false);
    }
  };

  // Cargar historial de vehículos asignados
  useEffect(() => {
    const fetchVehiculosAsignados = async () => {
      if (!selectedConductor?.id) return;

      setLoadingVehiculos(true);
      try {
        const { data, error } = await supabase
          .from('asignaciones_conductores')
          .select(`
            id,
            horario,
            estado,
            fecha_inicio,
            fecha_fin,
            created_at,
            asignaciones!inner (
              id,
              codigo,
              estado,
              modalidad,
              horario,
              fecha_inicio,
              fecha_fin,
              vehiculos (
                id,
                patente,
                marca,
                modelo,
                anio
              )
            )
          `)
          .eq('conductor_id', selectedConductor.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setVehiculosAsignados(data || []);
      } catch {
        // silently ignored
      } finally {
        setLoadingVehiculos(false);
      }
    };

    fetchVehiculosAsignados();
  }, [selectedConductor?.id]);

  // Helper para obtener el estado badge del conductor en la asignación
  // Tiene en cuenta tanto el estado del conductor (asignaciones_conductores.estado)
  // como el estado de la asignación padre (asignaciones.estado)
  const getConductorAsignacionEstadoBadge = (conductorEstado: string, asignacionEstado?: string) => {
    // Si la asignación padre está programada, mostrar como "Programada" sin importar el estado del conductor
    if (asignacionEstado === 'programado') {
      return { bg: 'rgba(234, 179, 8, 0.1)', color: '#A16207', label: 'Programada' };
    }
    const estados: Record<string, { bg: string; color: string; label: string }> = {
      activo: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22C55E', label: 'Activa' },
      asignado: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', label: 'Asignado' },
      cancelado: { bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', label: 'Cancelada' },
      completado: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Finalizada' },
    };
    return estados[conductorEstado] || { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: conductorEstado };
  };

  // Helper para obtener el turno badge
  const getTurnoBadge = (turno: string) => {
    if (turno === 'diurno') {
      return { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#92400E', label: 'DIURNO' };
    }
    if (turno === 'nocturno') {
      return { bg: '#DBEAFE', color: '#1E40AF', label: 'NOCTURNO' };
    }
    return { bg: '#F3F4F6', color: '#374151', label: 'A CARGO' };
  };

  return (
    <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '700px' }}>
        <div className="modal-header">
          <h2>Detalles del Conductor</h2>
          <button
            className="modal-close"
            onClick={() => setShowDetailsModal(false)}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
        <div className="section-title">Información Personal</div>
        <div className="details-grid">
          <div>
            <label className="detail-label">NOMBRES</label>
            <div className="detail-value">{selectedConductor.nombres}</div>
          </div>
          <div>
            <label className="detail-label">APELLIDOS</label>
            <div className="detail-value">{selectedConductor.apellidos}</div>
          </div>
          <div>
            <label className="detail-label">NÚMERO DNI</label>
            <div className="detail-value">
              {selectedConductor.numero_dni || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">CUIT</label>
            <div className="detail-value">
              {selectedConductor.numero_cuit || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">NÚMERO IBUTTON</label>
            <div className="detail-value">
              {(selectedConductor as any).numero_ibutton || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">MONOTRIBUTO</label>
            <div className="detail-value">
              {(selectedConductor as any).monotributo ? "Sí" : "No"}
            </div>
          </div>
          <div>
            <label className="detail-label">FECHA NACIMIENTO</label>
            <div className="detail-value">
              {selectedConductor.fecha_nacimiento
                ? new Date(
                    selectedConductor.fecha_nacimiento,
                  ).toLocaleDateString("es-AR")
                : "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">NACIONALIDAD</label>
            <div className="detail-value">
              {selectedConductor.nacionalidades?.descripcion || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">ESTADO CIVIL</label>
            <div className="detail-value">
              {selectedConductor.estados_civiles?.descripcion || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">ZONA</label>
            <div className="detail-value">
              {selectedConductor.zona || "N/A"}
            </div>
          </div>
        </div>

        <div className="section-title">Licencia de Conducir</div>
        <div className="details-grid">
          <div>
            <label className="detail-label">NRO. LICENCIA</label>
            <div className="detail-value">
              {selectedConductor.numero_licencia || "N/A"}
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="detail-label">CATEGORÍAS</label>
            <div className="detail-value" style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
              {Array.isArray((selectedConductor as any).licencias_categorias) &&
              (selectedConductor as any).licencias_categorias.length > 0
                ? (selectedConductor as any).licencias_categorias.map((cat: any, idx: number) => (
                    <span
                      key={idx}
                      style={{
                        background: "#DBEAFE",
                        color: "#1E40AF",
                        padding: "4px 8px",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "600",
                      }}
                    >
                      {cat.descripcion}
                    </span>
                  ))
                : "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">VENCIMIENTO</label>
            <div className="detail-value">
              {new Date(
                selectedConductor.licencia_vencimiento,
              ).toLocaleDateString("es-AR")}
            </div>
          </div>
          <div>
            <label className="detail-label">ESTADO</label>
            <div className="detail-value">
              {selectedConductor.licencias_estados?.descripcion || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">TIPO DE LICENCIA</label>
            <div className="detail-value">
              {selectedConductor.licencias_tipos?.descripcion || "N/A"}
            </div>
          </div>
        </div>

        <div className="section-title">Contacto</div>
        <div className="details-grid">
          <div>
            <label className="detail-label">Teléfono</label>
            <div className="detail-value">
              {selectedConductor.telefono_contacto || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">EMAIL</label>
            <div className="detail-value" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {editingEmail ? (
                <>
                  <input
                    type="email"
                    className="form-input"
                    style={{ flex: 1, padding: '4px 8px', fontSize: '13px' }}
                    value={conductorEmail}
                    onChange={(e) => setConductorEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEmail(); if (e.key === 'Escape') { setConductorEmail(selectedConductor?.email || ''); setEditingEmail(false); } }}
                    autoFocus
                    disabled={savingEmail}
                  />
                  <button
                    className="dt-btn-action dt-btn-success"
                    onClick={saveEmail}
                    disabled={savingEmail}
                    title="Guardar"
                    style={{ padding: '4px', minWidth: '24px', minHeight: '24px' }}
                  >
                    {savingEmail ? <Loader2 size={13} className="spin-animation" /> : '✓'}
                  </button>
                  <button
                    className="dt-btn-action"
                    onClick={() => { setConductorEmail(selectedConductor?.email || ''); setEditingEmail(false); }}
                    title="Cancelar"
                    style={{ padding: '4px', minWidth: '24px', minHeight: '24px' }}
                  >
                    ✕
                  </button>
                </>
              ) : (
                <>
                  <span
                    style={{ cursor: 'pointer' }}
                    onClick={() => setEditingEmail(true)}
                    title="Click para editar"
                  >
                    {conductorEmail || "N/A"}
                  </span>
                  <button
                    className="dt-btn-action dt-btn-info"
                    onClick={() => setEditingEmail(true)}
                    title="Editar email"
                    style={{ padding: '4px', minWidth: '24px', minHeight: '24px' }}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    className="dt-btn-action dt-btn-info"
                    onClick={syncEmailFromCabify}
                    disabled={syncingEmail}
                    title="Sincronizar email desde Cabify"
                    style={{ padding: '4px', minWidth: '24px', minHeight: '24px' }}
                  >
                    <RefreshCw size={13} className={syncingEmail ? 'spin-animation' : ''} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="detail-label">DIRECCIÓN</label>
            <div className="detail-value">
              {selectedConductor.direccion || "N/A"}
            </div>
          </div>
        </div>

        <div className="section-title">Contacto de Emergencia</div>
        <div className="details-grid">
          <div>
            <label className="detail-label">NOMBRE CONTACTO</label>
            <div className="detail-value">
              {selectedConductor.contacto_emergencia || "N/A"}
            </div>
          </div>
          <div>
            <label className="detail-label">TELÉFONO EMERGENCIA</label>
            <div className="detail-value">
              {selectedConductor.telefono_emergencia || "N/A"}
            </div>
          </div>
        </div>

        <div className="section-title">Estado</div>
        <div className="details-grid">
          <div>
            <label className="detail-label">ESTADO ACTUAL</label>
            <div className="detail-value">
              {(() => {
                const badgeStyle = getEstadoConductorBadgeStyle(selectedConductor.conductores_estados);
                return (
                  <span
                    className="badge"
                    style={{
                      backgroundColor: badgeStyle.bg,
                      color: badgeStyle.color,
                      padding: "4px 12px",
                      borderRadius: "12px",
                      fontSize: "12px",
                      fontWeight: "600",
                    }}
                  >
                    {getEstadoConductorDisplay(selectedConductor.conductores_estados)}
                  </span>
                );
              })()}
            </div>
          </div>
          {selectedConductor.conductores_estados?.codigo?.toLowerCase().includes('baja') && (
            <>
              <div>
                <label className="detail-label">FECHA DE TERMINACIÓN</label>
                <div className="detail-value">
                  {selectedConductor.fecha_terminacion
                    ? new Date(selectedConductor.fecha_terminacion + 'T12:00:00').toLocaleDateString("es-AR")
                    : "N/A"}
                </div>
              </div>
              <div style={{ gridColumn: "1 / -1" }}>
                <label className="detail-label">MOTIVO DE BAJA</label>
                <div className="detail-value" style={{ 
                  background: '#FEF2F2', 
                  padding: '8px 12px', 
                  borderRadius: '6px',
                  color: '#991B1B',
                  fontSize: '13px'
                }}>
                  {selectedConductor.motivo_baja || "Sin especificar"}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Historial de Vehículos Asignados */}
        <div className="section-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          Historial de Vehículos
          {!loadingVehiculos && (
            <span style={{
              fontSize: '12px',
              color: 'var(--text-tertiary)',
              fontWeight: 'normal'
            }}>
              ({vehiculosAsignados.length})
            </span>
          )}
        </div>

        <div className="vehiculos-historial-container">
          {loadingVehiculos ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: '13px'
            }}>
              Cargando historial...
            </div>
          ) : vehiculosAsignados.length === 0 ? (
            <div style={{
              padding: '20px',
              textAlign: 'center',
              color: 'var(--text-tertiary)',
              fontSize: '13px',
              background: 'var(--bg-secondary)',
              borderRadius: '8px'
            }}>
              Sin vehículos asignados
            </div>
          ) : (
            <div className="vehiculos-historial-list">
              {vehiculosAsignados.map((item) => {
                const asig = item.asignaciones;
                const vehiculo = asig?.vehiculos;
                const estadoBadge = getConductorAsignacionEstadoBadge(item.estado, asig?.estado);
                const turnoBadge = getTurnoBadge(item.horario);
                const isActiva = asig?.estado === 'activa';
                const isProgramada = asig?.estado === 'programado';

                return (
                  <div
                    key={item.id}
                    className={`vehiculo-historial-item ${isActiva ? 'activa' : ''} ${isProgramada ? 'programada' : ''}`}
                  >
                    <div className="vehiculo-info">
                      <div className="vehiculo-codigo">
                        {vehiculo?.patente || asig?.codigo || 'N/A'}
                      </div>
                      <div className="vehiculo-detalle">
                        {vehiculo?.marca && vehiculo?.modelo && (
                          <span className="vehiculo-modelo">
                            {vehiculo.marca} {vehiculo.modelo} {vehiculo.anio ? `(${vehiculo.anio})` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="vehiculo-asignacion-info">
                      <span
                        className="turno-badge"
                        style={{
                          background: turnoBadge.bg,
                          color: turnoBadge.color
                        }}
                      >
                        {turnoBadge.label}
                      </span>
                      <span
                        className="estado-asig-badge"
                        style={{
                          background: estadoBadge.bg,
                          color: estadoBadge.color
                        }}
                      >
                        {estadoBadge.label}
                      </span>
                    </div>
                    <div className="vehiculo-fecha">
                      {(item.fecha_inicio || asig?.fecha_inicio) && (
                        <span>
                          {new Date(item.fecha_inicio || asig.fecha_inicio).toLocaleDateString('es-AR')}
                          {(item.fecha_fin || asig?.fecha_fin) && ` - ${new Date(item.fecha_fin || asig.fecha_fin).toLocaleDateString('es-AR')}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        </div>
        {(() => {
          const folderUrl = (selectedConductor as any).drive_folder_url || (selectedConductor as any).url_documentacion;
          return (
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                className={folderUrl ? 'btn-success' : 'btn-secondary'}
                onClick={() => {
                  if (folderUrl) window.open(folderUrl, '_blank');
                  else Swal.fire('Sin URL', 'Este conductor no tiene una URL de documentación configurada', 'info');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {folderUrl ? <FolderOpen size={16} /> : <FolderPlus size={16} />}
                {folderUrl ? 'Ver documentos' : 'Sin carpeta'}
              </button>
              <button
                className="btn-secondary"
                onClick={() => setShowDetailsModal(false)}
              >
                Cerrar
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// Modal de confirmación para baja de conductor con asignaciones
function ModalConfirmBaja({
  conductor,
  affectedAssignments,
  onConfirm: _onConfirm,
  onCancel,
  onFinalizarSi,
  onBajaSinFinalizar,
  asignacionesFinalizadas,
  processing,
}: {
  conductor: ConductorWithRelations;
  affectedAssignments: any[];
  onConfirm: (motivo: string) => void;
  onCancel: () => void;
  onFinalizarSi: () => void;
  onBajaSinFinalizar: () => void;
  asignacionesFinalizadas: boolean;
  processing: boolean;
}) {
  const [_motivoBaja, _setMotivoBaja] = useState('');
  void _motivoBaja; void _setMotivoBaja; void _onConfirm;

  // Agrupar por tipo de asignación
  const turnoAssignments = affectedAssignments.filter(
    (a) => a.asignaciones?.horario === 'turno'
  );
  const cargoAssignments = affectedAssignments.filter(
    (a) => a.asignaciones?.horario === 'todo_dia'
  );

  // TURNO con compañero: no requiere pregunta de finalización, se resuelve automáticamente
  const turnoConCompanero = turnoAssignments.filter((a) => a.otherConductors?.length > 0);
  // TURNO solo (sin compañero): requiere pregunta igual que CARGO
  const turnoSolo = turnoAssignments.filter((a) => !a.otherConductors || a.otherConductors.length === 0);

  // Solo TURNO con compañero → flujo simplificado (no se pregunta, se da de baja directo)
  const soloTurnoConCompanero = turnoConCompanero.length > 0 && cargoAssignments.length === 0 && turnoSolo.length === 0;
  // Hay asignaciones que requieren pregunta de finalización (CARGO o TURNO solo)
  const _requiereFinalizacion = cargoAssignments.length > 0 || turnoSolo.length > 0;
  void _requiereFinalizacion;

  return (
    <div className="modal-overlay" onClick={() => !processing && onCancel()}>
      <div
        className="modal-content baja-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <div className="modal-header">
          <h2 style={{ color: '#ff0033' }}>Confirmar Baja de Conductor</h2>
          <button
            className="modal-close"
            onClick={() => !processing && onCancel()}
            type="button"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
        <div className="delete-warning" style={{ marginBottom: '20px' }}>
          <AlertTriangle size={24} />
          <div>
            <p style={{ margin: 0, fontWeight: '600' }}>
              El conductor <strong>{conductor.nombres} {conductor.apellidos}</strong> tiene{' '}
              {affectedAssignments.length} asignación(es) activa(s) o programada(s).
            </p>
            {soloTurnoConCompanero && (
              <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#6B7280' }}>
                El conductor será removido del turno. La asignación continuará con el compañero y el turno quedará como Vacante.
              </p>
            )}
          </div>
        </div>

        <div className="affected-assignments-list">
          {cargoAssignments.length > 0 && (
            <div className="assignment-group">
              <h4>
                <span className="assignment-group-badge cargo">A CARGO</span>
                {cargoAssignments.length} asignación(es)
              </h4>
              <p className="info-text">
                Estas asignaciones serán <strong>finalizadas</strong> y los vehículos volverán a estado PKG ON.
              </p>
              <div className="assignment-items">
                {cargoAssignments.map((a: any) => (
                  <div key={a.id} className="assignment-item">
                    <span className="assignment-item-code">{a.asignaciones?.codigo}</span>
                    <span className="assignment-item-vehicle">
                      {a.asignaciones?.vehiculos?.patente} - {a.asignaciones?.vehiculos?.marca} {a.asignaciones?.vehiculos?.modelo}
                    </span>
                    <span className={`assignment-item-estado ${a.asignaciones?.estado}`}>
                      {a.asignaciones?.estado === 'activa' ? 'Activa' : 'Programada'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {turnoAssignments.length > 0 && (
            <div className="assignment-group">
              <h4>
                <span className="assignment-group-badge turno">TURNO</span>
                {turnoAssignments.length} asignación(es)
              </h4>
              <p className="info-text">
                El conductor será removido de su turno.{' '}
                {turnoConCompanero.length > 0 && turnoSolo.length === 0
                  ? 'La asignación continuará con el compañero y el turno quedará como Vacante.'
                  : turnoConCompanero.length > 0 && turnoSolo.length > 0
                    ? 'Las asignaciones con otro conductor continuarán con el turno vacante. Las asignaciones sin compañero serán finalizadas.'
                    : 'Si no hay otro conductor, la asignación será finalizada.'}
              </p>
              <div className="assignment-items">
                {turnoAssignments.map((a: any) => (
                  <div key={a.id} className="assignment-item">
                    <span className="assignment-item-code">{a.asignaciones?.codigo}</span>
                    <span className="assignment-item-vehicle">
                      {a.asignaciones?.vehiculos?.patente} - {a.asignaciones?.vehiculos?.marca} {a.asignaciones?.vehiculos?.modelo}
                    </span>
                    <span className={`assignment-item-turno ${a.horario}`}>
                      {a.horario === 'diurno' ? 'Diurno' : 'Nocturno'}
                    </span>
                    <span className={`assignment-item-estado ${a.asignaciones?.estado}`}>
                      {a.asignaciones?.estado === 'activa' ? 'Activa' : 'Programada'}
                    </span>
                    {a.otherConductors?.length > 0 && (
                      <span className="assignment-item-info">
                        (Hay otro conductor asignado)
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Alerta de finalización */}
        <div style={{
          marginTop: '20px',
          padding: '16px',
          background: '#FFF8E1',
          border: '1px solid #FFD54F',
          borderRadius: '8px',
        }}>
          <p style={{
            margin: 0,
            fontWeight: 700,
            fontSize: '14px',
            color: '#F57F17',
            marginBottom: '8px',
          }}>
            ¿Finalizar la asignación del conductor ahora?
          </p>
          <p style={{
            margin: 0,
            fontSize: '13px',
            color: '#5D4037',
            lineHeight: '1.5',
          }}>
            Si el conductor debe devolver el vehículo y se le programará una devolución, selecciona <strong>Mantener asignación</strong>: Onboarding/Logística gestionará la finalización al crear la programación de devolución.
            <br /><br />
            Si el conductor ya entregó el vehículo, selecciona <strong>Finalizar asignación</strong>.
          </p>
        </div>
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button
            className="btn-secondary"
            onClick={onCancel}
            disabled={processing}
          >
            Cancelar
          </button>
          <button
            onClick={onFinalizarSi}
            disabled={processing || asignacionesFinalizadas}
            style={{
              background: asignacionesFinalizadas ? '#86EFAC' : '#16A34A',
              color: 'white',
              border: asignacionesFinalizadas ? '2px solid #16A34A' : 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: (processing || asignacionesFinalizadas) ? 'not-allowed' : 'pointer',
              opacity: (processing || asignacionesFinalizadas) ? 0.8 : 1,
            }}
          >
            {asignacionesFinalizadas ? 'Baja y asignación finalizada' : 'Dar de baja y finalizar asignación'}
          </button>
          <button
            onClick={onBajaSinFinalizar}
            disabled={processing}
            style={{
              background: '#6B7280',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.7 : 1,
            }}
          >
            {processing ? 'Procesando...' : 'Dar de baja y mantener asignación'}
          </button>
        </div>
      </div>
    </div>
  );
}
