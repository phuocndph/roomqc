import { useCallback } from 'react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  CheckCircle, Clock, Check, ChevronDown, ChevronUp, Printer,
} from 'lucide-react'
import { differenceInDays } from 'date-fns'
import { formatVNCurrency } from '@/lib/pricing'
import { cn } from '@/lib/utils'
import { isEarlyCheckout } from '@/lib/bookingCalculations'
import { DamageChargesSection } from '../DamageChargesSection'
import { InspectionStatusCard } from '../InspectionStatusCard'
import type { GroupBookingRoom } from '@/hooks/useGroupBooking'
import type { GroupRoomCostBreakdown } from '@/hooks/useGroupCheckoutCalculations'
import type { OnShiftStaffMember } from '@/hooks/useOnShiftStaffList'
import type { StaffWithStatus } from '@/hooks/useStaffStatus'

// Late checkout tiers
const LATE_CHECKOUT_TIERS = [
  { id: 'before12', label: 'Trước 12:00', percent: 0, description: 'Miễn phí', minHour: 0, maxHour: 12 },
  { id: '12to15', label: '12:00 - 15:00', percent: 30, description: '', minHour: 12, maxHour: 15 },
  { id: '15to18', label: '15:00 - 18:00', percent: 50, description: '', minHour: 15, maxHour: 18 },
  { id: 'after18', label: 'Sau 18:00', percent: 100, description: '= 1 đêm', minHour: 18, maxHour: 24 },
]

interface InspectionStatus {
  bookingId: string
  roomId: string
  status: 'pending' | 'in_progress' | 'completed' | 'not_requested' | 'cancelled'
  damageCharge?: number
  inspectionId?: string
  startedAt?: string
  createdAt?: string
  assignedTo?: string
}

interface GroupCheckoutRoomCardProps {
  booking: GroupBookingRoom
  inspection?: InspectionStatus
  cost?: GroupRoomCostBreakdown
  isSelected: boolean
  isExpanded: boolean
  assignedStaff?: string
  staffList: OnShiftStaffMember[]
  isProcessing: boolean
  onSelect: (bookingId: string, checked: boolean) => void
  onToggleExpand: (bookingId: string) => void
  onStaffChange: (bookingId: string, staffId: string) => void
  onAdjustLateCharge: (bookingId: string, amount: number, note: string) => void
  onAdjustDamageItemCharge: (bookingId: string, itemId: string, amount: number) => void
  onSetDamageNote: (bookingId: string, note: string) => void
  onPrintReport: (bookingId: string) => void
  onViewStaffDetail: (staff: StaffWithStatus) => void
  onCancelInspection: (inspectionId: string) => Promise<void>
}

function formatNumberWithSeparator(value: number): string {
  if (value === 0) return ''
  return new Intl.NumberFormat('vi-VN').format(value)
}

