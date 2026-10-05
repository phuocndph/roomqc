import { TrendingUp, TrendingDown } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface HeroStatCardProps {
  title: string
  value: string
  change?: {
    value: number | null
    label: string
  }
  isLoading?: boolean
}

export function HeroStatCard({ 
  title, 
  value, 
  change,
  isLoading 
}: HeroStatCardProps) {
  if (isLoading) {
    return (
      <div className="p-4 border rounded-lg bg-primary/5">
        <Skeleton className="h-3 w-24 mb-2" />
        <Skeleton className="h-8 w-40" />
      </div>
    )
  }

  const hasChange = change?.value !== undefined && change.value !== null
  const isPositive = (change?.value || 0) > 0

  return (
    <div className="p-4 border rounded-lg bg-primary/5">
      <p className="text-xs text-muted-foreground mb-1">{title}</p>
      <p className="text-2xl font-bold text-primary">{value}</p>
      
      {hasChange && (
        <div className={cn(
          "flex items-center gap-1 mt-1 text-xs",
          isPositive ? "text-green-600" : "text-destructive"
        )}>
          {isPositive ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          <span>
            {isPositive ? '+' : ''}
            {change?.value?.toFixed(1)}% {change?.label}
          </span>
        </div>
      )}
    </div>
  )
}
