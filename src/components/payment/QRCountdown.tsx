import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface QRCountdownProps {
  /** Reset trigger — change this value (e.g. open boolean, or a refresh counter) to restart the timer */
  resetKey: unknown;
  /** Seconds of validity. Default 15 minutes. */
  seconds?: number;
  /** Called when user clicks "Tạo lại" after expiry */
  onRefresh?: () => void;
  className?: string;
}

/**
 * Countdown timer hiển thị thời hạn hiệu lực của QR thanh toán.
 * Khi hết hạn sẽ hiển thị cảnh báo + nút "Tạo lại".
 */
export function QRCountdown({ resetKey, seconds = 15 * 60, onRefresh, className }: QRCountdownProps) {
  const [secondsLeft, setSecondsLeft] = useState(seconds);

  useEffect(() => {
    setSecondsLeft(seconds);
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetKey, seconds]);

  const isExpired = secondsLeft <= 0;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  if (isExpired) {
    return (
      <div className={cn('flex items-center justify-center gap-1 text-sm text-destructive font-medium', className)}>
        <AlertCircle className="h-4 w-4" />
        <span>QR đã hết hạn</span>
        {onRefresh && (
          <Button
            type="button"
            variant="link"
            className="p-0 h-auto text-destructive underline"
            onClick={onRefresh}
          >
            Tạo lại
          </Button>
        )}
      </div>
    );
  }

  return (
    <p className={cn('text-sm text-muted-foreground text-center', className)}>
      Hiệu lực:{' '}
      <span
        className={cn(
          'font-mono font-medium',
          secondsLeft < 120 ? 'text-orange-500' : 'text-foreground',
        )}
      >
        {mins}:{String(secs).padStart(2, '0')}
      </span>
    </p>
  );
}

/** Helper hook — trả về isExpired để parent có thể blur QR image */
export function useQRExpiry(resetKey: unknown, seconds = 15 * 60) {
  const [secondsLeft, setSecondsLeft] = useState(seconds);
  useEffect(() => {
    setSecondsLeft(seconds);
    const timer = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resetKey, seconds]);
  return { secondsLeft, isExpired: secondsLeft <= 0 };
}
