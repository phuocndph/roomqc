import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Building2, Copy } from 'lucide-react'
import { toast } from '@/hooks/use-toast'
import { DEPARTMENTS, GROUP_TYPES, NOTIFICATION_TYPES } from './AddTelegramGroupDialog'

interface TelegramGroup {
  id: string
  chat_id: string
  chat_title: string
  group_type: string
  department: string | null
  notification_types: string[] | null
  hotel_id: string | null
  is_active: boolean
  hotels?: { name: string } | null
}

interface EditTelegramGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: TelegramGroup | null
  onSubmit: (groupId: string, data: {
    title: string
    groupType: string
    department: string | null
    notificationTypes: string[]
  }) => void
  isLoading: boolean
}

export function EditTelegramGroupDialog({
  open,
  onOpenChange,
  group,
  onSubmit,
  isLoading,
}: EditTelegramGroupDialogProps) {
  const [title, setTitle] = useState('')
  const [groupType, setGroupType] = useState('general')
  const [department, setDepartment] = useState<string | null>(null)
  const [notificationTypes, setNotificationTypes] = useState<string[]>([])

  // Populate form when group changes
  useEffect(() => {
    if (group && open) {
      setTitle(group.chat_title)
      setGroupType(group.group_type)
      setDepartment(group.department)
      setNotificationTypes(group.notification_types || [])
    }
  }, [group, open])

  const handleNotificationTypeToggle = (value: string) => {
    setNotificationTypes(prev =>
      prev.includes(value)
        ? prev.filter(t => t !== value)
        : [...prev, value]
    )
  }

  const handleSelectAll = () => {
    setNotificationTypes(NOTIFICATION_TYPES.map(t => t.value))
  }

  const handleClearAll = () => {
    setNotificationTypes([])
  }

  const handleSubmit = () => {
    if (!group) return
    onSubmit(group.id, {
      title: title.trim() || group.chat_title,
      groupType,
      department,
      notificationTypes,
    })
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast({ title: 'Đã copy' })
  }

  if (!group) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chỉnh sửa nhóm</DialogTitle>
          <DialogDescription>
            Cập nhật cấu hình nhóm Telegram
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Chat ID (read-only) */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Mã nhóm (Chat ID)</Label>
            <button
              type="button"
              className="flex items-center gap-2 p-2 border rounded-lg bg-muted text-sm w-full text-left hover:bg-muted/80"
              onClick={() => copyToClipboard(group.chat_id)}
            >
              <span className="font-mono flex-1">{group.chat_id}</span>
              <Copy className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>

          {/* Group Title */}
          <div className="space-y-2">
            <Label htmlFor="edit-group-title">Tên nhóm</Label>
            <Input
              id="edit-group-title"
              placeholder="VD: Nhóm Housekeeping Lầu 1-5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Group Type */}
          <div className="space-y-2">
            <Label>Loại nhóm (ai sẽ đọc?)</Label>
            <Select value={groupType} onValueChange={setGroupType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUP_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label} - {type.desc}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Department */}
          <div className="space-y-2">
            <Label>Bộ phận (Department)</Label>
            <Select value={department || 'none'} onValueChange={(v) => setDepartment(v === 'none' ? null : v)}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn bộ phận" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Không phân bộ phận</SelectItem>
                {DEPARTMENTS.map(dept => (
                  <SelectItem key={dept.value} value={dept.value}>
                    {dept.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Nhóm sẽ chỉ nhận thông báo liên quan đến bộ phận này
            </p>
          </div>

          {/* Notification Types */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Loại thông báo nhận</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={handleSelectAll}
                >
                  Chọn tất cả
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={handleClearAll}
                >
                  Bỏ chọn
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 p-3 border rounded-lg max-h-60 overflow-y-auto">
              {NOTIFICATION_TYPES.map(type => (
                <div key={type.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`edit-notif-${type.value}`}
                    checked={notificationTypes.includes(type.value)}
                    onCheckedChange={() => handleNotificationTypeToggle(type.value)}
                  />
                  <Label
                    htmlFor={`edit-notif-${type.value}`}
                    className="text-sm font-normal cursor-pointer flex items-center gap-2 flex-1"
                  >
                    <span className="text-base">{type.icon}</span>
                    <span>{type.label}</span>
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Để trống = nhận tất cả loại thông báo
            </p>
          </div>

          {/* Hotel (read-only) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-muted-foreground">
              <Building2 className="h-4 w-4" />
              Khách sạn
            </Label>
            {group.hotel_id && group.hotels ? (
              <div className="p-2 border rounded-lg bg-muted text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {group.hotels.name}
              </div>
            ) : (
              <div className="p-2 border rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-700 dark:text-amber-400">
                Tất cả khách sạn (nhận thông báo từ mọi khách sạn)
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Lưu thay đổi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
