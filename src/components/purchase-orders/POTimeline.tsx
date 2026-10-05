import React from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle,
  XCircle,
  Send,
  Edit,
  Package,
  FileText,
  Clock
} from 'lucide-react';
import { format } from 'date-fns';

interface POTimelineProps {
  poId: string;
}

interface Activity {
  id: string;
  type: string;
  title: string;
  description: string;
  user: string;
  created_at: string;
  status?: string;
  notes?: string;
}

const formatRelativeTime = (date: string) => {
  const now = new Date();
  const then = new Date(date);
  const diff = now.getTime() - then.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} ngày trước`;
  if (hours > 0) return `${hours} giờ trước`;
  if (minutes > 0) return `${minutes} phút trước`;
  return 'Vừa xong';
};

const POTimeline: React.FC<POTimelineProps> = ({ poId }) => {
  // Mock data - would fetch from API
  const activities: Activity[] = [
    {
      id: '1',
      type: 'created',
      title: 'Đơn hàng được tạo',
      description: 'Đơn hàng PO-20250110-0001 đã được tạo',
      user: 'Nguyễn Văn A',
      created_at: new Date().toISOString(),
      status: 'draft'
    }
  ];

  const getActivityIcon = (type: string) => {
    const icons: Record<string, any> = {
      created: Edit,
      submitted: Send,
      approved: CheckCircle,
      rejected: XCircle,
      ordered: FileText,
      partial_received: Package,
      received: CheckCircle,
      cancelled: XCircle
    };
    const Icon = icons[type] || Clock;
    return <Icon className="w-4 h-4" />;
  };

  const getActivityColor = (type: string) => {
    const colors: Record<string, string> = {
      created: 'text-blue-600',
      submitted: 'text-yellow-600',
      approved: 'text-green-600',
      rejected: 'text-red-600',
      ordered: 'text-purple-600',
      partial_received: 'text-orange-600',
      received: 'text-green-600',
      cancelled: 'text-red-600'
    };
    return colors[type] || 'text-gray-600';
  };

  return (
    <div className="space-y-4">
      {activities.map((activity, index) => (
        <div key={activity.id} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className={`
              w-8 h-8 rounded-full flex items-center justify-center
              ${getActivityColor(activity.type)} bg-current/10
            `}>
              {getActivityIcon(activity.type)}
            </div>
            {index < activities.length - 1 && (
              <div className="w-0.5 h-full bg-border mt-2" />
            )}
          </div>

          <div className="flex-1 pb-8">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{activity.title}</span>
                  {activity.status && (
                    <Badge variant="outline" className="text-xs">
                      {activity.status}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {activity.description}
                </p>
                {activity.notes && (
                  <p className="text-sm text-muted-foreground mt-2 p-2 bg-muted rounded">
                    {activity.notes}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 ml-4">
                <Avatar className="w-6 h-6">
                  <AvatarFallback className="text-xs">
                    {activity.user.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="text-right">
                  <div className="text-xs font-medium">{activity.user}</div>
                  <div className="text-xs text-muted-foreground">
                    {formatRelativeTime(activity.created_at)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default POTimeline;
