import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Loader2, Building2 } from 'lucide-react'

interface AddTelegramGroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubmit: (data: {
    chatId: string
    title: string
    groupType: string
    department: string | null
    notificationTypes: string[]
    hotelId: string | null
  }) => void
  isLoading: boolean
  botUsername: string
  selectedHotel: { id: string; name: string } | null
  isAllHotelsMode: boolean
}

const DEPARTMENTS = [
  { value: 'housekeeping', label: 'Housekeeping - Buồng phòng' },
  { value: 'maintenance', label: 'Maintenance - Bảo trì' },
  { value: 'laundry', label: 'Laundry - Giặt là' },
  { value: 'inventory', label: 'Inventory - Kho' },
  { value: 'accounting', label: 'Accounting - Kế toán' },
  { value: 'front_desk', label: 'Front Desk - Lễ tân' },
  { value: 'general', label: 'Chung - Không phân bộ phận' },
]

const GROUP_TYPES = [
  { value: 'owner', label: 'Chủ sở hữu', desc: 'Chỉ thông báo quan trọng' },
  { value: 'management', label: 'Quản lý', desc: 'Thông báo quản lý' },
  { value: 'staff', label: 'Nhân viên', desc: 'Thông báo công việc' },
  { value: 'general', label: 'Chung', desc: 'Nhận tất cả thông báo' },
]

const NOTIFICATION_TYPES = [
  { value: 'checkout', label: 'Checkout / Dọn phòng', icon: '🚪' },
  { value: 'checkin', label: 'Check-in', icon: '✅' },
  { value: 'booking', label: 'Đặt phòng mới', icon: '🏨' },
  { value: 'maintenance_new', label: 'Yêu cầu bảo trì mới', icon: '🔧' },
  { value: 'maintenance_urgent', label: 'Bảo trì khẩn cấp', icon: '🚨' },
  { value: 'inventory_low', label: 'Tồn kho thấp', icon: '📦' },
  { value: 'inventory_critical', label: 'Tồn kho nghiêm trọng', icon: '⚠️' },
  { value: 'laundry_received', label: 'Hàng giặt về', icon: '🧺' },
  { value: 'laundry_overdue', label: 'Giặt quá hạn', icon: '⏰' },
  { value: 'payment', label: 'Thanh toán', icon: '💰' },
]

export function AddTelegramGroupDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  botUsername,
  selectedHotel,
  isAllHotelsMode,
}: AddTelegramGroupDialogProps) {
  const [chatId, setChatId] = useState('')
  const [title, setTitle] = useState('')
  const [groupType, setGroupType] = useState('general')
  const [department, setDepartment] = useState<string | null>(null)
  const [notificationTypes, setNotificationTypes] = useState<string[]>([])
  const [hotelId, setHotelId] = useState<string | null>(null)

  // Auto-set hotel_id when opening
  useEffect(() => {
    if (open) {
      if (selectedHotel && !isAllHotelsMode) {
        setHotelId(selectedHotel.id)
      } else {
        setHotelId(null)
      }
    }
  }, [open, selectedHotel, isAllHotelsMode])

  // Reset form when closing
  useEffect(() => {
    if (!open) {
      setChatId('')
      setTitle('')
      setGroupType('general')
      setDepartment(null)
      setNotificationTypes([])
    }
  }, [open])

  const handleNotificationTypeToggle = (value: string) => {
    setNotificationTypes(prev =>
      prev.includes(value)
        ? prev.filter(t => t !== value)
        : [...prev, value]
    )
  }

  const handleSubmit = () => {
    onSubmit({
      chatId: chatId.trim(),
      title: title.trim() || `Group ${chatId}`,
      groupType,
      department,
      notificationTypes,
      hotelId,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Thêm nhóm Telegram</DialogTitle>
          <DialogDescription>
            Thêm bot @{botUsername} vào nhóm, sau đó nhập mã nhóm
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Instructions */}
          <Alert>
            <AlertDescription className="text-sm">
              <strong>Hướng dẫn:</strong>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>Thêm @{botUsername} vào nhóm Telegram</li>
                <li>Bot sẽ gửi mã nhóm (Chat ID) vào nhóm</li>
                <li>Nhập mã đó vào ô bên dưới</li>
              </ol>
            </AlertDescription>
          </Alert>

          {/* Chat ID */}
          <div className="space-y-2">
            <Label htmlFor="chat-id">Mã nhóm (Chat ID) *</Label>
            <Input
              id="chat-id"
              placeholder="-1001234567890"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
          </div>

          {/* Group Title */}
          <div className="space-y-2">
            <Label htmlFor="group-title">Tên nhóm</Label>
            <Input
              id="group-title"
              placeholder="VD: Nhóm Housekeeping Lầu 1-5"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Group Type */}
          <div className="space-y-2">
            <Label>Loại nhóm (ai sẽ đọc?) *</Label>
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
            <Label>Loại thông báo nhận</Label>
            <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg">
              {NOTIFICATION_TYPES.map(type => (
                <div key={type.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={`notif-${type.value}`}
                    checked={notificationTypes.includes(type.value)}
                    onCheckedChange={() => handleNotificationTypeToggle(type.value)}
                  />
                  <Label
                    htmlFor={`notif-${type.value}`}
                    className="text-sm font-normal cursor-pointer flex items-center gap-1"
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                  </Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Để trống = nhận tất cả loại thông báo
            </p>
          </div>

          {/* Hotel */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Khách sạn
            </Label>
            {selectedHotel && !isAllHotelsMode ? (
              <div className="p-2 border rounded-lg bg-muted text-sm flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                {selectedHotel.name}
              </div>
            ) : (
              <div className="p-2 border rounded-lg bg-amber-50 dark:bg-amber-900/20 text-sm text-amber-700 dark:text-amber-400">
                Tất cả khách sạn (nhận thông báo từ mọi khách sạn)
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Chọn khách sạn trong menu trên để gắn nhóm với khách sạn cụ thể
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!chatId.trim() || isLoading}
          >
            {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Thêm nhóm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export { DEPARTMENTS, GROUP_TYPES, NOTIFICATION_TYPES }
