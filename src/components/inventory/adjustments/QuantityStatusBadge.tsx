import { Badge } from '@/components/ui/badge'
import { Check, TrendingUp, TrendingDown, X } from 'lucide-react'

interface QuantityStatusBadgeProps {
  systemQuantity: number
  actualQuantity: number
  size?: 'sm' | 'default'
}

export type QuantityStatus = 'match' | 'excess' | 'shortage' | 'lost'

export function getQuantityStatus(
  systemQuantity: number,
  actualQuantity: number
): QuantityStatus {
  if (actualQuantity === systemQuantity) return 'match'
  if (actualQuantity === 0 && systemQuantity > 0) return 'lost'
  if (actualQuantity > systemQuantity) return 'excess'
  return 'shortage'
}

export function QuantityStatusBadge({
  systemQuantity,
  actualQuantity,
  size = 'default',
}: QuantityStatusBadgeProps) {
  const status = getQuantityStatus(systemQuantity, actualQuantity)
  const diff = actualQuantity - systemQuantity
  
  const iconClass = size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'
  const badgeClass = size === 'sm' ? 'text-xs px-1.5 py-0' : ''
  
  switch (status) {
    case 'match':
      return (
        <Badge 
          variant="outline" 
          className={`bg-green-50 text-green-700 border-green-200 ${badgeClass}`}
        >
          <Check className={`${iconClass} mr-1`} />
          Đủ
        </Badge>
      )
    case 'excess':
      return (
        <Badge 
          variant="outline" 
          className={`bg-blue-50 text-blue-700 border-blue-200 ${badgeClass}`}
        >
          <TrendingUp className={`${iconClass} mr-1`} />
          Thừa +{diff}
        </Badge>
      )
    case 'shortage':
      return (
        <Badge 
          variant="outline" 
          className={`bg-amber-50 text-amber-700 border-amber-200 ${badgeClass}`}
        >
          <TrendingDown className={`${iconClass} mr-1`} />
          Thiếu {diff}
        </Badge>
      )
    case 'lost':
      return (
        <Badge 
          variant="outline" 
          className={`bg-red-50 text-red-700 border-red-200 ${badgeClass}`}
        >
          <X className={`${iconClass} mr-1`} />
          Mất
        </Badge>
      )
  }
}
