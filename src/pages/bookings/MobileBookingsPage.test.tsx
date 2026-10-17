import type { ComponentProps } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MobileBookingsPage } from './MobileBookingsPage'
import type { BookingWithRoom } from './BookingsPage'

const bookings = Array.from({ length: 51 }, (_, id) => ({
  id: String(id), guest_name: `Khách ${id}`, status: 'confirmed', check_in_date: '2026-10-18', check_out_date: '2026-10-19',
  total_amount: 300000, room: { room_number: String(100 + id) },
})) as BookingWithRoom[]
const props = (): ComponentProps<typeof MobileBookingsPage> => ({
  bookings, filteredBookings: bookings, visibleBookings: bookings.slice(0, 50), page: 1, onPageChange: vi.fn(),
  isLoading: false, stats: { total: 51, checkedIn: 0, checkingOutToday: 0, checkingInToday: 0 },
  statusFilter: 'all', searchQuery: '', onSearchChange: vi.fn(), onStatusFilterChange: vi.fn(),
  onCheckInClick: vi.fn(), onCheckOutClick: vi.fn(), onBookingClick: vi.fn(), onAddBooking: vi.fn(), isActionLoading: false,
  dateRangeFilter: 'all', onDateRangeFilterChange: vi.fn(), overdueCheckinIds: [], conflictCount: 0,
  isError: false, errorMessage: 'Không tải được đặt phòng', onRetry: vi.fn(),
})
describe('mobile booking pages', () => {
  it('renders only the current page and passes its exact booking to the action', () => {
    const p = props()
    const { rerender } = render(<MobileBookingsPage {...p} />)
    expect(screen.getByText('Khách 0')).toBeInTheDocument()
    expect(screen.queryByText('Khách 50')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Sau' }))
    expect(p.onPageChange).toHaveBeenCalledWith(2)
    rerender(<MobileBookingsPage {...p} page={2} visibleBookings={bookings.slice(50)} />)
    expect(screen.queryByText('Khách 0')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Check-in' }))
    expect(p.onCheckInClick).toHaveBeenCalledWith(bookings[50])
    expect(p.onBookingClick).not.toHaveBeenCalled()
    expect(screen.getByRole('status')).toHaveTextContent('51–51 / 51')
  })
  it('does not show a false empty state or pagination after a failed read', () => {
    const p = props()
    render(<MobileBookingsPage {...p} isError />)
    expect(screen.getByRole('alert')).toHaveTextContent(p.errorMessage)
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument()
    expect(screen.queryByText('Chưa có đặt phòng')).not.toBeInTheDocument()
    expect(screen.queryByText(/đang ở •/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }))
    expect(p.onRetry).toHaveBeenCalledOnce()
  })
})
