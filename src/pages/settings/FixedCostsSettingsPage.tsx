import { useState, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { format, startOfMonth } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Save, Target, DollarSign } from 'lucide-react'
import { toast } from 'sonner'

const FIXED_COST_CATEGORIES = [
  { value: 'salary', label: 'Lương nhân viên' },
  { value: 'rent', label: 'Thuê mặt bằng' },
  { value: 'utilities', label: 'Điện, nước, internet' },
  { value: 'insurance', label: 'Bảo hiểm' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Chi phí khác' },
] as const

export function FixedCostsSettingsPage() {
  const { tenantId, role } = useUser()
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id
  const qc = useQueryClient()

  const [selectedMonth, setSelectedMonth] = useState(
    format(startOfMonth(new Date()), 'yyyy-MM-dd')
  )
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [revenueTarget, setRevenueTarget] = useState('')
  const [occupancyTarget, setOccupancyTarget] = useState('')

  const { data: fixedCosts } = useQuery({
    queryKey: ['fixed-expenses', tenantId, hotelId, selectedMonth],
    enabled: !!tenantId && !!hotelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hotel_fixed_expenses')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .eq('month', selectedMonth)
      if (error) throw error
      return data || []
    },
  })

  useEffect(() => {
    const d: Record<string, string> = {}
    ;(fixedCosts || []).forEach((r: any) => {
      d[r.category] = String(r.amount)
    })
    setDrafts(d)
  }, [fixedCosts])

  const { data: target } = useQuery({
    queryKey: ['monthly-target', tenantId, hotelId, selectedMonth],
    enabled: !!tenantId && !!hotelId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_targets')
        .select('*')
        .eq('tenant_id', tenantId!)
        .eq('hotel_id', hotelId!)
        .eq('month', selectedMonth)
        .maybeSingle()
      if (error) throw error
      return data
    },
  })

  useEffect(() => {
    if (target) {
      setRevenueTarget(target.revenue_target ? String(target.revenue_target) : '')
      setOccupancyTarget(target.occupancy_target ? String(target.occupancy_target) : '')
    } else {
      setRevenueTarget('')
      setOccupancyTarget('')
    }
  }, [target])

  const saveCosts = useMutation({
    mutationFn: async () => {
      const rows = FIXED_COST_CATEGORIES
        .filter(c => drafts[c.value] && Number(drafts[c.value]) > 0)
        .map(c => ({
          tenant_id: tenantId!,
          hotel_id: hotelId!,
          month: selectedMonth,
          category: c.value,
          amount: Number(drafts[c.value]),
        }))
      if (rows.length === 0) return
      const { error } = await supabase
        .from('hotel_fixed_expenses')
        .upsert(rows, { onConflict: 'hotel_id,month,category' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã lưu chi phí cố định')
      qc.invalidateQueries({ queryKey: ['fixed-expenses'] })
    },
    onError: () => toast.error('Lưu thất bại, thử lại'),
  })

  const saveTarget = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('monthly_targets')
        .upsert({
          tenant_id: tenantId!,
          hotel_id: hotelId!,
          month: selectedMonth,
          revenue_target: revenueTarget ? Number(revenueTarget) : null,
          occupancy_target: occupancyTarget ? Number(occupancyTarget) : null,
        }, { onConflict: 'hotel_id,month' })
      if (error) throw error
    },
    onSuccess: () => {
      toast.success('Đã lưu mục tiêu tháng')
      qc.invalidateQueries({ queryKey: ['monthly-target'] })
    },
    onError: () => toast.error('Lưu thất bại, thử lại'),
  })

  if (role && role !== 'owner' && role !== 'super_admin') {
    return <Navigate to="/settings" replace />
  }

  if (!hotelId) {
    return (
      <div className="p-6">
        <PageHeader title="Chi phí & Mục tiêu" description="Cấu hình chi phí cố định và mục tiêu hàng tháng" />
        <div className="mt-6 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Chọn một khách sạn cụ thể để nhập chi phí và mục tiêu.
        </div>
      </div>
    )
  }

  const totalFixed = FIXED_COST_CATEGORIES.reduce(
    (s, c) => s + (Number(drafts[c.value]) || 0),
    0
  )

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      <PageHeader
        title="Chi phí & Mục tiêu"
        description="Nhập chi phí cố định và mục tiêu doanh thu để tính lợi nhuận thực tế và theo dõi tiến độ"
      />

      {/* Chọn tháng */}
      <div className="flex items-center gap-2">
        <Label className="text-xs text-muted-foreground">Tháng:</Label>
        <Select value={selectedMonth} onValueChange={setSelectedMonth}>
          <SelectTrigger className="h-8 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from({ length: 6 }, (_, i) => {
              const d = startOfMonth(new Date())
              d.setMonth(d.getMonth() - i)
              const val = format(d, 'yyyy-MM-dd')
              return (
                <SelectItem key={val} value={val}>
                  {format(d, 'MM/yyyy', { locale: vi })}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Chi phí cố định */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Chi phí cố định tháng
          </CardTitle>
          <CardDescription className="text-xs">
            Nhập các khoản chi cố định để tính lợi nhuận thực tế
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FIXED_COST_CATEGORIES.map(cat => (
            <div key={cat.value} className="flex items-center gap-3">
              <Label className="text-sm flex-1">{cat.label}</Label>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                placeholder="0"
                value={drafts[cat.value] || ''}
                onChange={e => setDrafts(prev => ({ ...prev, [cat.value]: e.target.value }))}
                className="max-w-[180px] text-right h-9"
              />
              <span className="text-xs text-muted-foreground w-10">VND</span>
            </div>
          ))}
          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-sm">
              Tổng:{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(totalFixed)}
              </span>
            </div>
            <Button
              type="button"
              onClick={() => saveCosts.mutate()}
              disabled={saveCosts.isPending}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saveCosts.isPending ? 'Đang lưu…' : 'Lưu chi phí'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Mục tiêu tháng */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" /> Mục tiêu tháng
          </CardTitle>
          <CardDescription className="text-xs">
            Đặt mục tiêu để theo dõi tiến độ trên trang Tổng quan
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3">
            <Label className="text-sm flex-1">Doanh thu mục tiêu</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="0"
              value={revenueTarget}
              onChange={e => setRevenueTarget(e.target.value)}
              className="max-w-[180px] text-right h-9"
            />
            <span className="text-xs text-muted-foreground w-10">VND</span>
          </div>
          <div className="flex items-center gap-3">
            <Label className="text-sm flex-1">Công suất mục tiêu (%)</Label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.01"
              placeholder="0"
              value={occupancyTarget}
              onChange={e => setOccupancyTarget(e.target.value)}
              className="max-w-[180px] text-right h-9"
            />
            <span className="text-xs text-muted-foreground w-10">%</span>
          </div>
          <div className="flex items-center justify-end border-t pt-3">
            <Button
              type="button"
              onClick={() => saveTarget.mutate()}
              disabled={saveTarget.isPending}
            >
              <Save className="h-4 w-4 mr-1.5" />
              {saveTarget.isPending ? 'Đang lưu…' : 'Lưu mục tiêu'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default FixedCostsSettingsPage
