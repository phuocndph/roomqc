import { useMemo, useState } from 'react'
import { addMonths } from 'date-fns'
import { Sparkle } from 'lucide-react'
import { Building2, CheckCircle2, Loader2, Sparkles, Wrench, X, Settings2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn, formatCurrency, formatNumber } from '@/lib/utils'
import { useAvailableRooms, AvailableRoom } from '@/hooks/useAvailableRooms'

// Helper to get status badge for rooms
const getRoomStatusBadge = (status: string) => {
  switch (status) {
    case 'cleaning':
      return (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1 py-0.5 rounded bg-blue-100 text-blue-700 text-xs font-medium">
          <Sparkles className="h-2.5 w-2.5" />
          Dọn
        </span>
      )
    case 'maintenance':
      return (
        <span className="absolute bottom-1 left-1 flex items-center gap-0.5 px-1 py-0.5 rounded bg-amber-100 text-amber-700 text-xs font-medium">
          <Wrench className="h-2.5 w-2.5" />
          Bảo trì
        </span>
      )
    case 'occupied':
      return null // Room passed overlap check, will be free by booking date
    default:
      return null
  }
}
import { useHotelContext } from '@/contexts/HotelContext'
import { BookingFormState, BookingFormComputed, SelectedRoomWithPrice } from '../types'

interface RoomSelectionStepProps {
  state: BookingFormState
  computed: BookingFormComputed
  onToggleRoom: (room: AvailableRoom) => void
  onUpdateRoomPrice: (roomId: string, price: number) => void
  onApplyPricingV2?: () => Promise<{ ok: number; fail: number }>
}

const getRoomTypeLabel = (type: string) => {
  switch (type) {
    case 'single': return 'Đơn'
    case 'double': return 'Đôi'
    case 'twin': return 'Twin'
    case 'suite': return 'Suite'
    case 'deluxe': return 'Deluxe'
    case 'vip': return 'VIP'
    default: return type
  }
}

const getPriceUnitLabel = (bookingType: string) => {
  switch (bookingType) {
    case 'hourly': return 'đ/giờ'
    case 'monthly': return 'đ/tháng'
    default: return 'đ/đêm'
  }
}

const getPricePlaceholder = (bookingType: string) => {
  switch (bookingType) {
    case 'hourly': return 'Giá/giờ'
    case 'monthly': return 'Giá/tháng'
    default: return 'Giá/đêm'
  }
}

const getTotalLabel = (bookingType: string) => {
  switch (bookingType) {
    case 'hourly': return 'Tổng giá phòng/giờ:'
    case 'monthly': return 'Tổng giá phòng/tháng:'
    default: return 'Tổng giá phòng/đêm:'
  }
}

const getRoomDisplayPrice = (room: AvailableRoom, bookingType: string): number | null => {
  if (bookingType === 'hourly') return room.rate_hourly
  if (bookingType === 'monthly') return room.rate_monthly
  return room.rate_daily
}

