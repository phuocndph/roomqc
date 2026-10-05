import { useState, useEffect } from 'react'
import { useUsers } from '@/hooks/useUsers'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { UserPermissionPanel } from '@/components/permissions/UserPermissionPanel'
import { UserAvatar } from '@/components/users/UserAvatar'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import { RefreshCw, Search, Users, ChevronRight } from 'lucide-react'
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

interface PermissionConfigurationTabProps {
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

export function PermissionConfigurationTab({ preSelectedUserId }: PermissionConfigurationTabProps) {
  const { users, isLoading } = useUsers()
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')
  const queryClient = useQueryClient()

  // Set pre-selected user if provided
  useEffect(() => {
    if (preSelectedUserId) {
      setSelectedUserId(preSelectedUserId)
    }
  }, [preSelectedUserId])

  const selectedUser = users?.find((u) => u.id === selectedUserId) || null

  const filteredUsers = users?.filter((user) => {
    const matchesSearch =
      search === '' ||
      user.full_name.toLowerCase().includes(search.toLowerCase()) ||
      user.email.toLowerCase().includes(search.toLowerCase())

    const matchesLevel = levelFilter === 'all' || user.user_level_code === levelFilter

    return matchesSearch && matchesLevel
  }) || []

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ['users'] })
    queryClient.invalidateQueries({ queryKey: ['user-permission-configuration'] })
    toast.success('Đã làm mới dữ liệu')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-180px)] bg-background">
      {/* Left Sidebar - User List */}
      <div className="w-80 border-r flex flex-col bg-muted/20">
        {/* Sidebar Header */}
        <div className="p-3 border-b space-y-2 bg-background">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs font-medium">Danh sách người dùng</span>
            </div>
            <Button 
              onClick={handleRefresh} 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên, email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>

          {/* Level Filter */}
          <Select value={levelFilter} onValueChange={setLevelFilter}>
            <SelectTrigger className="h-8 text-xs">
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

        {/* User List */}
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-0.5">
            {filteredUsers.map((user) => {
              const levelConfig = USER_LEVEL_CONFIG[user.user_level_code] || USER_LEVEL_CONFIG.viewer
              const isSelected = selectedUserId === user.id
              
              return (
                <button
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={cn(
                    'w-full p-2.5 rounded-md text-left transition-all flex items-center gap-2.5 group',
                    isSelected 
                      ? 'bg-primary/10 border border-primary/30' 
                      : 'hover:bg-accent border border-transparent'
                  )}
                >
                  <UserAvatar user={user} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      'text-sm truncate',
                      isSelected ? 'font-medium' : 'font-normal'
                    )}>
                      {user.full_name}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className={cn('text-[10px] font-medium', levelConfig.color)}>
                        {levelConfig.label}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">
                        • {user.email}
                      </span>
                    </div>
                  </div>
                  <ChevronRight className={cn(
                    'h-3.5 w-3.5 text-muted-foreground transition-transform',
                    isSelected && 'text-primary'
                  )} />
                </button>
              )
            })}

            {filteredUsers.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Không tìm thấy người dùng
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Sidebar Footer */}
        <div className="p-2 border-t bg-background">
          <p className="text-[10px] text-muted-foreground text-center">
            {filteredUsers.length} người dùng
          </p>
        </div>
      </div>

      {/* Right Panel - Permission Configuration */}
      <div className="flex-1 overflow-hidden">
        <UserPermissionPanel user={selectedUser} />
      </div>
    </div>
  )
}
