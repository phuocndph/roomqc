import { useState } from 'react'
import { AlertCircle, X, ChevronRight, Package, Wrench } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useNavigate } from 'react-router-dom'

interface AlertItem {
  id: string
  type: 'low_stock' | 'pending_maintenance' | 'laundry_overdue' | 'expiring'
  title: string
  description: string
  count?: number
  path?: string
  priority: 'high' | 'medium' | 'low'
}

interface MobileAlertsBannerProps {
  alerts: AlertItem[]
  className?: string
}

export function MobileAlertsBanner({ alerts, className }: MobileAlertsBannerProps) {
  const navigate = useNavigate()
  const [dismissedAlerts, setDismissedAlerts] = useState<string[]>([])

  const visibleAlerts = alerts
    .filter(alert => !dismissedAlerts.includes(alert.id))
    .sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 }
      return priorityOrder[a.priority] - priorityOrder[b.priority]
    })

  if (visibleAlerts.length === 0) return null

  const getAlertIcon = (type: AlertItem['type']) => {
    switch (type) {
      case 'low_stock':
        return Package
      case 'pending_maintenance':
        return Wrench
      default:
        return AlertCircle
    }
  }

  const getAlertVariant = (priority: AlertItem['priority']) => {
    switch (priority) {
      case 'high':
        return 'destructive'
      case 'medium':
        return 'default'
      case 'low':
        return 'default'
    }
  }

  const handleDismiss = (alertId: string) => {
    setDismissedAlerts(prev => [...prev, alertId])
  }

  const handleAlertClick = (alert: AlertItem) => {
    if (alert.path) {
      navigate(alert.path)
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      {visibleAlerts.slice(0, 3).map((alert) => {
        const Icon = getAlertIcon(alert.type)
        return (
          <Alert
            key={alert.id}
            variant={getAlertVariant(alert.priority)}
            className={cn(
              "relative cursor-pointer",
              alert.path && "hover:bg-accent"
            )}
            onClick={() => handleAlertClick(alert)}
          >
            <Icon className="h-4 w-4" />
            <AlertDescription className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{alert.title}</span>
                  {alert.count && (
                    <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                      {alert.count}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {alert.description}
                </p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {alert.path && (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDismiss(alert.id)
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )
      })}
    </div>
  )
}
