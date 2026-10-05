import { Link } from 'react-router-dom'
import { format, differenceInHours } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  CheckCircle, Clock, XCircle, Package, ChevronRight, 
  AlertCircle, Undo2, Truck 
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import type { RoomDistributionHistoryItem } from '@/hooks/useRoomDistributionHistory'

interface DistributionAccordionItemProps {
  item: RoomDistributionHistoryItem
  isSelected: boolean
  onSelect: (id: string, selected: boolean) => void
  onConfirm: (item: RoomDistributionHistoryItem) => void
  onReject: (item: RoomDistributionHistoryItem) => void
  onUndo: (item: RoomDistributionHistoryItem) => void
  isConfirming: boolean
  isRejecting: boolean
  isUndoing: boolean
}

const STATUS_CONFIG = {
  pending: { 
    label: 'Chờ xác nhận', 
    icon: Clock, 
    variant: 'secondary' as const, 
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-950/30',
    borderColor: 'border-amber-200 dark:border-amber-800'
  },
  delivered: { 
    label: 'Đang giao', 
    icon: Truck, 
    variant: 'default' as const, 
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-950/30',
    borderColor: 'border-blue-200 dark:border-blue-800'
  },
  confirmed: { 
    label: 'Đã xác nhận', 
    icon: CheckCircle, 
    variant: 'default' as const, 
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-950/30',
    borderColor: 'border-green-200 dark:border-green-800'
  },
  rejected: { 
    label: 'Từ chối', 
    icon: XCircle, 
    variant: 'destructive' as const, 
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    borderColor: 'border-destructive/30'
  }
}

export function DistributionAccordionItem({
  item,
  isSelected,
  onSelect,
  onConfirm,
  onReject,
  onUndo,
  isConfirming,
  isRejecting,
  isUndoing
}: DistributionAccordionItemProps) {
  const config = STATUS_CONFIG[item.room_status as keyof typeof STATUS_CONFIG] || STATUS_CONFIG.pending
  const StatusIcon = config.icon
  const isPending = item.room_status === 'pending' || item.room_status === 'delivered'
  
  const canUndo = () => {
    if (item.room_status !== 'confirmed' || !item.confirmed_at) return false
    const hoursSinceConfirm = differenceInHours(new Date(), new Date(item.confirmed_at))
    return hoursSinceConfirm <= 24
  }
  
  const hoursRemaining = item.confirmed_at 
    ? Math.max(0, 24 - differenceInHours(new Date(), new Date(item.confirmed_at)))
    : 0

  return (
    <AccordionItem 
      value={item.room_order_id}
      className={cn(
        "border rounded-lg overflow-hidden transition-colors",
        config.borderColor,
        isPending && config.bgColor
      )}
    >
      <AccordionTrigger className="px-3 py-2 hover:no-underline [&[data-state=open]>svg]:rotate-180">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Checkbox for pending items */}
          {isPending && (
            <Checkbox 
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(item.room_order_id, checked as boolean)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          )}
          
          {/* Status Icon */}
          <StatusIcon className={cn("h-4 w-4 shrink-0", config.color)} />
          
          {/* Order Info - Compact */}
          <div className="flex-1 min-w-0 text-left">
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm">{item.order_code}</span>
              <Badge variant={config.variant} className="text-[10px] px-1.5 py-0">
                {config.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                • {item.total_quantity} sp
              </span>
            </div>
          </div>
          
          {/* Link to detail */}
          <Link 
            to={`/inventory/distributions/${item.order_id}`}
            onClick={(e) => e.stopPropagation()}
            className="shrink-0 p-1 hover:bg-accent rounded"
          >
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        </div>
      </AccordionTrigger>
      
      <AccordionContent className="px-3 pb-3">
        {/* Items List - Compact */}
        <div className="bg-muted/50 rounded border p-2 mb-2">
          <div className="text-[10px] font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
            <Package className="h-3 w-3" />
            Sản phẩm
          </div>
          <div className="space-y-1">
            {item.items.map((i) => (
              <div 
                key={i.item_id} 
                className="flex items-center justify-between py-1 px-1.5 bg-background rounded text-xs"
              >
                <span className="text-foreground truncate">{i.item_name}</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0 ml-1">
                  x{i.quantity}
                </Badge>
              </div>
            ))}
          </div>
        </div>
        
        {/* Meta Info */}
        <div className="text-xs text-muted-foreground space-y-1 mb-3">
          {item.confirmed_at ? (
            <p>
              Xác nhận bởi <span className="font-medium text-foreground">{item.confirmed_by_name}</span> • {' '}
              {format(new Date(item.confirmed_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
            </p>
          ) : (
            <p>
              Tạo lúc {format(new Date(item.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
              {item.assigned_to_name && (
                <> • Giao cho <span className="font-medium text-foreground">{item.assigned_to_name}</span></>
              )}
            </p>
          )}
          
          {item.rejection_reason && (
            <p className="flex items-center gap-1 text-destructive">
              <AlertCircle className="h-3 w-3" />
              Lý do từ chối: {item.rejection_reason}
            </p>
          )}
        </div>
        
        {/* Action Buttons */}
        {isPending && (
          <div className="flex gap-2">
            <Button 
              size="sm" 
              onClick={() => onConfirm(item)}
              disabled={isConfirming}
              className="flex-1"
            >
              <CheckCircle className="h-4 w-4 mr-1.5" />
              Xác nhận đã giao
            </Button>
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => onReject(item)}
              disabled={isRejecting}
            >
              <XCircle className="h-4 w-4 mr-1.5" />
              Từ chối
            </Button>
          </div>
        )}
        
        {/* Undo Button */}
        {canUndo() && (
          <Button 
            size="sm" 
            variant="outline"
            onClick={() => onUndo(item)}
            disabled={isUndoing}
            className="w-full"
          >
            <Undo2 className="h-4 w-4 mr-1.5" />
            Hoàn tác (còn {hoursRemaining}h)
          </Button>
        )}
      </AccordionContent>
    </AccordionItem>
  )
}
