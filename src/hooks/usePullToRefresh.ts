import { useState, useRef, useCallback, useEffect, RefObject } from 'react'
import {
  PULL_DEAD_ZONE_PX,
  PULL_THRESHOLD_PX,
  PULL_DIRECTION_RATIO,
} from '@/lib/touch-constants'

export interface PullToRefreshOptions {
  onRefresh: () => Promise<void>
  threshold?: number
  maxPullDistance?: number
  enabled?: boolean
  containerRef?: RefObject<HTMLElement>
}

/**
 * usePullToRefresh — Touch Standard v1.
 * - KHÔNG dùng e.preventDefault() → không chặn cuộn dọc native hay swipe ngang.
 * - Khóa hướng: chỉ pull khi vuốt thẳng đứng rõ ràng (deltaY > deltaX * 2)
 *   VÀ scrollTop = 0. Nếu user vuốt ngang trước → hủy session.
 * - Dead zone 20px: không hiển thị indicator khi chạm/lướt nhẹ → tránh "nhảy".
 * - Listener gắn vào document.body (không phải document) khi không có containerRef
 *   → tránh ảnh hưởng đến overlay/dialog.
 * - Tất cả listener passive: true (vì không còn preventDefault).
 */
export function usePullToRefresh({
  onRefresh,
  threshold = PULL_THRESHOLD_PX,
  maxPullDistance = 120,
  enabled = true,
  containerRef
}: PullToRefreshOptions) {
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const startY = useRef<number>(0)
  const startX = useRef<number>(0)
  const directionLocked = useRef<'vertical' | 'horizontal' | null>(null)
  const cancelled = useRef<boolean>(false)

  const getScrollTop = useCallback(() => {
    if (containerRef?.current) {
      return containerRef.current.scrollTop
    }
    return window.scrollY || document.documentElement.scrollTop || 0
  }, [containerRef])

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled || getScrollTop() !== 0) return

    startY.current = e.touches[0].clientY
    startX.current = e.touches[0].clientX
    directionLocked.current = null
    cancelled.current = false
    setIsPulling(true)
  }, [enabled, getScrollTop])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling || !enabled || cancelled.current) return

    // Hủy nếu user đã cuộn xuống
    if (getScrollTop() !== 0) {
      cancelled.current = true
      setIsPulling(false)
      setPullDistance(0)
      return
    }

    const dy = e.touches[0].clientY - startY.current
    const dx = e.touches[0].clientX - startX.current
    const absY = Math.abs(dy)
    const absX = Math.abs(dx)

    // Khóa hướng sau khi user di chuyển đủ để xác định ý định
    if (directionLocked.current === null && (absX > 8 || absY > 8)) {
      // Phải là vuốt dọc rõ ràng VÀ kéo xuống
      if (dy > 0 && absY > absX * PULL_DIRECTION_RATIO) {
        directionLocked.current = 'vertical'
      } else {
        directionLocked.current = 'horizontal'
        cancelled.current = true
        setIsPulling(false)
        setPullDistance(0)
        return
      }
    }

    if (directionLocked.current !== 'vertical' || dy <= 0) return

    // Áp dụng resistance + dead zone
    const resistance = 0.5
    const raw = dy * resistance
    const adjusted = raw <= PULL_DEAD_ZONE_PX
      ? 0
      : Math.min(raw - PULL_DEAD_ZONE_PX, maxPullDistance)

    setPullDistance(adjusted)
  }, [isPulling, enabled, maxPullDistance, getScrollTop])

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling || !enabled) {
      setIsPulling(false)
      setPullDistance(0)
      return
    }

    const shouldRefreshNow = pullDistance >= threshold && !isRefreshing && !cancelled.current

    if (shouldRefreshNow) {
      setIsRefreshing(true)
      try {
        await onRefresh()
      } catch (error) {
        console.error('Refresh failed:', error)
      } finally {
        setIsRefreshing(false)
      }
    }

    setIsPulling(false)
    setPullDistance(0)
    directionLocked.current = null
    cancelled.current = false
  }, [isPulling, enabled, pullDistance, threshold, isRefreshing, onRefresh])

  useEffect(() => {
    if (!enabled) return

    // Gắn vào document.body thay vì document để tránh ảnh hưởng overlay
    const target: HTMLElement | Document =
      containerRef?.current || document.body

    // Tất cả passive: true vì không còn preventDefault
    target.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true })
    target.addEventListener('touchmove', handleTouchMove as EventListener, { passive: true })
    target.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true })
    target.addEventListener('touchcancel', handleTouchEnd as EventListener, { passive: true })

    return () => {
      target.removeEventListener('touchstart', handleTouchStart as EventListener)
      target.removeEventListener('touchmove', handleTouchMove as EventListener)
      target.removeEventListener('touchend', handleTouchEnd as EventListener)
      target.removeEventListener('touchcancel', handleTouchEnd as EventListener)
    }
  }, [enabled, containerRef, handleTouchStart, handleTouchMove, handleTouchEnd])

  const pullProgress = Math.min((pullDistance / threshold) * 100, 100)
  const shouldRefresh = pullDistance >= threshold

  return {
    isPulling,
    pullDistance,
    isRefreshing,
    pullProgress,
    shouldRefresh
  }
}
