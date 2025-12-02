// src/modules/conductores/ConductoresModule.tsx
import { useState, useEffect, useMemo } from "react";
import { Eye, Edit2, Trash2, AlertTriangle, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { usePermissions } from "../../contexts/PermissionsContext";
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

  const { canCreateInMenu, canEditInMenu, canDeleteInMenu } = usePermissions();

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
  });

  useEffect(() => {
    loadConductores();
    loadCatalogs();
  }, []);

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

      console.log("Catálogos conductores:", {
        estadosCivilesRes,
        nacionalidadesRes,
        categoriasRes,
        estadosConductorRes,
        estadosLicenciaRes,
        tiposLicenciaRes,
      });

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
            created_by: user?.id,
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

    setSaving(true);
    try {
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
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedConductor.id);

      if (updateError) throw updateError;

      // Actualizar categorías de licencia: eliminar las existentes e insertar las nuevas
      await (supabase as any)
        .from("conductores_licencias_categorias")
        .delete()
        .eq("conductor_id", selectedConductor.id);

      if (formData.licencia_categorias_ids.length > 0) {
        const categoriasRelacion = formData.licencia_categorias_ids.map((categoriaId) => ({
          conductor_id: selectedConductor.id,
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

  // Definir columnas para TanStack Table
  const columns = useMemo<ColumnDef<ConductorWithRelations>[]>(
    () => [
      {
        accessorKey: "nombres",
        header: "Nombre",
        cell: ({ row }) => (
          <strong>{`${row.original.nombres} ${row.original.apellidos}`}</strong>
        ),
        enableSorting: true,
      },
      {
        accessorKey: "numero_dni",
        header: "DNI",
        cell: ({ getValue }) => (getValue() as string) || "N/A",
        enableSorting: true,
      },
      {
        accessorKey: "cbu",
        header: "CBU",
        cell: ({ getValue }) => (getValue() as string) || "N/A",
        enableSorting: true,
      },
      {
        accessorKey: "numero_licencia",
        header: "Licencia",
        cell: ({ getValue }) => (getValue() as string) || "N/A",
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
          return "N/A";
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
        cell: ({ getValue }) => (getValue() as string) || "N/A",
        enableSorting: true,
      },
      {
        accessorKey: "conductores_estados.codigo",
        header: "Estado",
        cell: ({ row }) => {
          const codigo = row.original.conductores_estados?.codigo || "N/A";
          const codigoLower = codigo.toLowerCase();

          let badgeClass = "dt-badge dt-badge-solid-blue";
          if (codigoLower === "baja") {
            badgeClass = "dt-badge dt-badge-solid-gray";
          } else if (codigoLower === "activo") {
            badgeClass = "dt-badge dt-badge-solid-green";
          }

          return <span className={badgeClass}>{codigo}</span>;
        },
        enableSorting: true,
      },
      {
        id: "vehiculo_asignado",
        header: "Vehiculo Asignado",
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
          return <span className="vehiculo-cell-na">N/A</span>;
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
    [canUpdate, canDelete],
  );

  return (
    <div className="module-container">
      {/* Header */}
      <div className="module-header">
        <h3 className="module-title">Gestion de Conductores</h3>
        <p className="module-subtitle">
          {conductores.length} conductor{conductores.length !== 1 ? "es" : ""}{" "}
          registrado{conductores.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* Action Button */}
      <div className="module-actions">
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
      </div>

      {/* DataTable */}
      <DataTable
        data={conductores}
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
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, fontSize: "20px", fontWeight: "700" }}>
          Crear Nuevo Conductor
        </h2>

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

        <div className="form-row-3" style={{ marginBottom: "16px" }}>
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

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            marginTop: "24px",
          }}
        >
          <button
            className="btn-secondary"
            onClick={() => {
              setShowCreateModal(false);
              resetForm();
            }}
            disabled={saving}
          >
            Cancelar
          </button>
          <button
            className="btn-primary"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? "Creando..." : "Crear Conductor"}
          </button>
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
        <h2 style={{ marginTop: 0, fontSize: "20px", fontWeight: "700" }}>
          Editar Conductor
        </h2>

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

        <div className="form-row-3" style={{ marginBottom: "16px" }}>
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

        <div
          style={{
            display: "flex",
            gap: "12px",
            justifyContent: "flex-end",
            marginTop: "24px",
          }}
        >
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
        <h2
          style={{
            marginTop: 0,
            fontSize: "20px",
            fontWeight: "700",
            color: "#DC2626",
          }}
        >
          Eliminar Conductor
        </h2>
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
        <p style={{ color: "#6B7280", fontSize: "14px", marginBottom: "24px" }}>
          ¿Estás seguro de que deseas continuar?
        </p>
        <div
          style={{ display: "flex", gap: "12px", justifyContent: "flex-end" }}
        >
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
  return (
    <div className="modal-overlay" onClick={() => setShowDetailsModal(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <h2
          style={{
            marginTop: 0,
            fontSize: "20px",
            fontWeight: "700",
            marginBottom: "24px",
          }}
        >
          Detalles del Conductor
        </h2>

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
          <span
            className={`badge`}
            style={{
              backgroundColor: "#3B82F6",
              color: "white",
              padding: "4px 12px",
              borderRadius: "12px",
              fontSize: "12px",
              fontWeight: "600",
            }}
          >
            {selectedConductor.conductores_estados?.descripcion || "N/A"}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            marginTop: "24px",
          }}
        >
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
