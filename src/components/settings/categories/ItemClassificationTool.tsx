import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { RefreshCw, AlertTriangle, CheckCircle2, Wrench, Package, ArrowRight, FolderTree } from 'lucide-react'
import { ITEM_TYPE_LABELS, type ItemType } from '@/types/items.types'

interface MisclassifiedItem {
  id: string
  name: string
  code: string
  current_item_type: ItemType
  expected_item_type: ItemType
  category_name: string
  category_id: string
}

interface Category {
  id: string
  name: string
  default_item_type: ItemType | null
}

const ITEM_TYPE_BADGE_COLORS: Record<ItemType, string> = {
  linen: 'bg-blue-100 text-blue-700 border-blue-200',
  consumable: 'bg-rose-100 text-rose-700 border-rose-200',
  equipment: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  furniture: 'bg-amber-100 text-amber-700 border-amber-200',
}

export function ItemClassificationTool() {
  const { tenantId } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const queryClient = useQueryClient()
  const [isFixing, setIsFixing] = useState(false)
  const [selectedMoveCategory, setSelectedMoveCategory] = useState<Record<string, string>>({})

  // Fetch categories for the dropdown
  const { data: categories } = useQuery({
    queryKey: ['item-categories-for-sync', tenantId, selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) return []
      
      let query = supabase
        .from('item_categories')
        .select('id, name, default_item_type')
        .eq('tenant_id', tenantId)
        .order('name')
      
      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }
      
      const { data } = await query
      return (data || []) as Category[]
    },
    enabled: !!tenantId,
  })

  // Query to find misclassified items
  const { data: misclassifiedItems, isLoading, refetch } = useQuery({
    queryKey: ['misclassified-items', tenantId, selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) return []

      let query = supabase
        .from('items')
        .select(`
          id,
          name,
          code,
          item_type,
          category_id,
          item_categories!inner(id, name, default_item_type)
        `)
        .eq('tenant_id', tenantId)
        .not('category_id', 'is', null)

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }

      const { data, error } = await query
      if (error) throw error

      const misclassified: MisclassifiedItem[] = []
      
      for (const item of data || []) {
        const category = item.item_categories as any
        if (category?.default_item_type && item.item_type !== category.default_item_type) {
          misclassified.push({
            id: item.id,
            name: item.name,
            code: item.code || '',
            current_item_type: item.item_type as ItemType,
            expected_item_type: category.default_item_type as ItemType,
            category_name: category.name,
            category_id: category.id,
          })
        }
      }

      return misclassified
    },
    enabled: !!tenantId,
  })

  // Query for stats
  const { data: stats } = useQuery({
    queryKey: ['item-classification-stats', tenantId, selectedHotel?.id],
    queryFn: async () => {
      if (!tenantId) return null

      let query = supabase
        .from('items')
        .select('item_type', { count: 'exact' })
        .eq('tenant_id', tenantId)

      if (!isAllHotelsMode && selectedHotel?.id) {
        query = query.eq('hotel_id', selectedHotel.id)
      }

      const { count: total } = await query

      const typeCounts: Record<ItemType, number> = {
        linen: 0,
        consumable: 0,
        equipment: 0,
        furniture: 0,
      }

      for (const type of Object.keys(typeCounts) as ItemType[]) {
        let typeQuery = supabase
          .from('items')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', tenantId)
          .eq('item_type', type)

        if (!isAllHotelsMode && selectedHotel?.id) {
          typeQuery = typeQuery.eq('hotel_id', selectedHotel.id)
        }

        const { count } = await typeQuery
        typeCounts[type] = count || 0
      }

      return {
        total: total || 0,
        typeCounts,
        misclassifiedCount: misclassifiedItems?.length || 0,
      }
    },
    enabled: !!tenantId && misclassifiedItems !== undefined,
  })

  // Group misclassified by category for better display
  const groupedByCategory = useMemo(() => {
    if (!misclassifiedItems) return new Map<string, MisclassifiedItem[]>()
    
    const map = new Map<string, MisclassifiedItem[]>()
    for (const item of misclassifiedItems) {
      const existing = map.get(item.category_name) || []
      existing.push(item)
      map.set(item.category_name, existing)
    }
    return map
  }, [misclassifiedItems])

  // Get suitable categories for an item (matching its current item_type)
  const getSuitableCategories = (itemType: ItemType) => {
    return categories?.filter(c => c.default_item_type === itemType) || []
  }

  // Mutation to fix item by changing its item_type to match category
  const fixItemTypeMutation = useMutation({
    mutationFn: async (item: MisclassifiedItem) => {
      const { error } = await supabase
        .from('items')
        .update({ 
          item_type: item.expected_item_type,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.id)

      if (error) throw error
    },
    onSuccess: (_, item) => {
      toast.success(`Đã đổi "${item.name}" thành ${ITEM_TYPE_LABELS[item.expected_item_type]}`)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['misclassified-items'] })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Có lỗi khi sửa item')
    },
  })

  // Mutation to fix item by moving to correct category
  const moveItemCategoryMutation = useMutation({
    mutationFn: async ({ itemId, newCategoryId }: { itemId: string; newCategoryId: string }) => {
      const { error } = await supabase
        .from('items')
        .update({ 
          category_id: newCategoryId,
          updated_at: new Date().toISOString()
        })
        .eq('id', itemId)

      if (error) throw error
    },
    onSuccess: (_, { itemId }) => {
      toast.success('Đã chuyển item sang danh mục mới')
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['misclassified-items'] })
      setSelectedMoveCategory(prev => {
        const newState = { ...prev }
        delete newState[itemId]
        return newState
      })
    },
    onError: (error: any) => {
      toast.error(error.message || 'Có lỗi khi chuyển danh mục')
    },
  })

  // Mutation to fix all items by changing item_type
  const fixAllMutation = useMutation({
    mutationFn: async () => {
      if (!misclassifiedItems || misclassifiedItems.length === 0) return

      setIsFixing(true)
      
      for (const item of misclassifiedItems) {
        await supabase
          .from('items')
          .update({ 
            item_type: item.expected_item_type,
            updated_at: new Date().toISOString()
          })
          .eq('id', item.id)
      }
    },
    onSuccess: () => {
      toast.success(`Đã sửa ${misclassifiedItems?.length || 0} items thành công!`)
      queryClient.invalidateQueries({ queryKey: ['items'] })
      queryClient.invalidateQueries({ queryKey: ['misclassified-items'] })
      queryClient.invalidateQueries({ queryKey: ['item-classification-stats'] })
      refetch()
    },
    onError: (error: any) => {
      toast.error(error.message || 'Có lỗi khi sửa items')
    },
    onSettled: () => {
      setIsFixing(false)
    },
  })

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  const misclassifiedCount = misclassifiedItems?.length || 0

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="border rounded-lg p-4 text-center">
          <p className="text-2xl font-bold">{stats?.total || 0}</p>
          <p className="text-xs text-muted-foreground">Tổng Items</p>
        </div>
        {Object.entries(ITEM_TYPE_LABELS).map(([type, label]) => (
          <div key={type} className="border rounded-lg p-4 text-center">
            <p className="text-2xl font-bold">{stats?.typeCounts?.[type as ItemType] || 0}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>

      {/* Misclassified Items Alert */}
      {misclassifiedCount > 0 ? (
        <div className="border rounded-lg p-4 bg-amber-50/50 border-amber-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <span className="font-medium text-amber-800">
                {misclassifiedCount} items không khớp với danh mục
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => refetch()}
              >
                <RefreshCw className="h-4 w-4 mr-1" />
                Quét lại
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => fixAllMutation.mutate()}
                disabled={isFixing || fixAllMutation.isPending}
              >
                <Wrench className="h-4 w-4 mr-1" />
                {isFixing ? 'Đang sửa...' : 'Sửa tất cả theo danh mục'}
              </Button>
            </div>
          </div>

          {/* Grouped by category */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            {Array.from(groupedByCategory.entries()).map(([categoryName, items]) => (
              <div key={categoryName} className="border rounded-lg bg-white overflow-hidden">
                <div className="px-3 py-2 bg-muted/50 border-b flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium text-sm">{categoryName}</span>
                    <Badge variant="secondary" className="text-xs">
                      {items.length} items
                    </Badge>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={ITEM_TYPE_BADGE_COLORS[items[0].expected_item_type]}
                  >
                    Mặc định: {ITEM_TYPE_LABELS[items[0].expected_item_type]}
                  </Badge>
                </div>
                
                <div className="divide-y">
                  {items.map((item) => {
                    const suitableCategories = getSuitableCategories(item.current_item_type)
                    
                    return (
                      <div key={item.id} className="p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-sm font-medium truncate">{item.name}</span>
                              {item.code && (
                                <code className="text-xs bg-muted px-1 rounded">{item.code}</code>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Badge 
                                variant="outline" 
                                className={ITEM_TYPE_BADGE_COLORS[item.current_item_type]}
                              >
                                {ITEM_TYPE_LABELS[item.current_item_type]}
                              </Badge>
                              <ArrowRight className="h-3 w-3" />
                              <Badge 
                                variant="outline" 
                                className={ITEM_TYPE_BADGE_COLORS[item.expected_item_type]}
                              >
                                {ITEM_TYPE_LABELS[item.expected_item_type]}
                              </Badge>
                            </div>
                          </div>
                          
                          {/* Action buttons */}
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Option 1: Change item_type to match category */}
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => fixItemTypeMutation.mutate(item)}
                              disabled={fixItemTypeMutation.isPending}
                            >
                              Đổi loại
                            </Button>
                            
                            {/* Option 2: Move to a suitable category */}
                            {suitableCategories.length > 0 && (
                              <div className="flex items-center gap-1">
                                <Select
                                  value={selectedMoveCategory[item.id] || ''}
                                  onValueChange={(val) => setSelectedMoveCategory(prev => ({ ...prev, [item.id]: val }))}
                                >
                                  <SelectTrigger className="h-7 w-[120px] text-xs">
                                    <SelectValue placeholder="Chuyển DM" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {suitableCategories.map(cat => (
                                      <SelectItem key={cat.id} value={cat.id} className="text-xs">
                                        {cat.name}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {selectedMoveCategory[item.id] && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    className="h-7 px-2"
                                    onClick={() => moveItemCategoryMutation.mutate({
                                      itemId: item.id,
                                      newCategoryId: selectedMoveCategory[item.id]
                                    })}
                                    disabled={moveItemCategoryMutation.isPending}
                                  >
                                    OK
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="border rounded-lg p-6 text-center bg-green-50/50 border-green-200">
          <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-2" />
          <p className="font-medium text-green-800">Tất cả items đã được phân loại đúng!</p>
          <p className="text-sm text-muted-foreground mt-1">
            Không có items nào cần sửa
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Quét lại
          </Button>
        </div>
      )}

      {/* Help text */}
      <div className="border rounded-lg p-4 bg-muted/50">
        <div className="flex items-start gap-2">
          <Package className="h-5 w-5 text-muted-foreground mt-0.5" />
          <div className="space-y-1">
            <p className="font-medium text-sm">Cách sử dụng</p>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>• <strong>Đổi loại:</strong> Thay đổi loại đồ dùng của item theo danh mục (VD: Linen → Equipment)</li>
              <li>• <strong>Chuyển DM:</strong> Di chuyển item sang danh mục phù hợp với loại đồ dùng hiện tại</li>
              <li>• <strong>Sửa tất cả:</strong> Đổi loại tất cả items theo danh mục của chúng</li>
              <li className="text-amber-600">⚠️ Nếu danh mục đang cấu hình sai (VD: "Phòng khách" chứa linen nhưng default=equipment), hãy cân nhắc tách danh mục hoặc đổi default_item_type</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
