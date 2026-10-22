// src/modules/onboarding/validacionDocumento.ts
// Validaciones previas a generar la Carta Oferta / Anexo de una programacion.
//
// Las usan Programacion (al enviar a entrega) y Asignaciones (al volver a
// generar un documento que fallo), para que el documento no salga con datos en
// blanco ni con un importe que no se puede expresar.

import Swal from 'sweetalert2'
import { supabase } from '../../lib/supabase'
import { validarPreciosSemanales, type TarifaRequerida } from './tarifaConceptos'

/** Bariloche no tiene plantillas para turnos: ahi no se genera documento. */
export const SEDE_BARILOCHE_ID = 'f37193f7-5805-4d87-820d-c4521824860e'

/** En esta sede y modalidad no se genera documento, por diseño. */
export function esBarilocheTurno(sedeId: string | null | undefined, modalidad: string | null | undefined): boolean {
  return sedeId === SEDE_BARILOCHE_ID && modalidad === 'turno'
}

/**
 * Número de póliza válido para la plantilla OCT-26: solo dígitos (admite espacios,
 * guiones, puntos y barras). Mismo criterio que esNumeroPoliza de server.js.
 * Hay vehículos con el nombre de la aseguradora ("Sancor") cargado en este campo.
 */
export function esNumeroPoliza(valor: string): boolean {
  return /^[\d\s\-./]+$/.test(valor) && /\d/.test(valor)
}

export interface ConductorAValidar {
  id: string
  /** Etiqueta para el mensaje, ej. "Conductor Diurno". */
  label: string
}

/**
 * Verifica que el vehículo y los conductores tengan los datos que imprimen las
 * plantillas. Devuelve los faltantes ya formateados (vacío = todo OK) y si el
 * vehículo tiene GNC, que define el concepto de alquiler a usar.
 *
 * `usaTarifaNueva`: el documento usa la plantilla Toshipass (OCT-26), que
 * imprime la póliza, así que esos datos pasan a ser obligatorios.
 */
export async function validarDatosDocumento(params: {
  vehiculoId: string | null | undefined
  usaTarifaNueva: boolean
  conductores: ConductorAValidar[]
}): Promise<{ camposFaltantes: string[]; vehiculoTieneGnc: boolean }> {
  const camposFaltantes: string[] = []
  let vehiculoTieneGnc = false

  // 1) Validar vehículo
  if (params.vehiculoId) {
    const { data: veh } = await supabase
      .from('vehiculos')
      .select('numero_motor, numero_chasis, marca, modelo, anio, color, titular, cobertura, gnc, seguro_numero, seguro_vigencia')
      .eq('id', params.vehiculoId)
      .single() as { data: { numero_motor: string | null; numero_chasis: string | null; marca: string | null; modelo: string | null; anio: number | null; color: string | null; titular: string | null; cobertura: string | null; gnc: boolean | null; seguro_numero: string | null; seguro_vigencia: string | null } | null }

    if (veh) {
      vehiculoTieneGnc = veh.gnc === true
      if (!veh.numero_motor?.trim()) camposFaltantes.push('Vehículo → Número de Motor')
      if (!veh.numero_chasis?.trim()) camposFaltantes.push('Vehículo → Número de Chasis')
      if (!veh.marca?.trim()) camposFaltantes.push('Vehículo → Marca')
      if (!veh.modelo?.trim()) camposFaltantes.push('Vehículo → Modelo')
      if (!veh.anio) camposFaltantes.push('Vehículo → Año')
      if (!veh.color?.trim()) camposFaltantes.push('Vehículo → Color')
      if (!veh.titular?.trim()) camposFaltantes.push('Vehículo → Titular')
      if (!veh.cobertura?.trim()) camposFaltantes.push('Vehículo → Cobertura')
      if (params.usaTarifaNueva) {
        const poliza = (veh.seguro_numero || '').trim()
        if (!poliza) {
          camposFaltantes.push('Vehículo → Número de Póliza')
        } else if (!esNumeroPoliza(poliza)) {
          camposFaltantes.push(`Vehículo → Número de Póliza: "${poliza}" no es un número, revisarlo`)
        }
        if (!veh.seguro_vigencia) camposFaltantes.push('Vehículo → Vigencia Seguro')
      }
    }
  }

  // 2) Validar conductor(es)
  for (const { id, label } of params.conductores) {
    const { data: cond } = await supabase
      .from('conductores')
      .select('numero_dni, fecha_nacimiento, direccion, email, telefono_contacto, nacionalidad_id, estado_civil_id')
      .eq('id', id)
      .single() as { data: { numero_dni: string | null; fecha_nacimiento: string | null; direccion: string | null; email: string | null; telefono_contacto: string | null; nacionalidad_id: string | null; estado_civil_id: string | null } | null }

    if (cond) {
      if (!cond.numero_dni?.trim()) camposFaltantes.push(`${label} → DNI`)
      if (!cond.fecha_nacimiento) camposFaltantes.push(`${label} → Fecha de Nacimiento`)
      if (!cond.direccion?.trim()) camposFaltantes.push(`${label} → Dirección`)
      if (!cond.email?.trim()) camposFaltantes.push(`${label} → Email`)
      if (!cond.telefono_contacto?.trim()) camposFaltantes.push(`${label} → Teléfono`)
      if (!cond.nacionalidad_id) camposFaltantes.push(`${label} → Nacionalidad`)
      if (!cond.estado_civil_id) camposFaltantes.push(`${label} → Estado Civil`)
    }
  }

  return { camposFaltantes, vehiculoTieneGnc }
}

