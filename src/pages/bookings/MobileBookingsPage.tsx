import { useState } from 'react'
import { format, isToday, differenceInDays, startOfDay, isBefore, isAfter } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  Calendar,
  Search,
  Plus,
  User,
  Phone,
  LogIn,
  LogOut,
  Loader2,
  Users,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils'
import { BOOKING_SOURCES, OTA_SOURCES } from '@/lib/constants'
import type { BookingWithRoom } from './BookingsPage'

type BookingStatus =
  | 'all'
  | 'confirmed'
  | 'checked_in'
  | 'checked_out'
  | 'cancelled'
  | 'no_show'
  | 'conflict'
  | 'overdue'
  | 'overdue_checkin'

interface MobileBookingsPageProps {
  bookings: BookingWithRoom[]
  filteredBookings: BookingWithRoom[]
  isLoading: boolean
  stats: {
    total: number
    checkedIn: number
    checkingOutToday: number
    checkingInToday: number
  }
  statusFilter: string
  searchQuery: string
  onSearchChange: (query: string) => void
  onStatusFilterChange: (status: string) => void
  onCheckInClick: (booking: BookingWithRoom) => void
  onCheckOutClick: (booking: BookingWithRoom) => void
  onBookingClick: (booking: BookingWithRoom) => void
  onAddBooking: () => void
  isActionLoading: boolean
  actionBookingId?: string
  groupCounts?: Record<string, number>
  dateRangeFilter: '7d' | '30d' | '90d' | 'all'
  onDateRangeFilterChange: (range: '7d' | '30d' | '90d' | 'all') => void
  overdueCheckinIds: string[]
  conflictCount: number
  isError: boolean
  errorMessage: string
  onRetry: () => void
}

const STATUS_TABS: { value: BookingStatus; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  { value: 'checked_in', label: 'Đang ở' },
  { value: 'confirmed', label: 'Đã đặt' },
  { value: 'overdue', label: 'Quá hạn' },
  { value: 'overdue_checkin', label: 'Quá giờ nhận' },
  { value: 'conflict', label: 'Xung đột' },
  { value: 'checked_out', label: 'Đã trả' },
  { value: 'cancelled', label: 'Đã hủy' },
  { value: 'no_show', label: 'Không đến' },
]

