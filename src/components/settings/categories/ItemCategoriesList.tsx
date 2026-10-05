import { useState } from 'react'
import { Plus, Search, MoreVertical, Edit, Trash2, Package, FileUp, FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useItemCategories, useDeleteItemCategory, useCreateItemCategory } from '@/hooks/useItemCategories'
import { Skeleton } from '@/components/ui/skeleton'
import { CreateItemCategoryDialog } from './CreateItemCategoryDialog'
import { ImportExcelDialog } from '@/components/shared/ImportExcelDialog'
import { downloadCategoriesTemplate, parseCategoriesExcel, type CategoryImportRow } from '@/lib/importUtils'
import { useUser } from '@/hooks/useUser'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useHotelContext } from '@/contexts/HotelContext'
import { toast } from 'sonner'
import { ITEM_TYPE_LABELS, type ItemType } from '@/types/items.types'

export function ItemCategoriesList() {
  const [search, setSearch] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const { data: categories, isLoading } = useItemCategories()
  const deleteCategory = useDeleteItemCategory()
  const { tenantId } = useUser()
  const { selectedHotel } = useHotelContext()
  const queryClient = useQueryClient()

  const filteredCategories = categories?.filter(
    (cat) =>
      cat.name.toLowerCase().includes(search.toLowerCase()) ||
      cat.code?.toLowerCase().includes(search.toLowerCase())
  )

  const handleDelete = (id: string) => {
    if (confirm('Bạn có chắc muốn xóa danh mục này?')) {
      deleteCategory.mutate(id)
    }
  }

  const handleImportCategories = async (data: CategoryImportRow[]): Promise<{ success: number; failed: number }> => {
    let success = 0
    let failed = 0

    if (!tenantId) {
      toast.error('Thiếu thông tin tenant')
      return { success: 0, failed: data.length }
    }

    if (!selectedHotel?.id) {
      toast.error('Vui lòng chọn khách sạn trước khi import danh mục')
      return { success: 0, failed: data.length }
    }

    for (const category of data) {
      try {
        // Generate code if not provided
        const code = category.code || category.name.toUpperCase().replace(/\s+/g, '_').slice(0, 20)

        const { error } = await supabase.from('item_categories').insert({
          tenant_id: tenantId,
          hotel_id: selectedHotel.id,
          name: category.name,
          name_en: category.name_en || null,
          code,
          description: category.description || null,
          icon: category.icon || '📦',
          color: category.color || '#6B7280',
          sort_order: category.sort_order || 0,
          status: 'active',
        })

        if (error) {
          console.error('Import category error:', error)
          failed++
        } else {
          success++
        }
      } catch {
        failed++
      }
    }

    queryClient.invalidateQueries({ queryKey: ['item-categories'] })
    
    return { success, failed }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Tìm danh mục..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <FileUp className="h-4 w-4 mr-2" />
            Import Excel
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Thêm danh mục
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : filteredCategories && filteredCategories.length > 0 ? (
        <div className="space-y-3">
          {filteredCategories.map((category) => (
            <Card key={category.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1">
                  <div className="text-2xl">{category.icon || '📦'}</div>
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{category.name}</h3>
                      {category.code && (
                        <Badge variant="secondary">{category.code}</Badge>
                      )}
                      {category.default_item_type && (
                        <Badge variant="outline">
                          {ITEM_TYPE_LABELS[category.default_item_type as ItemType]}
                        </Badge>
                      )}
                      <Badge variant={category.status === 'active' ? 'default' : 'secondary'}>
                        {category.status === 'active' ? 'Hoạt động' : 'Tạm dừng'}
                      </Badge>
                    </div>
                    {category.description && (
                      <p className="text-sm text-muted-foreground">{category.description}</p>
                    )}
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Tài sản: {category._count?.items || 0}</span>
                      {category.min_stock_level && (
                        <span>Tồn tối thiểu: {category.min_stock_level}</span>
                      )}
                      {category.reorder_point && (
                        <span>Điểm đặt hàng: {category.reorder_point}</span>
                      )}
                    </div>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Thêm tùy chọn">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem>
                      <Edit className="h-4 w-4 mr-2" />
                      Chỉnh sửa
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive"
                      onClick={() => handleDelete(category.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Xóa
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Không tìm thấy danh mục</p>
          <p className="text-sm">Tạo danh mục đầu tiên để bắt đầu</p>
        </div>
      )}

      <CreateItemCategoryDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      
      <ImportExcelDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        title="Import Danh mục từ Excel"
        description="Tải file mẫu bên dưới , điền thông tin và upload để import hàng loạt"
        onDownloadTemplate={downloadCategoriesTemplate}
        onParseFile={parseCategoriesExcel}
        onImport={handleImportCategories}
      />
    </div>
  )
}
