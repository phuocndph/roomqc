import { useState } from 'react'
import { useTranslation, Trans } from 'react-i18next'
import { X, Trash2, RefreshCw, CheckCircle, ClipboardList, ListChecks } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useBulkDeleteRooms, useBulkUpdateRoomStatus, useBulkApplyStandards } from '@/hooks/useBulkRoomActions'
import { useUser } from '@/hooks/useUser'
import { canCreateHousekeepingTask } from '@/lib/userAccess'
import type { RoomStatus } from '@/types/rooms.types'

interface RoomInfo {
  id: string
  room_number: string
  hotel_id: string
}

interface RoomBulkActionsBarProps {
  selectedIds: string[]
  onClearSelection: () => void
  rooms?: RoomInfo[]
}

/**
 * Bulk statuses chia thành 2 nhóm hiển thị trong Select:
 * - Vận hành thường nhật (sạch / bẩn / cần dọn)
 * - Trạng thái đặc biệt (DND, OOO, OOS, ...)
 * Bao gồm option đặc biệt "lift_to_vacant_clean" để Gỡ DND/OOS hàng loạt.
 */
const STATUS_GROUPS: Array<{ label: string; items: Array<{ value: RoomStatus; label: string }> }> = [
  {
    label: 'Vận hành',
    items: [
      { value: 'vacant_clean', label: 'Trống – đã dọn' },
      { value: 'vacant_inspected', label: 'Trống – đã QC' },
      { value: 'vacant_dirty', label: 'Trống – chưa dọn' },
      { value: 'occupied_dirty', label: 'Đang ở – cần dọn' },
      { value: 'occupied_clean', label: 'Đang ở – đã dọn' },
    ],
  },
  {
    label: 'Đặc biệt',
    items: [
      { value: 'dnd', label: 'Không làm phiền (DND)' },
      { value: 'service_refused', label: 'Khách từ chối dọn' },
      { value: 'sleep_out', label: 'Khách ngủ ngoài' },
      { value: 'out_of_order', label: 'Phòng hỏng (OOO)' },
      { value: 'out_of_service', label: 'Tạm ngừng (OOS)' },
    ],
  },
]

const LIFT_OPTION_VALUE = '__lift_to_vacant_clean__'


