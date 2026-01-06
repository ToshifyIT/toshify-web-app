// src/modules/conductores/ConductoresModule.tsx
import { useState, useEffect, useMemo } from "react";
import { Eye, Edit2, Trash2, AlertTriangle, Users, UserCheck, UserX, Clock, Filter } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { usePermissions } from "../../contexts/PermissionsContext";
import { useAuth } from "../../contexts/AuthContext";
import Swal from "sweetalert2";
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
import "./ConductoresModule.css";
import { ConductorWizard } from "./components/ConductorWizard";

// Helper para normalizar la visualización de estados de conductor
// Mantiene consistencia en el frontend independientemente de cómo se guarde en BD
const getEstadoConductorDisplay = (estado: { codigo?: string; descripcion?: string | null } | null | undefined): string => {
  if (!estado) return "N/A";
  const codigo = estado.codigo?.toLowerCase();
  // Mapeo consistente para el frontend
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

// Helper para obtener el estilo del badge de estado
const getEstadoConductorBadgeStyle = (estado: { codigo?: string } | null | undefined): { bg: string; color: string } => {
  if (!estado?.codigo) return { bg: '#3B82F6', color: 'white' };
  const codigo = estado.codigo.toLowerCase();
  const styles: Record<string, { bg: string; color: string }> = {
    'activo': { bg: '#22C55E', color: 'white' },
    'baja': { bg: '#6B7280', color: 'white' },
    'suspendido': { bg: '#F59E0B', color: 'white' },
    'vacaciones': { bg: '#8B5CF6', color: 'white' },
    'licencia': { bg: '#3B82F6', color: 'white' },
    'inactivo': { bg: '#6B7280', color: 'white' },
  };
  return styles[codigo] || { bg: '#3B82F6', color: 'white' };
};

export function ConductoresModule() {
  const [conductores, setConductores] = useState<ConductorWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedConductor, setSelectedConductor] =
    useState<ConductorWithRelations | null>(null);

  // Stats data para tarjetas de resumen
  const [statsData, setStatsData] = useState({
    totalConductores: 0,
    conductoresActivos: 0,
    conductoresDisponibles: 0,
    conductoresAsignados: 0,
    conductoresBaja: 0,
    licenciasPorVencer: 0,
  });

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
  const [dniSearch, setDniSearch] = useState('');
  const [cbuFilter, setCbuFilter] = useState<string[]>([]);
  const [cbuSearch, setCbuSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<string[]>([]);
  const [turnoFilter, setTurnoFilter] = useState<string[]>([]);
  const [asignacionFilter, setAsignacionFilter] = useState<string[]>([]);
  const [licenciaVencerFilter, setLicenciaVencerFilter] = useState(false);
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null);
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null);

  // Estados para modal de confirmación de baja
  const [showBajaConfirmModal, setShowBajaConfirmModal] = useState(false);
  const [affectedAssignments, setAffectedAssignments] = useState<any[]>([]);
  const [pendingBajaUpdate, setPendingBajaUpdate] = useState(false);

  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions();
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
  });

  useEffect(() => {
    loadConductores();
    loadCatalogs();
    loadStatsData();
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

  const loadStatsData = async () => {
    try {
      // Total de conductores
      const { count: totalConductores } = await supabase
        .from("conductores")
        .select("*", { count: "exact", head: true });

      // Obtener estados de conductores
      const { data: estadosCond } = await supabase
        .from("conductores_estados")
        .select("id, codigo") as { data: Array<{ id: string; codigo: string }> | null };

      const estadoActivoId = estadosCond?.find((e) => e.codigo.toLowerCase() === "activo")?.id;
      const estadoBajaId = estadosCond?.find((e) => e.codigo.toLowerCase() === "baja")?.id;

      // Conductores activos
      let conductoresActivos = 0;
      if (estadoActivoId) {
        const { count } = await supabase
          .from("conductores")
          .select("*", { count: "exact", head: true })
          .eq("estado_id", estadoActivoId);
        conductoresActivos = count || 0;
      }

      // Conductores de baja
      let conductoresBaja = 0;
      if (estadoBajaId) {
        const { count } = await supabase
          .from("conductores")
          .select("*", { count: "exact", head: true })
          .eq("estado_id", estadoBajaId);
        conductoresBaja = count || 0;
      }

      // Conductores asignados (en asignaciones activas)
      const { data: asignacionesActivas } = await supabase
        .from("asignaciones_conductores")
        .select("conductor_id")
        .in("estado", ["asignado", "activo"]) as { data: Array<{ conductor_id: string }> | null };

      const conductoresAsignadosIds = new Set(asignacionesActivas?.map((a) => a.conductor_id) || []);
      const conductoresAsignados = conductoresAsignadosIds.size;

      // Conductores disponibles = activos - asignados
      const conductoresDisponibles = Math.max(0, conductoresActivos - conductoresAsignados);

      // Licencias por vencer (próximos 30 días)
      const hoy = new Date();
      const en30Dias = new Date();
      en30Dias.setDate(en30Dias.getDate() + 30);
      const { count: licenciasPorVencer } = await supabase
        .from("conductores")
        .select("*", { count: "exact", head: true })
        .gte("licencia_vencimiento", hoy.toISOString().split("T")[0])
        .lte("licencia_vencimiento", en30Dias.toISOString().split("T")[0]);

      setStatsData({
        totalConductores: totalConductores || 0,
        conductoresActivos,
        conductoresDisponibles,
        conductoresAsignados,
        conductoresBaja,
        licenciasPorVencer: licenciasPorVencer || 0,
      });
    } catch (err) {
      console.error("Error loading stats:", err);
    }
  };

  // Helper para manejar clicks en stat cards
  const handleStatCardClick = (cardType: string) => {
    // Limpiar todos los filtros primero
    setNombreFilter([]);
    setNombreSearch('');
    setDniFilter([]);
    setDniSearch('');
    setCbuFilter([]);
    setCbuSearch('');
    setEstadoFilter([]);
    setTurnoFilter([]);
    setAsignacionFilter([]);
    setLicenciaVencerFilter(false);

    // Si se hace click en la misma card activa, solo limpiar
    if (activeStatCard === cardType) {
      setActiveStatCard(null);
      return;
    }

    // Aplicar filtro según el tipo de card
    setActiveStatCard(cardType);
    switch (cardType) {
      case 'total':
        // No aplicar filtro, mostrar todos
        setActiveStatCard(null);
        break;
      case 'activos':
        setEstadoFilter(['ACTIVO']);
        break;
      case 'disponibles':
        setAsignacionFilter(['disponible']);
        break;
      case 'asignados':
        setAsignacionFilter(['asignado']);
        break;
      case 'baja':
        setEstadoFilter(['BAJA']);
        break;
      case 'licencias':
        setLicenciaVencerFilter(true);
        break;
    }
  };

  const loadCatalogs = async () => {
    try {
      const [
        estadosCivilesRes,
        nacionalidadesRes,
        categoriasRes,
        estadosConductorRes,
        estadosLicenciaRes,
        tiposLicenciaRes,
      ] = await Promise.all([
        supabase.from("estados_civiles").select("*").order("descripcion"),
        supabase.from("nacionalidades").select("*").order("descripcion"),
        supabase.from("licencias_categorias").select("*").order("descripcion"),
        supabase.from("conductores_estados").select("*").order("descripcion"),
        supabase.from("licencias_estados").select("*").order("descripcion"),
        supabase.from("licencias_tipos").select("*").order("descripcion"),
      ]);

      if (estadosCivilesRes.data) setEstadosCiviles(estadosCivilesRes.data);
      if (nacionalidadesRes.data) setNacionalidades(nacionalidadesRes.data);
      if (categoriasRes.data) setCategoriasLicencia(categoriasRes.data);
      if (estadosConductorRes.data)
        setEstadosConductor(estadosConductorRes.data);
      if (estadosLicenciaRes.data) setEstadosLicencia(estadosLicenciaRes.data);
      if (tiposLicenciaRes.data) setTiposLicencia(tiposLicenciaRes.data);

      if (estadosCivilesRes.error)
        console.error("Error estados_civiles:", estadosCivilesRes.error);
      if (nacionalidadesRes.error)
        console.error("Error nacionalidades:", nacionalidadesRes.error);
      if (categoriasRes.error)
        console.error("Error licencias_categorias:", categoriasRes.error);
      if (estadosConductorRes.error)
        console.error("Error conductores_estados:", estadosConductorRes.error);
      if (estadosLicenciaRes.error)
        console.error("Error licencias_estados:", estadosLicenciaRes.error);
      if (tiposLicenciaRes.error)
        console.error("Error licencias_tipos:", tiposLicenciaRes.error);
    } catch (err: any) {
      console.error("Error cargando catálogos:", err);
    }
  };

  const loadConductores = async () => {
    setLoading(true);
    setError("");

    try {
      // ✅ OPTIMIZADO: Una sola query con todos los JOINs (700 queries → 1 query)
      const { data, error: fetchError } = await supabase
        .from("conductores")
        .select(`
          *,
          estados_civiles (
            id,
            codigo,
            descripcion
          ),
          nacionalidades (
            id,
            codigo,
            descripcion
          ),
          conductores_licencias_categorias (
            licencias_categorias (
              id,
              codigo,
              descripcion
            )
          ),
          conductores_estados (
            id,
            codigo,
            descripcion
          ),
          licencias_estados (
            id,
            codigo,
            descripcion
          ),
          licencias_tipos (
            id,
            codigo,
            descripcion
          )
        `)
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;

      // Procesar las relaciones en memoria (mucho más rápido que queries)
      if (data && data.length > 0) {
        // Obtener todos los IDs de conductores activos de una vez
        const conductoresActivos = data.filter((c: any) =>
          c.conductores_estados?.codigo?.toLowerCase() === "activo"
        );
        const conductoresActivosIds = conductoresActivos.map((c: any) => c.id);

        // Obtener todas las asignaciones de vehículos en una sola query
        let asignacionesMap = new Map();
        if (conductoresActivosIds.length > 0) {
          const { data: asignaciones } = await supabase
            .from("asignaciones_conductores")
            .select(`
              conductor_id,
              estado,
              asignaciones!inner (
                vehiculo_id,
                vehiculos (
                  patente,
                  marca,
                  modelo
                )
              )
            `)
            .in("conductor_id", conductoresActivosIds)
            .in("estado", ["asignado", "activo"]);

          // Mapear asignaciones por conductor_id
          if (asignaciones) {
            asignaciones.forEach((asig: any) => {
              if (asig?.asignaciones?.vehiculos) {
                asignacionesMap.set(asig.conductor_id, asig.asignaciones.vehiculos);
              }
            });
          }
        }

        // Mapear categorías de licencia
        const conductoresConRelaciones = data.map((conductor: any) => {
          const relaciones: any = { ...conductor };

          // Procesar categorías de licencia
          if (conductor.conductores_licencias_categorias && conductor.conductores_licencias_categorias.length > 0) {
            relaciones.licencias_categorias = conductor.conductores_licencias_categorias
              .map((c: any) => c.licencias_categorias)
              .filter((c: any) => c !== null);
          }

          // Agregar vehículo asignado si existe
          if (asignacionesMap.has(conductor.id)) {
            relaciones.vehiculo_asignado = asignacionesMap.get(conductor.id);
          }

          return relaciones;
        });

        setConductores(conductoresConRelaciones);
      } else {
        setConductores([]);
      }
    } catch (err: any) {
      console.error("Error cargando conductores:", err);
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
        confirmButtonColor: "#E63946",
      });
      return;
    }

    if (
      !formData.nombres ||
      !formData.apellidos ||
      !formData.licencia_vencimiento
    ) {
      Swal.fire({
        icon: "warning",
        title: "Campos requeridos",
        text: "Complete todos los campos requeridos",
        confirmButtonColor: "#E63946",
      });
      return;
    }

    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: newConductor, error: insertError } = await (supabase as any)
        .from("conductores")
        .insert([
          {
            nombres: formData.nombres,
            apellidos: formData.apellidos,
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
            created_by: user?.id,
            created_by_name: profile?.full_name || "Sistema",
          },
        ])
        .select();

      if (insertError) throw insertError;

      // Guardar categorías de licencia en la tabla de relación
      if (newConductor && newConductor.length > 0 && formData.licencia_categorias_ids.length > 0) {
        const conductorId = newConductor[0].id;
        const categoriasRelacion = formData.licencia_categorias_ids.map((categoriaId) => ({
          conductor_id: conductorId,
          licencia_categoria_id: categoriaId,
        }));

        const { error: categoriasError } = await (supabase as any)
          .from("conductores_licencias_categorias")
          .insert(categoriasRelacion);

        if (categoriasError) throw categoriasError;
      }

      Swal.fire({
        icon: "success",
        title: "¡Éxito!",
        text: "Conductor creado exitosamente",
        confirmButtonColor: "#E63946",
        timer: 2000,
      });
      setShowCreateModal(false);
      resetForm();
      await loadConductores();
    } catch (err: any) {
      console.error("Error creando conductor:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#E63946",
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
        confirmButtonColor: "#E63946",
      });
      return;
    }

    if (!selectedConductor) return;

    // Detectar si está cambiando a estado "Baja"
    const bajaEstadoId = estadosConductor.find(e => e.codigo?.toLowerCase() === 'baja')?.id;
    const isChangingToBaja = bajaEstadoId &&
      formData.estado_id === bajaEstadoId &&
      selectedConductor.estado_id !== bajaEstadoId;

    if (isChangingToBaja) {
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

      Swal.fire({
        icon: "success",
        title: "¡Éxito!",
        text: "Conductor actualizado exitosamente",
        confirmButtonColor: "#E63946",
        timer: 2000,
      });
      setShowEditModal(false);
      setSelectedConductor(null);
      resetForm();
      await loadConductores();
    } catch (err: any) {
      console.error("Error actualizando conductor:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#E63946",
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
      console.error('Error fetching affected assignments:', error);
      return [];
    }

    // Para cada asignación, obtener los otros conductores (para determinar si queda vacante)
    const assignmentsWithOthers = await Promise.all(
      (data || []).map(async (ac: any) => {
        const { data: otherConductors } = await (supabase as any)
          .from('asignaciones_conductores')
          .select('id, conductor_id, horario, estado')
          .eq('asignacion_id', ac.asignacion_id)
          .neq('conductor_id', conductorId)
          .in('estado', ['asignado', 'activo']);

        return {
          ...ac,
          otherConductors: otherConductors || []
        };
      })
    );

    return assignmentsWithOthers;
  };

  // Función para procesar la cancelación de asignaciones por baja
  const processConductorBaja = async (_conductorId: string, conductorNombre: string) => {
    const ahora = new Date().toISOString();
    const motivoBaja = `[BAJA CONDUCTOR] Conductor dado de baja: ${conductorNombre}`;

    for (const asignacionConductor of affectedAssignments) {
      const asignacion = asignacionConductor.asignaciones;
      const horarioAsignacion = asignacion.horario; // TURNO or CARGO

      if (horarioAsignacion === 'CARGO') {
        // CARGO MODE: Cancelar asignación completa
        await handleCargoCancellation(asignacion, asignacionConductor, motivoBaja, ahora);
      } else {
        // TURNO MODE: Remover conductor del turno
        await handleTurnoCancellation(asignacionConductor, asignacion, motivoBaja, ahora);
      }
    }
  };

  // Cancelación para modo CARGO
  const handleCargoCancellation = async (
    asignacion: any,
    asignacionConductor: any,
    motivoBaja: string,
    ahora: string
  ) => {
    // 1. Cancelar la asignación
    const notasActualizadas = asignacion.notas
      ? `${asignacion.notas}\n\n${motivoBaja}`
      : motivoBaja;

    await (supabase as any)
      .from('asignaciones')
      .update({
        estado: 'cancelada',
        notas: notasActualizadas,
        updated_at: ahora
      })
      .eq('id', asignacion.id);

    // 2. Actualizar registro del conductor en junction table
    await (supabase as any)
      .from('asignaciones_conductores')
      .update({
        estado: 'cancelado',
        fecha_fin: ahora
      })
      .eq('id', asignacionConductor.id);

    // 3. Devolver vehículo a DISPONIBLE
    const { data: estadoDisponible } = await (supabase as any)
      .from('vehiculos_estados')
      .select('id')
      .eq('codigo', 'DISPONIBLE')
      .single();

    if (estadoDisponible && asignacion.vehiculo_id) {
      await (supabase as any)
        .from('vehiculos')
        .update({ estado_id: estadoDisponible.id })
        .eq('id', asignacion.vehiculo_id);
    }

    // 4. Limpiar turnos ocupados
    await (supabase as any)
      .from('vehiculos_turnos_ocupados')
      .delete()
      .eq('asignacion_conductor_id', asignacionConductor.id);
  };

  // Cancelación para modo TURNO
  const handleTurnoCancellation = async (
    asignacionConductor: any,
    asignacion: any,
    motivoBaja: string,
    ahora: string
  ) => {
    // 1. Cancelar registro específico del conductor
    await (supabase as any)
      .from('asignaciones_conductores')
      .update({
        estado: 'cancelado',
        fecha_fin: ahora
      })
      .eq('id', asignacionConductor.id);

    // 2. Limpiar turnos ocupados de este conductor
    await (supabase as any)
      .from('vehiculos_turnos_ocupados')
      .delete()
      .eq('asignacion_conductor_id', asignacionConductor.id);

    // 3. Verificar si hay otro conductor activo
    const otherConductors = asignacionConductor.otherConductors || [];

    if (otherConductors.length === 0) {
      // No hay otros conductores - cancelar asignación completa
      const notasActualizadas = asignacion.notas
        ? `${asignacion.notas}\n\n${motivoBaja}`
        : motivoBaja;

      await (supabase as any)
        .from('asignaciones')
        .update({
          estado: 'cancelada',
          notas: notasActualizadas,
          updated_at: ahora
        })
        .eq('id', asignacion.id);

      // Devolver vehículo a DISPONIBLE
      const { data: estadoDisponible } = await (supabase as any)
        .from('vehiculos_estados')
        .select('id')
        .eq('codigo', 'DISPONIBLE')
        .single();

      if (estadoDisponible && asignacion.vehiculo_id) {
        await (supabase as any)
          .from('vehiculos')
          .update({ estado_id: estadoDisponible.id })
          .eq('id', asignacion.vehiculo_id);
      }
    } else {
      // Hay otro conductor - solo agregar nota de vacante
      const turnoVacante = asignacionConductor.horario === 'diurno' ? 'Turno Diurno' : 'Turno Nocturno';
      const notaVacante = `[VACANTE] ${turnoVacante} - ${motivoBaja}`;
      const notasActualizadas = asignacion.notas
        ? `${asignacion.notas}\n\n${notaVacante}`
        : notaVacante;

      await (supabase as any)
        .from('asignaciones')
        .update({
          notas: notasActualizadas,
          updated_at: ahora
        })
        .eq('id', asignacion.id);
    }
  };

  // Función que ejecuta la actualización del conductor
  const performConductorUpdate = async () => {
    const { error: updateError } = await (supabase as any)
      .from("conductores")
      .update({
        nombres: formData.nombres,
        apellidos: formData.apellidos,
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
        updated_at: new Date().toISOString(),
        updated_by: profile?.full_name || "Sistema",
      })
      .eq("id", selectedConductor!.id);

    if (updateError) throw updateError;

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

  // Handler para confirmar baja con asignaciones
  const handleConfirmBaja = async () => {
    if (!selectedConductor) return;

    setPendingBajaUpdate(true);
    try {
      // 1. Procesar cancelaciones de asignaciones
      await processConductorBaja(
        selectedConductor.id,
        `${selectedConductor.nombres} ${selectedConductor.apellidos}`
      );

      // 2. Ejecutar actualización del conductor
      await performConductorUpdate();

      // 3. Cerrar modales y refrescar
      setShowBajaConfirmModal(false);
      setAffectedAssignments([]);
      setShowEditModal(false);
      setSelectedConductor(null);
      resetForm();
      await loadConductores();

      Swal.fire({
        icon: "success",
        title: "¡Baja procesada!",
        text: "El conductor ha sido dado de baja y sus asignaciones han sido actualizadas",
        confirmButtonColor: "#E63946",
        timer: 3000,
      });
    } catch (err: any) {
      console.error("Error procesando baja:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#E63946",
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
        confirmButtonColor: "#E63946",
      });
      return;
    }

    if (!selectedConductor) return;

    setSaving(true);
    try {
      const { error: deleteError } = await supabase
        .from("conductores")
        .delete()
        .eq("id", selectedConductor.id);

      if (deleteError) throw deleteError;

      Swal.fire({
        icon: "success",
        title: "¡Éxito!",
        text: "Conductor eliminado exitosamente",
        confirmButtonColor: "#E63946",
        timer: 2000,
      });
      setShowDeleteModal(false);
      setSelectedConductor(null);
      await loadConductores();
    } catch (err: any) {
      console.error("Error eliminando conductor:", err);
      Swal.fire({
        icon: "error",
        title: "Error",
        text: err.message,
        confirmButtonColor: "#E63946",
      });
    } finally {
      setSaving(false);
    }
  };

  const openEditModal = (conductor: ConductorWithRelations) => {
    setSelectedConductor(conductor);

    // Extraer IDs de categorías de licencia si existen
    const categoriasIds = Array.isArray((conductor as any).licencias_categorias)
      ? (conductor as any).licencias_categorias.map((c: any) => c.id)
      : [];

    setFormData({
      nombres: conductor.nombres,
      apellidos: conductor.apellidos,
      numero_dni: conductor.numero_dni || "",
      numero_cuit: conductor.numero_cuit || "",
      cbu: (conductor as any).cbu || "",
      monotributo: (conductor as any).monotributo || false,
      numero_licencia: conductor.numero_licencia || "",
      licencia_categorias_ids: categoriasIds,
      licencia_vencimiento: conductor.licencia_vencimiento,
      licencia_estado_id: conductor.licencia_estado_id || "",
      licencia_tipo_id: conductor.licencia_tipo_id || "",
      telefono_contacto: conductor.telefono_contacto || "",
      email: conductor.email || "",
      direccion: conductor.direccion || "",
      zona: conductor.zona || "",
      fecha_nacimiento: conductor.fecha_nacimiento || "",
      estado_civil_id: conductor.estado_civil_id || "",
      nacionalidad_id: conductor.nacionalidad_id || "",
      contacto_emergencia: conductor.contacto_emergencia || "",
      telefono_emergencia: conductor.telefono_emergencia || "",
      antecedentes_penales: conductor.antecedentes_penales,
      cochera_propia: conductor.cochera_propia,
      fecha_contratacion: conductor.fecha_contratacion || "",
      fecha_reincorpoaracion: conductor.fecha_reincorpoaracion || "",
      fecha_terminacion: conductor.fecha_terminacion || "",
      motivo_baja: conductor.motivo_baja || "",
      estado_id: conductor.estado_id || "",
      preferencia_turno: (conductor as any).preferencia_turno || "SIN_PREFERENCIA",
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

  const dnisUnicos = useMemo(() => {
    const dnis = conductores.map(c => c.numero_dni).filter(Boolean) as string[];
    return [...new Set(dnis)].sort();
  }, [conductores]);

  const cbusUnicos = useMemo(() => {
    const cbus = conductores.map(c => (c as any).cbu).filter(Boolean) as string[];
    return [...new Set(cbus)].sort();
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

  const dnisFiltrados = useMemo(() => {
    if (!dniSearch) return dnisUnicos;
    return dnisUnicos.filter(d => d.toLowerCase().includes(dniSearch.toLowerCase()));
  }, [dnisUnicos, dniSearch]);

  const cbusFiltrados = useMemo(() => {
    if (!cbuSearch) return cbusUnicos;
    return cbusUnicos.filter(c => c.toLowerCase().includes(cbuSearch.toLowerCase()));
  }, [cbusUnicos, cbuSearch]);

  // Toggle functions para multiselect
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

  // Filtrar conductores según los filtros de columna (multiselect tipo Excel)
  const filteredConductores = useMemo(() => {
    let result = conductores;

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
        cbuFilter.includes((c as any).cbu || '')
      );
    }

    if (estadoFilter.length > 0) {
      result = result.filter(c =>
        estadoFilter.includes(c.conductores_estados?.codigo || '')
      );
    }

    if (turnoFilter.length > 0) {
      result = result.filter(c =>
        turnoFilter.includes((c as any).preferencia_turno || 'SIN_PREFERENCIA')
      );
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

    // Filtro por licencias por vencer (próximos 30 días)
    if (licenciaVencerFilter) {
      const hoy = new Date();
      const en30Dias = new Date();
      en30Dias.setDate(en30Dias.getDate() + 30);
      result = result.filter(c => {
        if (!c.licencia_vencimiento) return false;
        const fechaVenc = new Date(c.licencia_vencimiento);
        return fechaVenc >= hoy && fechaVenc <= en30Dias;
      });
    }

    return result;
  }, [conductores, nombreFilter, dniFilter, cbuFilter, estadoFilter, turnoFilter, asignacionFilter, licenciaVencerFilter]);

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

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<ConductorWithRelations>[]>(
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
          <strong>{`${row.original.nombres} ${row.original.apellidos}`}</strong>
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
      {
        accessorKey: "cbu",
        header: () => (
          <div className="dt-column-filter">
            <span>CBU {cbuFilter.length > 0 && `(${cbuFilter.length})`}</span>
            <button
              className={`dt-column-filter-btn ${cbuFilter.length > 0 ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                setOpenColumnFilter(openColumnFilter === 'cbu' ? null : 'cbu');
              }}
              title="Filtrar por CBU"
            >
              <Filter size={12} />
            </button>
            {openColumnFilter === 'cbu' && (
              <div className="dt-column-filter-dropdown dt-excel-filter" onClick={(e) => e.stopPropagation()}>
                <input
                  type="text"
                  placeholder="Buscar..."
                  value={cbuSearch}
                  onChange={(e) => setCbuSearch(e.target.value)}
                  className="dt-column-filter-input"
                  autoFocus
                />
                <div className="dt-excel-filter-list">
                  {cbusFiltrados.length === 0 ? (
                    <div className="dt-excel-filter-empty">Sin resultados</div>
                  ) : (
                    cbusFiltrados.slice(0, 50).map(cbu => (
                      <label key={cbu} className={`dt-column-filter-checkbox ${cbuFilter.includes(cbu) ? 'selected' : ''}`}>
                        <input
                          type="checkbox"
                          checked={cbuFilter.includes(cbu)}
                          onChange={() => toggleCbuFilter(cbu)}
                        />
                        <span>{cbu}</span>
                      </label>
                    ))
                  )}
                </div>
                {cbuFilter.length > 0 && (
                  <button
                    className="dt-column-filter-clear"
                    onClick={() => { setCbuFilter([]); setCbuSearch(''); }}
                  >
                    Limpiar ({cbuFilter.length})
                  </button>
                )}
              </div>
            )}
          </div>
        ),
        cell: ({ row }) => (row.original as any).cbu || "-",
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
        accessorKey: "numero_licencia",
        header: "Licencia",
        cell: ({ getValue }) => (getValue() as string) || "-",
        enableSorting: true,
      },
      {
        accessorKey: "licencias_categorias",
        header: "Categorias",
        cell: ({ row }) => {
          const categorias = row.original.licencias_categorias;
          if (Array.isArray(categorias) && categorias.length > 0) {
            return (
              <div className="dt-actions">
                {categorias.map((cat: any, idx: number) => (
                  <span key={idx} className="dt-badge dt-badge-blue">
                    {cat.codigo}
                  </span>
                ))}
              </div>
            );
          }
          return "-";
        },
        enableSorting: false,
      },
      {
        accessorKey: "licencia_vencimiento",
        header: "Vencimiento",
        cell: ({ getValue }) =>
          new Date(getValue() as string).toLocaleDateString("es-AR"),
        enableSorting: true,
      },
      {
        accessorKey: "telefono_contacto",
        header: "Teléfono",
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
          const isActivo = (row.original as any).conductores_estados?.codigo?.toLowerCase() === 'activo';
          if (isActivo) {
            return <span className="dt-badge dt-badge-green">Disponible</span>;
          }
          return <span className="vehiculo-cell-na">-</span>;
        },
        enableSorting: false,
      },
      {
        id: "acciones",
        header: "Acciones",
        cell: ({ row }) => (
          <div className="dt-actions">
            <button
              className="dt-btn-action dt-btn-view"
              onClick={() => {
                setSelectedConductor(row.original);
                setShowDetailsModal(true);
              }}
              title="Ver detalles"
            >
              <Eye size={16} />
            </button>
            <button
              className="dt-btn-action dt-btn-edit"
              onClick={() => openEditModal(row.original)}
              disabled={!canUpdate}
              title={
                !canUpdate
                  ? "No tienes permisos para editar"
                  : "Editar conductor"
              }
            >
              <Edit2 size={16} />
            </button>
            <button
              className="dt-btn-action dt-btn-delete"
              onClick={() => openDeleteModal(row.original)}
              disabled={!canDelete}
              title={
                !canDelete
                  ? "No tienes permisos para eliminar"
                  : "Eliminar conductor"
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
        ),
        enableSorting: false,
      },
    ],
    [canUpdate, canDelete, nombreFilter, nombreSearch, nombresFiltrados, dniFilter, dniSearch, dnisFiltrados, cbuFilter, cbuSearch, cbusFiltrados, estadoFilter, turnoFilter, asignacionFilter, openColumnFilter, uniqueEstados],
  );

  return (
    <div className="cond-module">
      {/* Stats Cards - Estilo Bitácora (Clickeables para filtrar) */}
      <div className="cond-stats">
        <div className="cond-stats-grid">
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === null ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('total')}
            title="Ver todos los conductores"
          >
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.totalConductores}</span>
              <span className="stat-label">Total</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'activos' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('activos')}
            title="Filtrar conductores activos"
          >
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.conductoresActivos}</span>
              <span className="stat-label">Activos</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'disponibles' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('disponibles')}
            title="Filtrar conductores disponibles (activos sin asignación)"
          >
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.conductoresDisponibles}</span>
              <span className="stat-label">Disponibles</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'asignados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('asignados')}
            title="Filtrar conductores asignados"
          >
            <UserCheck size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.conductoresAsignados}</span>
              <span className="stat-label">Asignados</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'baja' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('baja')}
            title="Filtrar conductores de baja"
          >
            <UserX size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.conductoresBaja}</span>
              <span className="stat-label">Baja</span>
            </div>
          </div>
          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'licencias' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('licencias')}
            title="Filtrar licencias por vencer (próximos 30 días)"
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{statsData.licenciasPorVencer}</span>
              <span className="stat-label">Lic. Vencer</span>
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
        }
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
          }}
          processing={pendingBajaUpdate}
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
}: any) {
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
            <label className="form-label">CUIT</label>
            <input
              type="text"
              className="form-input"
              value={formData.numero_cuit}
              onChange={(e) =>
                setFormData({ ...formData, numero_cuit: e.target.value })
              }
              disabled={saving}
            />
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
          <div className="form-group">
            <label className="form-label">Zona</label>
            <input
              type="text"
              className="form-input"
              value={formData.zona}
              onChange={(e) =>
                setFormData({ ...formData, zona: e.target.value })
              }
              disabled={saving}
              placeholder="Ej: Zona Norte, CABA, etc."
            />
          </div>
        </div>

        <div className="section-title">Información Fiscal</div>

        <div className="form-row">
          <div className="form-group">
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
          <div className="form-group" style={{ display: "flex", alignItems: "flex-end" }}>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                marginBottom: "8px",
              }}
            >
              <input
                type="checkbox"
                className="form-checkbox"
                checked={formData.monotributo}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    monotributo: e.target.checked,
                  })
                }
                disabled={saving}
              />
              <span style={{ fontSize: "14px", fontWeight: "500", marginLeft: "8px" }}>
                Monotributo
              </span>
            </label>
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
            <input
              type="email"
              className="form-input"
              value={formData.email}
              onChange={(e) =>
                setFormData({ ...formData, email: e.target.value })
              }
              disabled={saving}
            />
          </div>
        </div>

        <div className="form-row">
          <div className="form-group">
            <label className="form-label">Dirección</label>
            <input
              type="text"
              className="form-input"
              value={formData.direccion}
              onChange={(e) =>
                setFormData({ ...formData, direccion: e.target.value })
              }
              disabled={saving}
            />
          </div>
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

        <div className="section-title">Información Laboral</div>

        <div className="form-row-3">
          <div className="form-group">
            <label className="form-label">Fecha Contratación</label>
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
          <h2 style={{ color: "#DC2626" }}>Eliminar Conductor</h2>
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
            style={{ background: "#DC2626" }}
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
  getEstadoBadgeClass: _getEstadoBadgeClass,
  getEstadoLabel: _getEstadoLabel,
}: any) {
  const [vehiculosAsignados, setVehiculosAsignados] = useState<any[]>([]);
  const [loadingVehiculos, setLoadingVehiculos] = useState(true);

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
      } catch (err) {
        console.error('Error cargando vehículos asignados:', err);
      } finally {
        setLoadingVehiculos(false);
      }
    };

    fetchVehiculosAsignados();
  }, [selectedConductor?.id]);

  // Helper para obtener el estado badge de asignación
  const getAsignacionEstadoBadge = (estado: string) => {
    const estados: Record<string, { bg: string; color: string; label: string }> = {
      activa: { bg: 'rgba(34, 197, 94, 0.1)', color: '#22C55E', label: 'Activa' },
      programado: { bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6', label: 'Programada' },
      cancelada: { bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', label: 'Cancelada' },
      finalizada: { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: 'Finalizada' },
    };
    return estados[estado] || { bg: 'rgba(107, 114, 128, 0.1)', color: '#6B7280', label: estado };
  };

  // Helper para obtener el turno badge
  const getTurnoBadge = (turno: string) => {
    if (turno === 'diurno') {
      return { bg: 'linear-gradient(135deg, #FEF3C7 0%, #FDE68A 100%)', color: '#92400E', label: 'Diurno' };
    }
    if (turno === 'nocturno') {
      return { bg: '#DBEAFE', color: '#1E40AF', label: 'Nocturno' };
    }
    return { bg: '#F3F4F6', color: '#374151', label: 'Todo el día' };
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
            <label className="detail-label">CBU</label>
            <div className="detail-value">
              {(selectedConductor as any).cbu || "N/A"}
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
            <div className="detail-value">
              {selectedConductor.email || "N/A"}
            </div>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <label className="detail-label">DIRECCIÓN</label>
            <div className="detail-value">
              {selectedConductor.direccion || "N/A"}
            </div>
          </div>
        </div>

        <div className="section-title">Estado</div>
        <div>
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
                const estadoBadge = getAsignacionEstadoBadge(asig?.estado);
                const turnoBadge = getTurnoBadge(item.horario);
                const isActiva = asig?.estado === 'activa';

                return (
                  <div
                    key={item.id}
                    className={`vehiculo-historial-item ${isActiva ? 'activa' : ''}`}
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
                      {asig?.fecha_inicio && (
                        <span>
                          {new Date(asig.fecha_inicio).toLocaleDateString('es-AR')}
                          {asig?.fecha_fin && ` - ${new Date(asig.fecha_fin).toLocaleDateString('es-AR')}`}
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
        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={() => setShowDetailsModal(false)}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

// Modal de confirmación para baja de conductor con asignaciones
function ModalConfirmBaja({
  conductor,
  affectedAssignments,
  onConfirm,
  onCancel,
  processing,
}: {
  conductor: ConductorWithRelations;
  affectedAssignments: any[];
  onConfirm: () => void;
  onCancel: () => void;
  processing: boolean;
}) {
  // Agrupar por tipo de asignación
  const turnoAssignments = affectedAssignments.filter(
    (a) => a.asignaciones?.horario === 'TURNO'
  );
  const cargoAssignments = affectedAssignments.filter(
    (a) => a.asignaciones?.horario === 'CARGO'
  );

  return (
    <div className="modal-overlay" onClick={() => !processing && onCancel()}>
      <div
        className="modal-content baja-confirm-modal"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '600px' }}
      >
        <div className="modal-header">
          <h2 style={{ color: '#DC2626' }}>Confirmar Baja de Conductor</h2>
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
            <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#6B7280' }}>
              Al confirmar la baja, estas asignaciones serán actualizadas automáticamente.
            </p>
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
                Estas asignaciones serán <strong>canceladas</strong> y los vehículos volverán a estado DISPONIBLE.
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
                {turnoAssignments.some((a: any) => a.otherConductors?.length > 0)
                  ? 'Las asignaciones con otro conductor continuarán con el turno vacante.'
                  : 'Si no hay otro conductor, la asignación será cancelada.'}
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
        </div>
        <div className="modal-footer">
          <button
            className="btn-secondary"
            onClick={onCancel}
            disabled={processing}
          >
            Cancelar
          </button>
          <button
            className="btn-danger"
            onClick={onConfirm}
            disabled={processing}
            style={{
              background: '#DC2626',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '6px',
              fontWeight: '600',
              cursor: processing ? 'not-allowed' : 'pointer',
              opacity: processing ? 0.7 : 1,
            }}
          >
            {processing ? 'Procesando...' : 'Confirmar Baja'}
          </button>
        </div>
      </div>
    </div>
  );
}
