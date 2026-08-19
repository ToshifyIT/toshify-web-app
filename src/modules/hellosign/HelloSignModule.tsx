// src/modules/hellosign/HelloSignModule.tsx
/**
 * Vista /hellosign — Plantillas de Dropbox Sign (ex HelloSign).
 *
 * Consume /api/hellosign/* (ver server-hellosign.js en la raíz del repo).
 * La API key vive solo en el backend.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Eye,
  FileSignature,
  FileSearch,
  FileText,
  Lock,
  PenLine,
  Plus,
  RefreshCw,
  Replace,
  Send,
  Upload,
  Users,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '../../components/ui/DataTable';
import { ActionsMenu } from '../../components/ui/ActionsMenu';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import type { HelloSignStatus, HelloSignTemplate } from './types/hellosign.types';
import {
  actualizadaEnUltimosDias,
  formatFechaHelloSign,
  getAccesoLabel,
  hellosignService,
  isCompartida,
} from './hellosignService';
import { TemplateDetalleModal } from './components/TemplateDetalleModal';
import { UsarPlantillaModal } from './components/UsarPlantillaModal';
import { TemplateVisorModal } from './components/TemplateVisorModal';
import { CrearPlantillaModal } from './components/CrearPlantillaModal';
import { ReemplazarDocumentoModal } from './components/ReemplazarDocumentoModal';
import './HelloSignModule.css';

/** Alta de plantillas directo en la web de Dropbox Sign. */
const URL_CREAR_EN_DROPBOX_SIGN = 'https://app.hellosign.com/home/createTemplate';

/** Días para considerar una plantilla "actualizada recientemente". */
const DIAS_RECIENTE = 30;

type StatCard = 'editables' | 'compartidas' | 'bloqueadas' | 'recientes';

const STAT_LABELS: Record<StatCard, string> = {
  editables: 'Editables',
  compartidas: 'Compartidas',
  bloqueadas: 'Bloqueadas',
  recientes: `Actualizadas (${DIAS_RECIENTE}d)`,
};

