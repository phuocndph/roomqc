import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Download, Eye, Loader2 } from 'lucide-react'
import { useReportExport } from '@/hooks/useReportExport'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BatchStatusBadge } from './BatchStatusBadge'
import { useLaundryBatches } from '@/hooks/useLaundryBatches'
import { formatCurrency } from '@/lib/utils'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'

interface VendorBatchHistoryProps {
  vendorId: string
}

export function VendorBatchHistory({ vendorId }: VendorBatchHistoryProps) {
  const { t } = useTranslation(['laundry', 'common'])
  const navigate = useNavigate()
  const [filters, setFilters] = useState({
    status: '',
  })
  const [page, setPage] = useState(1)
  
  const { data, isLoading } = useLaundryBatches(
    { ...filters, vendorId } as any,
    page,
    25
  )
  
  const batches = data?.batches || []
  
  const { exportToExcel, isExporting } = useReportExport()

  const handleExport = () => {
    exportToExcel(
      {
        title: 'Lịch sử lô giặt theo nhà cung cấp',
        dateRange: 'Tất cả',
        summary: {
          total_batches: batches.length,
        },
        tables: [
          {
            title: 'Lịch sử',
            headers: ['Mã lô', 'Ngày gửi', 'Ngày trả thực tế', 'Trạng thái'],
            rows: batches.map(b => [
              b.batch_code,
              b.delivery_date ? new Date(b.delivery_date).toLocaleDateString('vi-VN') : '',
              b.actual_return_date ? new Date(b.actual_return_date).toLocaleDateString('vi-VN') : '',
              b.status,
            ]),
          },
        ],
      },
      'vendor_batch_history'
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('laundry:batchHistory.title')}</CardTitle>
          <div className="flex gap-2">
            <Select
              value={filters.status}
              onValueChange={(value) => setFilters({ ...filters, status: value })}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder={t('laundry:batchHistory.status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">{t('laundry:batchHistory.all')}</SelectItem>
                <SelectItem value="delivered">{t('laundry:batchHistory.delivered')}</SelectItem>
                <SelectItem value="washing">{t('laundry:batchHistory.washing')}</SelectItem>
                <SelectItem value="ready">{t('laundry:batchHistory.ready')}</SelectItem>
                <SelectItem value="received">{t('laundry:batchHistory.received')}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleExport} disabled={isExporting}>
              {isExporting
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <Download className="mr-2 h-4 w-4" />}
              {isExporting ? 'Đang xuất...' : t('laundry:batchHistory.exportExcel')}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div>{t('common:loading')}</div>
        ) : batches.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            {t('laundry:batchHistory.noOrders')}
          </p>
        ) : (
          <div className="rounded-md border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('laundry:batchHistory.columns.batchCode')}</TableHead>
                    <TableHead>{t('laundry:batchHistory.columns.deliveryDate')}</TableHead>
                    <TableHead>{t('laundry:batchHistory.columns.returnDate')}</TableHead>
                    <TableHead className="text-center">{t('laundry:batchHistory.columns.items')}</TableHead>
                    <TableHead className="text-right">{t('laundry:batchHistory.columns.cost')}</TableHead>
                    <TableHead className="text-center">{t('laundry:batchHistory.columns.rating')}</TableHead>
                    <TableHead>{t('laundry:batchHistory.columns.status')}</TableHead>
                    <TableHead className="w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((batch) => (
                    <TableRow
                      key={batch.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => navigate(`/laundry/batches/${batch.id}`)}
                    >
                      <TableCell className="font-medium">{batch.batch_code}</TableCell>
                      <TableCell>
                        {format(new Date(batch.delivery_date), 'dd/MM/yyyy', { locale: vi })}
                      </TableCell>
                      <TableCell>
                        {batch.actual_return_date
                          ? format(new Date(batch.actual_return_date), 'dd/MM/yyyy', { locale: vi })
                          : '-'}
                      </TableCell>
                      <TableCell className="text-center">{batch.total_items}</TableCell>
                      <TableCell className="text-right">
                        {formatCurrency(batch.actual_cost || batch.estimated_cost)}
                      </TableCell>
                      <TableCell className="text-center">
                        {batch.quality_rating ? (
                          <div className="flex items-center justify-center gap-1">
                            <span className="text-yellow-400">★</span>
                            <span>{batch.quality_rating.toFixed(1)}</span>
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <BatchStatusBadge status={batch.status as any} />
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(`/laundry/batches/${batch.id}`)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
