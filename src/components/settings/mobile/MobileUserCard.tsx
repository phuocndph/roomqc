import { useState } from 'react'
import { MoreVertical, Pencil, Shield, Users as UsersIcon, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/users/UserAvatar'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { DeleteUserDialog } from '@/components/users/DeleteUserDialog'

import { UserWithRelations } from '@/types/database.types'

interface MobileUserCardProps {
  user: UserWithRelations
  onEdit?: (user: UserWithRelations) => void
  onManagePermissions?: (userId: string) => void
}

const levelLabel: Record<string, string> = {
  super_admin: 'Quản trị hệ thống',
  tenant_owner: 'Chủ sở hữu',
  manager: 'Quản lý',
  staff: 'Nhân viên',
}

const levelTextColor: Record<string, string> = {
  super_admin: 'text-purple-600',
  tenant_owner: 'text-amber-600',
  manager: 'text-green-600',
  staff: 'text-muted-foreground',
}

export function MobileUserCard({ user, onEdit, onManagePermissions }: MobileUserCardProps) {
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [rolesOpen, setRolesOpen] = useState(false)
  const level = user.user_level_code || 'staff'
  const isActive = user.status === 'active'

  return (
    <>
      <div className="border rounded-lg p-3 bg-card">
        <div className="flex items-start gap-3">
          <UserAvatar user={user} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-sm truncate">{user.full_name}</span>
                  {user.is_primary_owner && (
                    <span className="text-[10px] text-amber-600 font-medium">CHÍNH</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{user.email}</div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 -mr-2 -mt-1 shrink-0">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <PermissionGate module="users" action="update">
                    {onEdit && (
                      <DropdownMenuItem onClick={() => onEdit(user)}>
                        <Pencil className="h-4 w-4 mr-2" /> Chỉnh sửa
                      </DropdownMenuItem>
                    )}
                    {onManagePermissions && (
                      <DropdownMenuItem onClick={() => onManagePermissions(user.id)}>
                        <Shield className="h-4 w-4 mr-2" /> Cấu hình quyền
                      </DropdownMenuItem>
                    )}
                  </PermissionGate>
                  <PermissionGate module="users" action="delete">
                    {!user.is_primary_owner && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setDeleteOpen(true)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Xoá
                        </DropdownMenuItem>
                      </>
                    )}
                  </PermissionGate>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className={levelTextColor[level]}>{levelLabel[level] || level}</span>
              {user.position?.name && (
                <span className="text-muted-foreground">· {user.position.name}</span>
              )}
              {user.hotel?.name && (
                <span className="text-muted-foreground truncate">· {user.hotel.name}</span>
              )}
              <span className={isActive ? 'text-green-600' : 'text-muted-foreground'}>
                · {isActive ? 'Hoạt động' : 'Tạm dừng'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <DeleteUserDialog
        user={deleteOpen ? user : null}
        open={deleteOpen}
        onOpenChange={(o) => !o && setDeleteOpen(false)}
      />
    </>
  )
}
