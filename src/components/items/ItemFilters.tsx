import { Search, FileDown, FileUp, QrCode, RefreshCw, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCategories } from '@/hooks/useCategories'
import type { ItemFilters as IItemFilters } from '@/types/items.types'
import { supabase } from '@/integrations/supabase/client'
import { exportItemsToExcel } from '@/lib/exportUtils'
import { downloadItemsTemplate, parseItemsExcel, type ItemImportRow } from '@/lib/importUtils'
import { ImportExcelDialog } from '@/components/shared/ImportExcelDialog'
import { toast } from '@/hooks/use-toast'
import { useState } from 'react'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { useQueryClient } from '@tanstack/react-query'
import { useSyncCategories } from '@/hooks/useSyncCategories'
import { WarehouseSelect } from '@/components/warehouse/WarehouseSelect'
import { getFriendlyError } from '@/lib/errorMessage'

interface ItemFiltersProps {
  filters: IItemFilters
  onFilterChange: (filters: Partial<IItemFilters>) => void
}

export function ItemFilters({ filters, onFilterChange }: ItemFiltersProps) {
  const { data: categories } = useCategories()
  const { tenantId, hotelId } = useUser()
  const { selectedHotel } = useHotelContext()
  const queryClient = useQueryClient()
  const { syncCategories, isSyncing } = useSyncCategories()
  const [isExporting, setIsExporting] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  
  const handleExport = async () => {
    try {
      if (!tenantId) {
        toast({
          title: 'Lỗi',
          description: 'Không tìm thấy thông tin tenant',
          variant: 'destructive',
        })
        return
      }

      setIsExporting(true)
      
      // Fetch items with current filters
      const { data, error } = await supabase.rpc('get_items_filtered', {
        p_tenant_id: tenantId,
        p_hotel_id: filters.hotelId || hotelId || null,
        p_category_id: filters.categoryId || null,
        p_stock_status: filters.stockStatus || null,
        p_status: filters.status || 'active',
        p_search: filters.search || null,
        p_warehouse_id: null,
        p_limit: 10000, // Export all matching items
        p_offset: 0,
      })
      
      if (error) throw error
      
      if (!data || data.length === 0) {
        toast({
          title: 'Không có dữ liệu',
          description: 'Không tìm thấy items phù hợp với bộ lọc',
        })
        return
      }
      
      const filename = await exportItemsToExcel(data, 'items-export')
      
      toast({
        title: 'Thành công',
        description: `Đã xuất ${data.length} items ra file ${filename}`,
      })
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    } finally {
      setIsExporting(false)
    }
  }
  
  const handleScanQR = () => {
    toast({
      title: 'Tính năng đang phát triển',
      description: 'Chức năng quét QR sẽ sớm được bổ sung',
    })
  }

  const handleImportItems = async (data: ItemImportRow[]): Promise<{ success: number; failed: number; updated?: number }> => {
    let created = 0
    let updated = 0
    let failed = 0

    const targetHotelId = selectedHotel?.id || hotelId
    if (!tenantId || !targetHotelId) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn khách sạn trước khi import',
        variant: 'destructive',
      })
      return { success: 0, failed: data.length }
    }

    // Fetch categories and existing items in parallel
    const [categoriesResult, itemsResult] = await Promise.all([
      supabase
        .from('item_categories')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .eq('hotel_id', targetHotelId),
      supabase.from('items').select('id, name, code').eq('tenant_id', tenantId).eq('hotel_id', targetHotelId)
    ])

    if (categoriesResult.error) console.error('Fetch categories error:', categoriesResult.error)
    if (itemsResult.error) console.error('Fetch items error:', itemsResult.error)

    // Build maps
    const categoryMap = new Map(categoriesResult.data?.map(c => [c.name.toLowerCase().trim(), c.id]) || [])
    const existingItemsMap = new Map(itemsResult.data?.map(item => [item.name.toLowerCase().trim(), item]) || [])

    // Find and batch create missing categories
    const uniqueCategoryNames = [...new Set(data.map(item => item.category_name).filter(Boolean))] as string[]
    const missingCategories = uniqueCategoryNames.filter(name => !categoryMap.has(name.toLowerCase().trim()))

    if (missingCategories.length > 0) {
      const categoriesToInsert = missingCategories.map((name, idx) => ({
        tenant_id: tenantId,
        hotel_id: targetHotelId,
        name,
        code: name.toUpperCase().replace(/[^A-Z0-9]/g, '_').substring(0, 15) + '_' + (Date.now() + idx).toString().slice(-4),
        status: 'active'
      }))

      const { data: newCategories, error } = await supabase
        .from('item_categories')
        .insert(categoriesToInsert)
        .select('id, name')

      if (error) {
        console.error('Batch create categories error:', error)
      } else if (newCategories) {
        newCategories.forEach(c => categoryMap.set(c.name.toLowerCase().trim(), c.id))
        toast({ title: 'Đã tạo danh mục mới', description: `Tự động tạo ${newCategories.length} danh mục` })
        queryClient.invalidateQueries({ queryKey: ['item-categories'] })
        queryClient.invalidateQueries({ queryKey: ['categories'] })
      }
    }

    // Separate items into new and existing
    const itemsToInsert: any[] = []
    const itemsToUpdate: { id: string; data: any }[] = []

    data.forEach((item, idx) => {
      const categoryId = item.category_name ? categoryMap.get(item.category_name.toLowerCase().trim()) : null
      const itemNameKey = item.name.toLowerCase().trim()
      const existingItem = existingItemsMap.get(itemNameKey)

      if (existingItem) {
        itemsToUpdate.push({
          id: existingItem.id,
          data: {
            name: item.name,
            category_id: categoryId,
            unit: item.unit,
            unit_price: item.unit_price,
            quantity_total: item.quantity_total,
            quantity_in_stock: item.quantity_total,
            minimum_stock: item.minimum_stock,
            description: item.description || null,
            status: 'active',
            updated_at: new Date().toISOString(),
          }
        })
      } else {
        itemsToInsert.push({
          tenant_id: tenantId,
          hotel_id: targetHotelId,
          code: item.sku || `ITEM-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`,
          name: item.name,
          category_id: categoryId || null,
          unit: item.unit,
          unit_price: item.unit_price,
          quantity_total: item.quantity_total,
          quantity_in_stock: item.quantity_total,
          minimum_stock: item.minimum_stock,
          description: item.description || null,
          status: 'active',
        })
        // Prevent duplicates within same batch
        existingItemsMap.set(itemNameKey, { id: '', name: item.name, code: '' })
      }
    })

    // Batch insert new items
    if (itemsToInsert.length > 0) {
      const { data: insertedItems, error } = await supabase
        .from('items')
        .insert(itemsToInsert)
        .select('id')

      if (error) {
        console.error('Batch insert items error:', error)
        failed += itemsToInsert.length
      } else {
        created = insertedItems?.length || 0
      }
    }

    // Batch update existing items (in chunks of 50 for performance)
    const CHUNK_SIZE = 50
    for (let i = 0; i < itemsToUpdate.length; i += CHUNK_SIZE) {
      const chunk = itemsToUpdate.slice(i, i + CHUNK_SIZE)
      const updatePromises = chunk.map(({ id, data: updateData }) =>
        supabase.from('items').update(updateData).eq('id', id)
      )
      
      const results = await Promise.all(updatePromises)
      results.forEach(result => {
        if (result.error) {
          console.error('Update item error:', result.error)
          failed++
        } else {
          updated++
        }
      })
    }

    // Sync categories to fix mismatched hotel_id
    if (tenantId && targetHotelId) {
      await syncCategories(tenantId, targetHotelId)
    }

    // Refresh items list
    queryClient.invalidateQueries({ queryKey: ['items'] })
    
    // Show summary toast
    const messages = []
    if (created > 0) messages.push(`Tạo mới: ${created}`)
    if (updated > 0) messages.push(`Cập nhật: ${updated}`)
    if (failed > 0) messages.push(`Lỗi: ${failed}`)
    
    if (messages.length > 0) {
      toast({
        title: 'Import hoàn tất',
        description: messages.join(' | '),
        variant: failed > 0 ? 'destructive' : 'default',
      })
    }
    
    return { success: created + updated, failed, updated }
  }

  const handleSyncCategories = async () => {
    const targetHotelId = selectedHotel?.id || hotelId
    if (!tenantId || !targetHotelId) {
      toast({
        title: 'Lỗi',
        description: 'Vui lòng chọn khách sạn trước khi đồng bộ',
        variant: 'destructive',
      })
      return
    }
    await syncCategories(tenantId, targetHotelId)
  }
  
  return (
    <div className="sticky top-0 z-10 flex flex-col gap-3 bg-background pb-3 pt-1">
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên, mã..."
            value={filters.search || ''}
            onChange={(e) => onFilterChange({ search: e.target.value })}
            className="h-9 pl-8 text-sm"
          />
        </div>
        
        {/* Category Filter */}
        <Select
          value={filters.categoryId || 'all'}
          onValueChange={(value) => 
            onFilterChange({ categoryId: value === 'all' ? undefined : value })
          }
        >
          <SelectTrigger className="h-9 w-full text-sm sm:w-40">
            <SelectValue placeholder="Danh mục" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả danh mục</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        {/* Stock Status Filter */}
        <Select
          value={filters.stockStatus || 'all'}
          onValueChange={(value) => 
            onFilterChange({ stockStatus: value === 'all' ? undefined : value as any })
          }
        >
          <SelectTrigger className="h-9 w-full text-sm sm:w-36">
            <SelectValue placeholder="Tồn kho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="in_stock">Đủ hàng</SelectItem>
            <SelectItem value="low_stock">Thấp</SelectItem>
            <SelectItem value="out_of_stock">Hết hàng</SelectItem>
          </SelectContent>
        </Select>
        
        {/* Warehouse Filter */}
        <WarehouseSelect
          value={filters.warehouseId || ''}
          onValueChange={(value) => 
            onFilterChange({ warehouseId: value || undefined })
          }
          placeholder="Tất cả kho"
          showAllOption
          className="h-9 w-full text-sm sm:w-40"
        />
        
        {/* Item Status Filter */}
        <Select
          value={filters.status || 'active'}
          onValueChange={(value) => 
            onFilterChange({ status: value as any })
          }
        >
          <SelectTrigger className="h-9 w-full text-sm sm:w-32">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Đang dùng</SelectItem>
            <SelectItem value="discontinued">Ngừng dùng</SelectItem>
          </SelectContent>
        </Select>
      </div>
      
      <div className="flex gap-1.5 flex-wrap">
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setImportDialogOpen(true)}>
          <FileUp className="mr-1.5 h-3.5 w-3.5" />
          Import
        </Button>
        
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleExport} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="mr-1.5 h-3.5 w-3.5" />
          )}
          Xuất Excel
        </Button>
        
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={handleScanQR}>
          <QrCode className="mr-1.5 h-3.5 w-3.5" />
          Quét QR
        </Button>

        <Button 
          variant="ghost" 
          size="sm"
          className="h-8 text-xs"
          onClick={handleSyncCategories} 
          disabled={isSyncing}
        >
          {isSyncing ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Đồng bộ
        </Button>
      </div>

      <ImportExcelDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title="Tải lên hàng loạt tài sản từ Excel"
        description="Tải file mẫu bên dưới , điền thông tin và upload để import hàng loạt"
        onDownloadTemplate={downloadItemsTemplate}
        onParseFile={parseItemsExcel}
        onImport={handleImportItems}
      />
    </div>
  )
}
