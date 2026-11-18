// src/modules/integraciones/twochat/LlamadaConductor.tsx
// Llamar a un conductor desde Toshibase con el kit de voz de 2Chat (@2chat/voice-sdk).
// El servidor da un permiso temporal para la cuenta de 2Chat del usuario (la suya o
// la compartida «Info Toshify») y anota quién llama, para que Control de llamadas
// muestre a la persona real. La API key de 2Chat nunca llega al navegador.
//
// El teléfono (Device) se crea una sola vez por pestaña y se reutiliza: activarlo
// cuesta 1 crédito de la API y el permiso dura una jornada.
import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff, Phone, PhoneOff, X } from 'lucide-react'
import type { Call, Device } from '@2chat/voice-sdk'
import { cerrarRegistroLlamada, obtenerTokenVoz, prepararLlamadaConductor, senalLlamada } from '../../../services/twoChatService'
import type { TipoTelefono } from './telefonosConductor'

interface Telefono { device: Device; desde: string; cuenta: string; compartida: boolean }
let telefono: Telefono | null = null
let activando: Promise<Telefono> | null = null

async function obtenerTelefono(): Promise<Telefono> {
  if (telefono?.device.isRegistered()) return telefono
  if (activando) return activando
  activando = (async () => {
    const { Device } = await import('@2chat/voice-sdk')
    const t = await obtenerTokenVoz()
    // Las credenciales se piden por nuestro servidor: 2Chat no acepta esas consultas
    // desde otro sitio que no sea app.2chat.io (ver /api/2chat/sdk en server-2chat.js)
    const device = new Device({ token: t.token, logLevel: 'warn', apiBaseUrl: `${window.location.origin}/api/2chat/sdk` })
    device.on('tokenWillExpire', async () => {
      try {
        await device.updateToken((await obtenerTokenVoz()).token)
      } catch (err) {
        console.error('No se pudo renovar el permiso de voz:', err)
      }
    })
    await device.register()
    const nuevo: Telefono = { device, desde: t.desde, cuenta: t.cuenta, compartida: t.compartida }
    telefono = nuevo
    window.addEventListener('beforeunload', () => device.destroy(), { once: true })
    return nuevo
  })()
  try {
    return await activando
  } finally {
    activando = null
  }
}

// Cada cuánto se avisa que la llamada sigue: con una cuenta compartida (Info Toshify),
// mientras llega esta señal la línea figura ocupada para los demás. El servidor la
// libera si pasa 1 minuto sin señal (p. ej. si se cerró el navegador sin cortar).
const SENAL_LLAMADA_MS = 20000

type Estado = 'preparando' | 'llamando' | 'sonando' | 'en_curso' | 'terminada' | 'error'

const ETIQUETA: Record<Estado, string> = {
  preparando: 'Preparando el teléfono…',
  llamando: 'Llamando…',
  sonando: 'Sonando…',
  en_curso: 'En llamada',
  terminada: 'Llamada terminada',
  error: 'No se pudo llamar',
}

