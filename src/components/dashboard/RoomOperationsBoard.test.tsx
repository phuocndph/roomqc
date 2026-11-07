import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FloorPlanLiveData } from '@/hooks/useFloorPlanLive'
import { RoomOperationsBoard } from './RoomOperationsBoard'

const state = vi.hoisted(() => ({
  data: {} as FloorPlanLiveData, error: false, arrivalsError: false,
  permissions: undefined as undefined | { module: string; can_update?: boolean; can_manage?: boolean; can_create?: boolean }[],
  refetch: vi.fn(), mutate: vi.fn(), invalidate: vi.fn(), hotelId: 'hotel-A',
}))
vi.mock('@/hooks/useFloorPlanLive', () => ({ useFloorPlanLive: () => ({ data: state.data, isLoading: false, isError: state.error, refetch: state.refetch }) }))
vi.mock('@/hooks/useBookingStats', () => ({ useTodayCheckins: () => ({ data: [], isLoading: false, isError: state.arrivalsError }) }))
vi.mock('@/hooks/useRoomTransition', () => ({ useRoomTransition: () => ({ mutate: state.mutate, isPending: false }) }))
vi.mock('@/hooks/useUserModulePermissions', () => ({ useUserModulePermissions: () => ({ data: state.permissions }) }))
vi.mock('@/hooks/useUser', () => ({ useUser: () => ({ role: 'owner', tenantId: 'tenant-A' }) }))
vi.mock('@/hooks/useRoomTypePricing', () => ({ useRoomTypePricing: () => ({ nightly: 500000 }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: state.hotelId } }) }))
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }))
vi.mock('@/components/rooms/RoomBookingDialog', () => ({ RoomBookingDialog: ({ roomNumber, defaultRoomPrice }) => <div role="dialog">Đặt phòng {roomNumber} · {defaultRoomPrice}</div> }))
// Exercise our actions without JSDOM running Radix's layout and focus observers.
vi.mock('@/components/ui/popover', async () => {
  const React = await import('react')
  const Context = React.createContext({ open: false, onOpenChange: (_open: boolean) => {} })
  return {
    Popover: ({ open, onOpenChange, children }) => <Context.Provider value={{ open, onOpenChange }}>{children}</Context.Provider>,
    PopoverTrigger: ({ children }) => {
      const context = React.useContext(Context)
      return React.cloneElement(children, { onClick: () => context.onOpenChange(!context.open) })
    },
    PopoverContent: ({ children }) => React.useContext(Context).open ? <div role="dialog">{children}</div> : null,
  }
})

beforeEach(() => {
  state.error = false; state.arrivalsError = false; state.permissions = undefined; state.hotelId = 'hotel-A'
  vi.clearAllMocks()
  state.data = {
    '1': [
      { id: 'clean', room_number: '101', room_type: 'Deluxe', status: 'vacant_clean', current_booking: null, next_booking: null },
      { id: 'dirty', room_number: '102', room_type: 'Standard', status: 'vacant_dirty', current_booking: null, next_booking: null },
    ],
    '2': [
      { id: 'guest', room_number: '201', room_type: 'Deluxe', status: 'occupied_dirty', current_booking: { id: 'booking-201', guest_name: 'Nguyễn An', guest_count: 2, status: 'checked_in', check_in_date: '2026-10-16' }, next_booking: null },
      { id: 'repair', room_number: '202', room_type: 'Suite', status: 'out_of_order', current_booking: null, next_booking: null },
    ],
  }
})
afterEach(cleanup)
const open = () => render(<MemoryRouter><RoomOperationsBoard /></MemoryRouter>)

describe('dashboard room operations', () => {
  it('filters rooms by cleaning status, floor and guest and can clear all filters', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /Cần dọn 2/ }))
    expect(screen.queryByRole('button', { name: /Phòng 101,/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Phòng 201,/ })).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo tầng' }), { target: { value: '2' } })
    expect(screen.queryByRole('button', { name: /Phòng 102,/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm phòng hoặc tên khách' }), { target: { value: 'Nguyễn An' } })
    expect(screen.getByRole('status')).toHaveTextContent('Hiển thị 1/4 phòng')
    fireEvent.click(screen.getByRole('button', { name: 'Xóa lọc' }))
    expect(screen.getByRole('status')).toHaveTextContent('Hiển thị 4/4 phòng')
  })

  it('links checkout to the existing confirmation flow and cleans an occupied room without vacating it', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /Phòng 201,/ }))
    expect(screen.getByRole('link', { name: 'Trả phòng' })).toHaveAttribute('href', '/bookings?action=checkout&bookingId=booking-201')
    expect(screen.getByRole('link', { name: 'Báo bảo trì' })).toHaveAttribute('href', '/maintenance/requests/new?roomId=guest')
    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu đã dọn' }))
    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ roomId: 'guest', toStatus: 'occupied_clean' }), expect.any(Object))
  })

  it('does not offer check-in or cleaning shortcuts for a broken room', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /Phòng 202,/ }))
    expect(screen.queryByRole('button', { name: 'Nhận khách / Đặt phòng' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đánh dấu đã dọn' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem chi tiết phòng/ })).toHaveAttribute('href', '/rooms/repair')
  })

  it('opens the existing booking form with the selected room and configured nightly rate', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: /Phòng 101,/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Nhận khách / Đặt phòng' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Đặt phòng 101 · 500000')
  })

  it('keeps room details available while hiding actions for read-only permissions', () => {
    state.permissions = [{ module: 'rooms' }, { module: 'bookings' }, { module: 'maintenance' }]
    open()
    fireEvent.click(screen.getByRole('button', { name: /Phòng 101,/ }))
    expect(screen.queryByRole('button', { name: 'Nhận khách / Đặt phòng' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đánh dấu cần dọn' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Báo bảo trì' })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Xem chi tiết phòng/ })).toBeInTheDocument()
  })

  it('offers a room management destination when empty and retries errors instead of presenting empty data', () => {
    state.data = {}
    const view = open()
    expect(screen.getByRole('link', { name: 'Thêm phòng / Nhập Excel' })).toHaveAttribute('href', '/rooms?view=list')
    state.error = true
    view.rerender(<MemoryRouter><RoomOperationsBoard /></MemoryRouter>)
    expect(screen.queryByRole('heading', { name: 'Chưa có phòng' })).not.toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Thử lại' }))
    expect(state.refetch).toHaveBeenCalledOnce()
  })

  it('resets the filters when changing hotels', () => {
    const view = open()
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm phòng hoặc tên khách' }), { target: { value: '101' } })
    state.hotelId = 'hotel-B'
    view.rerender(<MemoryRouter><RoomOperationsBoard /></MemoryRouter>)
    expect(screen.getByRole('textbox', { name: 'Tìm phòng hoặc tên khách' })).toHaveValue('')
  })
})
