import { useState, useEffect, useCallback } from 'react';
import type { ReactNode, CSSProperties } from 'react';
import {
  ChevronDown, ChevronRight, Clock, Shield, Globe,
  Radio, MapPin, Car, HardDrive, Mail, Eye, EyeOff, Receipt, Landmark, Phone,
  AlertCircle,
  Bot, Key, Plus, Trash2, Copy, Check, Power,
  CalendarClock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { formatFecha, formatFechaHora } from '../../utils/format';
import { Spinner } from '../../components/ui/LoadingOverlay'
import { EmptyState } from '../../components/ui/EstadosVista'
import { TabsBar } from '../../components/ui/TabsBar'

// =============================================
// Tipos
// =============================================

interface IntegrationEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
}

interface CronJob {
  schedule: string;
  description: string;
  script: string;
}

interface IntegrationSystem {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  color: string;
  badgeColor: string;
  authType: string;
  authDescription: string;
  baseUrl: string;
  environment: 'server' | 'frontend' | 'both';
  status: 'active' | 'inactive';
  endpoints: IntegrationEndpoint[];
  cronJobs: CronJob[];
  notes: string[];
  tokenInfo: {
    type: string;
    location: string;
    rotation: string;
  };
  /** Valores de cron_jobs.integracion cuyos scripts del servidor pertenecen a esta integracion */
  jobIntegraciones?: string[];
  /** Codigo en cabify_cuentas (solo Cabify): muestra flota, sede y ultimo dato de la cuenta */
  cuentaCabify?: string;
  /** Keys in the /api/admin/tokens response to display as credentials */
  credentialKeys?: { systemKey: string; fields: { key: string; label: string }[] };
}

/** Shape of server response from /api/admin/tokens */
interface TokensResponse {
  success: boolean;
  tokens: Record<string, Record<string, string | null>>;
}

// =============================================
// Data — Informacion publica, sin credenciales
// =============================================

