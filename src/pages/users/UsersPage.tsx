import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserManagementTab } from '@/components/users/UserManagementTab'
import { RolesOverviewTab } from '@/components/users/RolesOverviewTab'
import { PermissionConfigurationTab } from '@/components/users/PermissionConfigurationTab'
import { Users, Shield, Key } from 'lucide-react'
import { MobileUserManagementPage } from '@/components/settings/MobileUserManagementPage'
import { useBreakpoint } from '@/lib/breakpoints'

export default function UsersPage() {
  const { t } = useTranslation('users')
  const { isMobile } = useBreakpoint()
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState('users')
  const [preSelectedUserId, setPreSelectedUserId] = useState<string | null>(null)
  const editUserId = searchParams.get('edit')

  const handleManagePermissions = (userId: string) => {
    setPreSelectedUserId(userId)
    setActiveTab('permissions')
  }

  if (isMobile) {
    return <MobileUserManagementPage editUserId={editUserId} />
  }

  return (
    <div className="h-full flex flex-col">
      {/* Compact Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background">
        <div>
          <h1 className="text-base font-semibold">{t('title')}</h1>
          <p className="text-[11px] text-muted-foreground">
            {t('description', 'Quản lý người dùng, vai trò và quyền truy cập')}
          </p>
        </div>
      </div>

      {/* Main Content with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-4 py-2 border-b bg-muted/30">
          <TabsList className="h-8 bg-transparent p-0 gap-1">
            <TabsTrigger 
              value="users" 
              className="h-7 text-xs gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              <Users className="h-3.5 w-3.5" />
              {t('tabs.users', 'Người dùng')}
            </TabsTrigger>
            <TabsTrigger 
              value="roles" 
              className="h-7 text-xs gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              <Shield className="h-3.5 w-3.5" />
              {t('tabs.roles', 'Vai trò')}
            </TabsTrigger>
            <TabsTrigger 
              value="permissions" 
              className="h-7 text-xs gap-1.5 px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm rounded-md"
            >
              <Key className="h-3.5 w-3.5" />
              {t('tabs.permissions', 'Cấu hình Quyền')}
            </TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="users" className="m-0 p-4 h-full">
            <UserManagementTab onManagePermissions={handleManagePermissions} editUserId={editUserId} />
          </TabsContent>

          <TabsContent value="roles" className="m-0 p-4 h-full">
            <RolesOverviewTab />
          </TabsContent>

          <TabsContent value="permissions" className="m-0 h-full">
            <PermissionConfigurationTab preSelectedUserId={preSelectedUserId} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
