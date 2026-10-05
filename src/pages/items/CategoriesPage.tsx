import { useState } from 'react'
import { ArrowLeft, Plus, Edit, Trash2, Package, AlertTriangle, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { supabase } from '@/integrations/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useBreakpoint } from '@/lib/breakpoints'
import { toast } from '@/hooks/use-toast'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { MobileCategoriesPage } from '@/components/items/MobileCategoriesPage'
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
} from '@/hooks/useCategories'
import { useUser } from '@/hooks/useUser'
import { useHotelContext } from '@/contexts/HotelContext'
import { useTranslation } from 'react-i18next'
import type { CategoryFormData } from '@/types/items.types'
import { getFriendlyError } from '@/lib/errorMessage'

export function CategoriesPage() {
  const { t } = useTranslation(['items', 'common'])
  const navigate = useNavigate()
  const { isMobile } = useBreakpoint()
  const { user: authUser } = useAuth()
  const { tenantId, hotelId, user: profile } = useUser()
  const { selectedHotel, isAllHotelsMode } = useHotelContext()
  const effectiveHotelId = isAllHotelsMode ? null : (selectedHotel?.id ?? hotelId ?? null)

  const { data: categories, isLoading } = useCategories()
  const createCategory = useCreateCategory()
  const updateCategory = useUpdateCategory()
  const deleteCategory = useDeleteCategory()
  
  // ALL useState hooks MUST be declared BEFORE any conditional returns
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<any>(null)
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null)
  const [isFixing, setIsFixing] = useState(false)
  const [showTenantAlert, setShowTenantAlert] = useState(true)
  const canAutoFix = !tenantId && profile?.status === 'pending_setup'

  const [formData, setFormData] = useState<CategoryFormData>({
    name: '',
    name_en: '',
    description: '',
    color: '#3b82f6',
    icon: 'package',
    sort_order: 0,
  })

  // Mobile view - AFTER all hooks
  if (isMobile) {
    return <MobileCategoriesPage />
  }

  const handleOpenDialog = (category?: any) => {
    if (category) {
      setEditingCategory(category)
      setFormData({
        name: category.name,
        name_en: category.name_en || '',
        description: category.description || '',
        color: category.color || '#3b82f6',
        icon: category.icon || 'package',
        sort_order: category.sort_order || 0,
      })
    } else {
      setEditingCategory(null)
      setFormData({
        name: '',
        name_en: '',
        description: '',
        color: '#3b82f6',
        icon: 'package',
        sort_order: 0,
      })
    }
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      return
    }
    
    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({
          id: editingCategory.id,
          data: formData,
        })
      } else {
        await createCategory.mutateAsync(formData)
      }
      setDialogOpen(false)
    } catch (error) {
      // Error handled by mutation
      console.error('Submit error:', error)
    }
  }

  const handleDelete = async () => {
    if (!deletingCategoryId) return
    try {
      await deleteCategory.mutateAsync(deletingCategoryId)
      setDeleteDialogOpen(false)
      setDeletingCategoryId(null)
    } catch (error) {
      // Error handled by mutation
    }
  }

  const handleAutoFix = async () => {
    if (!authUser?.id || !authUser?.email) {
      toast({
        title: 'Lỗi',
        description: 'Không tìm thấy thông tin user. Vui lòng đăng nhập lại.',
        variant: 'destructive',
      })
      return
    }

    setIsFixing(true)
    
    try {
      const { data, error } = await supabase.rpc('complete_registration', {
        p_user_id: authUser.id,
        p_full_name: authUser.email.split('@')[0] || 'User',
        p_email: authUser.email,
        p_phone: '0123456789',
        p_tenant_name: 'Công ty của tôi',
        p_hotel_name: 'Khách sạn của tôi',
        p_hotel_address: '123 Đường ABC, TP.HCM',
        p_hotel_phone: '0123456789',
        p_hotel_email: authUser.email,
        p_total_rooms: 50
      })

      if (error) throw error
      
      const result = data as any
      if (result?.success) {
        toast({
          title: 'Thành công!',
          description: 'Đã tạo tenant và hotel. Đang tải lại trang...',
        })
        
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        throw new Error(result?.error || 'Không thể tạo tenant/hotel')
      }
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    } finally {
      setIsFixing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/items')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">{t('categoriesPage.loading')}</h1>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/items')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold">{t('categoriesPage.title')}</h1>
            <p className="text-muted-foreground">{t('categoriesPage.description')}</p>
          </div>
        </div>
        <PermissionGate module="items" action="create">
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            {t('categoriesPage.addCategory')}
          </Button>
        </PermissionGate>
      </div>

      {/* Tenant/Hotel Missing Alert */}
      {showTenantAlert && (!tenantId || (!effectiveHotelId && !isAllHotelsMode)) && (
        <Alert variant="destructive" className="border-orange-500 bg-orange-50 dark:bg-orange-950">
          <AlertTriangle className="h-4 w-4 text-orange-600" />
          <AlertTitle className="text-orange-900 dark:text-orange-100">
            {!tenantId ? 'Thiếu cấu hình tenant' : 'Chưa chọn khách sạn'}
          </AlertTitle>
          <AlertDescription className="text-orange-800 dark:text-orange-200 space-y-3">
            <p>
              {!tenantId
                ? 'Hệ thống chưa xác định tenant cho tài khoản của bạn (tenant_id).'
                : 'Bạn cần chọn khách sạn để hiển thị danh mục (hotel).'}
            </p>
            <p className="text-sm">
              {canAutoFix
                ? 'Tài khoản mới chưa hoàn tất thiết lập. Hãy mở trang onboarding để nhập thông tin thật.'
                : 'Tài khoản này không ở trạng thái đăng ký mới. Liên hệ quản trị viên để cấp lại tenant/khách sạn.'}
            </p>
            <div className="flex gap-2">
              {canAutoFix && (
                <Button onClick={() => navigate('/onboarding')} size="sm" className="bg-orange-600 hover:bg-orange-700">
                  Hoàn tất thiết lập
                </Button>
              )}
              <Button 
                onClick={() => navigate('/settings/system-test')}
                variant="outline"
                size="sm"
              >
                Đi đến System Test
              </Button>
              <Button 
                onClick={() => setShowTenantAlert(false)}
                variant="ghost"
                size="sm"
              >
                Đóng
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {categories?.map((category) => (
          <div
            key={category.id}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/items?categoryId=${category.id}`)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                navigate(`/items?categoryId=${category.id}`)
              }
            }}
            className="border rounded-lg p-4 hover:bg-accent/50 transition-colors cursor-pointer"
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: `${category.color}20` }}
              >
                <Package className="w-5 h-5" style={{ color: category.color }} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-medium truncate">{category.name}</h3>
                    {category.name_en && (
                      <p className="text-xs text-muted-foreground truncate">{category.name_en}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {category.items_count || 0} {t('categoriesPage.items')}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>

                {category.description && (
                  <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                    {category.description}
                  </p>
                )}
              </div>

              <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                <PermissionGate module="items" action="update">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleOpenDialog(category)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                </PermissionGate>
                <PermissionGate module="items" action="delete">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setDeletingCategoryId(category.id)
                      setDeleteDialogOpen(true)
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </PermissionGate>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? t('categoriesPage.editCategory') : t('categoriesPage.createCategory')}
            </DialogTitle>
            <DialogDescription>
              {t('categoriesPage.enterInfo')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">{t('categoriesPage.categoryName')} *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="name_en">{t('categoriesPage.categoryNameEn')}</Label>
              <Input
                id="name_en"
                value={formData.name_en}
                onChange={(e) => setFormData({ ...formData, name_en: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">{t('categoriesPage.categoryDescription')}</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="color">{t('categoriesPage.categoryColor')}</Label>
                <Input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="sort_order">{t('categoriesPage.sortOrder')}</Label>
                <Input
                  id="sort_order"
                  type="number" min={0}
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('common:buttons.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || createCategory.isPending || updateCategory.isPending}
            >
              {editingCategory ? t('common:buttons.update') : t('common:buttons.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('categoriesPage.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('categoriesPage.deleteDescription')}
              <br />
              <strong className="text-destructive">
                {t('categoriesPage.deleteWarning')}
              </strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common:buttons.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common:buttons.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
