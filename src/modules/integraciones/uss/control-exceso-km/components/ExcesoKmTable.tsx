// Tabla de Control de Exceso de KM (Propuesta 1 — compacta horizontal).
// Columnas: GPS · Patente · Conductor · Km recorridos · Límite · Excedidos · Modalidad · Monto · Estado · Acciones
// Una fila = un conductor que excedió el límite km semanal.

import { useMemo, useState, useRef, useEffect } from 'react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../../../components/ui/DataTable/DataTable'
import { Search, ClipboardList, Download, ChevronDown, X, Plus, CheckCircle, Eye, Sun, Moon, Clock } from 'lucide-react'
import type { Marcacion } from '../../bitacora/hooks/useUSSHistoricoData'
import { normalizePatente } from '../../../../../utils/normalizeDocuments'
import * as XLSX from 'xlsx'

// Defaults (override desde parametros_sistema en el módulo, pasados via props si hace falta)
const ALQUILER_TURNO_DEFAULT = 245000
const ALQUILER_A_CARGO_DEFAULT = 360000

function porcentajePorKm(km: number): number {
  if (km <= 0) return 0
  if (km > 150) return 35
  if (km > 100) return 25
  if (km > 50) return 20
  return 15
}

export interface ExcesoKmRow {
  /** llave estable = conductorId || conductor (nombre) */
  key: string
  conductorId: string | null
  conductorNombre: string
  conductorDni: string | null
  ibutton: string | null
  patente: string                       // patente principal de la semana (más km)
  patentes: string[]                    // todas las patentes usadas en la semana
  /** GPS predominante (el que tenga más km en la semana). USS o GEOTAB. */
  gpsOrigen: 'USS' | 'GEOTAB'
  kmRecorridos: number
  limite: number
  excedido: number
  modalidad: 'turno' | 'a_cargo'
  /** Si la modalidad es 'turno': diurno | nocturno. Si es 'a_cargo': null (no aplica). */
  horario: 'diurno' | 'nocturno' | 'mixto' | null
  porcentaje: number
  monto: number
  yaTieneIncidencia: boolean
  /** Detalle de marcaciones de la semana — para abrir drawer */
  detalle: Marcacion[]
}

interface Props {
  marcaciones: Marcacion[]
  isLoading: boolean
  searchTerm: string
  onSearchChange: (term: string) => void
  headerControls?: React.ReactNode
  conductoresConIncidencia: Set<string>
  alquilerTurno?: number
  alquilerACargo?: number
  onCrear: (row: ExcesoKmRow) => void
  onVerDetalle: (row: ExcesoKmRow) => void
}

