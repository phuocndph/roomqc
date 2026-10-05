import { useState, useRef } from 'react'
import { motion, PanInfo, useMotionValue, useTransform } from 'framer-motion'
import { Check, X, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface SwipeAction {
  label: string
  color: string
  bgColor: string
  onClick: () => void
}

interface SwipeableItemRowProps {
  itemName: string
  itemCode?: string
  quantity?: number
  standardQuantity?: number
  status: 'pending' | 'ok' | string
  statusLabel?: string
  statusColor?: string
  actions: SwipeAction[]
  onTap?: () => void // Tap = mark OK
  onReset?: () => void
  children?: React.ReactNode // For expanded content
  expanded?: boolean
}

const SWIPE_THRESHOLD = -80

export function SwipeableItemRow({
  itemName,
  itemCode,
  quantity,
  standardQuantity,
  status,
  statusLabel,
  statusColor = 'text-muted-foreground',
  actions,
  onTap,
  onReset,
  children,
  expanded
}: SwipeableItemRowProps) {
  const [showActions, setShowActions] = useState(false)
  const x = useMotionValue(0)
  const actionsWidth = Math.min(actions.length * 56, 168) // max 3 actions visible
  
  // Transform for revealing actions
  const actionsOpacity = useTransform(x, [-actionsWidth, -40, 0], [1, 0.5, 0])
  
  const handleDragEnd = (_: any, info: PanInfo) => {
    if (info.offset.x < SWIPE_THRESHOLD) {
      setShowActions(true)
      x.set(-actionsWidth)
    } else {
      setShowActions(false)
      x.set(0)
    }
  }

  const handleActionClick = (action: SwipeAction) => {
    action.onClick()
    setShowActions(false)
    x.set(0)
  }

  const handleTap = () => {
    if (status === 'pending' && onTap && !showActions) {
      onTap()
    }
  }

  const handleClose = () => {
    setShowActions(false)
    x.set(0)
  }

  const isPending = status === 'pending'
  const isOk = status === 'ok'

  return (
    <div className="relative overflow-hidden">
      {/* Hidden actions (revealed on swipe) */}
      <motion.div 
        className="absolute right-0 top-0 bottom-0 flex items-center"
        style={{ opacity: actionsOpacity }}
      >
        {actions.map((action, idx) => (
          <Button
            key={idx}
            type="button"
            variant="ghost"
            size="sm"
            className={cn(
              "h-full w-14 rounded-none flex flex-col items-center justify-center gap-0.5",
              action.bgColor
            )}
            onClick={() => handleActionClick(action)}
          >
            <span className={cn("text-xs font-medium", action.color)}>
              {action.label}
            </span>
          </Button>
        ))}
      </motion.div>

      {/* Main content (draggable) */}
      <motion.div
        drag={isPending ? "x" : false}
        dragConstraints={{ left: -actionsWidth, right: 0 }}
        dragElastic={0.08}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        style={{ x, willChange: isPending ? 'transform' : 'auto' }}
        animate={{ x: showActions ? -actionsWidth : 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 35 }}
        className={cn(
          "relative bg-background py-2.5 px-3 border-b border-border",
          isPending && "cursor-pointer active:bg-muted/50",
          isOk && "bg-green-50/50"
        )}
        onClick={handleTap}
      >
        <div className="flex items-center gap-3">
          {/* Left: Status indicator */}
          <div className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 transition-all",
            isPending && "border-2 border-dashed border-muted-foreground/30",
            isOk && "bg-green-500 text-white",
            !isPending && !isOk && "bg-muted"
          )}>
            {isOk && <Check className="h-3.5 w-3.5" />}
            {!isPending && !isOk && statusLabel && (
              <span className={cn("text-[10px] font-bold", statusColor)}>
                {statusLabel.charAt(0)}
              </span>
            )}
          </div>

          {/* Center: Item info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium truncate">{itemName}</span>
              {standardQuantity && standardQuantity > 1 && (
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  ×{standardQuantity}
                </span>
              )}
            </div>
            {itemCode && (
              <span className="text-xs text-muted-foreground font-mono">{itemCode}</span>
            )}
          </div>

          {/* Right: Status or hint */}
          {isPending && !showActions && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <span className="text-xs">Vuốt</span>
              <ChevronRight className="h-3 w-3" />
            </div>
          )}
          
          {!isPending && (
            <div className="flex items-center gap-1">
              {statusLabel && !isOk && (
                <span className={cn("text-xs font-medium", statusColor)}>
                  {statusLabel}
                </span>
              )}
              {onReset && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    onReset()
                  }}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Expanded content */}
        {expanded && children && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="mt-2"
          >
            {children}
          </motion.div>
        )}
      </motion.div>

      {/* Close overlay when actions are shown */}
      {showActions && (
        <button
          type="button"
          className="absolute inset-0 z-10"
          onClick={handleClose}
          aria-label="Đóng"
        />
      )}
    </div>
  )
}
