import { useState, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useCreateService, useUpdateService } from '@/hooks/useHotelServices'
import type { HotelService, ServiceCategory } from '@/types/services.types'
import { SERVICE_CATEGORY_LABELS, SERVICE_CATEGORY_ICONS } from '@/types/services.types'

interface ServiceFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  service?: HotelService | null
}

export function ServiceFormDialog({ open, onOpenChange, service }: ServiceFormDialogProps) {
  const isEdit = !!service
  const createService = useCreateService()
  const updateService = useUpdateService()

  const [name, setName] = useState('')
  const [nameEn, setNameEn] = useState('')
  const [category, setCategory] = useState<ServiceCategory>('other')
  const [description, setDescription] = useState('')
  const [unit, setUnit] = useState('lần')
  const [price, setPrice] = useState(0)
  const [icon, setIcon] = useState('🔧')
  const [isActive, setIsActive] = useState(true)

  useEffect(() => {
    if (service) {
      setName(service.name)
      setNameEn(service.name_en || '')
      setCategory(service.category)
      setDescription(service.description || '')
      setUnit(service.unit)
      setPrice(service.price)
      setIcon(service.icon || '🔧')
      setIsActive(service.is_active)
    } else {
      setName('')
      setNameEn('')
      setCategory('other')
      setDescription('')
      setUnit('lần')
      setPrice(0)
      setIcon('🔧')
      setIsActive(true)
    }
  }, [service, open])

  const handleCategoryChange = (val: ServiceCategory) => {
    setCategory(val)
    setIcon(SERVICE_CATEGORY_ICONS[val] || '🔧')
  }

  const handleSubmit = () => {
    if (!name.trim()) return

    const formData = {
      name: name.trim(),
      name_en: nameEn.trim() || undefined,
      category,
      description: description.trim() || undefined,
      unit,
      price,
      is_active: isActive,
      icon,
    }

    if (isEdit && service) {
      updateService.mutate({ ...formData, id: service.id }, {
        onSuccess: () => onOpenChange(false),
      })
    } else {
      createService.mutate(formData, {
        onSuccess: () => onOpenChange(false),
      })
    }
  }

  const isPending = createService.isPending || updateService.isPending

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Chỉnh sửa dịch vụ' : 'Thêm dịch vụ mới'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Tên dịch vụ *</Label>
            <Input className="h-8" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Massage toàn thân" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Tên tiếng Anh</Label>
            <Input className="h-8" value={nameEn} onChange={(e) => setNameEn(e.target.value)} placeholder="Full body massage" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Danh mục *</Label>
              <Select value={category} onValueChange={(v) => handleCategoryChange(v as ServiceCategory)}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(SERVICE_CATEGORY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Đơn vị *</Label>
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger className="h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lần">Lần</SelectItem>
                  <SelectItem value="giờ">Giờ</SelectItem>
                  <SelectItem value="chuyến">Chuyến</SelectItem>
                  <SelectItem value="ngày">Ngày</SelectItem>
                  <SelectItem value="phần">Phần</SelectItem>
                  <SelectItem value="bộ">Bộ</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Giá mặc định (₫) *</Label>
            <Input
              className="h-8"
              type="text"
              inputMode="numeric"
              value={price > 0 ? price.toString() : ''}
              onChange={(e) => setPrice(parseInt(e.target.value.replace(/[^0-9]/g, '')) || 0)}
              placeholder="0"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Mô tả</Label>
            <Textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn gọn về dịch vụ..."
            />
          </div>

          <div className="flex items-center justify-between">
            <Label className="text-xs">Đang hoạt động</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Hủy</Button>
          <Button type="button" size="sm" onClick={handleSubmit} disabled={isPending || !name.trim()}>
            {isPending ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Thêm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
