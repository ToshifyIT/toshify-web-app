// src/pages/integraciones/alegra/AlegraComprasPage.tsx
// Integraciones > Alegra: Excel de ARCA (comprobantes recibidos) -> Alegra, por empresa
import { AlegraComprasModule } from '../../../modules/integraciones/alegra/AlegraComprasModule'

export function AlegraCompras44DreamsPage() {
  return <AlegraComprasModule key="44dreams" empresa="44dreams" />
}

export function AlegraComprasGrupoCgPage() {
  return <AlegraComprasModule key="grupocg" empresa="grupocg" />
}

export { AlegraProveedoresModule as AlegraProveedoresPage } from '../../../modules/integraciones/alegra/AlegraProveedoresModule'