function reloj(seg: number) {
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, '0')}`
}

interface LlamadaConductorProps {
  conductorId: string
  nombre: string
  /** A qué número: el de WhatsApp (principal, por defecto) o el secundario */
  telefono?: TipoTelefono
  onClose: () => void
}

export function LlamadaConductor({ conductorId, nombre, telefono: tipoTelefono = 'principal', onClose }: LlamadaConductorProps) {
  const [estado, setEstado] = useState<Estado>('preparando')
  const [error, setError] = useState<string | null>(null)
  const [numero, setNumero] = useState<string | null>(null)
  const [cuenta, setCuenta] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [segundos, setSegundos] = useState(0)
  const callRef = useRef<Call | null>(null)
  const atendidaEn = useRef<number | null>(null)
  // Colgó la persona desde Toshibase: el kit lo informa como error «Canceled», pero no es una falla
  const colgadaPorUsuario = useRef(false)

  useEffect(() => {
    let cancelado = false
    let registroId: number | null = null
    let cerrado = false
    let senal: ReturnType<typeof setInterval> | null = null
    const cerrarRegistro = (fin: 'atendida' | 'no_atendida' | 'fallida') => {
      if (senal) clearInterval(senal)
      senal = null
      if (cerrado || registroId == null) return
      cerrado = true
      const dur = atendidaEn.current ? Math.round((Date.now() - atendidaEn.current) / 1000) : 0
      void cerrarRegistroLlamada(registroId, fin, dur).catch(() => undefined)
    }
    // En desarrollo React monta y desmonta el componente una vez antes de montarlo de
    // verdad: arrancar en el próximo tick evita lanzar (y registrar) dos llamadas.
    const arranque = setTimeout(() => { void llamar() }, 0)
    const llamar = async () => {
      try {
        // Pedir el micrófono primero: si se niega, no se gasta nada
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        stream.getTracks().forEach(t => t.stop())
        const [info, tel] = await Promise.all([prepararLlamadaConductor(conductorId, tipoTelefono), obtenerTelefono()])
        if (cancelado) return
        registroId = info.registro_id
        if (registroId != null) {
          const id = registroId
          senal = setInterval(() => { void senalLlamada(id).catch(() => undefined) }, SENAL_LLAMADA_MS)
        }
        setNumero(info.numero)
        setCuenta(tel.compartida ? tel.cuenta : null)
        setEstado('llamando')
        const call = await tel.device.connect({ to: info.numero, from: tel.desde })
        callRef.current = call
        // El kit espera a juntar TODOS los candidatos de red antes de mandar la llamada,
        // y en algunas redes eso no termina nunca (la llamada quedaba «Llamando…» y se
        // caía). Se manda apenas aparece el candidato público (srflx) o un relay.
        let listo = false
        ;(call.session as unknown as { on?: (ev: string, fn: (e: { candidate?: RTCIceCandidate; ready: () => void }) => void) => void })
          ?.on?.('icecandidate', (e) => {
            if (!listo && (e.candidate?.type === 'srflx' || e.candidate?.type === 'relay')) {
              listo = true
              e.ready()
            }
          })
        call.on('ringing', () => setEstado('sonando'))
        call.on('accepted', () => { atendidaEn.current = Date.now(); setEstado('en_curso') })
        call.on('disconnect', () => {
          setEstado(prev => (prev === 'error' ? prev : 'terminada'))
          cerrarRegistro(atendidaEn.current ? 'atendida' : 'no_atendida')
        })
        call.on('error', (e: { message?: string }) => {
          if (colgadaPorUsuario.current) return
          setError(e?.message || 'Error en la llamada')
          setEstado('error')
          cerrarRegistro('fallida')
        })
      } catch (e) {
        if (cancelado) return
        const msg = e instanceof Error ? e.message : String(e)
        setError(/Permission|NotAllowed/i.test(msg) ? 'Permití el uso del micrófono en el navegador para poder llamar.' : msg)
        setEstado('error')
        cerrarRegistro('fallida')
      }
    }
    return () => {
      cancelado = true
      clearTimeout(arranque)
      if (senal) clearInterval(senal)
      const c = callRef.current
      if (c && c.getStatus() !== 'disconnected' && c.getStatus() !== 'failed') void c.disconnect()
    }
  }, [conductorId, tipoTelefono])

  useEffect(() => {
    if (estado !== 'en_curso') return
    const id = setInterval(() => {
      if (atendidaEn.current) setSegundos(Math.round((Date.now() - atendidaEn.current) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [estado])

  // Al terminar, la barrita se cierra sola (4 s; con error 8 s, para poder leerlo)
  // (onClose por ref: la pantalla lo pasa como función nueva en cada render)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    if (estado !== 'terminada' && estado !== 'error') return
    const id = setTimeout(() => onCloseRef.current(), estado === 'error' ? 8000 : 4000)
    return () => clearTimeout(id)
  }, [estado])

  const activa = estado === 'llamando' || estado === 'sonando' || estado === 'en_curso'
  const colgar = () => {
    colgadaPorUsuario.current = true
    void callRef.current?.disconnect()
  }
  const silenciar = () => {
    const c = callRef.current
    if (!c) return
    c.mute(!isMuted)
    setIsMuted(!isMuted)
  }

  return (
    <div
      role="dialog"
      aria-label={`Llamada a ${nombre}`}
      style={{
        position: 'fixed', right: 20, bottom: 20, zIndex: 'var(--z-modal)', width: 320,
        background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 34, height: 34, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          background: estado === 'en_curso' ? '#16a34a' : estado === 'error' ? 'var(--color-danger)' : 'var(--bg-tertiary)',
          color: estado === 'en_curso' || estado === 'error' ? '#fff' : 'var(--text-secondary)', flexShrink: 0,
        }}>
          <Phone size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {ETIQUETA[estado]}{estado === 'en_curso' ? ` · ${reloj(segundos)}` : ''}{numero ? ` · ${numero}` : ''}
          </div>
        </div>
        {!activa && estado !== 'preparando' && (
          <button className="btn-icon" onClick={onClose} aria-label="Cerrar"><X size={16} /></button>
        )}
      </div>
      {cuenta && activa && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Sale por la cuenta compartida «{cuenta}»; queda registrado que la hiciste vos.</div>
      )}
      {error && <div style={{ fontSize: 12, color: 'var(--color-danger)' }}>{error}</div>}
      {activa && (
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-secondary" onClick={silenciar} disabled={estado !== 'en_curso'} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {isMuted ? <MicOff size={15} /> : <Mic size={15} />} {isMuted ? 'Activar mic' : 'Silenciar'}
          </button>
          <button className="btn-primary" onClick={colgar} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <PhoneOff size={15} /> Colgar
          </button>
        </div>
      )}
    </div>
  )
}
