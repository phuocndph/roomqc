import { useNavigate } from 'react-router-dom'
import { useUser } from '@/hooks/useUser'
import { useAuth } from '@/contexts/AuthContext'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ChevronRight, User, Building2, Users, Bell, LogOut, MessageCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface SettingsItem {
  id: string
  title: string
  description: string
  icon: typeof User
  route: string
  badge?: string
  requireAdmin?: boolean
}

export const MobileSettingsPage = () => {
  const navigate = useNavigate()
  const { user } = useUser()
  const { signOut } = useAuth()
  const { t } = useTranslation(['settings', 'common', 'auth'])

  const isAdmin = user?.user_level_code === 'owner' || user?.user_level_code === 'manager'

  const SETTINGS_SECTIONS = [
    {
      title: t('profile.title'),
      items: [
        {
          id: 'profile',
          title: t('profile.title'),
          description: t('profile.changePassword'),
          icon: User,
          route: '/settings/profile',
        },
      ] as SettingsItem[],
    },
    {
      title: t('users.title'),
      items: [
        {
          id: 'hotels',
          title: t('hotels.title'),
          description: t('hotels.title'),
          icon: Building2,
          route: '/settings/hotels',
          requireAdmin: true,
        },
        {
          id: 'users',
          title: t('users.title'),
          description: t('users.title'),
          icon: Users,
          route: '/settings/users',
          requireAdmin: true,
        },
      ] as SettingsItem[],
    },
    {
      title: t('system.title'),
      items: [
        {
          id: 'notifications',
          title: t('notifications.title'),
          description: t('notifications.description'),
          icon: Bell,
          route: '/settings/notifications',
        },
        {
          id: 'telegram',
          title: 'Telegram',
          description: 'Nhận thông báo qua Telegram',
          icon: MessageCircle,
          route: '/settings/telegram',
        },
      ] as SettingsItem[],
    },
  ]

  const handleLogout = async () => {
    await signOut()
    navigate('/auth/login')
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title={t('title')}
        showBack={false}
      />

      <div className="p-4 space-y-6">
        {/* User Info Card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user?.full_name}</p>
                <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
              </div>
              <Badge variant="secondary">{user?.user_level_code}</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Settings Sections */}
        {SETTINGS_SECTIONS.map((section) => {
          const visibleItems = section.items.filter(item => 
            !item.requireAdmin || isAdmin
          )

          if (visibleItems.length === 0) return null

          return (
            <div key={section.title} className="space-y-3">
              <h3 className="text-sm font-medium text-muted-foreground px-1">
                {section.title}
              </h3>
              
              <Card>
                <CardContent className="p-0">
                  {visibleItems.map((item, index) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.id}
                        onClick={() => navigate(item.route)}
                        className={`w-full flex items-center gap-3 p-4 text-left hover:bg-accent transition-colors ${
                          index !== visibleItems.length - 1 ? 'border-b' : ''
                        }`}
                      >
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{item.title}</p>
                            {item.badge && (
                              <Badge variant="secondary" className="text-xs">
                                {item.badge}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground truncate">
                            {item.description}
                          </p>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                      </button>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          )
        })}

        {/* Logout Button */}
        <Card>
          <CardContent className="p-0">
            <button aria-label="Đăng xuất"
              onClick={handleLogout}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-accent transition-colors text-destructive"
            >
              <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                <LogOut className="h-5 w-5" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-sm">{t('auth:logout')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('auth:logout')}
                </p>
              </div>
            </button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}