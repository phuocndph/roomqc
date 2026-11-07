import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  LayoutDashboard,
  Users,
  Tag,
  Mail,
  Bell,
  DollarSign,
  BarChart3,
  Settings,
  LogOut,
  Menu,
  Shield,
  ClipboardCheck,
  BookOpen,
  Megaphone,
  Server,
  UserPlus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { useSuperAdminAuth } from '@/hooks/useSuperAdminAuth';
import { NotificationBell } from './shared/NotificationBell';
import { ThemeToggle } from './shared/ThemeToggle';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useBreakpoint } from '@/lib/breakpoints';

export function SuperAdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { user, isLoading, isSuperAdmin, signOut } = useSuperAdminAuth();
  const main = useRef<HTMLElement>(null);
  const { t } = useTranslation('superAdmin');
  const { isMobile } = useBreakpoint();
  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);
  useLayoutEffect(() => {
    if (main.current) main.current.scrollTop = 0;
  }, [location.pathname]);

  const navigation = [
    { name: t('navigation.overview'), href: '/super-admin', icon: LayoutDashboard },
    { name: 'Hạ tầng', href: '/super-admin/infrastructure', icon: Server },
    { name: 'Đăng ký mới', href: '/super-admin/registrations', icon: UserPlus },
    { name: t('navigation.tenants'), href: '/super-admin/tenants', icon: Users },
    { name: t('navigation.approval'), href: '/super-admin/approval', icon: ClipboardCheck },
    { name: t('navigation.promoCodes'), href: '/super-admin/promo-codes', icon: Tag },
    { name: t('navigation.campaigns'), href: '/super-admin/campaigns', icon: Mail },
    { name: t('navigation.reminders'), href: '/super-admin/reminders', icon: Bell },
    { name: 'Thông báo & Banner', href: '/super-admin/announcements', icon: Megaphone },
    { name: t('navigation.pricing'), href: '/super-admin/pricing', icon: DollarSign },
    { name: t('navigation.analytics'), href: '/super-admin/analytics', icon: BarChart3 },
    { name: t('navigation.settings'), href: '/super-admin/settings', icon: Settings },
    { name: 'Tài liệu kỹ thuật', href: '/docs', icon: BookOpen },
  ];

  const navigationTitles: Record<string, string> = {
    '/super-admin': t('titles.overview'),
    '/super-admin/infrastructure': 'Hạ tầng',
    '/super-admin/registrations': 'Đăng ký mới',
    '/super-admin/tenants': t('titles.tenantManagement'),
    '/super-admin/approval': t('titles.approval'),
    '/super-admin/promo-codes': t('titles.promoCodes'),
    '/super-admin/campaigns': t('titles.campaigns'),
    '/super-admin/reminders': t('titles.reminders'),
    '/super-admin/pricing': t('titles.pricing'),
    '/super-admin/analytics': t('titles.analytics'),
    '/super-admin/settings': t('titles.settings'),
    '/super-admin/announcements': 'Thông báo & Banner',
  };

  const sidebarContent = (
        <div className="flex h-full flex-col">
          {/* Logo */}
          <div className="flex h-14 items-center justify-between px-3 border-b">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-primary">
                <Shield className="h-4 w-4 text-primary-foreground" />
              </div>
              <h1 className="text-lg font-semibold text-foreground">{t('layout.title')}</h1>
            </div>
          </div>

          {/* Navigation */}
          <ScrollArea className="flex-1 px-2 py-3">
            <nav aria-label="Điều hướng quản trị RoomQC" className="space-y-0.5">
              {navigation.map((item) => {
                const isActive = item.href === '/super-admin' 
                  ? location.pathname === '/super-admin'
                  : location.pathname === item.href || location.pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.name}
                    to={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    )}
                    onClick={() => setSidebarOpen(false)}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          </ScrollArea>

          {/* User info */}
          <div className="border-t p-3">
            <div className="flex items-center gap-2.5 mb-2">
              <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground text-xs font-semibold">
                SA
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {user?.email}
                </p>
                <p className="text-xs text-muted-foreground">{t('layout.superAdmin')}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start h-8 text-muted-foreground"
              onClick={signOut}
            >
              <LogOut className="h-3.5 w-3.5 mr-2" />
              {t('layout.logout')}
            </Button>
          </div>
        </div>
  );

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t('layout.loading')}</p>
        </div>
      </div>
    );
  }

  // Do not mount child routes or dispatch their effects before the redirect.
  if (!user || !isSuperAdmin) return <p role="status" className="p-6">Đang kiểm tra quyền truy cập…</p>;

  return (
    <Sheet open={isMobile && sidebarOpen} onOpenChange={setSidebarOpen}>
    <div className="flex h-screen overflow-hidden bg-background">
      {!isMobile && <aside className="w-60 shrink-0 bg-card border-r">{sidebarContent}</aside>}
      {isMobile && (
        <SheetContent side="left" className="w-60 p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Menu quản trị RoomQC</SheetTitle>
          {sidebarContent}
        </SheetContent>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-14 border-b bg-card px-4 flex items-center justify-between lg:px-6">
          {isMobile && <SheetTrigger asChild><Button
            variant="ghost"
            size="icon"
            aria-label="Mở menu quản trị"
            className="h-10 w-10 shrink-0"
          >
            <Menu className="h-5 w-5" />
          </Button></SheetTrigger>}
          
          <div className="flex-1 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              {navigationTitles[location.pathname] || t('titles.overview')}
            </h2>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <ThemeToggle />

            </div>
          </div>
        </header>

        {/* Page content */}
        <main ref={main} className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
    </Sheet>
  );
}
