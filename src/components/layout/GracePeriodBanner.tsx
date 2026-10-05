import { AlertTriangle, Clock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { useGracePeriod } from '@/hooks/useGracePeriod';
import { useState } from 'react';

const DISMISS_KEY = 'expiring-soon-banner-dismissed';

export function GracePeriodBanner({ onDismiss }: { onDismiss?: () => void } = {}) {
  const navigate = useNavigate();
  const {
    isInGracePeriod,
    isGracePeriodExpired,
    isExpiringSoon,
    daysUntilExpiry,
    graceDaysRemaining,
    isLoading
  } = useGracePeriod();
  const [dismissed, setDismissed] = useState(false);
  const [expiringSoonDismissed, setExpiringSoonDismissed] = useState(
    () => sessionStorage.getItem(DISMISS_KEY) === 'true'
  );

  if (isLoading) return null;

  // Priority 1: Suspended (grace period expired)
  if (isGracePeriodExpired) {
    return (
      <div className="bg-destructive text-destructive-foreground px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm font-medium">
            Tài khoản đã bị tạm ngưng! Vui lòng gia hạn gói để tiếp tục sử dụng dịch vụ.
          </span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => navigate('/settings/subscription')}
          className="shrink-0">
          
          Gia hạn ngay
        </Button>
      </div>);

  }

  // Priority 2: Grace period (expired but within 7-day grace)
  if (isInGracePeriod && !dismissed) {
    return (
      <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="text-sm">
            Gói đăng ký đã hết hạn! Còn <strong>{graceDaysRemaining} ngày</strong> để gia hạn.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate('/settings/subscription')}
            className="shrink-0">
            
            Gia hạn ngay
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => setDismissed(true)}
            className="h-7 w-7 p-0 text-white hover:bg-white/20">
            
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>);

  }

  // Priority 3: Expiring soon (≤7 days before expiry)
  if (isExpiringSoon && !expiringSoonDismissed) {
    return (
      <div className="bg-primary/10 border-b border-primary/20 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-primary" />
          <span className="text-sm text-foreground">
            Gói đăng ký sẽ hết hạn sau <strong className="text-[#fa002a]">{daysUntilExpiry} ngày</strong>. Gia hạn ngay để không bị gián đoạn dịch vụ.
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => navigate('/settings/subscription')}
            className="shrink-0 bg-[#e60000]">
            
            Gia hạn ngay
          </Button>
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={() => {
              setExpiringSoonDismissed(true);
              sessionStorage.setItem(DISMISS_KEY, 'true');
              onDismiss?.();
            }}
            className="h-7 w-7 p-0 text-muted-foreground hover:bg-muted">
            
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>);

  }

  return null;
}