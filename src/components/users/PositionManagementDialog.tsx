import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { usePositions, useCreatePosition, useDeletePosition } from '@/hooks/usePositions'
import { Plus, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface PositionManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PositionManagementDialog({ open, onOpenChange }: PositionManagementDialogProps) {
  const { data: positions, isLoading } = usePositions()
  const createPosition = useCreatePosition()
  const deletePosition = useDeletePosition()

  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    user_level_code: 'staff' as 'manager' | 'staff',
    department: '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await createPosition.mutateAsync({
      ...formData,
      display_order: (positions?.length || 0) + 1,
      status: 'active',
    })
    setFormData({
      code: '',
      name: '',
      description: '',
      user_level_code: 'staff',
      department: '',
    })
  }

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc muốn xóa chức vụ này?')) {
      deletePosition.mutate(id)
    }
  }

  const departmentLabels: Record<string, string> = {
    housekeeping: 'Buồng phòng',
    laundry: 'Giặt là',
    inventory: 'Kho',
    maintenance: 'Bảo trì',
    accounting: 'Kế toán',
    other: 'Khác',
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Quản lý chức vụ</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Add new position form */}
          <form onSubmit={handleSubmit} className="space-y-4 p-4 border rounded-lg bg-muted/50">
            <h3 className="font-semibold">Thêm chức vụ mới</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="code">Mã chức vụ *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="vd: accountant"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Tên chức vụ *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="vd: Kế toán"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="level">Cấp độ *</Label>
                <Select
                  value={formData.user_level_code}
                  onValueChange={(value: 'manager' | 'staff') =>
                    setFormData({ ...formData, user_level_code: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manager">Quản lý</SelectItem>
                    <SelectItem value="staff">Nhân viên</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="department">Bộ phận</Label>
                <Select
                  value={formData.department}
                  onValueChange={(value) => setFormData({ ...formData, department: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn bộ phận" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="housekeeping">Buồng phòng</SelectItem>
                    <SelectItem value="laundry">Giặt là</SelectItem>
                    <SelectItem value="inventory">Kho</SelectItem>
                    <SelectItem value="maintenance">Bảo trì</SelectItem>
                    <SelectItem value="accounting">Kế toán</SelectItem>
                    <SelectItem value="other">Khác</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Mô tả</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Mô tả công việc và trách nhiệm..."
              />
            </div>

            <Button type="submit" disabled={createPosition.isPending}>
              <Plus className="h-4 w-4 mr-2" />
              Thêm chức vụ
            </Button>
          </form>

          {/* Existing positions list */}
          <div className="space-y-2">
            <h3 className="font-semibold">Danh sách chức vụ hiện tại</h3>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Đang tải...</p>
            ) : positions && positions.length > 0 ? (
              <div className="space-y-2">
                {positions.map((position) => (
                  <div
                    key={position.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-card"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{position.name}</span>
                        <Badge variant="outline">
                          {position.user_level_code === 'manager' ? 'Quản lý' : 'Nhân viên'}
                        </Badge>
                        {position.department && (
                          <Badge variant="secondary">
                            {departmentLabels[position.department]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Mã: {position.code}
                      </p>
                      {position.description && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {position.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(position.id)}
                      disabled={deletePosition.isPending}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Chưa có chức vụ nào</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
