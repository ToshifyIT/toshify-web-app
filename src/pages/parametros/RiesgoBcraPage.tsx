// Parámetros > Riesgo BCRA: color de alerta (verde / amarillo / rojo) de los leads según su
// situación en la Central de Deudores del BCRA. Tabla bcra_umbrales (sql/bcra_umbrales.sql y
// sql/bcra_umbrales_situacion.sql): al guardar, la base recalcula el color de todos los leads.
//
// Se completa con dos valores: desde qué situación es amarillo y desde cuál es rojo
// (criterio del correo de E. Ritegno, 2026-11-21: no superar la situación 2). Además, rojo si
// tiene proceso judicial, cheques rechazados o una deuda con atraso muy alta.
import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { ShieldCheck, ShieldAlert, ShieldX, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { usePermissions } from '../../contexts/PermissionsContext'
import { useSede } from '../../contexts/SedeContext'
import { showError, showSuccess, showWarning } from '../../utils/toast'
import { formatFechaHora, formatNumero } from '../../utils/format'
import { SITUACIONES_BCRA, type SituacionBcra } from '../../modules/leads/bcraSituaciones'
import { StatsGrid } from '../../components/ui/StatsGrid'
import { DataTable } from '../../components/ui/DataTable'
import { InfoSituacionesBcra } from '../../modules/leads/components/InfoSituacionesBcra'
import '../../styles/modules.css'
import './RiesgoBcraPage.css'

interface Umbrales {
  situacion_amarilla_desde?: number
  situacion_roja_desde: number
  deuda_amarilla_max: number
  rojo_con_judicial: boolean
  rojo_con_cheques: boolean
  updated_at: string | null
  updated_by_name: string | null
}

type Nivel = 'verde' | 'amarillo' | 'rojo'

const COLOR: Record<Nivel, string> = {
  verde: 'var(--color-success)',
  amarillo: 'var(--color-warning)',
  rojo: 'var(--color-danger)',
}
const ETIQUETA: Record<Nivel, string> = { verde: 'Verde', amarillo: 'Amarillo', rojo: 'Rojo' }

interface FilaSituacion extends SituacionBcra {
  leads: number | null
}

export function RiesgoBcraPage() {
  const { canEditInSubmenu } = usePermissions()
  const puedeEditar = canEditInSubmenu('riesgo-bcra')
  const { aplicarFiltroSede } = useSede()
  const [umbrales, setUmbrales] = useState<Umbrales | null>(null)
  /** La columna situacion_amarilla_desde existe recién después de sql/bcra_umbrales_situacion.sql */
  const [faltaSql, setFaltaSql] = useState(false)
  const [form, setForm] = useState({ amarilla: 2, roja: 3, deudaRoja: '1000000', judicial: true, cheques: true })
  const [conteoNivel, setConteoNivel] = useState<Record<Nivel, number | null>>({ verde: null, amarillo: null, rojo: null })
  const [conteoSituacion, setConteoSituacion] = useState<Record<number, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isGuardando, setIsGuardando] = useState(false)

  useEffect(() => { void cargar() }, [])
  // Los umbrales son de todas las sedes; los conteos de leads son de la sede elegida
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { void cargarConteos() }, [aplicarFiltroSede])

  async function cargarConteos() {
    try {
      const consultados = () => aplicarFiltroSede(
        supabase.from('leads').select('id', { count: 'exact', head: true })
          .not('bcra_consultado_at', 'is', null).is('bcra_error', null),
      )
      const [niveles, situaciones] = await Promise.all([
        Promise.all((['verde', 'amarillo', 'rojo'] as Nivel[]).map(n => consultados().eq('bcra_nivel', n))),
        Promise.all(SITUACIONES_BCRA.map(s => s.valor === 0
          ? consultados().or('bcra_situacion.is.null,bcra_situacion.eq.0')
          : consultados().eq('bcra_situacion', s.valor))),
      ])
      setConteoNivel({ verde: niveles[0].count ?? 0, amarillo: niveles[1].count ?? 0, rojo: niveles[2].count ?? 0 })
      setConteoSituacion(Object.fromEntries(SITUACIONES_BCRA.map((s, i) => [s.valor, situaciones[i].count ?? 0])))
    } catch (error) {
      console.error('Error contando leads por BCRA:', error)
    }
  }

  async function cargar() {
    setIsLoading(true)
    try {
      const { data, error } = await supabase.from('bcra_umbrales').select('*').eq('id', 1).maybeSingle()
      if (error) throw error
      if (data) {
        const u = data as Umbrales
        setUmbrales(u)
        setFaltaSql(u.situacion_amarilla_desde === undefined)
        setForm({
          amarilla: u.situacion_amarilla_desde ?? 2,
          roja: u.situacion_roja_desde,
          deudaRoja: String(Number(u.deuda_amarilla_max)),
          judicial: u.rojo_con_judicial,
          cheques: u.rojo_con_cheques,
        })
      }
    } catch (error) {
      console.error('Error cargando umbrales BCRA:', error)
      showError('Error', 'No se pudieron cargar los umbrales del BCRA')
    } finally {
      setIsLoading(false)
    }
  }

  async function guardar() {
    const deudaRoja = Number(form.deudaRoja)
    if (!Number.isFinite(deudaRoja) || deudaRoja < 0) {
      showWarning('Monto inválido', 'La deuda con atraso tiene que ser un número positivo.')
      return
    }
    if (form.amarilla > form.roja) {
      showWarning('Situaciones inválidas', 'El amarillo tiene que empezar antes que el rojo.')
      return
    }
    setIsGuardando(true)
    try {
      const { error } = await supabase.from('bcra_umbrales').update({
        situacion_amarilla_desde: form.amarilla,
        situacion_roja_desde: form.roja,
        deuda_amarilla_max: deudaRoja,
        rojo_con_judicial: form.judicial,
        rojo_con_cheques: form.cheques,
      }).eq('id', 1)
      if (error) throw error
      showSuccess('Guardado', 'Se recalculó el color de todos los leads consultados.')
      await cargar()
      await cargarConteos()
    } catch (error) {
      console.error('Error guardando umbrales BCRA:', error)
      showError('Error', 'No se pudieron guardar los cambios')
    } finally {
      setIsGuardando(false)
    }
  }

  const nivelDe = (situacion: number): Nivel =>
    situacion >= form.roja ? 'rojo' : situacion >= form.amarilla ? 'amarillo' : 'verde'

  const filas: FilaSituacion[] = useMemo(
    () => SITUACIONES_BCRA.map(s => ({ ...s, leads: conteoSituacion[s.valor] ?? null })),
    [conteoSituacion],
  )

  const columns = useMemo<ColumnDef<FilaSituacion>[]>(() => [
    {
      id: 'situacion',
      accessorKey: 'valor',
      header: 'Situación',
      cell: ({ row }) => <strong className="riesgo-bcra-num riesgo-bcra-celda">{row.original.valor}</strong>,
      size: 110,
      enableSorting: false,
    },
    {
      id: 'nombre',
      header: 'Qué significa',
      accessorFn: r => r.nombre,
      cell: ({ row }) => (
        <div className="riesgo-bcra-nombre">
          <span className="riesgo-bcra-titulo">{row.original.nombre}</span>
          <span className="riesgo-bcra-detalle">{row.original.detalle}</span>
        </div>
      ),
      enableSorting: false,
    },
    {
      id: 'leads',
      header: 'Leads',
      accessorFn: r => r.leads ?? 0,
      cell: ({ row }) => <span className="riesgo-bcra-num riesgo-bcra-celda">{row.original.leads === null ? '-' : formatNumero(row.original.leads)}</span>,
      size: 90,
      enableSorting: false,
    },
    {
      id: 'nivel',
      header: 'Queda en',
      accessorFn: r => nivelDe(r.valor),
      cell: ({ row }) => {
        const n = nivelDe(row.original.valor)
        return <strong className="riesgo-bcra-celda" style={{ color: COLOR[n] }}>{ETIQUETA[n]}</strong>
      },
      size: 110,
      enableSorting: false,
    },
  // Siete filas fijas: sin ordenar (así tampoco aparece "Filtrar y ordenar" en el celular).
  // nivelDe depende de form.amarilla y form.roja
  // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [form.amarilla, form.roja])

  const total = (conteoNivel.verde ?? 0) + (conteoNivel.amarillo ?? 0) + (conteoNivel.rojo ?? 0)
  const editable = puedeEditar && !isLoading && !faltaSql

  return (
    <div className="module-container riesgo-bcra">
      <StatsGrid className="riesgo-bcra-stats-grid" storageKey="RiesgoBcraPage">
        <div className="stat-card">
          <Search size={18} className="stat-icon" />
          <div className="stat-content">
            <span className="stat-value">{conteoNivel.verde === null ? '-' : formatNumero(total)}</span>
            <span className="stat-label">Leads consultados</span>
          </div>
        </div>
        <div className="stat-card">
          <ShieldCheck size={18} className="stat-icon" style={{ color: COLOR.verde }} />
          <div className="stat-content">
            <span className="stat-value">{conteoNivel.verde ?? '-'}</span>
            <span className="stat-label">En verde</span>
          </div>
        </div>
        <div className="stat-card">
          <ShieldAlert size={18} className="stat-icon" style={{ color: COLOR.amarillo }} />
          <div className="stat-content">
            <span className="stat-value">{conteoNivel.amarillo ?? '-'}</span>
            <span className="stat-label">En amarillo</span>
          </div>
        </div>
        <div className="stat-card">
          <ShieldX size={18} className="stat-icon" style={{ color: COLOR.rojo }} />
          <div className="stat-content">
            <span className="stat-value">{conteoNivel.rojo ?? '-'}</span>
            <span className="stat-label">En rojo</span>
          </div>
        </div>
      </StatsGrid>

      {faltaSql && (
        <div className="riesgo-bcra-aviso">
          Para elegir desde qué situación es amarillo falta correr sql/bcra_umbrales_situacion.sql en Supabase.
        </div>
      )}

      <div className="riesgo-bcra-config">
        <label className="riesgo-bcra-campo">
          <span className="riesgo-bcra-th">
            <span style={{ color: COLOR.amarillo }}>Amarillo desde la situación</span>
            <InfoSituacionesBcra />
          </span>
          <select
            className="form-input"
            value={form.amarilla}
            disabled={!editable}
            onChange={e => {
              const amarilla = Number(e.target.value)
              setForm(f => ({ ...f, amarilla, roja: Math.max(f.roja, amarilla) }))
            }}
          >
            {SITUACIONES_BCRA.filter(s => s.valor >= 1).map(s => (
              <option key={s.valor} value={s.valor}>{s.valor} · {s.nombre}</option>
            ))}
          </select>
        </label>
        <label className="riesgo-bcra-campo">
          <span style={{ color: COLOR.rojo }}>Rojo desde la situación</span>
          <select
            className="form-input"
            value={form.roja}
            disabled={!editable}
            onChange={e => setForm(f => ({ ...f, roja: Number(e.target.value) }))}
          >
            {SITUACIONES_BCRA.filter(s => s.valor >= Math.max(2, form.amarilla)).map(s => (
              <option key={s.valor} value={s.valor}>{s.valor} · {s.nombre}</option>
            ))}
          </select>
        </label>
        <label className="riesgo-bcra-campo">
          <span>También rojo si la deuda con atraso supera ($)</span>
          <input
            type="number"
            min={0}
            step={100000}
            className="form-input"
            value={form.deudaRoja}
            disabled={!editable}
            onChange={e => setForm(f => ({ ...f, deudaRoja: e.target.value }))}
          />
        </label>
        <div className="riesgo-bcra-checks">
          <label className="riesgo-bcra-check">
            <input
              type="checkbox"
              checked={form.judicial}
              disabled={!editable}
              onChange={e => setForm(f => ({ ...f, judicial: e.target.checked }))}
            />
            Rojo si tiene proceso judicial
          </label>
          <label className="riesgo-bcra-check">
            <input
              type="checkbox"
              checked={form.cheques}
              disabled={!editable}
              onChange={e => setForm(f => ({ ...f, cheques: e.target.checked }))}
            />
            Rojo si tiene cheques rechazados
          </label>
        </div>
        <div className="riesgo-bcra-pie">
          <span className="riesgo-bcra-ultimo">
            {umbrales?.updated_at
              ? `Último cambio: ${formatFechaHora(umbrales.updated_at, { segundos: false })}` +
                (umbrales.updated_by_name ? ` por ${umbrales.updated_by_name}` : '')
              : ''}
          </span>
          {puedeEditar && (
            <button className="btn-primary" onClick={() => void guardar()} disabled={isGuardando || !editable}>
              {isGuardando ? 'Guardando...' : 'Guardar'}
            </button>
          )}
        </div>
      </div>

      <DataTable
        data={filas}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        showPagination={false}
        pageSize={10}
        disableAutoFilters
        emptyTitle="Sin datos"
      />
    </div>
  )
}
