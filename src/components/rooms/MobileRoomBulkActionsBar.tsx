import { useState } from 'react'
import { X, Trash2, RefreshCw, CheckCircle, ClipboardList } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
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
import { BulkCreateTaskDialog } from '@/components/housekeeping/BulkCreateTaskDialog'
import { useBulkDeleteRooms, useBulkUpdateRoomStatus } from '@/hooks/useBulkRoomActions'
import { useUser } from '@/hooks/useUser'
import { canCreateHousekeepingTask } from '@/lib/userAccess'
import type { RoomStatus } from '@/types/rooms.types'

interface RoomInfo {
  id: string
  room_number: string
  hotel_id: string
}

interface MobileRoomBulkActionsBarProps {
  selectedIds: string[]
  onClearSelection: () => void
  rooms?: RoomInfo[]
}

const statusOptions: { value: RoomStatus; label: string; color: string }[] = [
  { value: 'vacant', label: 'Trống', color: 'bg-green-100 text-green-700 border-green-200' },
  { value: 'occupied', label: 'Đang ở', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  { value: 'check_in', label: 'Check In', color: 'bg-purple-100 text-purple-700 border-purple-200' },
  { value: 'check_out', label: 'Check Out', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
  { value: 'cleaning', label: 'Đang dọn', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  { value: 'maintenance', label: 'Bảo trì', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  { value: 'out_of_order', label: 'Hỏng', color: 'bg-red-100 text-red-700 border-red-200' },
]

export function MobileRoomBulkActionsBar({ selectedIds, onClearSelection, rooms = [] }: MobileRoomBulkActionsBarProps) {
  const [showStatusSheet, setShowStatusSheet] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showBulkTaskDialog, setShowBulkTaskDialog] = useState(false)
  
  const { user } = useUser()
  const bulkDelete = useBulkDeleteRooms()
  const bulkUpdateStatus = useBulkUpdateRoomStatus()
  
  const canCreateTask = canCreateHousekeepingTask(user)
  const selectedRooms = rooms.filter(r => selectedIds.includes(r.id))

  const handleDelete = () => {
    bulkDelete.mutate(selectedIds, {
      onSuccess: () => {
        setShowDeleteDialog(false)
        onClearSelection()
      },
    })
  }

  const handleStatusChange = (status: RoomStatus) => {
    bulkUpdateStatus.mutate(
      { roomIds: selectedIds, status },
      {
        onSuccess: () => {
          setShowStatusSheet(false)
          onClearSelection()
        },
      }
    )
  }

  if (selectedIds.length === 0) return null

  return (
    <>
      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-16 left-0 right-0 z-50 bg-background border-t shadow-lg p-3 safe-area-inset-bottom">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <span className="font-medium text-sm">
              Đã chọn <span className="text-primary">{selectedIds.length}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={onClearSelection}
             aria-label="Đóng">
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowStatusSheet(true)}
              disabled={bulkUpdateStatus.isPending}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${bulkUpdateStatus.isPending ? 'animate-spin' : ''}`} />
              Đổi TT
            </Button>
            
            {/* Request task button */}
            {canCreateTask && selectedRooms.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkTaskDialog(true)}
              >
                <ClipboardList className="h-4 w-4 mr-1" />
                Yêu cầu
              </Button>
            )}
            
            <PermissionGate module="rooms" action="delete">
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowDeleteDialog(true)}
                disabled={bulkDelete.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Xóa
              </Button>
            </PermissionGate>
          </div>
        </div>
      </div>

      {/* Status Change Sheet */}
      <Sheet open={showStatusSheet} onOpenChange={setShowStatusSheet}>
        <SheetContent side="bottom" className="h-auto max-h-[80vh]">
          <SheetHeader>
            <SheetTitle>Đổi trạng thái {selectedIds.length} phòng</SheetTitle>
            <SheetDescription>
              Chọn trạng thái mới cho các phòng đã chọn
            </SheetDescription>
          </SheetHeader>
          <div className="grid grid-cols-2 gap-3 py-4">
            {statusOptions.map((option) => (
              <Button
                key={option.value}
                variant="outline"
                className={`h-auto py-3 justify-start ${option.color}`}
                onClick={() => handleStatusChange(option.value)}
                disabled={bulkUpdateStatus.isPending}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa {selectedIds.length} phòng</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa <strong>{selectedIds.length}</strong> phòng đã chọn?
              <br />
              <span className="text-destructive">Hành động này không thể hoàn tác.</span>
              <br />
              <span className="text-muted-foreground text-sm">
                Lưu ý: Phòng có đồ dùng hoặc lịch sử kiểm tra sẽ không thể xóa.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDelete.isPending}
            >
              {bulkDelete.isPending ? 'Đang xóa...' : `Xóa ${selectedIds.length} phòng`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk Create Task Dialog */}
      <BulkCreateTaskDialog
        open={showBulkTaskDialog}
        onOpenChange={setShowBulkTaskDialog}
        rooms={selectedRooms}
        onSuccess={onClearSelection}
      />
    </>
  )
}
