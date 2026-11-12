// src/modules/siniestros/components/MontoPesos.tsx
// Campo de monto en pesos argentinos: muestra "$ 1.500.000,50" y acepta hasta 2
// decimales. Mientras se escribe queda el texto tal cual; al salir se formatea.
import { useEffect, useState } from 'react'
import { leerPesos, mostrarPesos } from './pesos'

interface MontoPesosProps {
  valor: number | null | undefined
  onChange: (valor: number | undefined) => void
  disabled?: boolean
  title?: string
  className?: string
}

export function MontoPesos({ valor, onChange, disabled, title, className }: MontoPesosProps) {
  const [texto, setTexto] = useState(mostrarPesos(valor))
  const [editando, setEditando] = useState(false)

  // Si el monto cambia desde afuera (otro siniestro, un pago registrado), se muestra
  useEffect(() => {
    if (!editando) setTexto(mostrarPesos(valor))
  }, [valor, editando])

  return (
    <input
      type="text"
      className={className}
      inputMode="decimal"
      value={texto}
      // Formato argentino: punto de miles, coma decimal
      placeholder="Ej: 1.500.000,50"
      title={title}
      disabled={disabled}
      onFocus={() => setEditando(true)}
      onChange={(e) => {
        setTexto(e.target.value)
        onChange(leerPesos(e.target.value) ?? undefined)
      }}
      onBlur={() => {
        setEditando(false)
        setTexto(mostrarPesos(leerPesos(texto)))
      }}
    />
  )
}
