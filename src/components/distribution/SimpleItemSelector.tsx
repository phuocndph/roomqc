import { useState, useMemo } from 'react'
import { Plus, Package, Search } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useItems } from '@/hooks/useItems'
import { useCategories } from '@/hooks/useCategories'
import { cn } from '@/lib/utils'

interface SimpleItemSelectorProps {
  allocatedItemIds: string[]
  onSelectItem: (itemId: string) => void
  disabled?: boolean
}

export function SimpleItemSelector({ allocatedItemIds, onSelectItem, disabled }: SimpleItemSelectorProps) {
  const [search, setSearch] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  
  // Fetch ALL items (no pagination limit)
  const { data: itemsData } = useItems({}, 1, 1000)
  const items = useMemo(() => itemsData?.items ?? [], [itemsData?.items])
  
  // Fetch categories for filter tabs
  const { data: categories = [] } = useCategories()
  
  const filteredItems = useMemo(() => {
    return items
      .filter(item => !allocatedItemIds.includes(item.id))
      .filter(item => (item.quantity_in_stock ?? 0) > 0)
      .filter(item => !selectedCategoryId || item.category_id === selectedCategoryId)
      .filter(item => {
        if (!search.trim()) return true
        const searchLower = search.toLowerCase()
        return (
          item.name.toLowerCase().includes(searchLower) ||
          item.code.toLowerCase().includes(searchLower) ||
          (item.category_name?.toLowerCase().includes(searchLower))
        )
      })
  }, [items, allocatedItemIds, selectedCategoryId, search])

  // Group items by category for display
  const groupedItems = useMemo(() => {
    const groups: Record<string, { name: string; color: string | null; items: typeof filteredItems }> = {}
    
    filteredItems.forEach(item => {
      const categoryId = item.category_id || 'uncategorized'
      if (!groups[categoryId]) {
        groups[categoryId] = {
          name: item.category_name || 'Chưa phân loại',
          color: item.category_color || null,
          items: []
        }
      }
      groups[categoryId].items.push(item)
    })
    
    return groups
  }, [filteredItems])
  
  return (
    <div className="space-y-3 border rounded-lg p-4 bg-card">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium flex items-center gap-2">
          <Package className="h-4 w-4" />
          Thêm sản phẩm
        </Label>
        <Badge variant="secondary">{filteredItems.length} sản phẩm</Badge>
      </div>
      
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder="Tìm theo tên, mã, danh mục..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
          disabled={disabled}
        />
      </div>
      
      {/* Category filter tabs */}
      <ScrollArea className="w-full">
        <div className="flex gap-2 pb-2">
          <Button
            type="button"
            variant={selectedCategoryId === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategoryId(null)}
            disabled={disabled}
            className="text-xs shrink-0"
          >
            Tất cả ({items.filter(i => !allocatedItemIds.includes(i.id) && (i.quantity_in_stock ?? 0) > 0).length})
          </Button>
          {categories.map(category => {
            const count = items.filter(i => 
              i.category_id === category.id && 
              !allocatedItemIds.includes(i.id) && 
              (i.quantity_in_stock ?? 0) > 0
            ).length
            if (count === 0) return null
            return (
              <Button
                key={category.id}
                type="button"
                variant={selectedCategoryId === category.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectedCategoryId(category.id)}
                disabled={disabled}
                className="text-xs shrink-0"
              >
                {category.name} ({count})
              </Button>
            )
          })}
        </div>
      </ScrollArea>
      
      {/* Item list */}
      <ScrollArea className="h-[250px] border rounded-md">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
            <Package className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">Không tìm thấy sản phẩm</p>
            {search && <p className="text-xs">Thử từ khóa khác</p>}
          </div>
        ) : selectedCategoryId === null ? (
          // Grouped view by category
          <div className="divide-y">
            {Object.entries(groupedItems).map(([categoryId, group]) => {
              if (group.items.length === 0) return null
              return (
                <div key={categoryId}>
                  <div 
                    className="px-3 py-2 text-xs font-medium text-muted-foreground bg-muted sticky top-0 z-10 border-b flex items-center gap-2"
                  >
                    {group.color && (
                      <span 
                        className="w-2 h-2 rounded-full shrink-0" 
                        style={{ backgroundColor: group.color }}
                      />
                    )}
                    {group.name} ({group.items.length})
                  </div>
                  {group.items.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => !disabled && onSelectItem(item.id)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{item.name}</div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span className="shrink-0">{item.code}</span>
                          {item.category_name && (
                            <Badge 
                              variant="secondary" 
                              className="text-[10px] px-1.5 py-0 shrink-0"
                              style={item.category_color ? { 
                                backgroundColor: `${item.category_color}20`,
                                color: item.category_color
                              } : undefined}
                            >
                              {item.category_name}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className="text-xs">
                          Tồn: {item.quantity_in_stock ?? 0}
                        </Badge>
                        <Plus className="h-4 w-4 text-primary" />
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          // Flat list view for specific category
          <div className="divide-y">
            {filteredItems.map(item => (
              <div
                key={item.id}
                className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer hover:bg-accent transition-colors"
                onClick={() => !disabled && onSelectItem(item.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{item.name}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="shrink-0">{item.code}</span>
                    {item.category_name && (
                      <Badge 
                        variant="secondary" 
                        className="text-[10px] px-1.5 py-0 shrink-0"
                        style={item.category_color ? { 
                          backgroundColor: `${item.category_color}20`,
                          color: item.category_color
                        } : undefined}
                      >
                        {item.category_name}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline" className="text-xs">
                    Tồn: {item.quantity_in_stock ?? 0}
                  </Badge>
                  <Plus className="h-4 w-4 text-primary" />
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
