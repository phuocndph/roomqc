import { useState, useEffect } from 'react'
import { useUsers } from '@/hooks/useUsers'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { UserPermissionPanel } from '@/components/permissions/UserPermissionPanel'
import { UserAvatar } from '@/components/users/UserAvatar'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { RefreshCw, Search, ChevronRight } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface MobilePermissionConfigurationTabProps {
  preSelectedUserId?: string | null
}

const USER_LEVEL_CONFIG: Record<string, { label: string; color: string }> = {
  tenant_owner: { label: 'Chủ sở hữu', color: 'text-purple-600' },
  super_admin: { label: 'Super Admin', color: 'text-red-600' },
  manager: { label: 'Quản lý', color: 'text-blue-600' },
  department_manager: { label: 'Quản lý bộ phận', color: 'text-cyan-600' },
  staff: { label: 'Nhân viên', color: 'text-green-600' },
  viewer: { label: 'Người xem', color: 'text-muted-foreground' },
}

export function MobilePermissionConfigurationTab({
  preSelectedUserId,
}: MobilePermissionConfigurationTabProps) {
  const { users, isLoading } = useUsers()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const queryClient = useQueryClient()

  useEffect(() => {
    if (preSelectedUserId) setSelectedUserId(preSelectedUserId)
  }, [preSelectedUserId])

  const selectedUser = users?.find((u) => u.id === selectedUserId) || null

  const filtered =
    users?.filter((u) => {
      const s =
        search === '' ||
        u.full_name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      const l = levelFilter === 'all' || u.user_level_code === levelFilter
      return s && l
    }) || []

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] })
    queryClient.invalidateQueries({ queryKey: ['user-permission-configuration'] })
    toast.success('Đã làm mới dữ liệu')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Search + filter + refresh */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-8 text-xs"
            />
          </div>
          <Button
            type="button"
            onClick={handleRefresh}
            variant="outline"
            size="icon"
            className="h-9 w-9 flex-shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Lọc theo cấp bậc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all" className="text-xs">Tất cả cấp bậc</SelectItem>
            <SelectItem value="tenant_owner" className="text-xs">Chủ sở hữu</SelectItem>
            <SelectItem value="manager" className="text-xs">Quản lý</SelectItem>
            <SelectItem value="department_manager" className="text-xs">Quản lý bộ phận</SelectItem>
            <SelectItem value="staff" className="text-xs">Nhân viên</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* User list */}
      <div className="border rounded-lg divide-y bg-background">
        {filtered.map((user) => {
          const lvl = USER_LEVEL_CONFIG[user.user_level_code] || USER_LEVEL_CONFIG.viewer
          return (
            <button
              key={user.id}
              type="button"
              onClick={() => setSelectedUserId(user.id)}
              className="w-full p-3 flex items-center gap-2.5 text-left hover:bg-muted/30 active:bg-muted/50 min-h-[56px]"
            >
              <UserAvatar user={user} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.full_name}</p>
                <div className="flex items-center gap-1.5">
                  <span className={cn('text-[11px] font-medium', lvl.color)}>
                    {lvl.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground truncate">
                    • {user.email}
                  </span>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-center py-8 text-xs text-muted-foreground">
            Không tìm thấy người dùng
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        {filtered.length} người dùng
      </p>

      {/* Permission sheet */}
      <Sheet
        open={!!selectedUserId}
        onOpenChange={(open) => !open && setSelectedUserId(null)}
      >
        <SheetContent
          side="bottom"
          className="h-[92vh] p-0 flex flex-col gap-0"
        >
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle className="text-sm">Cấu hình quyền</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-hidden">
            {selectedUser && <UserPermissionPanel user={selectedUser} />}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  )
}
