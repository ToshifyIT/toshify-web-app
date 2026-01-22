import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { DataTable } from './DataTable'
import { ColumnDef } from '@tanstack/react-table'

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

interface TestData {
  id: number
  name: string
  amount: number
  date: string
}

const data: TestData[] = [
  { id: 1, name: 'Item A', amount: 100, date: '01/01/2023' },
  { id: 2, name: 'Item B', amount: 200, date: '02/01/2023' },
  { id: 3, name: 'Item C', amount: 300, date: '03/01/2023' },
  { id: 4, name: 'Item A', amount: 150, date: '04/01/2023' },
]

const columns: ColumnDef<TestData>[] = [
  { accessorKey: 'name', header: 'Nombre' },
  { accessorKey: 'amount', header: 'Monto Total' }, // "Total" triggers numeric filter
  { accessorKey: 'date', header: 'Fecha Creación' }, // "Fecha" triggers date filter
]

describe('DataTable Filters', () => {
  it('renders all data initially', () => {
    render(<DataTable data={data} columns={columns} />)
    expect(screen.getAllByRole('row')).toHaveLength(5) // Header + 4 rows
  })

  it('filters by text (Excel filter)', async () => {
    render(<DataTable data={data} columns={columns} />)
    
    // Open Name filter
    const filterBtns = screen.getAllByRole('button', { name: /filtrar por/i })
    fireEvent.click(filterBtns[0]) // First one is Name
    
    // Select 'Item A'
    const checkbox = screen.getByLabelText('Item A')
    fireEvent.click(checkbox)
    
    // Should show 2 rows with Item A
    // Header + 2 rows = 3 rows
    expect(screen.getAllByRole('row')).toHaveLength(3)
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Item A')
    expect(rows[2]).toHaveTextContent('Item A')
  })

  it('filters by number range', async () => {
    render(<DataTable data={data} columns={columns} />)
    
    // Open Amount filter
    const filterBtns = screen.getAllByRole('button', { name: /filtrar por/i })
    fireEvent.click(filterBtns[1]) // Second is Amount
    
    // Enter min 150
    const minInput = screen.getByPlaceholderText('0')
    fireEvent.change(minInput, { target: { value: '150' } })
    
    // Should show rows with amount >= 150 (Item B: 200, Item C: 300, Item A: 150)
    // Header + 3 rows = 4 rows
    expect(screen.getAllByRole('row')).toHaveLength(4)
    
    // Enter max 250
    const maxInput = screen.getByPlaceholderText('Max')
    fireEvent.change(maxInput, { target: { value: '250' } })
    
    // Should show rows with 150 <= amount <= 250 (Item B: 200, Item A: 150)
    // Header + 2 rows = 3 rows
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('filters by date range', async () => {
    render(<DataTable data={data} columns={columns} />)
    
    // Open Date filter
    const filterBtns = screen.getAllByRole('button', { name: /filtrar por/i })
    fireEvent.click(filterBtns[2]) // Third is Date
    
    // Enter range 02/01/2023 - 03/01/2023
    const inputs = screen.getAllByPlaceholderText('dd/mm/aaaa')
    fireEvent.change(inputs[0], { target: { value: '02/01/2023' } })
    fireEvent.change(inputs[1], { target: { value: '03/01/2023' } })
    
    // Should show Item B and Item C
    // Header + 2 rows = 3 rows
    expect(screen.getAllByRole('row')).toHaveLength(3)
  })

  it('combines filters correctly', async () => {
    render(<DataTable data={data} columns={columns} />)
    
    // 1. Filter Name = Item A (Rows 1 and 4)
    const filterBtns = screen.getAllByRole('button', { name: /filtrar por/i })
    fireEvent.click(filterBtns[0])
    fireEvent.click(screen.getByLabelText('Item A'))
    fireEvent.click(filterBtns[0]) // Close
    
    // 2. Filter Amount > 120 (Row 4 only, since Row 1 is 100)
    fireEvent.click(filterBtns[1])
    const minInput = screen.getByPlaceholderText('0')
    fireEvent.change(minInput, { target: { value: '120' } })
    
    // Should show only Item A with amount 150
    // Header + 1 row = 2 rows
    expect(screen.getAllByRole('row')).toHaveLength(2)
    const rows = screen.getAllByRole('row')
    expect(rows[1]).toHaveTextContent('Item A')
    expect(rows[1]).toHaveTextContent('150')
  })
})
