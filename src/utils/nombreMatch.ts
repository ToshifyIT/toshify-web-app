// src/utils/nombreMatch.ts
/**
 * Ayuda para cruzar nombres contra columnas de texto libre de la base
 * (tipicamente multas_historico.conductor_responsable, que se carga a mano).
 *
 * EL PROBLEMA
 * En el cliente los nombres se normalizan sacando los acentos para poder
 * compararlos por token:
 *     "CARREÑO".normalize('NFD').replace(/[̀-ͯ]/g,'')  ->  "CARRENO"
 * Pero en la base el nombre SI tiene la ñ, y `ILIKE` de Postgres ignora
 * mayusculas pero NO acentos. Entonces `'%CARRENO%'` nunca matchea `'CARREÑO'`:
 * la query vuelve vacia y el filtro fino del cliente ni siquiera se ejecuta.
 * Afecta a PEÑA, MUÑOZ, NUÑEZ, IBAÑEZ, GARCIA, RODRIGUEZ y cualquier apellido
 * con tilde o ñ.
 */

/** Caracteres que en castellano pueden aparecer acentuados (á é í ó ú ü ñ). */
const ACENTUABLES = /[AEIOUN]/g

/**
 * Convierte un token YA normalizado (sin acentos, mayusculas) en un patron
 * `ILIKE` que matchea tanto la forma acentuada como la que no.
 *
 * Cada caracter acentuable se reemplaza por `_`, el comodin de un caracter de
 * LIKE. Como `_` tambien matchea el caracter original, el patron devuelve
 * siempre un SUPERCONJUNTO de lo que devolvia el token literal: usarlo no puede
 * hacer desaparecer ninguna fila que hoy se este mostrando.
 *
 *     patronIlikeSinAcentos('CARRENO')   -> 'C_RR___'   (matchea CARRENO y CARREÑO)
 *     patronIlikeSinAcentos('RODRIGUEZ') -> 'R_DR_G__Z' (matchea RODRIGUEZ y RODRÍGUEZ)
 *     patronIlikeSinAcentos('PENA')      -> null        (quedaria 'P___': no filtra nada util)
 *
 * Devuelve null cuando el patron tendria menos de `minAnclas` caracteres fijos.
 * En ese caso conviene NO prefiltrar y dejar que decida el filtro fino del
 * cliente: es preferible traer de mas que traer de menos.
 *
 * Esto es solo una optimizacion de transferencia. Quien decide a que conductor
 * pertenece cada fila sigue siendo el matcher por tokens del lado del cliente.
 */
export function patronIlikeSinAcentos(token: string | null | undefined, minAnclas = 2): string | null {
  const t = (token || '').trim()
  if (!t) return null
  const patron = t.replace(ACENTUABLES, '_')
  const anclas = patron.length - (patron.match(/_/g)?.length ?? 0)
  return anclas >= minAnclas ? patron : null
}
