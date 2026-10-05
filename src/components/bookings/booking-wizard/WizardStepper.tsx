import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WizardStep, WIZARD_STEPS } from './types'

interface WizardStepperProps {
  currentStep: WizardStep
  completedSteps: Set<WizardStep>
  onStepClick?: (step: WizardStep) => void
}

export function WizardStepper({ currentStep, completedSteps, onStepClick }: WizardStepperProps) {
  return (
    <div className="flex items-center justify-between w-full px-2">
      {WIZARD_STEPS.map((stepInfo, index) => {
        const isCompleted = completedSteps.has(stepInfo.step)
        const isCurrent = currentStep === stepInfo.step
        const isPending = !isCompleted && !isCurrent
        const isClickable = isCompleted || isCurrent
        
        return (
          <div key={stepInfo.step} className="flex items-center flex-1 last:flex-initial">
            {/* Step circle */}
            <button
              type="button"
              onClick={() => isClickable && onStepClick?.(stepInfo.step)}
              disabled={!isClickable}
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-full text-xs font-medium transition-all",
                isCompleted && "bg-primary text-primary-foreground cursor-pointer hover:bg-primary/90",
                isCurrent && "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2",
                isPending && "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {isCompleted ? <Check className="h-4 w-4" /> : stepInfo.step}
            </button>
            
            {/* Step label (hidden on small screens) */}
            <span className={cn(
              "ml-2 text-xs hidden sm:inline",
              isCurrent && "font-medium text-foreground",
              !isCurrent && "text-muted-foreground"
            )}>
              {stepInfo.shortTitle}
            </span>
            
            {/* Connector line */}
            {index < WIZARD_STEPS.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mx-2",
                isCompleted ? "bg-primary" : "bg-muted"
              )} />
            )}
          </div>
        )
      })}
    </div>
  )
}
