import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { MobileMaintenanceRequestForm } from './MobileMaintenanceRequestForm'

const state = vi.hoisted(() => ({
  query: { data: undefined as typeof request | undefined, isLoading: true, isError: false, refetch: vi.fn() },
  create: vi.fn(), update: vi.fn(), allHotels: false,
}))
vi.mock('@/hooks/useMaintenanceRequests', () => ({
  useMaintenanceRequest: () => state.query,
  useCreateMaintenanceRequest: () => ({ mutateAsync: state.create, isPending: false }),
  useUpdateMaintenanceRequest: () => ({ mutateAsync: state.update, isPending: false }),
}))
vi.mock('@/hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }))
vi.mock('@/hooks/useItems', () => ({ useItems: () => ({ data: { items: [] } }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ isAllHotelsMode: state.allHotels }) }))
vi.mock('@/components/layout/MobileDetailHeader', () => ({ MobileDetailHeader: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const request = {
  id: 'request-1', title: 'Điều hòa không lạnh', description: 'Máy chạy nhưng không có hơi lạnh',
  priority: 'urgent', issue_type: 'inspection', location: 'Phòng 101',
  room_id: 'room-1', item_id: 'item-60',
  room: { id: 'room-1', room_number: '101', floor: 1 },
  item: { id: 'item-60', name: 'Điều hòa', code: 'DH60' },
  photos: ['photo.jpg'], estimated_cost: 500000,
}
const app = (create = false) => (
  <MemoryRouter initialEntries={[create ? '/maintenance/requests/new' : '/maintenance/requests/request-1/edit']}>
    <Routes>
      <Route path="/maintenance/requests/new" element={<MobileMaintenanceRequestForm />} />
      <Route path="/maintenance/requests/:id/edit" element={<MobileMaintenanceRequestForm />} />
      <Route path="/maintenance/requests" element={<h1>Danh sách bảo trì</h1>} />
    </Routes>
  </MemoryRouter>
)
async function next() {
  fireEvent.click(screen.getByRole('button', { name: 'actions.next' }))
  await waitFor(() => expect(screen.getByLabelText('form.locationLabel *')).toBeInTheDocument())
}

describe('mobile maintenance request editing', () => {
  beforeEach(() => {
    state.query = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }
    state.create.mockReset().mockResolvedValue({ id: 'new' })
    state.update.mockReset().mockResolvedValue(request)
    state.allHotels = false
  })
  it('loads the existing values and keeps staff edits when data refetches', async () => {
    const view = render(app())
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải')
    state.query = { ...state.query, data: request, isLoading: false }
    view.rerender(app())
    await waitFor(() => expect(screen.getByLabelText('form.titleLabel *')).toHaveValue(request.title))
    expect(screen.getByRole('radio', { name: 'priority.urgent' })).toBeChecked()
    expect(screen.getByRole('combobox', { name: 'form.issueTypeLabel *' })).toHaveTextContent('issueType.inspection')
    fireEvent.change(screen.getByLabelText('form.titleLabel *'), { target: { value: 'Đã bổ sung mô tả sự cố' } })
    state.query = { ...state.query, data: { ...request, title: 'Server mới' } }
    view.rerender(app())
    expect(screen.getByLabelText('form.titleLabel *')).toHaveValue('Đã bổ sung mô tả sự cố')
    await next()
    expect(screen.getByLabelText('form.locationLabel *')).toHaveValue('Phòng 101')
    expect(screen.getByRole('combobox', { name: 'form.itemLabel' })).toHaveTextContent('Điều hòa (DH60)')
    fireEvent.click(screen.getByRole('button', { name: 'actions.next' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'actions.submit' })).toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'actions.submit' }))
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
    expect(state.update).toHaveBeenCalledWith({ id: request.id, data: {
      title: 'Đã bổ sung mô tả sự cố', description: request.description, priority: 'urgent', issue_type: 'inspection',
      location: request.location, room_id: request.room_id, item_id: request.item_id,
    } })
    expect(state.create).not.toHaveBeenCalled()
  })
  it('validates each visible step before advancing and sends null for optional links', async () => {
    render(app(true))
    fireEvent.click(screen.getByRole('button', { name: 'actions.next' }))
    expect(await screen.findByText('validation.titleRequired')).toBeInTheDocument()
    expect(screen.queryByLabelText('form.locationLabel *')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('form.titleLabel *'), { target: { value: '  Máy hỏng  ' } })
    fireEvent.change(screen.getByLabelText('form.descriptionLabel *'), { target: { value: 'Cần kiểm tra' } })
    await next()
    fireEvent.click(screen.getByRole('button', { name: 'actions.next' }))
    expect(await screen.findByText('validation.locationRequired')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('form.locationLabel *'), { target: { value: 'Sảnh' } })
    fireEvent.submit(screen.getByLabelText('form.locationLabel *').closest('form')!)
    await waitFor(() => expect(screen.getByRole('button', { name: 'actions.submit' })).toBeInTheDocument())
    expect(state.create).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'actions.submit' }))
    await waitFor(() => expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Máy hỏng', room_id: null, item_id: null })))
  })
  it('shows retry on load failure and prevents submitting a blank edit', () => {
    state.query = { ...state.query, isLoading: false, isError: true }
    render(app())
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.query.refetch).toHaveBeenCalledOnce()
    expect(screen.queryByRole('button', { name: 'actions.next' })).not.toBeInTheDocument()
    expect(state.update).not.toHaveBeenCalled()
  })
  it('blocks new requests in all hotels mode', () => {
    state.allHotels = true
    render(app(true))
    expect(screen.getByRole('button', { name: 'actions.next' })).toBeDisabled()
    expect(state.create).not.toHaveBeenCalled()
  })
})
