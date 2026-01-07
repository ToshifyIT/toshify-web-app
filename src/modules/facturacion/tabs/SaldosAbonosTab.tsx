import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../../lib/supabase'
import Swal from 'sweetalert2'
import {
  Wallet,
  Users,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Eye,
  Plus,
  DollarSign,
  Clock
} from 'lucide-react'
import { type ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../../../components/ui/DataTable'
import type { SaldoConductor } from '../../../types/facturacion.types'
import { formatCurrency, formatDate } from '../../../types/facturacion.types'

export function SaldosAbonosTab() {
  const [saldos, setSaldos] = useState<SaldoConductor[]>([])
  const [loading, setLoading] = useState(true)
  const [filtroSaldo, setFiltroSaldo] = useState<string>('todos')

  useEffect(() => {
    cargarSaldos()
  }, [])

  async function cargarSaldos() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('saldos_conductores')
        .select('*')
        .order('conductor_nombre')

      if (error) throw error
      setSaldos(data || [])
    } catch (error) {
      console.error('Error cargando saldos:', error)
    } finally {
      setLoading(false)
    }
  }

  async function registrarAbono(saldo: SaldoConductor) {
    const { value: formValues } = await Swal.fire({
      title: 'Registrar Movimiento',
      html: `
        <div style="text-align: left; margin-bottom: 15px;">
          <p><strong>Conductor:</strong> ${saldo.conductor_nombre}</p>
          <p><strong>Saldo actual:</strong> <span style="color: ${saldo.saldo_actual >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(saldo.saldo_actual)}</span></p>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Tipo:</label>
          <select id="swal-tipo" class="swal2-select" style="margin: 0;">
            <option value="abono">Abono (a favor del conductor)</option>
            <option value="cargo">Cargo (deuda del conductor)</option>
          </select>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Monto:</label>
          <input id="swal-monto" type="number" class="swal2-input" placeholder="Monto" style="margin: 0;">
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Concepto:</label>
          <input id="swal-concepto" type="text" class="swal2-input" placeholder="Ej: Pago en efectivo" style="margin: 0;">
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; font-weight: 500;">Referencia (opcional):</label>
          <input id="swal-ref" type="text" class="swal2-input" placeholder="Ej: Recibo #123" style="margin: 0;">
        </div>
      `,
      focusConfirm: false,
      showCancelButton: true,
      confirmButtonText: 'Registrar',
      cancelButtonText: 'Cancelar',
      width: 500,
      preConfirm: () => {
        const tipo = (document.getElementById('swal-tipo') as HTMLSelectElement).value
        const monto = (document.getElementById('swal-monto') as HTMLInputElement).value
        const concepto = (document.getElementById('swal-concepto') as HTMLInputElement).value
        const referencia = (document.getElementById('swal-ref') as HTMLInputElement).value

        if (!monto || parseFloat(monto) <= 0) {
          Swal.showValidationMessage('Ingrese un monto válido')
          return false
        }
        if (!concepto) {
          Swal.showValidationMessage('Ingrese un concepto')
          return false
        }

        return { tipo, monto: parseFloat(monto), concepto, referencia: referencia || null }
      }
    })

    if (!formValues) return

    try {
      const montoFinal = formValues.tipo === 'abono' ? formValues.monto : -formValues.monto

      const { error: errorAbono } = await (supabase
        .from('abonos_conductores') as any)
        .insert({
          conductor_id: saldo.conductor_id,
          tipo: formValues.tipo,
          monto: formValues.monto,
          concepto: formValues.concepto,
          referencia: formValues.referencia,
          fecha_abono: new Date().toISOString()
        })

      if (errorAbono) throw errorAbono

      const nuevoSaldo = saldo.saldo_actual + montoFinal
      const { error: errorUpdate } = await (supabase
        .from('saldos_conductores') as any)
        .update({ saldo_actual: nuevoSaldo, ultima_actualizacion: new Date().toISOString() })
        .eq('id', saldo.id)

      if (errorUpdate) throw errorUpdate

      Swal.fire({
        icon: 'success',
        title: formValues.tipo === 'abono' ? 'Abono Registrado' : 'Cargo Registrado',
        text: `Nuevo saldo: ${formatCurrency(nuevoSaldo)}`,
        timer: 2000,
        showConfirmButton: false
      })

      cargarSaldos()
    } catch (error: any) {
      Swal.fire('Error', error.message || 'No se pudo registrar', 'error')
    }
  }

  async function verHistorial(saldo: SaldoConductor) {
    try {
      const { data: abonos, error } = await supabase
        .from('abonos_conductores')
        .select('*')
        .eq('conductor_id', saldo.conductor_id)
        .order('fecha_abono', { ascending: false })
        .limit(20)

      if (error) throw error

      const historialHtml = abonos && abonos.length > 0
        ? (abonos as any[]).map((a: any) => `
            <tr>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${formatDate(a.fecha_abono)}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">
                <span style="color: ${a.tipo === 'abono' ? '#16a34a' : '#dc2626'}">${a.tipo === 'abono' ? '+' : '-'}${formatCurrency(a.monto)}</span>
              </td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${a.concepto}</td>
              <td style="padding: 8px; border-bottom: 1px solid #eee;">${a.referencia || '-'}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="4" style="padding: 20px; text-align: center;">Sin movimientos</td></tr>'

      Swal.fire({
        title: 'Historial de Movimientos',
        html: `
          <div style="text-align: left; margin-bottom: 15px;">
            <p><strong>Conductor:</strong> ${saldo.conductor_nombre}</p>
            <p><strong>Saldo actual:</strong> <span style="color: ${saldo.saldo_actual >= 0 ? '#16a34a' : '#dc2626'}">${formatCurrency(saldo.saldo_actual)}</span></p>
          </div>
          <div style="max-height: 400px; overflow-y: auto;">
            <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
              <thead>
                <tr style="background: #f5f5f5;">
                  <th style="padding: 8px; text-align: left;">Fecha</th>
                  <th style="padding: 8px; text-align: left;">Monto</th>
                  <th style="padding: 8px; text-align: left;">Concepto</th>
                  <th style="padding: 8px; text-align: left;">Ref.</th>
                </tr>
              </thead>
              <tbody>${historialHtml}</tbody>
            </table>
          </div>
        `,
        width: 700,
        confirmButtonText: 'Cerrar'
      })
    } catch (error) {
      console.error('Error cargando historial:', error)
    }
  }

  const columns = useMemo<ColumnDef<SaldoConductor>[]>(() => [
    {
      accessorKey: 'conductor_nombre',
      header: 'Conductor',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.conductor_nombre}</div>
          <div className="text-xs text-gray-500">{row.original.conductor_cuit || row.original.conductor_dni}</div>
        </div>
      )
    },
    {
      accessorKey: 'saldo_actual',
      header: 'Saldo Actual',
      cell: ({ row }) => {
        const saldoVal = row.original.saldo_actual
        return <span className={`fact-precio ${saldoVal >= 0 ? '' : 'fact-precio-negative'}`} style={{ fontWeight: 700 }}>{formatCurrency(saldoVal)}</span>
      }
    },
    {
      id: 'estado_saldo',
      header: 'Estado',
      cell: ({ row }) => {
        const saldoVal = row.original.saldo_actual
        if (saldoVal > 0) return <span className="fact-badge fact-badge-green">A Favor</span>
        if (saldoVal < 0) return <span className="fact-badge fact-badge-red">Deuda</span>
        return <span className="fact-badge fact-badge-gray">Sin Saldo</span>
      }
    },
    {
      accessorKey: 'dias_mora',
      header: 'Días Mora',
      cell: ({ row }) => {
        const dias = row.original.dias_mora || 0
        if (dias === 0) return <span className="text-gray-400">-</span>
        return <span className={`fact-badge ${dias > 3 ? 'fact-badge-red' : 'fact-badge-yellow'}`}>{dias} días</span>
      }
    },
    {
      accessorKey: 'monto_mora_acumulada',
      header: 'Mora Acum.',
      cell: ({ row }) => {
        const mora = row.original.monto_mora_acumulada || 0
        if (mora === 0) return <span className="text-gray-400">-</span>
        return <span className="fact-precio fact-precio-negative">{formatCurrency(mora)}</span>
      }
    },
    {
      accessorKey: 'ultima_actualizacion',
      header: 'Última Act.',
      cell: ({ row }) => (
        <span className="text-gray-500 text-sm">{row.original.ultima_actualizacion ? formatDate(row.original.ultima_actualizacion) : '-'}</span>
      )
    },
    {
      id: 'acciones',
      header: '',
      cell: ({ row }) => (
        <div className="fact-table-actions">
          <button className="fact-table-btn fact-table-btn-view" onClick={() => verHistorial(row.original)} title="Ver historial">
            <Eye size={14} />
          </button>
          <button className="fact-table-btn fact-table-btn-success" onClick={() => registrarAbono(row.original)} title="Registrar movimiento">
            <Plus size={14} />
          </button>
        </div>
      )
    }
  ], [])

  const saldosFiltrados = useMemo(() => {
    switch (filtroSaldo) {
      case 'favor': return saldos.filter(s => s.saldo_actual > 0)
      case 'deuda': return saldos.filter(s => s.saldo_actual < 0)
      case 'mora': return saldos.filter(s => (s.dias_mora || 0) > 0)
      default: return saldos
    }
  }, [saldos, filtroSaldo])

  const stats = useMemo(() => {
    const total = saldos.length
    const conFavor = saldos.filter(s => s.saldo_actual > 0).length
    const conDeuda = saldos.filter(s => s.saldo_actual < 0).length
    const enMora = saldos.filter(s => (s.dias_mora || 0) > 0).length
    const totalFavor = saldos.filter(s => s.saldo_actual > 0).reduce((sum, s) => sum + s.saldo_actual, 0)
    const totalDeuda = saldos.filter(s => s.saldo_actual < 0).reduce((sum, s) => sum + Math.abs(s.saldo_actual), 0)
    return { total, conFavor, conDeuda, enMora, totalFavor, totalDeuda }
  }, [saldos])

  return (
    <>
      {/* Header con filtro */}
      <div className="fact-header">
        <div className="fact-header-left">
          <span className="fact-label">Filtrar:</span>
          <select className="fact-select" value={filtroSaldo} onChange={(e) => setFiltroSaldo(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="favor">Con saldo a favor</option>
            <option value="deuda">Con deuda</option>
            <option value="mora">En mora</option>
          </select>
        </div>
      </div>

      {/* Stats */}
      <div className="fact-stats">
        <div className="fact-stats-grid">
          <div className="fact-stat-card">
            <Users size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.total}</span>
              <span className="fact-stat-label">Conductores</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <TrendingUp size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.conFavor}</span>
              <span className="fact-stat-label">Con Saldo a Favor</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <TrendingDown size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.conDeuda}</span>
              <span className="fact-stat-label">Con Deuda</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <Clock size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{stats.enMora}</span>
              <span className="fact-stat-label">En Mora</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <DollarSign size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalFavor)}</span>
              <span className="fact-stat-label">Total a Favor</span>
            </div>
          </div>
          <div className="fact-stat-card">
            <AlertTriangle size={18} className="fact-stat-icon" />
            <div className="fact-stat-content">
              <span className="fact-stat-value">{formatCurrency(stats.totalDeuda)}</span>
              <span className="fact-stat-label">Total Deuda</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <DataTable
        data={saldosFiltrados}
        columns={columns}
        loading={loading}
        searchPlaceholder="Buscar conductor..."
        emptyIcon={<Wallet size={48} />}
        emptyTitle="Sin saldos"
        emptyDescription="No hay saldos registrados"
        pageSize={20}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  )
}
