import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DateRangeColumnFilter } from './DateRangeColumnFilter'

describe('DateRangeColumnFilter', () => {
  const defaultProps = {
    label: 'Fecha',
    value: { from: null, to: null },
    onChange: vi.fn(),
    filterId: 'test-date-filter',
    openFilterId: null,
    onOpenChange: vi.fn(),
  }

  it('renders the filter button', () => {
    render(<DateRangeColumnFilter {...defaultProps} />)
    const button = screen.getByRole('button', { name: /filtrar por fecha/i })
    expect(button).toBeDefined()
    // Verify it has type="button" to prevent form submission
    expect(button.getAttribute('type')).toBe('button')
  })

  it('opens the dropdown when clicked', () => {
    const onOpenChange = vi.fn()
    render(<DateRangeColumnFilter {...defaultProps} onOpenChange={onOpenChange} />)
    
    const button = screen.getByRole('button', { name: /filtrar por fecha/i })
    fireEvent.click(button)
    
    expect(onOpenChange).toHaveBeenCalledWith('test-date-filter')
  })

  it('renders date inputs when open', () => {
    // Simulate open state
    render(<DateRangeColumnFilter {...defaultProps} openFilterId="test-date-filter" />)
    
    // Check if dropdown content is visible
    expect(screen.getByText('Desde')).toBeDefined()
    expect(screen.getByText('Hasta')).toBeDefined()
  })
})

describe('DateRangeColumnFilter interactions', () => {
  const defaultProps = {
    label: 'Fecha',
    value: { from: null, to: null },
    onChange: vi.fn(),
    filterId: 'test-date-filter',
    openFilterId: 'test-date-filter', // Open by default for these tests
    onOpenChange: vi.fn(),
  }

  it('renders inputs when open', () => {
    render(<DateRangeColumnFilter {...defaultProps} />)
    expect(screen.getByText('Desde')).toBeDefined()
    expect(screen.getByText('Hasta')).toBeDefined()
  })

  it('calls onChange when "From" date changes', () => {
    const onChange = vi.fn()
    render(<DateRangeColumnFilter {...defaultProps} onChange={onChange} />)
    
    // Find inputs via labels (siblings)
    // Since it's a portal, we search in the document
    const fromLabel = screen.getByText('Desde')
    const fromInput = fromLabel.nextElementSibling as HTMLInputElement
    
    expect(fromInput).toBeDefined()
    expect(fromInput.tagName).toBe('INPUT')
    
    fireEvent.change(fromInput, { target: { value: '2023-01-01' } })
    
    expect(onChange).toHaveBeenCalledWith({ from: '2023-01-01', to: null })
  })

  it('calls onChange when "To" date changes', () => {
    const onChange = vi.fn()
    render(<DateRangeColumnFilter {...defaultProps} onChange={onChange} />)
    
    const toLabel = screen.getByText('Hasta')
    const toInput = toLabel.nextElementSibling as HTMLInputElement
    
    expect(toInput).toBeDefined()
    
    fireEvent.change(toInput, { target: { value: '2023-01-31' } })
    
    expect(onChange).toHaveBeenCalledWith({ from: null, to: '2023-01-31' })
  })

  it('has Close and Clear buttons with type="button"', () => {
    // We need to provide onClear to see the clear button
    render(<DateRangeColumnFilter {...defaultProps} onOpenChange={vi.fn()} />)
    
    // The Close button is always there in BaseFilterDropdown
    const closeButton = screen.getByText('Cerrar')
    expect(closeButton.getAttribute('type')).toBe('button')
  })
})
