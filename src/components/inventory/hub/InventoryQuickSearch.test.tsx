import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { InventoryQuickSearch } from './InventoryQuickSearch'

const state = vi.hoisted(() => ({
  data: [] as { id: string; name: string; code: string; quantity_in_stock: number; reorder_point: number }[],
  fetching: false, error: false, navigate: vi.fn(), refetch: vi.fn(),
}))
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useNavigate: () => state.navigate }))
vi.mock('@/hooks/useTenant', () => ({ useTenant: () => ({ tenant: { id: 'tenant-A' } }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: 'hotel-A' }, isAllHotelsMode: false }) }))
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.data, isFetching: state.fetching, isError: state.error, refetch: state.refetch }) }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }))

beforeEach(() => { vi.clearAllMocks(); state.data = []; state.fetching = state.error = false })
afterEach(cleanup)
const open = () => render(<MemoryRouter><InventoryQuickSearch /></MemoryRouter>)
const search = async (value: string) => {
  const input = screen.getByRole('combobox', { name: 'Tìm mặt hàng theo tên hoặc mã' })
  fireEvent.change(input, { target: { value } })
  await waitFor(() => expect(input).toHaveAttribute('aria-expanded', 'true'))
  await waitFor(() => expect(screen.queryByText('Đang tìm mặt hàng…')).not.toBeInTheDocument())
  return input
}

describe('inventory quick search', () => {
  it('opens an exact item with keyboard and exposes a named result list', async () => {
    state.data = [{ id: 'item-A', name: 'Khăn tắm', code: 'KT', quantity_in_stock: 10, reorder_point: 3 }]
    open()
    const input = await search('Khăn')
    expect(screen.getByRole('listbox', { name: 'Kết quả tìm mặt hàng' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.navigate).toHaveBeenCalledWith('/items/item-A')
  })

  it('does not open a stale result while the next search is loading', () => {
    state.data = [{ id: 'old-item', name: 'Cũ', code: 'OLD', quantity_in_stock: 1, reorder_point: 3 }]
    open()
    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'Mới' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.navigate).not.toHaveBeenCalled()
  })

  it('distinguishes a failed search from no matches and offers retry', async () => {
    state.error = true
    open()
    const input = await search('Khăn')
    expect(screen.getByRole('alert')).toHaveTextContent('Không tìm được mặt hàng.')
    expect(screen.queryByText(/Không tìm thấy mặt hàng khớp/)).not.toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.navigate).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it('can search the full item list when no quick result matches', async () => {
    open()
    const input = await search('Khăn')
    expect(screen.getByText(/Không tìm thấy mặt hàng khớp/)).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(state.navigate).toHaveBeenCalledWith('/items?search=Kh%C4%83n')
  })
})
