// src/modules/leads/motivoDescarte.ts
// Al pasar un lead a "Descartado" el motivo es obligatorio (pedido 2026-11-02).
// Se guarda en leads.causal_de_cierre (la misma columna que usa la carga de Sellium
// y el Excel) y además queda como nota en la bitácora de Observaciones.
import Swal from 'sweetalert2'

export const ESTADO_DESCARTADO = 'Descartado'

/** Motivos frecuentes para elegir rápido (se puede escribir otro). */
const MOTIVOS = [
  'No cumple la edad',
  'No tiene licencia / licencia vencida',
  'Zona fuera de cobertura',
  'No responde',
  'No le interesa',
  'Antecedentes',
  'Ya trabaja con otra empresa',
]

/**
 * Pide el motivo de descarte. Devuelve el motivo, o null si se canceló
 * (en ese caso el lead NO debe pasar a Descartado).
 */
export async function pedirMotivoDescarte(nombre?: string | null): Promise<string | null> {
  const opciones = MOTIVOS.map(m => `<option value="${m}">`).join('')
  const res = await Swal.fire({
    title: 'Motivo de descarte',
    html: `
      <div style="text-align:left;font-size:13px;">
        ${nombre ? `<p style="margin:0 0 10px;color:#6b7280;">Lead: <b style="color:#111827;">${nombre.replace(/</g, '&lt;')}</b></p>` : ''}
        <label for="motivo-descarte" style="display:block;font-weight:600;margin-bottom:6px;">¿Por qué se descarta? <span style="color:#dc2626">*</span></label>
        <input id="motivo-descarte" class="swal2-input" list="motivos-descarte" placeholder="Elegí o escribí el motivo"
          style="margin:0;width:100%;box-sizing:border-box;font-size:14px;" />
        <datalist id="motivos-descarte">${opciones}</datalist>
      </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Descartar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#dc2626',
    didOpen: () => (document.getElementById('motivo-descarte') as HTMLInputElement | null)?.focus(),
    preConfirm: () => {
      const v = ((document.getElementById('motivo-descarte') as HTMLInputElement | null)?.value || '').trim()
      if (v.length < 3) {
        Swal.showValidationMessage('El motivo es obligatorio')
        return false
      }
      return v
    },
  })
  return res.isConfirmed && typeof res.value === 'string' ? res.value : null
}

/** Línea de bitácora para Observaciones: "[02/11/2026 16:50 · Usuario] Descartado: motivo" */
export function lineaDescarte(motivo: string, usuario?: string | null): string {
  const ahora = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '')
  return `[${ahora} · ${usuario || 'Usuario'}] Descartado: ${motivo}`
}
