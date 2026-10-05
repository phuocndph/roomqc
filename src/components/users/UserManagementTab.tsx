import { useEffect, useState } from 'react'
import { useUsers, useCreateUser, useUpdateUser } from '@/hooks/useUsers'
import { useUser } from '@/hooks/useUser'
import { UserHierarchyView } from './UserHierarchyView'
import { UserTable } from './UserTable'
import { UserFormDialog } from './UserFormDialog'
import { UserStatsCards } from './UserStatsCards'
import { UserFilters } from './UserFilters'
import { EmptyState } from '@/components/shared/EmptyState'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserWithRelations } from '@/types/database.types'
import { UserFormData } from '@/lib/validations/user.schemas'
import { Users, Plus, LayoutList, Network } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface UserManagementTabProps {
  onManagePermissions?: (userId: string) => void
  editUserId?: string | null
}

export function UserManagementTab({ onManagePermissions, editUserId }: UserManagementTabProps) {
  const { users, isLoading } = useUsers()
  const { user: currentUser } = useUser()
  const createUser = useCreateUser()
  const updateUser = useUpdateUser()

  const [filters, setFilters] = useState({
    search: '',
    userLevel: 'all',
    status: 'all',
    hotelId: 'all',
    positionId: 'all',
    department: 'all',
    createdByMe: false,
  })
  const [viewMode, setViewMode] = useState<'hierarchy' | 'table'>('hierarchy')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserWithRelations | null>(null)
  const [handledEditUserId, setHandledEditUserId] = useState<string | null>(null)

  useEffect(() => {
    if (!editUserId || !users || handledEditUserId === editUserId) return
    const userToEdit = users.find((user) => user.id === editUserId)
    if (userToEdit) {
      setEditingUser(userToEdit)
      setIsDialogOpen(true)
      setHandledEditUserId(editUserId)
    }
  }, [editUserId, handledEditUserId, users])

  const canAddUser = currentUser?.user_level_code === 'tenant_owner' || 
                     currentUser?.user_level_code === 'manager' ||
                     currentUser?.user_level_code === 'department_manager'

  const handleOpenDialog = (user?: UserWithRelations) => {
    if (user) {
      setEditingUser(user)
    } else {
      setEditingUser(null)
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async (data: UserFormData) => {
    if (editingUser) {
      await updateUser.mutateAsync({ id: editingUser.id, data })
    } else {
      await createUser.mutateAsync(data)
    }
    setIsDialogOpen(false)
    setEditingUser(null)
  }

  const filteredUsers = users?.filter((user) => {
    const matchesSearch = filters.search === '' || 
      user.full_name.toLowerCase().includes(filters.search.toLowerCase()) ||
      user.email.toLowerCase().includes(filters.search.toLowerCase())
    
    const matchesUserLevel = filters.userLevel === 'all' || user.user_level_code === filters.userLevel
    const matchesHotel = filters.hotelId === 'all' || user.hotel_id === filters.hotelId
    const matchesPosition = filters.positionId === 'all' || user.position_id === filters.positionId
    const matchesStatus = filters.status === 'all' || user.status === filters.status
    const matchesDepartment = filters.department === 'all' || user.department === filters.department
    const matchesCreatedByMe = !filters.createdByMe || user.created_by === currentUser?.id

    return matchesSearch && matchesUserLevel && matchesHotel && matchesPosition && matchesStatus && matchesDepartment && matchesCreatedByMe
  }) || []

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <LoadingSpinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <UserStatsCards users={users || []} />
      
      {/* Filters and Actions */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-3">
        <div className="flex-1">
          <UserFilters 
            filters={filters} 
            onFiltersChange={setFilters}
          />
        </div>
        
        {canAddUser && (
          <Button onClick={() => handleOpenDialog()} size="sm" className="h-8 text-xs shrink-0">
            <Plus className="h-3 w-3 mr-1.5" />
            Thêm người dùng
          </Button>
        )}
      </div>

      {/* View Mode Tabs */}
      <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'hierarchy' | 'table')}>
        <TabsList className="h-8">
          <TabsTrigger value="hierarchy" className="h-7 text-xs gap-1.5 px-3">
            <Network className="h-3 w-3" />
            Phân cấp
          </TabsTrigger>
          <TabsTrigger value="table" className="h-7 text-xs gap-1.5 px-3">
            <LayoutList className="h-3 w-3" />
            Bảng
          </TabsTrigger>
        </TabsList>

        <TabsContent value="hierarchy" className="mt-3">
          <UserHierarchyView
            users={filteredUsers}
            onEdit={handleOpenDialog}
            onManagePermissions={onManagePermissions}
          />
        </TabsContent>

        <TabsContent value="table" className="mt-3">
          <UserTable
            users={filteredUsers}
            onEdit={handleOpenDialog}
            onManagePermissions={onManagePermissions}
          />
        </TabsContent>
      </Tabs>

      {filteredUsers.length === 0 && (
        <EmptyState
          icon={Users}
          title="Không tìm thấy người dùng"
          description="Không có người dùng nào phù hợp với bộ lọc của bạn"
        />
      )}

      <UserFormDialog
        user={editingUser}
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        onSubmit={handleSubmit}
      />
    </div>
  )
}
