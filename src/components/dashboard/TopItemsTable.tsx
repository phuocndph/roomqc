import { useNavigate } from 'react-router-dom'
import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useTopItems } from '@/hooks/useTopItems'
import { EmptyState } from '@/components/shared/EmptyState'
import { cn } from '@/lib/utils'
import { useTranslation } from 'react-i18next'

export function TopItemsTable() {
  const { t } = useTranslation('dashboard')
  const { data: items, isLoading } = useTopItems(10)
  const navigate = useNavigate()
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }
  
  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('topItems.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Package}
            title={t('topItems.noData', 'Chưa có dữ liệu')}
            description={t('topItems.noDataDesc', 'Chưa có đồ dùng nào được sử dụng')}
          />
        </CardContent>
      </Card>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('topItems.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-16">{t('topItems.image', 'Ảnh')}</TableHead>
                  <TableHead>{t('topItems.name')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('topItems.category', 'Danh mục')}</TableHead>
                  <TableHead className="text-right">{t('topItems.inUse', 'Đang dùng')}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t('topItems.rate', 'Tỷ lệ')}</TableHead>
                  <TableHead className="hidden lg:table-cell">{t('topItems.stock', 'Kho')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow
                    key={item.id}
                    className="cursor-pointer hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                    tabIndex={0}
                    role="button"
                    onClick={() => navigate(`/items/${item.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        navigate(`/items/${item.id}`)
                      }
                    }}
                  >
                    <TableCell className="font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell>
                      {item.thumbnail ? (
                        <img
                          src={item.thumbnail}
                          alt={item.name}
                          className="h-10 w-10 rounded object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-muted">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium leading-none">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.code}</p>
                      </div>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      {item.category_name && (
                        <Badge 
                          variant="outline"
                          style={{ 
                            borderColor: item.category_color || undefined,
                            color: item.category_color || undefined,
                          }}
                        >
                          {item.category_name}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <div className="space-y-1">
                        <div>{item.quantity_in_use}</div>
                        <div className="text-xs text-muted-foreground">
                          / {item.quantity_total}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <Progress 
                          value={item.utilization_rate} 
                          className="h-2 w-20"
                        />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {item.utilization_rate.toFixed(0)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge
                        variant={
                          item.stock_status === 'in_stock'
                            ? 'default'
                            : item.stock_status === 'low_stock'
                            ? 'secondary'
                            : 'destructive'
                        }
                        className={cn(
                          item.stock_status === 'low_stock' && 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200 dark:bg-yellow-950 dark:text-yellow-400'
                        )}
                      >
                        {item.stock_status === 'in_stock' && t('topItems.inStock', 'Đủ hàng')}
                        {item.stock_status === 'low_stock' && t('topItems.lowStock', 'Thấp')}
                        {item.stock_status === 'out_of_stock' && t('topItems.outOfStock', 'Hết')}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
