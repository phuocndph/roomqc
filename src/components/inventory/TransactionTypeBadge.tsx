import { Download, Upload, ArrowRightLeft, Settings, AlertCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { TransactionType } from '@/types/inventory.types'

interface TransactionTypeBadgeProps {
  type: TransactionType
  className?: string
}

const typeConfig: Record<TransactionType, {
  icon: any
  label: string
  className: string
}> = {
  in: {
    icon: Download,
    label: 'Nhập',
    className: 'bg-green-100 text-green-800 hover:bg-green-200',
  },
  out: {
    icon: Upload,
    label: 'Xuất',
    className: 'bg-blue-100 text-blue-800 hover:bg-blue-200',
  },
  transfer: {
    icon: ArrowRightLeft,
    label: 'Chuyển',
    className: 'bg-purple-100 text-purple-800 hover:bg-purple-200',
  },
  adjust: {
    icon: Settings,
    label: 'Điều chỉnh',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200',
  },
  damaged: {
    icon: AlertCircle,
    label: 'Hư hỏng',
    className: 'bg-red-100 text-red-800 hover:bg-red-200',
  },
  lost: {
    icon: AlertCircle,
    label: 'Mất',
    className: 'bg-red-100 text-red-800 hover:bg-red-200',
  },
}

const fallbackConfig = {
  icon: AlertCircle,
  label: 'Khác',
  className: 'bg-gray-100 text-gray-800 hover:bg-gray-200',
}

export function TransactionTypeBadge({ type, className }: TransactionTypeBadgeProps) {
  const config = typeConfig[type] ?? fallbackConfig
  const Icon = config.icon

  return (
    <Badge className={cn(config.className, className)}>
      <Icon className="mr-1 h-3 w-3" />
      {config.label || String(type ?? '—')}
    </Badge>
  )
}
