import { format, addMonths, addHours, setHours, setMinutes } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar as CalendarIcon, Clock, Moon, Timer, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Label } from '@/components/ui/label'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { cn } from '@/lib/utils'
import { TIME_OPTIONS } from '@/lib/constants'
import { 
  BookingFormState, 
  BookingFormComputed, 
  BookingType,
  HOURLY_MIN_HOURS,
  HOURLY_MAX_HOURS,
  HOURLY_TIME_SLOTS,
  MONTHLY_DISCOUNTS,
} from '../types'

interface DateTimeStepProps {
  state: BookingFormState
  computed: BookingFormComputed
  onUpdate: (data: Partial<BookingFormState>) => void
}

const BOOKING_TYPE_OPTIONS: { value: BookingType; label: string; icon: React.ReactNode; description: string }[] = [
  { value: 'daily', label: 'Theo ngày', icon: <Moon className="h-4 w-4" />, description: 'Đặt phòng qua đêm' },
  { value: 'hourly', label: 'Theo giờ', icon: <Timer className="h-4 w-4" />, description: '2-8 giờ trong ngày' },
  { value: 'monthly', label: 'Theo tháng', icon: <CalendarDays className="h-4 w-4" />, description: 'Thuê dài hạn' },
]

const MONTH_OPTIONS = [1, 2, 3, 6, 12]
const HOUR_OPTIONS = Array.from({ length: HOURLY_MAX_HOURS - HOURLY_MIN_HOURS + 1 }, (_, i) => i + HOURLY_MIN_HOURS)

