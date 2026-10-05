import { LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface MobileModuleCardProps {
  icon: LucideIcon
  label: string
  description?: string
  path: string
  color: string
  badge?: number | string
  onClick: () => void
  className?: string
}

export function MobileModuleCard({
  icon: Icon,
  label,
  description,
  color,
  badge,
  onClick,
  className,
}: MobileModuleCardProps) {
  return (
    <Card 
      className={cn(
        "cursor-pointer hover:bg-accent transition-colors touch-target-48",
        className
      )}
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col items-center gap-2 relative">
        {badge && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center"
          >
            {typeof badge === 'number' && badge > 9 ? '9+' : badge}
          </Badge>
        )}
        <div className={cn("p-3 rounded-lg bg-muted", color)}>
          <Icon className="h-6 w-6" />
        </div>
        <span className="text-xs font-medium text-center leading-tight">
          {label}
        </span>
        {description && (
          <span className="text-[10px] text-muted-foreground text-center">
            {description}
          </span>
        )}
      </CardContent>
    </Card>
  )
}
