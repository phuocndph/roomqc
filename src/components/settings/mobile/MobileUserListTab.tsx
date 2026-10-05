import { useEffect, useMemo, useState } from 'react'
import { Search, SlidersHorizontal, Plus, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { EmptyState } from '@/components/shared/EmptyState'
import { useUsers, useCreateUser, useUpdateUser } from '@/hooks/useUsers'
import { useUser } from '@/hooks/useUser'
import { UserFormDialog } from '@/components/users/UserFormDialog'
import { UserWithRelations } from '@/types/database.types'
import { UserFormData } from '@/lib/validations/user.schemas'
import { MobileUserCard } from './MobileUserCard'
import {
  MobileUserFiltersSheet,
  UserFilterState,
} from './MobileUserFiltersSheet'

const DEFAULT_FILTERS: UserFilterState = {
  search: '',
  userLevel: 'all',
  status: 'all',
  hotelId: 'all',
  positionId: 'all',
  department: 'all',
  createdByMe: false,
}

interface Props {
  onManagePermissions?: (userId: string) => void
  editUserId?: string | null
}

export function MobileUserListTab({ onManagePermissions, editUserId }: Props) {
  const { users, isLoading } = useUsers()
  const { user: currentUser } = useUser()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()

  const [filters, setFilters] = useState<UserFilterState>(DEFAULT_FILTERS)
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithRelations | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [handledEditUserId, setHandledEditUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!editUserId || !users || handledEditUserId === editUserId) return
    const userToEdit = users.find((user) => user.id === editUserId)
    if (userToEdit) {
      setEditingUser(userToEdit)
      setFormOpen(true)
      setHandledEditUserId(editUserId)
    }
  }, [editUserId, handledEditUserId, users])

  const canAddUser =
    currentUser?.user_level_code === 'tenant_owner' ||
    currentUser?.user_level_code === 'manager'

  const activeFilterCount = [
    filters.userLevel !== 'all',
    filters.status !== 'all',
    filters.hotelId !== 'all',
    filters.positionId !== 'all',
    filters.department !== 'all',
    filters.createdByMe,
  ].filter(Boolean).length

  const filteredUsers = useMemo(() => {
    if (!users) return []
    const q = filters.search.trim().toLowerCase()
    return users.filter((u) => {
      if (q && !u.full_name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) {
        return false
      }
      if (filters.userLevel !== 'all' && u.user_level_code !== filters.userLevel) return false
      if (filters.status !== 'all' && u.status !== filters.status) return false
      if (filters.hotelId !== 'all' && u.hotel_id !== filters.hotelId) return false
      if (filters.positionId !== 'all' && u.position_id !== filters.positionId) return false
      if (filters.department !== 'all' && u.department !== filters.department) return false
      if (filters.createdByMe && u.created_by !== currentUser?.id) return false
      return true
    })
  }, [users, filters, currentUser?.id])

  const stats = useMemo(() => {
    const list = users || []
    return {
      total: list.length,
      active: list.filter((u) => u.status === 'active').length,
      manager: list.filter((u) => u.user_level_code === 'manager').length,
      staff: list.filter((u) => u.user_level_code === 'staff').length,
    }
  }, [users])

  const handleSubmit = async (data: UserFormData) => {
    if (editingUser) {
      await updateUser.mutateAsync({ id: editingUser.id, data })
    } else {
      await createUser.mutateAsync(data)
    }
    setFormOpen(false)
    setEditingUser(null)
  }

  const openEdit = (u: UserWithRelations) => {
    setEditingUser(u)
    setFormOpen(true)
  }

  const openAdd = () => {
    setEditingUser(null)
    setFormOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Stats row */}
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Tổng" value={stats.total} />
        <Stat label="Hoạt động" value={stats.active} color="text-green-600" />
        <Stat label="Quản lý" value={stats.manager} />
        <Stat label="Nhân viên" value={stats.staff} />
      </div>

      {/* Search + filter */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm tên, email..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            className="h-10 pl-8"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 relative shrink-0"
          onClick={() => setFilterSheetOpen(true)}
          aria-label="Bộ lọc"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </Button>
        {canAddUser && (
          <Button size="icon" className="h-10 w-10 shrink-0" onClick={openAdd} aria-label="Thêm người dùng">
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* List */}
      {filteredUsers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Không tìm thấy người dùng"
          description="Thử thay đổi bộ lọc hoặc xoá lọc để xem tất cả"
        />
      ) : (
        <div className="space-y-2">
          {filteredUsers.map((u) => (
            <MobileUserCard
              key={u.id}
              user={u}
              onEdit={openEdit}
              onManagePermissions={onManagePermissions}
            />
          ))}
        </div>
      )}

      <MobileUserFiltersSheet
        open={filterSheetOpen}
        onOpenChange={setFilterSheetOpen}
        filters={filters}
        onChange={setFilters}
        onReset={() => setFilters(DEFAULT_FILTERS)}
      />

      <UserFormDialog
        user={editingUser}
        open={formOpen}
        onOpenChange={setFormOpen}
        onSubmit={handleSubmit}
      />
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="border rounded-lg p-2 text-center">
      <div className={`text-lg font-semibold ${color || ''}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
