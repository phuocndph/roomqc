import { useState, useEffect } from 'react'
import { useRolesManagement } from '@/hooks/useRolesManagement'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Info, Shield, Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const MODULE_NAMES: Record<string, string> = {
  dashboard: 'Dashboard',
  users: 'Người dùng',
  hotels: 'Khách sạn',
  rooms: 'Phòng',
  items: 'Vật phẩm',
  inventory: 'Kho',
  laundry: 'Giặt là',
  maintenance: 'Bảo trì',
  vendors: 'Nhà cung cấp',
  purchase_orders: 'Đơn mua hàng',
  reports: 'Báo cáo',
  settings: 'Cài đặt',
}

const ROLE_COLORS: Record<number, { bg: string; text: string }> = {
  1: { bg: 'bg-purple-50', text: 'text-purple-700' },
  2: { bg: 'bg-blue-50', text: 'text-blue-700' },
  3: { bg: 'bg-green-50', text: 'text-green-700' },
  4: { bg: 'bg-gray-50', text: 'text-gray-700' },
}

export function MobileRolesOverviewTab() {
  const { roles, isLoading, fetchRoleWithPermissions } = useRolesManagement()
  const [rolesWithPermissions, setRolesWithPermissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      if (!roles) return
      setLoading(true)
      try {
        const loaded = await Promise.all(
          roles.map((r) => fetchRoleWithPermissions(r.id))
        )
        setRolesWithPermissions(loaded)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [roles, fetchRoleWithPermissions])

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 border border-blue-100">
        <Info className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-blue-700 leading-snug">
          Vai trò định nghĩa sẵn. Tùy chỉnh quyền cho từng người dùng ở tab{' '}
          <span className="font-medium">Cấu hình Quyền</span>.
        </p>
      </div>

      <div className="space-y-2">
        {rolesWithPermissions.map((role) => {
          const modules = Array.from(new Set(role.permissions.map((p: any) => p.module))) as string[]
          const color = ROLE_COLORS[role.hierarchy_level] || ROLE_COLORS[4]
          const isOpen = expanded === role.id

          return (
            <div key={role.id} className="border rounded-lg overflow-hidden bg-background">
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : role.id)}
                className="w-full flex items-center gap-2.5 p-3 text-left hover:bg-muted/30 transition-colors"
              >
                <div className={cn('w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0', color.bg)}>
                  <Shield className={cn('h-4 w-4', color.text)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium truncate">{role.name}</span>
                    {role.is_system && (
                      <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                        HT
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Cấp {role.hierarchy_level} · {modules.length} module
                  </p>
                </div>
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>

              {isOpen && (
                <div className="px-3 pb-3 pt-1 border-t bg-muted/10">
                  {role.description && (
                    <p className="text-[11px] text-muted-foreground mb-2">{role.description}</p>
                  )}
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
                    Modules được phép
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {modules.length > 0 ? (
                      modules.map((m) => (
                        <span
                          key={m}
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100"
                        >
                          <Check className="h-2.5 w-2.5" />
                          {MODULE_NAMES[m] || m}
                        </span>
                      ))
                    ) : (
                      <span className="text-[11px] text-muted-foreground italic">
                        Không có quyền module
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-muted-foreground text-center pt-1">
        Tổng cộng {rolesWithPermissions.length} vai trò ·{' '}
        {Object.keys(MODULE_NAMES).length} module
      </p>
    </div>
  )
}
