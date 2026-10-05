import { CreditCard, Percent, Globe, CheckCircle2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn, formatCurrency } from '@/lib/utils'
import { OTA_PAYMENT_TYPES, BOOKING_SOURCES } from '@/lib/constants'
import { BookingFormState, BookingFormComputed } from '../types'

interface PaymentStepProps {
  state: BookingFormState
  computed: BookingFormComputed
  onUpdate: (data: Partial<BookingFormState>) => void
}

export function PaymentStep({ state, computed, onUpdate }: PaymentStepProps) {
  const { isOtaSource, subtotal, vatAmount, serviceFeeAmount, estimatedTotal, otaCommissionAmount, netRevenue, remainingAmount } = computed
  
  // Get booking source label
  const sourceLabel = BOOKING_SOURCES.find(s => s.value === state.bookingSource)?.label || state.bookingSource

  return (
    <div className="space-y-4">
      <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
        {/* Room Price Summary */}
        {state.selectedRooms.length > 0 ? (
          <div className="space-y-1">
            <div className="flex justify-between items-center text-sm">
              <span className="text-muted-foreground flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                {state.bookingType === 'hourly' ? (
                  <>Giá phòng × {computed.hours} giờ:</>
                ) : state.bookingType === 'monthly' ? (
                  <>Giá phòng × {computed.months} tháng:</>
                ) : (
                  <>Giá phòng × {computed.nights} đêm:</>
                )}
              </span>
              <span className="font-medium">{formatCurrency(subtotal)}</span>
            </div>
            <div className="text-xs text-muted-foreground">
              {state.selectedRooms.map(r => `${r.room_number}: ${formatCurrency(r.customPrice)}`).join(' • ')}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground text-center py-2">
            Vui lòng chọn phòng ở bước 2
          </div>
        )}
        
        {/* VAT Toggle & Input */}
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.includeVat}
              onChange={(e) => onUpdate({ includeVat: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm">Bao gồm VAT</span>
          </label>
          {state.includeVat && (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                value={state.vatRate > 0 ? state.vatRate.toString() : ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '')
                  onUpdate({ vatRate: Math.min(100, parseInt(value) || 0) })
                }}
                className="w-16 h-8 text-center"
                placeholder="8"
              />
              <Percent className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        
        {state.includeVat && vatAmount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Thuế VAT ({state.vatRate}%)</span>
            <span className="font-medium">{formatCurrency(vatAmount)}</span>
          </div>
        )}
        
        {/* Service Fee Toggle & Input */}
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={state.includeServiceFee}
              onChange={(e) => onUpdate({ includeServiceFee: e.target.checked })}
              className="h-4 w-4 rounded border-border"
            />
            <span className="text-sm">Phí dịch vụ</span>
          </label>
          {state.includeServiceFee && (
            <div className="flex items-center gap-2">
              <Input
                type="text"
                inputMode="numeric"
                value={state.serviceFeeRate > 0 ? state.serviceFeeRate.toString() : ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '')
                  onUpdate({ serviceFeeRate: Math.min(100, parseInt(value) || 0) })
                }}
                className="w-16 h-8 text-center"
                placeholder="5"
              />
              <Percent className="h-4 w-4 text-muted-foreground" />
            </div>
          )}
        </div>
        
        {state.includeServiceFee && serviceFeeAmount > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Phí dịch vụ ({state.serviceFeeRate}%)</span>
            <span className="font-medium">{formatCurrency(serviceFeeAmount)}</span>
          </div>
        )}
        
        {/* Estimated Total */}
        <div className="flex justify-between items-center py-2 border-t">
          <span className="text-sm font-medium">TỔNG TIỀN DỰ KIẾN</span>
          <span className="font-semibold text-lg text-primary">{formatCurrency(estimatedTotal)}</span>
        </div>
        <p className="text-xs text-muted-foreground -mt-2">
          {state.bookingType === 'hourly' 
            ? '(chưa bao gồm phí vượt giờ nếu có)'
            : state.bookingType === 'monthly'
            ? '(đã bao gồm chiết khấu dài hạn nếu có)'
            : '(chưa bao gồm phụ thu check-in sớm/trả phòng muộn)'}
        </p>
        
        {/* OTA Payment Section */}
        {isOtaSource && (
          <div className="pt-3 border-t space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Globe className="h-4 w-4" />
              Thanh toán OTA ({sourceLabel})
            </h4>
            
            {/* OTA Payment Type */}
            <div className="space-y-2">
              <Label className="text-xs">Hình thức thanh toán</Label>
              <Select value={state.otaPaymentType} onValueChange={(v) => onUpdate({ otaPaymentType: v })}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OTA_PAYMENT_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* OTA Paid Amount - only for partial_prepaid */}
            {state.otaPaymentType === 'partial_prepaid' && (
              <div className="space-y-2">
                <Label className="text-xs">Số tiền OTA đã thu</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  value={state.otaPaidAmount > 0 ? state.otaPaidAmount.toString() : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '')
                    onUpdate({ otaPaidAmount: parseInt(value) || 0 })
                  }}
                  placeholder="0"
                  className="h-8"
                />
              </div>
            )}
            
            {/* OTA Prepaid confirmation */}
            {state.otaPaymentType === 'prepaid' && (
              <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded text-green-700 dark:text-green-400 text-sm">
                <CheckCircle2 className="h-4 w-4" />
                OTA đã thu: {formatCurrency(estimatedTotal)}
              </div>
            )}
            
            {/* OTA Commission */}
            <div className="flex items-center justify-between gap-3">
              <Label className="text-xs">Hoa hồng OTA</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="numeric"
                  value={state.otaCommissionRate > 0 ? state.otaCommissionRate.toString() : ''}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9]/g, '')
                    onUpdate({ otaCommissionRate: Math.min(100, parseInt(value) || 0) })
                  }}
                  className="w-16 h-8 text-center"
                  placeholder="15"
                />
                <Percent className="h-4 w-4 text-muted-foreground" />
              </div>
            </div>
            
            {/* OTA Summary */}
            {otaCommissionAmount > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Tiền hoa hồng:</span>
                  <span className="text-red-600">-{formatCurrency(otaCommissionAmount)}</span>
                </div>
                <div className="flex justify-between text-sm font-medium">
                  <span>Doanh thu thực:</span>
                  <span className="text-green-600">{formatCurrency(netRevenue)}</span>
                </div>
              </div>
            )}
            
            {/* Partial prepaid remaining */}
            {state.otaPaymentType === 'partial_prepaid' && state.otaPaidAmount > 0 && (
              <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded font-medium">
                ⚠ Khách còn phải trả tại KS: {formatCurrency(Math.max(0, estimatedTotal - state.otaPaidAmount))}
              </div>
            )}
          </div>
        )}
        
        {/* Deposit - only show for non-OTA or OTA pay_at_hotel */}
        {(!isOtaSource || state.otaPaymentType === 'pay_at_hotel') && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div className="space-y-2">
              <Label htmlFor="depositAmount" className="flex items-center gap-2">
                Đặt cọc trước
              </Label>
              <Input
                id="depositAmount"
                type="text"
                inputMode="numeric"
                value={state.depositAmount > 0 ? state.depositAmount.toString() : ''}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9]/g, '')
                  onUpdate({ depositAmount: parseInt(value) || 0 })
                }}
                placeholder="0"
              />
              {state.depositAmount > 0 && (
                <span className="text-xs text-muted-foreground">
                  = {formatCurrency(state.depositAmount)}
                </span>
              )}
            </div>
            <div className="space-y-2">
              <Label className="text-muted-foreground">Còn lại (khi checkout)</Label>
              <div className={cn(
                "h-9 flex items-center px-3 border rounded-md font-medium",
                remainingAmount === 0 ? "bg-green-50 text-green-600 border-green-200" : "bg-muted"
              )}>
                {formatCurrency(remainingAmount)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
