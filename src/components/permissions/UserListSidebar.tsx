import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UserWithRelations } from '@/types/database.types'
import { UserAvatar } from '@/components/users/UserAvatar'
import { Badge } from '@/components/ui/badge'
import { Search } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'

interface UserListSidebarProps {
  users: UserWithRelations[]
  selectedUserId: string | null
  onSelectUser: (userId: string) => void
}

const USER_LEVEL_LABELS: Record<string, string> = {
  tenant_owner: 'Chủ sở hữu',
  manager: 'Quản lý',
  staff: 'Nhân viên',
  viewer: 'Người xem',
}

export function UserListSidebar({
  users,
  selectedUserId,
  onSelectUser,
}: UserListSidebarProps) {
  const [search, setSearch] = useState('')
  const [levelFilter, setLevelFilter] = useState('all')

  const filteredUsers = useMemo(() => {
    return users.filter((user) => {
      const matchesSearch =
        search === '' ||
        user.full_name.toLowerCase().includes(search.toLowerCase()) ||
        user.email.toLowerCase().includes(search.toLowerCase())

      const matchesLevel = levelFilter === 'all' || user.user_level_code === levelFilter

      return matchesSearch && matchesLevel
    })
  }, [users, search, levelFilter])

  return (
    <div className="flex flex-col h-full border-r bg-muted/30">
      <div className="p-4 space-y-4 border-b bg-background">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <Select value={levelFilter} onValueChange={setLevelFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Lọc theo cấp bậc" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả cấp bậc</SelectItem>
            <SelectItem value="tenant_owner">Chủ sở hữu</SelectItem>
            <SelectItem value="manager">Quản lý</SelectItem>
            <SelectItem value="staff">Nhân viên</SelectItem>
            <SelectItem value="viewer">Người xem</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {filteredUsers.map((user) => (
            <button
              key={user.id}
              onClick={() => onSelectUser(user.id)}
              className={cn(
                'w-full p-3 rounded-lg text-left transition-colors',
                'hover:bg-accent',
                selectedUserId === user.id && 'bg-accent border-2 border-primary'
              )}
            >
              <div className="flex items-center gap-3">
                <UserAvatar user={user} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {USER_LEVEL_LABELS[user.user_level_code] || user.user_level_code}
                    </Badge>
                  </div>
                </div>
              </div>
            </button>
          ))}

          {filteredUsers.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Không tìm thấy người dùng
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
