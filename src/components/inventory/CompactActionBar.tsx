import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { 
  Download, 
  Upload, 
  ClipboardCheck, 
  FileText, 
  Package 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface CompactActionBarProps {
  onInbound: () => void
  onOutbound: () => void
}

export function CompactActionBar({ onInbound, onOutbound }: CompactActionBarProps) {
  const { t } = useTranslation('inventory')
  const navigate = useNavigate()

  const actions = [
    {
      icon: Download,
      label: t('inbound.title'),
      onClick: onInbound,
      className: 'text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-900/20',
    },
    {
      icon: Upload,
      label: t('outbound.title'),
      onClick: onOutbound,
      className: 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/20',
    },
    {
      icon: ClipboardCheck,
      label: t('adjustment.title'),
      onClick: () => navigate('/inventory/adjustments'),
      className: '',
    },
    {
      icon: FileText,
      label: t('quickActions.viewTransactions'),
      onClick: () => navigate('/inventory/transactions'),
      className: '',
    },
    {
      icon: Package,
      label: t('quickActions.manageItems'),
      onClick: () => navigate('/items'),
      className: '',
    },
  ]

  return (
    <div className="border rounded-lg p-3 h-full flex flex-col justify-center">
      <p className="text-xs text-muted-foreground mb-2">{t('quickActions.title')}</p>
      <TooltipProvider delayDuration={100}>
        <div className="flex flex-wrap gap-1.5">
          {actions.map((action, index) => (
            <Tooltip key={index}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${action.className}`}
                  onClick={action.onClick}
                 aria-label="Thao tác">
                  <action.icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{action.label}</p>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
    </div>
  )
}