/** Precios semanales faltantes de los conceptos de alquiler (vacío = todo OK). */
export function validarTarifasDocumento(requeridas: TarifaRequerida[], vehiculoTieneGnc: boolean): Promise<string[]> {
  return validarPreciosSemanales(requeridas, vehiculoTieneGnc)
}

function listaFaltantes(items: string[]): string {
  return items
    .map(c => `<li style="padding: 4px 0; border-bottom: 1px solid #f3f4f6;">&#x2022; <strong>${c}</strong></li>`)
    .join('')
}

/**
 * Aviso de datos obligatorios incompletos.
 * `accion`: qué no se puede hacer, ej. "enviar la programación".
 */
export async function avisarDatosIncompletos(camposFaltantes: string[], accion: string, cierre: string): Promise<void> {
  await Swal.fire({
    title: 'Datos obligatorios incompletos',
    html: `
      <div style="text-align: left; font-size: 13px; max-height: 300px; overflow-y: auto;">
        <p style="margin-bottom: 10px; color: #6B7280;">
          No se puede ${accion} porque faltan los siguientes datos obligatorios:
        </p>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${listaFaltantes(camposFaltantes)}
        </ul>
        <p style="margin-top: 12px; color: #9CA3AF; font-size: 12px;">
          ${cierre}
        </p>
      </div>
    `,
    icon: 'warning',
    confirmButtonText: 'Entendido',
    confirmButtonColor: '#F59E0B',
    width: 480,
  })
}

/** Aviso de tarifa sin precio cargado. `accion` como en avisarDatosIncompletos. */
export async function avisarTarifasFaltantes(tarifasFaltantes: string[], accion: string, cierre: string): Promise<void> {
  await Swal.fire({
    title: 'Tarifa sin precio cargado',
    html: `
      <div style="text-align: left; font-size: 13px; max-height: 300px; overflow-y: auto;">
        <p style="margin-bottom: 10px; color: #6B7280;">
          No se puede ${accion} porque el documento no podría expresar el importe:
        </p>
        <ul style="list-style: none; padding: 0; margin: 0;">
          ${listaFaltantes(tarifasFaltantes)}
        </ul>
        <p style="margin-top: 12px; color: #9CA3AF; font-size: 12px;">
          ${cierre}
        </p>
      </div>
    `,
    icon: 'warning',
    confirmButtonText: 'Entendido',
    confirmButtonColor: '#F59E0B',
    width: 480,
  })
}
