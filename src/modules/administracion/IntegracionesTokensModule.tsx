import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import {
  ChevronDown, ChevronRight, Clock, Shield, Globe,
  Radio, MapPin, Car, HardDrive, Mail, Eye, EyeOff, Receipt, Landmark, Phone,
  AlertCircle, RefreshCw, Zap, ZapOff, Activity,
  Bot, Key, Plus, Trash2, Copy, Check, Power,
  Edit2, CalendarClock, Loader2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { Spinner } from '../../components/ui/LoadingOverlay'
import { EmptyState } from '../../components/ui/EstadosVista'

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
    authDescription: 'El script del servidor inicia sesión con el usuario de la cuenta en cada corrida y obtiene un token temporal. La web pide su token a /api/cabify/token (las claves nunca llegan al navegador).',
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
      'Las edge functions viejas de Cabify (pestaña Monitor) están desactivadas: ya no se usan',
    ],
    tokenInfo: {
      type: 'OAuth2 Access Token (temporal)',
      location: '.env (web) + env.sh (scripts del servidor)',
      rotation: 'Automática — se pide uno nuevo en cada corrida',
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
      rotation: 'Automática — se pide uno nuevo en cada corrida',
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
      borderRadius: '4px',
      fontSize: '11px',
      fontWeight: 700,
      fontFamily: 'monospace',
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
      borderRadius: '20px',
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
          fontFamily: 'monospace',
          background: 'var(--bg-tertiary)',
          padding: '4px 8px',
          borderRadius: '4px',
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
            borderRadius: '4px',
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

/** Minutos entre corridas segun el cron (aprox.): sirve para saber si un job esta al dia. */
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
  if (job.schedule === 'manual') return 'manual';
  if (job.ultimo_estado === 'error') return 'error';
  if (!job.ultima_ejecucion) return 'sin_registro';
  const iv = intervaloMinutos(job.schedule);
  const minutos = (Date.now() - new Date(job.ultima_ejecucion).getTime()) / 60000;
  if (iv && minutos > iv * 3 + 20) return 'atrasado';
  return 'funcionando';
}

const ESTADO_JOB: Record<EstadoJob, { label: string; color: string; bg: string; ayuda: string }> = {
  funcionando: { label: 'Funcionando', color: '#047857', bg: 'rgba(16,185,129,0.12)', ayuda: 'La última corrida terminó bien y está al día' },
  atrasado: { label: 'Atrasado', color: '#b45309', bg: 'rgba(245,158,11,0.14)', ayuda: 'Hace más de lo esperado que no termina una corrida' },
  error: { label: 'Con error', color: '#dc2626', bg: 'rgba(239,68,68,0.12)', ayuda: 'La última corrida falló' },
  desactivado: { label: 'Desactivado', color: '#6b7280', bg: 'var(--bg-tertiary)', ayuda: 'Apagado a propósito: no corre en el servidor' },
  manual: { label: 'Manual', color: '#6b7280', bg: 'var(--bg-tertiary)', ayuda: 'No tiene horario: se corre a mano cuando hace falta' },
  sin_registro: { label: 'Sin registro aún', color: '#6b7280', bg: 'var(--bg-tertiary)', ayuda: 'Todavía no terminó ninguna corrida registrada' },
};

