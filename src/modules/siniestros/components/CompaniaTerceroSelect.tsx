// src/modules/siniestros/components/CompaniaTerceroSelect.tsx
import { useState } from 'react'
import { COMPANIAS_SEGURO, SIN_SEGURO, NO_SABE, companiaDeLista } from './companiasSeguro'

const OTRA = '__otra__'

interface CompaniaTerceroSelectProps {
  value?: string
  onChange: (valor: string | undefined) => void
  disabled?: boolean
}

/**
 * Lista de compañías para el seguro del tercero, con "Otra" para escribirla a mano.
 * Si el siniestro tiene un texto viejo que coincide con una de la lista, se muestra esa.
 */
export function CompaniaTerceroSelect({ value, onChange, disabled }: CompaniaTerceroSelectProps) {
  const deLista = companiaDeLista(value)
  const [esOtra, setEsOtra] = useState(!!value?.trim() && !deLista)
  const seleccion = esOtra ? OTRA : (deLista || '')

  return (
    <>
      <select
        value={seleccion}
        onChange={(e) => {
          const v = e.target.value
          if (v === OTRA) {
            setEsOtra(true)
            onChange(deLista ? undefined : value)
          } else {
            setEsOtra(false)
            onChange(v || undefined)
          }
        }}
        disabled={disabled}
      >
        <option value="">Seleccionar compañía</option>
        <option value={SIN_SEGURO}>{SIN_SEGURO}</option>
        <option value={NO_SABE}>{NO_SABE}</option>
        <optgroup label="Compañías">
          {COMPANIAS_SEGURO.map(c => <option key={c} value={c}>{c}</option>)}
        </optgroup>
        <option value={OTRA}>Otra (escribir)</option>
      </select>
      {esOtra && (
        <input
          type="text"
          value={value || ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="Nombre de la compañía"
          disabled={disabled}
          style={{ marginTop: 6 }}
          autoFocus
        />
      )}
    </>
  )
}
