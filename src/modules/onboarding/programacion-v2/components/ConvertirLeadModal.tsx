// src/modules/onboarding/components/ConvertirLeadModal.tsx
//
// Convierte un lead en conductor desde el envio a entrega de una programacion.
//
// Por que existe: una programacion puede tener un turno ocupado por un LEAD
// (ver sql/programaciones_leads_columns.sql). Al enviarla a entrega hace falta
// un conductor real, porque asignaciones_conductores.conductor_id es FK a
// `conductores`. Este modal completa los datos que la conversion exige y la
// ejecuta; quien lo llama se encarga de repuntar la programacion al conductor
// nuevo.
//
// Muestra los 16 campos obligatorios precargados y editables, no solo los que
// faltan: asi tambien se puede corregir un dato mal cargado sin salir de aca.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { X, Loader2, AlertTriangle, ChevronLeft } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import {
  buscarConductorExistente,
  convertirLeadAConductor,
  validarCamposConversion,
  type CatalogosConversion,
  type OpcionCatalogo,
} from '../../../leads/conversionLeadAConductor'
import type { Lead } from '../../../../types/leads.types'
import {
  validarCuit,
  validarDireccion,
  validarDni,
  validarEmail,
  validarFechaNacimiento,
  validarFechaVencimiento,
  validarNombreCompleto,
  validarNumeroLicencia,
  validarTelefono,
  validarUrl,
} from '../../../../utils/validacionesCampos'

interface Props {
  leadId: string
  /** Turno que ocupa, solo para el titulo. */
  turnoLabel: string
  usuario: string
  sedeFallbackId?: string | null
  onCancel: () => void
  /** Volver al aviso de leads pendientes, guardando lo editado. */
  onVolver: () => void
  /**
   * Se llama con el conductor resultante (creado o fusionado).
   *
   * El aviso de exito lo da QUIEN LLAMA, despues de desmontar este modal:
   * SweetAlert2 se dibuja en z-index 1060 y este modal esta en 10001, asi que
   * un Swal lanzado desde aca queda TAPADO y su `await` no termina nunca
   * (el usuario no puede clickear un boton que no ve).
   */
  onConvertido: (conductorId: string, nombreConductor: string, esFusion: boolean) => void
}

const CATALOGO_VACIO: CatalogosConversion = {
  estadosLicencia: [],
  tiposLicencia: [],
  nacionalidades: [],
  estadosCiviles: [],
  categoriasLicencia: [],
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  border: '1px solid var(--border-primary)',
  borderRadius: '6px',
  fontSize: '13px',
  fontFamily: 'inherit',
  background: 'var(--modal-bg)',
  color: 'var(--text-primary)',
}

/**
 * A nivel de modulo A PROPOSITO.
 *
 * Definido dentro del componente, cada render creaba un tipo de componente
 * nuevo: React desmontaba el subarbol y lo volvia a montar, asi que el input
 * perdia el foco en cada tecla. Declarado aca la identidad es estable y se
 * puede escribir de corrido.
 */
function Campo({
  label,
  obligatorio,
  error,
  children,
}: {
  label: string
  obligatorio?: boolean
  /** Mensaje de formato invalido. Pinta el campo y se muestra debajo. */
  error?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }} data-error={error ? 'si' : undefined}>
      <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)' }}>
        {label} {obligatorio && <span style={{ color: '#ff0033' }}>*</span>}
      </label>
      {children}
      {error && (
        <span style={{ fontSize: '11px', color: '#DC2626', lineHeight: 1.3 }}>{error}</span>
      )}
    </div>
  )
}

