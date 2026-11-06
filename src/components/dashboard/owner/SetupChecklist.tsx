import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Circle, ArrowRight, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Button } from '@/components/ui/button'
import { useState, useEffect } from 'react'
import { scopedStorageKey } from '@/lib/runtime-config'
import { useHotelContext } from '@/contexts/HotelContext'

interface ChecklistItem {
  key: string
  label: string
  description: string
  href: string
  count: number
  required: number
  done: boolean
}


/**
 * Setup checklist hiển thị các bước cấu hình ban đầu.
 * Tự động ẩn khi đã đủ tất cả mục, hoặc user dismiss.
 * Sprint 2.2 — thay cho wizard 6 bước, tận dụng các trang quản lý có sẵn.
 */
export function SetupChecklist() {
  const { tenantId, user } = useUser()
  const { selectedHotel } = useHotelContext()
  const hotelId = selectedHotel?.id
  const dismissKey = scopedStorageKey(`setup-checklist-dismissed:${tenantId}:${hotelId}`, user?.id)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem(dismissKey) === '1')
    }
  }, [dismissKey])

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['setup-checklist', tenantId, hotelId],
    queryFn: async (): Promise<ChecklistItem[]> => {
      if (!tenantId || !hotelId) return []

      const [warehouses, rooms, items, users] = await Promise.all([
        supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('hotel_id', hotelId),
        supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('hotel_id', hotelId),
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('hotel_id', hotelId),
      ])
      for (const result of [warehouses, rooms, items, users]) if (result.error) throw result.error

      const c = (n: number | null | undefined) => n ?? 0
      const list: ChecklistItem[] = [
        {
          key: 'warehouse',
          label: 'Tạo kho hàng',
          description: 'Tùy chọn: khai báo kho nếu sử dụng quản lý vật tư.',
          // Warehouses live under the inventory settings hub.
          href: '/settings/warehouses',
          count: c(warehouses.count),
          required: 1,
          done: c(warehouses.count) >= 1,
        },
        {
          key: 'rooms',
          label: 'Thêm phòng',
          description: 'Thêm phòng hoặc nhập hàng loạt bằng file Excel mẫu tại Quản lý phòng.',
          href: '/rooms',
          count: c(rooms.count),
          required: 1,
          done: c(rooms.count) >= 1,
        },
        {
          key: 'items',
          label: 'Thêm sản phẩm / vật tư',
          description: 'Tùy chọn: đồ vải, minibar, đồ cấp phát…',
          href: '/items',
          count: c(items.count),
          required: 1,
          done: c(items.count) >= 1,
        },
        {
          key: 'users',
          label: 'Mời nhân viên',
          description: 'Tùy chọn: tạo nhân viên và cấp quyền theo vị trí.',
          href: '/settings/users',
          count: c(users.count),
          required: 2,
          done: c(users.count) >= 2,
        },
      ]
      return list
    },
    enabled: !!tenantId && !!hotelId,
    staleTime: 60_000,
  })

  if (!tenantId || !hotelId || dismissed || isLoading) return null
  if (error) return <div className="rounded border p-4 text-sm">Chưa tải được tiến độ thiết lập. <Button variant="link" onClick={() => void refetch()}>Thử lại</Button></div>
  if (!data || data.length === 0) return null

  if (data.every(item => item.done)) return null
  const roomStep = data.find(item => item.key === 'rooms')
  const optionalSteps = data.filter(item => item.key !== 'rooms')

  const handleDismiss = () => {
    localStorage.setItem(dismissKey, '1')
    setDismissed(true)
  }

  return (
    <div className="border rounded-none bg-background">
      <div className="flex items-start justify-between p-4 border-b">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Bắt đầu sử dụng</h3>
          <p className="text-xs text-muted-foreground">
            {roomStep?.done ? 'Đã có phòng, bạn có thể bắt đầu vận hành.' : 'Thêm danh sách phòng để bắt đầu. Các phần khác có thể làm sau.'}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-7 w-7 p-0" aria-label="Ẩn checklist">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ul className="divide-y">
        {roomStep && renderStep(roomStep)}
      </ul>
      <details className="border-t">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Thiết lập thêm khi cần (tùy chọn)</summary>
        <ul className="divide-y">{optionalSteps.map(renderStep)}</ul>
      </details>
    </div>
  )

  function renderStep(item: ChecklistItem) {
    return (
          <li key={item.key} className="flex items-center gap-3 px-4 py-3">
            {item.done ? (
              <Check className="h-4 w-4 text-green-600 shrink-0" />
            ) : (
              <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={`text-sm ${item.done ? 'text-muted-foreground line-through' : 'font-medium'}`}>
                  {item.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{item.description}</p>
            </div>
            {!item.done && (
              <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
                <Link to={item.href}>
                  {item.key === 'rooms' ? 'Thêm phòng' : 'Thiết lập'} <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            )}
          </li>
    )
  }
}
