import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FloorPlanLiveData } from '@/hooks/useFloorPlanLive'
import { FloorMapLarge } from './FloorMapLarge'

const state = vi.hoisted(() => ({ data: {} as FloorPlanLiveData, error: false, canAssign: true, refetch: vi.fn() }))
vi.mock('@/hooks/useFloorPlanLive', () => ({ useFloorPlanLive: () => ({ data: state.data, isLoading: false, isError: state.error, isFetching: false, refetch: state.refetch }) }))
vi.mock('@/contexts/HotelContext', () => ({ useHotelContext: () => ({ selectedHotel: { id: 'hotel-A' } }) }))
vi.mock('@/hooks/usePermission', () => ({ useHasPermission: () => ({ hasPermission: state.canAssign }) }))
vi.mock('@/components/housekeeping/CreateTaskDialog', () => ({ CreateTaskDialog: ({ roomId, roomNumber, hotelId }: { roomId: string; roomNumber: string; hotelId: string }) => <div role="dialog">{hotelId}/{roomId}/{roomNumber}</div> }))

beforeEach(() => {
  vi.clearAllMocks()
  state.error = false
  state.canAssign = true
  state.data = {
    '1': [
      { id: 'ready', room_number: '101', room_type: 'Deluxe', status: 'vacant_clean', current_booking: null, next_booking: null },
      { id: 'dirty', room_number: '102', room_type: 'Standard', status: 'vacant_dirty', current_booking: null, next_booking: null },
      { id: 'cleaning', room_number: '103', room_type: 'Standard', status: 'cleaning', current_booking: null, next_booking: null },
    ],
    '2': [
      { id: 'guest', room_number: '201', room_type: 'Deluxe', status: 'occupied_dirty', current_booking: { id: 'booking', guest_name: 'An', guest_count: 1, status: 'checked_in', check_in_date: '2026-10-16' }, next_booking: null },
      { id: 'dnd', room_number: '202', room_type: 'Suite', status: 'dnd', current_booking: null, next_booking: null },
      { id: 'unknown', room_number: '203', room_type: 'Suite', status: 'unknown', current_booking: null, next_booking: null },
    ],
  }
})
afterEach(cleanup)
const open = () => render(<MemoryRouter><FloorMapLarge /></MemoryRouter>)

describe('housekeeping floor board', () => {
  it('separates waiting rooms from cleaning rooms, including occupied rooms needing service', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Chờ dọn 2' }))
    expect(screen.getByRole('article', { name: 'Phòng 102' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Phòng 201' })).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: 'Phòng 103' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Đang dọn 1' }))
    expect(screen.getByRole('status')).toHaveTextContent('Hiển thị 1/6 phòng')
    expect(screen.getByRole('article', { name: 'Phòng 103' })).toHaveTextContent('Đang dọn')
  })

  it('combines floor, room class, search and status filters and can reset', () => {
    open()
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo tầng' }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo hạng phòng' }), { target: { value: 'Deluxe' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Tìm số phòng' }), { target: { value: '201' } })
    expect(screen.getByRole('status')).toHaveTextContent('Hiển thị 1/6 phòng')
    fireEvent.change(screen.getByRole('combobox', { name: 'Lọc theo tình trạng' }), { target: { value: 'ready' } })
    expect(screen.getByText('Không có phòng phù hợp.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }))
    expect(screen.getByRole('status')).toHaveTextContent('Hiển thị 6/6 phòng')
  })

  it('opens the existing task form for the selected room and hides assignment for DND and unknown states', () => {
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Giao việc phòng 102' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('hotel-A/dirty/102')
    expect(screen.queryByRole('button', { name: 'Giao việc phòng 202' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Giao việc phòng 203' })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Phòng 203' })).toHaveTextContent('Chưa rõ tình trạng')
    expect(screen.getByRole('article', { name: 'Phòng 201' }).querySelector('a')).toHaveAttribute('href', '/rooms/guest')
  })

  it('keeps room details available for read-only users', () => {
    state.canAssign = false
    open()
    expect(screen.queryByRole('button', { name: /Giao việc phòng/ })).not.toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Phòng 102' }).querySelector('a')).toHaveAttribute('href', '/rooms/dirty')
  })

  it('uses active work to separate cleaning, review and rework from stale room statuses', () => {
    render(<MemoryRouter><FloorMapLarge work={{ total: 3, completed: 0, pending: 1, inProgress: 1, awaitingReview: 1, inProgressRoomIds: ['dirty'], awaitingReviewRoomIds: ['ready'], reworkRoomIds: ['guest'] }} /></MemoryRouter>)
    expect(screen.getByRole('article', { name: 'Phòng 101' })).toHaveTextContent('Chờ kiểm tra')
    expect(screen.getByRole('article', { name: 'Phòng 102' })).toHaveTextContent('Đang dọn')
    expect(screen.getByRole('article', { name: 'Phòng 201' })).toHaveTextContent('Cần làm lại')
    expect(screen.queryByRole('button', { name: 'Giao việc phòng 101' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Trống sạch 0' }))
    expect(screen.queryByRole('article', { name: 'Phòng 101' })).not.toBeInTheDocument()
  })

  it('distinguishes missing data from an empty hotel and provides retry', () => {
    state.error = true
    open()
    expect(screen.queryByText('Khách sạn chưa có phòng')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(state.refetch).toHaveBeenCalledOnce()
    cleanup()
    state.error = false
    state.data = {}
    open()
    expect(screen.getByRole('link', { name: 'Thêm phòng / Nhập Excel' })).toHaveAttribute('href', '/rooms?view=list')
  })
})