export function HelloSignModule() {
  const [templates, setTemplates] = useState<HelloSignTemplate[]>([]);
  const [status, setStatus] = useState<HelloSignStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStatCard, setActiveStatCard] = useState<StatCard | null>(null);

  const [detalleTemplate, setDetalleTemplate] = useState<HelloSignTemplate | null>(null);
  const [usarTemplate, setUsarTemplate] = useState<HelloSignTemplate | null>(null);
  const [visorTemplate, setVisorTemplate] = useState<HelloSignTemplate | null>(null);
  const [crearAbierto, setCrearAbierto] = useState(false);
  const [reemplazarTemplate, setReemplazarTemplate] = useState<HelloSignTemplate | null>(
    null,
  );
  const [menuCrearAbierto, setMenuCrearAbierto] = useState(false);

  const menuCrearRef = useRef<HTMLDivElement | null>(null);
  const esperandoDropboxSign = useRef(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [estado, lista] = await Promise.all([
        hellosignService.getStatus().catch(() => null),
        hellosignService.listAllTemplates(),
      ]);
      setStatus(estado);
      setTemplates(lista);
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : 'No se pudieron cargar las plantillas';
      setError(mensaje);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cierra el menú de "Crear Plantilla" al hacer click afuera.
  useEffect(() => {
    if (!menuCrearAbierto) return;
    const alClickear = (e: MouseEvent) => {
      if (menuCrearRef.current && !menuCrearRef.current.contains(e.target as Node)) {
        setMenuCrearAbierto(false);
      }
    };
    document.addEventListener('mousedown', alClickear);
    return () => document.removeEventListener('mousedown', alClickear);
  }, [menuCrearAbierto]);

  // Si el usuario se fue a crear la plantilla a Dropbox Sign, al volver el foco
  // a esta pestaña se refresca el listado solo.
  useEffect(() => {
    const alVolver = () => {
      if (!esperandoDropboxSign.current) return;
      esperandoDropboxSign.current = false;
      void cargar();
    };
    window.addEventListener('focus', alVolver);
    return () => window.removeEventListener('focus', alVolver);
  }, [cargar]);

  const abrirDropboxSign = useCallback(() => {
    setMenuCrearAbierto(false);
    esperandoDropboxSign.current = true;
    window.open(URL_CREAR_EN_DROPBOX_SIGN, '_blank', 'noopener,noreferrer');
  }, []);

  const stats = useMemo(
    () => ({
      total: templates.length,
      editables: templates.filter((t) => t.can_edit).length,
      compartidas: templates.filter(isCompartida).length,
      bloqueadas: templates.filter((t) => t.is_locked).length,
      recientes: templates.filter((t) => actualizadaEnUltimosDias(t, DIAS_RECIENTE)).length,
    }),
    [templates],
  );

  const templatesFiltradas = useMemo(() => {
    switch (activeStatCard) {
      case 'editables':
        return templates.filter((t) => t.can_edit);
      case 'compartidas':
        return templates.filter(isCompartida);
      case 'bloqueadas':
        return templates.filter((t) => t.is_locked);
      case 'recientes':
        return templates.filter((t) => actualizadaEnUltimosDias(t, DIAS_RECIENTE));
      default:
        return templates;
    }
  }, [templates, activeStatCard]);

  const handleStatCardClick = (card: StatCard) => {
    setActiveStatCard((prev) => (prev === card ? null : card));
  };

  const columns = useMemo<ColumnDef<HelloSignTemplate>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Nombre',
        cell: ({ row }) => (
          <div className="hs-name-cell">
            <span className="hs-name">{row.original.title || 'Sin título'}</span>
            {row.original.message && (
              <span className="hs-name-sub">{row.original.message}</span>
            )}
          </div>
        ),
      },
      {
        id: 'roles',
        header: 'Roles de firma',
        accessorFn: (row) => (row.signer_roles ?? []).map((r) => r.name).join(', '),
        cell: ({ row }) => {
          const roles = row.original.signer_roles ?? [];
          if (roles.length === 0) return <span className="hs-muted">—</span>;
          return (
            <div className="hs-badges">
              {roles.slice(0, 2).map((role, index) => (
                <span key={`${role.name}-${index}`} className="hs-badge hs-badge-blue">
                  {role.name}
                </span>
              ))}
              {roles.length > 2 && (
                <span className="hs-badge hs-badge-gray">+{roles.length - 2}</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'documentos',
        header: 'Docs',
        accessorFn: (row) => (row.documents ?? []).length,
        cell: ({ row }) => (
          <span className="hs-doc-count">{(row.original.documents ?? []).length}</span>
        ),
        meta: { headerAlign: 'center', cellAlign: 'center' },
      },
      {
        id: 'acceso',
        header: 'Quiénes pueden acceder',
        accessorFn: (row) => getAccesoLabel(row),
        cell: ({ row }) => (
          <span className="hs-acceso">
            <Users size={13} />
            {getAccesoLabel(row.original)}
          </span>
        ),
      },
      {
        id: 'updated_at',
        header: 'Actualizada',
        accessorFn: (row) => row.updated_at ?? 0,
        cell: ({ row }) => (
          <span className="hs-fecha">{formatFechaHelloSign(row.original.updated_at)}</span>
        ),
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => (
          <ActionsMenu
            actions={[
              {
                icon: <FileSearch size={15} />,
                label: 'Ver documento',
                onClick: () => setVisorTemplate(row.original),
              },
              {
                icon: <Eye size={15} />,
                label: 'Ver detalle',
                onClick: () => setDetalleTemplate(row.original),
              },
              {
                icon: <Send size={15} />,
                label: 'Usar plantilla',
                onClick: () => setUsarTemplate(row.original),
                disabled: (row.original.signer_roles ?? []).length === 0,
                variant: 'info',
              },
              {
                icon: <Replace size={15} />,
                label: 'Reemplazar documento',
                onClick: () => setReemplazarTemplate(row.original),
                variant: 'warning',
              },
            ]}
          />
        ),
        enableSorting: false,
      },
    ],
    [],
  );

  const externalFilters = activeStatCard
    ? [
        {
          id: activeStatCard,
          label: STAT_LABELS[activeStatCard],
          onClear: () => setActiveStatCard(null),
        },
      ]
    : undefined;

  return (
    <div className="hs-module">
      <LoadingOverlay show={loading} message="Cargando plantillas..." size="lg" />

      {/* Header */}
      <div className="hs-header">
        <div className="hs-header-title">
          <h1>
            <FileSignature size={18} />
            Plantillas
          </h1>
          <span className="hs-header-subtitle">
            Plantillas de firma electrónica sincronizadas desde Dropbox Sign
          </span>
        </div>

        {status && (
          <div
            className={`hs-conn ${status.connected ? 'hs-conn-ok' : 'hs-conn-error'}`}
            title={status.message ?? undefined}
          >
            {status.connected ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
            <span>
              {status.connected
                ? status.account?.email_address ?? 'Conectado'
                : status.configured
                  ? 'Sin conexión'
                  : 'Sin configurar'}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="hs-alert hs-alert-error">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Stats */}
      <div className="hs-stats">
        <div className="hs-stats-grid">
          <div className="stat-card" title="Total de plantillas en la cuenta">
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Plantillas</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'editables' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('editables')}
            title="Plantillas que podés editar"
          >
            <PenLine size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.editables}</span>
              <span className="stat-label">Editables</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'compartidas' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('compartidas')}
            title="Plantillas compartidas con más de una cuenta"
          >
            <Users size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.compartidas}</span>
              <span className="stat-label">Compartidas</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'bloqueadas' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('bloqueadas')}
            title="Plantillas bloqueadas"
          >
            <Lock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.bloqueadas}</span>
              <span className="stat-label">Bloqueadas</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'recientes' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('recientes')}
            title={`Actualizadas en los últimos ${DIAS_RECIENTE} días`}
          >
            <RefreshCw size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.recientes}</span>
              <span className="stat-label">Actualizadas ({DIAS_RECIENTE}d)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={templatesFiltradas}
        columns={columns}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Buscar por nombre, rol o palabra clave..."
        emptyIcon={<FileSignature size={64} />}
        emptyTitle="No hay plantillas"
        emptyDescription="Creá una plantilla desde Dropbox Sign y volvé a sincronizar."
        externalFilters={externalFilters}
        onClearAllFilters={() => setActiveStatCard(null)}
        headerAction={
          <>
            <button
              className="btn-secondary"
              onClick={() => void cargar()}
              disabled={loading}
              title="Volver a consultar la API de Dropbox Sign"
            >
              <RefreshCw size={15} className={loading ? 'hs-spin' : undefined} />
              Sincronizar
            </button>

            <div className="hs-crear-wrap" ref={menuCrearRef}>
              <button
                className="btn-primary"
                onClick={() => setMenuCrearAbierto((v) => !v)}
                title="Crear una plantilla nueva"
              >
                <Plus size={15} />
                Crear Plantilla
                <ChevronDown
                  size={14}
                  style={{
                    transform: menuCrearAbierto ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.15s',
                  }}
                />
              </button>

              {menuCrearAbierto && (
                <div className="hs-crear-menu">
                  <button
                    onClick={() => {
                      setMenuCrearAbierto(false);
                      setCrearAbierto(true);
                    }}
                  >
                    <Upload size={15} />
                    <span>
                      Subir documento y editar acá
                      <small>Editor de Dropbox Sign embebido en Toshify</small>
                    </span>
                  </button>
                  <button onClick={abrirDropboxSign}>
                    <ExternalLink size={15} />
                    <span>
                      Crear en Dropbox Sign
                      <small>Abre app.hellosign.com y refresca al volver</small>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </>
        }
      />

      {detalleTemplate && (
        <TemplateDetalleModal
          template={detalleTemplate}
          onClose={() => setDetalleTemplate(null)}
          onUsar={(tpl) => {
            setDetalleTemplate(null);
            setUsarTemplate(tpl);
          }}
        />
      )}

      {usarTemplate && (
        <UsarPlantillaModal
          template={usarTemplate}
          onClose={() => setUsarTemplate(null)}
        />
      )}

      {visorTemplate && (
        <TemplateVisorModal
          template={visorTemplate}
          onClose={() => setVisorTemplate(null)}
        />
      )}

      {crearAbierto && (
        <CrearPlantillaModal
          clientId={status?.clientId ?? null}
          onClose={() => setCrearAbierto(false)}
          onCreada={() => void cargar()}
        />
      )}

      {reemplazarTemplate && (
        <ReemplazarDocumentoModal
          template={reemplazarTemplate}
          clientId={status?.clientId ?? null}
          onClose={() => setReemplazarTemplate(null)}
          onReemplazada={() => void cargar()}
        />
      )}
    </div>
  );
}
