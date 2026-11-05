// src/modules/facturacion/utils/tipoFactura.ts
// Tipo de factura del conductor (2026-11-05): factura A solo si tiene monotributo
// (conductores.monotributo) y un CUIT de 11 dígitos. Sin monotributo, o con el
// CUIT incompleto, factura B a Consumidor Final con DNI.

export function esFacturaA(cuit: string | null | undefined, monotributo: boolean | null | undefined): boolean {
  return monotributo === true && (cuit || '').replace(/\D/g, '').length >= 11
}
