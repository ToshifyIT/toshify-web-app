import { ConceptosFacturacionTab } from '../../modules/facturacion/tabs/ConceptosFacturacionTab'
import '../../modules/facturacion/FacturacionModule.css'
import '../../styles/modules.css'

export function ConceptosFacturacionPage() {
  // Mismo fondo blanco que el resto de Parámetros, hasta abajo de la página
  return (
    <div className="module-container" style={{ minHeight: '100%', boxSizing: 'border-box' }}>
      <ConceptosFacturacionTab />
    </div>
  )
}
