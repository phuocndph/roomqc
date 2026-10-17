import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import MaintenanceRequestForm from './MaintenanceRequestForm'

const state = vi.hoisted(() => ({
  query: { data: undefined as typeof request | undefined, isLoading: true, isError: false, refetch: vi.fn() },
  update: vi.fn(),
}))
vi.mock('@/hooks/useMaintenanceRequests', () => ({
  useMaintenanceRequest: () => state.query,
  useCreateMaintenanceRequest: () => ({ isPending: false }),
  useUpdateMaintenanceRequest: () => ({ mutateAsync: state.update, isPending: false }),
}))
vi.mock('@/lib/breakpoints', () => ({ useBreakpoint: () => ({ isMobile: false }) }))
vi.mock('@/hooks/useRooms', () => ({ useRooms: () => ({ data: [] }) }))
vi.mock('@/hooks/useItems', () => ({ useItems: () => ({ data: { items: [] } }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ isAllHotelsMode: false }) }))
vi.mock('@/components/shared/ImageUpload', () => ({ ImageUpload: () => null }))
vi.mock('@/components/shared/PageHeader', () => ({ PageHeader: ({ title }: { title: string }) => <h1>{title}</h1> }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
const request = {
  id: 'request-1', title: 'Điều hòa không hoạt động', description: 'Điều hòa không hoạt động, cần kiểm tra và sửa chữa',
  priority: 'urgent', issue_type: 'inspection', location: 'Phòng 101',
  room_id: null, item_id: null, expected_completion_date: null, estimated_cost: 0, photos: ['photo.jpg'],
}
const app = () => (
  <MemoryRouter initialEntries={['/maintenance/requests/request-1/edit']}>
    <Routes>
      <Route path="/maintenance/requests/:id/edit" element={<MaintenanceRequestForm />} />
      <Route path="/maintenance/requests" element={<h1>Danh sách</h1>} />
    </Routes>
  </MemoryRouter>
)
describe('desktop maintenance edit recovery', () => {
  beforeEach(() => {
    state.query = { data: undefined, isLoading: true, isError: false, refetch: vi.fn() }
    state.update.mockReset().mockResolvedValue(request)
  })
  it('hydrates the radio values, keeps edits after refetch, and preserves photos and zero cost', async () => {
    const view = render(app())
    state.query = { ...state.query, data: request, isLoading: false }
    view.rerender(app())
    await waitFor(() => expect(screen.getByLabelText('form.titleLabel *')).toHaveValue(request.title))
    expect(screen.getByRole('radio', { name: /priority.urgent/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /issueType.inspection/ })).toBeChecked()
    fireEvent.change(screen.getByLabelText('form.titleLabel *'), { target: { value: 'Điều hòa phòng 101 cần sửa' } })
    state.query = { ...state.query, data: { ...request, title: 'Dữ liệu máy chủ' } }
    view.rerender(app())
    expect(screen.getByLabelText('form.titleLabel *')).toHaveValue('Điều hòa phòng 101 cần sửa')
    fireEvent.click(screen.getByRole('button', { name: 'buttons.update' }))
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
    expect(state.update).toHaveBeenCalledWith({ id: request.id, data: expect.objectContaining({
      title: 'Điều hòa phòng 101 cần sửa', priority: 'urgent', issue_type: 'inspection', room_id: null, item_id: null,
      expected_completion_date: null, estimated_cost: 0, photos: ['photo.jpg'],
    }) })
  })
  it('shows retry rather than an endless skeleton when loading fails', () => {
    state.query = { ...state.query, isLoading: false, isError: true }
    render(app())
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.query.refetch).toHaveBeenCalledOnce()
    expect(state.update).not.toHaveBeenCalled()
  })
})
