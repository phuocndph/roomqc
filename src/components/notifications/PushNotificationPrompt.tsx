import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { cn } from '@/lib/utils';
import { useLocation } from 'react-router-dom';

interface PushNotificationPromptProps {
  className?: string;
}

export function PushNotificationPrompt({ className }: PushNotificationPromptProps) {
  const { isSupported, isSubscribed, permission, subscribe, isLoading } = usePushNotifications();
  const location = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Check if user has dismissed the prompt in this session only
    const dismissedSession = sessionStorage.getItem('push-prompt-dismissed-session');
    if (dismissedSession) {
      setDismissed(true);
      return;
    }

    // Short delay for better UX
    const timer = setTimeout(() => {
      setShow(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, []);

  // Don't show if not supported, already subscribed, denied, or dismissed
  // Dense operational lists need unobstructed row actions. Users can still
  // enable push from Settings > Notifications.
  const denseOperationalPaths = [
    '/',
    '/bookings',
    '/staff/housekeeping',
    '/inventory',
    '/laundry',
    '/maintenance',
    '/rooms',
  ];
  const isDenseOperationalPage = denseOperationalPaths.includes(location.pathname);

  if (isDenseOperationalPage || !isSupported || isSubscribed || permission === 'denied' || dismissed || !show) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem('push-prompt-dismissed-session', 'true');
  };

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setDismissed(true);
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96',
        'bg-card border border-border rounded-lg shadow-lg p-4',
        'animate-in slide-in-from-bottom-4 duration-300',
        'z-50',
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-foreground">Bật thông báo đẩy</h4>
          <p className="text-sm text-muted-foreground mt-1">
            Nhận thông báo về tồn kho thấp, yêu cầu bảo trì và các cập nhật quan trọng.
          </p>
          
          <div className="flex items-center gap-2 mt-3">
            <Button
              size="sm"
              onClick={handleEnable}
              disabled={isLoading}
            >
              {isLoading ? 'Đang bật...' : 'Bật ngay'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={handleDismiss}
            >
              Để sau
            </Button>
          </div>
        </div>

        <Button
          size="icon"
          variant="ghost"
          className="flex-shrink-0 h-6 w-6"
          onClick={handleDismiss}
         aria-label="Đóng">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