export function GroupCheckoutRoomCard({
  booking,
  inspection,
  cost,
  isSelected,
  isExpanded,
  assignedStaff,
  staffList,
  isProcessing,
  onSelect,
  onToggleExpand,
  onStaffChange,
  onAdjustLateCharge,
  onAdjustDamageItemCharge,
  onSetDamageNote,
  onPrintReport,
  onViewStaffDetail,
  onCancelInspection,
}: GroupCheckoutRoomCardProps) {
  const isCheckedOut = booking.status === 'checked_out'
  const bookingType = (booking.booking_type as 'daily' | 'hourly' | 'monthly') || 'daily'
  const needsStaffAssignment = isSelected && !isCheckedOut && (!inspection || inspection.status === 'not_requested')
  
  const currentHour = new Date().getHours()
  const activeTier = LATE_CHECKOUT_TIERS.find(
    tier => currentHour >= tier.minHour && currentHour < tier.maxHour
  )

  const isEarly = (() => {
    if (bookingType !== 'daily') return false
    return isEarlyCheckout(new Date(), new Date(booking.check_out_date))
  })()

  const checkIn = new Date(booking.check_in_date)
  const checkOut = new Date(booking.check_out_date)
  const nights = Math.max(1, differenceInDays(checkOut, checkIn))
  const roomSubtotal = cost?.costBreakdown.totalAmount || booking.total_amount || 0

  const getInspectionStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle className="h-3 w-3" />Đã kiểm tra</span>
      case 'in_progress':
        return <span className="flex items-center gap-1 text-xs text-blue-600"><Clock className="h-3 w-3 animate-pulse" />Đang kiểm tra</span>
      case 'pending':
        return <span className="flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3 w-3" />Chờ kiểm tra</span>
      default:
        return <span className="text-xs text-muted-foreground">Chưa gửi</span>
    }
  }

  return (
    <div
      className={cn(
        "border rounded-lg overflow-hidden transition-colors",
        isCheckedOut && "bg-muted/50 opacity-60",
        isSelected && !isCheckedOut && "border-primary/30"
      )}
    >
      <div className="flex items-start gap-3 p-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(booking.id, !!checked)}
          disabled={isCheckedOut}
          className="mt-0.5"
        />
        
        <Collapsible open={isExpanded} onOpenChange={() => !isCheckedOut && onToggleExpand(booking.id)} className="flex-1">
          <CollapsibleTrigger asChild>
            <div className="flex items-center justify-between cursor-pointer hover:bg-muted/30 -mx-1 px-1 rounded">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">P.{booking.room?.room_number}</span>
                <span className="text-xs text-muted-foreground capitalize">{bookingType === 'daily' ? 'Ngày' : bookingType === 'hourly' ? 'Giờ' : 'Tháng'}</span>
                {isCheckedOut ? (
                  <span className="text-xs text-muted-foreground">Đã trả</span>
                ) : (
                  getInspectionStatusBadge(inspection?.status || 'not_requested')
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">{formatVNCurrency(roomSubtotal)}</span>
                {!isCheckedOut && (isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
              </div>
            </div>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            {!isCheckedOut && (
              <div className="mt-3 space-y-3 border-t pt-3">
                {/* Staff Assignment */}
                {needsStaffAssignment && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">NV kiểm tra:</Label>
                    <Select value={assignedStaff || ''} onValueChange={(value) => onStaffChange(booking.id, value)}>
                      <SelectTrigger className="h-8 text-xs flex-1">
                        <SelectValue placeholder="Chọn nhân viên..." />
                      </SelectTrigger>
                      <SelectContent>
                        {staffList.map(staff => (
                          <SelectItem key={staff.id} value={staff.id}>
                            <div className="flex items-center gap-2">
                              <Avatar className="h-5 w-5">
                                <AvatarImage src={staff.avatar_url || undefined} />
                                <AvatarFallback className="text-xs">{staff.full_name?.[0]}</AvatarFallback>
                              </Avatar>
                              <span>{staff.full_name}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Inspection Status Card */}
                {isSelected && inspection && ['pending', 'in_progress', 'completed'].includes(inspection.status) && (
                  <InspectionStatusCard
                    inspection={inspection}
                    staffList={staffList}
                    onViewDetail={(staff) => onViewStaffDetail(staff as unknown as StaffWithStatus)}
                    onCancelInspection={onCancelInspection}
                    isProcessing={isProcessing}
                  />
                )}

                {/* Late Checkout Tiers - only show active tier by default */}
                {bookingType === 'daily' && (
                  <>
                    {isEarly ? (
                      <div className="flex items-center gap-2 text-green-600 text-sm py-1">
                        <Check className="h-3.5 w-3.5" />
                        <span className="font-medium">Checkout sớm - Không phụ thu</span>
                      </div>
                    ) : currentHour <= 12 ? (
                      <div className="flex items-center gap-2 text-green-600 text-sm py-1">
                        <Check className="h-3.5 w-3.5" />
                        <span className="font-medium">Checkout đúng giờ</span>
                      </div>
                    ) : activeTier ? (
                      <div className="border rounded-lg p-2.5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Check className="h-3.5 w-3.5 text-amber-600" />
                            <span className="text-sm font-medium">{activeTier.label}</span>
                            {activeTier.description && <span className="text-xs text-muted-foreground">({activeTier.description})</span>}
                          </div>
                          <span className="font-mono text-sm font-medium text-amber-600">
                            {activeTier.percent}% = {formatVNCurrency(Math.round((booking.room_price || 0) * activeTier.percent / 100))}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </>
                )}

                {/* Cost Breakdown */}
                <div className="space-y-2">
                  <h4 className="font-medium text-xs text-muted-foreground uppercase">Chi tiết thanh toán</h4>
                  
                  {/* Room charges by type */}
                  {bookingType === 'hourly' ? (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tiền phòng ({booking.booking_hours || 0} giờ × {formatVNCurrency(booking.hourly_rate || 0)})</span>
                      <span className="font-mono">{formatVNCurrency(cost?.costBreakdown.roomTotal || 0)}</span>
                    </div>
                  ) : bookingType === 'monthly' ? (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tiền phòng ({booking.booking_months || 0} tháng × {formatVNCurrency(booking.monthly_rate || 0)})</span>
                        <span className="font-mono">{formatVNCurrency(cost?.costBreakdown.roomTotal || 0)}</span>
                      </div>
                      {cost?.costBreakdown.monthlyDiscount && cost.costBreakdown.monthlyDiscount > 0 && (
                        <div className="flex justify-between text-sm text-green-600">
                          <span>Chiết khấu dài hạn</span>
                          <span>-{formatVNCurrency(cost.costBreakdown.monthlyDiscount)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tiền phòng ({nights} đêm × {formatVNCurrency(booking.room_price || 0)})</span>
                      <span className="font-mono">{formatVNCurrency(cost?.costBreakdown.roomTotal || 0)}</span>
                    </div>
                  )}
                  
                  {/* Early checkin surcharge */}
                  {cost && (cost.costBreakdown.earlyCheckinCharge || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Phụ thu check-in sớm</span>
                      <span className="font-mono">{formatVNCurrency(cost.costBreakdown.earlyCheckinCharge)}</span>
                    </div>
                  )}

                  {/* Editable late checkout charge - daily */}
                  {bookingType === 'daily' && !isEarly && currentHour > 12 && cost && cost.lateCheckoutCharge > 0 && (
                    <div className="p-2.5 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-amber-600">Phụ thu checkout trễ ({activeTier?.percent || 0}%)</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            className="w-28 h-8 text-right font-mono text-sm"
                            value={formatNumberWithSeparator(cost.adjustedLateCharge)}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '')
                              onAdjustLateCharge(booking.id, parseInt(value) || 0, cost.lateAdjustmentNote)
                            }}
                            placeholder="0"
                          />
                          <span className="text-sm text-muted-foreground">₫</span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => onAdjustLateCharge(booking.id, 0, cost.lateAdjustmentNote)} className="h-7 text-xs text-green-600" disabled={cost.adjustedLateCharge === 0}>
                          Miễn phí
                        </Button>
                        {cost.adjustedLateCharge !== cost.lateCheckoutCharge && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => onAdjustLateCharge(booking.id, cost.lateCheckoutCharge, '')} className="h-7 text-xs">
                            Theo chuẩn
                          </Button>
                        )}
                      </div>
                      {cost.adjustedLateCharge < cost.lateCheckoutCharge && (
                        <div className="space-y-1">
                          <Textarea
                            placeholder="Lý do điều chỉnh phụ thu..."
                            className="h-12 text-sm"
                            value={cost.lateAdjustmentNote}
                            onChange={(e) => onAdjustLateCharge(booking.id, cost.adjustedLateCharge, e.target.value)}
                          />
                          {!cost.lateAdjustmentNote.trim() && (
                            <p className="text-xs text-destructive">Vui lòng nhập lý do</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Editable hourly overtime */}
                  {bookingType === 'hourly' && cost && cost.adjustedLateCharge > 0 && (
                    <div className="p-2.5 border rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm text-amber-600">Phí vượt giờ</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            className="w-28 h-8 text-right font-mono text-sm"
                            value={formatNumberWithSeparator(cost.adjustedLateCharge)}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^0-9]/g, '')
                              onAdjustLateCharge(booking.id, parseInt(value) || 0, cost.lateAdjustmentNote)
                            }}
                            placeholder="0"
                          />
                          <span className="text-sm text-muted-foreground">₫</span>
                        </div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => onAdjustLateCharge(booking.id, 0, cost.lateAdjustmentNote)} className="h-7 text-xs text-green-600" disabled={cost.adjustedLateCharge === 0}>
                        Miễn phí
                      </Button>
                    </div>
                  )}

                  {/* Service charges - itemized */}
                  {cost && cost.serviceDetails && cost.serviceDetails.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium border-b pb-1">
                        Dịch vụ & Minibar
                      </div>
                      {cost.serviceDetails.map((detail) => (
                        <div key={detail.id} className="flex justify-between text-sm py-0.5">
                          <span className="text-muted-foreground flex items-center gap-1.5">
                            <span className="text-xs uppercase text-muted-foreground/60 w-12 shrink-0">
                              {detail.source === 'minibar' ? 'Minibar' : 'Dịch vụ'}
                            </span>
                            {detail.service_name}
                            {detail.quantity > 1 && ` ×${detail.quantity}`}
                          </span>
                          <span className="font-mono">{formatVNCurrency(detail.total_price)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Extra charges */}
                  {cost && (cost.costBreakdown.extraCharges || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Chi phí khác</span>
                      <span className="font-mono">{formatVNCurrency(cost.costBreakdown.extraCharges)}</span>
                    </div>
                  )}

                  {/* Damage Charges Section */}
                  {cost && cost.adjustedDamageItems.length > 0 && (
                    <>
                      <Separator />
                      <DamageChargesSection
                        damageItems={cost.adjustedDamageItems}
                        originalItems={cost.damageItems}
                        onAdjustCharge={(itemId, newCharge) => onAdjustDamageItemCharge(booking.id, itemId, newCharge)}
                        onWaiveItem={(itemId) => onAdjustDamageItemCharge(booking.id, itemId, 0)}
                        onResetItem={(itemId) => {
                          const original = cost.damageItems.find(i => i.item_id === itemId)
                          if (original) onAdjustDamageItemCharge(booking.id, itemId, original.charge_amount)
                        }}
                      />
                      {/* Damage note */}
                      {(() => {
                        const currentDamageTotal = cost.adjustedDamageItems.reduce((s, i) => s + i.charge_amount * i.quantity, 0)
                        if (currentDamageTotal < cost.originalDamageTotal) {
                          return (
                            <div className="space-y-1">
                              <Textarea
                                placeholder="Lý do điều chỉnh phí đền bù..."
                                className="h-12 text-sm"
                                value={cost.damageAdjustmentNote}
                                onChange={(e) => onSetDamageNote(booking.id, e.target.value)}
                              />
                              {!cost.damageAdjustmentNote.trim() && (
                                <p className="text-xs text-destructive">Vui lòng nhập lý do</p>
                              )}
                            </div>
                          )
                        }
                        return null
                      })()}
                      <Button type="button" variant="outline" size="sm" onClick={() => onPrintReport(booking.id)} className="w-full gap-2 h-8 text-sm">
                        <Printer className="h-3.5 w-3.5" />
                        In biên bản
                      </Button>
                    </>
                  )}

                  <Separator />

                  {/* Room subtotal */}
                  {cost && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Tạm tính</span>
                        <span className="font-mono">{formatVNCurrency(cost.costBreakdown.subtotal)}</span>
                      </div>
                      {cost.costBreakdown.vatAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Thuế GTGT ({cost.costBreakdown.vatRate}%)</span>
                          <span className="font-mono">{formatVNCurrency(cost.costBreakdown.vatAmount)}</span>
                        </div>
                      )}
                      {cost.costBreakdown.serviceFeeAmount > 0 && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Phí dịch vụ</span>
                          <span className="font-mono">{formatVNCurrency(cost.costBreakdown.serviceFeeAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-medium text-sm">
                        <span>Tổng phòng này</span>
                        <span className="font-mono">{formatVNCurrency(cost.costBreakdown.totalAmount)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
