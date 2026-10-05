import { useParams, useNavigate, Link } from 'react-router-dom'
import { useMaintenanceRequest, useAcceptRequest, useStartRequest } from '@/hooks/useMaintenanceRequests'
import { navigateBack } from '@/lib/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PriorityBadge } from '@/components/maintenance/PriorityBadge'
import { StatusBadge } from '@/components/maintenance/StatusBadge'
import { MaintenanceTimeline } from '@/components/maintenance/MaintenanceTimeline'
import { CompleteRequestDialog } from '@/components/maintenance/CompleteRequestDialog'
import { CancelRequestDialog } from '@/components/maintenance/CancelRequestDialog'
import { UpdateProgressDialog } from '@/components/maintenance/UpdateProgressDialog'
import { MobileMaintenanceRequestDetail } from '@/components/maintenance/MobileMaintenanceRequestDetail'
import { toast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { useState } from 'react'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  UserRoundCog,
  Wrench,
  DollarSign,
  FileText,
  Image as ImageIcon,
  Edit,
  Shield,
  XCircle,
  CheckCircle,
  ClipboardCheck,
  RefreshCw,
  AlertCircle,
} from 'lucide-react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useBreakpoint } from '@/lib/breakpoints'
import { PermissionGate } from '@/components/auth/PermissionGate'

const ISSUE_TYPE_LABELS: Record<string, string> = {
  repair: 'Sửa chữa',
  replace: 'Thay thế',
  inspection: 'Kiểm tra',
  cleaning: 'Vệ sinh',
  other: 'Khác',
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value)

