import { Check, Circle, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'
import { useTranslation } from 'react-i18next'

interface BatchStatusTimelineProps {
  batch: any
}

export function BatchStatusTimeline({ batch }: BatchStatusTimelineProps) {
  const { t, i18n } = useTranslation('laundry')
  const dateLocale = i18n.language === 'vi' ? vi : enUS
  
  // For draft batches, show only draft step
  if (batch.status === 'draft') {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary bg-primary text-primary-foreground">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="flex-1 pb-4">
            <p className="font-medium text-foreground">
              {t('batchDetail.timeline.draft', 'Nháp')}
            </p>
            <p className="text-sm text-muted-foreground">
              {format(new Date(batch.created_at), 'PPP HH:mm', { locale: dateLocale })}
            </p>
          </div>
        </div>
      </div>
    )
  }
  
  const steps = [
    {
      key: 'delivered',
      label: t('batchDetail.timeline.delivered'),
      date: batch.delivery_date,
      completed: true,
    },
    {
      key: 'washing',
      label: t('batchDetail.timeline.washing'),
      date: batch.status === 'washing' || batch.status === 'ready' || batch.status === 'received' || batch.status === 'stocked'
        ? batch.delivery_date 
        : null,
      completed: ['washing', 'ready', 'received', 'stocked'].includes(batch.status),
    },
    {
      key: 'ready',
      label: t('batchDetail.timeline.ready'),
      date: batch.expected_return_date,
      completed: ['ready', 'received', 'stocked'].includes(batch.status),
      isExpected: !['received', 'stocked'].includes(batch.status),
    },
    {
      key: 'received',
      label: t('batchDetail.timeline.received'),
      date: batch.actual_return_date,
      completed: ['received', 'stocked'].includes(batch.status),
    },
    {
      key: 'stocked',
      label: t('batchDetail.timeline.stocked'),
      date: batch.status === 'stocked' ? batch.actual_return_date : null,
      completed: batch.status === 'stocked',
    },
  ]
  
  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div key={step.key} className="flex gap-4">
          {/* Icon */}
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full border-2',
                step.completed
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-muted bg-background text-muted-foreground'
              )}
            >
              {step.completed ? (
                <Check className="h-4 w-4" />
              ) : (
                <Circle className="h-4 w-4" />
              )}
            </div>
            {index < steps.length - 1 && (
              <div
                className={cn(
                  'h-12 w-0.5',
                  step.completed ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 pb-4">
            <p className={cn(
              'font-medium',
              step.completed ? 'text-foreground' : 'text-muted-foreground'
            )}>
              {step.label}
            </p>
            {step.date && (
              <p className="text-sm text-muted-foreground">
                {step.isExpected && `${t('batchDetail.timeline.expected')}: `}
                {format(new Date(step.date), 'PPP HH:mm', { locale: dateLocale })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
