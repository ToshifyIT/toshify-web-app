// src/modules/reportes/kpis-v2/ForecastModal.tsx
// Carga del forecast semanal (objetivos) desde un Excel o CSV.
// Plantilla: una fila por semana con Semana, Flota, Ocupación %, Operatividad %,
// Facturación (ARS, facturado neto de la semana) y Cobranza %.
import { useRef, useState } from 'react'
import { Download, FileSpreadsheet, Upload, X } from 'lucide-react'
import Swal from 'sweetalert2'
import type { ForecastParse } from './kpisV2Types'
import { useAuth } from '../../../contexts/AuthContext'
import {
  etiquetaSemana,
  fechaCorta,
  fmtInt,
  fmtMoneda,
  lunesDe,
  parseForecast,
  sumarDias,
} from './kpisV2Types'
import { fetchForecastDesde, guardarForecast } from './kpisV2Service'

interface ForecastModalProps {
  sedeId: string | null
  sedeNombre: string
  hoy: string
  onClose: () => void
  onSaved: () => void
}

const SEMANAS_PLANTILLA = 26

const fmtPctForecast = (v: number | null) => (v === null ? '—' : `${v.toLocaleString('es-AR')}%`)

export function ForecastModal({ sedeId, sedeNombre, hoy, onClose, onSaved }: ForecastModalProps) {
  const { profile } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ForecastParse | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [descargando, setDescargando] = useState(false)

  async function descargarPlantilla() {
    setDescargando(true)
    try {
      const XLSX = await import('xlsx')
      const desde = lunesDe(hoy)
      const existentes = await fetchForecastDesde(sedeId, desde)
      const porLunes = new Map(existentes.map(f => [f.semana_inicio.slice(0, 10), f]))
      const filas: (string | number | null)[][] = [
        ['Semana', 'Desde', 'Flota', 'Ocupación %', 'Operatividad %', 'Facturación', 'Cobranza %'],
      ]
      for (let i = 0; i < SEMANAS_PLANTILLA; i++) {
        const lunes = sumarDias(desde, i * 7)
        const f = porLunes.get(lunes)
        filas.push([
          etiquetaSemana(lunes),
          lunes,
          f?.flota ?? null,
          f?.ocupacion ?? null,
          f?.operatividad ?? null,
          f?.facturacion ?? null,
          f?.cobranza ?? null,
        ])
      }
      const hoja = XLSX.utils.aoa_to_sheet(filas)
      hoja['!cols'] = [{ wch: 9 }, { wch: 12 }, { wch: 8 }, { wch: 13 }, { wch: 15 }, { wch: 16 }, { wch: 12 }]
      const libro = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(libro, hoja, 'Forecast')
      const sufijo = sedeId ? sedeNombre.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'todas'
      XLSX.writeFile(libro, `forecast-kpis-${sufijo}-${desde}.xlsx`)
    } catch (err) {
      console.error('[DashboardKpisV2] No se pudo generar la plantilla', err)
      Swal.fire('Error', 'No se pudo generar la plantilla.', 'error')
    } finally {
      setDescargando(false)
    }
  }

  async function leerArchivo(file: File) {
    setLeyendo(true)
    setArchivo(file.name)
    setResultado(null)
    try {
      const XLSX = await import('xlsx')
      const buffer = await file.arrayBuffer()
      const libro = XLSX.read(buffer, { type: 'array', cellDates: true })
      const hoja = libro.Sheets[libro.SheetNames[0]]
      const filas = XLSX.utils.sheet_to_json<unknown[]>(hoja, { header: 1, raw: true, defval: null })
      setResultado(parseForecast(filas))
    } catch (err) {
      console.error('[DashboardKpisV2] No se pudo leer el archivo', err)
      setResultado({ filas: [], columnas: [], errores: ['No se pudo leer el archivo. Usá la plantilla en Excel o un CSV.'] })
    } finally {
      setLeyendo(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function guardar() {
    if (!resultado || !resultado.filas.length) return
    setGuardando(true)
    try {
      const n = await guardarForecast(
        sedeId,
        resultado.filas,
        resultado.columnas,
        profile?.full_name ?? profile?.email ?? null,
      )
      await Swal.fire({
        icon: 'success',
        title: 'Forecast guardado',
        text: `${n} ${n === 1 ? 'semana actualizada' : 'semanas actualizadas'} para ${sedeNombre}.`,
        timer: 2500,
        showConfirmButton: false,
      })
      onSaved()
      onClose()
    } catch (err) {
      console.error('[DashboardKpisV2] No se pudo guardar el forecast', err)
      Swal.fire('Error', 'No se pudo guardar el forecast. No se cambió nada.', 'error')
    } finally {
      setGuardando(false)
    }
  }

  const primera = resultado?.filas[0]
  const ultima = resultado?.filas[resultado.filas.length - 1]

  return (
    <div
      className="modal-overlay dkv2-modal-overlay"
      onClick={e => {
        if (e.target === e.currentTarget && !guardando) onClose()
      }}
    >
      <div className="dkv2-modal" role="dialog" aria-modal="true" aria-labelledby="dkv2-modal-title">
        <header className="dkv2-modal-header">
          <div>
            <h2 id="dkv2-modal-title">Cargar forecast</h2>
            <p>
              Objetivos por semana para <strong>{sedeNombre}</strong>. Solo se actualizan las semanas y
              columnas que trae el archivo.
            </p>
          </div>
          <button type="button" className="dkv2-icon-btn" onClick={onClose} aria-label="Cerrar" disabled={guardando}>
            <X size={18} />
          </button>
        </header>

        <div className="dkv2-modal-body">
          <ol className="dkv2-pasos">
            <li>
              <span>Descargá la plantilla ({SEMANAS_PLANTILLA} semanas desde esta, con lo ya cargado).</span>
              <button type="button" className="dkv2-btn" onClick={descargarPlantilla} disabled={descargando}>
                <Download size={15} />
                {descargando ? 'Generando…' : 'Plantilla'}
              </button>
            </li>
            <li>
              <span>
                Completala: ocupación, operatividad y cobranza en %; facturación en pesos (facturado neto
                de la semana). La semana se toma de la columna Desde (lunes). Una celda vacía no borra lo cargado.
              </span>
            </li>
            <li>
              <span>Subí el archivo (Excel o CSV) y revisá antes de guardar.</span>
              <button
                type="button"
                className="dkv2-btn"
                onClick={() => inputRef.current?.click()}
                disabled={leyendo || guardando}
              >
                <Upload size={15} />
                {leyendo ? 'Leyendo…' : 'Subir archivo'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                hidden
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) leerArchivo(file)
                }}
              />
            </li>
          </ol>

          {archivo && resultado ? (
            <div className="dkv2-preview">
              <div className="dkv2-preview-head">
                <FileSpreadsheet size={16} />
                <strong>{archivo}</strong>
                {primera && ultima ? (
                  <span>
                    {resultado.filas.length} {resultado.filas.length === 1 ? 'semana' : 'semanas'} ·{' '}
                    {etiquetaSemana(primera.semana_inicio)} ({fechaCorta(primera.semana_inicio)}) a{' '}
                    {etiquetaSemana(ultima.semana_inicio)} ({fechaCorta(ultima.semana_inicio)})
                  </span>
                ) : null}
              </div>

              {resultado.errores.length ? (
                <p className="dkv2-preview-aviso">Corregí el archivo y volvé a subirlo: no se guarda nada mientras haya errores.</p>
              ) : null}
              {resultado.errores.length ? (
                <ul className="dkv2-preview-errores">
                  {resultado.errores.slice(0, 8).map(e => <li key={e}>{e}</li>)}
                  {resultado.errores.length > 8 ? <li>… y {resultado.errores.length - 8} más.</li> : null}
                </ul>
              ) : null}

              {resultado.filas.length ? (
                <div className="dkv2-table-wrap dkv2-table-wrap--preview">
                  <table className="dkv2-table">
                    <thead>
                      <tr>
                        <th>Semana</th>
                        <th>Flota</th>
                        <th>Ocupación</th>
                        <th>Operatividad</th>
                        <th>Facturación</th>
                        <th>Cobranza</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resultado.filas.map(f => (
                        <tr key={f.semana_inicio}>
                          <td>{etiquetaSemana(f.semana_inicio)} <span className="dkv2-muted">{fechaCorta(f.semana_inicio)}</span></td>
                          <td>{resultado.columnas.includes('flota') ? fmtInt(f.flota) : <span className="dkv2-muted">sin cambio</span>}</td>
                          <td>{resultado.columnas.includes('ocupacion') ? fmtPctForecast(f.ocupacion) : <span className="dkv2-muted">sin cambio</span>}</td>
                          <td>{resultado.columnas.includes('operatividad') ? fmtPctForecast(f.operatividad) : <span className="dkv2-muted">sin cambio</span>}</td>
                          <td>{resultado.columnas.includes('facturacion') ? fmtMoneda(f.facturacion) : <span className="dkv2-muted">sin cambio</span>}</td>
                          <td>{resultado.columnas.includes('cobranza') ? fmtPctForecast(f.cobranza) : <span className="dkv2-muted">sin cambio</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <footer className="dkv2-modal-footer">
          <button type="button" className="dkv2-btn dkv2-btn--ghost" onClick={onClose} disabled={guardando}>
            Cancelar
          </button>
          <button
            type="button"
            className="dkv2-btn dkv2-btn--primary"
            onClick={guardar}
            disabled={!resultado?.filas.length || (resultado?.errores.length ?? 0) > 0 || guardando}
          >
            {guardando
              ? 'Guardando…'
              : resultado?.filas.length
                ? `Guardar ${resultado.filas.length} ${resultado.filas.length === 1 ? 'semana' : 'semanas'}`
                : 'Guardar'}
          </button>
        </footer>
      </div>
    </div>
  )
}
