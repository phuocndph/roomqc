import { UseFormReturn } from 'react-hook-form'
import { Button } from '@/components/ui/button'
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import type { RoomCheckFormData, CheckType } from '@/types/rooms.types'
import { cn } from '@/lib/utils'
import { LastCheckContextCard } from './LastCheckContextCard'
import { QuickOkButton } from './QuickOkButton'
import { DraftResumeBanner } from './DraftResumeBanner'
import type { QuickCheckType } from '@/hooks/useQuickRoomCheck'

interface CheckTypeStepProps {
  form: UseFormReturn<RoomCheckFormData>
  quickMode: boolean
  setQuickMode: (value: boolean) => void
  hideDelivery?: boolean
  /** Bật Quick path "Phòng OK hoàn toàn" + Context Card khi truyền đủ roomId */
  roomId?: string
  hotelId?: string | null
  /** Cho phép tiếp quản phiên của người khác (manager) */
  canTakeOver?: boolean
}

const checkTypes: { value: CheckType; label: string; shortLabel: string }[] = [
  { value: 'daily',       label: 'Hàng ngày',         shortLabel: 'Hàng ngày' },
  { value: 'checkin',     label: 'Check-in',          shortLabel: 'Check-in' },
  { value: 'checkout',    label: 'Check-out',         shortLabel: 'Check-out' },
  { value: 'maintenance', label: 'Bảo trì',           shortLabel: 'Bảo trì' },
  { value: 'delivery',    label: 'Sau giao hàng',     shortLabel: 'Giao hàng' },
  { value: 'replenish',   label: 'Bổ sung & Dọn dẹp', shortLabel: 'Bổ sung' },
]

export function CheckTypeStep({
  form,
  quickMode,
  setQuickMode,
  hideDelivery = true,
  roomId,
  hotelId,
  canTakeOver = false,
}: CheckTypeStepProps) {
  const selectedType = form.watch('check_type')

  const visibleCheckTypes = hideDelivery
    ? checkTypes.filter(t => t.value !== 'delivery')
    : checkTypes

  const quickEligible: QuickCheckType[] = ['daily', 'checkin', 'checkout']
  const showQuickPath = !!roomId && quickEligible.includes(selectedType as QuickCheckType)

  return (
    <div className="space-y-4">
      {/* Banner phiên kiểm dở dang */}
      {roomId && <DraftResumeBanner roomId={roomId} canTakeOver={canTakeOver} />}

      {/* Context card — lần kiểm gần nhất */}
      {roomId && <LastCheckContextCard roomId={roomId} />}

      {/* Quick path "Phòng OK hoàn toàn" */}
      {showQuickPath && (
        <div className="space-y-1.5 p-3 border-l-4 border-green-500 rounded-md bg-green-50/50">
          <QuickOkButton
            roomId={roomId!}
            hotelId={hotelId}
            checkType={selectedType as QuickCheckType}
          />
        </div>
      )}

      <FormField
        control={form.control}
        name="check_type"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
              Loại kiểm tra
            </FormLabel>
            <FormControl>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
                {visibleCheckTypes.map((type) => {
                  const isSelected = field.value === type.value
                  return (
                    <Button
                      key={type.value}
                      type="button"
                      variant={isSelected ? 'default' : 'outline'}
                      className={cn(
                        'h-12 text-sm font-medium transition-colors',
                        isSelected && 'ring-2 ring-primary ring-offset-1'
                      )}
                      onClick={() => field.onChange(type.value)}
                    >
                      {type.shortLabel}
                    </Button>
                  )
                })}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Kiểm nhanh tổng quan — text-only, không icon */}
      <div className="flex items-center justify-between border rounded-md p-3">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">Kiểm nhanh tổng quan</p>
          <p className="text-xs text-muted-foreground">
            Bỏ qua kiểm chi tiết từng món, chỉ đánh giá chung.
          </p>
        </div>
        <Button
          type="button"
          variant={quickMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setQuickMode(!quickMode)}
          className="shrink-0 min-w-[60px]"
        >
          {quickMode ? 'Đang bật' : 'Tắt'}
        </Button>
      </div>
    </div>
  )
}

