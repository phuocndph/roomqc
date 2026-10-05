import { useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { MoreHorizontal, Wrench, Eye } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CompleteRequestDialog } from './CompleteRequestDialog'
import { CancelRequestDialog } from './CancelRequestDialog'
import { useStartRequest, useAcceptRequest } from '@/hooks/useMaintenanceRequests'
import { toast } from '@/hooks/use-toast'

interface MaintenanceRequestTableProps {
  requests: any[]
  isLoading?: boolean
}

const priorityConfig: Record<string, { color: string; dot: string; label: string }> = {
  urgent: { color: 'text-red-600', dot: 'bg-red-500', label: 'Khẩn cấp' },
  high: { color: 'text-orange-600', dot: 'bg-orange-500', label: 'Cao' },
  medium: { color: 'text-amber-600', dot: 'bg-amber-500', label: 'Trung bình' },
  low: { color: 'text-green-600', dot: 'bg-green-500', label: 'Thấp' },
}

const statusConfig: Record<string, { color: string; dot: string; label: string }> = {
  waiting: { color: 'text-amber-600', dot: 'bg-amber-500', label: 'Chờ tiếp nhận' },
  pending: { color: 'text-blue-600', dot: 'bg-blue-500', label: 'Đã tiếp nhận' },
  in_progress: { color: 'text-purple-600', dot: 'bg-purple-500', label: 'Đang xử lý' },
  completed: { color: 'text-green-600', dot: 'bg-green-500', label: 'Hoàn thành' },
  cancelled: { color: 'text-gray-500', dot: 'bg-gray-400', label: 'Đã hủy' },
}

const issueTypeLabels: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  other: 'Khác',
}

export const MaintenanceRequestTable = ({ requests, isLoading }: MaintenanceRequestTableProps) => {
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null)
  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const startRequest = useStartRequest()
  const acceptRequest = useAcceptRequest()

  const handleAcceptRequest = async (id: string) => {
    try {
      await acceptRequest.mutateAsync(id)
      toast({
        title: 'Đã tiếp nhận',
        description: 'Yêu cầu bảo trì đã được tiếp nhận',
      })
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể tiếp nhận yêu cầu',
        variant: 'destructive',
      })
    }
  }

  const handleStartRequest = async (id: string) => {
    try {
      await startRequest.mutateAsync(id)
      toast({
        title: 'Đã bắt đầu kiểm tra',
        description: 'Yêu cầu bảo trì đang được kiểm tra',
      })
    } catch (error) {
      toast({
        title: 'Lỗi',
        description: 'Không thể bắt đầu kiểm tra yêu cầu',
        variant: 'destructive',
      })
    }
  }

  const handleOpenCompleteDialog = (id: string) => {
    setSelectedRequestId(id)
    setShowCompleteDialog(true)
  }

  const handleOpenCancelDialog = (id: string) => {
    setSelectedRequestId(id)
    setShowCancelDialog(true)
  }

  if (isLoading) {
    return (
      <div className="border rounded-lg">
        <div className="space-y-0">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 border-b last:border-0">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (requests.length === 0) {
    return (
      <div className="border rounded-lg">
        <div className="flex flex-col items-center justify-center py-12">
          <Wrench className="h-8 w-8 text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">Không có yêu cầu bảo trì nào</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border rounded-lg">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Mã yêu cầu</TableHead>
              <TableHead className="text-xs">Độ ưu tiên</TableHead>
              <TableHead className="text-xs">Loại</TableHead>
              <TableHead className="text-xs">Tiêu đề</TableHead>
              <TableHead className="text-xs">Vị trí</TableHead>
              <TableHead className="text-xs">Người báo cáo</TableHead>
              <TableHead className="text-xs">Thời gian</TableHead>
              <TableHead className="text-xs">Trạng thái</TableHead>
              <TableHead className="text-xs text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {requests.map((request: any) => {
              const priority = priorityConfig[request.priority] || priorityConfig.medium
              const status = statusConfig[request.status] || statusConfig.pending
              
              return (
                <TableRow key={request.id} className="hover:bg-muted/30">
                  <TableCell className="py-2">
                    <Link
                      to={`/maintenance/requests/${request.id}`}
                      className="font-mono text-xs font-medium hover:underline"
                    >
                      {request.request_code}
                    </Link>
                  </TableCell>
                  <TableCell className="py-2">
                    <span className={`flex items-center gap-1.5 text-xs ${priority.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${priority.dot}`} />
                      {priority.label}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    {issueTypeLabels[request.issue_type] || request.issue_type}
                  </TableCell>
                  <TableCell className="py-2 max-w-[180px]">
                    <p className="text-sm truncate">{request.title}</p>
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    {request.room ? `P.${request.room.room_number}` : request.location}
                  </TableCell>
                  <TableCell className="py-2 text-xs">
                    {request.reporter?.full_name || 'N/A'}
                  </TableCell>
                  <TableCell className="py-2 text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(request.reported_at), { addSuffix: true, locale: vi })}
                  </TableCell>
                  <TableCell className="py-2">
                    <span className={`flex items-center gap-1.5 text-xs ${status.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </TableCell>
                  <TableCell className="py-2 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-7 w-7"
                        asChild
                       aria-label="Link">
                        <Link to={`/maintenance/requests/${request.id}`}>
                          <Eye className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Thêm tùy chọn">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/maintenance/requests/${request.id}`}>Xem chi tiết</Link>
                          </DropdownMenuItem>
                          {request.status === 'waiting' && (
                            <>
                              <DropdownMenuItem onClick={() => handleAcceptRequest(request.id)}>
                                Tiếp nhận
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/maintenance/requests/edit/${request.id}`}>Sửa</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleOpenCancelDialog(request.id)}
                              >
                                Hủy
                              </DropdownMenuItem>
                            </>
                          )}
                          {request.status === 'pending' && (
                            <>
                              <DropdownMenuItem onClick={() => handleStartRequest(request.id)}>
                                Bắt đầu kiểm tra
                              </DropdownMenuItem>
                              <DropdownMenuItem asChild>
                                <Link to={`/maintenance/requests/edit/${request.id}`}>Sửa</Link>
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleOpenCancelDialog(request.id)}
                              >
                                Hủy
                              </DropdownMenuItem>
                            </>
                          )}
                          {request.status === 'in_progress' && (
                            <>
                              <DropdownMenuItem onClick={() => handleOpenCompleteDialog(request.id)}>
                                Hoàn thành
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-destructive"
                                onClick={() => handleOpenCancelDialog(request.id)}
                              >
                                Hủy
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialogs */}
      {selectedRequestId && (
        <>
          <CompleteRequestDialog
            open={showCompleteDialog}
            onOpenChange={setShowCompleteDialog}
            requestId={selectedRequestId}
          />
          <CancelRequestDialog
            open={showCancelDialog}
            onOpenChange={setShowCancelDialog}
            requestId={selectedRequestId}
          />
        </>
      )}
    </div>
  )
}
