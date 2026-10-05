import React, { useRef } from 'react'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'
import { Loader2, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PullToRefreshProps {
  onRefresh: () => Promise<void>
  children: React.ReactNode
  threshold?: number
  maxPullDistance?: number
  enabled?: boolean
  className?: string
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 80,
  maxPullDistance = 120,
  enabled = true,
  className
}: PullToRefreshProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const {
    pullDistance,
    isRefreshing,
    pullProgress,
    shouldRefresh
  } = usePullToRefresh({
    onRefresh,
    threshold,
    maxPullDistance,
    enabled,
    containerRef
  })

  const showIndicator = pullDistance > 0 || isRefreshing

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* Pull indicator */}
      <div
        className={cn(
          "absolute top-0 left-0 right-0 flex items-center justify-center transition-all duration-150 ease-out pointer-events-none z-10",
          showIndicator ? "opacity-100" : "opacity-0"
        )}
        style={{
          height: Math.max(pullDistance, isRefreshing ? 48 : 0),
          willChange: showIndicator ? 'transform, opacity' : 'auto'
        }}
      >
        <div className={cn(
          'flex items-center gap-2 text-sm text-muted-foreground px-3 py-1.5 rounded-full bg-background/80 backdrop-blur-sm border shadow-sm',
          shouldRefresh && 'text-primary border-primary/30'
        )}>
          {isRefreshing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Đang tải...</span>
            </>
          ) : shouldRefresh ? (
            <>
              <ArrowDown className="h-4 w-4 rotate-180" />
              <span>Thả để làm mới</span>
            </>
          ) : (
            <>
              <ArrowDown 
                className="h-4 w-4 transition-transform duration-150"
                style={{ 
                  transform: `rotate(${Math.min(pullProgress * 1.8, 180)}deg)` 
                }}
              />
              <span>Kéo xuống để làm mới</span>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className="transition-transform duration-150 ease-out"
        style={{
          transform: `translateY(${pullDistance}px)`,
          willChange: pullDistance > 0 ? 'transform' : 'auto'
        }}
      >
        {children}
      </div>
    </div>
  )
}
