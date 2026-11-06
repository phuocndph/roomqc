import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoomFormPage } from './RoomFormPage'

const state = vi.hoisted(() => ({
  mobile: false,
  room: undefined as Record<string, unknown> | undefined,
  create: vi.fn(), update: vi.fn(), duplicate: vi.fn(),
}))
vi.mock('react-i18next', async () => {
  const { default: rooms } = await import('@/i18n/locales/vi/rooms.json')
  const t = (key: string) => key.replace('rooms:', '').split('.').reduce<unknown>(
    (value, part) => (value as Record<string, unknown>)?.[part], rooms,
  ) as string || key
  return { useTranslation: () => ({ t }) }
})
vi.mock('@/lib/breakpoints', () => ({ useBreakpoint: () => ({ isMobile: state.mobile }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ tenantId: 'tenant-test' }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({
  selectedHotel: { id: 'hotel-test', name: 'Test hotel' }, isAllHotelsMode: false,
}) }))
vi.mock('@/hooks/useRooms', () => ({
  useRoom: () => ({ data: state.room ? { room: state.room } : undefined, isLoading: false }),
  useCreateRoom: () => ({ mutateAsync: state.create }),
  useUpdateRoom: () => ({ mutateAsync: state.update }),
}))
vi.mock('@/hooks/useQuotaCheck', () => ({ useQuotaCheck: () => ({ checkQuota: async () => true }) }))
vi.mock('@/hooks/useRoomSubscriptionLimit', () => ({ useRoomSubscriptionLimit: () => ({ canCreateRoom: true }) }))
vi.mock('@/components/settings/usage/QuotaExceededDialog', () => ({ QuotaExceededDialog: () => null }))
vi.mock('@/components/rooms/RoomLimitWarning', () => ({ RoomLimitWarning: () => null }))
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => ({
  select: () => ({ eq: () => ({ eq: state.duplicate }) }),
}) } }))
// Keep real inputs, react-hook-form and Zod; native selects isolate Radix positioning.
vi.mock('@/components/ui/select', async () => {
  const React = await import('react')
  const SelectItem = ({ value, children }: { value: string; children: React.ReactNode }) =>
    <option value={value}>{children}</option>
  return {
    Select: ({ value, onValueChange, children }: { value?: string; onValueChange: (s: string) => void; children: React.ReactNode }) =>
      <select value={value || ''} onChange={e => onValueChange(e.target.value)}><option value="">Choose</option>{children}</select>,
    SelectContent: ({ children }: { children: React.ReactNode }) => <>{React.Children.toArray(children)
      .filter(child => React.isValidElement(child) && child.type === SelectItem)}</>,
    SelectItem, SelectTrigger: () => null, SelectValue: () => null,
  }
})

beforeEach(() => {
  state.room = undefined
  state.create.mockReset().mockResolvedValue({ id: 'new-room' })
  state.update.mockReset().mockResolvedValue({ id: 'existing-room' })
  state.duplicate.mockReset().mockResolvedValue({ data: [], error: null })
})
afterEach(cleanup)

function open(edit = false) {
  render(<MemoryRouter initialEntries={[edit ? '/rooms/existing-room/edit' : '/rooms/new']}>
    <Routes>
      <Route path="/rooms/new" element={<RoomFormPage />} />
      <Route path="/rooms/:id/edit" element={<RoomFormPage />} />
      <Route path="/rooms/:id" element={<div>Room saved</div>} />
    </Routes>
  </MemoryRouter>)
}
async function details(edit = false) {
  open(edit)
  if (!edit) {
    fireEvent.change(screen.getByLabelText(/Số phòng/), { target: { value: '101' } })
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'standard' } })
    fireEvent.change(screen.getByLabelText(/Tầng/), { target: { value: '1' } })
  }
  if (state.mobile) {
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp theo' }))
    await screen.findByLabelText(/Diện tích/)
  }
}
async function save() {
  if (state.mobile) {
    fireEvent.click(screen.getByRole('button', { name: 'Tiếp theo' }))
    await screen.findByRole('button', { name: state.room ? 'Cập nhật' : 'Tạo phòng' })
  }
  fireEvent.click(screen.getByRole('button', { name: state.room ? 'Cập nhật' : state.mobile ? 'Tạo phòng' : 'Tạo mới' }))
}

describe.each([false, true])('room form optional area (mobile=%s)', mobile => {
  beforeEach(() => { state.mobile = mobile })

  it('creates a room with its optional area left blank', async () => {
    await details()
    await save()
    await screen.findByText('Room saved')
    expect(state.create).toHaveBeenCalledOnce()
    expect(state.create.mock.calls[0][0]).toMatchObject({ room_number: '101', area_sqm: null, hotel_id: 'hotel-test' })
  })

  it('creates a room after entering then clearing the optional area', async () => {
    await details()
    const area = screen.getByLabelText(/Diện tích/)
    fireEvent.change(area, { target: { value: '25.5' } })
    fireEvent.change(area, { target: { value: '' } })
    await save()
    await screen.findByText('Room saved')
    expect(state.create.mock.calls[0][0].area_sqm).toBeNull()
  })

  it('keeps a decimal area as a number when saving', async () => {
    await details()
    fireEvent.change(screen.getByLabelText(/Diện tích/), { target: { value: '25.5' } })
    await save()
    await screen.findByText('Room saved')
    expect(state.create.mock.calls[0][0].area_sqm).toBe(25.5)
  })

  it('shows the reason for a negative area on the same step', async () => {
    await details()
    const area = screen.getByLabelText(/Diện tích/)
    fireEvent.change(area, { target: { value: '-1' } })
    if (mobile) fireEvent.click(screen.getByRole('button', { name: 'Tiếp theo' }))
    else fireEvent.submit(area.closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Diện tích phải >= 0')
    expect(area).toHaveAttribute('aria-invalid', 'true')
    expect(area).toHaveAccessibleDescription('Diện tích phải >= 0')
    expect(state.create).not.toHaveBeenCalled()
    if (mobile) expect(screen.queryByRole('button', { name: 'Tạo phòng' })).not.toBeInTheDocument()
  })

  it.each([0, 25.5])('can clear an existing area of %s on edit', async area => {
    state.room = { id: 'existing-room', room_number: '101', room_type: 'standard', floor: 1,
      area_sqm: area, max_guests: 2, base_price: 450000 }
    await details(true)
    expect(screen.getByLabelText(/Diện tích/)).toHaveValue(area)
    fireEvent.change(screen.getByLabelText(/Diện tích/), { target: { value: '' } })
    await save()
    await screen.findByText('Room saved')
    await waitFor(() => expect(state.update).toHaveBeenCalledOnce())
    expect(state.update.mock.calls[0][0]).toMatchObject({ id: 'existing-room', data: { area_sqm: null } })
  })
})
