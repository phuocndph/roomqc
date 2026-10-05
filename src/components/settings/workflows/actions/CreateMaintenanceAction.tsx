import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useMaintenanceCategories } from '@/hooks/useMaintenanceCategories'
import { PriorityBadge } from '@/components/maintenance/PriorityBadge'

interface CreateMaintenanceActionProps {
  config: any
  onChange: (config: any) => void
  triggerEvent?: string
}

export const CreateMaintenanceAction = ({ config, onChange, triggerEvent }: CreateMaintenanceActionProps) => {
  const { data: categories } = useMaintenanceCategories()
  const [localConfig, setLocalConfig] = useState({
    title: config.title || 'Low stock: {{item_name}}',
    description: config.description || 'Item {{item_code}} has dropped below minimum stock level.\nCurrent: {{current_qty}}\nMinimum: {{min_qty}}',
    category_mode: config.category_mode || 'auto',
    category_id: config.category_id || '',
    priority_mode: config.priority_mode || 'auto',
    priority_fixed: config.priority_fixed || 'medium',
    assignment_mode: config.assignment_mode || 'auto',
    assignee_id: config.assignee_id || '',
    due_date_mode: config.due_date_mode || 'sla',
    due_date_offset_days: config.due_date_offset_days || 3,
    attach_item_details: config.attach_item_details ?? true,
    send_notification: config.send_notification ?? false,
  })

  const handleChange = (field: string, value: any) => {
    const newConfig = { ...localConfig, [field]: value }
    setLocalConfig(newConfig)
    onChange(newConfig)
  }

  return (
    <div className="space-y-6">
      <div>
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={localConfig.title}
          onChange={(e) => handleChange('title', e.target.value)}
          placeholder="Low stock: {{item_name}}"
          className="mt-1.5"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Available variables: {'{{item_name}}, {{item_code}}, {{current_qty}}, {{min_qty}}'}
        </p>
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={localConfig.description}
          onChange={(e) => handleChange('description', e.target.value)}
          rows={4}
          className="mt-1.5"
        />
      </div>

      <div>
        <Label>Category *</Label>
        <RadioGroup
          value={localConfig.category_mode}
          onValueChange={(value) => handleChange('category_mode', value)}
          className="mt-2 space-y-3"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="auto" id="cat-auto" />
            <Label htmlFor="cat-auto" className="font-normal">
              Use item's category
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="fixed" id="cat-fixed" />
            <Label htmlFor="cat-fixed" className="font-normal">
              Specific category:
            </Label>
          </div>
        </RadioGroup>
        {localConfig.category_mode === 'fixed' && (
          <Select
            value={localConfig.category_id}
            onValueChange={(value) => handleChange('category_id', value)}
          >
            <SelectTrigger className="mt-2">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categories?.map((cat) => (
                <SelectItem key={cat.id} value={cat.id}>
                  {cat.icon} {cat.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <Label>Priority *</Label>
        <RadioGroup
          value={localConfig.priority_mode}
          onValueChange={(value) => handleChange('priority_mode', value)}
          className="mt-2 space-y-3"
        >
          <div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="auto" id="pri-auto" />
              <Label htmlFor="pri-auto" className="font-normal">
                Based on stock level
              </Label>
            </div>
            {localConfig.priority_mode === 'auto' && (
              <div className="ml-6 mt-2 space-y-1 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  • Critical (&lt; 5): <PriorityBadge priority="urgent" />
                </div>
                <div className="flex items-center gap-2">
                  • Low (&lt; 20): <PriorityBadge priority="high" />
                </div>
                <div className="flex items-center gap-2">
                  • Others: <PriorityBadge priority="medium" />
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="fixed" id="pri-fixed" />
            <Label htmlFor="pri-fixed" className="font-normal">
              Fixed priority:
            </Label>
          </div>
        </RadioGroup>
        {localConfig.priority_mode === 'fixed' && (
          <Select
            value={localConfig.priority_fixed}
            onValueChange={(value) => handleChange('priority_fixed', value)}
          >
            <SelectTrigger className="mt-2">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="urgent">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority="urgent" />
                </div>
              </SelectItem>
              <SelectItem value="high">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority="high" />
                </div>
              </SelectItem>
              <SelectItem value="medium">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority="medium" />
                </div>
              </SelectItem>
              <SelectItem value="low">
                <div className="flex items-center gap-2">
                  <PriorityBadge priority="low" />
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      <div>
        <Label>Assignment *</Label>
        <RadioGroup
          value={localConfig.assignment_mode}
          onValueChange={(value) => handleChange('assignment_mode', value)}
          className="mt-2 space-y-3"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="auto" id="assign-auto" />
            <Label htmlFor="assign-auto" className="font-normal">
              Auto-assign by category
            </Label>
          </div>
        </RadioGroup>
      </div>

      <div>
        <Label>Due Date</Label>
        <RadioGroup
          value={localConfig.due_date_mode}
          onValueChange={(value) => handleChange('due_date_mode', value)}
          className="mt-2 space-y-3"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="sla" id="due-sla" />
            <Label htmlFor="due-sla" className="font-normal">
              Based on priority (SLA rules)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="fixed" id="due-fixed" />
            <Label htmlFor="due-fixed" className="font-normal">
              Fixed:
            </Label>
            {localConfig.due_date_mode === 'fixed' && (
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={365}
                  value={localConfig.due_date_offset_days}
                  onChange={(e) => handleChange('due_date_offset_days', parseInt(e.target.value))}
                  className="w-20"
                />
                <span className="text-sm">days from now</span>
              </div>
            )}
          </div>
        </RadioGroup>
      </div>

      <div className="space-y-3">
        <Label>Additional Options</Label>
        <div className="space-y-3">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="attach-details"
              checked={localConfig.attach_item_details}
              onCheckedChange={(checked) => handleChange('attach_item_details', checked)}
            />
            <Label htmlFor="attach-details" className="font-normal">
              Attach item details
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="send-notif"
              checked={localConfig.send_notification}
              onCheckedChange={(checked) => handleChange('send_notification', checked)}
            />
            <Label htmlFor="send-notif" className="font-normal">
              Send notification immediately
            </Label>
          </div>
        </div>
      </div>
    </div>
  )
}
