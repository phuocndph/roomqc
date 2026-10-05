import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { MobileDetailHeader } from '@/components/layout/MobileDetailHeader'
import { useMaintenanceRequest, useAcceptRequest, useStartRequest } from '@/hooks/useMaintenanceRequests'
import { MaintenanceTimeline } from './MaintenanceTimeline'
import { PriorityBadge } from './PriorityBadge'
import { StatusBadge } from './StatusBadge'
import { CompleteRequestDialog } from './CompleteRequestDialog'
import { CancelRequestDialog } from './CancelRequestDialog'
import { UpdateProgressDialog } from './UpdateProgressDialog'
import { PermissionGate } from '@/components/auth/PermissionGate'
import {
  MapPin,
  User,
  UserRoundCog,
  Calendar,
  DollarSign,
  FileText,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Edit,
  Play,
  ClipboardCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { toast } from '@/hooks/use-toast'

const ISSUE_TYPE_LABELS: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  other: 'Khác',
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)

export const MobileMaintenanceRequestDetail = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const { data: request, isLoading, error, refetch } = useMaintenanceRequest(id!)
  const acceptRequest = useAcceptRequest()
  const startRequest = useStartRequest()

  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Chi tiết yêu cầu" showBack />
        <div className="space-y-4 p-4">
          {[...Array(3)].map((_, i) => <Card key={i} className="animate-pulse"><CardContent className="p-4"><div className="h-28 rounded bg-muted" /></CardContent></Card>)}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Chi tiết yêu cầu" showBack />
        <div className="flex flex-col items-center gap-4 p-6 text-center">
          <AlertCircle className="h-9 w-9 text-destructive" />
          <p className="font-medium">Không thể tải yêu cầu bảo trì</p>
          <Button onClick={() => refetch()}><RefreshCw className="mr-2 h-4 w-4" />Thử lại</Button>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <MobileDetailHeader title="Chi tiết yêu cầu" showBack />
        <div className="p-4"><Card><CardContent className="py-12 text-center"><p className="text-muted-foreground">Không tìm thấy yêu cầu</p></CardContent></Card></div>
      </div>
    )
  }

  const status = request.status as 'waiting' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
  const canCancel = status !== 'completed' && status !== 'cancelled'
  const isActionPending = acceptRequest.isPending || startRequest.isPending
  const hasCosts = request.estimated_cost != null || request.actual_cost != null
  const hasCompletion = Boolean(request.solution || request.completion_notes || (request.parts_used && request.parts_used.length > 0))
  const hasPhotos = Boolean((request.photos && request.photos.length > 0) || (request.completion_photos && request.completion_photos.length > 0))

  const handleAccept = async () => {
    try {
      await acceptRequest.mutateAsync(request.id)
      toast({ title: 'Đã tiếp nhận', description: 'Yêu cầu bảo trì đã được tiếp nhận' })
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể tiếp nhận yêu cầu', variant: 'destructive' })
    }
  }

  return (
    <div className="min-h-screen bg-background pb-20">
      <MobileDetailHeader
        title={request.request_code}
        showBack
        action={{ icon: Edit, onClick: () => navigate(`/maintenance/requests/edit/${id}`) }}
      />

      <div className="space-y-4 p-4">
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={status} />
              <PriorityBadge priority={request.priority as 'low' | 'medium' | 'high' | 'urgent'} />
            </div>
            <h1 className="text-xl font-semibold leading-tight">{request.title}</h1>
            <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{request.description || 'Chưa có mô tả.'}</p>
          </CardContent>
        </Card>

        <PermissionGate module="maintenance" action="update">
          {canCancel && (
            <div className="grid grid-cols-2 gap-2">
              {status === 'waiting' && <Button disabled={isActionPending} onClick={handleAccept}><ClipboardCheck className="mr-2 h-4 w-4" />Tiếp nhận</Button>}
              {status === 'pending' && <Button disabled={isActionPending} onClick={() => startRequest.mutate(request.id)}><Play className="mr-2 h-4 w-4" />Bắt đầu</Button>}
              {status === 'in_progress' && <Button variant="outline" onClick={() => setShowUpdateDialog(true)}><FileText className="mr-2 h-4 w-4" />Cập nhật</Button>}
              {status === 'in_progress' && <Button onClick={() => setShowCompleteDialog(true)}><CheckCircle className="mr-2 h-4 w-4" />Hoàn thành</Button>}
              {(status === 'waiting' || status === 'pending') && <Button variant="outline" asChild><Link to={`/maintenance/requests/edit/${id}`}><Edit className="mr-2 h-4 w-4" />Sửa</Link></Button>}
              <Button variant="destructive" className={status === 'in_progress' ? 'col-span-2' : ''} onClick={() => setShowCancelDialog(true)}><XCircle className="mr-2 h-4 w-4" />Hủy yêu cầu</Button>
            </div>
          )}
        </PermissionGate>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Tiến trình</CardTitle></CardHeader>
          <CardContent><MaintenanceTimeline request={request} /></CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Thông tin chính</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-3"><MapPin className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Vị trí</p><p className="font-medium">{request.location || 'Chưa cập nhật'}</p>{request.room && <p className="text-sm text-muted-foreground">Phòng {request.room.room_number}{request.room.floor ? ` - Tầng ${request.room.floor}` : ''}</p>}</div></div>
            <div className="flex items-start gap-3"><FileText className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Loại sự cố</p><p className="font-medium">{ISSUE_TYPE_LABELS[request.issue_type] || request.issue_type}</p></div></div>
            <div className="flex items-start gap-3"><User className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Người báo cáo</p><p className="font-medium">{request.reporter?.full_name || 'Chưa cập nhật'}</p></div></div>
            {request.assignee?.full_name && <div className="flex items-start gap-3"><UserRoundCog className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Người xử lý</p><p className="font-medium">{request.assignee.full_name}</p></div></div>}
            <div className="flex items-start gap-3"><Calendar className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Ngày báo cáo</p><p className="font-medium">{format(new Date(request.reported_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</p></div></div>
            {hasCosts && <div className="flex items-start gap-3"><DollarSign className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Chi phí</p>{request.actual_cost != null ? <p className="font-medium">{formatCurrency(request.actual_cost)} <span className="text-xs font-normal text-muted-foreground">thực tế</span></p> : request.estimated_cost != null ? <p className="font-medium">{formatCurrency(request.estimated_cost)} <span className="text-xs font-normal text-muted-foreground">dự kiến</span></p> : null}</div></div>}
          </CardContent>
        </Card>

        {hasCompletion && <Card><CardHeader className="pb-3"><CardTitle className="text-base">Kết quả xử lý</CardTitle></CardHeader><CardContent className="space-y-3">{request.solution && <p className="whitespace-pre-wrap text-sm leading-6">{request.solution}</p>}{request.completion_notes && <div className="border-t pt-3"><p className="text-xs text-muted-foreground">Ghi chú hoàn thành</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.completion_notes}</p></div>}{request.parts_used && request.parts_used.length > 0 && <div className="border-t pt-3"><p className="text-xs text-muted-foreground">Phụ tùng đã sử dụng</p><ul className="mt-1 list-disc pl-5 text-sm">{request.parts_used.map((part: unknown, index: number) => <li key={index}>{String(part)}</li>)}</ul></div>}</CardContent></Card>}

        {hasPhotos && <Card><CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Hình ảnh</CardTitle></CardHeader><CardContent className="space-y-4">{request.photos && request.photos.length > 0 && <div><p className="mb-2 text-xs text-muted-foreground">Ảnh báo cáo</p><div className="grid grid-cols-3 gap-2">{request.photos.map((photo: string, index: number) => <img key={index} src={photo} alt={`Ảnh báo cáo ${index + 1}`} className="aspect-square w-full rounded-md border object-cover" />)}</div></div>}{request.completion_photos && request.completion_photos.length > 0 && <div className={request.photos && request.photos.length > 0 ? 'border-t pt-4' : ''}><p className="mb-2 text-xs text-muted-foreground">Ảnh hoàn thành</p><div className="grid grid-cols-3 gap-2">{request.completion_photos.map((photo: string, index: number) => <img key={index} src={photo} alt={`Ảnh hoàn thành ${index + 1}`} className="aspect-square w-full rounded-md border object-cover" />)}</div></div>}</CardContent></Card>}
      </div>

      <CompleteRequestDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog} requestId={request.id} />
      <CancelRequestDialog open={showCancelDialog} onOpenChange={setShowCancelDialog} requestId={request.id} />
      <UpdateProgressDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog} requestId={request.id} />
    </div>
  )
}
