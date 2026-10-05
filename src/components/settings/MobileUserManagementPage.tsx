import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { navigateBack } from '@/lib/navigation'
import { PullToRefresh } from '@/components/mobile/TouchOptimized'
import { MobileUserListTab } from './mobile/MobileUserListTab'
import { MobileRolesOverviewTab } from '@/components/users/mobile/MobileRolesOverviewTab'
import { MobilePermissionConfigurationTab } from '@/components/users/mobile/MobilePermissionConfigurationTab'
import { useUser } from '@/hooks/useUser'

export const MobileUserManagementPage = ({ editUserId }: { editUserId?: string | null }) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user: currentUser } = useUser()
  const [activeTab, setActiveTab] = useState('users')
  const [preSelectedUserId, setPreSelectedUserId] = useState<string | null>(null)

  const canManagePermissions =
    currentUser?.user_level_code === 'tenant_owner' ||
    currentUser?.user_level_code === 'manager'

  const handleManagePermissions = (userId: string) => {
    setPreSelectedUserId(userId)
    setActiveTab('permissions')
  }

  const handleRefresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['users'] }),
      queryClient.invalidateQueries({ queryKey: ['roles'] }),
      queryClient.invalidateQueries({ queryKey: ['permissions'] }),
    ])
    toast.success('Đã cập nhật')
  }

  return (
    <div className="min-h-screen bg-background pb-20 flex flex-col">
      <MobileDetailHeader
        title="Người dùng & Phân quyền"
        onBack={() => navigateBack(navigate, '/settings')}
      />

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <div className="sticky top-0 z-10 bg-background border-b">
          <TabsList className="h-10 w-full justify-start gap-0 bg-transparent p-0 rounded-none">
            <TabsTrigger
              value="users"
              className="flex-1 h-10 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Người dùng
            </TabsTrigger>
            <TabsTrigger
              value="roles"
              className="flex-1 h-10 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
            >
              Vai trò
            </TabsTrigger>
            {canManagePermissions && (
              <TabsTrigger
                value="permissions"
                className="flex-1 h-10 text-xs rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none"
              >
                Cấu hình Quyền
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="users" className="m-0 flex-1">
          <PullToRefresh onRefresh={handleRefresh}>
            <div className="p-3">
              <MobileUserListTab onManagePermissions={handleManagePermissions} editUserId={editUserId} />
            </div>
          </PullToRefresh>
        </TabsContent>

        <TabsContent value="roles" className="m-0 flex-1">
          <div className="p-3">
            <MobileRolesOverviewTab />
          </div>
        </TabsContent>

        {canManagePermissions && (
          <TabsContent value="permissions" className="m-0 flex-1">
            <div className="p-3">
              <MobilePermissionConfigurationTab preSelectedUserId={preSelectedUserId} />
            </div>
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