export function MobileBookingsPage({
  bookings,
  filteredBookings,
  isLoading,
  stats,
  statusFilter,
  searchQuery,
  onSearchChange,
  onStatusFilterChange,
  onCheckInClick,
  onCheckOutClick,
  onBookingClick,
  onAddBooking,
  isActionLoading,
  actionBookingId,
  groupCounts,
  dateRangeFilter,
  onDateRangeFilterChange,
  overdueCheckinIds,
  conflictCount,
  isError,
  errorMessage,
  onRetry,
}: MobileBookingsPageProps) {
  const getStatusColor = (status: string, checkOutDate: string, isOverdueCheckin = false) => {
    if (isOverdueCheckin) return 'text-red-600'
    if (status === 'checked_in') {
      const today = startOfDay(new Date())
      const checkOut = startOfDay(new Date(checkOutDate))
      if (isBefore(checkOut, today)) return 'text-red-600'
      if (isToday(new Date(checkOutDate))) return 'text-amber-600'
      return 'text-green-600'
    }
    switch (status) {
      case 'confirmed': return 'text-blue-600'
      case 'checked_out': return 'text-muted-foreground'
      case 'cancelled': return 'text-muted-foreground'
      case 'no_show': return 'text-amber-700'
      default: return 'text-muted-foreground'
    }
  }

  const getStatusLabel = (status: string, checkOutDate: string, isOverdueCheckin = false) => {
    if (isOverdueCheckin) return 'Quá giờ nhận phòng'
    if (status === 'checked_in') {
      const today = startOfDay(new Date())
      const checkOut = startOfDay(new Date(checkOutDate))
      if (isBefore(checkOut, today)) return 'Quá hạn checkout'
      if (isToday(new Date(checkOutDate))) return 'Checkout hôm nay'
      return 'Đang ở'
    }
    switch (status) {
      case 'confirmed': return 'Đã đặt'
      case 'checked_out': return 'Đã trả phòng'
      case 'cancelled': return 'Đã hủy'
      case 'no_show': return 'Không đến'
      case 'conflict': return 'Xung đột lịch'
      case 'overdue_checkin': return 'Quá giờ nhận phòng'
      default: return status
    }
  }

  const getDurationLabel = (booking: BookingWithRoom) => {
    if (booking.booking_type === 'hourly') {
      return `${booking.booking_hours || 0}h`
    }
    if (booking.booking_type === 'monthly') {
      return `${booking.booking_months || 1} tháng`
    }
    const nights = differenceInDays(
      new Date(booking.check_out_date),
      new Date(booking.check_in_date)
    )
    return `${Math.max(1, nights)} đêm`
  }

  const getPaymentLabel = (booking: BookingWithRoom) => {
    const remaining = (booking.total_amount || 0) - (booking.amount_paid || 0)
    const isOta = booking.booking_source && OTA_SOURCES.includes(booking.booking_source)
    
    if (isOta && booking.ota_payment_type === 'prepaid') return { text: 'Đã thanh toán', color: 'text-green-700' }
    if (booking.payment_status === 'paid' || remaining <= 0) return { text: 'Đã thanh toán', color: 'text-green-700' }
    if ((booking.amount_paid || 0) > 0) return { text: 'Thanh toán một phần', color: 'text-amber-700' }
    return { text: 'Chờ thanh toán', color: 'text-muted-foreground' }
  }

  const formatOverdueDuration = (hours: number) => {
    if (hours < 24) return `${hours.toFixed(1)} giờ`
    const days = Math.floor(hours / 24)
    const remainingHours = Math.round(hours % 24)
    return remainingHours > 0 ? `${days} ngày ${remainingHours} giờ` : `${days} ngày`
  }

  const hasActiveFilters = Boolean(searchQuery || statusFilter !== 'all' || dateRangeFilter !== '30d')

  return (
    <div className="space-y-3 px-4 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold">Đặt phòng</h1>
          <p className="text-xs text-muted-foreground">
            {stats.checkedIn} đang ở • {stats.checkingInToday} check-in • {stats.checkingOutToday} check-out hôm nay
          </p>
        </div>
        <Button size="sm" className="h-8" onClick={onAddBooking}>
          <Plus className="h-4 w-4 mr-1" />
          Thêm
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm tên khách, SĐT, phòng..."
          aria-label="Tìm theo tên khách, số điện thoại hoặc số phòng"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-9"
        />
      </div>

      {/* Status Filter Chips */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-1">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              onClick={() => onStatusFilterChange(tab.value)}
              className={cn(
                'shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors border',
                statusFilter === tab.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:border-primary/50'
              )}
            >
              {tab.label}
              {tab.value === 'overdue_checkin' && overdueCheckinIds.length > 0 ? ` (${overdueCheckinIds.length})` : ''}
              {tab.value === 'conflict' && conflictCount > 0 ? ` (${conflictCount})` : ''}
            </button>
          ))}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <div className="flex items-center gap-2">
        <Select value={dateRangeFilter} onValueChange={(value) => onDateRangeFilterChange(value as typeof dateRangeFilter)}>
          <SelectTrigger className="h-9 flex-1 text-xs">
          <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 ngày trước + sắp tới</SelectItem>
            <SelectItem value="30d">30 ngày trước + sắp tới</SelectItem>
            <SelectItem value="90d">90 ngày trước + sắp tới</SelectItem>
            <SelectItem value="all">Tất cả thời gian</SelectItem>
          </SelectContent>
        </Select>
        {hasActiveFilters && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 px-2 text-xs text-muted-foreground"
            onClick={() => {
              onSearchChange('')
              onStatusFilterChange('all')
              onDateRangeFilterChange('30d')
            }}
          >
            Xóa lọc
          </Button>
        )}
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage}</span>
            <Button variant="outline" size="sm" onClick={onRetry}>Thử lại</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Booking List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : isError ? null : filteredBookings.length === 0 ? (
        <div className="py-12 text-center">
          <Calendar className="h-10 w-10 mx-auto text-muted-foreground/50" />
          <p className="mt-3 text-sm font-medium">Chưa có đặt phòng</p>
          <p className="text-xs text-muted-foreground mt-1">Thêm đặt phòng mới để bắt đầu</p>
          <Button size="sm" className="mt-3" onClick={onAddBooking}>
            <Plus className="h-4 w-4 mr-1" />
            Thêm đặt phòng
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredBookings.map((booking) => {
            const isOverdueCheckin = booking.status === 'confirmed' && overdueCheckinIds.includes(booking.id)
            const statusColor = getStatusColor(booking.status, booking.check_out_date, isOverdueCheckin)
            const statusLabel = getStatusLabel(booking.status, booking.check_out_date, isOverdueCheckin)
            const payment = getPaymentLabel(booking)
            const isOverdue = booking.status === 'checked_in' && isBefore(
              startOfDay(new Date(booking.check_out_date)),
              startOfDay(new Date())
            )
            const isCurrentAction = isActionLoading && actionBookingId === booking.id

            return (
              <div
                key={booking.id}
                tabIndex={0}
                className={cn(
                  'border rounded-lg p-3 active:bg-accent/50 transition-colors',
                  isOverdue && 'border-l-4 border-l-red-600'
                )}
                onClick={() => onBookingClick(booking)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    onBookingClick(booking)
                  }
                }}
              >
                {/* Row 1: Guest name + Status */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="h-8 w-8 rounded-full border border-primary/60 bg-background flex items-center justify-center shrink-0">
                      <User className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{booking.guest_name}</p>
                      {booking.guest_phone && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {booking.guest_phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className={cn('rounded border px-2 py-0.5 text-xs font-medium shrink-0', statusColor)}>
                    {statusLabel}
                  </span>
                </div>

                {/* Row 2: Room + Duration + Payment */}
                <div className="flex items-center justify-between mt-2 text-xs">
                  <div className="flex items-center gap-3">
                    <span className="font-medium">
                      P.{booking.room?.room_number}
                    </span>
                    {booking.booking_type === 'hourly' && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-blue-300 text-blue-600">Giờ</Badge>
                    )}
                    {booking.booking_type === 'monthly' && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-slate-500 text-slate-700">Tháng</Badge>
                    )}
                    {booking.booking_group_id && groupCounts && groupCounts[booking.booking_group_id] > 1 && (
                      <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 gap-0.5 bg-background text-blue-700 border-blue-600 dark:text-blue-400">
                        <Users className="h-2.5 w-2.5" />
                        {groupCounts[booking.booking_group_id]}
                      </Badge>
                    )}
                    <span className="text-muted-foreground">
                      {getDurationLabel(booking)}
                    </span>
                    <span className={cn('font-mono', payment.color)}>
                      {payment.text}
                    </span>
                  </div>
                  <span className="font-mono font-medium">
                    {formatCurrency(booking.total_amount || 0)}
                  </span>
                </div>

                {/* Row 3: Dates + Action buttons */}
                <div className="flex items-center justify-between mt-2">
                  <div className="text-xs text-muted-foreground">
                    {booking.booking_type === 'hourly' && booking.hourly_start_time ? (
                      <span>
                        {format(new Date(booking.check_in_date), 'dd/MM', { locale: vi })} • {format(new Date(booking.hourly_start_time), 'HH:mm')} - {booking.hourly_end_time ? format(new Date(booking.hourly_end_time), 'HH:mm') : ''}
                      </span>
                    ) : (
                      <span>
                            {format(new Date(booking.check_in_date), 'dd/MM', { locale: vi })} → {format(new Date(booking.check_out_date), 'dd/MM', { locale: vi })}
                        {booking.actual_check_in && ` • In: ${format(new Date(booking.actual_check_in), 'HH:mm')}`}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {booking.status === 'confirmed' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-9 text-xs text-blue-700 border-blue-600 hover:bg-muted px-2"
                        disabled={isCurrentAction}
                        onClick={() => onCheckInClick(booking)}
                      >
                        {isCurrentAction ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <LogIn className="h-3 w-3 mr-1" />
                            Check-in
                          </>
                        )}
                      </Button>
                    )}
                    {booking.status === 'checked_in' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={cn(
                          "h-9 text-xs px-2",
                          isOverdue 
                            ? "text-red-700 border-red-600 hover:bg-muted"
                            : "text-orange-700 border-orange-600 hover:bg-muted"
                        )}
                        disabled={isCurrentAction}
                        onClick={() => onCheckOutClick(booking)}
                      >
                        {isCurrentAction ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <LogOut className="h-3 w-3 mr-1" />
                            Check-out
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
