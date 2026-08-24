// src/modules/hellosign/components/DocumentosTab.tsx
/**
 * Listado de solicitudes de firma enviadas (signature_request/list).
 *
 * Equivale a la pantalla "Documentos" de Dropbox Sign, con una diferencia que
 * viene de la API: NO incluye los borradores sin enviar (esos solo existen en
 * la web de Dropbox Sign), y la fecha disponible es la de envío (created_at),
 * no la de última actualización.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Bell,
  CheckCircle2,
  Clock,
  FileClock,
  FileText,
  FlaskConical,
  Loader2,
  RefreshCw,
  Users,
  XCircle,
} from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';
import Swal from 'sweetalert2';
import { DataTable } from '../../../components/ui/DataTable';
import { ActionsMenu } from '../../../components/ui/ActionsMenu';
import { AdaptiveTooltip } from '../../../components/ui/AdaptiveTooltip';
import { showSuccess } from '../../../utils/toast';
import type {
  SignatureRequest,
  SignatureRequestSignature,
} from '../types/hellosign.types';
import { formatFechaHelloSign, hellosignService } from '../hellosignService';
import { DocumentoDetalleModal } from './DocumentoDetalleModal';
import { DocumentoCambiosModal } from './DocumentoCambiosModal';

type StatCard = 'pendientes' | 'firmados' | 'rechazados' | 'prueba';

const STAT_LABELS: Record<StatCard, string> = {
  pendientes: 'Firma pendiente',
  firmados: 'Firmados',
  rechazados: 'Rechazados / error',
  prueba: 'En modo prueba',
};

/** Estado global de la solicitud a partir de los flags de la API. */
function estadoDocumento(doc: SignatureRequest): {
  label: string;
  clase: string;
} {
  if (doc.is_declined) return { label: 'Rechazado', clase: 'hs-badge-red' };
  if (doc.has_error) return { label: 'Con error', clase: 'hs-badge-red' };
  if (doc.is_complete) return { label: 'Firmado', clase: 'hs-badge-green' };
  return { label: 'Firma pendiente', clase: 'hs-badge-yellow' };
}

/** Color del chip de cada destinatario según su estado. */
function claseFirmante(firma: SignatureRequestSignature): string {
  if (firma.status_code === 'signed') return 'hs-badge-green';
  if (firma.status_code === 'declined') return 'hs-badge-red';
  return 'hs-badge-yellow';
}

/** Texto corto del estado de un firmante. */
function etiquetaFirmante(firma: SignatureRequestSignature): string {
  if (firma.status_code === 'signed') return 'Firmó';
  if (firma.status_code === 'declined') return 'Rechazó';
  if (firma.status_code === 'on_hold') return 'En espera';
  return 'Pendiente';
}

/** Firmantes que todavía no firmaron ni rechazaron. */
function pendientesDe(doc: SignatureRequest) {
  return (doc.signatures ?? []).filter(
    (f) => f.status_code !== 'signed' && f.status_code !== 'declined',
  );
}