function haceCuanto(fecha: string | null): string {
  if (!fecha) return 'nunca';
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `hace ${h} h`;
  return new Date(fecha).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
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
        <div style={{ fontSize: '13px', color: 'var(--text-tertiary)', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '10px 14px' }}>
          No tiene scripts programados en el servidor.
        </div>
      ) : (
        <div style={{ background: 'var(--bg-secondary)', borderRadius: '8px', overflow: 'hidden' }}>
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
                      <span title={cfg.ayuda} style={{ fontSize: '10px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
                    </div>
                    {job.descripcion && (
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '3px', lineHeight: 1.45 }}>{job.descripcion}</div>
                    )}
                    {job.comando && (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace', marginTop: '3px', wordBreak: 'break-all' }}>
                        {job.tipo === 'script' ? `/opt/toshify-sync/${job.comando}` : job.comando.slice(0, 90)}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '18px', flexShrink: 0 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Frecuencia</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{job.schedule === 'manual' ? 'A mano' : describeCron(job.schedule)}</div>
                    </div>
                    <div style={{ textAlign: 'right', minWidth: '92px' }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>Última corrida</div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: job.ultimo_estado === 'error' ? '#dc2626' : 'var(--text-primary)' }}>{haceCuanto(job.ultima_ejecucion)}</div>
                    </div>
                  </div>
                </div>
                {job.ultimo_estado === 'error' && job.ultimo_error && (
                  <div style={{ marginTop: '8px', padding: '6px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.06)', fontSize: '11px', color: '#dc2626' }}>{job.ultimo_error}</div>
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
    <div style={{ marginTop: '16px', background: 'var(--bg-secondary)', borderRadius: '8px', padding: '12px 14px' }}>
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
      borderRadius: '10px',
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
          borderRadius: '10px',
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
              borderRadius: '8px',
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
                borderRadius: '6px',
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
              borderRadius: '8px',
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
              borderRadius: '8px',
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
                  borderRadius: '6px',
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
                  borderRadius: '4px',
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
                borderRadius: '8px',
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
                borderRadius: '8px',
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
                      borderRadius: '4px',
                      minWidth: '120px',
                      textAlign: 'center',
                    }}>
                      {cron.schedule}
                    </code>
                    <div>
                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 500 }}>
                        {cron.description}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>
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
// Edge Functions Monitor
// =============================================

interface EdgeFunction {
  id: string;
  function_name: string;
  label: string;
  description: string;
  category: string;
  is_active: boolean;
  health_status: string;
  response_time_ms: number | null;
  health_error: string | null;
  checked_at: string;
  last_health_check: string | null;
  last_health_status: string | null;
}

const CATEGORY_LABELS: Record<string, { label: string; color: string }> = {
  sistema: { label: 'Sistema', color: 'blue' },
  cabify: { label: 'Cabify', color: 'purple' },
  wialon: { label: 'Wialon', color: 'yellow' },
  google: { label: 'Google', color: 'green' },
};

function HealthBadge({ status, responseTime }: { status: string; responseTime: number | null }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    online: { bg: 'var(--badge-green-bg)', text: 'var(--badge-green-text)', label: 'Online' },
    error: { bg: 'var(--badge-red-bg)', text: 'var(--badge-red-text)', label: 'Error' },
    timeout: { bg: 'var(--badge-yellow-bg)', text: 'var(--badge-yellow-text)', label: 'Timeout' },
    offline: { bg: 'var(--badge-red-bg)', text: 'var(--badge-red-text)', label: 'Offline' },
    unknown: { bg: 'var(--badge-gray-bg)', text: 'var(--badge-gray-text)', label: 'Sin datos' },
    checking: { bg: 'var(--badge-blue-bg)', text: 'var(--badge-blue-text)', label: 'Verificando...' },
  };
  const c = config[status] || config.unknown;
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      padding: '3px 10px',
      borderRadius: '12px',
      fontSize: '11px',
      fontWeight: 600,
      background: c.bg,
      color: c.text,
    }}>
      <span style={{
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: status === 'online' ? 'var(--color-success)' : status === 'checking' ? 'var(--color-info)' : status === 'timeout' ? 'var(--color-warning)' : status === 'error' || status === 'offline' ? 'var(--color-danger)' : 'var(--text-tertiary)',
      }} />
      {c.label}
      {responseTime !== null && status !== 'checking' && (
        <span style={{ fontWeight: 400, opacity: 0.8 }}>({responseTime}ms)</span>
      )}
    </span>
  );
}

