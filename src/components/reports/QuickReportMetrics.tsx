import { Download, Upload, Shirt, DollarSign, AlertTriangle, CheckCircle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

interface QuickReportMetricsProps {
  data?: {
    inbound: {
      count: number
      items: number
      value: number
    }
    outbound: {
      count: number
      items: number
      value: number
    }
    laundry: {
      batches: number
      items: number
      cost: number
    }
    alerts: {
      lowStock: number
      pendingAdjustments: number
    }
  }
  period: 'today' | 'week' | 'month'
  isLoading?: boolean
}

export function QuickReportMetrics({ data, period, isLoading }: QuickReportMetricsProps) {
  if (isLoading || !data) {
    return (
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    )
  }
  
  const periodLabel = {
    today: 'hôm nay',
    week: 'tuần này',
    month: 'tháng này',
  }[period]
  
  const totalCost = data.laundry.cost
  
  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid gap-4 md:grid-cols-4">
        {/* Inbound */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="rounded-full p-2 bg-green-50">
                <Download className="h-5 w-5 text-green-600" />
              </div>
              <Badge variant="outline" className="text-green-600">
                Nhập kho
              </Badge>
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-2xl font-bold">{data.inbound.count} GD</p>
              <p className="text-sm text-green-600 font-medium">
                +{data.inbound.items} items
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(data.inbound.value)}
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* Outbound */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="rounded-full p-2 bg-blue-50">
                <Upload className="h-5 w-5 text-blue-600" />
              </div>
              <Badge variant="outline" className="text-blue-600">
                Xuất kho
              </Badge>
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-2xl font-bold">{data.outbound.count} GD</p>
              <p className="text-sm text-blue-600 font-medium">
                -{data.outbound.items} items
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(data.outbound.value)}
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* Laundry */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="rounded-full p-2 bg-cyan-50">
                <Shirt className="h-5 w-5 text-cyan-600" />
              </div>
              <Badge variant="outline" className="text-cyan-600">
                Giặt gửi
              </Badge>
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-2xl font-bold">{data.laundry.batches} lô</p>
              <p className="text-sm text-cyan-600 font-medium">
                {data.laundry.items} items
              </p>
              <p className="text-xs text-muted-foreground">
                {formatCurrency(data.laundry.cost)}
              </p>
            </div>
          </CardContent>
        </Card>
        
        {/* Total Cost */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="rounded-full p-2 bg-purple-50">
                <DollarSign className="h-5 w-5 text-purple-600" />
              </div>
              <Badge variant="outline" className="text-purple-600">
                Chi phí
              </Badge>
            </div>
            <div className="mt-4 space-y-1">
              <p className="text-2xl font-bold">{formatCurrency(totalCost)}</p>
              <p className="text-sm text-muted-foreground">
                {periodLabel}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Alerts Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {data.alerts.lowStock > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-bold">{data.alerts.lowStock}</span> items tồn kho thấp
            </AlertDescription>
          </Alert>
        )}
        
        {data.alerts.pendingAdjustments > 0 && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <span className="font-bold">{data.alerts.pendingAdjustments}</span> phiếu kiểm kê chờ duyệt
            </AlertDescription>
          </Alert>
        )}
        
        {data.alerts.lowStock === 0 && data.alerts.pendingAdjustments === 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              ✓ Không có cảnh báo {periodLabel}
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  )
}
