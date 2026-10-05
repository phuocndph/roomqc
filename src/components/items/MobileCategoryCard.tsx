import { useState } from 'react'
import { ChevronRight, Edit2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { CategoryWithStats } from '@/types/items.types'

interface MobileCategoryCardProps {
  category: CategoryWithStats
  onClick?: () => void
  onEdit?: (category: CategoryWithStats) => void
  onDelete?: (categoryId: string) => void
  showActions?: boolean
}

export function MobileCategoryCard({ 
  category, 
  onClick, 
  onEdit, 
  onDelete,
  showActions = false 
}: MobileCategoryCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  return (
    <>
    <div 
      className="flex items-center gap-3 p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      {/* Icon */}
      <div
        className="h-10 w-10 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${category.color}20` }}
      >
        <span className="text-lg">{category.icon || '📦'}</span>
      </div>
      
      {/* Name & count */}
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{category.name}</p>
        <p className="text-xs text-muted-foreground">
          {category.items_count} sản phẩm
        </p>
      </div>
      
      {/* Actions or Arrow */}
      {showActions && onEdit && onDelete ? (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onEdit(category)}
            className="h-8 w-8 p-0"
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmOpen(true)}
            className="h-8 w-8 p-0 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
      )}
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Xóa danh mục?</AlertDialogTitle>
          <AlertDialogDescription>
            Bạn có chắc chắn muốn xóa danh mục "{category.name}"? Hành động này không thể hoàn tác.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Hủy</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => onDelete?.(category.id)}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Xóa
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}