import { useState, useEffect } from 'react'
import { useRolesManagement } from '@/hooks/useRolesManagement'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Info, Shield, Check, Users } from 'lucide-react'
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

const ROLE_COLORS: Record<number, { border: string; bg: string; text: string }> = {
  1: { border: 'border-purple-200', bg: 'bg-purple-50', text: 'text-purple-700' },
  2: { border: 'border-blue-200', bg: 'bg-blue-50', text: 'text-blue-700' },
  3: { border: 'border-green-200', bg: 'bg-green-50', text: 'text-green-700' },
  4: { border: 'border-gray-200', bg: 'bg-gray-50', text: 'text-gray-700' },
}

export function RolesOverviewTab() {
  const { roles, isLoading, fetchRoleWithPermissions } = useRolesManagement()
  const [rolesWithPermissions, setRolesWithPermissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadRolesWithPermissions = async () => {
      if (!roles) return
      
      setLoading(true)
      try {
        const loaded = await Promise.all(
          roles.map(role => fetchRoleWithPermissions(role.id))
        )
        setRolesWithPermissions(loaded)
      } catch (error) {
        console.error('Error loading roles:', error)
      } finally {
        setLoading(false)
      }
    }

    loadRolesWithPermissions()
  }, [roles, fetchRoleWithPermissions])

  if (isLoading || loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <LoadingSpinner />
      </div>
    )
  }

  // Group permissions by module
  const getModulesForRole = (permissions: any[]) => {
    const modules = new Set(permissions.map(p => p.module))
    return Array.from(modules)
  }

  return (
    <div className="space-y-4">
      {/* Info Alert */}
      <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 border border-blue-100">
        <Info className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
        <p className="text-[11px] text-blue-700">
          Các vai trò được định nghĩa sẵn trong hệ thống. Để tùy chỉnh quyền cho từng người dùng, sử dụng tab <span className="font-medium">Cấu hình Quyền</span>.
        </p>
      </div>

      {/* Roles Table View */}
      <div className="border rounded-lg overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-3 p-3 bg-muted/50 border-b text-xs font-medium text-muted-foreground">
          <div className="col-span-3">Vai trò</div>
          <div className="col-span-1 text-center">Cấp độ</div>
          <div className="col-span-8">Modules được phép</div>
        </div>

        {/* Roles List */}
        <div className="divide-y">
          {rolesWithPermissions.map((role) => {
            const modules = getModulesForRole(role.permissions)
            const colorConfig = ROLE_COLORS[role.hierarchy_level] || ROLE_COLORS[4]
            
            return (
              <div 
                key={role.id} 
                className="grid grid-cols-12 gap-3 p-3 items-center hover:bg-muted/30 transition-colors"
              >
                {/* Role Info */}
                <div className="col-span-3 flex items-center gap-2.5">
                  <div className={cn(
                    'w-8 h-8 rounded-md flex items-center justify-center',
                    colorConfig.bg
                  )}>
                    <Shield className={cn('h-4 w-4', colorConfig.text)} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{role.name}</span>
                      {role.is_system && (
                        <span className="text-[9px] px-1 py-0.5 rounded bg-muted text-muted-foreground">
                          HT
                        </span>
                      )}
                    </div>
                    {role.description && (
                      <p className="text-[10px] text-muted-foreground truncate">{role.description}</p>
                    )}
                  </div>
                </div>

                {/* Level */}
                <div className="col-span-1 text-center">
                  <span className={cn(
                    'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                    colorConfig.bg, colorConfig.text
                  )}>
                    {role.hierarchy_level}
                  </span>
                </div>

                {/* Modules */}
                <div className="col-span-8">
                  <div className="flex flex-wrap gap-1">
                    {modules.length > 0 ? (
                      modules.map((module) => (
                        <span 
                          key={module} 
                          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-100"
                        >
                          <Check className="h-2.5 w-2.5" />
                          {MODULE_NAMES[module] || module}
                        </span>
                      ))
                    ) : (
                      <span className="text-[10px] text-muted-foreground italic">
                        Không có quyền module
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4 p-3 rounded-md bg-muted/30 border">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            Tổng cộng <span className="font-medium text-foreground">{rolesWithPermissions.length}</span> vai trò
          </span>
        </div>
        <div className="h-4 w-px bg-border" />
        <span className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{Object.keys(MODULE_NAMES).length}</span> modules có sẵn
        </span>
      </div>
    </div>
  )
}
