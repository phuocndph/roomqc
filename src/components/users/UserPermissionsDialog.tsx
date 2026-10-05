import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import {
  useUserPermissionsSummary,
  useUserPermissionsWithSource,
  useUpdateUserPermissions,
  MODULES,
  ACTIONS,
} from '@/hooks/useUserPermissions'
import { UserWithRelations } from '@/types/database.types'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from '@/hooks/use-toast'

interface UserPermissionsDialogProps {
  user: UserWithRelations | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function UserPermissionsDialog({ user, open, onOpenChange }: UserPermissionsDialogProps) {
  const { data: permissionsSummary, isLoading } = useUserPermissionsSummary(user?.id)
  const { data: permissionsWithSource } = useUserPermissionsWithSource(user?.id)
  const updatePermissions = useUpdateUserPermissions()

  const [permissions, setPermissions] = useState<Record<string, Record<string, boolean>>>({})
  const [isSaving, setIsSaving] = useState(false)

  // Create a map of permission sources for easy lookup
  const permissionSourceMap = permissionsWithSource?.reduce((acc, perm) => {
    const key = `${perm.module}.${perm.action}`
    acc[key] = perm.source
    return acc
  }, {} as Record<string, 'role' | 'user'>) || {}

  useEffect(() => {
    if (permissionsSummary) {
      const newPermissions: Record<string, Record<string, boolean>> = {}
      
      // Initialize ALL modules with default false values
      MODULES.forEach((module) => {
        newPermissions[module.code] = {
          view: false,
          create: false,
          update: false,
          delete: false,
          export: false,
          approve: false,
          assign: false,
          manage: false,
        }
      })
      
      // Override with actual permissions from summary
      permissionsSummary.forEach((summary) => {
        newPermissions[summary.module] = {
          view: summary.can_view,
          create: summary.can_create,
          update: summary.can_update,
          delete: summary.can_delete,
          export: summary.can_export,
          approve: summary.can_approve,
          assign: summary.can_assign,
          manage: summary.can_manage,
        }
      })
      
      setPermissions(newPermissions)
    }
  }, [permissionsSummary])

  const togglePermission = (module: string, action: string) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        ...prev[module],
        [action]: !prev[module]?.[action],
      },
    }))
  }

  const toggleAllActions = (module: string, enabled: boolean) => {
    setPermissions((prev) => ({
      ...prev,
      [module]: {
        view: enabled,
        create: enabled,
        update: enabled,
        delete: enabled,
        export: enabled,
        approve: enabled,
        assign: enabled,
        manage: enabled,
      },
    }))
  }

  const handleSave = async () => {
    if (!user?.id) return

    setIsSaving(true)
    try {
      const permissionsArray: { module: string; action: string; enabled: boolean }[] = []

      Object.entries(permissions).forEach(([module, actions]) => {
        Object.entries(actions).forEach(([action, enabled]) => {
          if (enabled) {
            permissionsArray.push({ module, action, enabled: true })
          }
        })
      })

      await updatePermissions.mutateAsync({
        userId: user.id,
        permissions: permissionsArray,
      })

      toast({
        title: '✅ Lưu thành công',
        description: `Đã cập nhật quyền cho ${user.full_name}`,
      })
      onOpenChange(false)
    } catch (error) {
      console.error('Failed to save permissions:', error)
      toast({
        title: '❌ Lỗi khi lưu',
        description: 'Không thể cập nhật quyền. Vui lòng thử lại.',
        variant: 'destructive',
      })
    } finally {
      setIsSaving(false)
    }
  }

  if (!user) return null

  const isOwner = user.user_level_code === 'tenant_owner'
  const isSuperAdmin = user.is_super_admin

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Phân quyền chi tiết
          </DialogTitle>
          <DialogDescription>
            Quản lý quyền truy cập cho <strong>{user.full_name}</strong>
          </DialogDescription>
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline">{user.email}</Badge>
            <Badge>
              {user.user_level_code === 'tenant_owner'
                ? 'Chủ sở hữu'
                : user.user_level_code === 'manager'
                ? 'Quản lý'
                : user.user_level_code === 'department_manager'
                ? 'Quản lý bộ phận'
                : 'Nhân viên'}
            </Badge>
          </div>
        </DialogHeader>

        {(isSuperAdmin || isOwner) && (
          <Alert>
            <AlertDescription>
              {isSuperAdmin
                ? 'Super Admin có toàn quyền truy cập tất cả modules và không thể thay đổi.'
                : 'Chủ sở hữu có toàn quyền truy cập tất cả modules và không thể thay đổi.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Hotel Scope Section */}
        <Alert className="bg-accent/50">
          <AlertDescription>
            <div className="space-y-1">
              <strong>Phạm vi quyền:</strong>
              {isOwner ? (
                <span className="text-sm ml-2">Tất cả khách sạn trong hệ thống</span>
              ) : user.hotel ? (
                <Badge variant="outline" className="ml-2">
                  {user.hotel.name}
                </Badge>
              ) : (
                <span className="text-sm ml-2 text-muted-foreground">Chưa gán khách sạn</span>
              )}
            </div>
          </AlertDescription>
        </Alert>

        <ScrollArea className="flex-1 pr-4 h-full max-h-[calc(90vh-20rem)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="space-y-3">
              {MODULES.map((module) => {
                const modulePermissions = permissions[module.code] || {}
                const allEnabled = ACTIONS.every((action) => modulePermissions[action.code])

                return (
                  <div key={module.code} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between pb-2 border-b">
                      <span className="font-semibold text-sm">{module.name}</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newState = !allEnabled
                          toggleAllActions(module.code, newState)
                        }}
                        disabled={isSuperAdmin || isOwner || isSaving}
                      >
                        {allEnabled ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {ACTIONS.map((action) => {
                        const isChecked = modulePermissions[action.code] || false
                        const permissionKey = `${module.code}.${action.code}`
                        const source = permissionSourceMap[permissionKey]

                        return (
                          <div
                            key={action.code}
                            className="flex items-center space-x-2 p-1.5 rounded border border-border hover:bg-accent/30 transition-colors"
                          >
                            <Checkbox
                              id={`${module.code}-${action.code}`}
                              checked={isSuperAdmin || isOwner ? true : isChecked}
                              onCheckedChange={() =>
                                togglePermission(module.code, action.code)
                              }
                              disabled={isSuperAdmin || isOwner || isSaving}
                            />
                            <div className="flex-1 flex items-center justify-between gap-1.5 min-w-0">
                              <label
                                htmlFor={`${module.code}-${action.code}`}
                                className="text-xs font-medium leading-none cursor-pointer truncate"
                              >
                                {action.name}
                              </label>
                              {isChecked && source && (
                                <Badge 
                                  variant={source === 'role' ? 'secondary' : 'default'} 
                                  className="text-[9px] px-1 py-0 h-3.5 shrink-0"
                                >
                                  {source === 'role' ? 'Role' : 'Custom'}
                                </Badge>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button 
            variant="outline" 
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            Hủy
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || isSuperAdmin || isOwner}
          >
            {isSaving ? (
              <>
                <LoadingSpinner />
                <span className="ml-2">Đang lưu...</span>
              </>
            ) : (
              '💾 Lưu thay đổi'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
