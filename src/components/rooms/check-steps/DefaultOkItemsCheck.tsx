import { useEffect, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/integrations/supabase/client'
import { ReportIssueSheet, type IssueAction } from './ReportIssueSheet'
import type {
  RoomItemWithDetails,
  LaundryItem,
  ConsumedItem,
  LostItem,
  ReplacedItem,
  DamagedItem,
} from '@/types/rooms.types'
import type { ItemType } from '@/types/items.types'
import { getCheckTypeConfig, type CheckType } from '@/lib/roomCheckConfig'

interface ExtendedRoomItem extends RoomItemWithDetails {
  item_type: ItemType
  category_name: string | null
  category_id: string | null
}

interface CategoryGroup {
  id: string
  name: string
  items: ExtendedRoomItem[]
}

export interface DefaultOkItemsCheckProps {
  items: RoomItemWithDetails[]
  checkType: CheckType
  phase?: 1 | 2
  laundryItems: LaundryItem[]
  consumedItems: ConsumedItem[]
  lostItems: LostItem[]
  replacedItems: ReplacedItem[]
  damagedItems: DamagedItem[]
  missingItems?: { item_id: string; quantity?: number; missing_quantity?: number }[]
  onLinenStatusChange: (item: RoomItemWithDetails, status: 'ok' | 'laundry' | 'add' | 'change' | 'lost' | 'missing', quantity: number) => void
  onMarkConsumed: (item: RoomItemWithDetails, quantity: number, needRefill: boolean) => void
  onEquipmentLost: (item: RoomItemWithDetails, quantity: number, estimatedValue?: number) => void
  onMarkDamaged: (item: RoomItemWithDetails, info: { damage_type: 'repairable' | 'replacement_needed'; damage_cost: number; notes?: string; quantity?: number; item_type?: ItemType }) => void
  onResetLinen: (itemId: string) => void
  onRemoveFromLost: (itemId: string) => void
  onRemoveFromConsumed: (itemId: string) => void
  onRemoveFromDamaged: (itemId: string) => void
  /** Callback nhận photos từ ReportIssueSheet — page-level gộp vào form.photos */
  onPhotosCollected?: (photos: string[]) => void
}

type ItemStatus = 'ok' | 'laundry' | 'add' | 'change' | 'lost' | 'damaged' | 'missing' | 'consumed'

// Tag trạng thái — chuẩn ngôn ngữ "đã + động từ" cho hành động đã thực hiện
const STATUS_LABELS: Record<ItemStatus, { label: string; color: string; bar: string }> = {
  ok:       { label: 'Đạt',     color: 'text-green-600',      bar: 'border-l-transparent' },
  laundry:  { label: 'Đã giặt', color: 'text-blue-600',       bar: 'border-l-blue-500' },
  add:      { label: 'Đã thêm', color: 'text-green-600',      bar: 'border-l-green-500' },
  change:   { label: 'Đã thay', color: 'text-primary',        bar: 'border-l-primary' },
  lost:     { label: 'Mất',     color: 'text-destructive',    bar: 'border-l-destructive' },
  damaged:  { label: 'Hỏng',    color: 'text-amber-600',      bar: 'border-l-amber-500' },
  missing:  { label: 'Thiếu',   color: 'text-amber-700',      bar: 'border-l-amber-600' },
  consumed: { label: 'Đã dùng', color: 'text-cyan-600',       bar: 'border-l-cyan-500' },
}

export function DefaultOkItemsCheck({
  items,
  checkType,
  phase,
  laundryItems,
  consumedItems,
  lostItems,
  replacedItems,
  damagedItems,
  missingItems = [],
  onLinenStatusChange,
  onMarkConsumed,
  onEquipmentLost,
  onMarkDamaged,
  onResetLinen,
  onRemoveFromLost,
  onRemoveFromConsumed,
  onRemoveFromDamaged,
  onPhotosCollected,
}: DefaultOkItemsCheckProps) {
  const config = getCheckTypeConfig(checkType)
  const [enriched, setEnriched] = useState<ExtendedRoomItem[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sheetItem, setSheetItem] = useState<ExtendedRoomItem | null>(null)

  useEffect(() => {
    const fetchDetails = async () => {
      if (items.length === 0) {
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      const ids = items.map(i => i.item_id)
      const { data } = await supabase
        .from('items')
        .select('id, item_type, quantity_in_stock, category_id, item_categories(id, name, default_item_type)')
        .in('id', ids)

      const newStock: Record<string, number> = {}
      const enrichedItems: ExtendedRoomItem[] = items.map(item => {
        const d = data?.find(x => x.id === item.item_id)
        const cat = d?.item_categories as { id: string; name: string; default_item_type: ItemType | null } | null
        newStock[item.item_id] = d?.quantity_in_stock || 0
        return {
          ...item,
          item_type: (d?.item_type as ItemType) ?? (cat?.default_item_type as ItemType) ?? 'equipment',
          category_name: cat?.name || 'Khác',
          category_id: cat?.id || null,
        }
      })
      setStockMap(newStock)
      setEnriched(enrichedItems)
      setIsLoading(false)
    }
    fetchDetails()
  }, [items])

  const groups = useMemo<CategoryGroup[]>(() => {
    const map = new Map<string, CategoryGroup>()
    enriched.forEach(item => {
      const key = item.category_name || 'Khác'
      const ex = map.get(key)
      if (ex) ex.items.push(item)
      else map.set(key, { id: item.category_id || key, name: key, items: [item] })
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, 'vi'))
  }, [enriched])

  const getStatus = (itemId: string): ItemStatus | null => {
    const inLaundry = laundryItems.some(i => i.item_id === itemId)
    const inReplaced = replacedItems.some(i => i.item_id === itemId)
    if (inLaundry && inReplaced) return 'change'
    if (inLaundry) return 'laundry'
    if (inReplaced) return 'add'
    if (lostItems.some(i => i.item_id === itemId)) return 'lost'
    if (damagedItems.some(i => i.item_id === itemId)) return 'damaged'
    if (consumedItems.some(i => i.item_id === itemId)) return 'consumed'
    if (missingItems.some(i => i.item_id === itemId)) return 'missing'
    return null
  }

  const getReportedQty = (itemId: string, status: ItemStatus): number => {
    switch (status) {
      case 'laundry': return laundryItems.find(i => i.item_id === itemId)?.quantity ?? 1
      case 'add':
      case 'change': return replacedItems.find(i => i.item_id === itemId)?.quantity ?? 1
      case 'lost': return lostItems.find(i => i.item_id === itemId)?.quantity ?? 1
      case 'damaged': return damagedItems.find(i => i.item_id === itemId)?.quantity ?? 1
      case 'consumed': return consumedItems.find(i => i.item_id === itemId)?.quantity ?? 1
      case 'missing': return missingItems.find(i => i.item_id === itemId)?.missing_quantity ?? missingItems.find(i => i.item_id === itemId)?.quantity ?? 1
      default: return 1
    }
  }

  const getAllowedActions = (itemType: ItemType): string[] => {
    if (checkType === 'checkout' && phase && config.phase1Actions && config.phase2Actions) {
      const p = phase === 1 ? config.phase1Actions : config.phase2Actions
      return (p[itemType] || []) as string[]
    }
    switch (itemType) {
      case 'linen': return config.linenActions
      case 'consumable': return config.consumableActions
      case 'equipment': return config.equipmentActions
      case 'furniture': return config.furnitureActions
    }
  }

  const resetItem = (item: ExtendedRoomItem) => {
    const status = getStatus(item.item_id)
    if (!status) return
    if (item.item_type === 'linen') {
      onResetLinen(item.item_id)
      return
    }
    if (status === 'lost') onRemoveFromLost(item.item_id)
    if (status === 'damaged') onRemoveFromDamaged(item.item_id)
    if (status === 'consumed') onRemoveFromConsumed(item.item_id)
    if (status === 'missing') onResetLinen(item.item_id)
  }

  const applyIssue = (item: ExtendedRoomItem, action: IssueAction) => {
    const existing = getStatus(item.item_id)
    if (existing) resetItem(item)

    switch (action.type) {
      case 'laundry':
      case 'add':
      case 'change':
      case 'missing':
        onLinenStatusChange(item, action.type, action.quantity)
        break
      case 'lost':
        onEquipmentLost(item, action.quantity)
        break
      case 'damaged':
        onMarkDamaged(item, {
          damage_type: 'replacement_needed',
          damage_cost: 0,
          notes: action.notes,
          quantity: action.quantity,
          item_type: item.item_type,
        })
        break
      case 'consumed':
      case 'empty':
        onMarkConsumed(item, action.quantity, action.needRefill)
        break
    }

    // Forward photos lên parent — gộp vào form.photos của room check
    if (action.photos && action.photos.length > 0 && onPhotosCollected) {
      onPhotosCollected(action.photos)
    }
  }

  const filterItems = (list: ExtendedRoomItem[]) => {
    if (!search) return list
    const q = search.toLowerCase()
    return list.filter(i =>
      i.item_name.toLowerCase().includes(q) ||
      (i.item_code || '').toLowerCase().includes(q)
    )
  }

  const totalItems = enriched.length
  const reportedCount = enriched.filter(i => getStatus(i.item_id) !== null).length

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (totalItems === 0) {
    return (
      <div className="text-center py-12 text-sm text-muted-foreground">
        Chưa có đồ dùng nào trong phòng này.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Banner trạng thái — minimalist, border-l, không icon */}
      {reportedCount === 0 ? (
        <div className="border-l-4 border-green-500 bg-muted/30 px-3 py-2.5 rounded-r-md">
          <p className="text-sm font-semibold text-green-700">Mặc định đạt chuẩn</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chạm vào mục cần xử lý để cập nhật tình trạng.
          </p>
        </div>
      ) : (
        <div className="border-l-4 border-amber-500 bg-muted/30 px-3 py-2.5 rounded-r-md">
          <p className="text-sm font-semibold text-amber-700">
            {reportedCount} mục cần xử lý
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Các mục còn lại đạt chuẩn. Chạm để chỉnh sửa.
          </p>
        </div>
      )}

      {/* Search — không icon */}
      {totalItems > 8 && (
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên hoặc mã..."
          className="h-9"
        />
      )}

      {/* Groups */}
      {groups.map(group => {
        const filtered = filterItems(group.items)
        if (filtered.length === 0) return null
        const groupReported = group.items.filter(i => getStatus(i.item_id) !== null).length

        return (
          <div key={group.id} className="space-y-1.5">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                {group.name}
              </h3>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {groupReported > 0
                  ? `${groupReported}/${group.items.length} cần xử lý`
                  : `${group.items.length} mục`}
              </span>
            </div>

            <div className="space-y-1.5">
              {filtered.map(item => {
                const status = getStatus(item.item_id)
                const isOk = status === null
                const reportedQty = status ? getReportedQty(item.item_id, status) : 0
                const stdQty = item.standard_quantity || 1
                const statusInfo = status ? STATUS_LABELS[status] : null

                return (
                  <button
                    key={item.item_id}
                    type="button"
                    onClick={() => setSheetItem(item)}
                    className={cn(
                      'w-full flex items-center gap-3 pl-3 pr-2 py-3 min-h-[56px] rounded-md border bg-card text-left transition-colors active:bg-muted/50 hover:bg-muted/30',
                      'border-l-4',
                      isOk ? 'border-l-transparent' : statusInfo?.bar
                    )}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-2">
                        <p className="text-sm font-medium leading-tight truncate">
                          {item.item_name}
                        </p>
                        {stdQty > 1 && (
                          <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                            ×{stdQty}
                          </span>
                        )}
                      </div>
                      {!isOk && statusInfo && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={cn('text-xs font-semibold', statusInfo.color)}>
                            {statusInfo.label}
                          </span>
                          <span className="text-[11px] text-muted-foreground tabular-nums">
                            {reportedQty}/{stdQty}
                          </span>
                        </div>
                      )}
                    </div>

                    {isOk ? (
                      <span className="text-xs text-muted-foreground shrink-0 px-2">
                        Cập nhật
                      </span>
                    ) : (
                      <span
                        role="button"
                        aria-label="Bỏ"
                        onClick={(e) => {
                          e.stopPropagation()
                          resetItem(item)
                        }}
                        className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1 shrink-0"
                      >
                        Bỏ
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}

      <ReportIssueSheet
        open={!!sheetItem}
        onOpenChange={(open) => !open && setSheetItem(null)}
        itemName={sheetItem?.item_name || ''}
        itemType={sheetItem?.item_type || 'equipment'}
        standardQuantity={sheetItem?.standard_quantity || 1}
        availableStock={sheetItem ? stockMap[sheetItem.item_id] : 0}
        allowedActions={sheetItem ? getAllowedActions(sheetItem.item_type) : []}
        onSubmit={(action) => sheetItem && applyIssue(sheetItem, action)}
      />
    </div>
  )
}
