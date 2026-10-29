// src/modules/integraciones/alegra/AlegraProveedoresModule.tsx
/**
 * Integraciones > Alegra > Proveedores
 *
 * Los proveedores de Alegra de cada empresa, guardados en Toshibase
 * (alegra_proveedores). «Actualizar desde Alegra» trae lo que se cambió allá;
 * al editar o crear acá se guarda primero en Alegra. Nombre comercial y días de
 * pago son datos propios de Toshibase.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { RefreshCw, UserPlus, Pencil, Users, AlertTriangle, MapPinOff, MailX } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  obtenerProveedores,
  sincronizarProveedores,
  guardarProveedor,
  ETIQUETA_IVA,
} from '../../../services/alegraComprasService'
import type { EmpresaAlegra, ProveedorAlegra, ProveedoresResponse } from '../../../services/alegraComprasService'
import { formatFechaHoraART } from '../../../utils/fechaArgentina'
import { showSuccess, showError } from '../../../utils/toast'
import { DataTable } from '../../../components/ui/DataTable'
import { abrirFormularioProveedor, datosIncompletos } from './proveedorForm'
import '../cresium/CresiumModule.css'
import './AlegraComprasModule.css'

const EMPRESAS: Array<{ id: EmpresaAlegra; label: string }> = [
  { id: '44dreams', label: '44 Dreams' },
  { id: 'grupocg', label: 'Grupo CG' },
]

type Filtro = 'todos' | 'incompletos' | 'sin_domicilio' | 'sin_email'

const VACIO: ProveedorAlegra = {
  alegra_id: null, cuit: '', nombre: '', nombre_comercial: null, iva_condicion: 'IVA_RESPONSABLE', email: null,
  telefono: null, celular: null, provincia: null, ciudad: null, domicilio: null, codigo_postal: null,
  dias_pago: null, observaciones: null,
}

const formatCuit = (c: string | null) => (c && c.length === 11 ? `${c.slice(0, 2)}-${c.slice(2, 10)}-${c.slice(10)}` : c || '-')
const sinConfirmar = (t: string | null) => (t && !/por confirmar/i.test(t) ? t : '')

export function AlegraProveedoresModule() {
  const [empresa, setEmpresa] = useState<EmpresaAlegra>('44dreams')
  const [datos, setDatos] = useState<ProveedoresResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const [filtro, setFiltro] = useState<Filtro>('todos')

  const leer = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setDatos(await obtenerProveedores(empresa))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudieron leer los proveedores')
    } finally {
      setLoading(false)
    }
  }, [empresa])

  useEffect(() => {
    setFiltro('todos')
    void leer()
  }, [leer])

  const sincronizar = useCallback(async (silencioso = false) => {
    setSincronizando(true)
    try {
      const r = await sincronizarProveedores(empresa)
      await leer()
      if (!silencioso) showSuccess('Actualizado desde Alegra', `${r.proveedores} proveedores`)
    } catch (err) {
      showError('No se pudo leer Alegra', err instanceof Error ? err.message : 'Error')
    } finally {
      setSincronizando(false)
    }
  }, [empresa, leer])

  // La primera vez (tabla vacía) se trae todo de Alegra solo
  useEffect(() => {
    if (datos && datos.empresa === empresa && datos.filas.length === 0 && datos.alegra_configurado) void sincronizar(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datos])

  const puedeEditar = !!datos?.puede_editar && !!datos?.alegra_configurado
  const filas = datos?.filas ?? []

  const resumen = useMemo(() => ({
    total: filas.length,
    incompletos: filas.filter((p) => datosIncompletos(p).length > 0).length,
    sinDomicilio: filas.filter((p) => datosIncompletos(p).includes('domicilio')).length,
    sinEmail: filas.filter((p) => !p.email).length,
  }), [filas])

  const visibles = useMemo(() => {
    if (filtro === 'incompletos') return filas.filter((p) => datosIncompletos(p).length > 0)
    if (filtro === 'sin_domicilio') return filas.filter((p) => datosIncompletos(p).includes('domicilio'))
    if (filtro === 'sin_email') return filas.filter((p) => !p.email)
    return filas
  }, [filas, filtro])

  const editar = async (p: ProveedorAlegra | null) => {
    const valores = await abrirFormularioProveedor(p ?? VACIO, {
      titulo: p ? `Editar ${p.nombre}` : 'Nuevo proveedor en Alegra',
      confirmar: p ? 'Guardar en Alegra' : 'Crear en Alegra',
    })
    if (!valores) return
    try {
      const r = await guardarProveedor(empresa, valores)
      showSuccess(r.creado ? 'Proveedor creado en Alegra' : 'Guardado en Alegra', r.proveedor.nombre)
      await leer()
    } catch (err) {
      showError('No se pudo guardar', err instanceof Error ? err.message : 'Error')
    }
  }

  const columnas = useMemo<ColumnDef<ProveedorAlegra, unknown>[]>(() => [
    {
      accessorKey: 'nombre',
      header: 'Proveedor',
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="cr-contraparte">
            <span className="cr-nombre">{p.nombre}</span>
            {p.nombre_comercial && <span className="cr-muted">{p.nombre_comercial}</span>}
          </div>
        )
      },
    },
    { accessorKey: 'cuit', header: 'CUIT', cell: ({ row }) => formatCuit(row.original.cuit) },
    {
      id: 'iva',
      header: 'Condición IVA',
      accessorFn: (p) => (p.iva_condicion ? ETIQUETA_IVA[p.iva_condicion] ?? p.iva_condicion : '-'),
    },
    {
      id: 'contacto',
      header: 'Contacto',
      accessorFn: (p) => [p.email, p.telefono, p.celular].filter(Boolean).join(' · '),
      cell: ({ row }) => {
        const p = row.original
        return (
          <div className="cr-contraparte">
            {p.email ? <span>{p.email}</span> : <span className="cr-aviso">Sin email</span>}
            <span className="cr-muted">{[p.telefono, p.celular].filter(Boolean).join(' · ') || 'Sin teléfono'}</span>
          </div>
        )
      },
    },
    {
      id: 'domicilio',
      header: 'Domicilio',
      accessorFn: (p) => [sinConfirmar(p.domicilio), sinConfirmar(p.ciudad), p.provincia].filter(Boolean).join(', '),
      cell: ({ row }) => {
        const p = row.original
        const dom = sinConfirmar(p.domicilio)
        return dom ? (
          <div className="cr-contraparte">
            <span>{dom}</span>
            <span className="cr-muted">{[sinConfirmar(p.ciudad), p.provincia, p.codigo_postal].filter(Boolean).join(', ')}</span>
          </div>
        ) : <span className="cr-aviso">Por confirmar</span>
      },
    },
    {
      accessorKey: 'dias_pago',
      header: 'Días de pago',
      meta: { cellAlign: 'center', headerAlign: 'center' },
      cell: ({ row }) => (row.original.dias_pago ?? '-'),
    },
    {
      id: 'acciones',
      header: '',
      enableSorting: false,
      cell: ({ row }) => (puedeEditar ? (
        <div className="cr-acciones-fila">
          <button className="btn-secondary cr-btn-mini" onClick={() => void editar(row.original)} title="Editar (se guarda en Alegra)">
            <Pencil size={14} />
          </button>
        </div>
      ) : null),
    },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [puedeEditar, empresa])

  const tarjetas: Array<{ id: Filtro; label: string; valor: number; icono: typeof Users }> = [
    { id: 'todos', label: 'Proveedores', valor: resumen.total, icono: Users },
    { id: 'incompletos', label: 'Con datos incompletos', valor: resumen.incompletos, icono: AlertTriangle },
    { id: 'sin_domicilio', label: 'Domicilio por confirmar', valor: resumen.sinDomicilio, icono: MapPinOff },
    { id: 'sin_email', label: 'Sin email', valor: resumen.sinEmail, icono: MailX },
  ]

  return (
    <div className="cr-module">
      <div className="cr-stats ap-stats">
        <div className="stats-grid">
          {tarjetas.map((t) => {
            const Icono = t.icono
            return (
              <div
                key={t.id}
                className={`stat-card ${filtro === t.id && t.id !== 'todos' ? 'active' : ''}`}
                onClick={() => setFiltro(filtro === t.id ? 'todos' : t.id)}
                style={{ cursor: 'pointer' }}
              >
                <Icono size={20} className="stat-icon" />
                <div className="stat-content">
                  <span className="stat-value">{t.valor}</span>
                  <span className="stat-label">{t.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="cr-filtros">
        <div className="ap-empresas" role="tablist">
          {EMPRESAS.map((e) => (
            <button
              key={e.id}
              role="tab"
              aria-selected={empresa === e.id}
              className={empresa === e.id ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setEmpresa(e.id)}
            >
              {e.label}
            </button>
          ))}
        </div>
        <span className="cr-muted cr-actualizado">
          {datos?.sincronizado_en ? `Actualizado desde Alegra: ${formatFechaHoraART(datos.sincronizado_en)}` : ''}
        </span>
      </div>

      {datos && !datos.alegra_configurado && (
        <div className="aviso aviso--warning">Falta el token de Alegra de {datos.empresa_label} en el .env del servidor.</div>
      )}

      <DataTable
        data={visibles}
        columns={columnas}
        loading={loading || (sincronizando && filas.length === 0)}
        error={error}
        pageSize={50}
        pageSizeOptions={[20, 50, 100, 200]}
        searchPlaceholder="Buscar proveedor, CUIT, email o teléfono..."
        emptyIcon={<Users size={48} />}
        emptyTitle="No hay proveedores"
        emptyDescription="Tocá «Actualizar desde Alegra»"
        stickyLeftColumns={1}
        headerAction={
          <div className="cr-acciones">
            <button
              className="btn-secondary"
              onClick={() => void sincronizar()}
              disabled={loading || sincronizando || !datos?.alegra_configurado}
              title="Trae de Alegra los proveedores y lo que se modificó allá"
            >
              <RefreshCw size={16} className={sincronizando ? 'cr-girando' : undefined} />
              Actualizar desde Alegra
            </button>
            {puedeEditar && (
              <button className="btn-primary" onClick={() => void editar(null)} disabled={loading}>
                <UserPlus size={16} />
                Nuevo proveedor
              </button>
            )}
          </div>
        }
      />
    </div>
  )
}
