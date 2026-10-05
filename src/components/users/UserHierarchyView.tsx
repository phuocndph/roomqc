import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteUserDialog } from './DeleteUserDialog'
import { UserWithRelations } from '@/types/database.types'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { UserAvatar } from './UserAvatar'
import { Crown, Users, User as UserIcon, MoreVertical, Pencil, Trash2, Shield, ChevronDown, ChevronUp } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useDeleteUser } from '@/hooks/useUsers'
import { formatDistanceToNow } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'

interface UserHierarchyViewProps {
  users: UserWithRelations[]
  onEdit: (user: UserWithRelations) => void
  onManagePermissions?: (userId: string) => void
}

export function UserHierarchyView({ users, onEdit, onManagePermissions }: UserHierarchyViewProps) {
  const { t, i18n } = useTranslation(['users', 'common'])
  const [userToDelete, setUserToDelete] = useState<UserWithRelations | null>(null)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    owner: true,
    managers: true,
    staff: true
  })

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  const handleDeleteClick = (user: UserWithRelations) => {
    setUserToDelete(user)
  }

  // Group users by level
  const owner = users.find((u) => u.user_level_code === 'tenant_owner')
  const managers = users.filter((u) =>
    u.user_level_code === 'manager' || u.user_level_code === 'department_manager'
  )
  const staff = users.filter((u) => u.user_level_code === 'staff')

  // Group staff by their manager (reports_to)
  const staffByManager = staff.reduce((acc, staffMember) => {
    const managerId = staffMember.reports_to || 'unassigned'
    if (!acc[managerId]) {
      acc[managerId] = []
    }
    acc[managerId].push(staffMember)
    return acc
  }, {} as Record<string, UserWithRelations[]>)

  // Get creator name for a user
  const getCreatorName = (createdBy: string | null) => {
    if (!createdBy) return null
    const creator = users.find(u => u.id === createdBy)
    return creator?.full_name || t('common:deleted')
  }

  // Get manager name for a user
  const getManagerName = (reportsTo: string | null) => {
    if (!reportsTo) return null
    const manager = users.find(u => u.id === reportsTo)
    return manager?.full_name || t('common:deleted')
  }

  // Count subordinates for a user (staff that reports to them)
  const countSubordinates = (userId: string) => {
    return users.filter(u => u.reports_to === userId).length
  }

  const dateLocale = i18n.language === 'vi' ? vi : enUS

  const UserCard = ({ 
    user, 
    icon: Icon, 
    showCreator = false,
    showSupervisor = false 
  }: { 
    user: UserWithRelations
    icon: any
    showCreator?: boolean
    showSupervisor?: boolean
  }) => {
    const subordinatesCount = countSubordinates(user.id)
    const creatorName = getCreatorName(user.created_by)
    const supervisorName = getManagerName(user.reports_to)

    return (
      <div className="flex items-center justify-between p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors relative">
        {/* Connecting line for hierarchy */}
        {showCreator && (
          <div className="absolute left-0 top-0 w-4 h-1/2 border-l-2 border-b-2 border-dashed border-muted-foreground/30 -ml-4" />
        )}
        
        <div className="flex items-center gap-3 flex-1">
          <UserAvatar user={user} />
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium">{user.full_name}</span>
              {user.is_primary_owner && (
                <Badge variant="default" className="bg-yellow-500">{t('users:hierarchy.primaryOwner')}</Badge>
              )}
              {subordinatesCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  <Users className="h-3 w-3 mr-1" />
                  {t('users:hierarchy.subordinates', { count: subordinatesCount })}
                </Badge>
              )}
            </div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              {user.position_id && (
                <Badge variant="outline" className="text-xs">
                  {user.position?.name || t('users:hierarchy.noPosition')}
                </Badge>
              )}
              {user.hotel_id && (
                <Badge variant="outline" className="text-xs">
                  {user.hotel?.name || t('users:fields.hotel')}
                </Badge>
              )}
              {/* Show supervisor for staff members */}
              {showSupervisor && supervisorName && (
                <Badge variant="secondary" className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  <Users className="h-3 w-3 mr-1" />
                  {t('users:hierarchy.reportsTo', { name: supervisorName })}
                </Badge>
              )}
              {showSupervisor && !supervisorName && (
                <Badge variant="outline" className="text-xs text-amber-600 border-amber-400">
                  {t('users:hierarchy.noSupervisor')}
                </Badge>
              )}
              {showCreator && creatorName && (
                <span className="text-xs text-muted-foreground">
                  {t('users:hierarchy.createdBy')}: <strong>{creatorName}</strong>
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
              {user.status === 'active' ? t('users:status.active') : t('users:status.inactive')}
            </Badge>
            {user.created_at && (
              <span className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(user.created_at), { addSuffix: true, locale: dateLocale })}
              </span>
            )}
          </div>
        </div>
        
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Thêm tùy chọn">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(user)}>
              <Pencil className="h-4 w-4 mr-2" />
              {t('common:edit')}
            </DropdownMenuItem>
            {onManagePermissions && (
              <DropdownMenuItem onClick={() => onManagePermissions(user.id)}>
                <Shield className="h-4 w-4 mr-2" />
                {t('users:permissions.title')}
              </DropdownMenuItem>
            )}
            {!user.is_primary_owner && (
              <DropdownMenuItem
                onClick={() => handleDeleteClick(user)}
                className="text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                {t('common:delete')}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Owner Section */}
      {owner && (
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => toggleSection('owner')}
          >
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-yellow-500" />
                <span>{t('users:userLevel.tenantOwner')}</span>
                <Badge variant="outline">1</Badge>
              </div>
              {expandedSections.owner ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </CardTitle>
          </CardHeader>
          {expandedSections.owner && (
            <CardContent className="space-y-2">
              <Alert>
                <AlertDescription className="text-sm">
                  {t('users:hierarchy.ownerDescription')}
                </AlertDescription>
              </Alert>
              <UserCard user={owner} icon={Crown} />
            </CardContent>
          )}
        </Card>
      )}

      {/* Managers Section - with their staff */}
      {managers.length > 0 && (
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => toggleSection('managers')}
          >
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-green-500" />
                <span>Quản lý &amp; quản lý bộ phận</span>
                <Badge variant="outline">{managers.length}</Badge>
              </div>
              {expandedSections.managers ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </CardTitle>
          </CardHeader>
          {expandedSections.managers && (
            <CardContent className="space-y-4">
              <Alert>
                <AlertDescription className="text-sm">
                  {t('users:hierarchy.managerDescription')}
                </AlertDescription>
              </Alert>
              <div className="space-y-4">
                {managers.map((manager) => {
                  const managerStaff = staffByManager[manager.id] || []
                  return (
                    <div key={manager.id} className="space-y-2">
                      <div className="relative ml-4">
                        <UserCard user={manager} icon={Users} showCreator />
                      </div>
                      {/* Staff under this manager */}
                      {managerStaff.length > 0 && (
                        <div className="ml-12 space-y-2 border-l-2 border-dashed border-muted-foreground/30 pl-4">
                          {managerStaff.map((staffMember) => (
                            <div key={staffMember.id} className="relative">
                              <UserCard user={staffMember} icon={UserIcon} showSupervisor />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Unassigned Staff Section */}
      {staffByManager['unassigned']?.length > 0 && (
        <Card>
          <CardHeader 
            className="cursor-pointer hover:bg-accent/50 transition-colors"
            onClick={() => toggleSection('staff')}
          >
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserIcon className="h-5 w-5 text-gray-500" />
                <span>{t('users:userLevel.staff')} ({t('users:hierarchy.unassigned')})</span>
                <Badge variant="outline">{staffByManager['unassigned']?.length || 0}</Badge>
              </div>
              {expandedSections.staff ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </CardTitle>
          </CardHeader>
          {expandedSections.staff && (
            <CardContent className="space-y-2">
              <Alert>
                <AlertDescription className="text-sm">
                  {t('users:hierarchy.unassignedDescription')}
                </AlertDescription>
              </Alert>
              <div className="space-y-2 relative">
                {staffByManager['unassigned']?.map((staffMember) => (
                  <div key={staffMember.id} className="relative ml-4">
                    <UserCard user={staffMember} icon={UserIcon} showCreator showSupervisor />
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      )}

      <DeleteUserDialog
        user={userToDelete}
        open={!!userToDelete}
        onOpenChange={(open) => !open && setUserToDelete(null)}
      />
    </div>
  )
}
