import { 
  Clock, 
  ClipboardCheck,
  CheckCircle,
  XCircle,
  Package,
  TrendingDown,
  Calendar
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn, formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import type { AdjustmentWithDetails } from '@/types/inventory.types'

interface MobileAdjustmentCardProps {
  adjustment: AdjustmentWithDetails
  onClick?: () => void
  className?: string
}

const statusConfig = {
  draft: { icon: Clock, label: 'Nháp', color: 'text-muted-foreground' },
  in_progress: { icon: ClipboardCheck, label: 'Đang kiểm', color: 'text-blue-600' },
  completed: { icon: Clock, label: 'Chờ duyệt', color: 'text-yellow-600' },
  approved: { icon: CheckCircle, label: 'Đã duyệt', color: 'text-green-600' },
  rejected: { icon: XCircle, label: 'Từ chối', color: 'text-red-600' },
}

const typeLabels: Record<string, string> = {
  inventory_check: 'Kiểm kê định kỳ',
  damage: 'Kiểm tra hư hỏng',
  loss: 'Kiểm tra mất mát',
  correction: 'Điều chỉnh số liệu',
}

export function MobileAdjustmentCard({ 
  adjustment, 
  onClick, 
  className 
}: MobileAdjustmentCardProps) {
  const config = statusConfig[adjustment.status as keyof typeof statusConfig]
  const StatusIcon = config?.icon || Clock
  const typeLabel = typeLabels[adjustment.adjustment_type] || adjustment.adjustment_type

  return (
    <div 
      className={cn(
        'border rounded-lg p-3 active:scale-[0.98] transition-transform cursor-pointer space-y-2',
        adjustment.status === 'completed' && 'border-yellow-400 bg-yellow-50/50 dark:bg-yellow-950/20',
        className
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className={cn('flex items-center gap-1 text-xs', config?.color)}>
          <StatusIcon className="h-3 w-3" />
          {config?.label}
        </div>
        <span className="text-xs text-muted-foreground">
          {format(new Date(adjustment.created_at), 'dd/MM/yyyy', { locale: vi })}
        </span>
      </div>

      {/* Type + Code */}
      <div>
        <div className="font-medium text-sm">{typeLabel}</div>
        <div className="text-xs text-muted-foreground">{adjustment.adjustment_code}</div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-3 text-xs">
        <div className="flex items-center gap-1">
          <Package className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="font-medium">{adjustment.total_items_checked || 0}</span>
          <span className="text-muted-foreground">items</span>
        </div>
        
        {adjustment.total_discrepancies && adjustment.total_discrepancies > 0 && (
          <div className="flex items-center gap-1 text-red-600">
            <TrendingDown className="h-3.5 w-3.5" />
            <span className="font-medium">{adjustment.total_discrepancies}</span>
            <span>sai lệch</span>
          </div>
        )}
      </div>

      {/* Value Difference */}
      {adjustment.total_value_difference && adjustment.total_value_difference !== 0 && (
        <div className={cn(
          'p-2 rounded border text-xs',
          adjustment.total_value_difference > 0 
            ? 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800' 
            : 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
        )}>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Chênh lệch:</span>
            <span className={cn(
              'font-medium',
              adjustment.total_value_difference > 0 ? 'text-green-600' : 'text-red-600'
            )}>
              {adjustment.total_value_difference > 0 ? '+' : ''}
              {formatCurrency(adjustment.total_value_difference)}
            </span>
          </div>
        </div>
      )}

      {/* Creator */}
      <div className="flex items-center gap-2 pt-1 border-t">
        <Avatar className="h-5 w-5">
          <AvatarFallback className="text-[10px] bg-primary/10">
            {adjustment.created_by_name?.charAt(0).toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
        <span className="text-xs truncate flex-1">{adjustment.created_by_name || 'Không rõ'}</span>
        <Calendar className="h-3 w-3 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">
          {format(new Date(adjustment.scheduled_date), 'dd/MM', { locale: vi })}
        </span>
      </div>
    </div>
  )
}
