import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Search, Plus, Package } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ItemWithCategory } from '@/types/items.types'
import type { ItemCategory } from '@/types/items.types'

interface RoomStandardItemPickerProps {
  items: ItemWithCategory[]
  categories: ItemCategory[]
  excludeItemIds: string[]
  onAdd: (itemId: string, quantity: number) => void
  isLoading?: boolean
  // Controlled server-side search props
  searchQuery: string
  onSearchChange: (value: string) => void
  selectedCategoryId: string | null
  onCategoryChange: (id: string | null) => void
  totalCount: number
  onLoadMore: () => void
}

export function RoomStandardItemPicker({
  items,
  categories,
  excludeItemIds,
  onAdd,
  isLoading = false,
  searchQuery,
  onSearchChange,
  selectedCategoryId,
  onCategoryChange,
  totalCount,
  onLoadMore,
}: RoomStandardItemPickerProps) {
  const { t } = useTranslation('rooms')
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  // Items returned by server already match search/category; only filter out already-added
  const filteredItems = useMemo(() => {
    return items.filter((item) => !excludeItemIds.includes(item.id))
  }, [items, excludeItemIds])

  // Group items by category for display
  const groupedItems = useMemo(() => {
    const groups: Record<string, ItemWithCategory[]> = {}
    filteredItems.forEach((item) => {
      const categoryId = item.category_id || 'uncategorized'
      if (!groups[categoryId]) groups[categoryId] = []
      groups[categoryId].push(item)
    })
    return groups
  }, [filteredItems])

  const hasMore = items.length < totalCount

  const handleAdd = (itemId: string) => {
    const quantity = quantities[itemId] || 1
    onAdd(itemId, quantity)
    // Reset quantity after adding
    setQuantities((prev) => {
      const next = { ...prev }
      delete next[itemId]
      return next
    })
  }

  const getCategoryName = (categoryId: string) => {
    if (categoryId === 'uncategorized') return t('standards.uncategorized', 'Chưa phân loại')
    const category = categories.find((c) => c.id === categoryId)
    return category?.name || categoryId
  }

  const getCategoryColor = (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId)
    return category?.color || '#6b7280'
  }

  if (isLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        {t('standards.loading')}
      </div>
    )
  }

  return (
    <div className="border rounded-lg bg-card">
      {/* Search Bar */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t('standards.searchPlaceholder', 'Tìm theo tên, mã, danh mục...')}
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <div className="p-2 border-b overflow-x-auto">
        <div className="flex gap-1.5 flex-wrap">
          <Button
            variant={selectedCategoryId === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => onCategoryChange(null)}
            className="text-xs h-7"
          >
            {t('standards.allCategories', 'Tất cả')}
          </Button>
          {categories.map((category) => (
            <Button
              key={category.id}
              variant={selectedCategoryId === category.id ? 'default' : 'outline'}
              size="sm"
              onClick={() => onCategoryChange(category.id)}
              className="text-xs h-7"
            >
              <span
                className="w-2 h-2 rounded-full mr-1.5"
                style={{ backgroundColor: category.color || '#6b7280' }}
              />
              {category.name}
            </Button>
          ))}
        </div>
      </div>

      {/* Items List */}
      <ScrollArea className="h-[300px]">
        {filteredItems.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>{t('standards.noItemsFound', 'Không tìm thấy sản phẩm')}</p>
          </div>
        ) : selectedCategoryId ? (
          // Flat list when category is selected
          <div className="p-2 space-y-1">
            {filteredItems.map((item) => (
              <ItemRow
                key={item.id}
                item={item}
                categoryColor={getCategoryColor(item.category_id || '')}
                quantity={quantities[item.id] || 1}
                onQuantityChange={(qty) =>
                  setQuantities((prev) => ({ ...prev, [item.id]: qty }))
                }
                onAdd={() => handleAdd(item.id)}
                t={t}
              />
            ))}
          </div>
        ) : (
          // Grouped by category when no category selected
          <div className="p-2 space-y-3">
            {Object.entries(groupedItems).map(([categoryId, categoryItems]) => (
              <div key={categoryId}>
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-muted-foreground">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: getCategoryColor(categoryId) }}
                  />
                  {getCategoryName(categoryId)}
                  <span className="text-xs">({categoryItems.length})</span>
                </div>
                <div className="space-y-1">
                  {categoryItems.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      categoryColor={getCategoryColor(item.category_id || '')}
                      quantity={quantities[item.id] || 1}
                      onQuantityChange={(qty) =>
                        setQuantities((prev) => ({ ...prev, [item.id]: qty }))
                      }
                      onAdd={() => handleAdd(item.id)}
                      t={t}
                    />
                  ))}
                </div>
              </div>
            ))}
            {hasMore && (
              <div className="pt-2 pb-3 flex flex-col items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onLoadMore}
                  className="h-8 text-xs"
                >
                  {t('standards.loadMore', 'Tải thêm')} ({items.length}/{totalCount})
                </Button>
              </div>
            )}
          </div>
        )}
        {selectedCategoryId && hasMore && (
          <div className="pt-1 pb-3 flex justify-center">
            <Button variant="outline" size="sm" onClick={onLoadMore} className="h-8 text-xs">
              {t('standards.loadMore', 'Tải thêm')} ({items.length}/{totalCount})
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

interface ItemRowProps {
  item: ItemWithCategory
  categoryColor: string
  quantity: number
  onQuantityChange: (qty: number) => void
  onAdd: () => void
  t: TFunction<'rooms', undefined>
}

function ItemRow({
  item,
  categoryColor,
  quantity,
  onQuantityChange,
  onAdd,
  t,
}: ItemRowProps) {
  const primaryImage = item.item_images?.find((img) => img.is_primary)?.url || item.item_images?.[0]?.url

  return (
    <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors group">
      {/* Image */}
      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center overflow-hidden shrink-0">
        {primaryImage ? (
          <img src={primaryImage} alt={item.name} className="w-full h-full object-cover" />
        ) : (
          <Package className="h-5 w-5 text-muted-foreground" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{item.name}</span>
          <span className="text-xs text-muted-foreground font-mono shrink-0">[{item.code}]</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: categoryColor }}
          />
          <span className="text-xs text-muted-foreground truncate">
            {item.category_name || t('standards.uncategorized', 'Chưa phân loại')}
          </span>
          <Badge
            variant={item.quantity_in_stock && item.quantity_in_stock > 0 ? 'secondary' : 'destructive'}
            className="text-xs h-5 px-1.5"
          >
            {t('standards.stock', 'Tồn')}: {item.quantity_in_stock || 0}
          </Badge>
        </div>
      </div>

      {/* Quantity + Add */}
      <div className="flex items-center gap-1.5 shrink-0 opacity-80 group-hover:opacity-100 transition-opacity">
        <Input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => onQuantityChange(parseInt(e.target.value) || 1)}
          className="w-14 h-8 text-center text-sm"
        />
        <Button size="sm" className="h-8 px-2.5" onClick={onAdd}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
