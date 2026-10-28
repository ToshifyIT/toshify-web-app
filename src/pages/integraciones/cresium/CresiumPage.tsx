// src/pages/integraciones/cresium/CresiumPage.tsx
// Integraciones > Cresium: movimientos de 44 Dreams y Grupo CG y su carga en Alegra
import { CresiumModule } from '../../../modules/integraciones/cresium/CresiumModule'

export function Cresium44DreamsPage() {
  return <CresiumModule key="44dreams" empresa="44dreams" />
}

export function CresiumGrupoCgPage() {
  return <CresiumModule key="grupocg" empresa="grupocg" />
}