function EdgeFunctionsMonitor() {
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Primero la lista con el último estado guardado (inmediato) y después el chequeo
  // real en segundo plano: así la pestaña no queda en "Cargando..." hasta que
  // responde la función más lenta.
  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Sin sesion activa');
        return;
      }
      const headers = { 'Authorization': `Bearer ${session.access_token}` };

      const lista = await fetch('/api/admin/function-health?ping=0', { headers });
      if (!lista.ok) {
        const err = await lista.json().catch(() => ({ error: 'No responde el servidor de la API. En local, reiniciá npm run dev' }));
        setError(err.error || `Error ${lista.status}`);
        return;
      }
      const dataLista = await lista.json();
      if (dataLista.success) setFunctions(dataLista.functions);

      const res = await fetch('/api/admin/function-health', { headers });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Error ${res.status}` }));
        setError(err.error || `Error ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setFunctions(data.functions);
      }
    } catch {
      setError('Error de conexion');
    } finally {
      setLoading(false);
    }
  }, []);

  const toggleFunction = async (fn: EdgeFunction) => {
    setTogglingId(fn.id);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch('/api/admin/toggle-function', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ functionId: fn.id, isActive: !fn.is_active }),
      });

      if (res.ok) {
        setFunctions(prev => prev.map(f =>
          f.id === fn.id ? { ...f, is_active: !f.is_active } : f
        ));
      }
    } catch {
      // silently fail
    } finally {
      setTogglingId(null);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  // Group by category
  const grouped = functions.reduce<Record<string, EdgeFunction[]>>((acc, fn) => {
    if (!acc[fn.category]) acc[fn.category] = [];
    acc[fn.category].push(fn);
    return acc;
  }, {});

  const onlineCount = functions.filter(f => f.health_status === 'online').length;
  const totalCount = functions.length;

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--border-primary)',
      borderRadius: '10px',
      marginBottom: '20px',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Activity size={20} style={{ color: 'var(--color-primary)' }} />
          <div>
            <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Edge Functions Monitor
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
              {totalCount > 0 ? `${onlineCount}/${totalCount} online` : 'Cargando...'}
            </div>
          </div>
        </div>
        <button
          onClick={fetchHealth}
          disabled={loading}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 14px',
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border-primary)',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--text-secondary)',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
          {loading ? 'Verificando...' : 'Verificar'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '12px 20px',
          fontSize: '13px',
          color: 'var(--color-danger)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <AlertCircle size={14} />
          {error}
        </div>
      )}

      {/* Function list grouped by category */}
      <div style={{ padding: '0' }}>
        {Object.entries(grouped).map(([category, fns]) => {
          const catInfo = CATEGORY_LABELS[category] || { label: category, color: 'gray' };
          return (
            <div key={category}>
              {/* Category header */}
              <div style={{
                padding: '10px 20px',
                background: 'var(--bg-secondary)',
                borderBottom: '1px solid var(--border-primary)',
                borderTop: '1px solid var(--border-primary)',
              }}>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                  color: `var(--badge-${catInfo.color}-text)`,
                }}>
                  {catInfo.label}
                </span>
                {category === 'cabify' && (
                  <span style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginLeft: '10px' }}>
                    Funciones viejas, apagadas. Cabify ahora se sincroniza con los scripts del servidor: ver pestaña Integraciones › Cabify.
                  </span>
                )}
              </div>

              {/* Functions in category */}
              {fns.map((fn, i) => (
                <div key={fn.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px 20px',
                  borderBottom: i < fns.length - 1 ? '1px solid var(--border-secondary)' : 'none',
                }}>
                  {/* Toggle */}
                  <button
                    onClick={() => toggleFunction(fn)}
                    disabled={togglingId === fn.id}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: togglingId === fn.id ? 'wait' : 'pointer',
                      padding: '4px',
                      flexShrink: 0,
                      color: fn.is_active ? 'var(--color-success)' : 'var(--text-tertiary)',
                      opacity: togglingId === fn.id ? 0.5 : 1,
                    }}
                    title={fn.is_active ? 'Desactivar' : 'Activar'}
                  >
                    {fn.is_active ? <Zap size={16} /> : <ZapOff size={16} />}
                  </button>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <code style={{
                        fontSize: '13px',
                        fontWeight: 600,
                        color: fn.is_active ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      }}>
                        {fn.function_name}
                      </code>
                      {!fn.is_active && (
                        <span style={{
                          fontSize: '10px',
                          fontWeight: 600,
                          padding: '1px 6px',
                          borderRadius: '4px',
                          background: 'var(--badge-gray-bg)',
                          color: 'var(--badge-gray-text)',
                          textTransform: 'uppercase',
                        }}>
                          Desactivado
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '1px' }}>
                      {fn.description}
                    </div>
                  </div>

                  {/* Health status */}
                  <div style={{ flexShrink: 0 }}>
                    {fn.is_active ? (
                      <HealthBadge
                        status={loading ? 'checking' : (fn.health_status || 'unknown')}
                        responseTime={fn.response_time_ms}
                      />
                    ) : (
                      <span title="Está publicada pero apagada: nada la ejecuta" style={{ display: 'inline-flex', padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 600, background: 'var(--badge-gray-bg)', color: 'var(--badge-gray-text)' }}>
                        No se usa
                      </span>
                    )}
                  </div>

                  {/* Error tooltip */}
                  {fn.is_active && fn.health_error && (
                    <div style={{
                      flexShrink: 0,
                      color: 'var(--color-danger)',
                    }} title={fn.health_error}>
                      <AlertCircle size={14} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}

        {/* Empty state */}
        {functions.length === 0 && !loading && !error && (
          <EmptyState size="sm" title="No se encontraron Edge Functions configuradas" />
        )}
      </div>

      {/* Spin keyframe for RefreshCw */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
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
        borderRadius: '8px',
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
          borderRadius: '8px',
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
            borderRadius: '10px',
            marginBottom: '12px',
            padding: '16px 20px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
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
    return new Date(date).toLocaleString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  return (
    <div>
      {/* MCP Info header */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border-primary)',
        borderRadius: '8px',
        padding: '16px 20px',
        marginBottom: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
          <Bot size={20} style={{ color: 'var(--color-primary)' }} />
          <span style={{ fontWeight: 700, fontSize: '15px' }}>MCP Server - Model Context Protocol</span>
        </div>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, lineHeight: '1.5' }}>
          Servidor MCP para que chatbots accedan a datos de leads y hireflix_historico.
          Solo tiene acceso a estas dos tablas. Cada API key tiene permisos granulares.
        </p>
        <div style={{
          display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap',
        }}>
          <div style={{
            background: 'var(--bg-secondary)',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
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
            borderRadius: '6px',
            fontSize: '12px',
            fontFamily: 'monospace',
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
            borderRadius: '6px',
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
          borderRadius: '8px',
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
                borderRadius: '6px',
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
                    borderRadius: '6px',
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
                borderRadius: '6px',
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
                borderRadius: '6px',
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
          borderRadius: '8px',
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
                borderRadius: '8px',
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
                    borderRadius: '4px',
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
                      borderRadius: '4px', cursor: 'pointer', color: 'var(--text-secondary)',
                    }}
                  >
                    <Power size={14} />
                  </button>
                  <button
                    onClick={() => deleteKey(key)}
                    title="Eliminar"
                    style={{
                      padding: '6px', background: 'transparent', border: '1px solid var(--border-primary)',
                      borderRadius: '4px', cursor: 'pointer', color: '#f85149',
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
                borderRadius: '6px',
                marginBottom: '8px',
                fontFamily: 'monospace',
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
                        borderRadius: '4px',
                        background: perm.includes('update') ? 'rgba(210, 153, 34, 0.15)' : 'rgba(59, 185, 80, 0.15)',
                        color: perm.includes('update') ? '#d29922' : '#3fb950',
                        fontFamily: 'monospace',
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
// Cron Jobs Tab
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
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [min, hour, , , dow] = parts;
  const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  // "*/10" o "5-59/10" (cada N minutos con desfase)
  const cadaN = min.match(/^(?:\*|\d+-\d+)\/(\d+)$/);
  if (cadaN && hour === '*') return `Cada ${cadaN[1]} min`;
  if (hour === '*' && /^\d+$/.test(min)) return min === '0' ? 'Cada hora' : `Cada hora (min ${min})`;
  if (dow !== '*') {
    const dayName = days[parseInt(dow)] || dow;
    return `${dayName} ${hour}:${min.padStart(2, '0')} hs`;
  }
  return `Diario ${hour}:${min.padStart(2, '0')} hs`;
}

const TIPO_LABELS: Record<string, { label: string; color: string }> = {
  script: { label: 'Script', color: '#3b82f6' },
  edge_function: { label: 'Edge Fn', color: '#8b5cf6' },
  email: { label: 'Email', color: '#10b981' },
  pg_cron: { label: 'Base de datos', color: '#f59e0b' },
};

const INTEG_LABELS: Record<string, string> = {
  geotab: 'Geotab', wialon: 'Wialon', uss: 'USS', cabify_ba: 'Cabify BA', cabify_bari: 'Cabify Bari', sistema: 'Sistema',
};

function CronJobsTab() {
  const [jobs, setJobs] = useState<CronJobRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [sinRefresco, setSinRefresco] = useState(false);

  const cargarJobs = useCallback(async () => {
    setLoading(true);
    try {
      // Pone la tabla al día con lo que realmente corrió (logs de sync + pg_cron)
      const { error: errRef } = await supabase.rpc('refrescar_cron_jobs' as any);
      setSinRefresco(!!errRef);
      const { data, error } = await supabase.from('cron_jobs').select('*').order('integracion').order('nombre');
      if (error) throw error;
      setJobs((data || []) as CronJobRecord[]);
    } catch { setJobs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { cargarJobs(); }, [cargarJobs]);

  const editarJob = async (job: Partial<CronJobRecord> & { id: string }) => {
    const { default: Swal } = await import('sweetalert2');
    const isNew = !job.id;
    const { value } = await Swal.fire({
      title: isNew ? 'Nuevo Cron Job' : 'Editar Cron Job',
      html: `
        <div style="text-align:left;display:flex;flex-direction:column;gap:10px;">
          <div><label style="font-size:12px;font-weight:600;color:#666;">Nombre</label>
          <input id="swal-nombre" class="swal2-input" style="margin:4px 0;font-size:13px;" value="${job.nombre || ''}" placeholder="Nombre del job"></div>
          <div><label style="font-size:12px;font-weight:600;color:#666;">Descripción</label>
          <input id="swal-desc" class="swal2-input" style="margin:4px 0;font-size:13px;" value="${job.descripcion || ''}" placeholder="Descripción"></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div><label style="font-size:12px;font-weight:600;color:#666;">Schedule (cron)</label>
            <input id="swal-schedule" class="swal2-input" style="margin:4px 0;font-size:13px;" value="${job.schedule || ''}" placeholder="*/5 * * * *"></div>
            <div><label style="font-size:12px;font-weight:600;color:#666;">Tipo</label>
            <select id="swal-tipo" class="swal2-select" style="margin:4px 0;font-size:13px;padding:8px;">
              <option value="script" ${job.tipo === 'script' ? 'selected' : ''}>Script</option>
              <option value="edge_function" ${job.tipo === 'edge_function' ? 'selected' : ''}>Edge Function</option>
              <option value="email" ${job.tipo === 'email' ? 'selected' : ''}>Email</option>
            </select></div>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">
            <div><label style="font-size:12px;font-weight:600;color:#666;">Comando/Script</label>
            <input id="swal-comando" class="swal2-input" style="margin:4px 0;font-size:13px;" value="${job.comando || ''}" placeholder="run-script.sh"></div>
            <div><label style="font-size:12px;font-weight:600;color:#666;">Integración</label>
            <select id="swal-integ" class="swal2-select" style="margin:4px 0;font-size:13px;padding:8px;">
              <option value="">Sin integración</option>
              <option value="wialon" ${job.integracion === 'wialon' ? 'selected' : ''}>Wialon</option>
              <option value="uss" ${job.integracion === 'uss' ? 'selected' : ''}>USS</option>
              <option value="cabify_ba" ${job.integracion === 'cabify_ba' ? 'selected' : ''}>Cabify BA</option>
              <option value="cabify_bari" ${job.integracion === 'cabify_bari' ? 'selected' : ''}>Cabify Bariloche</option>
              <option value="sistema" ${job.integracion === 'sistema' ? 'selected' : ''}>Sistema</option>
            </select></div>
          </div>
        </div>
      `,
      showCancelButton: true, confirmButtonText: 'Guardar', cancelButtonText: 'Cancelar', confirmButtonColor: '#ef4444',
      preConfirm: () => ({
        nombre: (document.getElementById('swal-nombre') as HTMLInputElement).value,
        descripcion: (document.getElementById('swal-desc') as HTMLInputElement).value || null,
        schedule: (document.getElementById('swal-schedule') as HTMLInputElement).value,
        tipo: (document.getElementById('swal-tipo') as HTMLSelectElement).value,
        comando: (document.getElementById('swal-comando') as HTMLInputElement).value || null,
        integracion: (document.getElementById('swal-integ') as HTMLSelectElement).value || null,
      }),
    });
    if (!value || !value.nombre || !value.schedule) return;
    try {
      if (job.id) {
        const { error } = await supabase.from('cron_jobs').update({ ...value, updated_at: new Date().toISOString() }).eq('id', job.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('cron_jobs').insert({ ...value, activo: true });
        if (error) throw error;
      }
      cargarJobs();
    } catch {
      const { default: S } = await import('sweetalert2');
      S.fire('Error', 'No se pudo guardar', 'error');
    }
  };

  const eliminarJob = async (job: CronJobRecord) => {
    const { default: Swal } = await import('sweetalert2');
    const r = await Swal.fire({ title: '¿Eliminar cron job?', text: job.nombre, icon: 'warning', showCancelButton: true, confirmButtonText: 'Eliminar', cancelButtonText: 'Cancelar', confirmButtonColor: '#ef4444' });
    if (!r.isConfirmed) return;
    await supabase.from('cron_jobs').delete().eq('id', job.id);
    cargarJobs();
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px', gap: '8px', color: 'var(--text-secondary)' }}><Loader2 size={20} className="spinning" /> Cargando...</div>;
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {jobs.length} jobs · {jobs.filter(j => j.activo && (j.tipo === 'script' || j.tipo === 'pg_cron')).length} corriendo
          <span style={{ color: 'var(--text-tertiary)', fontSize: '11px' }}> · estado real según la última corrida registrada</span>
          {sinRefresco ? <div style={{ fontSize: '11px', color: '#b45309', marginTop: '2px' }}>Falta ejecutar sql/cron_jobs_reales.sql en Supabase: hasta entonces esto es el registro manual.</div> : null}
        </div>
        <button onClick={() => editarJob({ id: '', nombre: '', schedule: '', tipo: 'script' })} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 14px', background: 'var(--color-primary)', color: 'white', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          <Plus size={14} /> Nuevo Job
        </button>
      </div>
      <div style={{ background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', borderRadius: '8px', overflow: 'hidden' }}>
        {jobs.map((job, idx) => {
          const ti = TIPO_LABELS[job.tipo] || { label: job.tipo, color: '#666' };
          return (
            <div key={job.id} style={{ borderTop: idx === 0 ? 'none' : '1px solid var(--border-primary)', padding: '8px 14px', opacity: job.activo || !(job.tipo === 'script' || job.tipo === 'pg_cron') ? 1 : 0.6, transition: 'opacity 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: (job.tipo === 'script' || job.tipo === 'pg_cron') ? (job.activo ? '#10b981' : '#9ca3af') : '#d1d5db' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>{job.nombre}</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: `${ti.color}15`, color: ti.color }}>{ti.label}</span>
                    {job.integracion && <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '4px', background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>{INTEG_LABELS[job.integracion] || job.integracion}</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{job.descripcion || job.comando || '-'}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, width: '140px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600 }}>{describeCron(job.schedule)}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{job.schedule}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, width: '100px' }}>
                  {job.ultima_ejecucion ? (
                    <>
                      <div style={{ fontSize: '10px', color: job.ultimo_estado === 'error' ? '#ef4444' : '#10b981', fontWeight: 600 }}>{job.ultimo_estado === 'error' ? 'Error' : 'OK'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{new Date(job.ultima_ejecucion).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
                    </>
                  ) : <div style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>Sin ejecución</div>}
                </div>
                <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
                  {(() => {
                    const medible = job.tipo === 'script' || job.tipo === 'pg_cron';
                    const txt = !medible ? 'Sin registro' : job.activo ? 'Corriendo' : 'Detenido';
                    const color = !medible ? 'var(--text-tertiary)' : job.activo ? '#047857' : '#6b7280';
                    const bg = !medible ? 'var(--bg-secondary)' : job.activo ? 'rgba(16,185,129,0.12)' : 'var(--bg-secondary)';
                    return <span title={medible ? 'Según la última corrida registrada' : 'Este job no deja registro de sus corridas'} style={{ fontSize: '10px', fontWeight: 600, padding: '3px 8px', borderRadius: '999px', background: bg, color, alignSelf: 'center', minWidth: '62px', textAlign: 'center' }}>{txt}</span>;
                  })()}
                  {job.tipo !== 'pg_cron' && (<>
                  <button onClick={() => editarJob(job)} title="Editar" style={{ padding: '4px', background: 'transparent', border: '1px solid var(--border-primary)', borderRadius: '6px', cursor: 'pointer', color: 'var(--text-secondary)' }}><Edit2 size={14} /></button>
                  <button onClick={() => eliminarJob(job)} title="Eliminar" style={{ padding: '4px', background: 'transparent', border: '1px solid var(--border-primary)', borderRadius: '6px', cursor: 'pointer', color: '#ef4444' }}><Trash2 size={14} /></button>
                  </>)}
                </div>
              </div>
              {job.ultimo_estado === 'error' && job.ultimo_error && (
                <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '6px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', fontSize: '11px', color: '#dc2626' }}>{job.ultimo_error}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =============================================
// Tab types & config
// =============================================

type TabId = 'integraciones' | 'monitor' | 'credenciales' | 'mcp' | 'cronjobs';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'integraciones', label: 'Integraciones', icon: Globe },
  { id: 'monitor', label: 'Monitor', icon: Activity },
  { id: 'credenciales', label: 'Credenciales', icon: Eye },
  { id: 'mcp', label: 'MCP', icon: Bot },
  { id: 'cronjobs', label: 'Cron Jobs', icon: CalendarClock },
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
  const [cronJobCount, setCronJobCount] = useState<number | null>(null);

  const [jobsServidor, setJobsServidor] = useState<CronJobRecord[]>([]);
  const [cuentasCabify, setCuentasCabify] = useState<CuentaCabifyInfo[]>([]);

  // Load cron job count from DB
  useEffect(() => {
    supabase.from('cron_jobs').select('id', { count: 'exact', head: true })
      .then(({ count }) => { if (count !== null) setCronJobCount(count); });
  }, []);

  // Scripts del servidor y cuentas de Cabify para la pestaña Integraciones (estado real)
  useEffect(() => {
    if (activeTab !== 'integraciones') return;
    let cancelado = false;
    (async () => {
      await supabase.rpc('refrescar_cron_jobs' as any);
      const [{ data: jobs }, { data: cuentas }, { data: grupos }, { data: sedes }] = await Promise.all([
        supabase.from('cron_jobs').select('*').neq('tipo', 'pg_cron').order('nombre'),
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
  const cronCount = cronJobCount ?? INTEGRATIONS.reduce((acc, s) => acc + s.cronJobs.length, 0);

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
              <span className="stat-value">{cronCount}</span>
              <span className="stat-label">Cron Jobs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" style={{
        display: 'flex',
        gap: '0',
        borderBottom: '2px solid var(--border-primary)',
        marginBottom: '20px',
        // En celular las pestañas no entran: se desplazan de costado en vez de cortarse
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: '1 0 auto',
                whiteSpace: 'nowrap',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                padding: '10px 12px',
                background: 'transparent',
                border: 'none',
                borderBottom: isActive ? '2px solid var(--color-primary)' : '2px solid transparent',
                marginBottom: '-2px',
                fontSize: '13px',
                fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--color-primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <TabIcon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === 'integraciones' && (
        <>
          {INTEGRATIONS.map(system => (
            <IntegrationCard
              key={system.id}
              system={system}
              serverTokens={serverTokens}
              tokensLoading={tokensLoading}
              tokensError={tokensError}
              jobs={jobsServidor.filter(j => j.integracion && system.jobIntegraciones?.includes(j.integracion))}
              cuenta={cuentasCabify.find(c => c.codigo === system.cuentaCabify)}
            />
          ))}
        </>
      )}

      {activeTab === 'monitor' && (
        <EdgeFunctionsMonitor />
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

      {activeTab === 'cronjobs' && (
        <CronJobsTab />
      )}
    </div>
  );
}
