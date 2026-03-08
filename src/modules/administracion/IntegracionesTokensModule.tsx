import { useState, useEffect, useCallback } from 'react';
import {
  ChevronDown, ChevronRight, Clock, Shield, Globe,
  Server, Radio, MapPin, Car, HardDrive, Mail, Eye, EyeOff,
  AlertCircle, RefreshCw, Zap, ZapOff, Activity,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';

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
    id: 'wialon',
    name: 'Wialon (GPS Tracking)',
    description: 'Plataforma de rastreo GPS vehicular. Provee datos de bitacora, posicion y kilometraje de la flota.',
    icon: Radio,
    color: 'var(--color-info)',
    badgeColor: 'blue',
    authType: 'API Token + Session',
    authDescription: 'Token estatico de larga duracion generado manualmente desde el panel de Wialon. Cada ejecucion del script obtiene un Session ID (sid) temporal via token/login, lo usa para consultas, y cierra sesion con core/logout.',
    baseUrl: 'https://hst-api.wialon.us/wialon/ajax.html',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'POST', path: 'token/login', description: 'Obtener Session ID con el token' },
      { method: 'POST', path: 'report/exec_report', description: 'Ejecutar reporte de bitacora' },
      { method: 'POST', path: 'report/select_result_rows', description: 'Leer filas del reporte' },
      { method: 'POST', path: 'report/cleanup_result', description: 'Limpiar reporte previo' },
      { method: 'POST', path: 'core/logout', description: 'Cerrar sesion (liberar sid)' },
    ],
    cronJobs: [
      { schedule: '*/5 * * * *', description: 'Sync bitacora en tiempo real', script: 'run-wialon-bitacora.sh' },
    ],
    notes: [
      'El token NO expira automaticamente — solo si se revoca desde el panel de Wialon',
      'El Session ID (sid) es efimero y se crea/destruye en cada ejecucion',
      'Los datos se guardan en la tabla wialon_bitacora de Supabase',
      'El frontend NUNCA llama a la API de Wialon directamente',
    ],
    tokenInfo: {
      type: 'API Token (long-lived)',
      location: 'env.sh en servidor (/opt/toshify-sync/)',
      rotation: 'Manual — solo si se revoca desde panel Wialon',
    },
    credentialKeys: {
      systemKey: 'wialon',
      fields: [
        { key: 'token', label: 'WIALON_TOKEN' },
      ],
    },
  },
  {
    id: 'uss',
    name: 'USS (Excesos de Velocidad)',
    description: 'Sistema de monitoreo de excesos de velocidad. Usa la infraestructura de Wialon para obtener datos de velocidad.',
    icon: Server,
    color: 'var(--color-warning)',
    badgeColor: 'yellow',
    authType: 'Wialon Token (compartido)',
    authDescription: 'Reutiliza el mismo token de Wialon. La Edge Function de Supabase procesa los datos de uss_historico y genera registros en uss_excesos_velocidad.',
    baseUrl: 'Supabase Edge Function',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'POST', path: 'sync-wialon-bitacora (Edge Function)', description: 'Agrega viajes de uss_historico a wialon_bitacora' },
    ],
    cronJobs: [
      { schedule: '0 * * * *', description: 'Sync excesos de velocidad (cada hora)', script: 'run-uss.sh' },
    ],
    notes: [
      'No tiene credenciales propias — depende de Wialon',
      'Los parametros de velocidad se configuran en Administracion > Parametros USS',
      'Datos en tablas: uss_excesos_velocidad, uss_historico',
    ],
    tokenInfo: {
      type: 'Compartido con Wialon',
      location: 'Misma variable WIALON_TOKEN',
      rotation: 'N/A — depende de Wialon',
    },
    credentialKeys: {
      systemKey: 'wialon',
      fields: [
        { key: 'token', label: 'WIALON_TOKEN (compartido)' },
      ],
    },
  },
  {
    id: 'cabify-ba',
    name: 'Cabify (Buenos Aires)',
    description: 'Integracion con Cabify para obtener viajes, facturacion y peajes de conductores en Buenos Aires.',
    icon: Car,
    color: 'var(--color-purple)',
    badgeColor: 'purple',
    authType: 'OAuth2 (Resource Owner Password)',
    authDescription: 'Autenticacion con username/password + client_id/client_secret. El access_token se obtiene en cada ejecucion del script — no se almacena permanentemente. El proxy en server.js cachea el token en memoria.',
    baseUrl: 'https://partners.cabify.com/api/graphql',
    environment: 'both',
    status: 'active',
    endpoints: [
      { method: 'POST', path: '/auth/api/authorization', description: 'Obtener access_token con credenciales' },
      { method: 'POST', path: '/api/graphql', description: 'Consultar viajes, peajes, facturacion via GraphQL' },
    ],
    cronJobs: [
      { schedule: '*/5 * * * *', description: 'Sync real-time de viajes BA', script: 'run-cabify-realtime.sh' },
      { schedule: '0 23 * * 0', description: 'Sync semanal historico BA', script: 'run-cabify-weekly.sh' },
      { schedule: '0 4 * * *', description: 'Backfill diario BA', script: 'run-cabify-daily-backfill.sh' },
    ],
    notes: [
      'El access_token se regenera automaticamente en cada ejecucion',
      'Las credenciales estan en .env (VITE_ prefix) para el proxy y en env.sh para los scripts',
      'Los scripts son Deno (no Node) — usan Deno.env.get()',
      'Datos en tabla: cabify_historico',
    ],
    tokenInfo: {
      type: 'OAuth2 Access Token (efimero)',
      location: '.env (server proxy) + env.sh (scripts Deno)',
      rotation: 'Automatica — se regenera en cada ejecucion',
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
    id: 'cabify-bari',
    name: 'Cabify (Bariloche)',
    description: 'Integracion con Cabify para conductores en Bariloche. Misma API que Buenos Aires pero con credenciales y company IDs distintos.',
    icon: Car,
    color: '#8B5CF6',
    badgeColor: 'purple',
    authType: 'OAuth2 (Resource Owner Password)',
    authDescription: 'Misma mecanica que Cabify BA. Credenciales diferentes (usuario info@toshify.com.ar). Mismo client_id/client_secret.',
    baseUrl: 'https://partners.cabify.com/api/graphql',
    environment: 'server',
    status: 'active',
    endpoints: [
      { method: 'POST', path: '/auth/api/authorization', description: 'Obtener access_token' },
      { method: 'POST', path: '/api/graphql', description: 'Consultar viajes via GraphQL' },
    ],
    cronJobs: [
      { schedule: '*/5 * * * *', description: 'Sync real-time de viajes Bariloche', script: 'run-cabify-realtime-bari.sh' },
      { schedule: '30 23 * * 0', description: 'Sync semanal historico Bariloche', script: 'run-cabify-weekly-bari.sh' },
    ],
    notes: [
      '3 empresas/conductores configurados en Bariloche',
      'Scripts independientes de los de BA — archivos separados',
      'Las credenciales solo estan en env.sh del servidor (NO en .env del repo)',
    ],
    tokenInfo: {
      type: 'OAuth2 Access Token (efimero)',
      location: 'env.sh en servidor unicamente',
      rotation: 'Automatica — se regenera en cada ejecucion',
    },
    credentialKeys: {
      systemKey: 'cabify_bari',
      fields: [
        { key: 'username', label: 'Username' },
        { key: 'password', label: 'Password' },
        { key: 'company_ids', label: 'Company IDs' },
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
// Card de cada integracion
// =============================================

function IntegrationCard({ system, serverTokens, tokensLoading, tokensError }: {
  system: IntegrationSystem;
  serverTokens: Record<string, Record<string, string | null>> | null;
  tokensLoading: boolean;
  tokensError: string | null;
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
                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
                  Cargando credenciales...
                </div>
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

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Sin sesion activa');
        return;
      }

      const res = await fetch('/api/admin/function-health', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error' }));
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
                    <HealthBadge
                      status={loading ? 'checking' : (fn.health_status || 'unknown')}
                      responseTime={fn.response_time_ms}
                    />
                  </div>

                  {/* Error tooltip */}
                  {fn.health_error && (
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
          <div style={{
            padding: '30px',
            textAlign: 'center',
            color: 'var(--text-tertiary)',
            fontSize: '13px',
          }}>
            No se encontraron Edge Functions configuradas
          </div>
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
        <div style={{
          padding: '40px',
          textAlign: 'center',
          color: 'var(--text-tertiary)',
          fontSize: '13px',
        }}>
          Cargando credenciales...
        </div>
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

type TabId = 'integraciones' | 'monitor' | 'credenciales';

const TABS: { id: TabId; label: string; icon: LucideIcon }[] = [
  { id: 'integraciones', label: 'Integraciones', icon: Globe },
  { id: 'monitor', label: 'Monitor', icon: Activity },
  { id: 'credenciales', label: 'Credenciales', icon: Eye },
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
        const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
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
  const cronCount = INTEGRATIONS.reduce((acc, s) => acc + s.cronJobs.length, 0);

  return (
    <div className="module-container" style={{ maxWidth: '1100px' }}>
      {/* Header */}
      <div className="module-header" style={{ marginBottom: '16px' }}>
        <h1 className="module-title">Integraciones & Servicios</h1>
        <p className="module-subtitle">
          Documentacion de sistemas externos, autenticacion y tareas programadas
        </p>
      </div>

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
      <div style={{
        display: 'flex',
        gap: '0',
        borderBottom: '2px solid var(--border-primary)',
        marginBottom: '20px',
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
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
    </div>
  );
}
