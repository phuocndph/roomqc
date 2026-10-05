import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { 
  UserPlus, 
  CreditCard, 
  AlertCircle, 
  Settings,
  Tag,
} from 'lucide-react';

export function RecentActivityFeed() {
  const { t } = useTranslation('superAdmin');
  const { data: activities, isLoading } = useQuery({
    queryKey: ['super-admin-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('super_admin_activity_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'tenant_created':
        return <UserPlus className="h-4 w-4" />;
      case 'subscription_changed':
        return <CreditCard className="h-4 w-4" />;
      case 'tenant_suspended':
        return <AlertCircle className="h-4 w-4" />;
      case 'promo_code_created':
        return <Tag className="h-4 w-4" />;
      default:
        return <Settings className="h-4 w-4" />;
    }
  };

  const getActivityColor = (action: string) => {
    switch (action) {
      case 'tenant_created':
        return 'text-green-600';
      case 'subscription_changed':
        return 'text-blue-600';
      case 'tenant_suspended':
        return 'text-red-600';
      case 'promo_code_created':
        return 'text-purple-600';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className="border rounded-lg">
      <div className="px-3 py-2.5 border-b">
        <h3 className="text-sm font-medium">{t('activity.title')}</h3>
      </div>
      <ScrollArea className="h-[600px]">
        <div className="p-3">
          {isLoading ? (
            <p className="text-center text-muted-foreground text-sm">{t('activity.loading')}</p>
          ) : activities && activities.length > 0 ? (
            <div className="space-y-1">
              {activities.map((activity: any) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-3 p-2.5 rounded-md hover:bg-accent/50 transition-colors"
                >
                  <div className={getActivityColor(activity.action)}>
                    {getActivityIcon(activity.action)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm">
                      {activity.description}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(activity.created_at).toLocaleString()}
                    </p>
                    {activity.metadata && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {Object.entries(activity.metadata).map(([key, value]: any) => (
                          <Badge key={key} variant="outline" className="text-xs">
                            {key}: {value}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-center text-muted-foreground text-sm">{t('activity.noActivity')}</p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
