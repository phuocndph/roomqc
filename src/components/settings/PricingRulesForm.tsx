import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'
import { useToast } from '@/hooks/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, Save, RotateCcw } from 'lucide-react'
import { DEFAULT_PRICING_RULES } from '@/lib/bookingCalculations'
import { getFriendlyError } from '@/lib/errorMessage'

interface PricingRulesFormProps {
  hotelId: string
}

interface FormData {
  standard_checkin_time: string
  standard_checkout_time: string
  early_checkin_before_5: number
  early_checkin_5_9: number
  early_checkin_9_14: number
  late_checkout_12_15: number
  late_checkout_15_18: number
  late_checkout_after_18: number
  weekend_surcharge: number
  high_season_surcharge: number
  default_vat_rate: number
  default_service_fee_rate: number
}

const defaultFormData: FormData = {
  standard_checkin_time: DEFAULT_PRICING_RULES.standardCheckinTime,
  standard_checkout_time: DEFAULT_PRICING_RULES.standardCheckoutTime,
  early_checkin_before_5: 100,
  early_checkin_5_9: DEFAULT_PRICING_RULES.earlyCheckin5_9,
  early_checkin_9_14: DEFAULT_PRICING_RULES.earlyCheckin9_14,
  late_checkout_12_15: DEFAULT_PRICING_RULES.lateCheckout12_15,
  late_checkout_15_18: DEFAULT_PRICING_RULES.lateCheckout15_18,
  late_checkout_after_18: DEFAULT_PRICING_RULES.lateCheckoutAfter18,
  weekend_surcharge: 0,
  high_season_surcharge: 0,
  default_vat_rate: DEFAULT_PRICING_RULES.vatRate,
  default_service_fee_rate: DEFAULT_PRICING_RULES.serviceFeeRate,
}

