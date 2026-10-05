import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Check, Circle, ArrowRight, X } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useState, useEffect } from 'react'

interface ChecklistItem {
  key: string
  label: string
  description: string
  href: string
  count: number
  required: number
  done: boolean
}

const DISMISS_KEY = 'setup-checklist-dismissed'

/**
 * Setup checklist hiển thị các bước cấu hình ban đầu.
 * Tự động ẩn khi đã đủ tất cả mục, hoặc user dismiss.
 * Sprint 2.2 — thay cho wizard 6 bước, tận dụng các trang quản lý có sẵn.
 */
export function SetupChecklist() {
  const { tenantId } = useUser()
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1')
    }
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['setup-checklist', tenantId],
    queryFn: async (): Promise<ChecklistItem[]> => {
      if (!tenantId) return []

      const [warehouses, rooms, items, users] = await Promise.all([
        supabase.from('warehouses').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('rooms').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('items').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
        supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
      ])

      const c = (n: number | null | undefined) => n ?? 0
      const list: ChecklistItem[] = [
        {
          key: 'warehouse',
          label: 'Tạo kho hàng',
          description: 'Cần ít nhất 1 kho để quản lý vật tư.',
          // Warehouses live under the inventory settings hub.
          href: '/settings/warehouses',
          count: c(warehouses.count),
          required: 1,
          done: c(warehouses.count) >= 1,
        },
        {
          key: 'rooms',
          label: 'Thêm phòng',
          description: 'Khai báo danh sách phòng theo tầng.',
          href: '/rooms',
          count: c(rooms.count),
          required: 1,
          done: c(rooms.count) >= 1,
        },
        {
          key: 'items',
          label: 'Thêm sản phẩm / vật tư',
          description: 'Đồ vải, đồ ăn, minibar, đồ cấp phát…',
          href: '/items',
          count: c(items.count),
          required: 5,
          done: c(items.count) >= 5,
        },
        {
          key: 'users',
          label: 'Mời nhân viên',
          description: 'Tạo Manager + Staff để vận hành.',
          href: '/users',
          count: c(users.count),
          required: 2,
          done: c(users.count) >= 2,
        },
      ]
      return list
    },
    enabled: !!tenantId,
    staleTime: 60_000,
  })

  if (!tenantId || dismissed || isLoading || !data || data.length === 0) return null

  const doneCount = data.filter((i) => i.done).length
  const total = data.length
  const allDone = doneCount === total
  if (allDone) return null

  const progress = Math.round((doneCount / total) * 100)

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div className="border rounded-lg bg-background">
      <div className="flex items-start justify-between p-4 border-b">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">Hoàn tất thiết lập khách sạn</h3>
          <p className="text-xs text-muted-foreground">
            Còn {total - doneCount} bước nữa để sẵn sàng vận hành.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={handleDismiss} className="h-7 w-7 p-0" aria-label="Ẩn checklist">
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="px-4 pt-3 pb-1">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
          <span>{doneCount}/{total} hoàn tất</span>
          <span>{progress}%</span>
        </div>
        <Progress value={progress} className="h-1.5" />
      </div>

      <ul className="divide-y">
        {data.map((item) => (
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
                <span className="text-xs text-muted-foreground">
                  {item.count}/{item.required}
                </span>
              </div>
              <p className="text-xs text-muted-foreground truncate">{item.description}</p>
            </div>
            {!item.done && (
              <Button asChild variant="outline" size="sm" className="h-8 shrink-0">
                <Link to={item.href}>
                  Bắt đầu <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Link>
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
