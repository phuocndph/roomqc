import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Edit, Eye, MoreVertical, Trash2, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

interface MobileItemCardProps {
  item: {
    id?: string
    code: string
    name: string
    category_name?: string
    category_color?: string
    category?: string
    quantity_in_stock?: number
    quantity_total?: number
    quantity?: number
    unit?: string
    location?: string
    status?: string
    stock_status?: 'in_stock' | 'low_stock' | 'out_of_stock'
    unit_price?: number
    item_images?: Array<{ url: string; is_primary?: boolean }>
  }
  onView?: () => void
  onEdit?: () => void
  onDelete?: () => void
}

export function MobileItemCard({ item, onView, onEdit, onDelete }: MobileItemCardProps) {
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { t } = useTranslation(['items', 'common'])

  const quantity = item.quantity_in_stock ?? item.quantity_total ?? item.quantity ?? 0
  const stockStatus = item.stock_status || (quantity < 10 ? 'low_stock' : 'in_stock')
  const categoryName = item.category_name || item.category
  const primaryImage = item.item_images?.find(img => img.is_primary)?.url || item.item_images?.[0]?.url

  const getStockColor = () => {
    switch (stockStatus) {
      case 'in_stock': return 'text-green-600'
      case 'low_stock': return 'text-yellow-600'
      case 'out_of_stock': return 'text-red-600'
      default: return 'text-muted-foreground'
    }
  }

  const getStockLabel = () => {
    switch (stockStatus) {
      case 'in_stock': return 'Đủ'
      case 'low_stock': return 'Thấp'
      case 'out_of_stock': return 'Hết'
      default: return ''
    }
  }

  return (
    <div 
      className="flex gap-3 p-3 border-b hover:bg-muted/30 cursor-pointer"
      onClick={onView}
    >
      {/* Image */}
      <div className="w-12 h-12 rounded bg-muted flex-shrink-0 overflow-hidden">
        {primaryImage ? (
          <img 
            src={primaryImage} 
            alt={item.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Package className="h-5 w-5 text-muted-foreground/50" />
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start">
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium truncate">{item.name}</h3>
            <p className="text-xs text-muted-foreground">{item.code}</p>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 -mr-1 -mt-1">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {onView && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onView(); }}>
                  <Eye className="h-3.5 w-3.5 mr-2" />
                  Chi tiết
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  <Edit className="h-3.5 w-3.5 mr-2" />
                  Sửa
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setConfirmOpen(true); }} className="text-destructive">
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Xóa
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Info Row */}
        <div className="flex items-center gap-3 mt-1 text-xs">
          {categoryName && (
            <span 
              className="font-medium"
              style={{ color: item.category_color || undefined }}
            >
              {categoryName}
            </span>
          )}
          <span className="text-muted-foreground">
            {quantity} {item.unit || 'cái'}
          </span>
          <span className={cn('font-medium', getStockColor())}>
            {getStockLabel()}
          </span>
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa sản phẩm?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn xóa "{item.name}" ({item.code})? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onDelete?.()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
