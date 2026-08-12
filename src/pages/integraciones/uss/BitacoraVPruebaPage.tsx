// src/pages/integraciones/uss/BitacoraVPruebaPage.tsx
// Version de PRUEBA de la bitacora: misma UI que /integraciones/gps/bitacora
// pero leyendo la tabla geotab_bitacora_vprueba y sin mezclar datos de USS/Wialon.
// No reemplaza al modulo real; existe solo para probar sin tocar datos productivos.
import { BitacoraModule } from '../../../modules/integraciones/uss/bitacora/BitacoraModule'

export function BitacoraVPruebaPage() {
  return (
    <BitacoraModule
      tablaGeotab="geotab_bitacora_vprueba"
      tablaGeotabHistorico="geotab_historico_vprueba"
      soloGeotab
    />
  )
}
