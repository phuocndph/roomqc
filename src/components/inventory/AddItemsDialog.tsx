import { useState, useMemo } from 'react'
import { Search, Plus, Package, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useIsMobile } from '@/hooks/use-mobile'
import { useItems } from '@/hooks/useItems'
import { useTranslation } from 'react-i18next'

interface AdditionalItem {
  item_id: string
  item_name: string
  item_code: string
  quantity: number
  quantity_in_stock: number
}

interface AddItemsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (items: AdditionalItem[]) => void
  excludeItemIds: string[]
}

export default function AddItemsDialog({
  open,
  onOpenChange,
  onAdd,
  excludeItemIds,
}: AddItemsDialogProps) {
  const isMobile = useIsMobile()
  const { t } = useTranslation('distribution')
  
  const [search, setSearch] = useState('')
  const [selectedItems, setSelectedItems] = useState<Map<string, AdditionalItem>>(new Map())
  
  // Fetch items with search
  const { data: itemsData, isLoading } = useItems(
    { search: search.length >= 2 ? search : undefined, status: 'active' },
    1,
    50
  )

  // Filter out excluded items and items without stock
  const availableItems = useMemo(() => {
    if (!itemsData?.items) return []
    return itemsData.items.filter(
      item => 
        !excludeItemIds.includes(item.id) && 
        (item.quantity_in_stock ?? 0) > 0
    )
  }, [itemsData?.items, excludeItemIds])

  const toggleItem = (item: typeof availableItems[0]) => {
    setSelectedItems(prev => {
      const newMap = new Map(prev)
      if (newMap.has(item.id)) {
        newMap.delete(item.id)
      } else {
        newMap.set(item.id, {
          item_id: item.id,
          item_name: item.name,
          item_code: item.code,
          quantity: 1,
          quantity_in_stock: item.quantity_in_stock ?? 0,
        })
      }
      return newMap
    })
  }

  const handleAdd = () => {
    onAdd(Array.from(selectedItems.values()))
    setSelectedItems(new Map())
    setSearch('')
  }

  const handleClose = () => {
    setSelectedItems(new Map())
    setSearch('')
    onOpenChange(false)
  }

  const Content = () => (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder={t('addItems.searchPlaceholder', 'Tìm kiếm vật tư...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Items List */}
      <ScrollArea className={isMobile ? 'h-[350px]' : 'h-[300px]'}>
        <div className="space-y-2 pr-4">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('addItems.loading', 'Đang tải...')}
            </div>
          ) : availableItems.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>{t('addItems.noItems', 'Không tìm thấy vật tư')}</p>
              {search.length > 0 && search.length < 2 && (
                <p className="text-xs mt-1">{t('addItems.minChars', 'Nhập ít nhất 2 ký tự để tìm kiếm')}</p>
              )}
            </div>
          ) : (
            availableItems.map(item => {
              const isSelected = selectedItems.has(item.id)
              
              return (
                <div
                  key={item.id}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    isSelected 
                      ? 'border-primary bg-primary/5' 
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => toggleItem(item)}
                >
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleItem(item)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">{item.code}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {t('addItems.inStock', 'Tồn')}: {item.quantity_in_stock ?? 0}
                    </Badge>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>

      {/* Selected Count */}
      {selectedItems.size > 0 && (
        <div className="flex items-center justify-between p-2 rounded-lg bg-primary/10">
          <span className="text-sm">
            {t('addItems.selected', 'Đã chọn')}: <strong>{selectedItems.size}</strong> {t('addItems.items', 'vật tư')}
          </span>
          <Button size="sm" variant="ghost" onClick={() => setSelectedItems(new Map())}>
            {t('addItems.clearAll', 'Bỏ chọn tất cả')}
          </Button>
        </div>
      )}
    </div>
  )

  const Footer = () => (
    <div className="flex gap-2">
      <Button variant="outline" onClick={handleClose} className="flex-1">
        {t('addItems.cancel', 'Đóng')}
      </Button>
      <Button 
        onClick={handleAdd} 
        disabled={selectedItems.size === 0} 
        className="flex-1"
      >
        <Plus className="h-4 w-4 mr-2" />
        {t('addItems.add', 'Thêm')} {selectedItems.size > 0 ? `(${selectedItems.size})` : ''}
      </Button>
    </div>
  )

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t('addItems.title', 'Thêm đồ phát sinh')}</DrawerTitle>
            <DrawerDescription>
              {t('addItems.description', 'Chọn vật tư từ kho để thêm vào phiếu')}
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4 pb-4">
            <Content />
          </div>
          <DrawerFooter>
            <Footer />
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('addItems.title', 'Thêm đồ phát sinh')}</DialogTitle>
          <DialogDescription>
            {t('addItems.description', 'Chọn vật tư từ kho để thêm vào phiếu')}
          </DialogDescription>
        </DialogHeader>
        <Content />
        <DialogFooter>
          <Footer />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
