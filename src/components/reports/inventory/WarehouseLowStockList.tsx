import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Warehouse, AlertTriangle, ChevronRight, Package } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useState } from 'react'
import type { LowStockByWarehouse } from '@/hooks/useWarehouseReport'
import { cn } from '@/lib/utils'

interface GroupedWarehouse {
  warehouse_id: string
  warehouse_name: string
  warehouse_code: string
  items: LowStockByWarehouse[]
}

interface WarehouseLowStockListProps {
  data: GroupedWarehouse[]
}

export function WarehouseLowStockList({ data }: WarehouseLowStockListProps) {
  const { t } = useTranslation('reports')
  const [openWarehouses, setOpenWarehouses] = useState<Record<string, boolean>>({})

  if (!data?.length) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Package className="h-10 w-10 mx-auto mb-2 opacity-50" />
        <p className="text-sm">{t('warehouse.noLowStock', 'Không có items tồn thấp')}</p>
      </div>
    )
  }

  const toggleWarehouse = (id: string) => {
    setOpenWarehouses((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  return (
    <ScrollArea className="h-72">
      <div className="space-y-2">
        {data.map((warehouse) => (
          <Collapsible
            key={warehouse.warehouse_id}
            open={openWarehouses[warehouse.warehouse_id]}
            onOpenChange={() => toggleWarehouse(warehouse.warehouse_id)}
          >
            <CollapsibleTrigger className="w-full">
              <div className="flex items-center justify-between p-2 rounded-lg border hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-2">
                  <Warehouse className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{warehouse.warehouse_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="destructive" className="text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {warehouse.items.length}
                  </Badge>
                  <ChevronRight
                    className={cn(
                      'h-4 w-4 text-muted-foreground transition-transform',
                      openWarehouses[warehouse.warehouse_id] && 'rotate-90'
                    )}
                  />
                </div>
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="pl-6 py-2 space-y-1">
                {warehouse.items.slice(0, 5).map((item) => (
                  <Link
                    key={item.item_id}
                    to={`/items/${item.item_id}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/50 text-sm"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{item.item_name}</p>
                      <p className="text-xs text-muted-foreground">{item.category_name || '-'}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <span className="text-red-600 font-medium">{item.quantity}</span>
                      <span className="text-muted-foreground">/{item.minimum_stock}</span>
                    </div>
                  </Link>
                ))}
                {warehouse.items.length > 5 && (
                  <p className="text-xs text-muted-foreground py-1 px-2">
                    +{warehouse.items.length - 5} {t('warehouse.moreItems', 'items khác')}
                  </p>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        ))}
      </div>
    </ScrollArea>
  )
}