export function PricingRulesForm({ hotelId }: PricingRulesFormProps) {
  const { tenant } = useTenant()
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [formData, setFormData] = useState<FormData>(defaultFormData)

  const { data: existingRules, isLoading } = useQuery({
    queryKey: ['pricing-rules', hotelId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('room_pricing_rules')
        .select('*')
        .eq('hotel_id', hotelId)
        .maybeSingle()

      if (error) throw error
      return data
    },
    enabled: !!hotelId,
  })

  useEffect(() => {
    if (existingRules) {
      setFormData({
        standard_checkin_time: existingRules.standard_checkin_time || defaultFormData.standard_checkin_time,
        standard_checkout_time: existingRules.standard_checkout_time || defaultFormData.standard_checkout_time,
        early_checkin_before_5: existingRules.early_checkin_before_5 ?? defaultFormData.early_checkin_before_5,
        early_checkin_5_9: existingRules.early_checkin_5_9 ?? defaultFormData.early_checkin_5_9,
        early_checkin_9_14: existingRules.early_checkin_9_14 ?? defaultFormData.early_checkin_9_14,
        late_checkout_12_15: existingRules.late_checkout_12_15 ?? defaultFormData.late_checkout_12_15,
        late_checkout_15_18: existingRules.late_checkout_15_18 ?? defaultFormData.late_checkout_15_18,
        late_checkout_after_18: existingRules.late_checkout_after_18 ?? defaultFormData.late_checkout_after_18,
        weekend_surcharge: existingRules.weekend_surcharge ?? defaultFormData.weekend_surcharge,
        high_season_surcharge: existingRules.high_season_surcharge ?? defaultFormData.high_season_surcharge,
        default_vat_rate: existingRules.default_vat_rate ?? defaultFormData.default_vat_rate,
        default_service_fee_rate: existingRules.default_service_fee_rate ?? defaultFormData.default_service_fee_rate,
      })
    }
  }, [existingRules])

  const saveMutation = useMutation({
    mutationFn: async (data: FormData) => {
      if (!tenant?.id) throw new Error('No tenant')

      const payload = {
        tenant_id: tenant.id,
        hotel_id: hotelId,
        ...data,
      }

      if (existingRules?.id) {
        const { error } = await supabase
          .from('room_pricing_rules')
          .update(payload)
          .eq('id', existingRules.id)
        if (error) throw error
      } else {
        const { error } = await supabase
          .from('room_pricing_rules')
          .insert(payload)
        if (error) throw error
      }

      // Also mirror VAT / service fee / early-check-in / late-check-out percentages
      // into hotel_settings so the Booking Wizard (which reads hotel_settings) sees
      // the same values. The DB trigger covers this too; client-side upsert keeps
      // things consistent if the trigger is ever removed and avoids a round-trip.
      const { error: hsError } = await supabase
        .from('hotel_settings')
        .upsert(
          {
            tenant_id: tenant.id,
            hotel_id: hotelId,
            vat_rate: data.default_vat_rate,
            service_fee_rate: data.default_service_fee_rate,
            late_checkout_12_15_pct: data.late_checkout_12_15,
            late_checkout_15_18_pct: data.late_checkout_15_18,
            late_checkout_after18_pct: data.late_checkout_after_18,
            early_checkin_before5_pct: data.early_checkin_before_5,
            early_checkin_5_9_pct: data.early_checkin_5_9,
            early_checkin_9_14_pct: data.early_checkin_9_14,
          },
          { onConflict: 'hotel_id' }
        )
      if (hsError) throw hsError
    },
    onSuccess: () => {
      toast({ title: 'Đã lưu cấu hình phụ thu' })
      queryClient.invalidateQueries({ queryKey: ['pricing-rules', hotelId] })
      queryClient.invalidateQueries({ queryKey: ['hotel-pricing-rules', hotelId] })
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        title: 'Lỗi lưu cấu hình',
        description: getFriendlyError(error),
      })
    },
  })

  const handleChange = (field: keyof FormData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleReset = () => {
    setFormData(defaultFormData)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    saveMutation.mutate(formData)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Giờ tiêu chuẩn */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium">Giờ tiêu chuẩn</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Giờ Check-in</Label>
            <Input
              type="time"
              value={formData.standard_checkin_time}
              onChange={e => handleChange('standard_checkin_time', e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Giờ Check-out</Label>
            <Input
              type="time"
              value={formData.standard_checkout_time}
              onChange={e => handleChange('standard_checkout_time', e.target.value)}
              className="h-9"
            />
          </div>
        </div>
      </div>

      {/* Phụ thu Check-in sớm */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium">Phụ thu Check-in sớm (% giá phòng)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Trước 5h (1 đêm)</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={200}
                value={formData.early_checkin_before_5}
                onChange={e => handleChange('early_checkin_before_5', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">5h - 9h</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={formData.early_checkin_5_9}
                onChange={e => handleChange('early_checkin_5_9', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">9h - 14h</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={formData.early_checkin_9_14}
                onChange={e => handleChange('early_checkin_9_14', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Phụ thu Check-out muộn */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium">Phụ thu Check-out muộn (% giá phòng)</h3>
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">12h - 15h</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={formData.late_checkout_12_15}
                onChange={e => handleChange('late_checkout_12_15', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">15h - 18h</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={formData.late_checkout_15_18}
                onChange={e => handleChange('late_checkout_15_18', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Sau 18h (1 đêm)</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={200}
                value={formData.late_checkout_after_18}
                onChange={e => handleChange('late_checkout_after_18', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Phụ thu đặc biệt */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium">Phụ thu đặc biệt (% giá phòng)</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">Cuối tuần (Thứ 7 - CN)</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={formData.weekend_surcharge}
                onChange={e => handleChange('weekend_surcharge', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mùa cao điểm</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={100}
                value={formData.high_season_surcharge}
                onChange={e => handleChange('high_season_surcharge', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Thuế & Phí */}
      <div className="border rounded-lg p-4 space-y-4">
        <h3 className="font-medium">Thuế & Phí dịch vụ</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <Label className="text-xs">VAT</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={50}
                value={formData.default_vat_rate}
                onChange={e => handleChange('default_vat_rate', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Phí phục vụ</Label>
            <div className="flex items-center gap-1">
              <Input
                type="number"
                min={0}
                max={50}
                value={formData.default_service_fee_rate}
                onChange={e => handleChange('default_service_fee_rate', Number(e.target.value))}
                className="h-9"
              />
              <span className="text-sm text-muted-foreground">%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 justify-end">
        <Button type="button" variant="outline" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          Đặt lại mặc định
        </Button>
        <Button type="submit" disabled={saveMutation.isPending}>
          {saveMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-1" />
          )}
          Lưu thay đổi
        </Button>
      </div>
    </form>
  )
}
