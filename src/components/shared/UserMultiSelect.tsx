import { useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useUsers } from '@/hooks/useUsers'

interface UserMultiSelectProps {
  value: string[]
  onChange: (value: string[]) => void
  placeholder?: string
  filters?: {
    role?: string[]
    status?: string
  }
}

export function UserMultiSelect({
  value = [],
  onChange,
  placeholder = 'Chọn người dùng...',
  filters,
}: UserMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const { users, isLoading } = useUsers()
  
  // Apply filters
  const filteredUsers = users?.filter(user => {
    if (filters?.role && !filters.role.includes(user.role)) return false
    if (filters?.status && user.status !== filters.status) return false
    return true
  }) || []
  
  const selectedUsers = filteredUsers.filter(u => value.includes(u.id))

  const toggleUser = (userId: string) => {
    const newValue = value.includes(userId)
      ? value.filter(id => id !== userId)
      : [...value, userId]
    onChange(newValue)
  }

  const removeUser = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    onChange(value.filter(id => id !== userId))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-auto min-h-10"
        >
          <div className="flex flex-wrap gap-1">
            {selectedUsers.length > 0 ? (
              selectedUsers.map(user => (
                <Badge
                  key={user.id}
                  variant="secondary"
                  className="gap-1"
                >
                  {user.full_name}
                  <X
                    className="h-3 w-3 cursor-pointer"
                    onClick={(e) => removeUser(user.id, e)}
                  />
                </Badge>
              ))
            ) : (
              <span className="text-muted-foreground">{placeholder}</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] p-0">
        <Command>
          <CommandInput placeholder="Tìm người dùng..." />
          <CommandEmpty>
            {isLoading ? 'Đang tải...' : 'Không tìm thấy người dùng'}
          </CommandEmpty>
          <CommandGroup className="max-h-64 overflow-auto">
            {filteredUsers.map(user => (
              <CommandItem
                key={user.id}
                value={user.full_name}
                onSelect={() => toggleUser(user.id)}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    value.includes(user.id) ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <Avatar className="mr-2 h-6 w-6">
                  <AvatarImage src={user.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {user.full_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="text-sm font-medium">{user.full_name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <Badge variant="outline" className="text-xs">
                  {user.position?.name || user.role}
                </Badge>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