const INTEGRATIONS: IntegrationSystem[] = [
  {
    id: 'geotab',
    name: 'Geotab (GPS)',
    description: 'Telemetría de la flota: kilometraje y posición de los vehículos. Reemplazó a Wialon y USS.',
    icon: Radio,
    color: 'var(--color-info)',
    badgeColor: 'blue',
    authType: 'Usuario + contraseña (sesión MyGeotab)',
    authDescription: 'El servidor de sincronización (toshify-sync) inicia sesión en MyGeotab con un usuario de servicio y obtiene una sesión temporal para las consultas. La web no se conecta directo a Geotab.',
    baseUrl: 'https://my.geotab.com/apiv1',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'POST', path: 'Authenticate', description: 'Iniciar sesión y obtener la sesión' },
      { method: 'POST', path: 'Get (StatusData / LogRecord)', description: 'Odómetro y posiciones de cada vehículo' },
    ],
    cronJobs: [],
    jobIntegraciones: ['geotab'],
    notes: [
      'Corre en el servidor toshify-sync (sync-geotab-kilometraje), no en la web',
      'Wialon y USS quedaron dados de baja: USS pausado desde el 06/08/2026',
    ],
    tokenInfo: {
      type: 'Sesión temporal (se renueva sola)',
      location: 'Servidor toshify-sync (env.sh)',
      rotation: 'Cambiar la contraseña del usuario de servicio si se compromete',
    },
  },
  {
    id: 'cabify-ba',
    name: 'Cabify Grupo CG',
    description: 'Cuenta de Cabify de la flota Grupo CG (sede Buenos Aires): viajes, ganancias y peajes de sus conductores.',
    icon: Car,
    color: 'var(--color-purple)',
    badgeColor: 'purple',
    authType: 'OAuth2 (usuario + contraseña)',
    authDescription: 'El script del servidor inicia sesión con el usuario de la cuenta en cada ejecución y obtiene un token temporal. La web pide su token a /api/cabify/token (las claves nunca llegan al navegador).',
    baseUrl: 'https://partners.cabify.com/api/graphql',
    environment: 'both',
    status: 'active',
    endpoints: [
      { method: 'POST', path: '/auth/api/authorization', description: 'Obtener access_token con credenciales' },
      { method: 'POST', path: '/api/graphql', description: 'Consultar viajes, peajes y ganancias via GraphQL' },
    ],
    cronJobs: [],
    jobIntegraciones: ['cabify_ba', 'cabify_bari'],
    cuentaCabify: 'CG',
    notes: [
      'Un solo script recorre todas las cuentas activas de Parámetros › Grupos de flota › Cuentas de Cabify',
      'Los datos se guardan en cabify_historico con la columna cuenta_cabify = CG',
      'Las edge functions viejas de Cabify (lista de Procesos automáticos) están desactivadas: ya no se usan',
    ],
    tokenInfo: {
      type: 'OAuth2 Access Token (temporal)',
      location: '.env (web) + env.sh (scripts del servidor)',
      rotation: 'Automática — se pide uno nuevo en cada ejecución',
    },
    credentialKeys: {
      systemKey: 'cabify_ba',
      fields: [
        { key: 'username', label: 'Username' },
        { key: 'password', label: 'Password' },
        { key: 'client_id', label: 'Client ID' },
        { key: 'client_secret', label: 'Client Secret' },
        { key: 'company_id', label: 'Company ID' },
      ],
    },
  },
  {
    id: 'cabify-44',
    name: 'Cabify 44 Dreams',
    description: 'Cuenta de Cabify de la flota 44 Dreams (sede Buenos Aires): viajes, ganancias y peajes de sus conductores.',
    icon: Car,
    color: '#8B5CF6',
    badgeColor: 'purple',
    authType: 'OAuth2 (usuario + contraseña)',
    authDescription: 'Misma mecánica que la cuenta de Grupo CG, con el usuario de 44 Dreams (variables CABIFY_USERNAME_44 / CABIFY_PASSWORD_44 del servidor).',
    baseUrl: 'https://partners.cabify.com/api/graphql',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'POST', path: '/auth/api/authorization', description: 'Obtener access_token' },
      { method: 'POST', path: '/api/graphql', description: 'Consultar viajes via GraphQL' },
    ],
    cronJobs: [],
    jobIntegraciones: ['cabify_ba', 'cabify_bari'],
    cuentaCabify: '44dreams',
    notes: [
      'La sincroniza el mismo script que a Grupo CG (no hay un script por cuenta)',
      'Los datos se guardan en cabify_historico con la columna cuenta_cabify = 44dreams',
    ],
    tokenInfo: {
      type: 'OAuth2 Access Token (temporal)',
      location: 'env.sh de los scripts del servidor',
      rotation: 'Automática — se pide uno nuevo en cada ejecución',
    },
    credentialKeys: {
      systemKey: 'cabify_44',
      fields: [
        { key: 'username', label: 'Username' },
        { key: 'password', label: 'Password' },
        { key: 'company_id', label: 'Company ID' },
      ],
    },
  },
  {
    id: 'google-maps',
    name: 'Google Maps',
    description: 'API de Google Maps para visualizacion de mapas, geocodificacion y calculo de rutas en el frontend.',
    icon: MapPin,
    color: 'var(--color-success)',
    badgeColor: 'green',
    authType: 'API Key (estatica)',
    authDescription: 'API Key de Google Cloud Platform. Se usa directamente en el frontend (variable VITE_). No expira, pero tiene restricciones de dominio configuradas en GCP.',
    baseUrl: 'https://maps.googleapis.com/maps/api/',
    environment: 'frontend',
    status: 'active',
    endpoints: [
      { method: 'GET', path: 'Maps JavaScript API', description: 'Renderizado de mapas interactivos' },
      { method: 'GET', path: 'Geocoding API', description: 'Conversion direccion <-> coordenadas' },
    ],
    cronJobs: [],
    notes: [
      'La API Key esta expuesta en el frontend (normal para Google Maps)',
      'Protegida por restriccion de dominio en Google Cloud Console',
      'No requiere rotacion a menos que se comprometa',
    ],
    tokenInfo: {
      type: 'API Key (permanente)',
      location: '.env (VITE_GOOGLE_MAPS_API_KEY)',
      rotation: 'No requerida — protegida por restriccion de dominio',
    },
    credentialKeys: {
      systemKey: 'google_maps',
      fields: [
        { key: 'api_key', label: 'API Key' },
      ],
    },
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Servicio de almacenamiento para documentos de conductores y vehiculos. Usa una Service Account de Google Cloud.',
    icon: HardDrive,
    color: '#4285F4',
    badgeColor: 'blue',
    authType: 'Service Account (JWT)',
    authDescription: 'Service Account de GCP con clave privada RSA. Genera JWT tokens internamente para autenticarse — no requiere intervencion manual. El server.js expone endpoints /api/drive/* para el frontend.',
    baseUrl: 'https://www.googleapis.com/drive/v3/',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'GET', path: '/api/drive/files/:folderId', description: 'Listar archivos de una carpeta' },
      { method: 'GET', path: '/api/drive/download/:fileId', description: 'Descargar archivo' },
      { method: 'POST', path: '/api/drive/upload', description: 'Subir archivo a carpeta' },
      { method: 'DELETE', path: '/api/drive/files/:fileId', description: 'Eliminar archivo' },
    ],
    cronJobs: [],
    notes: [
      'Carpeta Conductores y Vehiculos con IDs fijos configurados en .env',
      'El frontend nunca accede a Drive directamente — pasa por server.js',
      'La Service Account tiene permisos limitados a las carpetas compartidas',
    ],
    tokenInfo: {
      type: 'Service Account (JWT auto-generado)',
      location: '.env (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY)',
      rotation: 'No requerida — la clave privada no expira',
    },
    credentialKeys: {
      systemKey: 'google_drive',
      fields: [
        { key: 'service_account_email', label: 'Service Account Email' },
        { key: 'conductores_folder_id', label: 'Carpeta Conductores' },
        { key: 'vehiculos_folder_id', label: 'Carpeta Vehiculos' },
        { key: 'private_key_preview', label: 'Private Key (preview)' },
      ],
    },
  },
  {
    id: 'alegra',
    name: 'Alegra (Contabilidad)',
    description: 'Contabilidad de 44 Dreams y Grupo CG: carga de comprobantes de ARCA y de pagos/cobros bancarios.',
    icon: Receipt,
    color: '#00B19D',
    badgeColor: 'green',
    authType: 'Email + token de API (Basic)',
    authDescription: 'Cada empresa tiene su propio usuario y token de API de Alegra. Las claves viven solo en el servidor; la web pasa por /api/alegra y /api/cresium.',
    baseUrl: 'https://api.alegra.com/api/v1',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'POST', path: '/api/alegra/*', description: 'Comprobantes de ARCA: revisar y cargar en Alegra' },
      { method: 'POST', path: '/bills, /payments', description: 'Facturas de proveedor y pagos/cobros' },
    ],
    cronJobs: [],
    notes: [
      'Nunca modifica comprobantes que ya existen en Alegra',
      'Proveedores nuevos se crean por CUIT con domicilio provisorio',
    ],
    tokenInfo: {
      type: 'Token de API (permanente)',
      location: '.env (ALEGRA_44DREAMS_EMAIL/TOKEN, ALEGRA_GRUPOCG_EMAIL/TOKEN)',
      rotation: 'Se regenera desde Alegra > Configuración > API',
    },
    credentialKeys: {
      systemKey: 'alegra',
      fields: [
        { key: 'email_44dreams', label: '44 Dreams · Usuario' },
        { key: 'token_44dreams', label: '44 Dreams · Token' },
        { key: 'email_grupocg', label: 'Grupo CG · Usuario' },
        { key: 'token_grupocg', label: 'Grupo CG · Token' },
      ],
    },
  },
  {
    id: 'cresium',
    name: 'Cresium (Banco)',
    description: 'Movimientos bancarios de 44 Dreams y Grupo CG, para conciliarlos y cargarlos en Alegra.',
    icon: Landmark,
    color: '#6366F1',
    badgeColor: 'blue',
    authType: 'API Key + Secret (Partner API V3)',
    authDescription: 'Cada empresa tiene su API key, secret y company ID. Los movimientos se guardan en la base; a Cresium solo se va a buscar lo nuevo.',
    baseUrl: 'https://api.cresium.app',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'GET', path: '/api/cresium/*', description: 'Traer movimientos nuevos y proponer la carga en Alegra' },
    ],
    cronJobs: [],
    notes: [
      'Con CRESIUM_SYNC_AUTO=1 trae lo nuevo sola cada hora, de 9 a 18 h',
      'Guarda los ids de Alegra para no cargar nada dos veces',
    ],
    tokenInfo: {
      type: 'API Key + Secret (permanente)',
      location: '.env (CRESIUM_44DREAMS_*, CRESIUM_GRUPOCG_*)',
      rotation: 'Se regeneran desde el panel de Cresium',
    },
    credentialKeys: {
      systemKey: 'cresium',
      fields: [
        { key: 'api_key_44dreams', label: '44 Dreams · API Key' },
        { key: 'company_44dreams', label: '44 Dreams · Company ID' },
        { key: 'api_key_grupocg', label: 'Grupo CG · API Key' },
        { key: 'company_grupocg', label: 'Grupo CG · Company ID' },
        { key: 'sync_auto', label: 'Actualización automática' },
      ],
    },
  },
  {
    id: '2chat',
    name: '2Chat (Llamadas)',
    description: 'Central telefónica: conductores como contactos para llamarlos e historial de llamadas por agente.',
    icon: Phone,
    color: '#22C55E',
    badgeColor: 'green',
    authType: 'API Key (X-User-API-Key)',
    authDescription: 'Una API key de la cuenta de 2Chat, solo en el servidor. La web pasa por /api/2chat.',
    baseUrl: 'https://api.p.2chat.io/open',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'POST', path: '/api/2chat/*', description: 'Cargar contactos y traer llamadas' },
    ],
    cronJobs: [],
    notes: [
      'Con TWOCHAT_SYNC_AUTO=1 actualiza las llamadas cada hora, de 9 a 17 h',
    ],
    tokenInfo: {
      type: 'API Key (permanente)',
      location: '.env (TWOCHAT_API_KEY)',
      rotation: 'Se regenera desde 2Chat',
    },
    credentialKeys: {
      systemKey: 'twochat',
      fields: [
        { key: 'api_key', label: 'API Key' },
        { key: 'sync_auto', label: 'Actualización automática' },
      ],
    },
  },
  {
    id: 'resend',
    name: 'Resend (Email)',
    description: 'Servicio de envio de emails transaccionales. Definido pero actualmente sin uso activo en produccion.',
    icon: Mail,
    color: 'var(--text-tertiary)',
    badgeColor: 'gray',
    authType: 'API Key (estatica)',
    authDescription: 'API Key de Resend para envio de emails. Configurada en variables de entorno pero aun no integrada en flujos de produccion.',
    baseUrl: 'https://api.resend.com/',
    environment: 'server',
    status: 'inactive',
    endpoints: [
      { method: 'POST', path: '/emails', description: 'Enviar email transaccional' },
    ],
    cronJobs: [],
    notes: [
      'Servicio configurado pero SIN USO ACTIVO',
      'Pendiente de integracion en flujos de notificaciones',
    ],
    tokenInfo: {
      type: 'API Key (permanente)',
      location: '.env (RESEND_API_KEY)',
      rotation: 'No requerida',
    },
    credentialKeys: {
      systemKey: 'resend',
      fields: [
        { key: 'api_key', label: 'API Key' },
      ],
    },
  },
];

