import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Clock, AlertTriangle, Check, User, Phone, CalendarDays, Wallet } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { formatCurrency } from '@/lib/utils'
import { parseTimeToHours } from '@/lib/bookingCalculations'
import { cn } from '@/lib/utils'

// Map booking source codes to friendly labels
const BOOKING_SOURCE_LABELS: Record<string, string> = {
  walk_in: 'Khách vãng lai',
  phone: 'Điện thoại',
  email: 'Email',
  website: 'Website',
  booking_com: 'Booking.com',
  agoda: 'Agoda',
  traveloka: 'Traveloka',
  expedia: 'Expedia',
  airbnb: 'Airbnb',
  other: 'Khác',
}

function getBookingSourceLabel(source: string): string {
  return BOOKING_SOURCE_LABELS[source] || source.replace(/_/g, ' ')
}

interface CheckInConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  guestName: string
  roomNumber: string
  actualCheckInTime: string
  roomPrice: number
  suggestedCharge: number
  bookingType?: 'daily' | 'hourly' | 'monthly'
  bookingHours?: number
  bookingMonths?: number
  onConfirm: (finalCharge: number, adjustmentNote?: string) => void
  isLoading?: boolean
  // New props for full booking info
  checkInDate?: Date
  checkOutDate?: Date
  totalNights?: number
  totalAmount?: number
  depositAmount?: number
  guestPhone?: string | null
  bookingSource?: string | null
}

// Surcharge tier definitions
const EARLY_CHECKIN_TIERS = [
  { id: 'before5', label: 'Trước 05:00', percent: 100, description: '= 1 đêm', minHour: 0, maxHour: 5 },
  { id: '5to9', label: '05:00 - 09:00', percent: 50, description: '', minHour: 5, maxHour: 9 },
  { id: '9to14', label: '09:00 - 14:00', percent: 30, description: '', minHour: 9, maxHour: 14 },
  { id: 'after14', label: 'Sau 14:00', percent: 0, description: 'Miễn phí', minHour: 14, maxHour: 24 },
]

