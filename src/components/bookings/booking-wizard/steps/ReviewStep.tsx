import { format, addHours } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar, Building2, User, Globe, CreditCard, CheckCircle2, Edit2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import { BOOKING_SOURCES, OTA_PAYMENT_TYPES } from '@/lib/constants'
import { BookingFormState, BookingFormComputed, WizardStep } from '../types'

interface ReviewStepProps {
  state: BookingFormState
  computed: BookingFormComputed
  onGoToStep: (step: WizardStep) => void
}

export function ReviewStep({ state, computed, onGoToStep }: ReviewStepProps) {
  const { isOtaSource, nights, hours, months, estimatedTotal, otaCommissionAmount, netRevenue } = computed
  
  // Get labels
  const sourceLabel = BOOKING_SOURCES.find(s => s.value === state.bookingSource)?.label || state.bookingSource
  const paymentTypeLabel = OTA_PAYMENT_TYPES.find(t => t.value === state.otaPaymentType)?.label || state.otaPaymentType
  
  // Determine payment status text
  let paymentStatusText = 'Chờ thanh toán'
  let paymentStatusColor = 'text-amber-600'
  
  if (isOtaSource && state.otaPaymentType === 'prepaid') {
    paymentStatusText = '✓ Đã thanh toán qua OTA'
    paymentStatusColor = 'text-green-600'
  } else if (isOtaSource && state.otaPaymentType === 'partial_prepaid' && state.otaPaidAmount > 0) {
    paymentStatusText = `OTA đã thu ${formatCurrency(state.otaPaidAmount)}`
    paymentStatusColor = 'text-blue-600'
  } else if (state.depositAmount >= estimatedTotal) {
    paymentStatusText = '✓ Đã thanh toán đủ'
    paymentStatusColor = 'text-green-600'
  } else if (state.depositAmount > 0) {
    paymentStatusText = `Đã đặt cọc ${formatCurrency(state.depositAmount)}`
    paymentStatusColor = 'text-blue-600'
  }

  // Format duration based on booking type
  const renderDurationInfo = () => {
    switch (state.bookingType) {
      case 'hourly': {
        const startTime = state.hourlyStartTime
        const endTime = state.hourlyDate 
          ? format(addHours(
              new Date(`${format(state.hourlyDate, 'yyyy-MM-dd')}T${startTime}`), 
              state.bookingHours
            ), 'HH:mm')
          : ''
        return (
          <>
            <span className="font-medium">
              {state.hourlyDate && format(state.hourlyDate, 'dd/MM/yyyy', { locale: vi })}
            </span>
            <span className="mx-2 text-muted-foreground">|</span>
            <span className="font-medium">{startTime}</span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="font-medium">{endTime}</span>
            <span className="ml-2 text-muted-foreground">({hours} giờ)</span>
          </>
        )
      }
      case 'monthly': {
        return (
          <>
            <span className="font-medium">
              {state.monthlyStartDate && format(state.monthlyStartDate, 'dd/MM/yyyy', { locale: vi })}
            </span>
            <span className="ml-2 text-muted-foreground">({months} tháng)</span>
          </>
        )
      }
      case 'daily':
      default:
        return (
          <>
            <span className="font-medium">
              {state.checkInDate && format(state.checkInDate, 'dd/MM/yyyy', { locale: vi })} {state.checkInTime}
            </span>
            <span className="mx-2 text-muted-foreground">→</span>
            <span className="font-medium">
              {state.checkOutDate && format(state.checkOutDate, 'dd/MM/yyyy', { locale: vi })} {state.checkOutTime}
            </span>
            <span className="ml-2 text-muted-foreground">({nights} đêm)</span>
          </>
        )
    }
  }

  const getBookingTypeLabel = () => {
    switch (state.bookingType) {
      case 'hourly': return 'Theo giờ'
      case 'monthly': return 'Theo tháng'
      default: return 'Theo ngày'
    }
  }

  return (
    <div className="space-y-4">
      <div className="text-center pb-2">
        <h3 className="text-lg font-semibold">Xác nhận đặt phòng</h3>
        <p className="text-sm text-muted-foreground">Kiểm tra lại thông tin trước khi xác nhận</p>
      </div>
      
      {/* Date & Time Section */}
      <div className="p-3 border rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Thời gian ({getBookingTypeLabel()})</span>
          </div>
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => onGoToStep(1)}
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Sửa
          </Button>
        </div>
        <div className="text-sm">
          {renderDurationInfo()}
        </div>
      </div>
      
      {/* Rooms Section */}
      <div className="p-3 border rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Phòng đã chọn</span>
          </div>
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => onGoToStep(2)}
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Sửa
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {state.selectedRooms.map(room => (
            <div key={room.id} className="px-2 py-1 bg-primary/10 rounded text-sm">
              <span className="font-medium">{room.room_number}</span>
              <span className="text-muted-foreground ml-1">
                ({formatCurrency(room.customPrice)}/{state.bookingType === 'hourly' ? 'giờ' : state.bookingType === 'monthly' ? 'tháng' : 'đêm'})
              </span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Guest Info Section */}
      <div className="p-3 border rounded-lg space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Thông tin khách</span>
          </div>
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => onGoToStep(3)}
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Sửa
          </Button>
        </div>
        <div className="text-sm space-y-1">
          <div><span className="font-medium">{state.guestName}</span> • {state.guestCount} khách</div>
          {(state.guestPhone || state.guestEmail) && (
            <div className="text-muted-foreground">
              {state.guestPhone && <span>{state.guestPhone}</span>}
              {state.guestPhone && state.guestEmail && <span className="mx-2">•</span>}
              {state.guestEmail && <span>{state.guestEmail}</span>}
            </div>
          )}
          {state.guestIdNumber && (
            <div className="text-muted-foreground">
              {state.guestIdType === 'cccd' ? 'CCCD' : state.guestIdType === 'passport' ? 'Hộ chiếu' : state.guestIdType === 'visa' ? 'Visa' : 'GT'}: {state.guestIdNumber}
              {state.guestNationality && <span className="ml-2">• {state.guestNationality}</span>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Globe className="h-3 w-3" />
            <span className="text-muted-foreground">Nguồn: {sourceLabel}</span>
            {isOtaSource && <span className="text-muted-foreground">({paymentTypeLabel})</span>}
          </div>
          {state.notes && (
            <div className="text-muted-foreground italic">Ghi chú: {state.notes}</div>
          )}
        </div>
      </div>
      
      {/* Payment Summary Section */}
      <div className="p-3 border rounded-lg bg-primary/5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Thanh toán</span>
          </div>
          <Button 
            type="button" 
            variant="ghost" 
            size="sm" 
            className="h-7 text-xs"
            onClick={() => onGoToStep(4)}
          >
            <Edit2 className="h-3 w-3 mr-1" />
            Sửa
          </Button>
        </div>
        
        <div className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tổng tiền:</span>
            <span className="font-semibold text-primary">{formatCurrency(estimatedTotal)}</span>
          </div>
          
          <div className="flex justify-between">
            <span className="text-muted-foreground">Trạng thái:</span>
            <span className={paymentStatusColor}>{paymentStatusText}</span>
          </div>
          
          {isOtaSource && otaCommissionAmount > 0 && (
            <>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Hoa hồng OTA ({state.otaCommissionRate}%):</span>
                <span className="text-red-600">-{formatCurrency(otaCommissionAmount)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t">
                <span className="font-medium">Doanh thu thực:</span>
                <span className="font-semibold text-green-600">{formatCurrency(netRevenue)}</span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
