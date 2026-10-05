import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { WorkflowBasicInfo } from './steps/WorkflowBasicInfo'
import { WorkflowTrigger } from './steps/WorkflowTrigger'
import { WorkflowConditions } from './steps/WorkflowConditions'
import { WorkflowActions } from './steps/WorkflowActions'
import { WorkflowQuickTemplates } from './WorkflowQuickTemplates'
import { useCreateWorkflow, WorkflowCondition } from '@/hooks/useWorkflows'
import { ChevronLeft, ChevronRight, FileText, Zap, Filter, Play, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { WorkflowTemplate } from './WorkflowTemplates'

interface CreateWorkflowDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface LocalWorkflowAction {
  type: string
  config: any
}

interface WorkflowForm {
  name: string
  description: string
  trigger_type: 'event' | 'schedule' | 'manual'
  trigger_event?: string
  trigger_schedule?: string
  conditions: WorkflowCondition[]
  actions: LocalWorkflowAction[]
}

const INITIAL_FORM: WorkflowForm = {
  name: '',
  description: '',
  trigger_type: 'event',
  conditions: [],
  actions: [],
}

const STEPS = [
  { step: 1, icon: FileText, label: 'Thông tin' },
  { step: 2, icon: Zap, label: 'Trigger' },
  { step: 3, icon: Filter, label: 'Điều kiện' },
  { step: 4, icon: Play, label: 'Hành động' },
]

export const CreateWorkflowDialog = ({ open, onOpenChange }: CreateWorkflowDialogProps) => {
  const [step, setStep] = useState(1)
  const [form, setForm] = useState<WorkflowForm>(INITIAL_FORM)
  const createWorkflow = useCreateWorkflow()

  const handleNext = () => {
    if (step < 4) setStep(step + 1)
  }

  const handleBack = () => {
    if (step > 1) setStep(step - 1)
  }

  const handleSelectTemplate = (template: WorkflowTemplate) => {
    setForm({
      name: template.name,
      description: template.description,
      trigger_type: 'event',
      trigger_event: template.trigger.type,
      conditions: template.trigger.conditions ? 
        Object.entries(template.trigger.conditions).map(([field, value]) => ({
          field,
          operator: 'equals' as const,
          value: String(value),
        })) : [],
      actions: template.actions.map(action => ({
        type: action.type,
        config: action.config,
      })),
    })
    setStep(2) // Move to trigger step after selecting template
  }

  const handleSubmit = async () => {
    try {
      await createWorkflow.mutateAsync({
        workflow: {
          name: form.name,
          description: form.description,
          trigger_type: form.trigger_type,
          trigger_event: form.trigger_event,
          trigger_schedule: form.trigger_schedule,
          conditions: form.conditions,
          status: 'active',
        },
        actions: form.actions.map((action, index) => ({
          action_type: action.type as any,
          action_config: action.config,
          order_index: index,
        })),
      })
      onOpenChange(false)
      setStep(1)
      setForm(INITIAL_FORM)
    } catch (error) {
      console.error('Failed to create workflow:', error)
    }
  }

  const canProceed = () => {
    switch (step) {
      case 1:
        return form.name.trim().length > 0
      case 2:
        if (form.trigger_type === 'event') {
          return !!form.trigger_event
        }
        if (form.trigger_type === 'schedule') {
          return !!form.trigger_schedule
        }
        return true
      case 3:
        return true // Conditions are optional
      case 4:
        return form.actions.length > 0
      default:
        return false
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Tạo workflow mới
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex justify-between px-4 py-3 bg-muted/30 rounded-lg">
          {STEPS.map((s, idx) => (
            <div key={s.step} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                  step === s.step 
                    ? "border-primary bg-primary text-primary-foreground" 
                    : step > s.step 
                      ? "border-primary bg-primary/10 text-primary" 
                      : "border-muted-foreground/30 text-muted-foreground"
                )}>
                  {step > s.step ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <s.icon className="h-5 w-5" />
                  )}
                </div>
                <span className={cn(
                  "text-xs font-medium",
                  step >= s.step ? "text-foreground" : "text-muted-foreground"
                )}>
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div className={cn(
                  "h-0.5 w-12 mx-2 mt-[-1.25rem]",
                  step > s.step ? "bg-primary" : "bg-muted-foreground/30"
                )} />
              )}
            </div>
          ))}
        </div>

        <div className="mt-4">
          {step === 1 && (
            <Tabs defaultValue="new" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="new">Tạo mới</TabsTrigger>
                <TabsTrigger value="templates">Mẫu có sẵn</TabsTrigger>
              </TabsList>
              <TabsContent value="new" className="mt-0">
                <WorkflowBasicInfo
                  form={form}
                  onChange={(updates) => setForm({ ...form, ...updates })}
                />
              </TabsContent>
              <TabsContent value="templates" className="mt-0">
                <WorkflowQuickTemplates onSelect={handleSelectTemplate} />
              </TabsContent>
            </Tabs>
          )}

          {step === 2 && (
            <WorkflowTrigger
              form={form}
              onChange={(updates) => setForm({ ...form, ...updates })}
            />
          )}

          {step === 3 && (
            <WorkflowConditions
              conditions={form.conditions}
              onChange={(conditions) => setForm({ ...form, conditions })}
              triggerType={form.trigger_type}
              triggerEvent={form.trigger_event}
            />
          )}

          {step === 4 && (
            <WorkflowActions
              actions={form.actions}
              onChange={(actions) => setForm({ ...form, actions })}
              triggerType={form.trigger_type}
              triggerEvent={form.trigger_event}
            />
          )}
        </div>

        <div className="flex items-center justify-between mt-6 pt-4 border-t">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" onClick={handleBack}>
                <ChevronLeft className="h-4 w-4 mr-1" />
                Quay lại
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {step < 4 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Tiếp theo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={!canProceed() || createWorkflow.isPending}
              >
                {createWorkflow.isPending ? 'Đang tạo...' : 'Tạo workflow'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
