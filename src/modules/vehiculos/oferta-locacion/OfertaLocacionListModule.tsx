import { useState, useEffect, useMemo, useCallback } from 'react'
import { FileText, Eye, Edit, Trash2, Download, CheckCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../contexts/AuthContext'
import { useSede } from '../../../contexts/SedeContext'
import { DataTable } from '../../../components/ui/DataTable'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { ExcelColumnFilter, useExcelFilters } from '../../../components/ui/DataTable/ExcelColumnFilter'
import { type ColumnDef } from '@tanstack/react-table'
import Swal from 'sweetalert2'
import { showSuccess, showError } from '../../../utils/toast'
import { generateOfertaLocacion } from '../../../services/ofertaLocacionService'
import type { OfertaLocacion } from '../titulares/types/ofertaLocacion.types'
import { OfertaLocacionDetailModal } from './components/OfertaLocacionDetailModal'
import { OfertaLocacionModal } from '../titulares/components/OfertaLocacionModal'
import '../VehicleManagement.css'

export function OfertaLocacionListModule() {
  const { user, profile } = useAuth()
  const { sedeActualId } = useSede()

  const [ofertas, setOfertas] = useState<OfertaLocacion[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedOferta, setSelectedOferta] = useState<OfertaLocacion | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  // Filtros
  const [socioFilter, setSocioFilter] = useState<string[]>([])
  const [activeStatCard, setActiveStatCard] = useState<string | null>(null)
  const { openFilterId, setOpenFilterId } = useExcelFilters()

  const userName = (profile as unknown as { full_name?: string })?.full_name || user?.email || 'admin'
  const userId = user?.id || ''

  // Campos requeridos para el documento Word (basado en MAPA_VARIABLES del template)
  const getCamposFaltantes = (o: OfertaLocacion): string[] => {
    const faltantes: string[] = []
    // Titular
    if (!o.titular_nombre) faltantes.push('Nombre titular')
    if (!o.titular_dni_cuit) faltantes.push('DNI')
    if (!o.titular_domicilio) faltantes.push('Domicilio')
    if (!o.titular_email) faltantes.push('Email')
    if (!o.titular_cuit) faltantes.push('CUIT')
    // Contrato
    if (!o.fecha_inicio_alquiler) faltantes.push('Fecha inicio alquiler')
    if (o.canon_mensual == null) faltantes.push('Canon mensual')
    if (!o.socio) faltantes.push('Socio')
    // Vehiculo
    if (!o.patente) faltantes.push('Patente')
    if (!o.marca) faltantes.push('Marca')
    if (!o.modelo) faltantes.push('Modelo')
    if (!o.anio) faltantes.push('Anio')
    if (!o.numero_motor) faltantes.push('Numero motor')
    if (!o.numero_chasis) faltantes.push('Numero chasis')
    if (o.kilometraje == null) faltantes.push('Kilometraje')
    if (!o.nivel_nafta) faltantes.push('Nivel nafta')
    // vto_vtv es opcional: viene del vehiculo y puede no estar definido
    // Seguridad (booleans siempre tienen valor, no faltan)
    // Limpieza
    if (!o.limpieza_interior) faltantes.push('Limpieza interior')
    if (!o.limpieza_exterior) faltantes.push('Limpieza exterior')
    // Costos
    if (o.costo_patente == null) faltantes.push('Costo patente')
    // Gravamenes
    if (!o.gravamenes) faltantes.push('Gravamenes')
    return faltantes
  }

  const handleGenerarDocumento = async (oferta: OfertaLocacion) => {
    const faltantes = getCamposFaltantes(oferta)

    if (faltantes.length > 0) {
      Swal.fire({
        title: 'Campos sin completar',
        html: `<div style="text-align:left;font-size:13px;">
          <p style="margin-bottom:10px;">Faltan <b>${faltantes.length}</b> campos por completar:</p>
          <ul style="margin:0;padding-left:20px;max-height:200px;overflow-y:auto;">
            ${faltantes.map(f => `<li style="margin-bottom:4px;">${f}</li>`).join('')}
          </ul>
          <p style="margin-top:12px;">Complete todos los campos antes de generar el documento.</p>
        </div>`,
        icon: 'error',
        confirmButtonText: 'Entendido',
        confirmButtonColor: '#2563eb',
      })
      return
    }

    // Confirmacion final
    const confirm = await Swal.fire({
      title: 'Generar documento',
      html: `<p>Se generara el documento de Oferta de Locacion para:</p>
        <p style="margin-top:8px;"><b>${oferta.patente}</b> - ${oferta.titular_nombre}</p>
        <p style="margin-top:4px;">Socio: <b>${oferta.socio || '-'}</b></p>`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Generar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#2563eb',
    })
    if (!confirm.isConfirmed) return

    // Mostrar loading
    Swal.fire({
      title: 'Generando documento...',
      html: 'Creando documento en Google Drive. Esto puede tardar unos segundos.',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => Swal.showLoading()
    })

    const result = await generateOfertaLocacion({ oferta_id: oferta.id })

    Swal.close()

    if (!result.success) {
      showError(result.error || 'Error al generar documento')
      return
    }

    await Swal.fire({
      title: 'Documento generado',
      html: `<div style="text-align:left;font-size:13px;">
        <p>El documento fue creado exitosamente en Google Drive.</p>
        ${result.googleDocUrl ? `<p style="margin-top:8px;"><a href="${result.googleDocUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;">Abrir documento</a></p>` : ''}
        ${result.folderUrl ? `<p style="margin-top:4px;"><a href="${result.folderUrl}" target="_blank" style="color:#2563eb;text-decoration:underline;">Abrir carpeta</a></p>` : ''}
      </div>`,
      icon: 'success',
      confirmButtonText: 'Cerrar',
      confirmButtonColor: '#2563eb',
      customClass: { popup: 'swal-popup-fix' },
    })

    loadOfertas()
  }

  const loadOfertas = useCallback(async () => {
    setLoading(true)
    try {
      let query = supabase
        .from('ofertas_locacion')
        .select('*')
        .order('created_at', { ascending: false })

      if (sedeActualId) {
        query = query.or(`sede_id.eq.${sedeActualId},sede_id.is.null`)
      }

      const { data, error } = await query
      if (error) throw error
      setOfertas((data || []) as OfertaLocacion[])
    } catch (err) {
      console.error('Error cargando ofertas:', err)
      setOfertas([])
    } finally {
      setLoading(false)
    }
  }, [sedeActualId])

  useEffect(() => { loadOfertas() }, [loadOfertas])

  const handleDelete = async (oferta: OfertaLocacion) => {
    const result = await Swal.fire({
      title: 'Eliminar oferta',
      text: `Eliminar la oferta de ${oferta.titular_nombre} - ${oferta.patente}?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc2626',
    })
    if (!result.isConfirmed) return

    const { error } = await supabase.from('ofertas_locacion').delete().eq('id', oferta.id)
    if (error) {
      Swal.fire('Error', error.message, 'error')
      return
    }
    showSuccess('Oferta eliminada')
    loadOfertas()
  }

  // Estadísticas
  const stats = useMemo(() => {
    const total = ofertas.length
    const borradores = ofertas.filter(o => o.estado === 'borrador').length
    const completados = ofertas.filter(o => o.estado === 'completado').length
    const generados = ofertas.filter(o => o.estado === 'documento_generado').length
    return { total, borradores, completados, generados }
  }, [ofertas])

  // Valores únicos para filtros
  const sociosUnicos = useMemo(() => [...new Set(ofertas.map(o => o.socio).filter(Boolean))].sort() as string[], [ofertas])

  // Datos filtrados
  const filteredOfertas = useMemo(() => {
    let result = ofertas
    if (socioFilter.length > 0) result = result.filter(o => o.socio && socioFilter.includes(o.socio))
    if (activeStatCard === 'borradores') result = result.filter(o => o.estado === 'borrador')
    else if (activeStatCard === 'completados') result = result.filter(o => o.estado === 'completado')
    else if (activeStatCard === 'generados') result = result.filter(o => o.estado === 'documento_generado')
    return result
  }, [ofertas, socioFilter, activeStatCard])

  const columns: ColumnDef<OfertaLocacion>[] = useMemo(() => [
    {
      accessorKey: 'patente',
      header: 'Patente',
      cell: ({ row }) => (
        <span style={{ fontWeight: 600 }}>{row.original.patente || 'N/A'}</span>
      ),
    },
    {
      accessorKey: 'titular_nombre',
      header: 'Titular',
      cell: ({ row }) => row.original.titular_nombre || 'N/A',
    },
    {
      accessorKey: 'marca',
      header: 'Vehiculo',
      cell: ({ row }) => {
        const o = row.original
        return `${o.marca || ''} ${o.modelo || ''} ${o.anio || ''}`.trim() || 'N/A'
      },
    },
    {
      accessorKey: 'canon_mensual',
      header: 'Canon',
      cell: ({ row }) => {
        const val = row.original.canon_mensual
        return val != null ? `$${Number(val).toLocaleString('es-AR')}` : '-'
      },
    },
    {
      accessorKey: 'socio',
      header: () => (
        <ExcelColumnFilter
          label="Socio"
          options={sociosUnicos}
          selectedValues={socioFilter}
          onSelectionChange={setSocioFilter}
          filterId="socio"
          openFilterId={openFilterId}
          onOpenChange={setOpenFilterId}
        />
      ),
      cell: ({ row }) => {
        const s = row.original.socio
        if (!s) return '-'
        const label = s
        const es44Dreams = s.includes('44 DREAMS') || s === '44dreams'
        const bg = es44Dreams ? '#fef3c7' : '#dbeafe'
        const color = es44Dreams ? '#92400e' : '#1d4ed8'
        return (
          <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 500, background: bg, color }}>
            {label}
          </span>
        )
      },
    },
    {
      id: 'completitud',
      header: '%Camp. Completados',
      cell: ({ row }) => {
        const faltantes = getCamposFaltantes(row.original)
        const totalCampos = 22 // campos que valida getCamposFaltantes
        const completos = totalCampos - faltantes.length
        const porcentaje = Math.round((completos / totalCampos) * 100)

        if (faltantes.length === 0) {
          return (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#059669', fontSize: '12px', fontWeight: 500 }}>
              <CheckCircle size={14} />
              Completo
            </span>
          )
        }

        return (
          <span
            title={`Faltan: ${faltantes.join(', ')}`}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'help' }}
          >
            <div style={{
              width: '50px',
              height: '6px',
              borderRadius: '3px',
              background: '#e5e7eb',
              overflow: 'hidden',
            }}>
              <div style={{
                width: `${porcentaje}%`,
                height: '100%',
                borderRadius: '3px',
                background: porcentaje >= 70 ? '#f59e0b' : '#ef4444',
                transition: 'width 0.3s',
              }} />
            </div>
            <span style={{ color: porcentaje >= 70 ? '#92400e' : '#991b1b', fontWeight: 500 }}>
              {porcentaje}%
            </span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              ({faltantes.length} {faltantes.length === 1 ? 'campo' : 'campos'})
            </span>
          </span>
        )
      },
    },
    {
      accessorKey: 'created_at',
      header: 'Creado',
      cell: ({ row }) => {
        const d = row.original.created_at
        return d ? new Date(d).toLocaleDateString('es-AR') : '-'
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      enableSorting: false,
      cell: ({ row }) => {
        const actions = [
          {
            icon: <Eye size={15} />,
            label: 'Ver detalle',
            onClick: () => { setSelectedOferta(row.original); setShowDetailModal(true) },
          },
          {
            icon: <Edit size={15} />,
            label: 'Editar',
            onClick: () => { setSelectedOferta(row.original); setShowEditModal(true) },
          },
          {
            icon: <Download size={15} />,
            label: 'Generar documento',
            onClick: () => handleGenerarDocumento(row.original),
          },
          {
            icon: <Trash2 size={15} />,
            label: 'Eliminar',
            onClick: () => handleDelete(row.original),
            variant: 'danger' as const,
          },
        ]
        return <ActionsMenu actions={actions} />
      },
    },
  ], [socioFilter, sociosUnicos, openFilterId])

  const externalFilters = useMemo(() => {
    const filters: Array<{ id: string; label: string; onClear: () => void }> = []
    if (socioFilter.length > 0) {
      filters.push({ id: 'socio', label: `Socio: ${socioFilter.join(', ')}`, onClear: () => setSocioFilter([]) })
    }
    if (activeStatCard) {
      const labelMap: Record<string, string> = { borradores: 'Borradores', completados: 'Completados', generados: 'Doc. Generados' }
      filters.push({ id: 'statCard', label: `Estado: ${labelMap[activeStatCard] || activeStatCard}`, onClear: () => setActiveStatCard(null) })
    }
    return filters
  }, [socioFilter, activeStatCard])

  const handleStatCardClick = (card: string) => {
    setActiveStatCard(prev => prev === card ? null : card)
  }

  const handleClearAllFilters = () => {
    setSocioFilter([])
    setActiveStatCard(null)
  }

  return (
    <div className="veh-module">
      {/* Stats */}
      <div className="veh-stats">
        <div className="veh-stats-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
          <div className={`stat-card ${activeStatCard === null ? '' : 'stat-card-inactive'}`} onClick={() => setActiveStatCard(null)} style={{ cursor: 'pointer' }}>
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Ofertas</span>
            </div>
          </div>
          <div className={`stat-card ${activeStatCard === 'borradores' ? 'stat-card-active' : activeStatCard ? 'stat-card-inactive' : ''}`} onClick={() => handleStatCardClick('borradores')} style={{ cursor: 'pointer' }}>
            <Edit size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.borradores}</span>
              <span className="stat-label">Borradores</span>
            </div>
          </div>
          <div className={`stat-card ${activeStatCard === 'completados' ? 'stat-card-active' : activeStatCard ? 'stat-card-inactive' : ''}`} onClick={() => handleStatCardClick('completados')} style={{ cursor: 'pointer' }}>
            <Eye size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.completados}</span>
              <span className="stat-label">Completados</span>
            </div>
          </div>
          <div className={`stat-card ${activeStatCard === 'generados' ? 'stat-card-active' : activeStatCard ? 'stat-card-inactive' : ''}`} onClick={() => handleStatCardClick('generados')} style={{ cursor: 'pointer' }}>
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.generados}</span>
              <span className="stat-label">Doc. Generados</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        columns={columns}
        data={filteredOfertas}
        loading={loading}
        emptyIcon={<FileText size={64} />}
        emptyTitle="No hay ofertas de locacion registradas"
        emptyDescription=""
        searchPlaceholder="Buscar por patente, titular..."
        externalFilters={externalFilters}
        onClearAllFilters={handleClearAllFilters}
        stickyLeftColumns={1}
      />

      {/* Modal Detalle */}
      {showDetailModal && selectedOferta && (
        <OfertaLocacionDetailModal
          oferta={selectedOferta}
          onClose={() => { setShowDetailModal(false); setSelectedOferta(null) }}
        />
      )}

      {/* Modal Editar */}
      {showEditModal && selectedOferta && (
        <OfertaLocacionEditWrapper
          oferta={selectedOferta}
          sedeId={sedeActualId}
          userId={userId}
          userName={userName}
          onClose={() => { setShowEditModal(false); setSelectedOferta(null); loadOfertas() }}
        />
      )}
    </div>
  )
}

// Wrapper para editar una oferta existente usando el mismo OfertaLocacionModal
function OfertaLocacionEditWrapper({ oferta, sedeId, userId, userName, onClose }: {
  oferta: OfertaLocacion
  sedeId: string | null
  userId: string
  userName: string
  onClose: () => void
}) {
  // Necesitamos construir un VehiculoTitular y Titular mínimos para el modal
  const vt = {
    id: oferta.vehiculo_titular_id,
    vehiculo_id: oferta.vehiculo_id,
    titular_id: oferta.titular_id,
    fecha_desde: '',
    fecha_hasta: null,
    activo: true,
    created_at: '',
    created_by: null,
    created_by_name: null,
    vehiculos: {
      patente: oferta.patente || '',
      marca: oferta.marca || '',
      modelo: oferta.modelo || '',
    },
  }

  const titular = {
    id: oferta.titular_id,
    tipo: 'persona' as const,
    dni_cuit: oferta.titular_dni_cuit || '',
    domicilio: oferta.titular_domicilio,
    email: oferta.titular_email,
    telefono: null,
    nombres: oferta.titular_nombre,
    apellidos: null,
    conyugue: oferta.titular_conyugue,
    dni_conyugue: null,
    nombre_conyugue: oferta.titular_conyugue,
    razon_social: null,
    representante_administrativo: null,
    dni_representante: null,
    email_representante: null,
    domicilio_fiscal: null,
    estado: 'activo',
    sede_id: null,
    created_at: '',
    updated_at: '',
    created_by: null,
    created_by_name: null,
  }

  return (
    <OfertaLocacionModal
      vehiculoTitular={vt}
      titular={titular}
      sedeId={sedeId}
      userId={userId}
      userName={userName}
      onClose={onClose}
    />
  )
}
