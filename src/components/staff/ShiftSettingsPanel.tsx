import { useState, useEffect } from 'react'
import { Settings, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { useShiftSettings, useUpdateShiftSettings, type ShiftSettings } from '@/hooks/useShiftSettings'

export function ShiftSettingsPanel() {
  const { data: settings, isLoading } = useShiftSettings()
  const updateSettings = useUpdateShiftSettings()

  const [formData, setFormData] = useState<ShiftSettings | null>(null)

  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  const handleSave = () => {
    if (!formData) return
    updateSettings.mutate(formData)
  }

  const handleChannelToggle = (channel: 'push' | 'telegram', checked: boolean) => {
    if (!formData) return
    const channels = checked
      ? [...formData.reminder_channels, channel]
      : formData.reminder_channels.filter(c => c !== channel)
    setFormData({ ...formData, reminder_channels: channels as ('push' | 'telegram')[] })
  }

  if (isLoading || !formData) {
    return (
      <div className="border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-5 w-24" />
        </div>
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <div className="flex items-center gap-2 p-3 border-b bg-muted/30">
        <Settings className="h-4 w-4 text-primary" />
        <h3 className="font-medium text-sm">Cài đặt ca</h3>
      </div>

      <div className="p-3 space-y-4">
        {/* Time settings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Giờ bắt đầu</Label>
            <Input
              type="time"
              value={formData.default_start_time}
              onChange={e => setFormData({ ...formData, default_start_time: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Giờ kết thúc</Label>
            <Input
              type="time"
              value={formData.default_end_time}
              onChange={e => setFormData({ ...formData, default_end_time: e.target.value })}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Duration settings */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tối đa (giờ)</Label>
            <Input
              type="number"
              min={1}
              max={24}
              value={formData.max_shift_hours}
              onChange={e => setFormData({ ...formData, max_shift_hours: Number(e.target.value) })}
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Nhắc sau (giờ)</Label>
            <Input
              type="number"
              min={1}
              max={formData.max_shift_hours}
              value={formData.warning_hours}
              onChange={e => setFormData({ ...formData, warning_hours: Number(e.target.value) })}
              className="h-8 text-sm"
            />
          </div>
        </div>

        {/* Reminder toggle */}
        <div className="flex items-center justify-between py-2">
          <Label className="text-xs">Bật nhắc nhở tự động</Label>
          <Switch
            checked={formData.reminder_enabled}
            onCheckedChange={checked => setFormData({ ...formData, reminder_enabled: checked })}
          />
        </div>

        {/* Notification channels */}
        {formData.reminder_enabled && (
          <div className="space-y-2 pl-1">
            <Label className="text-xs text-muted-foreground">Kênh thông báo</Label>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="push"
                  checked={formData.reminder_channels.includes('push')}
                  onCheckedChange={checked => handleChannelToggle('push', !!checked)}
                />
                <Label htmlFor="push" className="text-xs font-normal cursor-pointer">
                  Push
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="telegram"
                  checked={formData.reminder_channels.includes('telegram')}
                  onCheckedChange={checked => handleChannelToggle('telegram', !!checked)}
                />
                <Label htmlFor="telegram" className="text-xs font-normal cursor-pointer">
                  Telegram
                </Label>
              </div>
            </div>
          </div>
        )}

        {/* Save button */}
        <Button
          onClick={handleSave}
          disabled={updateSettings.isPending}
          className="w-full h-8 text-sm"
        >
          <Save className="h-3.5 w-3.5 mr-1.5" />
          {updateSettings.isPending ? 'Đang lưu...' : 'Lưu cài đặt'}
        </Button>
      </div>
    </div>
  )
}