// =============================================
// Componentes auxiliares
// =============================================

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    GET: { bg: 'var(--badge-green-bg)', text: 'var(--badge-green-text)' },
    POST: { bg: 'var(--badge-blue-bg)', text: 'var(--badge-blue-text)' },
    PUT: { bg: 'var(--badge-yellow-bg)', text: 'var(--badge-yellow-text)' },
    DELETE: { bg: 'var(--badge-red-bg)', text: 'var(--badge-red-text)' },
  };
  const c = colors[method] || colors.GET;
  return (
    <span style={{
      display: 'inline-block',
      padding: '2px 8px',
      borderRadius: 'var(--radius-xs)',
      fontSize: '11px',
      fontWeight: 700,
      fontFamily: 'var(--font-mono)',
      background: c.bg,
      color: c.text,
      minWidth: '50px',
      textAlign: 'center',
    }}>
      {method}
    </span>
  );
}

function StatusBadge({ status }: { status: 'active' | 'inactive' }) {
  const isActive = status === 'active';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 12px',
      borderRadius: 'var(--radius-full)',
      fontSize: '12px',
      fontWeight: 600,
      background: isActive ? 'var(--badge-green-bg)' : 'var(--badge-gray-bg)',
      color: isActive ? 'var(--badge-green-text)' : 'var(--badge-gray-text)',
    }}>
      <span style={{
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: isActive ? 'var(--color-success)' : 'var(--text-tertiary)',
      }} />
      {isActive ? 'Activo' : 'Inactivo'}
    </span>
  );
}

function maskValue(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '*'.repeat(value.length);
  return value.substring(0, 4) + '*'.repeat(Math.min(value.length - 8, 20)) + value.slice(-4);
}

function CredentialField({ label, value }: { label: string; value: string | null }) {
  const [visible, setVisible] = useState(false);

  if (!value) {
    return (
      <div style={{ marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
          {label}
        </span>
        <div style={{ marginTop: '2px' }}>
          <span style={{
            fontSize: '12px',
            color: 'var(--text-tertiary)',
            fontStyle: 'italic',
          }}>
            No configurado en servidor
          </span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
        <span style={{
          fontSize: '13px',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-mono)',
          background: 'var(--bg-tertiary)',
          padding: '4px 8px',
          borderRadius: 'var(--radius-xs)',
          wordBreak: 'break-all',
          flex: 1,
          minWidth: 0,
        }}>
          {visible ? value : maskValue(value)}
        </span>
        <button
          onClick={() => setVisible(!visible)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-tertiary)',
            padding: '4px',
            flexShrink: 0,
            borderRadius: 'var(--radius-xs)',
          }}
          title={visible ? 'Ocultar' : 'Mostrar'}
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      </div>
    </div>
  );
}

function TokenInfoField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: '8px' }}>
      <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
        {label}
      </span>
      <div style={{ marginTop: '2px' }}>
        <span style={{
          fontSize: '13px',
          color: 'var(--text-primary)',
        }}>
          {value}
        </span>
      </div>
    </div>
  );
}

// =============================================
// Scripts del servidor (en vivo, tabla cron_jobs)
// =============================================

interface CuentaCabifyInfo {
  codigo: string;
  nombre: string;
  activa: boolean;
  tabla_destino: string;
  grupo: string | null;
  sede: string | null;
  ultimoDato: string | null;
}

type EstadoJob = 'funcionando' | 'atrasado' | 'error' | 'desactivado' | 'manual' | 'sin_registro';

/** Minutos entre ejecuciones segun el cron (aprox.): sirve para saber si un job esta al dia. */
function intervaloMinutos(schedule: string): number | null {
  const p = schedule.trim().split(/\s+/);
  if (p.length !== 5) return null;
  const [min, hour, , , dow] = p;
  const cadaN = min.match(/\/(\d+)$/);
  if (cadaN && hour === '*') return Number(cadaN[1]);
  if (hour === '*') return 60;
  if (dow !== '*') return 7 * 24 * 60;
  return 24 * 60;
}

function estadoJob(job: CronJobRecord): EstadoJob {
  const meta = (job.metadata || {}) as Record<string, unknown>;
  if (meta.desactivado) return 'desactivado';
  if (!job.activo && job.tipo !== 'email') return 'desactivado';
  if (job.schedule === 'manual') return 'manual';
  if (job.ultimo_estado === 'error') return 'error';
  if (!job.ultima_ejecucion) return 'sin_registro';
  const iv = intervaloMinutos(job.schedule);
  const minutos = (Date.now() - new Date(job.ultima_ejecucion).getTime()) / 60000;
  if (iv && !meta.a_pedido && minutos > iv * 3 + 20) return 'atrasado';
  return 'funcionando';
}

const ESTADO_JOB: Record<EstadoJob, { label: string; color: string; bg: string; ayuda: string }> = {
  funcionando: { label: 'Funcionando', color: '#047857', bg: 'rgba(16,185,129,0.12)', ayuda: 'La última ejecución terminó bien y está al día' },
  atrasado: { label: 'Atrasado', color: '#b45309', bg: 'rgba(245,158,11,0.14)', ayuda: 'Hace más de lo esperado que no termina una ejecución' },
  error: { label: 'Con error', color: '#dc2626', bg: 'rgba(239,68,68,0.12)', ayuda: 'La última ejecución falló' },
  desactivado: { label: 'Desactivado', color: '#6b7280', bg: 'var(--bg-tertiary)', ayuda: 'No está programado: no corre' },
  manual: { label: 'Manual', color: '#6b7280', bg: 'var(--bg-tertiary)', ayuda: 'No tiene horario: se corre a mano cuando hace falta' },
  sin_registro: { label: 'Sin registro aún', color: '#6b7280', bg: 'var(--bg-tertiary)', ayuda: 'Todavía no terminó ninguna ejecución registrada' },
};

function haceCuanto(fecha: string | null): string {
  if (!fecha) return 'nunca';
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return formatFecha(fecha);
}

function ordenarJobs(jobs: CronJobRecord[]): CronJobRecord[] {
  const peso: Record<EstadoJob, number> = { error: 0, atrasado: 1, funcionando: 2, sin_registro: 3, manual: 4, desactivado: 5 };
  return [...jobs].sort((a, b) => peso[estadoJob(a)] - peso[estadoJob(b)] || a.nombre.localeCompare(b.nombre));
}

/** Resumen de una linea para el encabezado de la tarjeta (sin abrirla). */
function ResumenServidor({ jobs }: { jobs: CronJobRecord[] }) {
  const vivos = jobs.filter(j => !['desactivado', 'manual'].includes(estadoJob(j)));
  if (vivos.length === 0) return null;
  const conProblema = vivos.filter(j => ['error', 'atrasado'].includes(estadoJob(j)));
  const ultima = vivos.map(j => j.ultima_ejecucion).filter(Boolean).sort().pop() || null;
  const color = conProblema.length ? '#b45309' : '#047857';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px', fontSize: '12px', color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: color }} />
      <span>
        {vivos.length} {vivos.length === 1 ? 'script' : 'scripts'} en el servidor
        {conProblema.length ? <strong style={{ color }}> · {conProblema.length} con problema</strong> : null}
        {' · '}último sync {haceCuanto(ultima)}
      </span>
    </div>
  );
}

