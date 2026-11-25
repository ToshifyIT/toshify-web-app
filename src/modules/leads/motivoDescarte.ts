// src/modules/leads/motivoDescarte.ts
// Al pasar un lead a "Descartado" el motivo es obligatorio (pedido 2026-11-02).
// Desde 2026-11-25 el motivo es una categoría de una lista fija y se guarda en
// leads.motivo_descarte (para poder contarlo). La nota opcional queda como línea
// de bitácora en Observaciones. causal_de_cierre sigue guardando la causal tal
// como viene de Sellium.
import { Alerta } from '../../components/ui/alertas'

export const ESTADO_DESCARTADO = 'Descartado'

export const MOTIVO_OTRO = 'Otro / sin detalle'

/** Categorías de descarte. El mismo texto usa sql/leads_motivo_descarte.sql. */
export const MOTIVOS_DESCARTE = [
  'Zona fuera de cobertura',
  'Precio del alquiler',
  'Desacuerdo con la oferta',
  'Licencia insuficiente',
  'Con deuda',
  'Antecedentes',
  'Perfil no apto',
  'No cumple la edad',
  'No responde / no se presentó',
  'Ya trabaja / no le interesa',
  'A cargo',
  'Auto propio',
  'Vehículo no aceptado',
  'Duplicado / datos erróneos',
  MOTIVO_OTRO,
] as const

/** Causal de cierre de Sellium → categoría de descarte. */
export function motivoDesdeCausalSellium(causal: string | null | undefined): string {
  const t = (causal || '').trim().toLowerCase()
  if (!t) return MOTIVO_OTRO
  if (t.includes('sin cobertura')) return 'Zona fuera de cobertura'
  if (t.includes('precio') || t === 'price') return 'Precio del alquiler'
  if (t.includes('desacuerdo') || t === 'disagreement') return 'Desacuerdo con la oferta'
  if (t.includes('modelo no aceptado') || t.includes('fuera de rango')) return 'Vehículo no aceptado'
  return MOTIVO_OTRO
}

export interface MotivoDescarte {
  motivo: string
  nota: string
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/**
 * Pide la categoría de descarte y una nota opcional. Devuelve null si se canceló
 * (en ese caso el lead NO debe pasar a Descartado). Con "Otro" la nota es obligatoria.
 */
export async function pedirMotivoDescarte(nombre?: string | null): Promise<MotivoDescarte | null> {
  const opciones = MOTIVOS_DESCARTE.map(m => `<option value="${escapar(m)}">${escapar(m)}</option>`).join('')
  const estiloCampo = 'margin:0;width:100%;box-sizing:border-box;font-size:14px;'
  const res = await Alerta.fire({
    title: 'Motivo de descarte',
    html: `
      <div style="text-align:left;font-size:13px;">
        ${nombre ? `<p style="margin:0 0 10px;color:#6b7280;">Lead: <b style="color:#111827;">${escapar(nombre)}</b></p>` : ''}
        <label for="motivo-descarte" style="display:block;font-weight:600;margin-bottom:6px;">¿Por qué se descarta? <span style="color:#dc2626">*</span></label>
        <select id="motivo-descarte" class="swal2-select" style="${estiloCampo}display:block;">
          <option value="">Elegí un motivo</option>${opciones}
        </select>
        <label for="nota-descarte" style="display:block;font-weight:600;margin:14px 0 6px;">Nota <span id="nota-descarte-req" style="font-weight:400;color:#6b7280;">(opcional)</span></label>
        <textarea id="nota-descarte" class="swal2-textarea" rows="3" placeholder="Detalle para la bitácora de Observaciones"
          style="${estiloCampo}"></textarea>
      </div>`,
    focusConfirm: false,
    showCancelButton: true,
    confirmButtonText: 'Descartar',
    cancelButtonText: 'Cancelar',
    confirmButtonColor: '#dc2626',
    didOpen: () => {
      const sel = document.getElementById('motivo-descarte') as HTMLSelectElement | null
      const req = document.getElementById('nota-descarte-req')
      sel?.focus()
      sel?.addEventListener('change', () => {
        if (!req) return
        const esOtro = sel.value === MOTIVO_OTRO
        req.textContent = esOtro ? '*' : '(opcional)'
        req.style.color = esOtro ? '#dc2626' : '#6b7280'
      })
    },
    preConfirm: () => {
      const motivo = (document.getElementById('motivo-descarte') as HTMLSelectElement | null)?.value || ''
      const nota = ((document.getElementById('nota-descarte') as HTMLTextAreaElement | null)?.value || '').trim()
      if (!motivo) {
        Alerta.showValidationMessage('Elegí el motivo')
        return false
      }
      if (motivo === MOTIVO_OTRO && nota.length < 3) {
        Alerta.showValidationMessage('Con "Otro" contá el motivo en la nota')
        return false
      }
      return { motivo, nota }
    },
  })
  return res.isConfirmed && res.value ? (res.value as MotivoDescarte) : null
}

/** Texto de la nota de bitácora: "Descartado: motivo. nota" */
export function textoDescarte({ motivo, nota }: MotivoDescarte): string {
  return nota ? `Descartado: ${motivo}. ${nota}` : `Descartado: ${motivo}`
}

/** Línea de bitácora para Observaciones: "[02/11/2026 16:50 · Usuario] Descartado: motivo. nota" */
export function lineaDescarte(m: MotivoDescarte, usuario?: string | null): string {
  const ahora = new Date().toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '')
  return `[${ahora} · ${usuario || 'Usuario'}] ${textoDescarte(m)}`
}
