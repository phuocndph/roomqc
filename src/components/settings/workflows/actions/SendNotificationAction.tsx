import { useState } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Eye } from 'lucide-react'
import { useUsers } from '@/hooks/useUsers'
import { useRoles } from '@/hooks/useRoles'
import { VariablePicker } from '../shared/VariablePicker'
import { UserMultiSelect } from '@/components/shared/UserMultiSelect'
import { TelegramNotificationAction } from './TelegramNotificationAction'

interface SendNotificationActionConfig {
  notification_type: 'inapp' | 'email' | 'telegram' | 'both' | 'all'
  use_template: boolean
  template_id?: string
  custom_subject?: string
  custom_body?: string
  recipient_mode: 'users' | 'roles' | 'dynamic'
  user_ids?: string[]
  role_ids?: string[]
  dynamic_field?: string
  include_link: boolean
  mark_urgent: boolean
  require_acknowledgment: boolean
  // Telegram specific
  telegram_config?: any
}

interface SendNotificationActionProps {
  config: any
  onChange: (config: any) => void
  type: 'notification' | 'email'
  triggerType?: string
}

const DEFAULT_CONFIG: SendNotificationActionConfig = {
  notification_type: 'inapp',
  use_template: false,
  recipient_mode: 'roles',
  include_link: true,
  mark_urgent: false,
  require_acknowledgment: false
}

