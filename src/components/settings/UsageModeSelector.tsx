import { useState } from 'react'
import { Home, Building2, Building, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTenant } from '@/hooks/useTenant'
import { useUsageMode, type UsageMode } from '@/hooks/useUsageMode'
import { supabase } from '@/integrations/supabase/client'
import { useToast } from '@/hooks/use-toast'
import { useQueryClient } from '@tanstack/react-query'
import { getFriendlyError } from '@/lib/errorMessage'

const MODES = [
  {
    value: 'homestay' as UsageMode,
    icon: Home,
    title: 'Homestay',
    subtitle: 'Đơn giản',
    description: 'Phòng, Đặt phòng, Khách, Hóa đơn. Phù hợp homestay 5-20 phòng.',
    features: ['Dashboard', 'Quản lý phòng', 'Đặt phòng', 'Quản lý khách', 'Hóa đơn', 'Cài đặt cơ bản'],
  },
  {
    value: 'standard' as UsageMode,
    icon: Building2,
    title: 'Khách sạn',
    subtitle: 'Tiêu chuẩn',
    description: 'Thêm Kho, Giặt là, Bảo trì, Báo cáo. Phù hợp khách sạn 20-100 phòng.',
    features: ['Tất cả Homestay', '+ Quản lý kho', '+ Giặt là', '+ Bảo trì', '+ Báo cáo', '+ Nhân sự'],
  },
  {
    value: 'full' as UsageMode,
    icon: Building,
    title: 'Chuỗi KS',
    subtitle: 'Nâng cao',
    description: 'Tất cả tính năng. Nhà cung cấp, Đơn mua hàng, So sánh KS.',
    features: ['Tất cả Tiêu chuẩn', '+ Nhà cung cấp', '+ Đơn mua hàng', '+ So sánh hiệu suất', '+ Tự động hóa'],
  },
]

export function UsageModeSelector() {
  const { tenant } = useTenant()
  const { usageMode } = useUsageMode()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [saving, setSaving] = useState(false)

  const handleSelect = async (mode: UsageMode) => {
    if (!tenant || mode === usageMode) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ usage_mode: mode } as any)
        .eq('id', tenant.id)

      if (error) throw error

      await queryClient.invalidateQueries({ queryKey: ['tenant'] })

      toast({
        title: 'Đã cập nhật chế độ',
        description: `Chuyển sang chế độ ${MODES.find(m => m.value === mode)?.title}`,
      })
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b">
        <Building2 className="h-4 w-4 text-muted-foreground" />
        <div>
          <h2 className="text-sm font-medium">Chế độ sử dụng</h2>
          <p className="text-[10px] text-muted-foreground">
            Chọn chế độ phù hợp với quy mô của bạn. Dữ liệu được bảo toàn khi chuyển đổi.
          </p>
        </div>
        {saving && <Loader2 className="h-3 w-3 animate-spin ml-auto" />}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {MODES.map((mode) => {
          const Icon = mode.icon
          const isActive = usageMode === mode.value

          return (
            <button
              key={mode.value}
              type="button"
              onClick={() => handleSelect(mode.value)}
              disabled={saving}
              className={cn(
                'border rounded-lg p-3 text-left transition-all',
                'hover:border-primary/50',
                isActive
                  ? 'border-primary ring-1 ring-primary/20 bg-primary/5'
                  : 'border-border'
              )}
            >
              <div className="flex items-center gap-2 mb-2">
                <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')} />
                <span className="text-sm font-medium">{mode.title}</span>
                <span className="text-[10px] text-muted-foreground">({mode.subtitle})</span>
              </div>
              <p className="text-[10px] text-muted-foreground mb-2">{mode.description}</p>
              <ul className="space-y-0.5">
                {mode.features.map((f) => (
                  <li key={f} className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <span className={cn('inline-block h-1 w-1 rounded-full', isActive ? 'bg-primary' : 'bg-muted-foreground/50')} />
                    {f}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
    </div>
  )
}
