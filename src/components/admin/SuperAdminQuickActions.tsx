import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Plus, 
  RefreshCw, 
  Send, 
  TrendingUp, 
  DollarSign,
  Users
} from 'lucide-react';
import { useScheduleReminders } from '@/hooks/super-admin/useRenewalReminders';
import { useNavigate } from 'react-router-dom';

export function SuperAdminQuickActions() {
  const navigate = useNavigate();
  const scheduleReminders = useScheduleReminders();

  const actions = [
    {
      title: 'Tạo mã khuyến mãi',
      description: 'Tạo mã giảm giá mới',
      icon: Plus,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      onClick: () => navigate('/super-admin/promo-codes'),
    },
    {
      title: 'Khởi chạy chiến dịch',
      description: 'Tạo chiến dịch marketing',
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      onClick: () => navigate('/super-admin/campaigns'),
    },
    {
      title: 'Lên lịch nhắc nhở',
      description: 'Tự động tạo nhắc nhở',
      icon: RefreshCw,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      onClick: () => scheduleReminders.mutate(),
      loading: scheduleReminders.isPending,
    },
    {
      title: 'Gửi thông báo',
      description: 'Gửi email hàng loạt',
      icon: Send,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      onClick: () => navigate('/super-admin/reminders'),
    },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Thao tác nhanh</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {actions.map((action, index) => {
            const Icon = action.icon;
            return (
              <Button
                key={index}
                variant="outline"
                className="h-auto flex-col items-start p-4 space-y-2"
                onClick={action.onClick}
                disabled={action.loading}
              >
                <div className={`p-2 rounded-md ${action.bgColor}`}>
                  <Icon className={`h-5 w-5 ${action.color}`} />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-sm">{action.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {action.description}
                  </p>
                </div>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
