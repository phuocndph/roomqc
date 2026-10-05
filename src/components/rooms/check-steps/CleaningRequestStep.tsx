import { UseFormReturn } from 'react-hook-form'
import { useEffect } from 'react'
import { CheckCircle, AlertCircle, AlertTriangle } from 'lucide-react'
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { RoomCheckFormData } from '@/types/rooms.types'

interface CleaningRequestStepProps {
  form: UseFormReturn<RoomCheckFormData>
  /**
   * 'checkout' — luôn tạo phiếu dọn (vì phải thay ga sau mỗi khách)
   * 'daily'    — chỉ tạo phiếu khi phòng KHÔNG sạch (khách vẫn ở)
   */
  mode?: 'checkout' | 'daily'
}

const ROOM_CONDITIONS = [
  { value: 'clean', label: 'Sạch', icon: CheckCircle, color: 'text-green-600', selectedBg: 'bg-green-50 border-green-500 text-green-700' },
  { value: 'dirty', label: 'Bẩn nhẹ', icon: AlertCircle, color: 'text-amber-600', selectedBg: 'bg-amber-50 border-amber-500 text-amber-700' },
  { value: 'very_dirty', label: 'Rất bẩn', icon: AlertTriangle, color: 'text-red-600', selectedBg: 'bg-red-50 border-red-500 text-red-700' },
] as const

export function CleaningRequestStep({ form, mode = 'checkout' }: CleaningRequestStepProps) {
  const roomCondition = form.watch('room_condition')

  useEffect(() => {
    if (mode === 'checkout') {
      // Checkout: luôn cần dọn, mức bẩn quyết định độ ưu tiên
      form.setValue('needs_cleaning', true)
      if (!roomCondition) return
      const priority = roomCondition === 'clean' ? 'low'
        : roomCondition === 'very_dirty' ? 'high'
        : 'medium'
      form.setValue('cleaning_priority', priority)
    } else {
      // Daily: chỉ cần dọn khi phòng KHÔNG sạch
      const needsCleaning = !!roomCondition && roomCondition !== 'clean'
      form.setValue('needs_cleaning', needsCleaning)
      if (needsCleaning) {
        const priority = roomCondition === 'very_dirty' ? 'high' : 'medium'
        form.setValue('cleaning_priority', priority)
      }
    }
  }, [roomCondition, mode, form])

  const handleConditionChange = (value: 'clean' | 'dirty' | 'very_dirty') => {
    form.setValue('room_condition', value)
  }

  // Summary text — phụ thuộc vào mode + tình trạng
  const summaryText = (() => {
    if (!roomCondition) {
      return mode === 'checkout'
        ? 'Chọn mức bẩn để biết khối lượng việc của ca sau'
        : 'Chọn tình trạng vệ sinh hiện tại của phòng'
    }
    if (mode === 'checkout') {
      return roomCondition === 'clean' ? 'Ca sau sẽ dọn nhẹ — thay ga giường, bổ sung đồ tiêu hao (~15 phút)'
        : roomCondition === 'dirty' ? 'Ca sau sẽ dọn bình thường — thay ga + lau dọn (~30 phút)'
        : 'Ca sau sẽ dọn kỹ — quản lý nhận thông báo ưu tiên (~45-60 phút)'
    }
    // daily
    return roomCondition === 'clean' ? 'Phòng vẫn ổn — chỉ ghi nhận kiểm tra, không cần dọn lại'
      : roomCondition === 'dirty' ? 'Sẽ tạo phiếu lau dọn cho bộ phận buồng phòng (~30 phút)'
      : 'Sẽ tạo phiếu lau dọn ƯU TIÊN cho bộ phận buồng phòng (~45-60 phút)'
  })()

  // Footer text — daily không đổi trạng thái phòng
  const footerText = (() => {
    if (mode === 'checkout') {
      return <>Sau khi hoàn tất → Phòng chuyển sang <strong className="text-amber-600">Đang chờ dọn</strong></>
    }
    if (roomCondition === 'clean') {
      return <>Khách vẫn đang ở → Phòng giữ nguyên trạng thái <strong className="text-blue-600">Đang sử dụng</strong></>
    }
    return <>Khách vẫn đang ở → Phòng <strong className="text-blue-600">không đổi trạng thái</strong>, chỉ tạo task riêng cho buồng phòng</>
  })()

  const conditionLabel = mode === 'daily'
    ? 'Tình trạng vệ sinh phòng hiện tại'
    : 'Tình trạng phòng khi khách trả'

  const notesLabel = mode === 'daily'
    ? 'Ghi chú cho buồng phòng (tuỳ chọn)'
    : 'Ghi chú cho ca sau (tuỳ chọn)'

  return (
    <div className="space-y-4">
      {/* Room Condition — 3 chips ngang hàng */}
      <FormField
        control={form.control}
        name="room_condition"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm font-medium">{conditionLabel}</FormLabel>
            <FormControl>
              <div className="grid grid-cols-3 gap-2 pt-1">
                {ROOM_CONDITIONS.map((condition) => {
                  const Icon = condition.icon
                  const isSelected = field.value === condition.value
                  return (
                    <button
                      key={condition.value}
                      type="button"
                      onClick={() => handleConditionChange(condition.value)}
                      className={cn(
                        'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition-all',
                        isSelected
                          ? condition.selectedBg
                          : 'border-border bg-background text-muted-foreground hover:bg-muted/50'
                      )}
                    >
                      <Icon className={cn('h-4 w-4', isSelected ? condition.color : 'text-muted-foreground')} />
                      {condition.label}
                    </button>
                  )
                })}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Ghi chú dọn dẹp — luôn hiện */}
      <FormField
        control={form.control}
        name="cleaning_notes"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="text-sm">{notesLabel}</FormLabel>
            <FormControl>
              <Textarea
                {...field}
                placeholder="VD: Khách để lại nhiều rác, cần đổi ga giường, có vết bẩn trên thảm..."
                className="min-h-[60px] text-sm resize-none"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Summary */}
      <div className="px-3 py-2 rounded-lg border bg-muted/20 text-xs text-muted-foreground space-y-1">
        <p>{summaryText}</p>
        <p>{footerText}</p>
      </div>
    </div>
  )
}
