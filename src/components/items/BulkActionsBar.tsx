import { X, Trash2, FileDown, QrCode, Ban, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Card } from '@/components/ui/card'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { useDeleteItems } from '@/hooks/useItems'
import { supabase } from '@/integrations/supabase/client'
import { toast } from '@/hooks/use-toast'
import { exportItemsToExcel } from '@/lib/exportUtils'
import { generateQRDataURL } from '@/lib/qrCode'
import { useState } from 'react'
import { LoadingSpinner } from '@/components/shared/LoadingSpinner'
import { getFriendlyError } from '@/lib/errorMessage'

interface BulkActionsBarProps {
  selectedCount: number
  selectedItems: string[]
  onClearSelection: () => void
}

export function BulkActionsBar({
  selectedCount,
  selectedItems,
  onClearSelection,
}: BulkActionsBarProps) {
  const deleteItems = useDeleteItems()
  const [isExporting, setIsExporting] = useState(false)
  const [isDiscontinuing, setIsDiscontinuing] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  
  const handleExport = async () => {
    try {
      setIsExporting(true)
      
      // Fetch selected items with category info
      const { data, error } = await supabase
        .from('items')
        .select(`
          *,
          item_categories!items_category_id_fkey(name)
        `)
        .in('id', selectedItems)
      
      if (error) throw error
      
      // Transform data for export
      const itemsWithCategory = data.map(item => ({
        ...item,
        category_name: item.item_categories?.name || null,
        stock_status: getStockStatus(item)
      }))
      
      const filename = await exportItemsToExcel(itemsWithCategory, 'selected-items')
      
      toast({
        title: 'Thành công',
        description: `Đã xuất ${selectedItems.length} items ra file ${filename}`,
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
  
  const getStockStatus = (item: any): string => {
    if (item.quantity_available === 0) return 'out_of_stock'
    if (item.quantity_available <= item.minimum_stock) return 'low_stock'
    return 'in_stock'
  }
  
  const handlePrintQR = async () => {
    try {
      const qrItems = await Promise.all(
        selectedItems.map(async (id) => ({
          id,
          src: await generateQRDataURL(id, 200),
        }))
      )

      const printWindow = window.open('', '_blank', 'width=800,height=600')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>QR Codes - Print</title>
              <style>
                body { display: flex; flex-wrap: wrap; gap: 20px; padding: 20px; }
                .qr-item { page-break-inside: avoid; text-align: center; }
                img { display: block; margin: 0 auto; }
                @media print { .no-print { display: none; } }
              </style>
            </head>
            <body>
              ${qrItems.map(({ id, src }) => `
                <div class="qr-item">
                  <img src="${src}" />
                  <p>${id}</p>
                </div>
              `).join('')}
              <button class="no-print" onclick="window.print()">Print All</button>
            </body>
          </html>
        `)
        printWindow.document.close()
      }
    } catch (error: any) {
      toast({
        title: 'Lỗi tạo QR',
        description: error.message || 'Không thể tạo mã QR. Vui lòng thử lại.',
        variant: 'destructive',
      })
    }
  }
  
  const handleDiscontinue = async () => {
    // Bulk update items to discontinued status
    try {
      setIsDiscontinuing(true)
      const { error } = await supabase
        .from('items')
        .update({ status: 'discontinued' })
        .in('id', selectedItems)
      
      if (error) throw error
      
      toast({
        title: 'Thành công',
        description: `Đã ngừng kinh doanh ${selectedItems.length} items`,
      })
      onClearSelection()
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    } finally {
      setIsDiscontinuing(false)
    }
  }
  
  const handleDelete = async () => {
    await deleteItems.mutateAsync(selectedItems)
    setShowDeleteDialog(false)
    onClearSelection()
  }
  
  return (
    <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-lg border bg-background px-3 py-2 shadow-md">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-7 w-7 p-0"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
        <span className="text-xs font-medium">
          {selectedCount} đã chọn
        </span>
      </div>
      
      <div className="h-4 w-px bg-border" />
      
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleExport} disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
          ) : (
            <FileDown className="mr-1 h-3.5 w-3.5" />
          )}
          Excel
        </Button>
        
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handlePrintQR}>
          <QrCode className="mr-1 h-3.5 w-3.5" />
          QR
        </Button>
        
        <PermissionGate module="items" action="update">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={handleDiscontinue} disabled={isDiscontinuing}>
            {isDiscontinuing ? (
              <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Ban className="mr-1 h-3.5 w-3.5" />
            )}
            Ngừng
          </Button>
        </PermissionGate>
        
        <PermissionGate module="items" action="delete">
          <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive">
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Xóa
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
                <AlertDialogDescription>
                  Bạn có chắc muốn xóa {selectedCount} items đã chọn?
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={deleteItems.isPending}>Hủy</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  disabled={deleteItems.isPending}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleteItems.isPending ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      Đang xóa...
                    </>
                  ) : (
                    'Xóa'
                  )}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </PermissionGate>
      </div>
    </div>
  )
}
