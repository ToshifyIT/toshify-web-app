import { useParams } from 'react-router-dom'
import { GuiasModule } from '../modules/guias/GuiasModule'

export function GuiasPage() {
  const { id } = useParams()
  return (
    <div className="page-container">
      <div className="page-content">
        <GuiasModule key={id || 'default'} />
      </div>
    </div>
  )
}