export function DocumentosTab() {
  const [documentos, setDocumentos] = useState<SignatureRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStatCard, setActiveStatCard] = useState<StatCard | null>(null);

  const [detalleDoc, setDetalleDoc] = useState<SignatureRequest | null>(null);
  const [cambiosDoc, setCambiosDoc] = useState<SignatureRequest | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const lista = await hellosignService.listAllSignatureRequests();
      setDocumentos(lista);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'No se pudieron cargar los documentos',
      );
      setDocumentos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const stats = useMemo(
    () => ({
      total: documentos.length,
      pendientes: documentos.filter(
        (d) => !d.is_complete && !d.is_declined && !d.has_error,
      ).length,
      firmados: documentos.filter((d) => d.is_complete).length,
      rechazados: documentos.filter((d) => d.is_declined || d.has_error).length,
      prueba: documentos.filter((d) => d.test_mode).length,
    }),
    [documentos],
  );

  const documentosFiltrados = useMemo(() => {
    switch (activeStatCard) {
      case 'pendientes':
        return documentos.filter((d) => !d.is_complete && !d.is_declined && !d.has_error);
      case 'firmados':
        return documentos.filter((d) => d.is_complete);
      case 'rechazados':
        return documentos.filter((d) => d.is_declined || d.has_error);
      case 'prueba':
        return documentos.filter((d) => d.test_mode);
      default:
        return documentos;
    }
  }, [documentos, activeStatCard]);

  const handleStatCardClick = (card: StatCard) => {
    setActiveStatCard((prev) => (prev === card ? null : card));
  };

  /**
   * Si queda un solo firmante pendiente se manda directo (con confirmación).
   * Con más de uno hay que elegir a quién, así que se abre el detalle: mandarle
   * a todos por defecto sería spam.
   */
  const handleRecordatorio = async (doc: SignatureRequest) => {
    const pendientes = pendientesDe(doc);

    if (pendientes.length === 0) {
      void Swal.fire('Sin pendientes', 'Ya firmaron todos los firmantes.', 'info');
      return;
    }

    if (pendientes.length > 1) {
      setDetalleDoc(doc);
      return;
    }

    const firmante = pendientes[0];
    const email = firmante.signer_email_address;
    if (!email) {
      setDetalleDoc(doc);
      return;
    }

    const confirmacion = await Swal.fire({
      title: 'Enviar recordatorio',
      html: `Se le va a reenviar el mail de firma a <b>${email}</b>.`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Enviar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: 'var(--color-primary)',
    });
    if (!confirmacion.isConfirmed) return;

    setProcesando(doc.signature_request_id);
    try {
      await hellosignService.remindSignatureRequest(
        doc.signature_request_id,
        email,
        firmante.signer_name ?? undefined,
      );
      showSuccess('Recordatorio enviado', email);
      await cargar();
    } catch (err) {
      void Swal.fire(
        'Error',
        err instanceof Error ? err.message : 'No se pudo enviar el recordatorio',
        'error',
      );
    } finally {
      setProcesando(null);
    }
  };

  const handleCancelar = async (doc: SignatureRequest) => {
    const confirmacion = await Swal.fire({
      title: '¿Cancelar la solicitud?',
      html:
        `Se va a cancelar <b>${doc.title || 'la solicitud'}</b>. ` +
        'Los firmantes ya no van a poder firmarla y <b>no se puede deshacer</b>.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Sí, cancelar',
      cancelButtonText: 'Volver',
      confirmButtonColor: 'var(--color-primary)',
    });
    if (!confirmacion.isConfirmed) return;

    setProcesando(doc.signature_request_id);
    try {
      await hellosignService.cancelSignatureRequest(doc.signature_request_id);
      showSuccess('Solicitud cancelada');
      await cargar();
    } catch (err) {
      void Swal.fire(
        'Error',
        err instanceof Error ? err.message : 'No se pudo cancelar la solicitud',
        'error',
      );
    } finally {
      setProcesando(null);
    }
  };

  const columns = useMemo<ColumnDef<SignatureRequest>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Nombre',
        cell: ({ row }) => (
          <div className="hs-name-cell">
            <span className="hs-name">{row.original.title || 'Sin título'}</span>
            {row.original.subject && (
              <span className="hs-name-sub">{row.original.subject}</span>
            )}
          </div>
        ),
      },
      {
        id: 'estado',
        header: 'Estado',
        accessorFn: (row) => estadoDocumento(row).label,
        cell: ({ row }) => {
          const estado = estadoDocumento(row.original);
          return (
            <div className="hs-badges">
              <span className={`hs-badge ${estado.clase}`}>{estado.label}</span>
              {row.original.test_mode && (
                <span className="hs-badge hs-badge-gray">Prueba</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'pendiente',
        header: 'Pendiente',
        accessorFn: (row) => pendientesDe(row).length,
        cell: ({ row }) => {
          const total = (row.original.signatures ?? []).length;
          const pendientes = pendientesDe(row.original).length;
          if (total === 0) return <span className="hs-muted">—</span>;
          return (
            <span className="hs-firmas-count" title={`${total - pendientes} de ${total} firmaron`}>
              {pendientes > 0 ? pendientes : '—'}
            </span>
          );
        },
        meta: { headerAlign: 'center', cellAlign: 'center' },
      },
      {
        id: 'enviados',
        header: 'Enviados a',
        // El buscador tambien matchea por email, no solo por nombre.
        accessorFn: (row) =>
          (row.signatures ?? [])
            .map((f) => `${f.signer_name ?? ''} ${f.signer_email_address ?? ''}`)
            .join(' '),
        cell: ({ row }) => {
          const firmas = row.original.signatures ?? [];
          if (firmas.length === 0) return <span className="hs-muted">—</span>;

          // Se muestran 2 chips y el resto se agrupa: la lista completa vive en
          // el tooltip para no romper el ancho de la tabla.
          const visibles = firmas.slice(0, 2);
          const restantes = firmas.length - visibles.length;
          const firmados = firmas.length - pendientesDe(row.original).length;

          return (
            <AdaptiveTooltip
              width={300}
              content={
                <div className="hs-tt-firmantes">
                  <div className="hs-tt-titulo">
                    {firmados} de {firmas.length} firmaron
                  </div>
                  {firmas.map((firma) => (
                    <div key={firma.signature_id} className="hs-tt-firmante">
                      <span className={`hs-punto ${claseFirmante(firma)}`} />
                      <span className="hs-tt-datos">
                        <b>{firma.signer_name || 'Sin nombre'}</b>
                        <span>{firma.signer_email_address}</span>
                        <span className="hs-tt-estado">{etiquetaFirmante(firma)}</span>
                      </span>
                    </div>
                  ))}
                </div>
              }
            >
              <div className="hs-enviados">
                {visibles.map((firma) => (
                  <span
                    key={firma.signature_id}
                    className={`hs-badge ${claseFirmante(firma)} hs-chip-persona`}
                  >
                    {firma.signer_name || firma.signer_email_address}
                  </span>
                ))}
                {restantes > 0 && (
                  <span className="hs-badge hs-badge-gray">+{restantes}</span>
                )}
              </div>
            </AdaptiveTooltip>
          );
        },
      },
      {
        id: 'created_at',
        header: 'Enviada',
        accessorFn: (row) => row.created_at ?? 0,
        cell: ({ row }) => (
          <span className="hs-fecha">{formatFechaHelloSign(row.original.created_at)}</span>
        ),
      },
      {
        id: 'acciones',
        header: 'Acciones',
        cell: ({ row }) => {
          const doc = row.original;
          const cerrado = Boolean(doc.is_complete || doc.is_declined);
          const enProceso = procesando === doc.signature_request_id;

          return (
            <ActionsMenu
              actions={[
                {
                  icon: <FileClock size={15} />,
                  label: 'Ver cambios del documento',
                  onClick: () => setCambiosDoc(doc),
                },
                {
                  icon: <Users size={15} />,
                  label: 'Ver firmantes',
                  onClick: () => setDetalleDoc(doc),
                },
                {
                  icon: <Bell size={15} />,
                  label: 'Enviar recordatorio',
                  onClick: () => void handleRecordatorio(doc),
                  disabled: cerrado || enProceso,
                  variant: 'info',
                },
                {
                  icon: <Ban size={15} />,
                  label: 'Cancelar solicitud',
                  onClick: () => void handleCancelar(doc),
                  disabled: cerrado || enProceso,
                  variant: 'danger',
                },
              ]}
            />
          );
        },
        enableSorting: false,
      },
    ],
    // handleRecordatorio/handleCancelar se recrean en cada render pero solo se
    // invocan en el onClick, así que no hace falta memoizarlos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [procesando],
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
    <>
      {error && (
        <div className="hs-alert hs-alert-error">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      <div className="hs-stats">
        <div className="hs-stats-grid">
          <div className="stat-card" title="Total de solicitudes enviadas">
            <FileText size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.total}</span>
              <span className="stat-label">Total Documentos</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'pendientes' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('pendientes')}
            title="Esperando la firma de alguien"
          >
            <Clock size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.pendientes}</span>
              <span className="stat-label">Firma pendiente</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'firmados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('firmados')}
            title="Firmados por todos"
          >
            <CheckCircle2 size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.firmados}</span>
              <span className="stat-label">Firmados</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'rechazados' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('rechazados')}
            title="Rechazados por un firmante o con error"
          >
            <XCircle size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.rechazados}</span>
              <span className="stat-label">Rechazados / error</span>
            </div>
          </div>

          <div
            className={`stat-card stat-card-clickable ${activeStatCard === 'prueba' ? 'stat-card-active' : ''}`}
            onClick={() => handleStatCardClick('prueba')}
            title="Enviados en test_mode: sin validez legal"
          >
            <FlaskConical size={18} className="stat-icon" />
            <div className="stat-content">
              <span className="stat-value">{stats.prueba}</span>
              <span className="stat-label">En modo prueba</span>
            </div>
          </div>
        </div>
      </div>

      <DataTable
        data={documentosFiltrados}
        columns={columns}
        loading={loading}
        pageSize={20}
        searchPlaceholder="Buscar por nombre, asunto o firmante..."
        emptyIcon={<FileText size={64} />}
        emptyTitle="No hay documentos enviados"
        emptyDescription="Usá una plantilla para enviar tu primera solicitud de firma."
        externalFilters={externalFilters}
        onClearAllFilters={() => setActiveStatCard(null)}
        headerAction={
          <button
            className="btn-secondary"
            onClick={() => void cargar()}
            disabled={loading}
            title="Volver a consultar la API de Dropbox Sign"
          >
            {loading ? (
              <Loader2 size={15} className="hs-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Sincronizar
          </button>
        }
      />

      {cambiosDoc && (
        <DocumentoCambiosModal
          documento={cambiosDoc}
          onClose={() => setCambiosDoc(null)}
        />
      )}

      {detalleDoc && (
        <DocumentoDetalleModal
          documento={detalleDoc}
          onClose={() => setDetalleDoc(null)}
          onActualizado={() => void cargar()}
        />
      )}
    </>
  );
}
