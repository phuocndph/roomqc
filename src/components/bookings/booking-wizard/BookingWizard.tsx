import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { WizardStepper } from './WizardStepper'
import { useBookingForm } from './hooks/useBookingForm'
import { DateTimeStep } from './steps/DateTimeStep'
import { RoomSelectionStep } from './steps/RoomSelectionStep'
import { GuestInfoStep } from './steps/GuestInfoStep'
import { PaymentStep } from './steps/PaymentStep'
import { ReviewStep } from './steps/ReviewStep'
import { WizardStep } from './types'

interface BookingWizardProps {
  onSuccess?: () => void
  onCancel: () => void
}

export function BookingWizard({ onSuccess, onCancel }: BookingWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>(1)
  const [completedSteps, setCompletedSteps] = useState<Set<WizardStep>>(new Set())
  
  const form = useBookingForm()
  const { state, computed, validation, isSubmitting, updateState, toggleRoomSelection, updateRoomPrice, applyPricingV2, submit } = form

  // Mark steps as completed when valid
  useEffect(() => {
    setCompletedSteps(previous => {
      const next = new Set(previous)
      if (validation.isStep1Valid) next.add(1)
      if (validation.isStep2Valid) next.add(2)
      if (validation.isStep3Valid) next.add(3)
      if (validation.isStep4Valid) next.add(4)

      if (next.size === previous.size && [...next].every(step => previous.has(step))) {
        return previous
      }
      return next
    })
  }, [validation.isStep1Valid, validation.isStep2Valid, validation.isStep3Valid, validation.isStep4Valid])

  const canGoNext = () => {
    switch (currentStep) {
      case 1: return validation.isStep1Valid
      case 2: return validation.isStep2Valid
      case 3: return validation.isStep3Valid
      case 4: return validation.isStep4Valid
      default: return true
    }
  }

  const goToStep = (step: WizardStep) => {
    if (step <= currentStep || completedSteps.has(step) || (step === currentStep + 1 && canGoNext())) {
      setCurrentStep(step)
    }
  }

  const handleNext = () => {
    if (canGoNext() && currentStep < 5) {
      setCurrentStep((currentStep + 1) as WizardStep)
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as WizardStep)
    }
  }

  const handleSubmit = async () => {
    const success = await submit(onSuccess)
    if (success) onCancel()
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <WizardStepper 
        currentStep={currentStep} 
        completedSteps={completedSteps} 
        onStepClick={goToStep}
      />
      
      {/* Step Content */}
      <div className="min-h-[300px]">
        {currentStep === 1 && (
          <DateTimeStep state={state} computed={computed} onUpdate={updateState} />
        )}
        {currentStep === 2 && (
          <RoomSelectionStep 
            state={state} 
            computed={computed} 
            onToggleRoom={toggleRoomSelection}
            onUpdateRoomPrice={updateRoomPrice}
            onApplyPricingV2={applyPricingV2}
          />
        )}
        {currentStep === 3 && (
          <GuestInfoStep state={state} computed={computed} onUpdate={updateState} />
        )}
        {currentStep === 4 && (
          <PaymentStep state={state} computed={computed} onUpdate={updateState} />
        )}
        {currentStep === 5 && (
          <ReviewStep state={state} computed={computed} onGoToStep={goToStep} />
        )}
      </div>
      
      {/* Navigation Buttons */}
      <div className="flex gap-2 pt-4 border-t">
        {currentStep === 1 ? (
          <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
            Hủy
          </Button>
        ) : (
          <Button type="button" variant="outline" className="flex-1" onClick={handleBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Quay lại
          </Button>
        )}
        
        {currentStep < 5 ? (
          <Button type="button" className="flex-1" onClick={handleNext} disabled={!canGoNext()}>
            Tiếp tục
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        ) : (
          <Button type="button" className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Xác nhận đặt phòng
          </Button>
        )}
      </div>
    </div>
  )
}