export const SendNotificationAction = ({ 
  config, 
  onChange, 
  type,
  triggerType = '' 
}: SendNotificationActionProps) => {
  const [localConfig, setLocalConfig] = useState<SendNotificationActionConfig>(
    config || DEFAULT_CONFIG
  )
  const { users } = useUsers()
  const { data: roles } = useRoles()

  const handleChange = (field: string, value: any) => {
    const newConfig = { ...localConfig, [field]: value }
    setLocalConfig(newConfig)
    onChange(newConfig)
  }

  return (
    <div className="space-y-4">
      {/* Notification type */}
      <div>
        <Label>Notification Type *</Label>
        <RadioGroup
          value={localConfig.notification_type}
          onValueChange={(value) => handleChange('notification_type', value)}
          className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="inapp" id="type-inapp" />
            <Label htmlFor="type-inapp" className="font-normal">In-App</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="email" id="type-email" />
            <Label htmlFor="type-email" className="font-normal">Email</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="telegram" id="type-telegram" />
            <Label htmlFor="type-telegram" className="font-normal">📱 Telegram</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="both" id="type-both" />
            <Label htmlFor="type-both" className="font-normal">In-App + Email</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="type-all" />
            <Label htmlFor="type-all" className="font-normal">Tất cả</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Telegram Configuration */}
      {['telegram', 'all'].includes(localConfig.notification_type) && (
        <TelegramNotificationAction
          config={localConfig.telegram_config}
          onChange={(telegramConfig) => handleChange('telegram_config', telegramConfig)}
          triggerType={triggerType}
        />
      )}
      
      {/* Email configuration */}
      {['email', 'both', 'all'].includes(localConfig.notification_type) && (
        <div className="space-y-4 p-4 border rounded-lg">
          <div>
            <Label>Email Content</Label>
            <Tabs defaultValue="custom">
              <TabsList>
                <TabsTrigger value="template">Use Template</TabsTrigger>
                <TabsTrigger value="custom">Compose New</TabsTrigger>
              </TabsList>
              
              <TabsContent value="template" className="space-y-2">
                <Select
                  value={localConfig.template_id}
                  onValueChange={(value) => handleChange('template_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select email template" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low_stock">Low Stock Alert</SelectItem>
                    <SelectItem value="overdue">Overdue Reminder</SelectItem>
                    <SelectItem value="approval">Approval Request</SelectItem>
                  </SelectContent>
                </Select>
                
                {localConfig.template_id && (
                  <Button variant="outline" size="sm">
                    <Eye className="w-4 h-4 mr-2" />
                    Preview Template
                  </Button>
                )}
              </TabsContent>
              
              <TabsContent value="custom" className="space-y-2">
                <div>
                  <Label>Subject</Label>
                  <div className="flex gap-2">
                    <Input
                      value={localConfig.custom_subject || ''}
                      onChange={(e) => handleChange('custom_subject', e.target.value)}
                      placeholder="Low Stock Alert: {{item_name}}"
                    />
                    <VariablePicker
                      triggerType={triggerType}
                      onSelect={(variable) => {
                        handleChange('custom_subject', (localConfig.custom_subject || '') + variable)
                      }}
                    />
                  </div>
                </div>
                
                <div>
                  <Label>Body</Label>
                  <Textarea
                    value={localConfig.custom_body || ''}
                    onChange={(e) => handleChange('custom_body', e.target.value)}
                    rows={6}
                    placeholder="Dear {{recipient_name}},&#10;&#10;Item {{item_name}} is running low..."
                  />
                  <div className="mt-2">
                    <VariablePicker
                      triggerType={triggerType}
                      onSelect={(variable) => {
                        handleChange('custom_body', (localConfig.custom_body || '') + variable)
                      }}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}
      
      {/* Recipients - for In-App and Email only */}
      {['inapp', 'email', 'both'].includes(localConfig.notification_type) && (
        <div>
          <Label>Recipients *</Label>
          <RadioGroup
            value={localConfig.recipient_mode}
            onValueChange={(value) => handleChange('recipient_mode', value)}
          >
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="users" id="recip-users" />
                <Label htmlFor="recip-users" className="font-normal">Specific users</Label>
              </div>
              {localConfig.recipient_mode === 'users' && (
                <div className="ml-6">
                  <UserMultiSelect
                    value={localConfig.user_ids || []}
                    onChange={(values) => handleChange('user_ids', values)}
                  />
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="roles" id="recip-roles" />
                <Label htmlFor="recip-roles" className="font-normal">By role</Label>
              </div>
              {localConfig.recipient_mode === 'roles' && (
                <div className="ml-6 space-y-2">
                  {roles?.map((role) => (
                    <div key={role.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`role-${role.value}`}
                        checked={localConfig.role_ids?.includes(role.value)}
                        onCheckedChange={(checked) => {
                          const current = localConfig.role_ids || []
                          const updated = checked
                            ? [...current, role.value]
                            : current.filter(id => id !== role.value)
                          handleChange('role_ids', updated)
                        }}
                      />
                      <Label htmlFor={`role-${role.value}`} className="font-normal">
                        {role.label}
                      </Label>
                    </div>
                  ))}
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="dynamic" id="recip-dynamic" />
                <Label htmlFor="recip-dynamic" className="font-normal">Dynamic (from trigger data)</Label>
              </div>
              {localConfig.recipient_mode === 'dynamic' && (
                <div className="ml-6">
                  <Select
                    value={localConfig.dynamic_field}
                    onValueChange={(value) => handleChange('dynamic_field', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select field" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="item.manager_id">Item's Manager</SelectItem>
                      <SelectItem value="hotel.manager_id">Hotel Manager</SelectItem>
                      <SelectItem value="category.default_assignee">Category Default Assignee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </RadioGroup>
        </div>
      )}
      
      {/* Additional options */}
      <div className="space-y-2">
        <Label>Additional Options</Label>
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="include-link"
              checked={localConfig.include_link}
              onCheckedChange={(checked) => handleChange('include_link', checked)}
            />
            <Label htmlFor="include-link" className="font-normal">
              Include direct link to record
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="mark-urgent"
              checked={localConfig.mark_urgent}
              onCheckedChange={(checked) => handleChange('mark_urgent', checked)}
            />
            <Label htmlFor="mark-urgent" className="font-normal">
              Mark as urgent
            </Label>
          </div>
          
          <div className="flex items-center space-x-2">
            <Checkbox
              id="require-ack"
              checked={localConfig.require_acknowledgment}
              onCheckedChange={(checked) => handleChange('require_acknowledgment', checked)}
            />
            <Label htmlFor="require-ack" className="font-normal">
              Require acknowledgment
            </Label>
          </div>
        </div>
      </div>
    </div>
  )
}
