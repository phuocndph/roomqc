import { useTranslation } from 'react-i18next'
import { Warehouse, Package, AlertTriangle, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useWarehouseStockReport, useGroupedLowStockByWarehouses } from '@/hooks/useWarehouseReport'
import { WarehouseComparisonChart } from './WarehouseComparisonChart'
import { WarehouseStockTable } from './WarehouseStockTable'
import { WarehouseLowStockList } from './WarehouseLowStockList'
import { formatCurrency } from '@/lib/utils'

export function WarehouseStockTab() {
  const { t } = useTranslation('reports')
  const { data: warehouseSummary, isLoading: isLoadingSummary } = useWarehouseStockReport()
  const { data: lowStockGrouped, isLoading: isLoadingLowStock } = useGroupedLowStockByWarehouses()

  const isLoading = isLoadingSummary || isLoadingLowStock

  // Calculate totals
  const totals = warehouseSummary?.reduce(
    (acc, w) => ({
      warehouses: acc.warehouses + 1,
      items: acc.items + w.total_items,
      quantity: acc.quantity + w.total_quantity,
      value: acc.value + w.total_value,
      lowStock: acc.lowStock + w.low_stock_count,
    }),
    { warehouses: 0, items: 0, quantity: 0, value: 0, lowStock: 0 }
  ) || { warehouses: 0, items: 0, quantity: 0, value: 0, lowStock: 0 }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-80" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (!warehouseSummary?.length) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          <Warehouse className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>{t('warehouse.noData', 'Chưa có dữ liệu kho')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/10 rounded-lg">
                <Warehouse className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('warehouse.totalWarehouses', 'Tổng số kho')}</p>
                <p className="text-2xl font-semibold">{totals.warehouses}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <Package className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('warehouse.totalItems', 'Tổng loại đồ')}</p>
                <p className="text-2xl font-semibold">{totals.items}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/10 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('warehouse.totalValue', 'Tổng giá trị')}</p>
                <p className="text-2xl font-semibold">{formatCurrency(totals.value)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-500/10 rounded-lg">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('warehouse.lowStockItems', 'Tồn kho thấp')}</p>
                <p className="text-2xl font-semibold text-amber-600">{totals.lowStock}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Comparison Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('warehouse.comparisonChart', 'So sánh giữa các kho')}</CardTitle>
        </CardHeader>
        <CardContent>
          <WarehouseComparisonChart data={warehouseSummary} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Warehouse Stock Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('warehouse.stockByWarehouse', 'Tồn kho theo vị trí')}</CardTitle>
          </CardHeader>
          <CardContent>
            <WarehouseStockTable data={warehouseSummary} />
          </CardContent>
        </Card>

        {/* Low Stock Alerts */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('warehouse.lowStockAlerts', 'Cảnh báo tồn kho thấp')}</CardTitle>
          </CardHeader>
          <CardContent>
            <WarehouseLowStockList data={lowStockGrouped || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
