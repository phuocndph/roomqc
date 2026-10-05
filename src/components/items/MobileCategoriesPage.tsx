import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, ArrowLeft, PackageX, Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { MobileCategoryCard } from './MobileCategoryCard'
import { CategoryFormSheet } from './CategoryFormSheet'
import { PullToRefresh } from '@/components/mobile'
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from '@/hooks/useCategories'
import type { CategoryWithStats, CategoryFormData } from '@/types/items.types'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { navigateBack } from '@/lib/navigation'

export function MobileCategoriesPage() {
  const navigate = useNavigate()
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<CategoryWithStats | null>(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [isEditMode, setIsEditMode] = useState(false)
  
  const { data: categories, isLoading, refetch } = useCategories()
  const createMutation = useCreateCategory()
  const updateMutation = useUpdateCategory()
  const deleteMutation = useDeleteCategory()
  
  const handleCategoryClick = (category: CategoryWithStats) => {
    if (isEditMode) return
    navigate(`/items?categoryId=${category.id}`)
  }
  
  const handleOpenForm = (category?: CategoryWithStats) => {
    setEditingCategory(category || null)
    setIsFormOpen(true)
  }
  
  const handleCloseForm = () => {
    setIsFormOpen(false)
    setEditingCategory(null)
  }
  
  const handleSubmit = async (data: CategoryFormData) => {
    try {
      if (editingCategory) {
        await updateMutation.mutateAsync({ id: editingCategory.id, data })
      } else {
        await createMutation.mutateAsync(data)
      }
      handleCloseForm()
    } catch (error) {
      // Error handled by mutation
    }
  }
  
  const handleDelete = async () => {
    if (!deletingCategoryId) return
    
    try {
      await deleteMutation.mutateAsync(deletingCategoryId)
      setDeletingCategoryId(null)
    } catch (error) {
      // Error handled by mutation
    }
  }
  
  const handleRefresh = async () => {
    await refetch()
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background border-b">
        <div className="p-3">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigateBack(navigate, '/items')}
              className="shrink-0 h-9 w-9"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">Danh mục tài sản</h1>
              <p className="text-xs text-muted-foreground">{categories?.length || 0} danh mục</p>
            </div>
            <PermissionGate module="items" action="update">
              <Button
                variant={isEditMode ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setIsEditMode(!isEditMode)}
                className="h-8"
              >
                <Settings2 className="h-4 w-4 mr-1" />
                {isEditMode ? 'Xong' : 'Sửa'}
              </Button>
            </PermissionGate>
            <PermissionGate module="items" action="create">
              <Button
                size="sm"
                onClick={() => handleOpenForm()}
                className="h-8"
              >
                <Plus className="h-4 w-4 mr-1" />
                Thêm
              </Button>
            </PermissionGate>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="flex-1 overflow-auto">
        <PullToRefresh onRefresh={handleRefresh}>
          <div className="p-3 space-y-2 pb-20">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner />
              </div>
            ) : !categories || categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <PackageX className="h-6 w-6 text-muted-foreground" />
                </div>
                <h3 className="font-medium mb-1">Chưa có danh mục</h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Tạo danh mục để phân loại tài sản
                </p>
                <PermissionGate module="items" action="create">
                  <Button size="sm" onClick={() => handleOpenForm()}>
                    <Plus className="h-4 w-4 mr-1" />
                    Thêm danh mục
                  </Button>
                </PermissionGate>
              </div>
            ) : (
              categories.map((category) => (
                <MobileCategoryCard
                  key={category.id}
                  category={category}
                  onClick={() => handleCategoryClick(category)}
                  onEdit={handleOpenForm}
                  onDelete={setDeletingCategoryId}
                  showActions={isEditMode}
                />
              ))
            )}
          </div>
        </PullToRefresh>
      </div>
      
      {/* Form Sheet */}
      <CategoryFormSheet
        open={isFormOpen}
        onOpenChange={handleCloseForm}
        category={editingCategory}
        onSubmit={handleSubmit}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
      
      {/* Delete Dialog */}
      <AlertDialog open={!!deletingCategoryId} onOpenChange={(open) => !open && setDeletingCategoryId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa danh mục này? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
