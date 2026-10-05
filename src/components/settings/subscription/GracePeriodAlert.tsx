import { AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useGracePeriod } from '@/hooks/useGracePeriod';

interface GracePeriodAlertProps {
  onExtendClick?: () => void;
}

export function GracePeriodAlert({ onExtendClick }: GracePeriodAlertProps) {
  const { isInGracePeriod, isGracePeriodExpired, graceDaysRemaining, graceEndDate } = useGracePeriod();

  if (isGracePeriodExpired) {
    return (
      <Alert variant="destructive" className="border-destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Tài khoản đã bị tạm ngưng!</AlertTitle>
        <AlertDescription className="mt-2">
          <p>
            Thời gian gia hạn đã hết. Tài khoản của bạn đã bị tạm ngưng và một số tính năng 
            sẽ không khả dụng cho đến khi bạn gia hạn gói đăng ký.
          </p>
          {onExtendClick && (
            <Button 
              variant="destructive" 
              size="sm" 
              className="mt-3"
              onClick={onExtendClick}
            >
              Gia hạn ngay để khôi phục
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (isInGracePeriod) {
    return (
      <Alert variant="default" className="border-amber-500 bg-amber-500/10">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertTitle className="text-amber-700">Gói đăng ký đã hết hạn!</AlertTitle>
        <AlertDescription className="text-amber-700 mt-2">
          <p>
            Bạn còn <strong>{graceDaysRemaining} ngày</strong> để gia hạn trước khi tài khoản bị tạm ngưng.
            {graceEndDate && (
              <> Hạn cuối: <strong>{graceEndDate.toLocaleDateString('vi-VN')}</strong>.</>
            )}
          </p>
          {onExtendClick && (
            <Button 
              variant="default" 
              size="sm" 
              className="mt-3 bg-amber-600 hover:bg-amber-700"
              onClick={onExtendClick}
            >
              Gia hạn ngay
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
