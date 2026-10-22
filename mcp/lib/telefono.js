/**
 * Celular argentino en el formato en que se guarda: +549 + area + numero.
 *
 * Copia de normalizarCelularAR (src/utils/validacionesCampos.ts) y de la funcion
 * normalizar_celular_ar de la base (sql/normalizar_telefono_leads.sql): la API
 * corre aparte del frontend y no puede importarlo. Si se cambia la regla, cambiarla
 * en los tres lugares.
 *
 * Primero Argentina: si los digitos encajan como area + numero argentino
 * (10 digitos que empiezan con 11, 2 o 3) devuelve +549...; si no, y vino con
 * codigo internacional, lo respeta como numero de otro pais. Si no, null.
 */

const LARGO_NACIONAL_AR = 10;

function quitar15(d) {
  if (/^[23]\d{3}15\d+/.test(d)) return d.slice(0, 4) + d.slice(6);
  if (/^[23]\d{2}15\d+/.test(d)) return d.slice(0, 3) + d.slice(5);
  if (/^1115\d+/.test(d)) return '11' + d.slice(4);
  return d;
}

function nacionalAR(digitos) {
  let d = digitos;
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('054') && d.length >= 12) d = d.slice(1);
  if (d.startsWith('54') && d.length >= 12) d = d.slice(2);
  if (d.startsWith('9') && d.length === LARGO_NACIONAL_AR + 1) d = d.slice(1);
  if (d.startsWith('0')) d = d.slice(1);
  if (d.length === LARGO_NACIONAL_AR + 2 && d.startsWith('1111')) d = d.slice(2);
  if (d.length === LARGO_NACIONAL_AR + 2) d = quitar15(d);
  return d.length === LARGO_NACIONAL_AR && /^(11|[23])/.test(d) ? d : null;
}

export function normalizarCelularAR(valor) {
  const v = String(valor || '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '').trim();
  if (!v || /[^\d+()\-.\s]/.test(v)) return null;

  const d = v.replace(/\D/g, '');
  const nacional = nacionalAR(d);
  if (nacional) return `+549${nacional}`;

  const internacional = v.startsWith('+') || d.startsWith('00');
  const sinPrefijo = d.startsWith('00') ? d.slice(2) : d;
  if (internacional && !sinPrefijo.startsWith('54') && !sinPrefijo.startsWith('0')) {
    return sinPrefijo.length >= 8 && sinPrefijo.length <= 15 ? `+${sinPrefijo}` : null;
  }
  return null;
}