export function CheckInConfirmDialog({
  open,
  onOpenChange,
  guestName,
  roomNumber,
  actualCheckInTime,
  roomPrice,
  suggestedCharge,
  bookingType = 'daily',
  bookingHours,
  bookingMonths,
  onConfirm,
  isLoading = false,
  // New props
  checkInDate,
  checkOutDate,
  totalNights,
  totalAmount = 0,
  depositAmount = 0,
  guestPhone,
  bookingSource,
}: CheckInConfirmDialogProps) {
  const [adjustedCharge, setAdjustedCharge] = useState<number>(suggestedCharge)
  const [adjustmentNote, setAdjustmentNote] = useState('')

  // Reset when dialog opens
  useEffect(() => {
    if (open) {
      setAdjustedCharge(suggestedCharge)
      setAdjustmentNote('')
    }
  }, [open, suggestedCharge])

  // Determine which tier applies - only for daily bookings
  const currentHour = parseTimeToHours(actualCheckInTime)
  const activeTier = bookingType === 'daily' 
    ? EARLY_CHECKIN_TIERS.find(tier => currentHour >= tier.minHour && currentHour < tier.maxHour)
    : null

  // Check if this is early check-in (before 14:00) for daily bookings
  const isEarlyCheckIn = bookingType === 'daily' && currentHour < 14

  // Check if charge was adjusted from suggested
  const isAdjusted = adjustedCharge !== suggestedCharge
  const needsNote = isAdjusted && !adjustmentNote.trim()

  const handleConfirm = () => {
    onConfirm(adjustedCharge, isAdjusted ? adjustmentNote : undefined)
  }

  const handleWaive = () => {
    setAdjustedCharge(0)
  }

  const handleResetToStandard = () => {
    setAdjustedCharge(suggestedCharge)
    setAdjustmentNote('')
  }

  // For hourly/monthly, show simple confirmation without surcharge table
  const isNonDailyBooking = bookingType !== 'daily'
  
  // Calculate remaining balance
  const remainingBalance = totalAmount - depositAmount

  // Get booking type label
  const getBookingTypeLabel = () => {
    switch (bookingType) {
      case 'hourly':
        return `Theo giờ (${bookingHours || 0} giờ)`
      case 'monthly':
        return `Theo tháng (${bookingMonths || 0} tháng)`
      default:
        return `Theo ngày (${totalNights || 0} đêm)`
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Check className="h-5 w-5 text-primary" />
            Xác nhận Check-in
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 pt-1">
              {/* Guest & Room Info */}
              <div className="grid grid-cols-2 gap-3 text-sm px-1">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span>Khách: <strong>{guestName}</strong></span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <span>Phòng: <strong>{roomNumber}</strong></span>
                </div>
                {guestPhone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{guestPhone}</span>
                  </div>
                )}
                {bookingSource && (
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs text-muted-foreground">Nguồn: {getBookingSourceLabel(bookingSource)}</span>
                  </div>
                )}
              </div>

              {/* Booking Details Table */}
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                  THÔNG TIN ĐẶT PHÒNG
                </div>
                <div className="divide-y text-sm">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-muted-foreground">Loại booking</span>
                    <span className="font-medium">{getBookingTypeLabel()}</span>
                  </div>
                  {checkInDate && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Ngày nhận phòng</span>
                      <span>{format(checkInDate, 'dd/MM/yyyy', { locale: vi })}</span>
                    </div>
                  )}
                  {checkOutDate && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Ngày trả phòng</span>
                      <span>{format(checkOutDate, 'dd/MM/yyyy', { locale: vi })}</span>
                    </div>
                  )}
                </div>
                
                {/* Financial Info */}
                <div className="border-t">
                  <div className="divide-y text-sm">
                    {bookingType === 'daily' && roomPrice > 0 && (
                      <div className="flex justify-between px-3 py-2">
                        <span className="text-muted-foreground">Giá phòng</span>
                        <span className="font-mono text-xs">{formatCurrency(roomPrice)}/đêm</span>
                      </div>
                    )}
                    <div className="flex justify-between px-3 py-2">
                      <span className="font-medium">Tổng cộng</span>
                      <span className="font-mono text-xs font-medium">{formatCurrency(totalAmount)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-muted-foreground">Đã đặt cọc</span>
                      <span className="font-mono text-xs text-green-600">{formatCurrency(depositAmount)}</span>
                    </div>
                    <div className="flex justify-between px-3 py-2 bg-muted/30">
                      <span className="font-medium">Còn phải thu</span>
                      <span className={cn(
                        "font-mono text-sm font-bold",
                        remainingBalance > 0 ? "text-amber-600" : "text-green-600"
                      )}>
                        {formatCurrency(remainingBalance)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Check-in Time Status */}
              {isNonDailyBooking ? (
                <div className="p-3 border rounded-lg bg-muted/30 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span>Giờ check-in: <strong>{actualCheckInTime}</strong></span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-green-600" />
                    <span className="text-green-600">
                      {bookingType === 'hourly' 
                        ? 'Không áp dụng phụ thu check-in sớm'
                        : 'Không áp dụng phụ thu thời gian'}
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* Check-in time status for daily bookings */}
                  <div className="flex items-center gap-2 text-sm">
                    {isEarlyCheckIn ? (
                      <>
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span>Giờ check-in: <strong className="text-amber-600">{actualCheckInTime}</strong> (Check-in sớm)</span>
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4 text-green-600" />
                        <span>Giờ check-in: <strong>{actualCheckInTime}</strong></span>
                      </>
                    )}
                  </div>

                  {!isEarlyCheckIn && (
                    <div className="flex items-center gap-2 text-sm text-green-600">
                      <Check className="h-4 w-4" />
                      <span>Không áp dụng phụ thu check-in sớm</span>
                    </div>
                  )}

                  {/* Early Check-in Surcharge Section - only show if early check-in */}
                  {isEarlyCheckIn && (
                    <>
                      <Separator />

                      {/* Surcharge Tiers Table */}
                      <div className="border rounded-lg overflow-hidden">
                        <div className="bg-muted/50 px-3 py-2 text-xs font-medium">
                          BẢNG PHỤ THU CHECK-IN SỚM
                        </div>
                        <div className="divide-y">
                          {EARLY_CHECKIN_TIERS.map((tier) => {
                            const isActive = tier.id === activeTier?.id
                            const tierAmount = Math.round(roomPrice * tier.percent / 100)
                            return (
                              <div
                                key={tier.id}
                                className={cn(
                                  "flex items-center justify-between px-3 py-2 text-sm",
                                  isActive && "bg-amber-50 dark:bg-amber-950/30 border-l-2 border-l-amber-500"
                                )}
                              >
                                <div className="flex items-center gap-2">
                                  {isActive && <Check className="h-4 w-4 text-amber-600" />}
                                  <span className={cn(isActive && "font-medium")}>{tier.label}</span>
                                  {tier.description && (
                                    <span className="text-xs text-muted-foreground">({tier.description})</span>
                                  )}
                                </div>
                                <span className={cn("font-mono text-xs", isActive && "font-medium text-amber-600")}>
                                  {tier.percent}% = {formatCurrency(tierAmount)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Editable Charge */}
                      <div className="space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-sm">
                              Phụ thu áp dụng ({activeTier?.percent || 0}%)
                            </Label>
                            <div className="flex items-center gap-1">
                              <Input
                                type="text"
                                inputMode="numeric"
                                className="w-36 h-8 text-right font-mono text-xs"
                                value={adjustedCharge > 0 ? new Intl.NumberFormat('vi-VN').format(adjustedCharge) : ''}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/[^0-9]/g, '')
                                  setAdjustedCharge(parseInt(value) || 0)
                                }}
                                placeholder="0"
                              />
                              <span className="text-xs text-muted-foreground">₫</span>
                            </div>
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleWaive}
                            className="flex-1 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800 hover:bg-green-50 dark:hover:bg-green-950"
                            disabled={adjustedCharge === 0}
                          >
                            Miễn phí
                          </Button>
                          {isAdjusted && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={handleResetToStandard}
                              className="flex-1"
                            >
                              Theo chuẩn ({formatCurrency(suggestedCharge)})
                            </Button>
                          )}
                        </div>

                        {/* Adjustment Note (required if changed) */}
                        {isAdjusted && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-amber-600 dark:text-amber-400">
                              Lý do điều chỉnh {needsNote && '*'}
                            </Label>
                            <Textarea
                              placeholder="VD: Khách quen, đặt phòng lâu dài..."
                              className="h-16 text-sm"
                              value={adjustmentNote}
                              onChange={(e) => setAdjustmentNote(e.target.value)}
                            />
                            {needsNote && (
                              <p className="text-xs text-destructive">Vui lòng nhập lý do điều chỉnh phí</p>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel disabled={isLoading}>Hủy</AlertDialogCancel>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || needsNote}
          >
            {isLoading ? 'Đang xử lý...' : 'Xác nhận Check-in'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