export function RoomBulkActionsBar({ selectedIds, onClearSelection, rooms = [] }: RoomBulkActionsBarProps) {
  const { t } = useTranslation('rooms')
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showApplyDialog, setShowApplyDialog] = useState(false)
  const [showBulkTaskDialog, setShowBulkTaskDialog] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState<RoomStatus | ''>('')
  const [applyProgress, setApplyProgress] = useState<{ current: number; total: number } | null>(null)
  
  const { user } = useUser()
  const bulkDelete = useBulkDeleteRooms()
  const bulkUpdateStatus = useBulkUpdateRoomStatus()
  const bulkApplyStandards = useBulkApplyStandards()
  
  const canCreateTask = canCreateHousekeepingTask(user)
  
  // Filter rooms that are selected
  const selectedRooms = rooms.filter(r => selectedIds.includes(r.id))

  const handleDelete = () => {
    bulkDelete.mutate(selectedIds, {
      onSuccess: () => {
        setShowDeleteDialog(false)
        onClearSelection()
      },
    })
  }

  const handleStatusChange = (value: string) => {
    // Option "Gỡ DND/OOS" → transition về vacant_clean (Owner/Manager đủ quyền theo RPC)
    const targetStatus: RoomStatus = value === LIFT_OPTION_VALUE ? 'vacant_clean' : (value as RoomStatus)
    setSelectedStatus(targetStatus)
    bulkUpdateStatus.mutate(
      { roomIds: selectedIds, status: targetStatus },
      {
        onSuccess: () => {
          setSelectedStatus('')
          onClearSelection()
        },
      }
    )
  }


  const handleApplyStandards = () => {
    setApplyProgress({ current: 0, total: selectedIds.length })
    bulkApplyStandards.mutate(
      {
        roomIds: selectedIds,
        onProgress: (current, total) => setApplyProgress({ current, total }),
      },
      {
        onSuccess: () => {
          setShowApplyDialog(false)
          setApplyProgress(null)
          onClearSelection()
        },
        onError: () => {
          setApplyProgress(null)
        },
      }
    )
  }

  if (selectedIds.length === 0) return null

  return (
    <>
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-lg border bg-primary/5 p-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            <span className="font-medium">
              <Trans 
                i18nKey="bulkActions.selected" 
                ns="rooms"
                values={{ count: selectedIds.length }}
                components={{ 1: <span className="text-primary" /> }}
              />
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearSelection}
            className="h-8 px-2"
          >
            <X className="h-4 w-4" />
            <span className="ml-1">{t('bulkActions.clear')}</span>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          {/* Status change */}
          <Select
            value={selectedStatus}
            onValueChange={handleStatusChange}
            disabled={bulkUpdateStatus.isPending}
          >
            <SelectTrigger className="w-[220px] bg-background">
              <RefreshCw className={`mr-2 h-4 w-4 ${bulkUpdateStatus.isPending ? 'animate-spin' : ''}`} />
              <SelectValue placeholder={t('bulkActions.changeStatus')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={LIFT_OPTION_VALUE} className="font-medium text-emerald-700">
                ↺ Gỡ DND / OOS · về Trống sạch
              </SelectItem>
              {STATUS_GROUPS.flatMap((group) => [
                <div
                  key={`label-${group.label}`}
                  className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {group.label}
                </div>,
                ...group.items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                )),
              ])}
            </SelectContent>
          </Select>

          {/* Request task button */}
          {canCreateTask && selectedRooms.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowBulkTaskDialog(true)}
            >
              <ClipboardList className="mr-2 h-4 w-4" />
              {t('bulkActions.requestTask', { defaultValue: 'Yêu cầu kiểm tra' })}
            </Button>
          )}

          {/* Apply standards button */}
          <PermissionGate module="rooms" action="update">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowApplyDialog(true)}
              disabled={bulkApplyStandards.isPending}
            >
              <ListChecks className="mr-2 h-4 w-4" />
              {t('bulkActions.applyStandards', { count: selectedIds.length })}
            </Button>
          </PermissionGate>

          {/* Delete button */}
          <PermissionGate module="rooms" action="delete">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setShowDeleteDialog(true)}
              disabled={bulkDelete.isPending}
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('bulkActions.delete', { count: selectedIds.length })}
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('bulkActions.deleteTitle', { count: selectedIds.length })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <Trans 
                  i18nKey="bulkActions.deleteDescription" 
                  ns="rooms"
                  values={{ count: selectedIds.length }}
                  components={{ 1: <strong /> }}
                />
                <br />
                <span className="text-destructive">{t('bulkActions.deleteWarning')}</span>
                <br />
                <span className="text-muted-foreground text-sm">
                  {t('bulkActions.deleteNote')}
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkDelete.isPending}>
              {t('bulkActions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDelete.isPending}
            >
              {bulkDelete.isPending 
                ? t('bulkActions.deleting') 
                : t('bulkActions.deleteConfirm', { count: selectedIds.length })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Apply standards confirmation dialog */}
      <AlertDialog open={showApplyDialog} onOpenChange={(open) => !bulkApplyStandards.isPending && setShowApplyDialog(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('bulkActions.applyStandardsTitle', { count: selectedIds.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('bulkActions.applyStandardsDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {bulkApplyStandards.isPending && applyProgress && (
            <div className="text-sm text-muted-foreground">
              {t('bulkActions.applyStandardsProcessing', {
                current: applyProgress.current,
                total: applyProgress.total,
              })}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkApplyStandards.isPending}>
              {t('bulkActions.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                handleApplyStandards()
              }}
              disabled={bulkApplyStandards.isPending}
            >
              {bulkApplyStandards.isPending
                ? t('bulkActions.applyStandardsProcessing', {
                    current: applyProgress?.current ?? 0,
                    total: applyProgress?.total ?? selectedIds.length,
                  })
                : t('bulkActions.applyStandardsConfirm')}
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