export function DateTimeStep({ state, computed, onUpdate }: DateTimeStepProps) {
  const handleBookingTypeChange = (type: BookingType) => {
    onUpdate({ 
      bookingType: type,
      // Reset room selection when type changes
      selectedRooms: [],
    })
  }

  return (
    <div className="space-y-6">
      {/* Booking Type Selector */}
      <div className="space-y-3">
        <Label className="text-sm font-medium">Loại đặt phòng *</Label>
        <RadioGroup
          value={state.bookingType}
          onValueChange={(v) => handleBookingTypeChange(v as BookingType)}
          className="grid grid-cols-3 gap-3"
        >
          {BOOKING_TYPE_OPTIONS.map((option) => (
            <div key={option.value}>
              <RadioGroupItem
                value={option.value}
                id={option.value}
                className="peer sr-only"
              />
              <Label
                htmlFor={option.value}
                className={cn(
                  "flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 cursor-pointer",
                  "hover:bg-accent hover:text-accent-foreground",
                  "peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5",
                  "transition-all"
                )}
              >
                <div className="flex items-center gap-2 font-medium text-secondary-foreground">
                  {option.icon}
                  {option.label}
                </div>
                <span className="text-xs text-muted-foreground mt-1">{option.description}</span>
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Daily Booking Form */}
      {state.bookingType === 'daily' && (
        <DailyBookingForm state={state} computed={computed} onUpdate={onUpdate} />
      )}

      {/* Hourly Booking Form */}
      {state.bookingType === 'hourly' && (
        <HourlyBookingForm state={state} computed={computed} onUpdate={onUpdate} />
      )}

      {/* Monthly Booking Form */}
      {state.bookingType === 'monthly' && (
        <MonthlyBookingForm state={state} computed={computed} onUpdate={onUpdate} />
      )}
    </div>
  )
}

// Daily booking form (existing logic)
function DailyBookingForm({ state, computed, onUpdate }: DateTimeStepProps) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Check-in Date & Time */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Check-in *
          </Label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "flex-1 justify-start text-left font-normal",
                    !state.checkInDate && "text-muted-foreground"
                  )}
                >
                  {state.checkInDate ? format(state.checkInDate, 'dd/MM/yyyy', { locale: vi }) : "Chọn ngày"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={state.checkInDate}
                  onSelect={(date) => onUpdate({ checkInDate: date })}
                  locale={vi}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Select value={state.checkInTime} onValueChange={(v) => onUpdate({ checkInTime: v })}>
              <SelectTrigger className="w-24">
                <Clock className="h-4 w-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map(time => (
                  <SelectItem key={time} value={time}>{time}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* Check-out Date & Time */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Check-out *
          </Label>
          <div className="flex gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    "flex-1 justify-start text-left font-normal",
                    !state.checkOutDate && "text-muted-foreground"
                  )}
                >
                  {state.checkOutDate ? format(state.checkOutDate, 'dd/MM/yyyy', { locale: vi }) : "Chọn ngày"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={state.checkOutDate}
                  onSelect={(date) => onUpdate({ checkOutDate: date })}
                  disabled={(date) => state.checkInDate ? date <= state.checkInDate : false}
                  locale={vi}
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            <Select value={state.checkOutTime} onValueChange={(v) => onUpdate({ checkOutTime: v })}>
              <SelectTrigger className="w-24">
                <Clock className="h-4 w-4 mr-1" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map(time => (
                  <SelectItem key={time} value={time}>{time}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      
      {computed.nights > 0 && (
        <div className="p-4 bg-primary/5 rounded-lg text-center">
          <span className="text-sm text-muted-foreground">Số đêm:</span>
          <span className="ml-2 text-2xl font-bold text-primary">{computed.nights}</span>
          <span className="ml-1 text-sm text-muted-foreground">đêm</span>
        </div>
      )}
    </div>
  )
}

// Hourly booking form
function HourlyBookingForm({ state, computed, onUpdate }: DateTimeStepProps) {
  // Calculate end time display
  const getEndTime = () => {
    if (!state.hourlyStartTime || !state.bookingHours) return null
    const [hours, minutes] = state.hourlyStartTime.split(':').map(Number)
    const endHour = hours + state.bookingHours
    if (endHour >= 24) return `${String(endHour - 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')} (+1 ngày)`
    return `${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
  }

  // Check if a time slot is in the past (for today's date)
  const isTimeSlotDisabled = (time: string) => {
    if (!state.hourlyDate) return false
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const selectedDate = new Date(state.hourlyDate.getFullYear(), state.hourlyDate.getMonth(), state.hourlyDate.getDate())
    
    // If not today, all time slots are available
    if (selectedDate.getTime() !== today.getTime()) return false
    
    // If today, disable time slots that are in the past
    const [slotHour, slotMin] = time.split(':').map(Number)
    const currentHour = now.getHours()
    const currentMin = now.getMinutes()
    
    // Disable if slot hour is before current hour, or same hour but slot minute is before current minute
    return slotHour < currentHour || (slotHour === currentHour && slotMin < currentMin)
  }

  // Get available time slots
  const availableTimeSlots = HOURLY_TIME_SLOTS.filter(time => !isTimeSlotDisabled(time))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        {/* Date */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Ngày *
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !state.hourlyDate && "text-muted-foreground"
                )}
              >
                {state.hourlyDate ? format(state.hourlyDate, 'dd/MM/yyyy', { locale: vi }) : "Chọn ngày"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={state.hourlyDate}
                onSelect={(date) => {
                  onUpdate({ hourlyDate: date })
                  // Reset start time if selected date changes and current time is invalid
                  if (date && state.hourlyStartTime && isTimeSlotDisabled(state.hourlyStartTime)) {
                    const firstAvailable = HOURLY_TIME_SLOTS.find(t => !isTimeSlotDisabled(t))
                    if (firstAvailable) {
                      onUpdate({ hourlyStartTime: firstAvailable })
                    }
                  }
                }}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                locale={vi}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Start Time */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Giờ bắt đầu *
          </Label>
          <Select 
            value={state.hourlyStartTime} 
            onValueChange={(v) => onUpdate({ hourlyStartTime: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn giờ" />
            </SelectTrigger>
            <SelectContent>
              {HOURLY_TIME_SLOTS.map(time => (
                <SelectItem 
                  key={time} 
                  value={time}
                  disabled={isTimeSlotDisabled(time)}
                >
                  {time}
                  {isTimeSlotDisabled(time) && ' (đã qua)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state.hourlyDate && availableTimeSlots.length === 0 && (
            <p className="text-xs text-destructive">Không còn khung giờ khả dụng hôm nay</p>
          )}
        </div>

        {/* Hours */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <Timer className="h-4 w-4" />
            Số giờ *
          </Label>
          <Select 
            value={state.bookingHours.toString()} 
            onValueChange={(v) => onUpdate({ bookingHours: parseInt(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {HOUR_OPTIONS.map(h => (
                <SelectItem key={h} value={h.toString()}>{h} giờ</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {state.hourlyDate && state.hourlyStartTime && state.bookingHours > 0 && (
        <div className="p-4 bg-primary/5 rounded-lg">
          <div className="flex items-center justify-center gap-4">
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Từ</div>
              <div className="text-lg font-semibold">{state.hourlyStartTime}</div>
            </div>
            <div className="text-muted-foreground">→</div>
            <div className="text-center">
              <div className="text-sm text-muted-foreground">Đến</div>
              <div className="text-lg font-semibold">{getEndTime()}</div>
            </div>
            <div className="text-muted-foreground">|</div>
            <div className="text-center">
              <span className="text-2xl font-bold text-primary">{state.bookingHours}</span>
              <span className="ml-1 text-sm text-muted-foreground">giờ</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Monthly booking form
function MonthlyBookingForm({ state, computed, onUpdate }: DateTimeStepProps) {
  // Calculate end date
  const getEndDate = () => {
    if (!state.monthlyStartDate || !state.bookingMonths) return null
    return addMonths(state.monthlyStartDate, state.bookingMonths)
  }

  const discount = MONTHLY_DISCOUNTS[state.bookingMonths] || 0

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        {/* Start Date */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4" />
            Ngày bắt đầu *
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !state.monthlyStartDate && "text-muted-foreground"
                )}
              >
                {state.monthlyStartDate ? format(state.monthlyStartDate, 'dd/MM/yyyy', { locale: vi }) : "Chọn ngày"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={state.monthlyStartDate}
                onSelect={(date) => onUpdate({ monthlyStartDate: date })}
                disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                locale={vi}
                className="pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Number of Months */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            Số tháng *
          </Label>
          <Select 
            value={state.bookingMonths.toString()} 
            onValueChange={(v) => onUpdate({ bookingMonths: parseInt(v) })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_OPTIONS.map(m => {
                const discountRate = MONTHLY_DISCOUNTS[m] || 0
                return (
                  <SelectItem key={m} value={m.toString()}>
                    {m} tháng {discountRate > 0 && <span className="text-green-600 ml-1">(-{discountRate}%)</span>}
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        </div>
      </div>

      {state.monthlyStartDate && state.bookingMonths > 0 && (
        <div className="p-4 bg-primary/5 rounded-lg">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-muted-foreground">Thời hạn thuê</div>
              <div className="font-medium">
                {format(state.monthlyStartDate, 'dd/MM/yyyy', { locale: vi })} → {format(getEndDate()!, 'dd/MM/yyyy', { locale: vi })}
              </div>
            </div>
            <div className="text-center">
              <span className="text-2xl font-bold text-primary">{state.bookingMonths}</span>
              <span className="ml-1 text-sm text-muted-foreground">tháng</span>
            </div>
            {discount > 0 && (
              <div className="text-center">
                <div className="text-sm text-green-600 font-medium">Giảm {discount}%</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
