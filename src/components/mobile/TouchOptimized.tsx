import React from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/haptics';
import {
  SWIPE_THRESHOLD_PX,
  SWIPE_VELOCITY_MIN,
  SWIPE_ANGLE_RATIO,
} from '@/lib/touch-constants';

// Minimum touch target size: 48x48px (WCAG 2.1 AA)
export const TOUCH_TARGET_SIZE = 48;
interface TouchButtonProps extends ButtonProps {
  touchOptimized?: boolean;
}
export const TouchButton = React.forwardRef<HTMLButtonElement, TouchButtonProps>(({
  className,
  touchOptimized = true,
  size,
  onClick,
  ...props
}, ref) => {
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (touchOptimized) {
      triggerHaptic('light');
    }
    onClick?.(e);
  };
  
  return (
    <Button
      ref={ref}
      className={cn(
        touchOptimized && 'min-h-[48px] min-w-[48px]',
        className
      )}
      size={size}
      onClick={handleClick}
      {...props}
    />
  );
});
TouchButton.displayName = 'TouchButton';
interface SwipeableCardProps {
  children: React.ReactNode;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  /** Khoảng cách tối thiểu (px). Mặc định = SWIPE_THRESHOLD_PX (60). */
  threshold?: number;
  /** Tốc độ tối thiểu (px/ms). Mặc định = SWIPE_VELOCITY_MIN (0.3). */
  velocityMin?: number;
  className?: string;
  hapticOnSwipe?: boolean;
}

/**
 * SwipeableCard — Touch Standard v1.
 * - Phân biệt swipe ngang vs cuộn dọc qua angle ratio (|dx| > |dy| * 1.5).
 * - Yêu cầu cả threshold (60px) VÀ velocity (0.3 px/ms) để kích hoạt.
 * - touch-action: pan-y → cho phép cuộn dọc native song song.
 */
export function SwipeableCard({
  children,
  onSwipeLeft,
  onSwipeRight,
  threshold = SWIPE_THRESHOLD_PX,
  velocityMin = SWIPE_VELOCITY_MIN,
  className = '',
  hapticOnSwipe = true,
}: SwipeableCardProps) {
  const startRef = React.useRef<{ x: number; y: number; t: number } | null>(null);
  const endRef = React.useRef<{ x: number; y: number; t: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.targetTouches[0];
    startRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    endRef.current = null;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.targetTouches[0];
    endRef.current = { x: t.clientX, y: t.clientY, t: Date.now() };
  };

  const onTouchEnd = () => {
    const start = startRef.current;
    const end = endRef.current;
    startRef.current = null;
    endRef.current = null;
    if (!start || !end) return;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const dt = Math.max(1, end.t - start.t);
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // Phải là vuốt ngang rõ ràng (góc < ~33°)
    if (absX <= absY * SWIPE_ANGLE_RATIO) return;
    // Đủ khoảng cách
    if (absX < threshold) return;
    // Đủ tốc độ
    const velocity = absX / dt;
    if (velocity < velocityMin) return;

    if (dx < 0 && onSwipeLeft) {
      if (hapticOnSwipe) triggerHaptic('medium');
      onSwipeLeft();
    } else if (dx > 0 && onSwipeRight) {
      if (hapticOnSwipe) triggerHaptic('medium');
      onSwipeRight();
    }
  };

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      className={cn('swipeable', className)}
    >
      {children}
    </div>
  );
}

// PullToRefresh is now exported from src/components/mobile/PullToRefresh.tsx
// Re-export for backward compatibility
export { PullToRefresh } from './PullToRefresh'