export function RoomSelectionStep({ 
  state, 
  computed, 
  onToggleRoom, 
  onUpdateRoomPrice,
  onApplyPricingV2,
}: RoomSelectionStepProps) {
  const { isAllHotelsMode } = useHotelContext()
  const [applying, setApplying] = useState(false)
  
  // Calculate availability dates based on booking type
  const availabilityDates = useMemo(() => {
    switch (state.bookingType) {
      case 'hourly':
        // For hourly, check the specific date
        return { 
          checkIn: state.hourlyDate, 
          checkOut: state.hourlyDate 
        }
      case 'monthly':
        // For monthly, calculate end date
        return { 
          checkIn: state.monthlyStartDate, 
          checkOut: state.monthlyStartDate ? addMonths(state.monthlyStartDate, state.bookingMonths) : undefined 
        }
      default:
        // For daily, use check-in/out dates
        return { 
          checkIn: state.checkInDate, 
          checkOut: state.checkOutDate 
        }
    }
  }, [state.bookingType, state.checkInDate, state.checkOutDate, state.hourlyDate, state.monthlyStartDate, state.bookingMonths])

  const { data: availableRooms, isLoading: isLoadingRooms } = useAvailableRooms(
    availabilityDates.checkIn,
    availabilityDates.checkOut
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Phòng trống</span>
        {availableRooms && (
          <Badge variant="secondary">
            {availableRooms.length} phòng
          </Badge>
        )}
        {state.selectedRooms.length > 0 && (
          <Badge variant="default">
            Đã chọn {state.selectedRooms.length}
          </Badge>
        )}
      </div>
      
      <p className="text-xs text-muted-foreground">
        Click để chọn/bỏ chọn phòng. Có thể chọn nhiều phòng cùng lúc.
      </p>
      
      {/* Room Grid */}
      {isLoadingRooms ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : availableRooms && availableRooms.length > 0 ? (
        <ScrollArea className="h-[180px] rounded-md border p-2">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {availableRooms.map((room) => {
              const isSelected = state.selectedRooms.some(r => r.id === room.id)
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => onToggleRoom(room)}
                  className={cn(
                    "relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all hover:border-primary/50",
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-border"
                  )}
                >
                  {isSelected && (
                    <CheckCircle2 className="absolute top-1 right-1 h-4 w-4 text-primary" />
                  )}
                  <Building2 className="h-5 w-5 text-muted-foreground mb-1" />
                  <span className="font-semibold text-sm">{room.room_number}</span>
                  <span className="text-xs text-muted-foreground">
                    T{room.floor} • {getRoomTypeLabel(room.room_type)}
                  </span>
                  {(() => {
                    const displayPrice = getRoomDisplayPrice(room, state.bookingType)
                    if (displayPrice && displayPrice > 0) {
                      return (
                        <span className="text-xs font-medium text-primary">
                          {formatCurrency(displayPrice)}
                        </span>
                      )
                    }
                    return (
                      <Link
                        to="/settings/pricing?tab=default"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs text-amber-600 hover:underline inline-flex items-center gap-0.5"
                        title="Loại phòng chưa cấu hình giá"
                      >
                        <Settings2 className="h-2.5 w-2.5" />
                        Cấu hình giá
                      </Link>
                    )
                  })()}
                  {isAllHotelsMode && room.hotel_name && (
                    <span className="text-xs text-muted-foreground truncate max-w-full">
                      {room.hotel_name}
                    </span>
                  )}
                  {/* Status indicator for cleaning/maintenance rooms */}
                  {getRoomStatusBadge(room.currentStatus)}
                </button>
              )
            })}
          </div>
        </ScrollArea>
      ) : (
        <div className="text-center py-8 text-muted-foreground border rounded-lg">
          <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>Không có phòng trống trong khoảng thời gian này</p>
        </div>
      )}
      
      {/* Selected Rooms with Price Inputs */}
      {state.selectedRooms.length > 0 && (
        <div className="p-3 bg-primary/5 rounded-lg space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
              <span className="text-sm font-medium">
                Đã chọn {state.selectedRooms.length} phòng
              </span>
            </div>
            {onApplyPricingV2 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={applying}
                onClick={async () => {
                  setApplying(true)
                  try {
                    const { ok, fail } = await onApplyPricingV2()
                    if (ok > 0 && fail === 0) {
                      // success toast handled implicitly by UI update
                    }
                  } finally {
                    setApplying(false)
                  }
                }}
              >
                <Sparkle className="h-3 w-3 mr-1" />
                {applying ? 'Đang tính...' : 'Áp dụng giá theo bảng'}
              </Button>
            )}
          </div>
          
          <div className="space-y-2">
            {state.selectedRooms.map(room => (
              <div key={room.id} className="p-2 bg-background rounded border space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium text-sm">{room.room_number}</span>
                      <span className="text-xs text-muted-foreground">
                        T{room.floor} • {getRoomTypeLabel(room.room_type)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      inputMode="numeric"
                      value={room.customPrice > 0 ? formatNumber(room.customPrice) : ''}
                      onChange={(e) => {
                        const value = e.target.value.replace(/[^0-9]/g, '')
                        onUpdateRoomPrice(room.id, parseInt(value) || 0)
                      }}
                      placeholder={getPricePlaceholder(state.bookingType)}
                      className="w-28 h-8 text-right"
                    />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{getPriceUnitLabel(state.bookingType)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onToggleRoom(room)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {room.priceBreakdown && (
                  <div className="text-[11px] text-muted-foreground pl-6 font-mono">
                    Cơ sở {formatNumber(room.priceBreakdown.base)} × {room.priceBreakdown.units}
                    {room.priceBreakdown.weekday_multiplier !== 1 && ` × ${room.priceBreakdown.weekday_multiplier} (cuối tuần)`}
                    {room.priceBreakdown.season_adjust !== 0 && ` ${room.priceBreakdown.season_adjust > 0 ? '+' : ''}${formatNumber(room.priceBreakdown.season_adjust)} (mùa)`}
                    {(room.priceBreakdown.early_checkin_charge > 0 || room.priceBreakdown.late_checkout_charge > 0) &&
                      ` + ${formatNumber(room.priceBreakdown.early_checkin_charge + room.priceBreakdown.late_checkout_charge)} (sớm/trễ)`}
                    {' = '}<span className="text-primary">{formatNumber(room.priceBreakdown.total)}đ</span>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          {/* Room total summary */}
          <div className="flex justify-between items-center pt-2 border-t text-sm">
            <span className="text-muted-foreground">{getTotalLabel(state.bookingType)}</span>
            <span className="font-medium text-primary">{formatCurrency(computed.totalRoomPrice)}</span>
          </div>
        </div>
      )}
    </div>
  )
}
