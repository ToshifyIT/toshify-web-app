// src/modules/onboarding/programacion-v2/documentoTarifa.ts
//
// Documento según la tarifa del conductor.
//
// Con la tarifa nueva (OCT-26) hay UNA sola plantilla: "Anexo" y "Carta oferta"
// generan el mismo documento (ver resolveTemplateKey en server.js). Por eso con
// esa tarifa solo existen Carta oferta o N/A, y un "Anexo" se trata como Carta
// oferta. Con la tarifa anterior no cambia nada: siguen las dos plantillas.

/** true si la tarifa admite elegir "Anexo" (solo la tarifa anterior). */
export function permiteAnexo(tarifa: string | null | undefined): boolean {
  return tarifa !== 'nueva'
}

/** Con tarifa nueva, "anexo" pasa a "carta_oferta". Cualquier otro valor queda igual. */
export function documentoSegunTarifa<D extends string | null | undefined>(
  doc: D,
  tarifa: string | null | undefined
): D | 'carta_oferta' {
  return tarifa === 'nueva' && doc === 'anexo' ? 'carta_oferta' : doc
}
