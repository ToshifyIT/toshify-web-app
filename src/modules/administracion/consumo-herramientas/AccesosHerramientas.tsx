// src/modules/administracion/consumo-herramientas/AccesosHerramientas.tsx
// Configuración › Integraciones & Tokens › Accesos herramientas (2026-11-17).
// Solo accesos: qué cuentas tenemos en cada aplicación, con qué usuario se entra
// y las credenciales (baúl). Las cuentas se agrupan por
// aplicación (ej. Cabify: 44 Dreams, Bariloche, Partners).
// Plan, licencias, montos, cobro y facturación están en Administración › Consumo herramientas
// y en el formulario de cada herramienta.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Edit2, ExternalLink, FileSpreadsheet, KeyRound, LockKeyhole, Plus, Wrench } from 'lucide-react'
import type { ColumnDef } from '@tanstack/react-table'
import { supabase } from '../../../lib/supabase'
import { usePermissions } from '../../../contexts/PermissionsContext'
import { DataTable } from '../../../components/ui/DataTable'
import { ActionsMenu } from '../../../components/ui/ActionsMenu'
import { showError } from '../../../utils/toast'
import type { EstadoHerramienta, Herramienta } from './types'
import { HerramientaModal } from './Modales'
import { CredencialesModal } from './Credenciales'
import { ImportarCredencialesModal } from './ImportarCredenciales'

/** Los permisos de las tablas de herramientas cuelgan de este submenú (sql/consumo_herramientas.sql) */
const SUBMENU = 'consumo-herramientas'

const GUION = <span style={{ color: 'var(--text-tertiary)' }}>-</span>

/** Aplicación de una herramienta: lo que va antes de « – » ("Cabify – Bariloche" → "Cabify");
 *  "Contabo PRD" / "Contabo DEV" → "Contabo". Si no, el nombre completo. */
function aplicacionDe(nombre: string): string {
  const [antes] = nombre.split(/\s+[–-]\s+/)
  if (antes !== nombre) return antes.trim()
  if (/^Contabo\b/i.test(nombre)) return 'Contabo'
  return nombre
}

/** Cuenta dentro de la aplicación ("Cabify – Bariloche" → "Bariloche"; "Contabo PRD" → "PRD") */
const cuentaDe = (nombre: string, app: string) => {
  const resto = nombre.slice(app.length).replace(/^\s*[–-]?\s*/, '').trim()
  return resto || null
}

type Fila = Herramienta & { aplicacion: string; cuenta: string | null }

