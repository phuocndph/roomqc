import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Package, Truck, CheckCircle, DollarSign, Clock, Warehouse, FileText, Send } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { BatchStatusBadge } from '@/components/laundry/BatchStatusBadge'
import { useLaundryBatch, useUpdateBatchStatus, useStockInFromLaundry } from '@/hooks/useLaundryBatches'
import { formatCurrency, formatDate } from '@/lib/utils'
import { format } from 'date-fns'
import { vi, enUS } from 'date-fns/locale'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { navigateBack } from '@/lib/navigation'

export function MobileBatchDetail() {
  const { t, i18n } = useTranslation('laundry')
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useLaundryBatch(id)
  const updateStatusMutation = useUpdateBatchStatus()
  const stockInMutation = useStockInFromLaundry()
  const dateLocale = i18n.language === 'vi' ? vi : enUS

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">{t('batchDetail.batchNotFound')}</p>
        </div>
      </div>
    )
  }

  const batchData = data as any
  const batch = batchData?.batch
  const vendor = batchData?.vendor
  const items = batchData?.items || []
  const deliveryStaff = batchData?.delivery_staff
  const returnStaff = batchData?.return_staff

  const statusSteps = [
    { status: 'draft', label: t('batchDetail.timeline.draft', 'Nháp'), icon: FileText, date: batch.created_at },
    { status: 'delivered', label: t('batchDetail.timeline.delivered'), icon: Truck, date: batch.delivery_date },
    { status: 'washing', label: t('batchDetail.timeline.washing'), icon: Package, date: null },
    { status: 'ready', label: t('batchDetail.timeline.ready'), icon: CheckCircle, date: null },
    { status: 'received', label: t('batchDetail.timeline.received'), icon: CheckCircle, date: batch.actual_return_date },
    { status: 'stocked', label: t('batchDetail.timeline.stocked'), icon: CheckCircle, date: null }
  ]

  // For draft, only show first step; for others, filter out draft step
  const displaySteps = batch.status === 'draft' 
    ? statusSteps.slice(0, 1)
    : statusSteps.filter(s => s.status !== 'draft')

  const currentStatusIndex = displaySteps.findIndex(s => s.status === batch.status)

  const handleStatusChange = (newStatus: string) => {
    updateStatusMutation.mutate({ batchId: id!, status: newStatus as any })
  }

  const handleStockIn = () => {
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
  }

  const showActionBar = ['draft', 'delivered', 'ready', 'received'].includes(batch.status)

  return (
    <div className={`min-h-screen bg-background ${showActionBar ? 'pb-24' : 'pb-20'}`}>
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" aria-label="Quay lại" onClick={() => navigateBack(navigate, '/laundry')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{batch.batch_code}</h1>
            <p className="text-sm text-muted-foreground">
              {vendor?.name || t('batchDetail.noVendorSelected', 'Chưa chọn đơn vị giặt')}
            </p>
          </div>
          <BatchStatusBadge status={batch.status} />
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-80px)]">
        <div className="p-4 space-y-4">
          {/* Status Timeline */}
          <Card className="p-4">
            <h3 className="font-semibold mb-4">{t('batchDetail.progress')}</h3>
            <div className="space-y-3">
              {displaySteps.map((step, index) => (
                <div key={step.status} className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    index <= currentStatusIndex ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    <step.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <p className={`font-medium ${index <= currentStatusIndex ? '' : 'text-muted-foreground'}`}>
                      {step.label}
                    </p>
                    {step.date && (
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(step.date), 'dd/MM/yyyy HH:mm', { locale: dateLocale })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Draft Notice */}
          {batch.status === 'draft' && (
            <Card className="p-4 bg-slate-50 border-slate-200">
              <p className="text-sm text-slate-600 mb-3">
                {t('batchDetail.draftNotice', 'Lô này đang ở trạng thái nháp. Bạn cần chọn đơn vị giặt và gửi đi để tiếp tục quy trình.')}
              </p>
            </Card>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('batchDetail.totalItems')}</p>
                  <p className="text-2xl font-bold">{batch.total_items}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('batchDetail.weight')}</p>
                  <p className="text-2xl font-bold">{batch.total_weight_kg} {t('units.kg')}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('batchDetail.estimatedCost')}</p>
                  <p className="text-lg font-bold">{formatCurrency(batch.estimated_cost || 0)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">{t('batchDetail.actualCost')}</p>
                  <p className="text-lg font-bold">{formatCurrency(batch.actual_cost || 0)}</p>
                </div>
                <DollarSign className="h-8 w-8 text-green-600" />
              </div>
            </Card>
          </div>

          {/* Vendor Info - only show if vendor exists */}
          {vendor && (
            <Card className="p-4">
              <h3 className="font-semibold mb-3">{t('batchDetail.vendor')}</h3>
              <div className="flex items-center gap-3 mb-3">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={vendor.logo_url} alt={vendor.name} />
                  <AvatarFallback>{vendor.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{vendor.name}</p>
                  <p className="text-sm text-muted-foreground">{vendor.phone}</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('batchDetail.type')}:</span>
                  <span>{vendor.type === 'external' ? t('batchDetail.external') : t('batchDetail.internal')}</span>
                </div>
                {vendor.rating && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('batchDetail.rating')}:</span>
                    <span>⭐ {vendor.rating.toFixed(1)}</span>
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Dates - only show if delivery_date exists */}
          {batch.delivery_date && (
            <Card className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  {t('batchDetail.deliveryDate')}
                </span>
                <span className="font-medium">{formatDate(batch.delivery_date)}</span>
              </div>
              {batch.expected_return_date && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    {t('batchDetail.expectedReturn')}
                  </span>
                  <span className="font-medium">{formatDate(batch.expected_return_date)}</span>
                </div>
              )}
              {batch.actual_return_date && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    {t('batchDetail.actualReturn')}
                  </span>
                  <span className="font-medium">{formatDate(batch.actual_return_date)}</span>
                </div>
              )}
            </Card>
          )}

          {/* Items List */}
          <Card className="p-4">
            <h3 className="font-semibold mb-3">{t('batchDetail.itemsList')} ({items.length})</h3>
            <div className="space-y-2">
              {items.map((item: any, index: number) => (
                <div key={index} className="flex justify-between items-center p-2 rounded-lg bg-muted/50">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{item.item_name}</p>
                    <p className="text-xs text-muted-foreground">{item.item_code}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{item.quantity_delivered} {item.item_unit}</p>
                    {item.weight_kg && (
                      <p className="text-xs text-muted-foreground">{item.weight_kg} {t('units.kg')}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          {/* Staff Info */}
          {(deliveryStaff || returnStaff) && (
            <Card className="p-4 space-y-3">
              <h3 className="font-semibold">{t('batchDetail.staffInCharge')}</h3>
              {deliveryStaff && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('batchDetail.deliveryStaffLabel')}</p>
                  <p className="font-medium">{deliveryStaff.full_name}</p>
                </div>
              )}
              {returnStaff && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('batchDetail.returnStaffLabel')}</p>
                  <p className="font-medium">{returnStaff.full_name}</p>
                </div>
              )}
            </Card>
          )}

          {/* Notes */}
          {batch.notes && (
            <Card className="p-4">
              <h3 className="font-semibold mb-2">{t('batchDetail.notes')}</h3>
              <p className="text-sm text-muted-foreground">{batch.notes}</p>
            </Card>
          )}
        </div>
      </ScrollArea>

      {/* Sticky Bottom Action Bar */}
      <PermissionGate module="laundry" action="update">
        {showActionBar && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-background border-t safe-area-pb">
            {batch.status === 'draft' && (
              <Button 
                className="w-full" 
                onClick={() => navigate(`/laundry?tab=requests&sendBatch=${id}`)}
              >
                <Send className="mr-2 h-4 w-4" />
                {t('batchDetail.sendToLaundry', 'Gửi đi giặt')}
              </Button>
            )}
            {batch.status === 'delivered' && (
              <Button 
                className="w-full" 
                onClick={() => handleStatusChange('ready')}
                disabled={updateStatusMutation.isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                {updateStatusMutation.isPending ? 'Đang xử lý...' : 'Đánh dấu sẵn sàng'}
              </Button>
            )}
            {batch.status === 'ready' && (
              <Button 
                className="w-full" 
                onClick={() => navigate(`/laundry/batches/${id}/receive`)}
              >
                <Package className="mr-2 h-4 w-4" />
                Nhận đồ về
              </Button>
            )}
            {batch.status === 'received' && (
              <Button 
                className="w-full" 
                onClick={handleStockIn}
                disabled={stockInMutation.isPending}
              >
                <Warehouse className="mr-2 h-4 w-4" />
                {stockInMutation.isPending ? 'Đang nhập kho...' : 'Nhập vào kho'}
              </Button>
            )}
          </div>
        )}
      </PermissionGate>
    </div>
  )
}
