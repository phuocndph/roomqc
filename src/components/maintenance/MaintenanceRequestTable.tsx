import { useState } from 'react'
import { Link } from 'react-router-dom'
import { MoreHorizontal, Wrench } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CompleteRequestDialog } from './CompleteRequestDialog'
import { CancelRequestDialog } from './CancelRequestDialog'
import { StatusBadge } from './StatusBadge'
import { PriorityBadge } from './PriorityBadge'
import { PermissionGate } from '@/components/auth/PermissionGate'
import {
  useStartRequest,
  useAcceptRequest,
} from '@/hooks/useMaintenanceRequests'
import { toast } from '@/hooks/use-toast'

interface MaintenanceRequestTableProps {
  requests: any[]
  isLoading?: boolean
}
const issueTypes: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  other: 'Khác',
}

export const MaintenanceRequestTable = ({
  requests,
  isLoading,
}: MaintenanceRequestTableProps) => {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [dialog, setDialog] = useState<'complete' | 'cancel' | null>(null)
  const startRequest = useStartRequest()
  const acceptRequest = useAcceptRequest()
  const pending = startRequest.isPending || acceptRequest.isPending
  const handleAction = async (id: string, accept: boolean) => {
    try {
      await (accept ? acceptRequest : startRequest).mutateAsync(id)
      toast({ title: accept ? 'Đã tiếp nhận yêu cầu' : 'Đã bắt đầu xử lý' })
    } catch {
      toast({
        title: 'Không thể cập nhật yêu cầu',
        description: 'Vui lòng thử lại.',
        variant: 'destructive',
      })
    }
  }
  const openDialog = (id: string, next: 'complete' | 'cancel') => {
    setSelectedId(id)
    setDialog(next)
  }

  if (isLoading)
    return (
      <div className="space-y-3 rounded-lg border p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    )
  if (!requests.length)
    return (
      <div className="rounded-lg border bg-card px-4 py-12 text-center">
        <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="font-medium">Không có yêu cầu phù hợp</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Chọn nhóm khác hoặc xóa bộ lọc để xem thêm.
        </p>
      </div>
    )

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50 hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-900">
            <TableHead>Sự cố</TableHead>
            <TableHead>Vị trí</TableHead>
            <TableHead>Ưu tiên</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Người báo cáo</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((request) => (
            <TableRow
              key={request.id}
              className="hover:bg-slate-50 dark:hover:bg-slate-800/60"
            >
              <TableCell className="max-w-[320px]">
                <Link
                  to={`/maintenance/requests/${request.id}`}
                  className="block font-semibold underline-offset-4 hover:underline"
                >
                  {request.title}
                </Link>
                <p className="mt-1 text-xs text-muted-foreground">
                  {request.request_code} ·{' '}
                  {issueTypes[request.issue_type] || request.issue_type}
                </p>
              </TableCell>
              <TableCell className="max-w-[170px] break-words">
                {request.room
                  ? `Phòng ${request.room.room_number}`
                  : request.location || 'Chưa cập nhật'}
              </TableCell>
              <TableCell>
                <PriorityBadge priority={request.priority} />
              </TableCell>
              <TableCell>
                <StatusBadge status={request.status} />
              </TableCell>
              <TableCell>
                <p>{request.reporter?.full_name || 'Chưa cập nhật'}</p>
                <p
                  className="mt-1 text-xs text-muted-foreground"
                  title={
                    request.reported_at
                      ? new Date(request.reported_at).toLocaleString('vi-VN')
                      : undefined
                  }
                >
                  {request.reported_at
                    ? formatDistanceToNow(new Date(request.reported_at), {
                        addSuffix: true,
                        locale: vi,
                      })
                    : '—'}
                </p>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-2 whitespace-nowrap">
                  <PermissionGate module="maintenance" action="update">
                    {request.status === 'waiting' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => handleAction(request.id, true)}
                      >
                        Tiếp nhận
                      </Button>
                    )}
                    {request.status === 'pending' && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => handleAction(request.id, false)}
                      >
                        Bắt đầu
                      </Button>
                    )}
                    {request.status === 'in_progress' && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDialog(request.id, 'complete')}
                      >
                        Hoàn thành
                      </Button>
                    )}
                  </PermissionGate>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 hover:bg-slate-100 hover:text-slate-950 dark:hover:bg-slate-800 dark:hover:text-white"
                        aria-label={`Thao tác yêu cầu ${request.request_code}`}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        asChild
                        className="focus:bg-slate-100 focus:text-slate-950 dark:focus:bg-slate-800 dark:focus:text-white"
                      >
                        <Link to={`/maintenance/requests/${request.id}`}>
                          Xem chi tiết
                        </Link>
                      </DropdownMenuItem>
                      <PermissionGate module="maintenance" action="update">
                        {['waiting', 'pending'].includes(request.status) && (
                          <DropdownMenuItem asChild>
                            <Link
                              to={`/maintenance/requests/edit/${request.id}`}
                            >
                              Chỉnh sửa
                            </Link>
                          </DropdownMenuItem>
                        )}
                        {!['completed', 'cancelled'].includes(
                          request.status,
                        ) && (
                          <DropdownMenuItem
                            className="text-red-700 focus:bg-slate-100 focus:text-red-800 dark:text-red-400 dark:focus:bg-slate-800"
                            onClick={() => openDialog(request.id, 'cancel')}
                          >
                            Hủy yêu cầu
                          </DropdownMenuItem>
                        )}
                      </PermissionGate>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedId && (
        <>
          <CompleteRequestDialog
            open={dialog === 'complete'}
            onOpenChange={(open) => {
              if (!open) setDialog(null)
            }}
            requestId={selectedId}
          />
          <CancelRequestDialog
            open={dialog === 'cancel'}
            onOpenChange={(open) => {
              if (!open) setDialog(null)
            }}
            requestId={selectedId}
          />
        </>
      )}
    </div>
  )
}