export function AccesosHerramientas() {
  const { canEditInSubmenu, canCreateInSubmenu } = usePermissions()
  const puedeEditar = canEditInSubmenu(SUBMENU)
  const puedeCrear = canCreateInSubmenu(SUBMENU) || puedeEditar

  const [herramientas, setHerramientas] = useState<Herramienta[]>([])
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<EstadoHerramienta>('Activa')
  const [modalHerramienta, setModalHerramienta] = useState<{ h: Herramienta | null } | null>(null)
  const [credencialesDe, setCredencialesDe] = useState<Herramienta | null>(null)
  const [importando, setImportando] = useState(false)
  /** ¿Puede usar el baúl de credenciales? (miembro del baúl; false si falta el SQL) */
  const [puedeCredenciales, setPuedeCredenciales] = useState(false)

  useEffect(() => {
    supabase.rpc('herramientas_puede_credenciales').then(({ data, error }) => {
      setPuedeCredenciales(!error && data === true)
    })
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data, error } = await supabase.from('herramientas').select('*').order('nombre')
      if (error) throw error
      setHerramientas((data || []) as Herramienta[])
    } catch (e) {
      console.error('No se pudieron cargar las herramientas:', e)
      showError('No se pudieron cargar las herramientas')
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const cantidad = useMemo(() => ({
    Activa: herramientas.filter(h => h.estado === 'Activa').length,
    Inactiva: herramientas.filter(h => h.estado === 'Inactiva').length,
  }), [herramientas])

  /** Ordenadas por aplicación y cuenta, así cada grupo queda junto */
  const lista = useMemo<Fila[]>(() => herramientas
    .filter(h => h.estado === estado)
    .map(h => {
      const aplicacion = aplicacionDe(h.nombre)
      return { ...h, aplicacion, cuenta: cuentaDe(h.nombre, aplicacion) }
    })
    .sort((a, b) => a.aplicacion.localeCompare(b.aplicacion, 'es') || (a.cuenta || '').localeCompare(b.cuenta || '', 'es')),
  [herramientas, estado])

  /** Primera fila de cada aplicación y cuántas cuentas tiene */
  const grupos = useMemo(() => {
    const primeras = new Set<string>()
    const total = new Map<string, number>()
    let anterior = ''
    for (const f of lista) {
      if (f.aplicacion !== anterior) primeras.add(f.id)
      anterior = f.aplicacion
      total.set(f.aplicacion, (total.get(f.aplicacion) || 0) + 1)
    }
    return { primeras, total }
  }, [lista])

  const abrir = (url: string | null) => { if (url) window.open(url, '_blank', 'noopener,noreferrer') }


  const columnas = useMemo<ColumnDef<Fila>[]>(() => [
    {
      accessorKey: 'aplicacion',
      header: 'Aplicación',
      enableSorting: false,
      cell: ({ row }) => {
        if (!grupos.primeras.has(row.original.id)) return null
        const n = grupos.total.get(row.original.aplicacion) || 1
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <strong style={{ whiteSpace: 'nowrap' }}>{row.original.aplicacion}</strong>
            {n > 1 && <span style={{ color: 'var(--text-tertiary)' }}>{n} cuentas</span>}
          </div>
        )
      },
    },
    {
      id: 'cuenta',
      header: 'Cuenta',
      enableSorting: false,
      accessorFn: r => `${r.cuenta || ''} ${r.uso || ''}`,
      cell: ({ row }) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
          {row.original.cuenta && <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.original.cuenta}</span>}
          {row.original.uso ? <span style={{ color: 'var(--text-tertiary)' }}>{row.original.uso}</span> : !row.original.cuenta && GUION}
        </div>
      ),
    },
    { accessorKey: 'cuenta_acceso', header: 'Usuario de acceso', enableSorting: false, cell: ({ getValue }) => (getValue() as string) || GUION },
    {
      accessorKey: 'url_acceso',
      header: 'URL',
      enableSorting: false,
      cell: ({ getValue }) => {
        const url = getValue() as string | null
        if (!url) return GUION
        // Dominio + ruta (sin parámetros), así se ve a dónde lleva: toshify.com.ar/wp-admin
        let texto = url
        try {
          const u = new URL(url)
          texto = u.hostname.replace(/^www\./, '') + u.pathname.replace(/\/+$/, '')
        } catch { /* se muestra tal cual */ }
        return (
          <a href={url} target="_blank" rel="noopener noreferrer" title={url}
            style={{ color: 'var(--color-primary)', whiteSpace: 'nowrap', display: 'inline-block', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>
            {texto}
          </a>
        )
      },
    },
    {
      id: 'acciones',
      header: 'Acciones',
      cell: ({ row }) => {
        const h = row.original
        return (
          <ActionsMenu
            maxVisible={4}
            actions={[
              { icon: <Edit2 size={15} />, label: 'Editar', onClick: () => setModalHerramienta({ h }), hidden: !puedeEditar },
              {
                icon: <LockKeyhole size={15} />,
                label: 'Credenciales (usuario y contraseña)',
                onClick: () => setCredencialesDe(h),
                hidden: !puedeCredenciales,
              },
              {
                icon: <ExternalLink size={15} />,
                label: h.url_acceso ? 'Abrir la herramienta' : 'Sin URL de la herramienta',
                onClick: () => abrir(h.url_acceso ?? null),
                disabled: !h.url_acceso,
              },
              {
                icon: <KeyRound size={15} />,
                label: 'Abrir en el gestor de contraseñas',
                onClick: () => abrir(h.enlace_gestor),
                hidden: !h.enlace_gestor,
              },
            ]}
          />
        )
      },
    },
  ], [puedeEditar, puedeCredenciales, grupos])

  const estiloFila = useCallback(
    (f: Fila) => (grupos.primeras.has(f.id) ? { borderTop: '2px solid var(--border-primary)' } : undefined),
    [grupos],
  )

  const sel = { height: 32, fontSize: 12, padding: '0 8px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)', background: 'var(--bg-primary)', color: 'var(--text-primary)' } as const

  const filtros = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <select style={sel} value={estado} onChange={e => setEstado(e.target.value as EstadoHerramienta)} aria-label="Estado">
        <option value="Activa">Activas ({cantidad.Activa})</option>
        <option value="Inactiva">Inactivas ({cantidad.Inactiva})</option>
      </select>
      {puedeCredenciales && (
        <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 32 }} onClick={() => setImportando(true)}
          title="Cargar usuarios y contraseñas desde el Excel de credenciales (se cifran en tu navegador)">
          <FileSpreadsheet size={14} /> Importar credenciales
        </button>
      )}
      {puedeCrear && (
        <button className="btn-primary" style={{ display: 'flex', alignItems: 'center', gap: 6 }} onClick={() => setModalHerramienta({ h: null })}>
          <Plus size={15} /> Nueva herramienta
        </button>
      )}
    </div>
  )

  return (
    <>
      <DataTable
        key={estado}
        data={lista}
        columns={columnas}
        loading={cargando}
        searchPlaceholder="Buscar aplicación, cuenta, usuario..."
        emptyIcon={<Wrench size={48} />}
        emptyTitle={estado === 'Inactiva' ? 'Sin herramientas inactivas' : 'Sin herramientas'}
        emptyDescription={estado === 'Inactiva' ? '' : 'Cargá la primera con "Nueva herramienta".'}
        headerAction={filtros}
        disableAutoFilters
        getRowStyle={estiloFila}
        stickyLeftColumns={1}
      />

      {modalHerramienta && (
        <HerramientaModal
          herramienta={modalHerramienta.h}
          onClose={() => setModalHerramienta(null)}
          onGuardado={() => { setModalHerramienta(null); cargar() }}
        />
      )}
      {importando && (
        <ImportarCredencialesModal
          herramientas={herramientas}
          onClose={() => setImportando(false)}
          onImportado={() => setImportando(false)}
        />
      )}
      {credencialesDe && (
        <CredencialesModal herramienta={credencialesDe} onClose={() => setCredencialesDe(null)} />
      )}
    </>
  )
}
