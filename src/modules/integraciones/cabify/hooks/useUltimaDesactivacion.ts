// src/modules/integraciones/cabify/hooks/useUltimaDesactivacion.ts
/**
 * Ultima desactivacion de efectivo por conductor.
 *
 * Fuente: tabla `cabify_efectivo_log`, que escriben dos procesos distintos:
 *  - el RPA py-cabify-efectivo (sabados 06:00 AR, automatico)
 *  - el boton manual de Facturacion > Reporte (/api/cabify-efectivo)
 * Ambos guardan accion='desactivacion' y resultado='ok' cuando el cambio se aplico.
 *
 * Devuelve la fecha del ULTIMO intento exitoso, sin importar si despues se reactivo:
 * la columna responde "cuando fue la ultima vez que se le saco el efectivo".
 */

import { useState, useEffect } from 'react'
import { supabase } from '../../../../lib/supabase'
import { normalizeDni } from '../../../../utils/normalizeDocuments'

/**
 * Nombres posibles de la columna de fecha. El esquema de cabify_efectivo_log no
 * esta versionado en el repo y ninguno de los dos procesos que escriben manda la
 * fecha (la pone el default de la tabla), asi que se detecta en runtime en vez de
 * asumir un nombre.
 */
const CAMPOS_FECHA = ['created_at', 'fecha', 'fecha_registro', 'registrado_en', 'fecha_creacion'] as const

let avisoEsquemaEmitido = false

function extraerFecha(row: Record<string, unknown>): string | null {
  for (const campo of CAMPOS_FECHA) {
    const valor = row[campo]
    if (typeof valor === 'string' && valor) return valor
  }
  if (!avisoEsquemaEmitido) {
    avisoEsquemaEmitido = true
    console.warn(
      '[cabify] No se encontro columna de fecha en cabify_efectivo_log. ' +
      `Columnas disponibles: ${Object.keys(row).join(', ')}. ` +
      'Agregar el nombre correcto a CAMPOS_FECHA en useUltimaDesactivacion.ts'
    )
  }
  return null
}

/**
 * @param dnis DNIs de los conductores visibles, tal como vienen de Cabify.
 * @returns Map dni normalizado -> fecha ISO de la ultima desactivacion aplicada.
 */
export function useUltimaDesactivacion(dnis: readonly string[]): Map<string, string> {
  const [fechas, setFechas] = useState<Map<string, string>>(new Map())

  // Clave estable: evita relanzar la consulta cuando el array se recrea con los
  // mismos DNIs en cada render.
  const clave = dnis.filter(Boolean).sort().join(',')

  useEffect(() => {
    let cancelado = false

    async function cargar() {
      const lista = clave ? clave.split(',') : []
      if (lista.length === 0) {
        setFechas(new Map())
        return
      }

      // Se envian la forma cruda y la normalizada porque el log lo escriben dos
      // procesos distintos y no hay garantia de que usen el mismo formato de DNI.
      const variantes = Array.from(
        new Set(lista.flatMap((dni) => [dni, normalizeDni(dni)]).filter(Boolean))
      )

      const { data, error } = await supabase
        .from('cabify_efectivo_log')
        .select('*')
        .eq('accion', 'desactivacion')
        .eq('resultado', 'ok')
        .in('conductor_dni', variantes)

      if (cancelado) return

      if (error) {
        console.warn('[cabify] No se pudo leer cabify_efectivo_log:', error.message)
        setFechas(new Map())
        return
      }

      const mapa = new Map<string, string>()
      for (const row of (data || []) as Record<string, unknown>[]) {
        const dni = normalizeDni(row.conductor_dni as string)
        const fecha = extraerFecha(row)
        if (!dni || !fecha) continue

        const previa = mapa.get(dni)
        if (!previa || fecha > previa) mapa.set(dni, fecha)
      }

      setFechas(mapa)
    }

    cargar()
    return () => { cancelado = true }
  }, [clave])

  return fechas
}
