import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Plus, X } from 'lucide-react'

interface FieldUpdate {
  field_name: string
  update_mode: 'fixed' | 'increment' | 'formula'
  value?: any
  increment_by?: number
  formula?: string
}

interface UpdateRecordActionConfig {
  target_mode: 'trigger' | 'related' | 'specific'
  related_entity?: string
  specific_record_id?: string
  field_updates: FieldUpdate[]
}

interface UpdateRecordActionProps {
  config: any
  onChange: (config: any) => void
}

const DEFAULT_CONFIG: UpdateRecordActionConfig = {
  target_mode: 'trigger',
  field_updates: []
}

export const UpdateRecordAction = ({ config, onChange }: UpdateRecordActionProps) => {
  const [localConfig, setLocalConfig] = useState<UpdateRecordActionConfig>(
    config || DEFAULT_CONFIG
  )

  const handleChange = (field: string, value: any) => {
    const newConfig = { ...localConfig, [field]: value }
    setLocalConfig(newConfig)
    onChange(newConfig)
  }

  const addField = () => {
    const newFields = [...localConfig.field_updates, {
      field_name: '',
      update_mode: 'fixed' as const,
      value: ''
    }]
    handleChange('field_updates', newFields)
  }

  const removeField = (index: number) => {
    const newFields = localConfig.field_updates.filter((_, i) => i !== index)
    handleChange('field_updates', newFields)
  }

  const updateField = (index: number, field: string, value: any) => {
    const newFields = [...localConfig.field_updates]
    newFields[index] = { ...newFields[index], [field]: value }
    handleChange('field_updates', newFields)
  }

  return (
    <div className="space-y-4">
      {/* Target selection */}
      <div>
        <Label>Update Target *</Label>
        <RadioGroup
          value={localConfig.target_mode}
          onValueChange={(value) => handleChange('target_mode', value)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="trigger" id="target-trigger" />
            <Label htmlFor="target-trigger" className="font-normal">
              Trigger record (the record that triggered this workflow)
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="related" id="target-related" />
            <Label htmlFor="target-related" className="font-normal">Related record:</Label>
            {localConfig.target_mode === 'related' && (
              <Select
                value={localConfig.related_entity}
                onValueChange={(value) => handleChange('related_entity', value)}
              >
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select relationship" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="category">Item's Category</SelectItem>
                  <SelectItem value="vendor">Item's Vendor</SelectItem>
                  <SelectItem value="hotel">Item's Hotel</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="specific" id="target-specific" />
            <Label htmlFor="target-specific" className="font-normal">Specific record:</Label>
            {localConfig.target_mode === 'specific' && (
              <Input
                placeholder="Search for record..."
                value={localConfig.specific_record_id || ''}
                onChange={(e) => handleChange('specific_record_id', e.target.value)}
              />
            )}
          </div>
        </RadioGroup>
      </div>
      
      {/* Field updates */}
      <div>
        <Label>Fields to Update</Label>
        <div className="space-y-2">
          {localConfig.field_updates.map((update, index) => (
            <Card key={index} className="p-3">
              <div className="flex gap-2">
                <Select
                  value={update.field_name}
                  onValueChange={(value) => updateField(index, 'field_name', value)}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select field" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="status">Status</SelectItem>
                    <SelectItem value="notes">Notes</SelectItem>
                    <SelectItem value="priority">Priority</SelectItem>
                    <SelectItem value="quantity">Quantity</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select
                  value={update.update_mode}
                  onValueChange={(value) => updateField(index, 'update_mode', value)}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Set to</SelectItem>
                    <SelectItem value="increment">Increment by</SelectItem>
                    <SelectItem value="formula">Formula</SelectItem>
                  </SelectContent>
                </Select>
                
                {update.update_mode === 'fixed' && (
                  <Input
                    value={update.value || ''}
                    onChange={(e) => updateField(index, 'value', e.target.value)}
                    placeholder="New value"
                    className="flex-1"
                  />
                )}
                
                {update.update_mode === 'increment' && (
                  <Input
                    type="number" min={0}
                    value={update.increment_by || 0}
                    onChange={(e) => updateField(index, 'increment_by', parseInt(e.target.value))}
                    className="w-24"
                  />
                )}
                
                {update.update_mode === 'formula' && (
                  <Input
                    value={update.formula || ''}
                    onChange={(e) => updateField(index, 'formula', e.target.value)}
                    placeholder="{{current_value}} + 10"
                    className="flex-1"
                  />
                )}
                
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeField(index)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </Card>
          ))}
          
          <Button
            variant="outline"
            onClick={addField}
            className="w-full"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Field
          </Button>
        </div>
      </div>
    </div>
  )
}