function ScriptsServidor({ jobs }: { jobs: CronJobRecord[] }) {
  return (
    <div style={{ marginTop: '16px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <CalendarClock size={14} />
        Scripts en el servidor (en vivo)
      </div>
      {jobs.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '10px 14px' }}>
          No tiene scripts programados en el servidor.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          {ordenarJobs(jobs).map((job, i) => {
            const est = estadoJob(job);
            const cfg = ESTADO_JOB[est];
            const apagado = est === 'desactivado';
            return (
              <div key={job.id} style={{ padding: '10px 14px', borderTop: i === 0 ? 'none' : '1px solid var(--border-primary)', opacity: apagado ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 280px', minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{job.nombre}</span>
                      <span title={cfg.ayuda} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    {job.descripcion && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.45 }}>{job.descripcion}</div>
                    )}
                    {job.comando && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', marginTop: '3px', wordBreak: 'break-all' }}>
                        {rutaJob(job)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '18px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Frecuencia</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{job.schedule === 'manual' ? 'A mano' : describeCron(job.schedule)}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '92px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Última ejecución</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: job.ultimo_estado === 'error' ? '#dc2626' : 'var(--text-primary)' }}>{haceCuanto(job.ultima_ejecucion)}</div>
                    </div>
                  </div>
                </div>
                {job.ultimo_estado === 'error' && job.ultimo_error && (
                  <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.06)', fontSize: '11px', color: '#dc2626' }}>{job.ultimo_error}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CuentaCabifyBloque({ cuenta }: { cuenta: CuentaCabifyInfo | undefined }) {
  const fila = (label: string, valor: ReactNode) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', fontSize: '13px', padding: '3px 0' }}>
      <span style={{ color: 'var(--text-tertiary)' }}>{label}</span>
      <span style={{ color: 'var(--text-primary)', fontWeight: 500, textAlign: 'right' }}>{valor}</span>
    </div>
  );
  return (
    <div style={{ marginTop: '16px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', padding: '12px 14px' }}>
      <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Car size={14} />
        Cuenta (Parámetros › Grupos de flota)
      </div>
      {!cuenta ? (
        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>No está cargada en Cuentas de Cabify.</div>
      ) : (
        <>
          {fila('Estado', <span style={{ color: cuenta.activa ? '#047857' : '#6b7280', fontWeight: 700 }}>{cuenta.activa ? 'Activa — se sincroniza' : 'Desactivada'}</span>)}
          {fila('Flota', cuenta.grupo || '—')}
          {fila('Sede', cuenta.sede || '—')}
          {fila('Guarda en', <code style={{ fontSize: '12px' }}>{cuenta.tabla_destino} · cuenta_cabify = {cuenta.codigo}</code>)}
          {fila('Último dato recibido', haceCuanto(cuenta.ultimoDato))}
        </>
      )}
    </div>
  );
}

// =============================================
// Card de cada integracion
// =============================================

function IntegrationCard({ system, serverTokens, tokensLoading, tokensError, jobs, cuenta }: {
  system: IntegrationSystem;
  serverTokens: Record<string, Record<string, string | null>> | null;
  tokensLoading: boolean;
  tokensError: string | null;
  jobs: CronJobRecord[];
  cuenta?: CuentaCabifyInfo;
}) {
  const [expanded, setExpanded] = useState(false);
  const Icon = system.icon;

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border-primary)',
      borderRadius: 'var(--radius-lg)',
      marginBottom: '12px',
      overflow: 'hidden',
      transition: 'box-shadow 0.2s',
    }}>
      {/* Header clickable */}
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 20px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        <div style={{
          width: '40px',
          height: '40px',
          borderRadius: 'var(--radius-lg)',
          background: `color-mix(in srgb, ${system.color} 15%, transparent)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}>
          <Icon size={20} style={{ color: system.color }} />
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {system.name}
            </span>
            <StatusBadge status={system.status} />
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            {system.description}
          </div>
          {system.jobIntegraciones && <ResumenServidor jobs={jobs} />}
        </div>

        <div style={{ color: 'var(--text-tertiary)', flexShrink: 0 }}>
          {expanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div style={{
          padding: '0 20px 20px',
          borderTop: '1px solid var(--border-primary)',
        }}>
          {/* Grid de info */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '16px',
            marginTop: '16px',
          }}>
            {/* Autenticacion */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                <Shield size={14} />
                Autenticacion
              </div>
              <div style={{
                display: 'inline-block',
                padding: '3px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '12px',
                fontWeight: 600,
                background: `var(--badge-${system.badgeColor}-bg)`,
                color: `var(--badge-${system.badgeColor}-text)`,
                marginBottom: '8px',
              }}>
                {system.authType}
              </div>
              <p style={{
                fontSize: '13px',
                color: 'var(--text-secondary)',
                margin: 0,
                lineHeight: '1.5',
              }}>
                {system.authDescription}
              </p>
            </div>

            {/* Token / Credenciales info */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                <Eye size={14} />
                Credenciales
              </div>

              {/* Server credential values */}
              {tokensLoading && (
                <Spinner size="sm" message="Cargando credenciales..." />
              )}
              {tokensError && (
                <div style={{ fontSize: '12px', color: 'var(--color-danger)', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                  <AlertCircle size={12} />
                  {tokensError}
                </div>
              )}
              {!tokensLoading && !tokensError && system.credentialKeys && serverTokens && (
                <>
                  {system.credentialKeys.fields.map(field => {
                    const systemData = serverTokens[system.credentialKeys!.systemKey];
                    const value = systemData ? systemData[field.key] : null;
                    return <CredentialField key={field.key} label={field.label} value={value} />;
                  })}
                </>
              )}
              {!tokensLoading && !tokensError && !serverTokens && (
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', fontStyle: 'italic' }}>
                  No se pudieron cargar las credenciales
                </div>
              )}

              {/* Static token metadata */}
              <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border-primary)' }}>
                <TokenInfoField label="Tipo" value={system.tokenInfo.type} />
                <TokenInfoField label="Ubicacion" value={system.tokenInfo.location} />
                <TokenInfoField label="Rotacion" value={system.tokenInfo.rotation} />
              </div>
            </div>

            {/* Entorno */}
            <div style={{
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-md)',
              padding: '14px',
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginBottom: '10px',
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
              }}>
                <Globe size={14} />
                Entorno
              </div>
              <div style={{ marginBottom: '8px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '3px 10px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: '12px',
                  fontWeight: 600,
                  background: system.environment === 'frontend'
                    ? 'var(--badge-green-bg)'
                    : system.environment === 'server'
                      ? 'var(--badge-blue-bg)'
                      : 'var(--badge-purple-bg)',
                  color: system.environment === 'frontend'
                    ? 'var(--badge-green-text)'
                    : system.environment === 'server'
                      ? 'var(--badge-blue-text)'
                      : 'var(--badge-purple-text)',
                }}>
                  {system.environment === 'frontend' ? 'Frontend' : system.environment === 'server' ? 'Servidor' : 'Frontend + Servidor'}
                </span>
              </div>
              <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 600, fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Base URL</span>
                <br />
                <code style={{
                  fontSize: '12px',
                  background: 'var(--bg-tertiary)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-xs)',
                  wordBreak: 'break-all',
                }}>
                  {system.baseUrl}
                </code>
              </div>
            </div>
          </div>

          {/* Endpoints */}
          {system.endpoints.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <Globe size={14} />
                Endpoints / Servicios
              </div>
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}>
                {system.endpoints.map((ep, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderBottom: i < system.endpoints.length - 1 ? '1px solid var(--border-primary)' : 'none',
                  }}>
                    <MethodBadge method={ep.method} />
                    <code style={{
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      fontWeight: 600,
                      minWidth: '180px',
                    }}>
                      {ep.path}
                    </code>
                    <span style={{
                      fontSize: '12px',
                      color: 'var(--text-secondary)',
                    }}>
                      {ep.description}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {system.cuentaCabify && <CuentaCabifyBloque cuenta={cuenta} />}

          {system.jobIntegraciones && <ScriptsServidor jobs={jobs} />}

          {/* Cron Jobs */}
          {system.cronJobs.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                marginBottom: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                <Clock size={14} />
                Tareas Programadas (Cron)
              </div>
              <div style={{
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}>
                {system.cronJobs.map((cron, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '10px 14px',
                    borderBottom: i < system.cronJobs.length - 1 ? '1px solid var(--border-primary)' : 'none',
                  }}>
                    <code style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      color: 'var(--color-primary)',
                      background: 'var(--bg-tertiary)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-xs)',
                      minWidth: '120px',
                      textAlign: 'center',
                    }}>
                      {cron.schedule}
                    </code>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {cron.description}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                        {cron.script}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notas */}
          {system.notes.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <div style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.3px',
                marginBottom: '8px',
              }}>
                Notas
              </div>
              <ul style={{
                margin: 0,
                paddingLeft: '20px',
                listStyle: 'disc',
              }}>
                {system.notes.map((note, i) => (
                  <li key={i} style={{
                    fontSize: '13px',
                    color: 'var(--text-secondary)',
                    lineHeight: '1.6',
                  }}>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================
// Componente Principal
// =============================================

// =============================================
// Tab: Credenciales (standalone)
// =============================================

function CredencialesTab({ serverTokens, tokensLoading, tokensError }: {
  serverTokens: Record<string, Record<string, string | null>> | null;
  tokensLoading: boolean;
  tokensError: string | null;
}) {
  return (
    <div>
      {/* Info banner */}
      <div style={{
        background: 'var(--badge-blue-bg)',
        border: '1px solid var(--color-info)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        marginBottom: '16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '10px',
        fontSize: '13px',
        color: 'var(--badge-blue-text)',
        lineHeight: '1.5',
      }}>
        <Shield size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
        <div>
          <strong>Solo para administradores</strong> — Las credenciales se muestran enmascaradas. Usa el icono
          del ojo para revelar cada valor. Para modificar tokens o credenciales, acceder al servidor via SSH
          y editar env.sh o .env segun corresponda.
        </div>
      </div>

      {tokensLoading && (
        <Spinner size="sm" message="Cargando credenciales..." />
      )}

      {tokensError && (
        <div style={{
          padding: '16px',
          background: 'var(--badge-red-bg)',
          border: '1px solid var(--color-danger)',
          borderRadius: 'var(--radius-md)',
          color: 'var(--badge-red-text)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '13px',
          marginBottom: '16px',
        }}>
          <AlertCircle size={16} />
          {tokensError}
        </div>
      )}

      {!tokensLoading && !tokensError && INTEGRATIONS.filter(s => s.credentialKeys).map(system => {
        const systemData = serverTokens?.[system.credentialKeys!.systemKey];
        const Icon = system.icon;
        return (
          <div key={system.id} style={{
            background: 'var(--card-bg)',
            border: '1px solid var(--border-primary)',
            borderRadius: 'var(--radius-lg)',
            marginBottom: '12px',
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                background: `color-mix(in srgb, ${system.color} 15%, transparent)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={18} style={{ color: system.color }} />
              </div>
              <div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {system.name}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>
                  {system.tokenInfo.type} — {system.tokenInfo.location}
                </div>
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '8px',
            }}>
              {system.credentialKeys!.fields.map(field => {
                const value = systemData ? systemData[field.key] : null;
                return <CredentialField key={field.key} label={field.label} value={value} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =============================================
// Tab types & config
// =============================================

// =============================================
// MCP API Keys Tab
// =============================================

interface ApiKeyData {
  id: string;
  name: string;
  api_key: string;
  is_active: boolean;
  permissions: string[];
  last_used_at: string | null;
  created_at: string;
}

const AVAILABLE_PERMISSIONS = [
  { value: 'leads:read', label: 'Leads: Lectura', desc: 'Buscar y ver leads' },
  { value: 'leads:create', label: 'Leads: Crear', desc: 'Crear nuevos leads' },
  { value: 'leads:update', label: 'Leads: Escritura', desc: 'Actualizar campos de leads' },
  { value: 'leads:delete', label: 'Leads: Eliminar', desc: 'Eliminar leads' },
  { value: 'hireflix:read', label: 'Hireflix: Lectura', desc: 'Buscar y ver registros de Hireflix' },
  { value: 'datos:read', label: 'Datos de operación: Lectura', desc: 'Solo lectura de conductores, vehículos, asignaciones, leads, onboarding, incidencias, siniestros, multas, telepase, inventario, visitas, guías, telemetría e indicadores. Sin facturación ni parámetros. Para conectar Claude u otro asistente.' },
  { value: 'hireflix:create', label: 'Hireflix: Crear', desc: 'Crear registros de Hireflix' },
  { value: 'hireflix:update', label: 'Hireflix: Escritura', desc: 'Actualizar registros de Hireflix' },
  { value: 'hireflix:delete', label: 'Hireflix: Eliminar', desc: 'Eliminar registros de Hireflix' },
  { value: 'leads:api', label: 'Leads: API REST (externos)', desc: 'Acceso de solo lectura a GET /api/v1/leads. Para terceros fuera de Toshify.' },
  { value: 'vehiculos:api', label: 'Vehiculos: API REST (externos)', desc: 'Solo lectura de GET /api/v1/vehiculos. Sin chasis, motor, titular ni poliza.' },
  { value: 'conductores:api', label: 'Conductores: API REST (externos)', desc: 'Solo lectura de GET /api/v1/conductores. Sin CBU, antecedentes ni datos de emergencia.' },
  { value: 'asignaciones:api', label: 'Asignaciones: API REST (externos)', desc: 'Solo lectura de GET /api/v1/asignaciones. Vinculo conductor-vehiculo.' },
  { value: 'flota:api', label: 'Estado de Flota: API REST (externos)', desc: 'Solo lectura de GET /api/v1/estado-flota. Toda la flota con su asignacion activa.' },
  { value: 'leads:create:api', label: 'Leads: Alta por API REST (externos)', desc: 'ESCRITURA. Habilita POST /api/v1/leads para dar de alta leads. Unico permiso de la API REST que modifica la base.' },
];

function McpTab() {
  const [apiKeys, setApiKeys] = useState<ApiKeyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPermissions, setNewPermissions] = useState<string[]>(['leads:read', 'hireflix:read']);
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());

  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('api_keys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApiKeys(data || []);
    } catch (err) {
      console.error('Error fetching API keys:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      // Generate a random 64-char hex key
      const array = new Uint8Array(32);
      crypto.getRandomValues(array);
      const apiKey = Array.from(array, b => b.toString(16).padStart(2, '0')).join('');

      const { error } = await supabase
        .from('api_keys')
        .insert({
          name: newName.trim(),
          api_key: apiKey,
          permissions: newPermissions,
        });

      if (error) throw error;

      setNewName('');
      setShowCreate(false);
      await fetchKeys();
    } catch (err) {
      console.error('Error creating API key:', err);
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (key: ApiKeyData) => {
    try {
      const { error } = await supabase
        .from('api_keys')
        .update({ is_active: !key.is_active })
        .eq('id', key.id);

      if (error) throw error;
      await fetchKeys();
    } catch (err) {
      console.error('Error toggling API key:', err);
    }
  };

  const deleteKey = async (key: ApiKeyData) => {
    if (!confirm(`Eliminar la API key "${key.name}"? Esta accion no se puede deshacer.`)) return;
    try {
      const { error } = await supabase
        .from('api_keys')
        .delete()
        .eq('id', key.id);

      if (error) throw error;
      await fetchKeys();
    } catch (err) {
      console.error('Error deleting API key:', err);
    }
  };

  const copyKey = (key: ApiKeyData) => {
    navigator.clipboard.writeText(key.api_key);
    setCopiedId(key.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const toggleReveal = (id: string) => {
    setRevealedKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePermission = (perm: string) => {
    setNewPermissions(prev =>
      prev.includes(perm) ? prev.filter(p => p !== perm) : [...prev, perm]
    );
  };

  const maskKey = (key: string) => `${key.substring(0, 8)}${'*'.repeat(48)}${key.substring(key.length - 8)}`;

  const formatDate = (date: string | null) => {
    if (!date) return 'Nunca';
    return formatFechaHora(date);
  };

  return (
    <div>
      {/* MCP Info header */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 20px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Bot size={20} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: '15px' }}>MCP Server - Model Context Protocol</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
          Servidor MCP para que chatbots y asistentes (como Claude) accedan a datos de Toshify.
          Cada API key tiene permisos granulares. Con "Datos de operación: Lectura" el asistente
          solo puede consultar datos de operación (sin facturación ni parámetros) y nunca modificarlos.
        </p>
        <div style={{
          display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap',
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>Docs: </span>
            <a
              href="https://mcp.toshify.com.ar/docs"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
            >
              mcp.toshify.com.ar/docs
            </a>
          </div>
          <div style={{
            background: 'var(--bg-secondary)',
            padding: '8px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: '12px',
            fontFamily: 'var(--font-mono)',
          }}>
            <span style={{ color: 'var(--text-secondary)' }}>SSE: </span>
            <span style={{ color: 'var(--color-primary)' }}>mcp.toshify.com.ar/sse</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, margin: 0 }}>
          <Key size={16} style={{ marginRight: '6px', verticalAlign: '-2px' }} />
          API Keys ({apiKeys.length})
        </h3>
        <button
          onClick={() => setShowCreate(!showCreate)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            padding: '8px 16px',
            background: 'var(--color-primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <Plus size={14} />
          Nueva API Key
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--color-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          marginBottom: '16px',
        }}>
          <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Crear nueva API Key</h4>

          <div style={{ marginBottom: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>
              Nombre (identificar al chatbot/integracion)
            </label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ej: Chatbot WhatsApp"
              style={{
                width: '100%',
                padding: '8px 12px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-primary)',
                fontSize: '13px',
              }}
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              Permisos
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {AVAILABLE_PERMISSIONS.map(perm => (
                <label
                  key={perm.value}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 12px',
                    background: newPermissions.includes(perm.value) ? 'rgba(88, 166, 255, 0.08)' : 'var(--bg-secondary)',
                    border: `1px solid ${newPermissions.includes(perm.value) ? 'var(--color-primary)' : 'var(--border-primary)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newPermissions.includes(perm.value)}
                    onChange={() => togglePermission(perm.value)}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>{perm.label}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{perm.desc}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim() || newPermissions.length === 0}
              style={{
                padding: '8px 20px',
                background: creating || !newName.trim() || newPermissions.length === 0 ? 'var(--border-primary)' : 'var(--color-primary)',
                color: '#fff',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: creating || !newName.trim() || newPermissions.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {creating ? 'Creando...' : 'Crear API Key'}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              style={{
                padding: '8px 20px',
                background: 'transparent',
                color: 'var(--text-secondary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* API Keys list */}
      {loading ? (
        <Spinner size="sm" message="Cargando API keys..." />
      ) : apiKeys.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: 'var(--text-secondary)',
          background: 'var(--bg-card)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border-primary)',
        }}>
          <Bot size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
          <EmptyState size="sm" title="No hay API keys creadas" />
          <p style={{ fontSize: '12px' }}>Crea una para conectar un chatbot al MCP Server</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {apiKeys.map(key => (
            <div
              key={key.id}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${key.is_active ? 'var(--border-primary)' : 'var(--color-error)'}`,
                borderRadius: 'var(--radius-md)',
                padding: '16px 20px',
                opacity: key.is_active ? 1 : 0.6,
              }}
            >
              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Key size={16} style={{ color: key.is_active ? 'var(--color-primary)' : 'var(--text-secondary)' }} />
                  <span style={{ fontWeight: 700, fontSize: '14px' }}>{key.name}</span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: 'var(--radius-xs)',
                    background: key.is_active ? 'rgba(59, 185, 80, 0.15)' : 'rgba(248, 81, 73, 0.15)',
                    color: key.is_active ? '#3fb950' : '#f85149',
                    fontWeight: 600,
                  }}>
                    {key.is_active ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    onClick={() => toggleActive(key)}
                    title={key.is_active ? 'Desactivar' : 'Activar'}
                    style={{
                      padding: '6px', background: 'transparent', border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-xs)', cursor: 'pointer', color: 'var(--text-secondary)',
                    }}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => deleteKey(key)}
                    title="Eliminar"
                    style={{
                      padding: '6px', background: 'transparent', border: '1px solid var(--border-primary)',
                      borderRadius: 'var(--radius-xs)', cursor: 'pointer', color: '#f85149',
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              {/* API Key value */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                background: 'var(--bg-secondary)',
                padding: '8px 12px',
                borderRadius: 'var(--radius-sm)',
                marginBottom: '8px',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
              }}>
                <span style={{ flex: 1, wordBreak: 'break-all' }}>
                  {revealedKeys.has(key.id) ? key.api_key : maskKey(key.api_key)}
                </span>
                <button
                  onClick={() => toggleReveal(key.id)}
                  style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
                >
                  {revealedKeys.has(key.id) ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  onClick={() => copyKey(key)}
                  style={{ padding: '4px', background: 'transparent', border: 'none', cursor: 'pointer', color: copiedId === key.id ? '#3fb950' : 'var(--text-secondary)' }}
                >
                  {copiedId === key.id ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>

              {/* Permissions & meta */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {key.permissions?.map(perm => (
                    <span
                      key={perm}
                      style={{
                        fontSize: '11px',
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-xs)',
                        background: perm.includes('update') ? 'rgba(210, 153, 34, 0.15)' : 'rgba(59, 185, 80, 0.15)',
                        color: perm.includes('update') ? '#d29922' : '#3fb950',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {perm}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  Ultimo uso: {formatDate(key.last_used_at)} &middot; Creada: {formatDate(key.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================
// Registro de procesos (tabla cron_jobs)
// =============================================

interface CronJobRecord {
  id: string;
  nombre: string;
  descripcion: string | null;
  schedule: string;
  comando: string | null;
  tipo: string;
  integracion: string | null;
  activo: boolean;
  ultima_ejecucion: string | null;
  ultimo_estado: string | null;
  ultimo_error: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

function describeCron(cron: string): string {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;
  const days = ['domingos', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábados'];
  const hhmm = (h: string, m: string) => `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
  if (min === '*' && hour === '*') return 'Cada minuto';
  // "*/10" o "5-59/10" (cada N minutos con desfase)
  const cadaN = min.match(/^(?:\*|\d+-\d+)\/(\d+)$/);
  if (cadaN && hour === '*') return `Cada ${cadaN[1]} min`;
  if (hour === '*' && /^\d+$/.test(min)) return min === '0' ? 'Cada hora' : `Cada hora (al minuto ${min})`;
  if (/^\d+$/.test(min) && /^\d+$/.test(hour)) {
    if (dow !== '*') {
      const nombres = dow.split(',').map(d => days[parseInt(d)] || d).join(', ');
      return `Los ${nombres} ${hhmm(hour, min)}`;
    }
    return `Todos los días ${hhmm(hour, min)}`;
  }
  return cron;
}

const INTEG_LABELS: Record<string, string> = {
  geotab: 'Geotab', wialon: 'Wialon', uss: 'USS', cabify_ba: 'Cabify', cabify_bari: 'Cabify Bariloche', sistema: 'Sistema',
};


// =============================================
// Procesos automáticos (todo lo que corre solo: servidor, base de datos y funciones)
// =============================================

interface FuncionSupabase {
  id: string;
  function_name: string;
  label: string;
  description: string;
  category: string;
  is_active: boolean;
}

type DondeCorre = 'servidor' | 'base' | 'funcion';

interface FilaProceso {
  id: string;
  nombre: string;
  descripcion: string | null;
  integracion: string;
  donde: DondeCorre;
  ruta: string | null;
  frecuencia: string;
  ultima: string | null;
  estado: EstadoJob;
  error: string | null;
  job?: CronJobRecord;
  funcion?: FuncionSupabase;
}

const DONDE: Record<DondeCorre, string> = {
  servidor: 'Servidor',
  base: 'Base de datos',
  funcion: 'Supabase (función)',
};

const FILTROS_PROCESO: { id: 'todos' | 'funcionando' | 'problema' | 'desactivado'; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'funcionando', label: 'Funcionando' },
  { id: 'problema', label: 'Con problema' },
  { id: 'desactivado', label: 'Desactivados' },
];

function rutaJob(job: CronJobRecord): string | null {
  const meta = (job.metadata || {}) as Record<string, unknown>;
  if (typeof meta.ruta === 'string' && meta.ruta) return meta.ruta;
  if (!job.comando) return null;
  if (job.tipo === 'pg_cron') return job.comando.slice(0, 90);
  return job.comando.startsWith('/') ? job.comando : `/opt/toshify-sync/${job.comando}`;
}

function filaDeJob(job: CronJobRecord): FilaProceso {
  return {
    id: job.id,
    nombre: job.nombre,
    descripcion: job.descripcion,
    integracion: INTEG_LABELS[job.integracion || ''] || job.integracion || 'Sistema',
    donde: job.tipo === 'pg_cron' ? 'base' : 'servidor',
    ruta: rutaJob(job),
    frecuencia: job.schedule === 'manual' ? 'A mano' : describeCron(job.schedule),
    ultima: job.ultima_ejecucion,
    estado: estadoJob(job),
    error: job.ultimo_estado === 'error' ? job.ultimo_error : null,
    job,
  };
}

function filaDeFuncion(fn: FuncionSupabase): FilaProceso {
  return {
    id: `fn-${fn.id}`,
    nombre: fn.label || fn.function_name,
    descripcion: fn.description || null,
    integracion: CATEGORIA_FUNCION[fn.category] || fn.category || 'Sistema',
    donde: 'funcion',
    ruta: fn.function_name,
    frecuencia: 'Cuando la web la llama',
    ultima: null,
    estado: fn.is_active ? 'funcionando' : 'desactivado',
    error: null,
    funcion: fn,
  };
}

const CATEGORIA_FUNCION: Record<string, string> = { sistema: 'Sistema', cabify: 'Cabify', wialon: 'Wialon', google: 'Google' };

function ProcesosAutomaticos({ jobs, cargando }: { jobs: CronJobRecord[]; cargando: boolean }) {
  const [funciones, setFunciones] = useState<FuncionSupabase[]>([]);
  const [filtro, setFiltro] = useState<'todos' | 'funcionando' | 'problema' | 'desactivado'>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [cambiando, setCambiando] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/admin/function-health?ping=0', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelado && data.success) setFunciones(data.functions || []);
      } catch { /* sin la API local no se listan las funciones */ }
    })();
    return () => { cancelado = true; };
  }, []);

  const cambiarFuncion = async (fn: FuncionSupabase) => {
    setCambiando(fn.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch('/api/admin/toggle-function', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ functionId: fn.id, isActive: !fn.is_active }),
      });
      if (res.ok) setFunciones(prev => prev.map(f => f.id === fn.id ? { ...f, is_active: !f.is_active } : f));
    } finally {
      setCambiando(null);
    }
  };

  const filas = [...jobs.map(filaDeJob), ...funciones.map(filaDeFuncion)];
  const peso: Record<EstadoJob, number> = { error: 0, atrasado: 1, funcionando: 2, sin_registro: 3, manual: 4, desactivado: 5 };
  const q = busqueda.trim().toLowerCase();
  const visibles = filas
    .filter(f => {
      if (filtro === 'funcionando') return f.estado === 'funcionando';
      if (filtro === 'problema') return f.estado === 'error' || f.estado === 'atrasado';
      if (filtro === 'desactivado') return f.estado === 'desactivado';
      return true;
    })
    .filter(f => !q || `${f.nombre} ${f.descripcion || ''} ${f.integracion} ${f.ruta || ''}`.toLowerCase().includes(q))
    .sort((a, b) => peso[a.estado] - peso[b.estado] || a.integracion.localeCompare(b.integracion) || a.nombre.localeCompare(b.nombre));

  const cuenta = (id: typeof filtro) => id === 'todos' ? filas.length
    : id === 'problema' ? filas.filter(f => f.estado === 'error' || f.estado === 'atrasado').length
    : filas.filter(f => f.estado === id).length;

  const th: CSSProperties = { position: 'sticky', top: 0, zIndex: 1, background: 'var(--card-bg)', textAlign: 'left', padding: '10px 12px', fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '1px solid var(--border-primary)', whiteSpace: 'nowrap' };
  const td: CSSProperties = { padding: '10px 12px', fontSize: '12px', color: 'var(--text-primary)', borderBottom: '1px solid var(--border-primary)', verticalAlign: 'top' };

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-lg)', marginBottom: '20px', overflow: 'hidden' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-primary)', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CalendarClock size={18} /> Procesos automáticos
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            Todo lo que corre solo: qué hace, dónde corre, cada cuánto y cómo le fue. El estado del servidor se actualiza cada 5 minutos.
          </div>
        </div>
        <input
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          placeholder="Buscar proceso..."
          style={{ padding: '7px 10px', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-md)', fontSize: '13px', background: 'var(--bg-primary)', color: 'var(--text-primary)', minWidth: '200px' }}
        />
      </div>
      <div style={{ display: 'flex', gap: '6px', padding: '10px 20px', borderBottom: '1px solid var(--border-primary)', flexWrap: 'wrap' }}>
        {FILTROS_PROCESO.map(f => (
          <button
            key={f.id}
            onClick={() => setFiltro(f.id)}
            style={{ padding: '4px 12px', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-primary)', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
              background: filtro === f.id ? 'var(--color-primary)' : 'var(--bg-primary)', color: filtro === f.id ? '#fff' : 'var(--text-secondary)' }}
          >
            {f.label} ({cuenta(f.id)})
          </button>
        ))}
      </div>
      {cargando ? (
        <div style={{ padding: '30px' }}><Spinner size="sm" message="Cargando procesos..." /></div>
      ) : visibles.length === 0 ? (
        <div style={{ padding: '20px' }}><EmptyState size="sm" title="No hay procesos con ese filtro" /></div>
      ) : (
        // Scroll propio con la cabecera fija: al bajar se sigue viendo qué es cada columna
        <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
          <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr>
                <th style={th}>Proceso</th>
                <th style={th}>Integración</th>
                <th style={th}>Dónde corre</th>
                <th style={th}>Frecuencia</th>
                <th style={th}>Última ejecución</th>
                <th style={th}>Estado</th>
                <th style={{ ...th, textAlign: 'center' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map(f => {
                const cfg = ESTADO_JOB[f.estado];
                return (
                  <tr key={f.id} style={{ opacity: f.estado === 'desactivado' ? 0.65 : 1 }}>
                    <td style={{ ...td, minWidth: '260px' }}>
                      <div style={{ fontWeight: 600 }}>{f.nombre}</div>
                      {f.descripcion && <div style={{ color: 'var(--text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>{f.descripcion}</div>}
                      {f.error && <div style={{ marginTop: '6px', padding: '4px 8px', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.06)', color: '#dc2626', fontSize: '11px' }}>{f.error}</div>}
                    </td>
                    <td style={td}>{f.integracion}</td>
                    <td style={td}>
                      <div>{DONDE[f.donde]}</div>
                      {f.ruta && <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all', maxWidth: '260px' }}>{f.ruta}</div>}
                    </td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{f.frecuencia}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      {f.donde === 'funcion' ? '—' : f.ultima ? (
                        <>
                          <div>{formatFechaHora(f.ultima)}</div>
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{haceCuanto(f.ultima)}</div>
                        </>
                      ) : 'Nunca'}
                    </td>
                    <td style={td}>
                      <span title={cfg.ayuda} style={{ fontSize: '11px', fontWeight: 700, padding: '3px 9px', borderRadius: 'var(--radius-full)', background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap' }}>
                        {f.donde === 'funcion' ? (f.estado === 'desactivado' ? 'Desactivada' : 'Activa') : cfg.label}
                      </span>
                    </td>
                    <td style={{ ...td, textAlign: 'center' }}>
                      {f.funcion ? (
                        <button
                          onClick={() => cambiarFuncion(f.funcion!)}
                          disabled={cambiando === f.funcion.id}
                          title={f.funcion.is_active ? 'Desactivar esta función (la web deja de usarla)' : 'Activar esta función'}
                          aria-label={f.funcion.is_active ? 'Desactivar función' : 'Activar función'}
                          style={{ padding: '5px', background: 'transparent', border: '1px solid var(--border-primary)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: f.funcion.is_active ? 'var(--text-secondary)' : 'var(--color-success)' }}
                        >
                          <Power size={14} />
                        </button>
                      ) : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ padding: '10px 20px', fontSize: '11px', color: 'var(--text-tertiary)' }}>
        Los horarios están en hora Argentina. Para prender o apagar un script del servidor hay que cambiar el crontab; esta lista lo refleja sola.
      </div>
    </div>
  );
}

// =============================================
// Tab types & config
// =============================================

type TabId = 'integraciones' | 'credenciales' | 'mcp';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'integraciones', label: 'Integraciones y procesos', icon: Globe },
  { id: 'credenciales', label: 'Credenciales', icon: Eye },
  { id: 'mcp', label: 'MCP', icon: Bot },
];

// =============================================
// Componente Principal
// =============================================

export function IntegracionesTokensModule() {
  const [activeTab, setActiveTab] = useState<TabId>('integraciones');
  const [serverTokens, setServerTokens] = useState<Record<string, Record<string, string | null>> | null>(null);
  const [tokensLoading, setTokensLoading] = useState(false);
  const [tokensError, setTokensError] = useState<string | null>(null);
  const [tokensLoaded, setTokensLoaded] = useState(false);

  const [jobsServidor, setJobsServidor] = useState<CronJobRecord[]>([]);
  const [cargandoJobs, setCargandoJobs] = useState(true);
  const [cuentasCabify, setCuentasCabify] = useState<CuentaCabifyInfo[]>([]);

  // Scripts del servidor y cuentas de Cabify para la pestaña Integraciones (estado real)
  useEffect(() => {
    if (activeTab !== 'integraciones') return;
    let cancelado = false;
    (async () => {
      await supabase.rpc('refrescar_cron_jobs' as any);
      const [{ data: jobs }, { data: cuentas }, { data: grupos }, { data: sedes }] = await Promise.all([
        supabase.from('cron_jobs').select('*').order('nombre'),
        (supabase.from('cabify_cuentas' as any) as any).select('codigo, nombre, activa, tabla_destino, grupo_flota_id, sede_id'),
        (supabase.from('grupos_flota') as any).select('id, razon_social'),
        (supabase.from('sedes') as any).select('id, nombre'),
      ]);
      const filas = (cuentas || []) as { codigo: string; nombre: string; activa: boolean; tabla_destino: string; grupo_flota_id: string | null; sede_id: string }[];
      const conUltimo = await Promise.all(filas.map(async (c) => {
        const { data: ult } = await (supabase.from(c.tabla_destino as any) as any)
          .select('last_updated_at').eq('cuenta_cabify', c.codigo)
          .order('last_updated_at', { ascending: false, nullsFirst: false }).limit(1);
        return {
          codigo: c.codigo,
          nombre: c.nombre,
          activa: c.activa,
          tabla_destino: c.tabla_destino,
          grupo: (grupos || []).find((g: { id: string }) => g.id === c.grupo_flota_id)?.razon_social ?? null,
          sede: (sedes || []).find((s: { id: string }) => s.id === c.sede_id)?.nombre ?? null,
          ultimoDato: ult?.[0]?.last_updated_at ?? null,
        } as CuentaCabifyInfo;
      }));
      if (cancelado) return;
      setJobsServidor((jobs || []) as CronJobRecord[]);
      setCargandoJobs(false);
      setCuentasCabify(conUltimo);
    })();
    return () => { cancelado = true; };
  }, [activeTab]);

  const fetchTokens = useCallback(async () => {
    if (tokensLoaded) return;
    setTokensLoading(true);
    setTokensError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setTokensError('Sin sesion activa');
        return;
      }

      const res = await fetch('/api/admin/tokens', {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'No responde el servidor de la API. En local, reiniciá npm run dev' }));
        setTokensError(err.error || `Error ${res.status}`);
        return;
      }

      const data: TokensResponse = await res.json();
      if (data.success) {
        setServerTokens(data.tokens);
        setTokensLoaded(true);
      }
    } catch {
      setTokensError('Error de conexion al servidor');
    } finally {
      setTokensLoading(false);
    }
  }, [tokensLoaded]);

  // Lazy load tokens only when credenciales tab is selected
  useEffect(() => {
    if (activeTab === 'credenciales' && !tokensLoaded) {
      fetchTokens();
    }
  }, [activeTab, tokensLoaded, fetchTokens]);

  const activeCount = INTEGRATIONS.filter(s => s.status === 'active').length;
  const procesosActivos = jobsServidor.filter(j => estadoJob(j) !== 'desactivado').length;
  const procesosConProblema = jobsServidor.filter(j => ['error', 'atrasado'].includes(estadoJob(j))).length;

  return (
    <div className="module-container">

      {/* Stats */}
      <div className="bitacora-stats" style={{ marginBottom: '16px' }}>
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          <div className="stat-card">
            <div className="stat-icon"><Globe size={18} /></div>
            <div className="stat-content">
              <span className="stat-value">{INTEGRATIONS.length}</span>
              <span className="stat-label">Integraciones</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--color-success)' }}><Shield size={18} /></div>
            <div className="stat-content">
              <span className="stat-value">{activeCount}</span>
              <span className="stat-label">Activas</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: 'var(--color-warning)' }}><Clock size={18} /></div>
            <div className="stat-content">
              <span className="stat-value">{procesosActivos}</span>
              <span className="stat-label">Procesos programados</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon" style={{ color: procesosConProblema ? 'var(--color-danger)' : 'var(--color-success)' }}><AlertCircle size={18} /></div>
            <div className="stat-content">
              <span className="stat-value">{procesosConProblema}</span>
              <span className="stat-label">Con problema</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <TabsBar tabs={TABS} active={activeTab} onChange={setActiveTab} ariaLabel="Secciones de integraciones" />

      {/* Tab content */}
      {activeTab === 'integraciones' && (
        <>
          <ProcesosAutomaticos jobs={jobsServidor} cargando={cargandoJobs} />
          {INTEGRATIONS.map(system => (
            <IntegrationCard
              key={system.id}
              system={system}
              serverTokens={serverTokens}
              tokensLoading={tokensLoading}
              tokensError={tokensError}
              jobs={jobsServidor.filter(j => j.tipo !== 'pg_cron' && j.integracion && system.jobIntegraciones?.includes(j.integracion))}
              cuenta={cuentasCabify.find(c => c.codigo === system.cuentaCabify)}
            />
          ))}
        </>
      )}

      {activeTab === 'credenciales' && (
        <CredencialesTab
          serverTokens={serverTokens}
          tokensLoading={tokensLoading}
          tokensError={tokensError}
        />
      )}

      {activeTab === 'mcp' && (
        <McpTab />
      )}

    </div>
  );
}