export default function MaintenanceRequestDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { data: request, isLoading, error, refetch } = useMaintenanceRequest(id!)
  const acceptRequest = useAcceptRequest()
  const startRequest = useStartRequest()

  const [showCompleteDialog, setShowCompleteDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)

  if (isMobile) {
    return <MobileMaintenanceRequestDetail />
  }

  const handleAcceptRequest = async () => {
    try {
      await acceptRequest.mutateAsync(id!)
      toast({ title: 'Đã tiếp nhận', description: 'Yêu cầu bảo trì đã được tiếp nhận' })
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể tiếp nhận yêu cầu', variant: 'destructive' })
    }
  }

  const handleStartRequest = async () => {
    try {
      await startRequest.mutateAsync(id!)
      toast({ title: 'Đã bắt đầu kiểm tra', description: 'Yêu cầu bảo trì đang được kiểm tra' })
    } catch {
      toast({ title: 'Lỗi', description: 'Không thể bắt đầu kiểm tra yêu cầu', variant: 'destructive' })
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-[420px] w-full" />
          <Skeleton className="h-[420px] w-full" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
        <AlertCircle className="h-10 w-10 text-destructive" />
        <div>
          <p className="font-medium">Không thể tải yêu cầu bảo trì</p>
          <p className="mt-1 text-sm text-muted-foreground">Kiểm tra kết nối hoặc quyền truy cập rồi thử lại.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigateBack(navigate, '/maintenance/requests')}>Quay lại danh sách</Button>
          <Button onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Thử lại
          </Button>
        </div>
      </div>
    )
  }

  if (!request) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-4 text-center">
        <p className="text-muted-foreground">Không tìm thấy yêu cầu bảo trì</p>
        <Button onClick={() => navigateBack(navigate, '/maintenance/requests')}>Quay lại danh sách</Button>
      </div>
    )
  }

  const status = request.status as 'waiting' | 'pending' | 'in_progress' | 'completed' | 'cancelled'
  const hasCosts = request.estimated_cost != null || request.actual_cost != null
  const hasCompletion = Boolean(
    request.solution ||
      request.completion_notes ||
      (request.parts_used && request.parts_used.length > 0),
  )
  const hasPhotos = Boolean(
    (request.photos && request.photos.length > 0) ||
      (request.completion_photos && request.completion_photos.length > 0),
  )
  const isActionPending = acceptRequest.isPending || startRequest.isPending

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-4 sm:p-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
        <Button variant="ghost" size="icon" className="shrink-0" onClick={() => navigateBack(navigate, '/maintenance/requests')} aria-label="Quay lại danh sách">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{request.request_code}</span>
              <StatusBadge status={status} />
              <PriorityBadge priority={request.priority as 'low' | 'medium' | 'high' | 'urgent'} />
            </div>
            <h1 className="mt-2 truncate text-xl font-semibold tracking-tight sm:text-2xl">{request.title}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-4 w-4 shrink-0" />
              {request.room ? `Phòng ${request.room.room_number}${request.room.room_type ? ` - ${request.room.room_type}` : ''}` : request.location}
            </p>
          </div>
        </div>

        <PermissionGate module="maintenance" action="update">
          <div className="flex flex-wrap gap-2 lg:max-w-[520px] lg:justify-end">
            {status === 'waiting' && (
              <>
                <Button size="sm" onClick={handleAcceptRequest} disabled={isActionPending}>
                  <ClipboardCheck className="mr-2 h-4 w-4" />
                  Tiếp nhận
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/maintenance/requests/edit/${id}`}><Edit className="mr-2 h-4 w-4" />Sửa</Link>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setShowCancelDialog(true)}>
                  <XCircle className="mr-2 h-4 w-4" />Hủy
                </Button>
              </>
            )}
            {status === 'pending' && (
              <>
                <Button size="sm" onClick={handleStartRequest} disabled={isActionPending}>
                  <Wrench className="mr-2 h-4 w-4" />
                  Bắt đầu kiểm tra
                </Button>
                <Button size="sm" variant="outline" asChild>
                  <Link to={`/maintenance/requests/edit/${id}`}><Edit className="mr-2 h-4 w-4" />Sửa</Link>
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setShowCancelDialog(true)}>
                  <XCircle className="mr-2 h-4 w-4" />Hủy
                </Button>
              </>
            )}
            {status === 'in_progress' && (
              <>
                <Button size="sm" variant="outline" onClick={() => setShowUpdateDialog(true)}>
                  <FileText className="mr-2 h-4 w-4" />Cập nhật tiến độ
                </Button>
                <Button size="sm" onClick={() => setShowCompleteDialog(true)}>
                  <CheckCircle className="mr-2 h-4 w-4" />Hoàn thành
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setShowCancelDialog(true)}>
                  <XCircle className="mr-2 h-4 w-4" />Hủy
                </Button>
              </>
            )}
          </div>
        </PermissionGate>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Tóm tắt yêu cầu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div><p className="text-xs text-muted-foreground">Loại sự cố</p><p className="mt-1 font-medium">{ISSUE_TYPE_LABELS[request.issue_type] || request.issue_type}</p></div>
                <div><p className="text-xs text-muted-foreground">Vị trí</p><p className="mt-1 font-medium">{request.location || 'Chưa cập nhật'}</p></div>
                <div><p className="text-xs text-muted-foreground">Người báo cáo</p><p className="mt-1 font-medium">{request.reporter?.full_name || 'Chưa cập nhật'}</p></div>
                <div><p className="text-xs text-muted-foreground">Ngày báo cáo</p><p className="mt-1 font-medium">{format(new Date(request.reported_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</p></div>
              </div>

              <div className="rounded-md bg-muted/40 p-4">
                <p className="text-xs font-medium text-muted-foreground">Mô tả sự cố</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6">{request.description || 'Chưa có mô tả.'}</p>
              </div>

              {(request.item || request.notes) && (
                <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
                  {request.item && <div><p className="text-xs text-muted-foreground">Thiết bị liên quan</p><p className="mt-1 font-medium">{request.item.name} ({request.item.code})</p></div>}
                  {request.notes && <div><p className="text-xs text-muted-foreground">Ghi chú</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.notes}</p></div>}
                </div>
              )}
            </CardContent>
          </Card>

          {hasCompletion && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Kết quả xử lý</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {request.solution && <div><p className="text-xs text-muted-foreground">Giải pháp đã áp dụng</p><p className="mt-1 whitespace-pre-wrap text-sm leading-6">{request.solution}</p></div>}
                {request.completion_notes && <div className="border-t pt-4"><p className="text-xs text-muted-foreground">Ghi chú hoàn thành</p><p className="mt-1 whitespace-pre-wrap text-sm">{request.completion_notes}</p></div>}
                {request.parts_used && request.parts_used.length > 0 && <div className="border-t pt-4"><p className="text-xs text-muted-foreground">Phụ tùng đã sử dụng</p><ul className="mt-1 list-disc space-y-1 pl-5 text-sm">{request.parts_used.map((part: unknown, index: number) => <li key={index}>{String(part)}</li>)}</ul></div>}
              </CardContent>
            </Card>
          )}

          {hasPhotos && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4" />Hình ảnh</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {request.photos && request.photos.length > 0 && <div><p className="mb-2 text-xs text-muted-foreground">Ảnh báo cáo</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{request.photos.map((photo: string, index: number) => <img key={index} src={photo} alt={`Ảnh báo cáo ${index + 1}`} className="aspect-square w-full rounded-md border object-cover" />)}</div></div>}
                {request.completion_photos && request.completion_photos.length > 0 && <div className={request.photos && request.photos.length > 0 ? 'border-t pt-4' : ''}><p className="mb-2 text-xs text-muted-foreground">Ảnh hoàn thành</p><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{request.completion_photos.map((photo: string, index: number) => <img key={index} src={photo} alt={`Ảnh hoàn thành ${index + 1}`} className="aspect-square w-full rounded-md border object-cover" />)}</div></div>}
              </CardContent>
            </Card>
          )}
        </main>

        <aside className="min-w-0 space-y-5">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="text-base">Tiến độ & tóm tắt</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <MaintenanceTimeline request={request} />

              <div className="border-t pt-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium"><User className="h-4 w-4 text-muted-foreground" />Người liên quan</div>
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {request.reporter?.avatar_url ? <img src={request.reporter.avatar_url} alt={request.reporter.full_name || 'Người báo cáo'} className="h-8 w-8 rounded-full" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs">{(request.reporter?.full_name || '?').slice(0, 1)}</div>}
                    <div><p className="text-xs text-muted-foreground">Người báo cáo</p><p className="text-sm font-medium">{request.reporter?.full_name || 'Chưa cập nhật'}</p></div>
                  </div>
                  {request.assignee?.full_name && <div className="flex items-center gap-2"><UserRoundCog className="h-8 w-8 rounded-full bg-muted p-2 text-muted-foreground" /><div><p className="text-xs text-muted-foreground">Người xử lý</p><p className="text-sm font-medium">{request.assignee.full_name}</p></div></div>}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium"><Calendar className="h-4 w-4 text-muted-foreground" />Mốc thời gian</div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><span className="text-muted-foreground">Báo cáo</span><span className="text-right font-medium">{format(new Date(request.reported_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span></div>
                  {request.expected_completion_date && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dự kiến</span><span className="text-right font-medium">{format(new Date(request.expected_completion_date), 'dd/MM/yyyy HH:mm', { locale: vi })}</span></div>}
                  {request.started_at && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Bắt đầu</span><span className="text-right font-medium">{format(new Date(request.started_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span></div>}
                  {request.completed_at && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Hoàn thành</span><span className="text-right font-medium">{format(new Date(request.completed_at), 'dd/MM/yyyy HH:mm', { locale: vi })}</span></div>}
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium"><DollarSign className="h-4 w-4 text-muted-foreground" />Chi phí</div>
                {hasCosts ? <div className="space-y-2 text-sm">{request.estimated_cost != null && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Dự kiến</span><span className="font-medium">{formatCurrency(request.estimated_cost)}</span></div>}{request.actual_cost != null && <div className="flex justify-between gap-3"><span className="text-muted-foreground">Thực tế</span><span className="font-medium">{formatCurrency(request.actual_cost)}</span></div>}</div> : <p className="text-sm text-muted-foreground">Chưa có thông tin chi phí</p>}
              </div>

              {request.under_warranty && <div className="border-t pt-4"><div className="mb-2 flex items-center gap-2 text-sm font-medium"><Shield className="h-4 w-4 text-muted-foreground" />Bảo hành</div><Badge variant="secondary">Trong thời gian bảo hành</Badge>{request.warranty_info && <p className="mt-2 text-sm text-muted-foreground">{request.warranty_info}</p>}</div>}
            </CardContent>
          </Card>
        </aside>
      </div>

      <CompleteRequestDialog open={showCompleteDialog} onOpenChange={setShowCompleteDialog} requestId={id!} />
      <CancelRequestDialog open={showCancelDialog} onOpenChange={setShowCancelDialog} requestId={id!} />
      <UpdateProgressDialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog} requestId={id!} />
    </div>
  )
}
