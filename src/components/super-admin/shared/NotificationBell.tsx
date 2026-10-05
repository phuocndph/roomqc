import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface NotificationItem {
  id: string;
  type: 'approval' | 'expiring' | 'payment';
  message: string;
  count: number;
}

export function NotificationBell() {
  const { t } = useTranslation('superAdmin');
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ['super-admin-notifications'],
    queryFn: async () => {
      const items: NotificationItem[] = [];

      // Pending approvals
      const { count: pendingCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .eq('approval_status', 'pending');

      if (pendingCount && pendingCount > 0) {
        items.push({
          id: 'pending-approvals',
          type: 'approval',
          message: `${pendingCount} doanh nghiệp chờ phê duyệt`,
          count: pendingCount,
        });
      }

      // Expiring in 7 days
      const sevenDaysFromNow = new Date();
      sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
      const { count: expiringCount } = await supabase
        .from('tenants')
        .select('*', { count: 'exact', head: true })
        .lte('subscription_end_date', sevenDaysFromNow.toISOString())
        .gte('subscription_end_date', new Date().toISOString());

      if (expiringCount && expiringCount > 0) {
        items.push({
          id: 'expiring-tenants',
          type: 'expiring',
          message: `${expiringCount} khách hàng sắp hết hạn`,
          count: expiringCount,
        });
      }

      return items;
    },
    refetchInterval: 60000,
  });

  const totalCount = notifications.reduce((sum, n) => sum + n.count, 0);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'approval': return 'text-amber-600';
      case 'expiring': return 'text-red-600';
      case 'payment': return 'text-green-600';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8">
          <Bell className="h-4 w-4" />
          {totalCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground text-[10px] font-medium flex items-center justify-center">
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end">
        <div className="px-3 py-2 border-b">
          <h4 className="text-sm font-medium">Thông báo</h4>
        </div>
        <div className="p-2">
          {notifications.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              Không có thông báo mới
            </p>
          ) : (
            <div className="space-y-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center gap-2 p-2 rounded-md hover:bg-accent/50 transition-colors cursor-pointer"
                >
                  <div className={`h-2 w-2 rounded-full ${n.type === 'approval' ? 'bg-amber-500' : n.type === 'expiring' ? 'bg-destructive' : 'bg-green-500'}`} />
                  <span className="text-sm">{n.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
