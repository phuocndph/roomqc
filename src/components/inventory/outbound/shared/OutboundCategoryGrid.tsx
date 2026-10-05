import { ComponentType } from 'react'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { cn } from '@/lib/utils'
import type { OutboundCategory } from './types'

export interface OutboundCategoryOption {
  value: OutboundCategory
  label: string
  description?: string
  icon: ComponentType<{ className?: string }>
}

interface Props {
  value: OutboundCategory
  onChange: (value: OutboundCategory) => void
  options: OutboundCategoryOption[]
  /** 'compact' = dialog (2 cols, small), 'wizard' = full screen (2 cols, tall) */
  variant?: 'compact' | 'wizard'
  className?: string
}

/**
 * Shared category picker used by both QuickOutboundDialog (compact)
 * and MobileOutboundForm (wizard). Keeps button styling consistent
 * across desktop dialog and mobile wizard.
 */
export function OutboundCategoryGrid({
  value,
  onChange,
  options,
  variant = 'compact',
  className,
}: Props) {
  const isWizard = variant === 'wizard'
  return (
    <div className={cn('grid grid-cols-2 gap-2', isWizard && 'gap-3', className)}>
      {options.map(option => {
        const Icon = option.icon
        const selected = value === option.value
        return (
          <TouchButton
            key={option.value}
            type="button"
            variant={selected ? 'default' : 'outline'}
            className={cn(
              'h-auto flex-col gap-1.5 justify-center',
              isWizard ? 'h-28 gap-2' : 'py-3 min-h-[72px]',
            )}
            onClick={() => onChange(option.value)}
          >
            <Icon className={cn(isWizard ? 'h-8 w-8' : 'h-5 w-5')} />
            <div className="text-center">
              <div className={cn('font-medium', isWizard ? 'text-sm' : 'text-xs')}>
                {option.label}
              </div>
              {isWizard && option.description && (
                <div className="text-xs opacity-70">{option.description}</div>
              )}
            </div>
          </TouchButton>
        )
      })}
    </div>
  )
}
