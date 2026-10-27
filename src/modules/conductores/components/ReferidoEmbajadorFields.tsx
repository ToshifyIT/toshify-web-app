// src/modules/conductores/components/ReferidoEmbajadorFields.tsx
// Campos Referido (Sí/No) y Embajador del formulario de conductor (alta y edición).
// Embajador se habilita y pasa a ser obligatorio solo con Referido = Sí.

import { ConductorAutocomplete } from '../../../components/ui/ConductorAutocomplete'
import { useConductoresEmbajador } from '../../../hooks/useConductoresEmbajador'

interface ReferidoEmbajadorFieldsProps {
  referido: boolean | null
  embajadorId: string
  onChange: (referido: boolean | null, embajadorId: string) => void
  /** El conductor que se edita no puede ser su propio embajador. */
  conductorId?: string | null
  disabled?: boolean
  error?: string
}

export function ReferidoEmbajadorFields({
  referido, embajadorId, onChange, conductorId, disabled = false, error,
}: ReferidoEmbajadorFieldsProps) {
  const { opciones, loading } = useConductoresEmbajador(conductorId)

  return (
    <div className="form-row">
      <div className="form-group">
        <label className="form-label">Referido</label>
        <select
          className="form-input"
          value={referido === true ? 'Si' : referido === false ? 'No' : ''}
          onChange={(e) => {
            const v = e.target.value
            const nuevo = v === 'Si' ? true : v === 'No' ? false : null
            // Sin referido no hay embajador
            onChange(nuevo, nuevo ? embajadorId : '')
          }}
          disabled={disabled}
        >
          <option value="">Seleccionar</option>
          <option value="Si">Si</option>
          <option value="No">No</option>
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Embajador {referido === true && '*'}</label>
        <ConductorAutocomplete
          inputClassName="form-input"
          value={embajadorId}
          onChange={(v) => onChange(referido, v)}
          options={opciones}
          placeholder={
            referido !== true
              ? 'Solo si es referido'
              : loading ? 'Cargando conductores...' : 'Escribí nombre o DNI...'
          }
          disabled={disabled || referido !== true}
          hasError={!!error}
        />
        {error && <span className="error-message">{error}</span>}
      </div>
    </div>
  )
}
