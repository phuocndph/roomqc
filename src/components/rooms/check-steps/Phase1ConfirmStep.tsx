import { Bell, AlertTriangle, Package, Loader2, CheckCircle2, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { formatCurrency } from '@/lib/utils'
import type { CreateChargeableConsumptionInput } from '@/hooks/useChargeableConsumptions'
import type { LostItem, DamagedItem } from '@/types/rooms.types'

interface Phase1ConfirmStepProps {
  chargeableItems: CreateChargeableConsumptionInput[]
  lostItems: LostItem[]
  damagedItems: DamagedItem[]
  roomNumber: string
  guestName?: string
  onSubmitPhase1: () => Promise<void>
  onContinue: () => void
  isSubmitting: boolean
  phase1Submitted: boolean
}

export function Phase1ConfirmStep({
  chargeableItems,
  lostItems,
  damagedItems,
  roomNumber,
  guestName,
  onSubmitPhase1,
  onContinue,
  isSubmitting,
  phase1Submitted,
}: Phase1ConfirmStepProps) {
  const chargeableTotal = chargeableItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_price,
    0,
  )
  const lostTotal = lostItems.reduce((sum, item) => sum + (item.estimated_value || 0), 0)
  const damagedTotal = damagedItems.reduce((sum, item) => sum + (item.damage_cost || 0), 0)
  const grandTotal = chargeableTotal + lostTotal + damagedTotal
  const hasNoCharges =
    chargeableItems.length === 0 && lostItems.length === 0 && damagedItems.length === 0

  // Sau khi đã báo lễ tân — chỉ còn 1 nút duy nhất, không cho bỏ qua
  if (phase1Submitted) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg border-2 border-green-500 bg-green-50 p-4 dark:bg-green-950/30">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-green-600" />
            <div className="flex-1">
              <p className="font-semibold text-green-800 dark:text-green-300">
                Đã báo cho lễ tân
              </p>

              <div className="mt-3 space-y-2 text-sm">
                {lostItems.length > 0 ? (
                  <div>
                    <p className="font-medium text-foreground">Khách làm mất:</p>
                    <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                      {lostItems.map((item, i) => (
                        <li key={i}>
                          {item.quantity}x {item.item_name}
                          {item.estimated_value
                            ? ` — ${formatCurrency(item.estimated_value)}`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Khách làm mất:</span> Không có
                  </p>
                )}

                {damagedItems.length > 0 ? (
                  <div>
                    <p className="font-medium text-foreground">Khách làm hỏng:</p>
                    <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                      {damagedItems.map((item, i) => (
                        <li key={i}>
                          {item.quantity}x {item.item_name}
                          {item.damage_cost ? ` — ${formatCurrency(item.damage_cost)}` : ''}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Khách làm hỏng:</span> Không có
                  </p>
                )}

                {chargeableItems.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">Khách đã dùng (minibar):</p>
                    <ul className="ml-4 list-disc space-y-0.5 text-muted-foreground">
                      {chargeableItems.map((item, i) => (
                        <li key={i}>
                          {item.quantity}x {item.item_name} —{' '}
                          {formatCurrency(item.quantity * item.unit_price)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {grandTotal > 0 && (
                <div className="mt-3 border-t border-green-300 pt-3 dark:border-green-800">
                  <p className="text-sm">
                    <span className="text-muted-foreground">Lễ tân sẽ thu của khách:</span>{' '}
                    <span className="text-base font-bold text-orange-700">
                      {formatCurrency(grandTotal)}
                    </span>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Giờ kiểm tra tiếp đồ nào cần{' '}
          <strong className="text-foreground">thay, giặt, bổ sung</strong> để tạo phiếu cho ca sau
          đến dọn.
        </div>

        <Button
          type="button"
          onClick={onContinue}
          className="h-12 w-full gap-2 text-base font-semibold"
        >
          Tiếp tục
          <ArrowRight className="h-5 w-5" />
        </Button>
      </div>
    )
  }

  // Chưa gửi — màn hình tóm tắt + nút "Xong - Báo lễ tân thu tiền khách"
  return (
    <div className="space-y-4">
      <div>
        <h3 className="flex items-center gap-2 font-semibold text-orange-700">
          <Bell className="h-5 w-5" />
          Báo cho lễ tân thu tiền khách
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Xem lại danh sách bên dưới. Khi bấm gửi, lễ tân sẽ nhận thông báo ngay để tính tiền cho
          khách.
        </p>
      </div>

      <div className="rounded-lg border border-orange-200">
        <div className="px-3 pb-2 pt-3">
          <h3 className="flex items-center justify-between text-base font-semibold">
            <span>Phòng {roomNumber}</span>
            {guestName && (
              <Badge variant="outline" className="font-normal">
                {guestName}
              </Badge>
            )}
          </h3>
        </div>
        <div className="space-y-4 px-3 pb-3">
          {hasNoCharges ? (
            <div className="py-6 text-center text-muted-foreground">
              <Package className="mx-auto mb-2 h-10 w-10 opacity-50" />
              <p className="font-medium text-foreground">Không có gì để tính phí</p>
              <p className="mt-1 text-xs">
                Khách không làm mất, không làm hỏng, không dùng minibar
              </p>
            </div>
          ) : (
            <>
              {chargeableItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-muted-foreground">
                    Khách đã dùng (minibar)
                  </h4>
                  <div className="space-y-1">
                    {chargeableItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span>
                          {item.quantity}x {item.item_name}
                        </span>
                        <span className="font-medium">
                          {formatCurrency(item.quantity * item.unit_price)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {lostItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-1 text-sm font-medium text-red-600">
                    <AlertTriangle className="h-3 w-3" />
                    Khách làm mất
                  </h4>
                  <div className="space-y-1">
                    {lostItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span>
                          {item.quantity}x {item.item_name}
                        </span>
                        <span className="font-medium text-red-600">
                          {item.estimated_value
                            ? formatCurrency(item.estimated_value)
                            : 'Chưa định giá'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {damagedItems.length > 0 && (
                <div className="space-y-2">
                  <h4 className="flex items-center gap-1 text-sm font-medium text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    Khách làm hỏng
                  </h4>
                  <div className="space-y-1">
                    {damagedItems.map((item, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span>
                          {item.quantity}x {item.item_name}
                          <Badge variant="outline" className="ml-1 text-xs">
                            {item.damage_type === 'repairable' ? 'Sửa được' : 'Cần thay'}
                          </Badge>
                        </span>
                        <span className="font-medium text-amber-600">
                          {item.damage_cost ? formatCurrency(item.damage_cost) : 'Chưa định giá'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <Separator />
              <div className="flex items-center justify-between">
                <span className="font-semibold">Tổng tiền lễ tân thu</span>
                <span className="text-xl font-bold text-orange-700">
                  {formatCurrency(grandTotal)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      <Button
        type="button"
        onClick={onSubmitPhase1}
        disabled={isSubmitting}
        className="h-12 w-full bg-orange-600 text-base font-semibold hover:bg-orange-700"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            Đang gửi...
          </>
        ) : (
          <>
            <Bell className="mr-2 h-5 w-5" />
            {hasNoCharges ? 'Xong - Tiếp tục' : 'Xong - Báo lễ tân thu tiền khách'}
          </>
        )}
      </Button>
    </div>
  )
}
