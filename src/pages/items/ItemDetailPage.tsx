import { useParams, useNavigate, Link } from 'react-router-dom'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, ArrowLeft, Check, Copy, Edit, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useItem } from '@/hooks/useItems'
import { navigateBack } from '@/lib/navigation'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { QRCodeDisplay } from '@/components/shared/QRCodeDisplay'
import { MobileItemDetailPage } from '@/components/items/MobileItemDetailPage'
import { useBreakpoint } from '@/lib/breakpoints'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { toast } from 'sonner'

export default function ItemDetailPage() {
  const { t } = useTranslation(['items', 'common', 'inventory'])
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { data, isLoading } = useItem(id)
  const [copied, setCopied] = useState(false)

  if (isMobile) {
    return <MobileItemDetailPage />
  }

  if (isLoading) {
    return (
      <div className="container py-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-96 md:col-span-2" />
          <Skeleton className="h-96" />
        </div>
      </div>
    )
  }

  const detailDataCheck = data as any
  if (!data || !detailDataCheck?.item) {
    return (
      <div className="container py-6">
        <div className="border rounded-lg p-8 flex flex-col items-center justify-center">
          <p className="text-base font-medium">{t('items:notFound')}</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => navigateBack(navigate, '/items')}
          >
            {t('items:backToList')}
          </Button>
        </div>
      </div>
    )
  }

  const detailData = data as any
  const item = detailData.item
  const category = detailData.category
  const hotel = detailData.hotel
  const recentTransactions = detailData.recent_transactions || []
  const roomAllocations = detailData.room_allocations || []

  const stockStatus =
    item.quantity_in_stock === 0 ? 'out_of_stock' :
    item.quantity_in_stock < item.minimum_stock ? 'low_stock' : 'in_stock'

  const stockStatusText = {
    in_stock: { label: t('items:status.inStock'), color: 'text-green-600' },
    low_stock: { label: t('items:status.lowStock'), color: 'text-amber-600' },
    out_of_stock: { label: t('items:status.outOfStock'), color: 'text-red-600' },
  }[stockStatus]

  const formatVnd = (n: number) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

  const stockColor =
    item.quantity_in_stock === 0 ? 'text-red-600' :
    item.quantity_in_stock < item.minimum_stock ? 'text-amber-600' : 'text-foreground'

  const handleCopyQr = async () => {
    if (!item.qr_code) return
    try {
      await navigator.clipboard.writeText(item.qr_code)
      setCopied(true)
      toast.success('Đã sao chép mã QR')
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error('Không thể sao chép mã QR')
    }
  }

  return (
    <div className="container max-w-7xl py-5 md:py-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 shrink-0 gap-1.5 px-2"
            onClick={() => navigateBack(navigate, '/items')}
            aria-label={t('items:backToList')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('common:back', 'Quay lại')}</span>
          </Button>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold leading-tight">{item.name}</h1>
              <Badge variant={stockStatus === 'out_of_stock' ? 'destructive' : 'outline'} className={cn(
                'shrink-0',
                stockStatus === 'in_stock' && 'border-green-200 bg-green-50 text-green-700',
                stockStatus === 'low_stock' && 'border-amber-200 bg-amber-50 text-amber-700'
              )}>
                {stockStatusText.label}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              <span className="font-mono">{item.code}</span>
              {category?.name && <> • {category.name}</>}
              {hotel?.name && <> • {hotel.name}</>}
            </p>
          </div>
        </div>
        <PermissionGate module="items" action="update">
          <Button size="sm" onClick={() => navigate(`/items/${id}/edit`)}>
            <Edit className="mr-2 h-3.5 w-3.5" />
            {t('items:edit')}
          </Button>
        </PermissionGate>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Main */}
        <div className="md:col-span-2 space-y-4">
          {/* Image thumbnails */}
          {item.item_images && item.item_images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {item.item_images.map((img: any, idx: number) => (
                <a
                  key={img.id}
                  href={img.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "relative h-20 w-20 rounded-md overflow-hidden border",
                    img.is_primary && "ring-2 ring-primary"
                  )}
                >
                  <img
                    src={img.url}
                    alt={`${item.name} ${idx + 1}`}
                    className="h-full w-full object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          {stockStatus !== 'in_stock' && (
            <div
              role="alert"
              className={cn(
                'flex items-start gap-3 rounded-lg border px-4 py-3',
                stockStatus === 'out_of_stock'
                  ? 'border-red-200 bg-red-50 text-red-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              )}
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {stockStatus === 'out_of_stock' ? 'Tài sản đã hết trong kho' : 'Tồn kho đang dưới mức tối thiểu'}
                </p>
                <p className="mt-0.5 text-xs opacity-80">
                  Tồn hiện tại {item.quantity_in_stock || 0} {item.unit}; mức tối thiểu {item.minimum_stock || 0} {item.unit}.
                </p>
              </div>
            </div>
          )}

          {/* Inventory KPI */}
          <div className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Tình trạng tồn kho</h2>
              <span className="text-xs text-muted-foreground">Đơn vị: {item.unit}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
              <KpiCell label={t('items:fields.quantityTotal')} value={item.quantity_total} />
              <KpiCell label={t('items:fields.quantityInStock')} value={item.quantity_in_stock} valueClass={stockColor} />
              <KpiCell label={t('items:fields.quantityInUse')} value={item.quantity_in_use} />
              <KpiCell label={t('items:fields.quantityInLaundry')} value={item.quantity_in_laundry} />
              <KpiCell
                label={t('items:fields.quantityDamaged')}
                value={item.quantity_damaged || 0}
                valueClass={item.quantity_damaged > 0 ? 'text-red-600' : 'text-muted-foreground'}
              />
              <KpiCell
                label={t('items:fields.quantityLost')}
                value={item.quantity_lost || 0}
                valueClass={item.quantity_lost > 0 ? 'text-red-600' : 'text-muted-foreground'}
              />
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="transactions" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="transactions">
                {t('items:detail.transactionHistory')} ({recentTransactions.length})
              </TabsTrigger>
              <TabsTrigger value="rooms">
                {t('items:detail.roomAllocation')} ({roomAllocations.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transactions" className="mt-3">
              <div className="border rounded-lg">
                {recentTransactions.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {t('items:detail.noTransactions')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('items:detail.transactionCode')}</TableHead>
                          <TableHead>{t('items:detail.type')}</TableHead>
                          <TableHead className="text-right">{t('items:fields.quantity')}</TableHead>
                          <TableHead>{t('items:detail.performer')}</TableHead>
                          <TableHead>{t('items:detail.time')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {recentTransactions.map((txn: any) => {
                          const isInbound = txn.transaction_type === 'in'
                          return (
                            <TableRow key={txn.id}>
                              <TableCell className="font-mono text-xs">
                                {txn.transaction_code}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="font-normal">
                                  {txn.transaction_category
                                    ? t(`inventory:category.${txn.transaction_category}`, { defaultValue: txn.transaction_category })
                                    : t(`inventory:type.${txn.transaction_type}`, { defaultValue: txn.transaction_type })}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={cn(
                                  'font-medium',
                                  isInbound ? 'text-green-600' : 'text-amber-600'
                                )}>
                                  {isInbound ? '+' : '-'}{txn.quantity}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm">{txn.created_by_name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(txn.transaction_date), {
                                  addSuffix: true,
                                  locale: vi,
                                })}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="rooms" className="mt-3">
              <div className="border rounded-lg">
                {roomAllocations.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    {t('items:detail.noRoomAllocation')}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('items:detail.room')}</TableHead>
                          <TableHead>{t('items:detail.roomType')}</TableHead>
                          <TableHead className="text-center">{t('items:fields.quantity')}</TableHead>
                          <TableHead>{t('items:detail.lastChecked', { defaultValue: 'Lần kiểm tra cuối' })}</TableHead>
                          <TableHead>{t('items:detail.recentIssues', { defaultValue: 'Vấn đề gần đây' })}</TableHead>
                          <TableHead>{t('items:detail.allocatedAt')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {roomAllocations.map((allocation: any) => {
                          const lastChecked = allocation.last_checked_at
                            ? new Date(allocation.last_checked_at)
                            : null
                          const daysSinceCheck = lastChecked
                            ? Math.floor((Date.now() - lastChecked.getTime()) / (1000 * 60 * 60 * 24))
                            : null
                          const checkColor =
                            !lastChecked ? 'text-muted-foreground' :
                            daysSinceCheck! > 30 ? 'text-amber-600' :
                            'text-foreground'
                          const issuesCount = allocation.recent_issues_count || 0
                          return (
                            <TableRow key={allocation.id}>
                              <TableCell>
                                <Link
                                  to={`/rooms/${allocation.room_id}`}
                                  className="font-medium hover:underline"
                                >
                                  {allocation.room_number}
                                </Link>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {allocation.room_type}
                              </TableCell>
                              <TableCell className="text-center font-medium">
                                {allocation.quantity}
                              </TableCell>
                              <TableCell>
                                <span className={cn('text-sm', checkColor)}>
                                  {lastChecked
                                    ? formatDistanceToNow(lastChecked, { addSuffix: true, locale: vi })
                                    : t('items:detail.neverChecked', { defaultValue: 'Chưa kiểm tra' })}
                                </span>
                              </TableCell>
                              <TableCell>
                                {issuesCount > 0 ? (
                                  <span className="text-sm text-red-600 font-medium">
                                    {t('items:detail.issuesCount', {
                                      count: issuesCount,
                                      defaultValue: `${issuesCount} lần hỏng/mất`,
                                    })}
                                  </span>
                                ) : (
                                  <span className="text-sm text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">
                                {formatDistanceToNow(new Date(allocation.assigned_at), {
                                  addSuffix: true,
                                  locale: vi,
                                })}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar */}
        <div className="space-y-4 md:sticky md:top-4 md:h-fit">
          {/* Info */}
          <div className="border rounded-lg p-4 space-y-2.5">
            <h3 className="text-sm font-semibold mb-3">{t('items:detail.basicInfo')}</h3>

            <InfoRow label={t('items:detail.stockStatus')}>
              <span className={cn('text-sm font-medium', stockStatusText.color)}>
                {stockStatusText.label}
              </span>
            </InfoRow>

            {item.minimum_stock > 0 && (
              <InfoRow label={t('items:detail.minStock')}>
                <span className="text-sm">{item.minimum_stock} {item.unit}</span>
              </InfoRow>
            )}

            {item.reorder_point > 0 && (
              <InfoRow label={t('items:detail.reorderPoint')}>
                <span className="text-sm">{item.reorder_point} {item.unit}</span>
              </InfoRow>
            )}

            <InfoRow label={t('items:fields.unit')}>
              <span className="text-sm">{item.unit}</span>
            </InfoRow>

            <InfoRow label={t('items:fields.unitPrice')}>
              <span className="text-sm font-medium">{formatVnd(item.unit_price)}</span>
            </InfoRow>

            <InfoRow label={t('items:detail.stockValue')}>
              <span className="text-base font-semibold">
                {formatVnd(item.quantity_in_stock * item.unit_price)}
              </span>
            </InfoRow>

            {item.brand && (
              <InfoRow label={t('items:fields.brand')}>
                <span className="text-sm">{item.brand}</span>
              </InfoRow>
            )}

            {item.model && (
              <InfoRow label={t('items:fields.model')}>
                <span className="text-sm">{item.model}</span>
              </InfoRow>
            )}

            {(item.expected_lifetime_days || item.max_wash_cycles) && (
              <div className="pt-3 mt-3 border-t space-y-2.5">
                {item.expected_lifetime_days && (
                  <InfoRow label={t('items:detail.expectedLifetime')}>
                    <span className="text-sm">
                      {t('items:detail.days', { count: item.expected_lifetime_days })}
                    </span>
                  </InfoRow>
                )}
                {item.max_wash_cycles && (
                  <div>
                    <div className="flex justify-between items-center">
                      <span className="text-xs text-muted-foreground">
                        {t('items:detail.washCycles')}
                      </span>
                      <span className="text-sm font-medium">
                        {item.current_wash_cycles} / {item.max_wash_cycles}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{
                          width: `${Math.min((item.current_wash_cycles / item.max_wash_cycles) * 100, 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* QR Code */}
          {item.qr_code && (
            <div className="border rounded-lg p-4">
              <div className="mb-3 flex items-center gap-2">
                <QrCode className="h-4 w-4 text-muted-foreground" />
                <div>
                  <h3 className="text-sm font-semibold">{t('items:detail.qrCode')}</h3>
                  <p className="text-xs text-muted-foreground">Dùng để tra cứu nhanh tài sản</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <QRCodeDisplay value={item.qr_code} size={104} />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="break-all font-mono text-xs text-muted-foreground">{item.qr_code}</p>
                  <Button type="button" variant="outline" size="sm" className="h-8 w-full" onClick={handleCopyQr}>
                    {copied ? <Check className="mr-1.5 h-3.5 w-3.5" /> : <Copy className="mr-1.5 h-3.5 w-3.5" />}
                    {copied ? 'Đã sao chép' : 'Sao chép mã'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCell({
  label,
  value,
  valueClass,
}: {
  label: string
  value: number
  valueClass?: string
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </p>
      <p className={cn('text-2xl font-semibold mt-1', valueClass)}>{value}</p>
    </div>
  )
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}
