// src/modules/integraciones/alegra/proveedorForm.ts
// Pop-up para crear o editar un proveedor de Alegra (se usa en Comprobantes y en Proveedores).
import Swal from 'sweetalert2'
import { ETIQUETA_IVA } from '../../../services/alegraComprasService'
import type { CondicionIvaAlegra, ProveedorAlegra } from '../../../services/alegraComprasService'

const PROVINCIAS = [
  'Buenos Aires', 'Ciudad Autónoma de Buenos Aires', 'Catamarca', 'Chaco', 'Chubut', 'Córdoba', 'Corrientes',
  'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Mendoza', 'Misiones', 'Neuquén', 'Río Negro', 'Salta',
  'San Juan', 'San Luis', 'Santa Cruz', 'Santa Fe', 'Santiago del Estero', 'Tierra del Fuego', 'Tucumán',
]

const esc = (t: string | number | null | undefined) =>
  String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** "[POR CONFIRMAR]" se muestra vacío para que se complete */
const limpio = (t: string | null | undefined) => (t && !/por confirmar/i.test(t) ? t : '')

/**
 * Abre el formulario. Devuelve los datos o null si se cancela.
 * completo = false muestra solo lo mínimo para crearlo en Alegra.
 */
export async function abrirFormularioProveedor(
  inicial: ProveedorAlegra,
  { titulo, completo = true, confirmar = 'Guardar en Alegra' }: { titulo: string; completo?: boolean; confirmar?: string },
): Promise<ProveedorAlegra | null> {
  const iva = inicial.iva_condicion ?? 'IVA_RESPONSABLE'
  const campo = (id: string, label: string, valor: string | number | null | undefined, extra = '') =>
    `<label>${label}<input id="pf-${id}" class="swal2-input" value="${esc(valor)}" ${extra} /></label>`
  const r = await Swal.fire({
    title: titulo,
    width: 640,
    html: `
      <div class="cr-swal cr-form ap-form">
        ${campo('nombre', 'Razón social *', inicial.nombre)}
        <div class="ap-form-fila">
          ${campo('cuit', 'CUIT *', inicial.cuit, inicial.alegra_id ? 'disabled' : 'inputmode="numeric" maxlength="13"')}
          <label>Condición de IVA *
            <select id="pf-iva" class="swal2-select">
              ${(Object.keys(ETIQUETA_IVA) as CondicionIvaAlegra[])
                .map((k) => `<option value="${k}" ${k === iva ? 'selected' : ''}>${ETIQUETA_IVA[k]}</option>`).join('')}
            </select>
          </label>
        </div>
        <div class="ap-form-fila">
          ${campo('email', 'Email (opcional)', inicial.email, 'type="email"')}
          ${campo('telefono', 'Teléfono (opcional)', inicial.telefono)}
        </div>
        <div class="ap-form-fila">
          <label>Provincia
            <input id="pf-provincia" class="swal2-input" list="pf-provincias" value="${esc(limpio(inicial.provincia) || 'Buenos Aires')}" />
            <datalist id="pf-provincias">${PROVINCIAS.map((p) => `<option value="${esc(p)}"></option>`).join('')}</datalist>
          </label>
          ${campo('ciudad', 'Ciudad (opcional)', limpio(inicial.ciudad))}
        </div>
        ${campo('domicilio', 'Domicilio (opcional)', limpio(inicial.domicilio), 'placeholder="Calle y número · si se deja vacío queda [POR CONFIRMAR]"')}
        ${completo ? `<div class="ap-form-fila">
          ${campo('celular', 'Celular', inicial.celular)}
          ${campo('cp', 'Código postal', inicial.codigo_postal)}
        </div>
        <div class="ap-form-fila">
          ${campo('comercial', 'Nombre comercial', inicial.nombre_comercial)}
          ${campo('dias', 'Días de pago', inicial.dias_pago, 'type="number" min="0"')}
        </div>
        <label>Observaciones<textarea id="pf-obs" class="swal2-textarea">${esc(inicial.observaciones)}</textarea></label>`
          : '<p class="cr-muted">Argentina. Lo que no se complete queda «[POR CONFIRMAR]» y se puede editar después en Proveedores.</p>'}
        <p class="cr-muted">* Obligatorio. Se guarda en Alegra.</p>
      </div>`,
    showCancelButton: true,
    confirmButtonText: confirmar,
    cancelButtonText: 'Cancelar',
    focusConfirm: false,
    preConfirm: () => {
      const v = (id: string) => (document.getElementById(`pf-${id}`) as HTMLInputElement | null)?.value.trim() ?? ''
      const datos: ProveedorAlegra = {
        ...inicial,
        nombre: v('nombre'),
        cuit: v('cuit').replace(/\D/g, ''),
        iva_condicion: v('iva') as CondicionIvaAlegra,
        email: v('email') || null,
        telefono: v('telefono') || null,
        provincia: v('provincia') || null,
        ciudad: v('ciudad') || null,
        domicilio: v('domicilio') || null,
        ...(completo ? {
          celular: v('celular') || null,
          codigo_postal: v('cp') || null,
          nombre_comercial: v('comercial') || null,
          dias_pago: v('dias') === '' ? null : Number(v('dias')),
          observaciones: (document.getElementById('pf-obs') as HTMLTextAreaElement | null)?.value.trim() || null,
        } : {}),
      }
      if (datos.nombre.length < 2) { Swal.showValidationMessage("Falta la razón social"); return false }
      if (datos.cuit.length !== 11) { Swal.showValidationMessage("El CUIT debe tener 11 dígitos"); return false }
      if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) { Swal.showValidationMessage("El email no es válido"); return false }
      return datos
    },
  })
  return r.isConfirmed && r.value ? (r.value as ProveedorAlegra) : null
}

/** Datos con faltantes: domicilio provisorio, sin email ni teléfono */
export function datosIncompletos(p: ProveedorAlegra): string[] {
  const faltan: string[] = []
  if (!limpio(p.domicilio) || !limpio(p.ciudad)) faltan.push('domicilio')
  if (!p.email) faltan.push('email')
  if (!p.telefono && !p.celular) faltan.push('teléfono')
  return faltan
}