export function ExcesoKmTable({
  marcaciones,
  isLoading,
  searchTerm,
  onSearchChange,
  headerControls,
  conductoresConIncidencia,
  alquilerTurno = ALQUILER_TURNO_DEFAULT,
  alquilerACargo = ALQUILER_A_CARGO_DEFAULT,
  onCrear,
  onVerDetalle,
}: Props) {
  // Filtro GPS
  const [gpsFilter, setGpsFilter] = useState<'USS' | 'GEOTAB' | null>(null)

  // 1) Agrupar TODAS las marcaciones por conductor (excedan o no).
  //    El usuario ve toda la flota con su estado: la barra de progreso indica si ya está al límite.
  const filas = useMemo<ExcesoKmRow[]>(() => {
    const grupos = new Map<string, Marcacion[]>()
    for (const m of marcaciones) {
      const key = m.conductorId || m.conductor || ''
      if (!key) continue
      if (!grupos.has(key)) grupos.set(key, [])
      grupos.get(key)!.push(m)
    }
    const rows: ExcesoKmRow[] = []
    for (const [key, lista] of grupos) {
      const km = lista.reduce((s, m) => s + (m.kmTotal || 0), 0)
      const modalidad: 'turno' | 'a_cargo' = lista.some(m => m.vehiculoModalidad === 'a_cargo') ? 'a_cargo' : 'turno'
      // Horario solo aplica cuando modalidad === 'turno'
      let horario: ExcesoKmRow['horario'] = null
      if (modalidad === 'turno') {
        const horariosUsados = new Set(
          lista
            .filter(m => m.vehiculoModalidad === 'turno' || m.vehiculoModalidad == null)
            .map(m => m.horario)
            .filter(h => h === 'diurno' || h === 'nocturno'),
        )
        if (horariosUsados.size > 1) horario = 'mixto'
        else if (horariosUsados.has('diurno')) horario = 'diurno'
        else if (horariosUsados.has('nocturno')) horario = 'nocturno'
      }
      // Si la marcación tiene limiteSemanal lo usamos; sino usamos default según modalidad
      const limite = lista[0].limiteSemanal || (modalidad === 'a_cargo' ? 3600 : 1800)
      const excedido = Math.max(0, km - limite)
      // patente principal: la que más km tiene en la semana
      const kmPorPatente = new Map<string, number>()
      for (const m of lista) {
        if (m.patente) kmPorPatente.set(m.patente, (kmPorPatente.get(m.patente) || 0) + (m.kmTotal || 0))
      }
      const patentesOrdenadas = [...kmPorPatente.entries()].sort((a, b) => b[1] - a[1])
      const patente = patentesOrdenadas[0]?.[0] || lista[0].patente || ''
      // GPS predominante: gana el que tenga más km en la semana
      let kmUSS = 0, kmGeotab = 0
      for (const m of lista) {
        if (m.gpsOrigen === 'GEOTAB') kmGeotab += m.kmTotal || 0
        else kmUSS += m.kmTotal || 0
      }
      const gpsOrigen: 'USS' | 'GEOTAB' = kmGeotab > kmUSS ? 'GEOTAB' : 'USS'
      // porcentaje + monto
      const pct = porcentajePorKm(excedido)
      const valor = modalidad === 'a_cargo' ? alquilerACargo : alquilerTurno
      const monto = Math.round(valor * (pct / 100) * 1.21)
      // último registro: para tomar DNI/iButton del conductor
      const ultima = lista[lista.length - 1]
      rows.push({
        key,
        conductorId: ultima.conductorId,
        conductorNombre: ultima.conductor,
        conductorDni: ultima.conductorDni ?? null,
        ibutton: ultima.ibutton,
        patente,
        patentes: patentesOrdenadas.map(p => p[0]),
        gpsOrigen,
        kmRecorridos: Math.round(km * 100) / 100,
        limite,
        excedido: Math.round(excedido * 100) / 100,
        modalidad,
        horario,
        porcentaje: pct,
        monto,
        yaTieneIncidencia: !!(ultima.conductorId && conductoresConIncidencia.has(ultima.conductorId)),
        detalle: lista,
      })
    }
    // Ordenar: por consumo% desc (los que están al borde o excedieron primero, los relajados al final)
    rows.sort((a, b) => {
      const pctA = a.kmRecorridos / a.limite
      const pctB = b.kmRecorridos / b.limite
      return pctB - pctA
    })
    return rows
  }, [marcaciones, conductoresConIncidencia, alquilerTurno, alquilerACargo])

  // Conteo por GPS
  const gpsCounts = useMemo(() => {
    let uss = 0, geotab = 0
    for (const r of filas) {
      if (r.gpsOrigen === 'GEOTAB') geotab++
      else uss++
    }
    return { uss, geotab }
  }, [filas])

  // 2) Aplicar filtros (GPS + búsqueda)
  const filtered = useMemo(() => {
    let f = filas
    if (gpsFilter !== null) f = f.filter(r => r.gpsOrigen === gpsFilter)
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      const termPatente = normalizePatente(searchTerm).toLowerCase()
      f = f.filter(r =>
        r.conductorNombre.toLowerCase().includes(term) ||
        (r.conductorDni && r.conductorDni.includes(term)) ||
        normalizePatente(r.patente).toLowerCase().includes(termPatente),
      )
    }
    return f
  }, [filas, gpsFilter, searchTerm])

  const hasActiveFilters = gpsFilter !== null || searchTerm.trim() !== ''
  const clearAllFilters = () => { setGpsFilter(null); onSearchChange('') }

  // 3) Columnas (estilo P1 mock)
  const columns = useMemo<ColumnDef<ExcesoKmRow>[]>(() => [
    {
      id: 'gps',
      header: 'GPS',
      size: 70,
      cell: ({ row }) => {
        const o = row.original.gpsOrigen
        const bg = o === 'GEOTAB' ? '#3b82f6' : '#10b981'
        return (
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#fff',
            background: bg, padding: '2px 8px', borderRadius: 3, whiteSpace: 'nowrap', letterSpacing: '0.5px',
          }}>{o}</span>
        )
      },
      enableSorting: false,
    },
    {
      id: 'patente',
      accessorFn: (r) => r.patente,
      header: 'Patente',
      size: 110,
      cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--color-primary)', fontWeight: 600, background: 'var(--bg-secondary)', padding: '2px 6px', borderRadius: 3, whiteSpace: 'nowrap' }}>
          {row.original.patente.replace(/\s/g, '')}
        </span>
      ),
    },
    {
      id: 'conductor',
      accessorFn: (r) => r.conductorNombre,
      header: 'Conductor',
      cell: ({ row }) => {
        const r = row.original
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, lineHeight: 1.3, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.conductorNombre}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {r.conductorDni && (
                <span style={{ color: 'var(--text-secondary)', fontSize: 10 }}>{r.conductorDni}</span>
              )}
              {r.ibutton && (
                <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>#{r.ibutton}</span>
              )}
            </div>
          </div>
        )
      },
    },
    {
      id: 'km_recorridos',
      accessorFn: (r) => r.kmRecorridos,
      header: 'Km recorridos',
      size: 120,
      cell: ({ row }) => {
        const r = row.original
        const excede = r.excedido > 0
        return (
          <span style={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600, color: excede ? '#dc2626' : 'var(--text-primary)' }}>
            {r.kmRecorridos.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} km
          </span>
        )
      },
    },
    {
      id: 'limite',
      accessorFn: (r) => r.limite,
      header: 'Límite',
      size: 90,
      cell: ({ row }) => (
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--text-tertiary)' }}>
          {row.original.limite.toLocaleString('es-AR')} km
        </span>
      ),
    },
    {
      id: 'consumo',
      accessorFn: (r) => r.kmRecorridos / r.limite,
      header: 'Consumo',
      size: 180,
      cell: ({ row }) => {
        const r = row.original
        const pctConsumo = (r.kmRecorridos / r.limite) * 100
        const pctBar = Math.min(100, pctConsumo)
        // Color según consumo del límite (no según km excedidos)
        let barColor = '#16a34a'  // al día
        if (pctConsumo >= 100) barColor = '#dc2626'      // excedido
        else if (pctConsumo >= 80) barColor = '#ea580c'  // próximo
        else if (pctConsumo >= 60) barColor = '#f59e0b'  // advertencia
        const excede = r.excedido > 0
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingRight: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, fontWeight: 600, color: barColor }}>
                {pctConsumo.toFixed(0)}%
              </span>
              {excede && (
                <span style={{ fontFamily: 'monospace', fontSize: 10, fontWeight: 600, color: '#dc2626' }}>
                  +{r.excedido.toLocaleString('es-AR', { maximumFractionDigits: 0 })} km
                </span>
              )}
            </div>
            <div style={{ width: '100%', height: 6, background: 'var(--bg-secondary)', borderRadius: 3, overflow: 'hidden', position: 'relative' }}>
              <div style={{ height: '100%', width: `${pctBar}%`, background: barColor, borderRadius: 3 }} />
              {/* Marca del 100% si la barra está saturada */}
              {pctConsumo > 100 && (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '100%', width: 2, background: '#dc2626', opacity: 0 }} />
              )}
            </div>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              {excede ? `${r.porcentaje}% del alquiler` : 'al día'}
            </span>
          </div>
        )
      },
    },
    {
      id: 'modalidad',
      accessorFn: (r) => r.modalidad,
      header: 'Modalidad',
      size: 90,
      cell: ({ row }) => {
        const mod = row.original.modalidad
        const color = mod === 'a_cargo' ? '#0891b2' : '#7c3aed'
        return (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#fff', background: color, textTransform: 'uppercase', letterSpacing: '0.3px' }}>
            {mod === 'a_cargo' ? 'A Cargo' : 'Turno'}
          </span>
        )
      },
      enableSorting: false,
    },
    {
      id: 'turno',
      accessorFn: (r) => r.horario || '',
      header: 'Turno',
      size: 95,
      cell: ({ row }) => {
        const r = row.original
        if (r.modalidad === 'a_cargo') {
          return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        }
        if (r.horario === 'diurno') {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#d97706' }}>
              <Sun size={12} /> Diurno
            </span>
          )
        }
        if (r.horario === 'nocturno') {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#4f46e5' }}>
              <Moon size={12} /> Nocturno
            </span>
          )
        }
        if (r.horario === 'mixto') {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, color: '#6b7280' }}>
              <Clock size={12} /> Mixto
            </span>
          )
        }
        return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
      },
      enableSorting: false,
    },
    {
      id: 'monto',
      accessorFn: (r) => r.monto,
      header: 'Monto',
      size: 130,
      cell: ({ row }) => {
        const r = row.original
        if (r.excedido <= 0) {
          return <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>—</span>
        }
        const valor = r.modalidad === 'a_cargo' ? alquilerACargo : alquilerTurno
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <strong style={{ fontFamily: 'monospace', fontSize: 12 }}>${r.monto.toLocaleString('es-AR')}</strong>
            <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>
              {r.porcentaje}% × ${(valor / 1000).toFixed(0)}k × IVA
            </span>
          </div>
        )
      },
    },
    {
      id: 'estado',
      accessorFn: (r) => {
        if (r.yaTieneIncidencia) return 'por_aplicar'
        if (r.excedido > 0) return 'sin_crear'
        const pct = (r.kmRecorridos / r.limite) * 100
        if (pct >= 80) return 'proximo'
        return 'al_dia'
      },
      header: 'Estado',
      size: 110,
      cell: ({ row }) => {
        const r = row.original
        if (r.yaTieneIncidencia) {
          return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#fff', background: '#16a34a' }}>
              <CheckCircle size={11} /> Por aplicar
            </span>
          )
        }
        if (r.excedido > 0) {
          return (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#fff', background: '#dc2626' }}>
              Excedido
            </span>
          )
        }
        const pct = (r.kmRecorridos / r.limite) * 100
        if (pct >= 80) {
          return (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#fff', background: '#ea580c' }}>
              Próximo
            </span>
          )
        }
        return (
          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 10, color: '#fff', background: '#16a34a' }}>
            Al día
          </span>
        )
      },
      enableSorting: false,
    },
    {
      id: 'acciones',
      header: 'Acciones',
      size: 130,
      cell: ({ row }) => {
        const r = row.original
        const btnBase: React.CSSProperties = {
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1,
          background: 'none', border: 'none', cursor: 'pointer', padding: 2,
        }
        const labelStyle: React.CSSProperties = { fontSize: 9, color: 'var(--text-tertiary)', marginTop: 1 }
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            <button
              onClick={() => onVerDetalle(r)}
              title="Ver detalle de marcaciones de la semana"
              style={{ ...btnBase, color: 'var(--text-secondary)' }}
            >
              <Eye size={14} />
              <span style={labelStyle}>Ver</span>
            </button>
            {r.excedido <= 0 ? (
              <button
                disabled
                title="No excede el límite, no hay incidencia que crear"
                style={{ ...btnBase, color: 'var(--text-tertiary)', cursor: 'not-allowed', opacity: 0.3 }}
              >
                <Plus size={14} />
                <span style={labelStyle}>Crear</span>
              </button>
            ) : r.yaTieneIncidencia ? (
              <button
                disabled
                title="Ya tiene incidencia creada"
                style={{ ...btnBase, color: 'var(--text-tertiary)', cursor: 'not-allowed', opacity: 0.4 }}
              >
                <CheckCircle size={14} />
                <span style={labelStyle}>Creada</span>
              </button>
            ) : (
              <button
                onClick={() => onCrear(r)}
                title="Crear incidencia (Por Aplicar)"
                style={{ ...btnBase, color: '#16a34a' }}
              >
                <Plus size={14} />
                <span style={labelStyle}>Crear</span>
              </button>
            )}
          </div>
        )
      },
      enableSorting: false,
    },
  ], [onCrear, onVerDetalle, alquilerACargo, alquilerTurno])

  // Exportar
  const [showExportMenu, setShowExportMenu] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showExportMenu) return
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setShowExportMenu(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [showExportMenu])

  function getExportData() {
    return filtered.map(r => ({
      'GPS': r.gpsOrigen,
      'Patente': r.patente,
      'Conductor': r.conductorNombre,
      'DNI': r.conductorDni || '',
      'Km recorridos': r.kmRecorridos,
      'Límite': r.limite,
      'Excedidos': r.excedido,
      'Modalidad': r.modalidad === 'a_cargo' ? 'A Cargo' : 'Turno',
      'Turno': r.modalidad === 'a_cargo' ? '' : (r.horario === 'diurno' ? 'Diurno' : r.horario === 'nocturno' ? 'Nocturno' : r.horario === 'mixto' ? 'Mixto' : ''),
      'Porcentaje': `${r.porcentaje}%`,
      'Monto': r.monto,
      'Estado': r.yaTieneIncidencia ? 'Por aplicar' : 'Sin crear',
    }))
  }
  function exportarExcel() {
    const data = getExportData()
    if (data.length === 0) return
    const ws = XLSX.utils.json_to_sheet(data)
    ws['!cols'] = [{ wch: 8 }, { wch: 10 }, { wch: 32 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 12 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Exceso KM')
    XLSX.writeFile(wb, `Exceso_KM_${new Date().toISOString().slice(0, 10)}.xlsx`)
    setShowExportMenu(false)
  }
  function exportarCSV() {
    const data = getExportData()
    if (data.length === 0) return
    const ws = XLSX.utils.json_to_sheet(data)
    const csv = XLSX.utils.sheet_to_csv(ws)
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Exceso_KM_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Toolbar */}
      <div className="dt-header-bar">
        <div className="dt-search-wrapper">
          <Search size={18} className="dt-search-icon" />
          <input
            type="text"
            placeholder="Buscar por conductor, DNI o patente..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="dt-search-input"
          />
        </div>
        {headerControls}
        {hasActiveFilters && (
          <button onClick={clearAllFilters} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', fontSize: 13, fontWeight: 500,
            border: '1px solid var(--color-danger)', borderRadius: 6,
            background: 'var(--bg-primary)', color: 'var(--color-danger)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            <X size={14} /> Quitar filtros
          </button>
        )}
        <div ref={exportRef} style={{ position: 'relative' }}>
          <button onClick={() => setShowExportMenu(!showExportMenu)} disabled={filtered.length === 0} style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: '6px 10px', fontSize: 13, fontWeight: 500,
            border: '1px solid var(--border-color)', borderRadius: 6,
            background: 'var(--bg-primary)', color: 'var(--text-secondary)',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            <Download size={14} /> Exportar <ChevronDown size={12} />
          </button>
          {showExportMenu && (
            <div style={{
              position: 'absolute', top: '100%', right: 0, marginTop: 4,
              background: 'var(--bg-primary)', border: '1px solid var(--border-color)',
              borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 50, minWidth: 140, overflow: 'hidden',
            }}>
              {[{ fn: exportarExcel, label: 'Excel (.xlsx)' }, { fn: exportarCSV, label: 'CSV (.csv)' }].map(({ fn, label }) => (
                <button key={label} onClick={fn} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', fontSize: 13, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-secondary)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}>
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
        <span style={{ color: 'var(--text-secondary)', fontSize: 13, whiteSpace: 'nowrap' }}>
          {filtered.length} registros
        </span>
      </div>

      {/* Quick filters GPS */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '0 0 12px 0', alignItems: 'center' }}>
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: 4 }}>
          GPS:
        </span>
        {[
          { key: null as null | 'USS' | 'GEOTAB', label: 'Todos', color: 'var(--color-primary)', count: filas.length },
          { key: 'USS' as const, label: 'USS', color: '#10b981', count: gpsCounts.uss },
          { key: 'GEOTAB' as const, label: 'Geotab', color: '#3b82f6', count: gpsCounts.geotab },
        ].map(opt => {
          const active = gpsFilter === opt.key
          if (opt.key !== null && opt.count === 0) return null
          return (
            <button
              key={opt.label}
              onClick={() => setGpsFilter(opt.key)}
              style={{
                padding: '6px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                border: `1px solid ${active ? opt.color : 'var(--border-primary)'}`,
                background: active ? opt.color : 'transparent',
                color: active ? '#fff' : 'var(--text-secondary)',
                cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}
            >
              {!active && opt.key !== null && (
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, display: 'inline-block' }} />
              )}
              {opt.label}
              <span style={{ opacity: 0.85, fontWeight: 500 }}>({opt.count})</span>
            </button>
          )
        })}
      </div>

      {/* DataTable */}
      <DataTable
        data={filtered}
        columns={columns}
        loading={isLoading}
        showSearch={false}
        emptyIcon={<ClipboardList size={48} />}
        emptyTitle="Sin actividad"
        emptyDescription="No hay marcaciones registradas en este rango de fechas."
        pageSize={50}
        pageSizeOptions={[25, 50, 100]}
      />
    </div>
  )
}
