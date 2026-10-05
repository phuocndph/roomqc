import { Button } from '@/components/ui/button'
import { LucideIcon } from 'lucide-react'
import { ReactNode } from 'react'
import { ContextualHelpButton } from './ContextualHelpButton'

interface PageHeaderProps {
  title: string
  description?: string
  action?: {
    label: string
    icon?: LucideIcon
    onClick: () => void
  }
  children?: ReactNode
  showHelp?: boolean
}

export const PageHeader = ({ title, description, action, children, showHelp = true }: PageHeaderProps) => {
  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <div className="min-w-0 flex-1">
          <h1 className="text-lg sm:text-2xl lg:text-3xl font-bold tracking-tight truncate leading-tight">
            {title}
          </h1>
          {description && (
            <p className="mt-0.5 sm:mt-2 text-xs sm:text-sm text-muted-foreground truncate">
              {description}
            </p>
          )}
        </div>
        {showHelp && <ContextualHelpButton />}
      </div>
      <div className="flex gap-2 flex-shrink-0">
        {children}
        {action && (
          <Button onClick={action.onClick}>
            {action.icon && <action.icon className="mr-2 h-4 w-4" />}
            {action.label}
          </Button>
        )}
      </div>
    </div>
  )
}