export function ConvertirLeadModal({
  leadId,
  turnoLabel,
  usuario,
  sedeFallbackId,
  onCancel,
  onVolver,
  onConvertido,
}: Props) {
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  // Paso en curso: si algo se traba, el boton dice DONDE se trabo.
  const [paso, setPaso] = useState('')
  const [errorConversion, setErrorConversion] = useState<string | null>(null)
  const [guardadoOk, setGuardadoOk] = useState(false)
  // Copia del lead tal como vino de la BD. Sirve para no escribir si el
  // operador solo miro y se fue: un UPDATE sin cambios es ruido en la tabla.
  const leadOriginal = useRef<Lead | null>(null)
  const [saliendo, setSaliendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lead, setLead] = useState<Lead | null>(null)
  const [catalogos, setCatalogos] = useState<CatalogosConversion>(CATALOGO_VACIO)
  const [sedes, setSedes] = useState<Array<{ id: string; nombre: string }>>([])

  // Se trae la ficha COMPLETA del lead: la conversion mapea muchos campos que
  // este modal no muestra (CBU, contacto de emergencia, monotributo...) y se
  // perderian si se editara sobre un subconjunto.
  useEffect(() => {
    let cancelado = false
    ;(async () => {
      setCargando(true)
      setError(null)
      try {
        const [leadRes, catRes, estLicRes, tipLicRes, nacRes, ecRes, sedesRes] = await Promise.all([
          supabase.from('leads').select('*').eq('id', leadId).single(),
          supabase.from('licencias_categorias').select('id, codigo, descripcion').order('descripcion'),
          supabase.from('licencias_estados').select('id, codigo, descripcion').order('descripcion'),
          supabase.from('licencias_tipos').select('id, codigo, descripcion').order('descripcion'),
          supabase.from('nacionalidades').select('id, codigo, descripcion').order('descripcion'),
          supabase.from('estados_civiles').select('id, codigo, descripcion').order('descripcion'),
          (supabase as any).from('sedes').select('id, nombre').eq('activa', true).order('nombre'),
        ])
        if (cancelado) return
        if (leadRes.error) throw leadRes.error

        const cargado = leadRes.data as unknown as Lead
        leadOriginal.current = cargado
        setLead(cargado)
        setCatalogos({
          categoriasLicencia: (catRes.data || []) as OpcionCatalogo[],
          estadosLicencia: (estLicRes.data || []) as OpcionCatalogo[],
          tiposLicencia: (tipLicRes.data || []) as OpcionCatalogo[],
          nacionalidades: (nacRes.data || []) as OpcionCatalogo[],
          estadosCiviles: (ecRes.data || []) as OpcionCatalogo[],
        })
        setSedes((sedesRes.data || []) as Array<{ id: string; nombre: string }>)
      } catch (e) {
        if (!cancelado) setError(e instanceof Error ? e.message : 'No se pudo cargar el lead')
      } finally {
        if (!cancelado) setCargando(false)
      }
    })()
    return () => {
      cancelado = true
    }
  }, [leadId])

  const set = (campo: keyof Lead, valor: unknown) => {
    // El cartel de "guardado" deja de ser cierto en cuanto se toca algo.
    setGuardadoOk(false)
    setLead((prev) => (prev ? ({ ...prev, [campo]: valor } as Lead) : prev))
  }

  // El link de Drive NO se exige aca: si viene vacio, la conversion crea la
  // carpeta sola (createLeadDriveFolder) y la guarda en el lead y en el
  // conductor. El boton "Convertir" del modulo Leads lo sigue pidiendo.
  const faltantesBase = useMemo(
    () => (lead ? validarCamposConversion(lead, { exigirLinkDrive: false }) : []),
    [lead]
  )

  /**
   * Estado y tipo de licencia NO los exige la conversion, pero si este modal:
   * alimentan `licencia_estado_id` / `licencia_tipo_id` del conductor y sin
   * ellos el conductor nace con la ficha a medias.
   */
  const faltantes = useMemo(() => {
    const extra: string[] = []
    if (lead && !lead.estado_licencia?.trim()) extra.push('Estado de licencia')
    if (lead && !lead.tipo_licencia?.trim()) extra.push('Tipo de licencia')
    return [...faltantesBase, ...extra]
  }, [faltantesBase, lead])

  /**
   * Errores de FORMATO, campo por campo. Distinto de `faltantes`: esto mira
   * si lo escrito tiene forma valida, no si hay algo escrito. Un campo vacio
   * nunca da error de formato (de eso se ocupa `faltantes`).
   */
  const errores = useMemo((): Partial<Record<keyof Lead, string>> => {
    if (!lead) return {}
    const e: Partial<Record<keyof Lead, string>> = {}
    const poner = (campo: keyof Lead, msg: string | null) => {
      if (msg) e[campo] = msg
    }
    poner('nombre_completo', validarNombreCompleto(lead.nombre_completo))
    poner('dni', validarDni(lead.dni))
    poner('cuit', validarCuit(lead.cuit))
    poner('fecha_de_nacimiento', validarFechaNacimiento(lead.fecha_de_nacimiento))
    poner('phone', validarTelefono(lead.phone))
    poner('email', validarEmail(lead.email))
    poner('direccion', validarDireccion(lead.direccion))
    poner('numero_licencia', validarNumeroLicencia(lead.numero_licencia))
    poner('vencimiento_licencia', validarFechaVencimiento(lead.vencimiento_licencia))
    poner('url_folder', validarUrl(lead.url_folder))
    return e
  }, [lead])

  const hayErroresFormato = Object.keys(errores).length > 0
  const puedeConvertir = !!lead && faltantes.length === 0 && !hayErroresFormato && !guardando
  // Guardar SI admite campos incompletos: lo unico que bloquea es un dato mal escrito.
  const puedeGuardar = !!lead && !hayErroresFormato && !guardando

  const toggleCategoria = (descripcion: string) => {
    if (!lead) return
    const actuales = lead.categorias_licencia || []
    set(
      'categorias_licencia',
      actuales.includes(descripcion)
        ? actuales.filter((c) => c !== descripcion)
        : [...actuales, descripcion]
    )
  }

  /**
   * Persiste lo editado en `leads`. Se usa en los dos botones:
   *
   *  - "Guardar": guarda lo que haya y cierra nada; el operador puede volver
   *    despues y lo cargado sigue ahi.
   *  - "Convertir y continuar": guarda primero y despues convierte, porque la
   *    conversion trabaja sobre el objeto en memoria pero el lead tiene que
   *    quedar corregido en la base igual.
   *
   * Los campos vacios se guardan como null y no como '': un string vacio en la
   * base parece un dato cargado y rompe los chequeos de "¿esta completo?".
   */
  const guardarLead = async (l: Lead, omitir: Set<string> = new Set()) => {
    const texto = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
    const campos: Record<string, unknown> = {
      nombre_completo: texto(l.nombre_completo),
      dni: texto(l.dni),
      cuit: texto(l.cuit),
      fecha_de_nacimiento: l.fecha_de_nacimiento || null,
      nacionalidad: texto(l.nacionalidad),
      estado_civil: texto(l.estado_civil),
      sede_id: l.sede_id || null,
      phone: texto(l.phone),
      email: texto(l.email),
      direccion: texto(l.direccion),
      numero_licencia: texto(l.numero_licencia),
      categorias_licencia: l.categorias_licencia?.length ? l.categorias_licencia : null,
      vencimiento_licencia: l.vencimiento_licencia || null,
      estado_licencia: texto(l.estado_licencia),
      tipo_licencia: texto(l.tipo_licencia),
      experiencia_previa: texto(l.experiencia_previa),
      cochera: texto(l.cochera),
      url_folder: texto(l.url_folder),
    }

    // Un campo con formato invalido no se guarda: en una columna `date` ni
    // siquiera entraria, y en una de texto dejaria basura. Se conserva todo lo
    // demas, que es lo que importa para no perder el trabajo cargado.
    for (const campo of omitir) delete campos[campo]

    const { error: errUpdate } = await (supabase.from('leads') as any)
      .update(campos)
      .eq('id', l.id)
    if (errUpdate) throw errUpdate
  }

  /** ¿Se edito algo respecto de lo que vino de la base? */
  const hayCambios = useCallback((): boolean => {
    const a = leadOriginal.current
    if (!a || !lead) return false
    const campos: Array<keyof Lead> = [
      'nombre_completo', 'dni', 'cuit', 'fecha_de_nacimiento', 'nacionalidad',
      'estado_civil', 'sede_id', 'phone', 'email', 'direccion', 'numero_licencia',
      'vencimiento_licencia', 'estado_licencia', 'tipo_licencia',
      'experiencia_previa', 'cochera', 'url_folder',
    ]
    for (const c of campos) {
      const va = (a[c] ?? '') as string
      const vb = (lead[c] ?? '') as string
      if (String(va).trim() !== String(vb).trim()) return true
    }
    const ca = (a.categorias_licencia || []).slice().sort().join('|')
    const cb = (lead.categorias_licencia || []).slice().sort().join('|')
    return ca !== cb
  }, [lead])

  /**
   * Salida del modal con autoguardado.
   *
   * Todo lo que se escribio se guarda antes de irse, sea por "Atrás", por la
   * X, por "Cancelar envío" o por Escape: lo que se carga no se pierde nunca.
   * Los campos con formato invalido se omiten (ver guardarLead).
   *
   * Si el guardado falla no se sale: se muestra el error y el operador decide,
   * en vez de cerrar y perder el trabajo en silencio.
   */
  const salir = useCallback(
    async (destino: 'volver' | 'cerrar') => {
      if (guardando || saliendo) return
      const ir = () => (destino === 'volver' ? onVolver() : onCancel())

      if (!lead || !hayCambios()) {
        ir()
        return
      }

      setSaliendo(true)
      try {
        await guardarLead(lead, new Set(Object.keys(errores)))
        ir()
      } catch (e) {
        setErrorConversion(
          `No se pudieron guardar los cambios: ${e instanceof Error ? e.message : 'error desconocido'}`
        )
        setSaliendo(false)
      }
    },
    [lead, guardando, saliendo, hayCambios, onVolver, onCancel, errores]
  )

  /** Escape cierra el modal (guardando lo editado, como cualquier salida). */
  useEffect(() => {
    const alPresionar = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      salir('cerrar')
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [salir])

  /** Guarda sin convertir: sirve para dejar avanzado lo que ya se sabe. */
  const handleGuardar = async () => {
    if (!lead || !puedeGuardar) return
    setGuardando(true)
    setErrorConversion(null)
    setGuardadoOk(false)
    setPaso('Guardando...')
    try {
      await guardarLead(lead)
      setGuardadoOk(true)
    } catch (e) {
      setErrorConversion(e instanceof Error ? e.message : 'No se pudieron guardar los datos')
    } finally {
      setGuardando(false)
      setPaso('')
    }
  }

  const handleConvertir = async () => {
    if (!lead || !puedeConvertir) return
    setGuardando(true)
    setErrorConversion(null)
    setGuardadoOk(false)
    setPaso('Guardando datos del lead...')
    try {
      await guardarLead(lead)

      // El duplicado se resuelve antes para poder avisar que se fusiona en
      // vez de crear, igual que en el modulo de Leads.
      setPaso('Buscando conductor duplicado...')
      const conductorExistente = await buscarConductorExistente(lead)

      setPaso('Creando conductor...')

      const { conductorId, esFusion } = await convertirLeadAConductor({
        lead,
        catalogos,
        usuario,
        sedeFallbackId,
        conductorExistente,
      })

      onConvertido(conductorId, lead.nombre_completo || 'Conductor', esFusion)
    } catch (e) {
      // El error se muestra DENTRO del modal, no en un Swal: asi el operador
      // se queda en el formulario y puede corregir y reintentar.
      setErrorConversion(e instanceof Error ? e.message : 'No se pudo convertir el lead')
      setGuardando(false)
      setPaso('')
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10001,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: 'var(--modal-bg, #fff)',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Encabezado */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border-primary)',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '16px',
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Convertir lead a conductor
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
              Turno {turnoLabel}. Para enviar la programación a entrega esta persona tiene que
              ser un conductor.
            </p>
          </div>
          <button
            onClick={() => salir('cerrar')}
            disabled={guardando || saliendo}
            style={{ background: 'none', border: 'none', cursor: guardando || saliendo ? 'not-allowed' : 'pointer', color: 'var(--text-secondary)' }}
            title="Cerrar (se guarda lo cargado)"
          >
            <X size={22} />
          </button>
        </div>

        {/* Cuerpo */}
        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          {cargando ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', padding: '40px' }}>
              <Loader2 size={28} style={{ color: '#ff0033', animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Cargando datos del lead...</span>
            </div>
          ) : error ? (
            <div style={{ padding: '20px', color: '#DC2626', fontSize: '13px' }}>{error}</div>
          ) : lead ? (
            <>
              {guardadoOk && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: 'rgba(22, 163, 74, 0.1)',
                    border: '1px solid rgba(22, 163, 74, 0.35)',
                    marginBottom: '18px',
                    fontSize: '12px',
                    color: '#15803D',
                  }}
                >
                  <strong>Datos guardados.</strong> Podés cerrar y seguir después: lo cargado
                  queda en el lead.
                </div>
              )}

              {hayErroresFormato && (
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(220, 38, 38, 0.08)',
                    border: '1px solid rgba(220, 38, 38, 0.3)',
                    marginBottom: '18px',
                  }}
                >
                  <AlertTriangle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '12px', color: '#B91C1C' }}>
                    Hay {Object.keys(errores).length} campo(s) con formato inválido. Revisá los
                    mensajes en rojo.
                  </div>
                </div>
              )}

              {errorConversion && (
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(220, 38, 38, 0.1)',
                    border: '1px solid rgba(220, 38, 38, 0.35)',
                    marginBottom: '18px',
                  }}
                >
                  <AlertTriangle size={18} style={{ color: '#DC2626', flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '12px', color: '#B91C1C' }}>
                    <strong>No se pudo convertir:</strong> {errorConversion}
                  </div>
                </div>
              )}

              {faltantes.length > 0 && (
                <div
                  style={{
                    display: 'flex',
                    gap: '10px',
                    padding: '12px 14px',
                    borderRadius: '8px',
                    background: 'rgba(245, 158, 11, 0.12)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    marginBottom: '18px',
                  }}
                >
                  <AlertTriangle size={18} style={{ color: '#B45309', flexShrink: 0, marginTop: '1px' }} />
                  <div style={{ fontSize: '12px', color: '#92400E' }}>
                    <strong>Faltan {faltantes.length} campos para poder convertir:</strong>{' '}
                    {faltantes.join(', ')}.
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '14px' }}>
                <Campo label="Nombre completo" obligatorio error={errores.nombre_completo}>
                  <input style={inputStyle} value={lead.nombre_completo || ''} onChange={(e) => set('nombre_completo', e.target.value)} />
                </Campo>
                <Campo label="DNI" obligatorio error={errores.dni}>
                  <input style={inputStyle} value={lead.dni || ''} onChange={(e) => set('dni', e.target.value)} />
                </Campo>
                <Campo label="CUIT" obligatorio error={errores.cuit}>
                  <input style={inputStyle} value={lead.cuit || ''} onChange={(e) => set('cuit', e.target.value)} />
                </Campo>
                <Campo label="Fecha de nacimiento" obligatorio error={errores.fecha_de_nacimiento}>
                  <input type="date" style={inputStyle} value={(lead.fecha_de_nacimiento || '').substring(0, 10)} onChange={(e) => set('fecha_de_nacimiento', e.target.value)} />
                </Campo>
                <Campo label="Nacionalidad" obligatorio>
                  <select style={inputStyle} value={lead.nacionalidad || ''} onChange={(e) => set('nacionalidad', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {catalogos.nacionalidades.map((o) => (
                      <option key={o.id} value={o.descripcion}>{o.descripcion}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Estado civil" obligatorio>
                  <select style={inputStyle} value={lead.estado_civil || ''} onChange={(e) => set('estado_civil', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {catalogos.estadosCiviles.map((o) => (
                      <option key={o.id} value={o.descripcion}>{o.descripcion}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Sede" obligatorio>
                  <select style={inputStyle} value={lead.sede_id || ''} onChange={(e) => set('sede_id', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {sedes.map((s) => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Teléfono" obligatorio error={errores.phone}>
                  <input style={inputStyle} value={lead.phone || ''} onChange={(e) => set('phone', e.target.value)} />
                </Campo>
                <Campo label="Email" obligatorio error={errores.email}>
                  <input type="email" style={inputStyle} value={lead.email || ''} onChange={(e) => set('email', e.target.value)} />
                </Campo>
                <Campo label="Dirección" obligatorio error={errores.direccion}>
                  <input style={inputStyle} value={lead.direccion || ''} onChange={(e) => set('direccion', e.target.value)} />
                </Campo>
                <Campo label="Nro. de licencia" obligatorio error={errores.numero_licencia}>
                  <input style={inputStyle} value={lead.numero_licencia || ''} onChange={(e) => set('numero_licencia', e.target.value)} />
                </Campo>
                <Campo label="Vencimiento de licencia" obligatorio error={errores.vencimiento_licencia}>
                  <input type="date" style={inputStyle} value={(lead.vencimiento_licencia || '').substring(0, 10)} onChange={(e) => set('vencimiento_licencia', e.target.value)} />
                </Campo>
                <Campo label="Estado de licencia" obligatorio>
                  <select style={inputStyle} value={lead.estado_licencia || ''} onChange={(e) => set('estado_licencia', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {catalogos.estadosLicencia.map((o) => (
                      <option key={o.id} value={o.descripcion}>{o.descripcion}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Tipo de licencia" obligatorio>
                  <select style={inputStyle} value={lead.tipo_licencia || ''} onChange={(e) => set('tipo_licencia', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    {catalogos.tiposLicencia.map((o) => (
                      <option key={o.id} value={o.descripcion}>{o.descripcion}</option>
                    ))}
                  </select>
                </Campo>
                <Campo label="Cochera" obligatorio>
                  <select style={inputStyle} value={lead.cochera || ''} onChange={(e) => set('cochera', e.target.value)}>
                    <option value="">Seleccionar...</option>
                    <option value="Si">Si</option>
                    <option value="No">No</option>
                  </select>
                </Campo>
                <Campo label="Experiencia previa" obligatorio>
                  <input style={inputStyle} value={lead.experiencia_previa || ''} onChange={(e) => set('experiencia_previa', e.target.value)} />
                </Campo>
              </div>

              <div style={{ marginTop: '14px', display: 'grid', gap: '14px' }}>
                <Campo label="Link de Documentación (Drive)" error={errores.url_folder}>
                  <input
                    style={inputStyle}
                    placeholder="https://drive.google.com/..."
                    value={lead.url_folder || ''}
                    onChange={(e) => set('url_folder', e.target.value)}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                    Opcional. Si lo dejás vacío, la carpeta se crea automáticamente al convertir.
                  </span>
                </Campo>

                <Campo label="Categorías de licencia" obligatorio>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {catalogos.categoriasLicencia.map((c) => {
                      const activa = (lead.categorias_licencia || []).includes(c.descripcion)
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCategoria(c.descripcion)}
                          style={{
                            padding: '5px 11px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            border: activa ? '1px solid #ff0033' : '1px solid var(--border-primary)',
                            background: activa ? 'rgba(255, 0, 51, 0.1)' : 'var(--modal-bg)',
                            color: activa ? '#ff0033' : 'var(--text-secondary)',
                          }}
                        >
                          {c.descripcion}
                        </button>
                      )
                    })}
                  </div>
                </Campo>
              </div>
            </>
          ) : null}
        </div>

        {/* Pie */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border-primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <button
            onClick={() => salir('volver')}
            disabled={guardando || saliendo}
            title="Volver a la lista de leads. Lo cargado se guarda solo."
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 18px',
              borderRadius: '8px',
              border: '1px solid var(--border-primary)',
              background: 'var(--modal-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: guardando || saliendo ? 'not-allowed' : 'pointer',
            }}
          >
            <ChevronLeft size={16} /> {saliendo ? 'Guardando...' : 'Atrás'}
          </button>

          <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => salir('cerrar')}
            disabled={guardando || saliendo}
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-primary)',
              background: 'var(--modal-bg)',
              color: 'var(--text-primary)',
              fontSize: '14px',
              fontWeight: 600,
              cursor: guardando ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar envío
          </button>
          <button
            onClick={handleGuardar}
            disabled={!puedeGuardar}
            title="Guarda lo cargado sin convertir. Podés volver más tarde y seguir."
            style={{
              padding: '10px 20px',
              borderRadius: '8px',
              border: '1px solid var(--border-primary)',
              background: 'var(--modal-bg)',
              color: puedeGuardar ? 'var(--text-primary)' : '#9CA3AF',
              fontSize: '14px',
              fontWeight: 600,
              cursor: puedeGuardar ? 'pointer' : 'not-allowed',
            }}
          >
            Guardar
          </button>
          <button
            onClick={handleConvertir}
            disabled={!puedeConvertir}
            style={{
              padding: '10px 22px',
              borderRadius: '8px',
              border: 'none',
              background: puedeConvertir ? '#16a34a' : '#9CA3AF',
              color: 'white',
              fontSize: '14px',
              fontWeight: 700,
              cursor: puedeConvertir ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {guardando && <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />}
            {guardando ? paso || 'Convirtiendo...' : 'Convertir y continuar'}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}
