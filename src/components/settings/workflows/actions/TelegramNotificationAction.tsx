import { useState, useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { VariablePicker } from '../shared/VariablePicker'
import { DEPARTMENTS, NOTIFICATION_TYPES } from '@/components/settings/telegram'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'

interface TelegramNotificationConfig {
  routing_mode: 'department' | 'level' | 'groups'
  department?: string
  group_levels?: string[] // owner, management, staff, general
  group_ids?: string[]
  hotel_filter: 'dynamic' | 'all' | 'specific'
  hotel_id?: string
  notification_type_filter?: string
  title: string
  message: string
}

interface TelegramNotificationActionProps {
  config: any
  onChange: (config: any) => void
  triggerType?: string
}

const DEFAULT_CONFIG: TelegramNotificationConfig = {
  routing_mode: 'department',
  department: 'housekeeping',
  group_levels: [],
  hotel_filter: 'dynamic',
  title: '',
  message: '',
}

const GROUP_LEVELS = [
  { value: 'owner', label: 'Chủ sở hữu' },
  { value: 'management', label: 'Quản lý' },
  { value: 'staff', label: 'Nhân viên' },
  { value: 'general', label: 'Chung' },
]

export function TelegramNotificationAction({
  config,
  onChange,
  triggerType = '',
}: TelegramNotificationActionProps) {
  const [localConfig, setLocalConfig] = useState<TelegramNotificationConfig>(
    config || DEFAULT_CONFIG
  )
  const { tenantId } = useUser()

  // Fetch hotels for specific hotel selection
  const { data: hotels } = useQuery({
    queryKey: ['hotels-for-telegram', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data, error } = await supabase
        .from('hotels')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('status', 'active')
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  // Fetch telegram groups for specific group selection
  const { data: telegramGroups } = useQuery({
    queryKey: ['telegram-groups-for-workflow', tenantId],
    queryFn: async () => {
      if (!tenantId) return []
      const { data, error } = await supabase
        .from('telegram_groups')
        .select('id, chat_title, department, group_type')
        .eq('tenant_id', tenantId)
        .eq('is_active', true)
      if (error) throw error
      return data
    },
    enabled: !!tenantId,
  })

  const handleChange = (field: string, value: any) => {
    const newConfig = { ...localConfig, [field]: value }
    setLocalConfig(newConfig)
    onChange(newConfig)
  }

  const handleLevelToggle = (level: string) => {
    const current = localConfig.group_levels || []
    const updated = current.includes(level)
      ? current.filter(l => l !== level)
      : [...current, level]
    handleChange('group_levels', updated)
  }

  const handleGroupToggle = (groupId: string) => {
    const current = localConfig.group_ids || []
    const updated = current.includes(groupId)
      ? current.filter(id => id !== groupId)
      : [...current, groupId]
    handleChange('group_ids', updated)
  }

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
      <div className="flex items-center gap-2">
        <span className="text-lg">📱</span>
        <Label className="font-semibold">Telegram Notification</Label>
      </div>

      {/* Routing Mode */}
      <div className="space-y-2">
        <Label>Gửi đến *</Label>
        <RadioGroup
          value={localConfig.routing_mode}
          onValueChange={(value) => handleChange('routing_mode', value)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="department" id="route-dept" />
            <Label htmlFor="route-dept" className="font-normal">Nhóm theo Department</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="level" id="route-level" />
            <Label htmlFor="route-level" className="font-normal">Nhóm theo Level</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="groups" id="route-groups" />
            <Label htmlFor="route-groups" className="font-normal">Nhóm cụ thể</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Department Selection */}
      {localConfig.routing_mode === 'department' && (
        <div className="space-y-2 pl-6">
          <Select
            value={localConfig.department || ''}
            onValueChange={(value) => handleChange('department', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Chọn bộ phận" />
            </SelectTrigger>
            <SelectContent>
              {DEPARTMENTS.map(dept => (
                <SelectItem key={dept.value} value={dept.value}>
                  {dept.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Level Selection */}
      {localConfig.routing_mode === 'level' && (
        <div className="space-y-2 pl-6">
          {GROUP_LEVELS.map(level => (
            <div key={level.value} className="flex items-center space-x-2">
              <Checkbox
                id={`level-${level.value}`}
                checked={localConfig.group_levels?.includes(level.value)}
                onCheckedChange={() => handleLevelToggle(level.value)}
              />
              <Label htmlFor={`level-${level.value}`} className="font-normal">
                {level.label}
              </Label>
            </div>
          ))}
        </div>
      )}

      {/* Specific Groups Selection */}
      {localConfig.routing_mode === 'groups' && (
        <div className="space-y-2 pl-6">
          {telegramGroups && telegramGroups.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto p-2 border rounded-lg">
              {telegramGroups.map(group => (
                <div key={group.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={`group-${group.id}`}
                    checked={localConfig.group_ids?.includes(group.id)}
                    onCheckedChange={() => handleGroupToggle(group.id)}
                  />
                  <Label htmlFor={`group-${group.id}`} className="font-normal text-sm flex items-center gap-2">
                    {group.chat_title}
                    {group.department && (
                      <Badge variant="outline" className="text-xs">
                        {group.department}
                      </Badge>
                    )}
                  </Label>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Chưa có nhóm Telegram. Vui lòng thêm nhóm trong cài đặt Telegram.
            </p>
          )}
        </div>
      )}

      {/* Hotel Filter */}
      <div className="space-y-2">
        <Label>Filter theo Hotel</Label>
        <RadioGroup
          value={localConfig.hotel_filter}
          onValueChange={(value) => handleChange('hotel_filter', value)}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="dynamic" id="hotel-dynamic" />
            <Label htmlFor="hotel-dynamic" className="font-normal">Hotel của event (dynamic)</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="all" id="hotel-all" />
            <Label htmlFor="hotel-all" className="font-normal">Tất cả hotels</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="specific" id="hotel-specific" />
            <Label htmlFor="hotel-specific" className="font-normal">Hotel cụ thể</Label>
          </div>
        </RadioGroup>
        
        {localConfig.hotel_filter === 'specific' && hotels && (
          <Select
            value={localConfig.hotel_id || ''}
            onValueChange={(value) => handleChange('hotel_id', value)}
          >
            <SelectTrigger className="ml-6">
              <SelectValue placeholder="Chọn khách sạn" />
            </SelectTrigger>
            <SelectContent>
              {hotels.map(hotel => (
                <SelectItem key={hotel.id} value={hotel.id}>
                  {hotel.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Notification Type Filter */}
      <div className="space-y-2">
        <Label>Loại thông báo (tùy chọn)</Label>
        <Select
          value={localConfig.notification_type_filter || 'none'}
          onValueChange={(value) => handleChange('notification_type_filter', value === 'none' ? undefined : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Tất cả loại" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Tất cả loại</SelectItem>
            {NOTIFICATION_TYPES.map(type => (
              <SelectItem key={type.value} value={type.value}>
                {type.icon} {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Chỉ gửi đến nhóm có cấu hình nhận loại thông báo này
        </p>
      </div>

      {/* Message Template */}
      <div className="space-y-2">
        <Label>Tiêu đề *</Label>
        <div className="flex gap-2">
          <Input
            value={localConfig.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="VD: Checkout phòng {{room_number}}"
          />
          <VariablePicker
            triggerType={triggerType}
            onSelect={(variable) => handleChange('title', localConfig.title + variable)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Nội dung *</Label>
        <Textarea
          value={localConfig.message}
          onChange={(e) => handleChange('message', e.target.value)}
          rows={4}
          placeholder="VD: Phòng {{room_number}} đã checkout. Vui lòng kiểm tra và dọn phòng."
        />
        <div className="flex items-center gap-2">
          <VariablePicker
            triggerType={triggerType}
            onSelect={(variable) => handleChange('message', localConfig.message + variable)}
          />
          <span className="text-xs text-muted-foreground">
            Click để chèn biến
          </span>
        </div>
      </div>
    </div>
  )
}
