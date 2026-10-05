import { useParams, useNavigate, Link } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { useState, useMemo } from 'react'
import { 
  Edit, 
  Printer, 
  Package as PackageIcon,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  DollarSign,
  AlertTriangle,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { BatchStatusBadge } from '@/components/laundry/BatchStatusBadge'
import { BatchStatusTimeline } from '@/components/laundry/BatchStatusTimeline'
import { BatchItemsTable } from '@/components/laundry/BatchItemsTable'
import { PhotoGallery } from '@/components/shared/PhotoGallery'
import { QRCodeDisplay } from '@/components/shared/QRCodeDisplay'
import { UpdateCostDialog } from '@/components/laundry/UpdateCostDialog'
import { PartialReceiveDialog } from '@/components/laundry/PartialReceiveDialog'
import { 
  useLaundryBatch, 
  useUpdateBatchStatus, 
  useUpdateBatchCost,
  useStockInFromLaundry 
} from '@/hooks/useLaundryBatches'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { useBreakpoint } from '@/lib/breakpoints'
import { MobileBatchDetail } from '@/components/laundry/MobileBatchDetail'

export function BatchDetailPage() {
  const { isMobile } = useBreakpoint()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useLaundryBatch(id)
  const [showUpdateCostDialog, setShowUpdateCostDialog] = useState(false)
  const [statusChangeDialog, setStatusChangeDialog] = useState<{ open: boolean; newStatus: string; label: string }>({
    open: false,
    newStatus: '',
    label: ''
  })
  const [stockInDialog, setStockInDialog] = useState(false)
  const [partialReceiveOpen, setPartialReceiveOpen] = useState(false)
  
  const updateStatusMutation = useUpdateBatchStatus()
  const updateCostMutation = useUpdateBatchCost()
  const stockInMutation = useStockInFromLaundry()
  
  // Extract data early for hooks
  const batchData = data as any
  const batch = batchData?.batch
  const vendor = batchData?.vendor
  const items = useMemo(() => batchData?.items ?? [], [batchData?.items])
  const deliveryStaff = batchData?.delivery_staff
  const returnStaff = batchData?.return_staff
  
  // Check if can stock in - hooks must be called before any conditional returns
  const canStockIn = useMemo(() => {
    if (!batch || batch.status !== 'received') return false
    return true // Có thể nhập kho kể cả khi có mất/hỏng vì đã xử lý riêng
  }, [batch])

  const stockInSummary = useMemo(() => {
    if (!batch) return null
    const okCount = items.reduce((sum: number, item: any) => sum + (item.quantity_returned || item.quantity_delivered), 0)
    const lostCount = batch.items_lost || 0
    const damagedCount = batch.items_damaged || 0
    return { okCount, lostCount, damagedCount }
  }, [batch, items])

  if (isMobile) {
    return <MobileBatchDetail />
  }
  
  const handleStatusChange = (newStatus: string) => {
    const statusLabels: Record<string, string> = {
      'ready': 'Sẵn sàng nhận',
      'received': 'Đã nhận về',
      'stocked': 'Đã nhập kho'
    }
    
    setStatusChangeDialog({
      open: true,
      newStatus,
      label: statusLabels[newStatus]
    })
  }
  
  const confirmStatusChange = () => {
    updateStatusMutation.mutate({ batchId: id!, status: statusChangeDialog.newStatus as any })
    setStatusChangeDialog({ open: false, newStatus: '', label: '' })
  }
  
  const handleUpdateCost = (data: { total_weight_kg: number; estimated_cost: number; actual_cost?: number }) => {
    updateCostMutation.mutate(
      { batchId: id!, ...data },
      {
        onSuccess: () => setShowUpdateCostDialog(false)
      }
    )
  }
  
  const handleStockIn = () => {
    setStockInDialog(true)
  }
  
  const confirmStockIn = () => {
    const itemsToStock = items.map((item: any) => ({
      item_id: item.item_id,
      quantity_returned: item.quantity_returned || item.quantity_delivered,
      quantity_lost: item.quantity_lost || 0,
      quantity_damaged: item.quantity_damaged || 0
    }))
    
    stockInMutation.mutate({
      batchId: id!,
      batchCode: batch.batch_code,
      items: itemsToStock
    })
    setStockInDialog(false)
  }
  
  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Skeleton className="h-64 w-full" />
            <Skeleton className="h-96 w-full" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    )
  }
  
  if (!data || !batch) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground" />
        <h3 className="mt-4 text-lg font-semibold">Không tìm thấy lô giặt</h3>
        <Button onClick={() => navigateBack(navigate, '/laundry')} className="mt-4">
          Quay lại danh sách
        </Button>
      </div>
    )
  }
  
  return (
    <div className="space-y-6">
      <PageHeader
        title={batch.batch_code}
        description={`Lô giặt - ${vendor?.name || 'Chưa chọn đơn vị giặt'}`}
      >
        <div className="flex gap-2 flex-wrap">
        <Button variant="outline" onClick={() => navigateBack(navigate, '/laundry')}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Quay lại
          </Button>
          
          <PermissionGate module="laundry" action="update">
            {/* Send Draft Batch Button */}
            {batch.status === 'draft' && (
              <Button onClick={() => navigate(`/laundry?tab=requests&sendBatch=${id}`)}>
                <Edit className="mr-2 h-4 w-4" />
                Gửi đi giặt
              </Button>
            )}
            
            {/* Update Cost Button */}
            {['delivered', 'washing', 'ready'].includes(batch.status) && (
              <Button 
                variant="outline"
                onClick={() => setShowUpdateCostDialog(true)}
              >
                <DollarSign className="mr-2 h-4 w-4" />
                {batch.estimated_cost > 0 ? 'Cập nhật chi phí' : 'Thêm chi phí'}
              </Button>
            )}
            
            {/* Status Change Buttons */}
            {batch.status === 'delivered' && (
              <Button onClick={() => handleStatusChange('ready')}>
                <CheckCircle className="mr-2 h-4 w-4" />
                Đánh dấu sẵn sàng
              </Button>
            )}
            
            {batch.status === 'ready' && (
              <>
                <Button onClick={() => navigate(`/laundry/batches/${id}/receive`)}>
                  <PackageIcon className="mr-2 h-4 w-4" />
                  Nhận đồ về
                </Button>
                <Button variant="outline" onClick={() => setPartialReceiveOpen(true)}>
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Nhận thiếu
                </Button>
              </>
            )}
            
            {(batch.status === 'partially_received' || batch.status === 'compensation_needed') && (
              <Button variant="outline" onClick={() => navigate('/laundry/compensation')}>
                <AlertTriangle className="mr-2 h-4 w-4" />
                Xử lý đền bù
              </Button>
            )}
            
            {batch.status === 'received' && canStockIn && (
              <Button onClick={handleStockIn} disabled={stockInMutation.isPending}>
                <CheckCircle className="mr-2 h-4 w-4" />
                {stockInMutation.isPending ? 'Đang nhập...' : 'Nhập vào kho'}
              </Button>
            )}
          </PermissionGate>
        </div>
      </PageHeader>
      
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - 2/3 */}
        <div className="space-y-6 lg:col-span-2">
          {/* Status Timeline */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Trạng thái</CardTitle>
                <BatchStatusBadge status={batch.status} />
              </div>
            </CardHeader>
            <CardContent>
              <BatchStatusTimeline batch={batch} />
            </CardContent>
          </Card>
          
          {/* Alert for lost/damaged items */}
          {batch.status === 'received' && (batch.items_lost > 0 || batch.items_damaged > 0) && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Không thể nhập kho tự động</AlertTitle>
              <AlertDescription>
                Lô này có {batch.items_lost} items mất và {batch.items_damaged} items hỏng.
                Vui lòng xử lý bồi thường trước khi nhập kho.
              </AlertDescription>
            </Alert>
          )}
          
          {/* Stocked Info */}
          {batch.status === 'stocked' && (
            <Card className="border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle className="text-green-900">Đã nhập kho</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-green-700 mb-3">
                  <CheckCircle className="h-5 w-5" />
                  <span className="font-medium">
                    Đã nhập {batch.total_items} items vào kho
                  </span>
                </div>
                <Button 
                  variant="link" 
                  className="p-0 h-auto text-green-700"
                  onClick={() => navigate('/inventory/transactions?search=' + batch.batch_code)}
                >
                  Xem lịch sử giao dịch kho →
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Draft Batch Notice */}
          {batch.status === 'draft' && (
            <Card className="border-slate-200 bg-slate-50">
              <CardHeader>
                <CardTitle className="text-slate-700">Lô giặt nháp</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-slate-600 mb-4">
                  Lô này đang ở trạng thái nháp. Bạn cần chọn đơn vị giặt và gửi đi để tiếp tục quy trình.
                </p>
                <Button onClick={() => navigate(`/laundry?tab=requests&sendBatch=${id}`)}>
                  <Edit className="mr-2 h-4 w-4" />
                  Gửi đi giặt
                </Button>
              </CardContent>
            </Card>
          )}
          
          {/* Delivery Info - Only show if not draft */}
          {batch.status !== 'draft' && (
            <Card>
              <CardHeader>
                <CardTitle>Thông tin giao hàng</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted-foreground">Đơn vị giặt</dt>
                    <dd className="font-medium">
                      {vendor ? (
                        <Link 
                          to={`/laundry/vendors/${batch.vendor_id}`}
                          className="hover:underline"
                        >
                          {vendor.name}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">Chưa chọn</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Ngày giao</dt>
                    <dd className="font-medium">
                      {batch.delivery_date 
                        ? format(new Date(batch.delivery_date), 'PPP HH:mm', { locale: vi })
                        : <span className="text-muted-foreground">Chưa xác định</span>
                      }
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Người giao</dt>
                    <dd className="flex items-center gap-2">
                      {deliveryStaff ? (
                        <>
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={deliveryStaff.avatar_url || undefined} />
                            <AvatarFallback>
                              {deliveryStaff.full_name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{deliveryStaff.full_name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Người nhận</dt>
                    <dd className="font-medium">{batch.receiver_name || 'N/A'}</dd>
                  </div>
                </dl>
                
                {batch.notes && (
                  <div className="mt-4 pt-4 border-t">
                    <dt className="text-sm text-muted-foreground mb-1">Ghi chú</dt>
                    <dd className="text-sm">{batch.notes}</dd>
                  </div>
                )}
                
                {batch.delivery_photos && batch.delivery_photos.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <dt className="text-sm text-muted-foreground mb-2">Ảnh giao hàng</dt>
                    <PhotoGallery photos={batch.delivery_photos} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Return Info (if received) */}
          {batch.status === 'received' && (
            <Card>
              <CardHeader>
                <CardTitle>Thông tin nhận hàng</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-4">
                  <div>
                    <dt className="text-sm text-muted-foreground">Ngày nhận</dt>
                    <dd className="font-medium">
                      {batch.actual_return_date &&
                        format(new Date(batch.actual_return_date), 'PPP HH:mm', { locale: vi })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Người nhận</dt>
                    <dd className="flex items-center gap-2">
                      {returnStaff ? (
                        <>
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={returnStaff.avatar_url || undefined} />
                            <AvatarFallback>
                              {returnStaff.full_name?.charAt(0) || '?'}
                            </AvatarFallback>
                          </Avatar>
                          <span className="font-medium">{returnStaff.full_name}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Người giao</dt>
                    <dd className="font-medium">{batch.delivery_person_name || 'N/A'}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Chất lượng</dt>
                    <dd className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={
                            i < (batch.quality_rating || 0)
                              ? 'text-yellow-400'
                              : 'text-muted'
                          }
                        >
                          ★
                        </span>
                      ))}
                      <span className="ml-1 text-sm">
                        {batch.quality_rating}/5
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">Đúng giờ</dt>
                    <dd className="flex items-center gap-1">
                      {[...Array(5)].map((_, i) => (
                        <span
                          key={i}
                          className={
                            i < (batch.timeliness_rating || 0)
                              ? 'text-yellow-400'
                              : 'text-muted'
                          }
                        >
                          ★
                        </span>
                      ))}
                      <span className="ml-1 text-sm">
                        {batch.timeliness_rating}/5
                      </span>
                    </dd>
                  </div>
                </dl>
                
                {batch.return_notes && (
                  <div className="mt-4 pt-4 border-t">
                    <dt className="text-sm text-muted-foreground mb-1">Ghi chú nhận hàng</dt>
                    <dd className="text-sm">{batch.return_notes}</dd>
                  </div>
                )}
                
                {batch.return_photos && batch.return_photos.length > 0 && (
                  <div className="mt-4 pt-4 border-t">
                    <dt className="text-sm text-muted-foreground mb-2">Ảnh nhận hàng</dt>
                    <PhotoGallery photos={batch.return_photos} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Issues (if any) */}
          {batch.status === 'received' && (batch.items_lost > 0 || batch.items_damaged > 0) && (
            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">Vấn đề phát hiện</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {batch.items_lost > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-red-50 p-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-600" />
                        <span className="font-medium">Items mất</span>
                      </div>
                      <span className="text-lg font-bold text-red-600">
                        {batch.items_lost}
                      </span>
                    </div>
                  )}
                  
                  {batch.items_damaged > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-orange-50 p-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-orange-600" />
                        <span className="font-medium">Items hư hỏng</span>
                      </div>
                      <span className="text-lg font-bold text-orange-600">
                        {batch.items_damaged}
                      </span>
                    </div>
                  )}
                  
                  {batch.compensation_amount > 0 && (
                    <div className="flex items-center justify-between rounded-lg bg-gray-100 p-3">
                      <span className="font-medium">Tổng bồi thường</span>
                      <span className="text-lg font-bold">
                        {formatCurrency(batch.compensation_amount)}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        
        {/* Right Column - 1/3 */}
        <div className="space-y-6">
          {/* Cost Card */}
          <Card>
            <CardHeader>
              <CardTitle>Chi phí</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-muted-foreground">Ước tính</span>
                <span className="font-medium">
                  {batch.estimated_cost > 0 
                    ? formatCurrency(batch.estimated_cost)
                    : <span className="text-muted-foreground italic">Chưa cập nhật</span>
                  }
                </span>
              </div>
              
              {batch.actual_cost && (
                <>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Thực tế</span>
                    <span className="font-medium">{formatCurrency(batch.actual_cost)}</span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Chênh lệch</span>
                    <span className={
                      batch.actual_cost > batch.estimated_cost
                        ? 'text-red-600'
                        : 'text-green-600'
                    }>
                      {batch.actual_cost > batch.estimated_cost ? '+' : ''}
                      {formatCurrency(batch.actual_cost - batch.estimated_cost)}
                    </span>
                  </div>
                </>
              )}
              
              {batch.compensation_amount > 0 && (
                <>
                  <div className="border-t pt-3"></div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Bồi thường</span>
                    <span className="font-medium text-red-600">
                      -{formatCurrency(batch.compensation_amount)}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-lg font-bold">
                    <span>Thành tiền</span>
                    <span>
                      {formatCurrency((batch.actual_cost || batch.estimated_cost) - batch.compensation_amount)}
                    </span>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
          
          {/* QR Code Card */}
          <Card>
            <CardHeader>
              <CardTitle>Mã QR</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <div className="rounded-lg border p-4 bg-white">
                <QRCodeDisplay value={batch.batch_code} size={160} />
              </div>
              <p className="text-center text-sm text-muted-foreground">
                Quét mã này khi nhận đồ về
              </p>
            </CardContent>
          </Card>
          
          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Thao tác</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {batch.status === 'ready' && (
                <Button
                  className="w-full"
                  onClick={() => navigate(`/laundry/batches/${id}/receive`)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Nhận đồ về
                </Button>
              )}
              
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.print()}
              >
                <Printer className="mr-2 h-4 w-4" />
                In phiếu
              </Button>
              
              {/* General batch editing is not available yet. Keep this card limited
                  to actions that have a real handler so users never hit a dead link. */}
            </CardContent>
          </Card>
        </div>
      </div>
      
      {/* Items Table */}
      <Card>
        <CardHeader>
          <CardTitle>Chi tiết đồ giặt</CardTitle>
        </CardHeader>
        <CardContent>
          <BatchItemsTable items={items} batchStatus={batch.status} />
        </CardContent>
      </Card>
      
      {/* Update Cost Dialog */}
      <UpdateCostDialog
        open={showUpdateCostDialog}
        onOpenChange={setShowUpdateCostDialog}
        batch={{
          id: batch.id,
          batch_code: batch.batch_code,
          total_weight_kg: batch.total_weight_kg,
          estimated_cost: batch.estimated_cost,
          actual_cost: batch.actual_cost
        }}
        onUpdate={handleUpdateCost}
        isPending={updateCostMutation.isPending}
      />
      
      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={statusChangeDialog.open} onOpenChange={(open) => !open && setStatusChangeDialog({ open: false, newStatus: '', label: '' })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận chuyển trạng thái</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn chuyển sang trạng thái <strong>"{statusChangeDialog.label}"</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStatusChange}>
              Xác nhận
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Stock In Confirmation Dialog */}
      <AlertDialog open={stockInDialog} onOpenChange={setStockInDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận nhập kho</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>Bạn có chắc chắn muốn nhập kho lô hàng này?</p>
                {stockInSummary && (
                  <div className="rounded-md bg-muted p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Items OK:</span>
                      <span className="font-semibold text-green-600">{stockInSummary.okCount}</span>
                    </div>
                    {stockInSummary.lostCount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Items mất (sẽ ghi nhận xuất kho):</span>
                        <span className="font-semibold text-red-600">{stockInSummary.lostCount}</span>
                      </div>
                    )}
                    {stockInSummary.damagedCount > 0 && (
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Items hỏng (sẽ ghi nhận xuất kho):</span>
                        <span className="font-semibold text-orange-600">{stockInSummary.damagedCount}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Huỷ</AlertDialogCancel>
            <AlertDialogAction onClick={confirmStockIn}>
              Xác nhận nhập kho
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PartialReceiveDialog
        open={partialReceiveOpen}
        onOpenChange={setPartialReceiveOpen}
        batchId={id || ''}
        items={items.map((it: any) => ({
          item_id: it.item_id,
          item_name: it.item_name || it.item_code || '—',
          quantity_sent: it.quantity ?? 0,
        }))}
      />
    </div>
  )
}
