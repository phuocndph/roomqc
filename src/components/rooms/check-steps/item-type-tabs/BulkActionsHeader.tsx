import { Check, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

interface BulkActionsHeaderProps {
  totalItems: number
  checkedCount: number
  onMarkAllOk: () => void
  onResetAll?: () => void
  className?: string
}

/**
 * Compact header with progress + bulk actions for room check tabs
 * Improved: Larger progress bar, clearer visual hierarchy
 */
export function BulkActionsHeader({
  totalItems,
  checkedCount,
  onMarkAllOk,
  onResetAll,
  className
}: BulkActionsHeaderProps) {
  const progressPercent = totalItems > 0 ? (checkedCount / totalItems) * 100 : 0
  const isComplete = checkedCount === totalItems && totalItems > 0
  const remaining = totalItems - checkedCount

  return (
    <div className={cn(
      "flex items-center justify-between gap-3 py-2 px-2 bg-muted/30 rounded-lg",
      className
    )}>
      {/* Progress indicator - larger and more visible */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isComplete ? (
            <div className="w-6 h-6 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="h-4 w-4 text-white" />
            </div>
          ) : (
            <div className="w-6 h-6 rounded-full border-2 border-muted-foreground/30 flex items-center justify-center">
              <span className="text-xs font-medium text-muted-foreground">
                {remaining}
              </span>
            </div>
          )}
          <span className={cn(
            "text-sm font-semibold tabular-nums",
            isComplete ? "text-green-600" : "text-foreground"
          )}>
            {checkedCount}/{totalItems}
          </span>
        </div>
        <Progress 
          value={progressPercent} 
          className={cn(
            "h-2 flex-1 max-w-32",
            isComplete && "[&>div]:bg-green-500"
          )}
        />
      </div>

      {/* Bulk actions - larger touch targets */}
      <div className="flex items-center gap-2">
        {remaining > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-3 text-xs border-green-500 text-green-600 hover:bg-green-50 active:bg-green-100"
            onClick={onMarkAllOk}
          >
            <Check className="h-4 w-4 mr-1" />
            Tất cả OK
          </Button>
        )}
        {onResetAll && checkedCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-xs text-muted-foreground hover:text-foreground"
            onClick={onResetAll}
          >
            <RotateCcw className="h-4 w-4 mr-1" />
            Reset
          </Button>
        )}
      </div>
    </div>
  )
}
