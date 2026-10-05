import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Package } from 'lucide-react'

interface ItemsPreviewTableProps {
  items: any[]
  isLoading?: boolean
  emptyMessage?: string
}

export function ItemsPreviewTable({ 
  items, 
  isLoading = false, 
  emptyMessage = 'Không có items nào' 
}: ItemsPreviewTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center gap-4 rounded-lg border p-3">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>
    )
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <Package className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg border">
      <div className="max-h-[400px] overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-muted/50 backdrop-blur">
            <tr className="border-b text-sm">
              <th className="px-4 py-3 text-left font-medium">Hình ảnh</th>
              <th className="px-4 py-3 text-left font-medium">Tên item</th>
              <th className="px-4 py-3 text-left font-medium">Danh mục</th>
              <th className="px-4 py-3 text-left font-medium">Tồn kho</th>
              <th className="px-4 py-3 text-left font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                <td className="px-4 py-3">
                  <div className="h-10 w-10 rounded overflow-hidden bg-muted flex items-center justify-center">
                    {item.item_images?.[0]?.url ? (
                      <img
                        src={item.item_images[0].url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <Package className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">{item.code}</p>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {item.category_name && (
                    <Badge 
                      variant="outline" 
                      style={{ 
                        borderColor: item.category_color || 'hsl(var(--border))',
                        color: item.category_color || 'hsl(var(--foreground))'
                      }}
                    >
                      {item.category_name}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm">
                    {item.quantity_in_stock || 0} {item.unit}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={item.status === 'active' ? 'default' : 'secondary'}>
                    {item.status === 'active' ? 'Hoạt động' : 'Ngừng hoạt động'}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-4 py-3 text-sm text-muted-foreground border-t bg-muted/30">
        Tổng cộng: <span className="font-medium">{items.length}</span> items
      </div>
    </div>
  )
}
