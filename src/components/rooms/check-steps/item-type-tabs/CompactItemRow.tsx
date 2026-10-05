import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface CompactAction {
  label: string
  color: string
  onClick: () => void
}

interface CompactItemRowProps {
  itemName: string
  itemCode?: string
  standardQuantity?: number
  status: 'pending' | 'ok' | string
  statusLabel?: string
  statusColor?: string
  actions: CompactAction[]
  onMarkOk?: () => void
  onReset?: () => void
  children?: React.ReactNode
  expanded?: boolean
}

/**
 * Compact item row for mobile-first room check.
 * - Tap row = Mark OK (fastest action)
 * - Show action buttons inline for other statuses
 */
export function CompactItemRow({
  itemName,
  standardQuantity,
  status,
  statusLabel,
  statusColor = 'text-muted-foreground',
  actions,
  onMarkOk,
  onReset,
  children,
  expanded
}: CompactItemRowProps) {
  const isPending = status === 'pending'
  const isOk = status === 'ok'

  const handleRowClick = () => {
    if (isPending && onMarkOk) {
      onMarkOk()
    }
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div
        role={isPending ? "button" : undefined}
        tabIndex={isPending ? 0 : undefined}
        onClick={handleRowClick}
        onKeyDown={(e) => {
          if (isPending && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            onMarkOk?.()
          }
        }}
        className={cn(
          "flex items-center gap-2 py-2.5 px-2 transition-colors",
          isPending && "cursor-pointer hover:bg-muted/50 active:bg-muted",
          isOk && "bg-green-50/30"
        )}
      >
        {/* Status indicator */}
        <div className={cn(
          "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold",
          isPending && "border border-dashed border-muted-foreground/40",
          isOk && "bg-green-500 text-white",
          !isPending && !isOk && statusColor && "bg-muted"
        )}>
          {isOk && <Check className="h-3 w-3" />}
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="text-sm truncate">{itemName}</span>
            {standardQuantity && standardQuantity > 1 && (
              <span className="text-xs text-muted-foreground">×{standardQuantity}</span>
            )}
          </div>
        </div>

        {/* Actions or status */}
        {isPending ? (
          <div className="flex items-center gap-0.5 flex-shrink-0">
            {actions.slice(0, 3).map((action, idx) => (
              <Button
                key={idx}
                type="button"
                variant="ghost"
                size="sm"
                className={cn("h-7 px-2 text-xs", action.color)}
                onClick={(e) => {
                  e.stopPropagation()
                  action.onClick()
                }}
              >
                {action.label}
              </Button>
            ))}
          </div>
        ) : (
          <div className="flex items-center gap-1 flex-shrink-0">
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

      {/* Expanded content for quantity adjustments etc. */}
      {expanded && children && (
        <div className="px-2 pb-2">
          {children}
        </div>
      )}
    </div>
  )
}
