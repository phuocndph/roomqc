import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { CheckCircle2 } from 'lucide-react'
import type { WarehouseStockSummary } from '@/hooks/useWarehouseReport'
import { formatCurrency, formatNumber } from '@/lib/utils'

interface WarehouseStockTableProps {
  data: WarehouseStockSummary[]
}

export function WarehouseStockTable({ data }: WarehouseStockTableProps) {
  const { t } = useTranslation('reports')

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-2 px-2 font-medium text-muted-foreground">
              {t('warehouse.name', 'Tên kho')}
            </th>
            <th className="text-right py-2 px-2 font-medium text-muted-foreground">
              {t('warehouse.items', 'Loại')}
            </th>
            <th className="text-right py-2 px-2 font-medium text-muted-foreground">
              {t('warehouse.qty', 'SL')}
            </th>
            <th className="text-right py-2 px-2 font-medium text-muted-foreground">
              {t('warehouse.value', 'Giá trị')}
            </th>
            <th className="text-right py-2 px-2 font-medium text-muted-foreground">
              {t('warehouse.low', 'Thấp')}
            </th>
          </tr>
        </thead>
        <tbody>
          {data.map((warehouse) => (
            <tr key={warehouse.warehouse_id} className="border-b last:border-0 hover:bg-muted/50">
              <td className="py-2 px-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{warehouse.warehouse_name}</span>
                  {warehouse.is_default && (
                    <Badge variant="secondary" className="text-xs py-0 px-1.5">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      {t('warehouse.default', 'Mặc định')}
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{warehouse.warehouse_code}</span>
              </td>
              <td className="py-2 px-2 text-right">{formatNumber(warehouse.total_items)}</td>
              <td className="py-2 px-2 text-right">{formatNumber(warehouse.total_quantity)}</td>
              <td className="py-2 px-2 text-right">{formatCurrency(warehouse.total_value)}</td>
              <td className="py-2 px-2 text-right">
                {warehouse.low_stock_count > 0 ? (
                  <span className="text-amber-600 font-medium">{warehouse.low_stock_count}</span>
                ) : (
                  <span className="text-green-600">0</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
