import { useState, useEffect } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Package, User, DoorOpen, Truck, AlertTriangle } from 'lucide-react'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import type { SupplementRequestItem } from '@/hooks/useSupplementRequests'

interface ApproveSupplementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  requestCode: string
  roomNumber: string
  items: SupplementRequestItem[]
  totalValue: number
  hotelId: string
  onConfirm: (assignedTo: string | null) => void
  isPending: boolean
}

export function ApproveSupplementDialog({
  open,
  onOpenChange,
  requestCode,
  roomNumber,
  items,
  totalValue,
  hotelId,
  onConfirm,
  isPending,
}: ApproveSupplementDialogProps) {
  const [selectedStaff, setSelectedStaff] = useState<string>('')
  const { data: staffList = [], isLoading: isLoadingStaff } = useOnShiftStaffList(hotelId)

  const handleConfirm = () => {
    onConfirm(selectedStaff || null)
  }

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '?'
    return name
      .split(' ')
      .map(n => n?.[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5 text-primary" />
            Duyệt & Tạo phiếu giao hàng
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-left">
              {/* Request Info */}
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span>{requestCode}</span>
                </div>
                <div className="flex items-center gap-2">
                  <DoorOpen className="h-4 w-4 text-muted-foreground" />
                  <span>Phòng {roomNumber}</span>
                </div>
              </div>

              {/* Items List */}
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  Items cần giao ({items.length})
                </div>
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {items.map((item, index) => (
                    <div key={`${item.item_id}-${index}`} className="flex justify-between text-sm">
                      <span className="text-foreground">{item.item_name}</span>
                      <span className="text-muted-foreground">x{item.quantity}</span>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-2 pt-2 flex justify-between font-medium text-sm">
                  <span>Tổng giá trị</span>
                  <span className="text-primary">
                    {new Intl.NumberFormat('vi-VN').format(totalValue)}đ
                  </span>
                </div>
              </div>

              {/* Staff Selector */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1">
                  Gán cho nhân viên
                  <span>(đang trong ca)</span>
                </label>
                <Select
                  value={selectedStaff}
                  onValueChange={setSelectedStaff}
                  disabled={isLoadingStaff}
                >
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder={isLoadingStaff ? 'Đang tải...' : 'Chọn nhân viên (không bắt buộc)'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span>Không gán (nhân viên tự nhận)</span>
                      </div>
                    </SelectItem>
                    {staffList.map((staff) => (
                      <SelectItem key={staff.id} value={staff.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={staff.avatar_url} />
                            <AvatarFallback className="text-[10px]">
                              {getInitials(staff.full_name)}
                            </AvatarFallback>
                          </Avatar>
                          <span>{staff.full_name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Warning */}
              <div className="flex items-start gap-2 text-xs text-warning bg-warning/10 p-2 rounded-md">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>
                  Sau khi xác nhận, phiếu giao hàng sẽ được tạo và tồn kho sẽ được trừ khi nhân viên xác nhận lấy đồ.
                </span>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isPending}
            className="gap-2"
          >
            <Truck className="h-4 w-4" />
            {isPending ? 'Đang xử lý...' : 'Tạo phiếu giao hàng'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
