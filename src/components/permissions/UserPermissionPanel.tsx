import { useState, useEffect, useRef } from 'react'
import { UserWithRelations } from '@/types/database.types'
import { UserAvatar } from '@/components/users/UserAvatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { ModuleToggle } from './ModuleToggle'
import { HotelAssignmentSection } from './HotelAssignmentSection'
import { useUserPermissionConfiguration } from '@/hooks/useUserPermissionConfiguration'
import { MODULES, MODULE_ACTIONS, getModuleActions } from '@/hooks/useUserPermissions'
import { Info, Save, Shield, Building2, AlertTriangle, Key } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface UserPermissionPanelProps {
  user: UserWithRelations | null
}

const USER_LEVEL_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  tenant_owner: { label: 'Chủ sở hữu', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  super_admin: { label: 'Super Admin', color: 'text-red-600', bgColor: 'bg-red-50' },
  manager: { label: 'Quản lý', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  staff: { label: 'Nhân viên', color: 'text-green-600', bgColor: 'bg-green-50' },
  viewer: { label: 'Người xem', color: 'text-muted-foreground', bgColor: 'bg-muted' },
}

export function UserPermissionPanel({ user }: UserPermissionPanelProps) {
  const { permissionsData, isLoading, saveConfiguration, isSaving } =
    useUserPermissionConfiguration(user?.id)

  const [localPermissions, setLocalPermissions] = useState<Record<string, boolean>>({})
  const [localActions, setLocalActions] = useState<Record<string, Record<string, boolean>>>({})
  const [hasActionChanges, setHasActionChanges] = useState(false)
  const isDirtyRef = useRef(false)

  // Initialize local state from fetched data - only when no unsaved changes
  useEffect(() => {
    if (permissionsData && !isDirtyRef.current) {
      const initial: Record<string, boolean> = {}
      const initialActions: Record<string, Record<string, boolean>> = {}
      
      Object.entries(permissionsData).forEach(([module, state]) => {
        initial[module] = state.enabled
        if (state.actions) {
          initialActions[module] = { ...state.actions }
        }
      })
      
      setLocalPermissions(initial)
      setLocalActions(initialActions)
    }
  }, [permissionsData])

  if (!user) {
    return (
      <div className="flex items-center justify-center h-full bg-muted/20">
        <div className="text-center p-8">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-4">
            <Key className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">Chọn người dùng</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Chọn một người dùng từ danh sách bên trái để cấu hình quyền
          </p>
        </div>
      </div>
    )
  }

  const handleToggle = (module: string, enabled: boolean) => {
    setLocalPermissions((prev) => ({
      ...prev,
      [module]: enabled,
    }))

    // When enabling module, enable all applicable actions
    if (enabled) {
      const applicableActionCodes = MODULE_ACTIONS[module] || ['view', 'create', 'update', 'delete', 'export', 'approve']
      const actionsObj: Record<string, boolean> = {}
      applicableActionCodes.forEach(a => { actionsObj[a] = true })
      setLocalActions((prev) => ({
        ...prev,
        [module]: actionsObj,
      }))
    } else {
      const applicableActionCodes = MODULE_ACTIONS[module] || ['view', 'create', 'update', 'delete', 'export', 'approve']
      const actionsObj: Record<string, boolean> = {}
      applicableActionCodes.forEach(a => { actionsObj[a] = false })
      setLocalActions((prev) => ({
        ...prev,
        [module]: actionsObj,
      }))
    }
    setHasActionChanges(true)
    isDirtyRef.current = true
  }

  const handleActionToggle = (module: string, action: string, enabled: boolean) => {
    if (!user) return
    
    setLocalActions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [action]: enabled,
      },
    }))
    setHasActionChanges(true)
    isDirtyRef.current = true
  }

  const handleSave = () => {
    if (!user) return
    
    saveConfiguration({ 
      userId: user.id, 
      modules: localPermissions,
      actions: localActions,
    }, {
      onSuccess: () => {
        setHasActionChanges(false)
        isDirtyRef.current = false
      },
    })
  }

  const hasModuleChanges = permissionsData 
    ? Object.keys(localPermissions).some(
        (module) => localPermissions[module] !== permissionsData[module]?.enabled
      )
    : false

  const hasChanges = hasModuleChanges || hasActionChanges

  // Check if user is owner/super admin (cannot be edited)
  const isProtectedUser = user.user_level_code === 'tenant_owner' || user.user_level_code === 'super_admin'
  const levelConfig = USER_LEVEL_CONFIG[user.user_level_code] || USER_LEVEL_CONFIG.viewer

  // Count enabled modules
  const enabledModulesCount = Object.values(localPermissions).filter(Boolean).length

  return (
    <div className="flex flex-col h-full">
      {/* Compact User Header */}
      <div className="p-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <UserAvatar user={user} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold truncate">{user.full_name}</h2>
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded',
                levelConfig.color, levelConfig.bgColor
              )}>
                {levelConfig.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
          
          {/* Quick Stats */}
          <div className="flex items-center gap-3 text-center">
            <div className="px-3 py-1.5 rounded-md bg-muted/50">
              <p className="text-lg font-bold text-primary">{enabledModulesCount}</p>
              <p className="text-[10px] text-muted-foreground">Modules</p>
            </div>
          </div>
        </div>

        {isProtectedUser && (
          <div className="mt-3 flex items-center gap-2 p-2 rounded-md bg-amber-50 border border-amber-200">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 flex-shrink-0" />
            <p className="text-[11px] text-amber-700">
              Không thể chỉnh sửa quyền cho {levelConfig.label}. Họ có toàn quyền truy cập.
            </p>
          </div>
        )}
      </div>

      {/* Tabbed Content */}
      <Tabs defaultValue="modules" className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30">
          <TabsList className="h-8 bg-transparent p-0 gap-1">
            <TabsTrigger 
              value="modules" 
              className="h-7 text-xs gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              <Shield className="h-3.5 w-3.5" />
              Quyền Module
            </TabsTrigger>
            <TabsTrigger 
              value="hotels" 
              className="h-7 text-xs gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              <Building2 className="h-3.5 w-3.5" />
              Khách sạn
            </TabsTrigger>
          </TabsList>
        </div>
        
        <ScrollArea className="flex-1">
          <TabsContent value="modules" className="p-4 mt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : (
              <div className="space-y-4">
                {/* Info */}
                <div className="flex items-start gap-2 p-2.5 rounded-md bg-blue-50 border border-blue-100">
                  <Info className="h-3.5 w-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-[11px] text-blue-700">
                    Bật module để cho phép truy cập. Click mũi tên để tùy chỉnh chi tiết từng quyền.
                  </p>
                </div>

                {/* Module List */}
                <div className="space-y-1.5">
                  {MODULES.map((module) => (
                    <ModuleToggle
                      key={module.code}
                      moduleName={module.name}
                      enabled={localPermissions[module.code] || false}
                      source={permissionsData?.[module.code]?.source || null}
                      onChange={(enabled) => handleToggle(module.code, enabled)}
                      disabled={isProtectedUser}
                      actions={localActions[module.code]}
                      onActionChange={(action, enabled) => handleActionToggle(module.code, action, enabled)}
                      applicableActions={getModuleActions(module.code)}
                    />
                  ))}
                </div>

              </div>
            )}
          </TabsContent>
          
          <TabsContent value="hotels" className="p-4 mt-0">
            <HotelAssignmentSection user={user} disabled={isProtectedUser} />
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Sticky Save Bar - always visible when there are changes */}
      {hasChanges && !isProtectedUser && (
        <div className="p-3 border-t border-amber-200 bg-amber-50">
          <Button
            onClick={handleSave}
            disabled={isSaving}
            className="w-full h-9 text-xs"
            size="sm"
          >
            <Save className="h-3.5 w-3.5 mr-1.5" />
            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
          </Button>
          <p className="text-[10px] text-amber-600 text-center mt-1">
            Bạn có thay đổi chưa lưu
          </p>
        </div>
      )}
    </div>
  )
}
