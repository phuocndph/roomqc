import React from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  ArrowDownCircle, 
  ArrowUpCircle, 
  Package, 
  MapPin,
  Calendar,
  User
} from 'lucide-react'

interface TransactionData {
  id: string
  transaction_code: string
  transaction_type: 'in' | 'out' | 'adjustment'
  transaction_category?: string
  item_name: string
  item_code?: string
  item_image?: string
  quantity: number
  created_at: string
  created_by_name?: string
  created_by_avatar?: string
  from_location?: string
  to_location?: string
}

interface MobileTransactionCardProps {
  transaction: TransactionData
  onClick?: () => void
  className?: string
}

const typeConfig = {
  in: {
    icon: ArrowDownCircle,
    color: 'text-green-600 dark:text-green-400',
    bgColor: 'bg-green-50 dark:bg-green-950',
    borderColor: 'border-green-200 dark:border-green-800',
    label: 'Nhập'
  },
  out: {
    icon: ArrowUpCircle,
    color: 'text-blue-600 dark:text-blue-400',
    bgColor: 'bg-blue-50 dark:bg-blue-950',
    borderColor: 'border-blue-200 dark:border-blue-800',
    label: 'Xuất'
  },
  adjustment: {
    icon: Package,
    color: 'text-orange-600 dark:text-orange-400',
    bgColor: 'bg-orange-50 dark:bg-orange-950',
    borderColor: 'border-orange-200 dark:border-orange-800',
    label: 'Điều chỉnh'
  }
}

const categoryLabels: Record<string, string> = {
  // Nhập
  purchase: 'Mua hàng',
  return: 'Trả về kho',
  return_to_stock: 'Hoàn về kho (hủy phiếu)',
  laundry_return: 'Nhận đồ giặt về',
  other_in: 'Nhập khác',
  // Xuất
  room_deliver: 'Giao phòng',
  room_assign: 'Cấp phòng (cũ)',
  staff_assign: 'Cấp nhân viên',
  laundry_send: 'Gửi đi giặt',
  maintenance: 'Bảo trì',
  disposal: 'Hủy bỏ',
  warehouse_release: 'Xuất nội bộ',
  adjustment_out: 'Lệch kiểm kê',
  other_out: 'Xuất khác',
  // Chuyển
  internal_transfer: 'Chuyển kho',
}

export function MobileTransactionCard({
  transaction,
  onClick,
  className
}: MobileTransactionCardProps) {
  const config = typeConfig[transaction.transaction_type]
  const Icon = config.icon

  return (
    <Card
      className={cn(
        'p-4 transition-all active:scale-98 cursor-pointer border-l-4',
        config.borderColor,
        onClick && 'hover:shadow-md',
        className
      )}
      onClick={onClick}
    >
      <div className="flex gap-3">
        {/* Icon & Type */}
        <div className={cn('flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center', config.bgColor)}>
          <Icon className={cn('h-5 w-5', config.color)} />
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{transaction.item_name}</p>
              <p className="text-xs text-muted-foreground">{transaction.transaction_code}</p>
            </div>
            <Badge variant="outline" className={cn('text-xs whitespace-nowrap', config.color)}>
              {config.label}
            </Badge>
          </div>

          {/* Category */}
          {transaction.transaction_category && (
            <Badge variant="secondary" className="text-xs mb-2">
              {categoryLabels[transaction.transaction_category] || transaction.transaction_category}
            </Badge>
          )}

          {/* Quantity */}
          <div className="flex items-center gap-1 mb-2">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
            <span className={cn('text-sm font-medium', config.color)}>
              {transaction.transaction_type === 'out' ? '-' : '+'}{Math.abs(transaction.quantity)}
            </span>
          </div>

          {/* Location */}
          {(transaction.from_location || transaction.to_location) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-2">
              <MapPin className="h-3 w-3" />
              <span className="truncate">
                {transaction.from_location && `Từ: ${transaction.from_location}`}
                {transaction.from_location && transaction.to_location && ' → '}
                {transaction.to_location && `Đến: ${transaction.to_location}`}
              </span>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t">
            <div className="flex items-center gap-1.5">
              {transaction.created_by_avatar ? (
                <Avatar className="h-5 w-5">
                  <AvatarImage src={transaction.created_by_avatar} />
                  <AvatarFallback className="text-[10px]">
                    {transaction.created_by_name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
              ) : (
                <User className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {transaction.created_by_name || 'N/A'}
              </span>
            </div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>
                {transaction.created_at ? format(new Date(transaction.created_at), 'dd/MM HH:mm', { locale: vi }) : 'N/A'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
