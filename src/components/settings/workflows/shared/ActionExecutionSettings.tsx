import { Card } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Input } from '@/components/ui/input'

interface ActionExecutionSettings {
  execution_mode: 'sequential' | 'parallel'
  on_failure: 'stop' | 'continue' | 'retry'
  retry_count?: number
}

interface ActionExecutionSettingsProps {
  settings: ActionExecutionSettings
  onChange: (settings: ActionExecutionSettings) => void
}

export const ActionExecutionSettingsComponent = ({ 
  settings, 
  onChange 
}: ActionExecutionSettingsProps) => {
  return (
    <Card className="p-4">
      <h4 className="font-medium mb-4">Action Execution Settings</h4>
      
      <div className="space-y-4">
        <div>
          <Label>Execute actions:</Label>
          <RadioGroup
            value={settings.execution_mode}
            onValueChange={(value: 'sequential' | 'parallel') => 
              onChange({ ...settings, execution_mode: value })
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="sequential" id="exec-seq" />
              <Label htmlFor="exec-seq" className="font-normal">
                Sequentially (one after another)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="parallel" id="exec-par" />
              <Label htmlFor="exec-par" className="font-normal">
                In parallel (all at once - faster but no dependencies)
              </Label>
            </div>
          </RadioGroup>
        </div>
        
        <div>
          <Label>On action failure:</Label>
          <RadioGroup
            value={settings.on_failure}
            onValueChange={(value: 'stop' | 'continue' | 'retry') => 
              onChange({ ...settings, on_failure: value })
            }
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="stop" id="fail-stop" />
              <Label htmlFor="fail-stop" className="font-normal">
                Stop workflow and alert admin
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="continue" id="fail-cont" />
              <Label htmlFor="fail-cont" className="font-normal">
                Continue with remaining actions
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="retry" id="fail-retry" />
              <Label htmlFor="fail-retry" className="font-normal">
                Retry failed action
              </Label>
              {settings.on_failure === 'retry' && (
                <>
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.retry_count || 3}
                    onChange={(e) => onChange({ ...settings, retry_count: parseInt(e.target.value) })}
                    className="w-20"
                  />
                  <span className="text-sm">times</span>
                </>
              )}
            </div>
          </RadioGroup>
        </div>
      </div>
    </Card>
  )
}
