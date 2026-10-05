import { useState, useEffect } from 'react'
import { format, addDays, startOfDay, isBefore, parseISO, differenceInCalendarDays } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency, cn } from '@/lib/utils'
import { useBookingConflictCheck } from '@/hooks/useBookingConflicts'
import { ConflictWarningSection } from './ConflictWarningSection'
import { getFriendlyError } from '@/lib/errorMessage'

interface ExtendBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: {
    id: string
    guest_name: string
    room_id: string
    check_in_date: string
    check_out_date: string
    room_price?: number
    total_amount?: number
    room?: {
      room_number: string
    }
  } | null
  onSuccess?: () => void
}

export function ExtendBookingDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
  onCheckoutNow,
  onTransferRoom,
}: ExtendBookingDialogProps & {
  onCheckoutNow?: () => void
  onTransferRoom?: () => void
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [newCheckOutDate, setNewCheckOutDate] = useState<Date | undefined>(undefined)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  
  // Check for conflicting booking when dialog opens
  const { data: conflictBooking, isLoading: isCheckingConflict } = useBookingConflictCheck(
    booking?.room_id,
    booking?.id,
    open && !!booking
  )
  
  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setNewCheckOutDate(undefined)
      setValidationError(null)
    }
  }, [open])

  if (!booking) return null

  // Parse dates correctly using date-fns (timezone-safe)
  const today = startOfDay(new Date())
  const currentCheckOut = startOfDay(parseISO(booking.check_out_date))
  
  // Calculate overdue nights (hotel standard: count nights, not days)
  const nightsOverdue = differenceInCalendarDays(today, currentCheckOut)
  
  const roomPrice = (booking as any).room_price || 0
  
  // Minimum checkout: today if overdue (to formalize and checkout immediately), otherwise tomorrow
  const minNewCheckout = nightsOverdue > 0 ? today : addDays(today, 1)
  
  // Calculate additional nights from old checkout to new checkout
  const additionalNights = newCheckOutDate 
    ? differenceInCalendarDays(startOfDay(newCheckOutDate), currentCheckOut)
    : 0
  const additionalCost = additionalNights * roomPrice

  const handleDateSelect = async (date: Date | undefined) => {
    setNewCheckOutDate(date)
    setValidationError(null)

    if (!date) return

    // Validate no overlap with other bookings
    const { data, error } = await supabase.rpc('validate_booking_dates', {
      p_room_id: booking.room_id,
      p_check_in: booking.check_in_date,
      p_check_out: format(date, 'yyyy-MM-dd'),
      p_exclude_booking_id: booking.id,
    })

    if (error) {
      console.error('Validation error:', error)
      return
    }

    const result = data as { valid: boolean; message?: string }
    if (!result.valid) {
      setValidationError(result.message || 'Phòng đã có lịch đặt trong khoảng thời gian này')
    }
  }

  const handleExtend = async () => {
    if (!newCheckOutDate || validationError) return

    setIsSubmitting(true)
    try {
      // Update booking checkout date
      const currentTotal = (booking as any).total_amount || 0
      const { error } = await supabase
        .from('room_bookings')
        .update({
          check_out_date: format(newCheckOutDate, 'yyyy-MM-dd'),
          total_amount: currentTotal + additionalCost,
          notes: `${(booking as any).notes || ''}\n[Gia hạn từ ${format(currentCheckOut, 'dd/MM/yyyy')} → ${format(newCheckOutDate, 'dd/MM/yyyy')} | +${additionalNights} đêm, +${additionalCost.toLocaleString('vi-VN')}đ]`.trim(),
        })
        .eq('id', booking.id)

      if (error) throw error

      toast({ 
        title: 'Gia hạn thành công',
        description: `Đã gia hạn đến ${format(newCheckOutDate, 'dd/MM/yyyy')}`,
      })

      queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      onSuccess?.()
      onOpenChange(false)
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Lỗi gia hạn',
        description: getFriendlyError(error)?.includes('overlap') 
          ? 'Không thể gia hạn do trùng lịch với booking khác'
          : error.message,
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const hasConflict = !!conflictBooking
  
  const handleContactGuest = () => {
    if (conflictBooking?.guest_phone) {
      window.open(`tel:${conflictBooking.guest_phone}`, '_self')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(cn("max-w-md", hasConflict && "max-w-lg"), "max-h-[90dvh] overflow-y-auto")}>
        <DialogHeader>
          <DialogTitle>
            Gia hạn phòng {booking.room?.room_number}
          </DialogTitle>
          <DialogDescription>
            Quá hạn {nightsOverdue} đêm · Cần gia hạn trước khi checkout
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Conflict Warning - show first if exists */}
          {hasConflict && conflictBooking && (
            <ConflictWarningSection
              nextBooking={conflictBooking}
              onCheckoutNow={onCheckoutNow}
              onTransferRoom={onTransferRoom}
              onContactGuest={handleContactGuest}
              showActions={true}
            />
          )}
          
          {/* Booking info - compact */}
          <div className="rounded-lg border p-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Khách:</span>
              <span className="font-medium">{booking.guest_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Checkout cũ:</span>
              <span className="font-medium text-red-600">
                {format(currentCheckOut, 'dd/MM/yyyy', { locale: vi })}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quá hạn:</span>
              <span className="font-medium text-red-600">
                {nightsOverdue} đêm ({format(currentCheckOut, 'dd/MM')} → {format(today, 'dd/MM')})
              </span>
            </div>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Chọn ngày trả phòng mới</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal',
                    !newCheckOutDate && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {newCheckOutDate ? (
                    format(newCheckOutDate, 'dd/MM/yyyy', { locale: vi })
                  ) : (
                    'Chọn ngày'
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={newCheckOutDate}
                  onSelect={handleDateSelect}
                  disabled={(date) => isBefore(date, minNewCheckout)}
                  initialFocus
                  className="pointer-events-auto"
                />
              </PopoverContent>
            </Popover>
            {validationError && (
              <p className="text-sm text-red-600">{validationError}</p>
            )}
          </div>

          {/* Cost preview */}
          {newCheckOutDate && !validationError && (
            <div className="rounded-lg border p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">
                  {additionalNights} đêm × {formatCurrency(roomPrice)}
                </span>
                <span className="font-semibold">{formatCurrency(additionalCost)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button 
            onClick={handleExtend} 
            disabled={!newCheckOutDate || !!validationError || isSubmitting}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Gia hạn
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
