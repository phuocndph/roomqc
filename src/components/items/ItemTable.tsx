import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  MoreVertical, 
  Eye, 
  Edit, 
  Copy, 
  QrCode, 
  Ban, 
  Trash2,
  Package,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Warehouse,
} from 'lucide-react'
import { PermissionGate } from '@/components/auth/PermissionGate'
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
import { useDeleteItems, useUpdateItem } from '@/hooks/useItems'
import { toast } from '@/hooks/use-toast'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { cn, formatCurrency } from '@/lib/utils'
import type { ItemWithCategory } from '@/types/items.types'
import { getFriendlyError } from '@/lib/errorMessage'
import { generateQRDataURL } from '@/lib/qrCode'

interface ItemTableProps {
  items: ItemWithCategory[]
  isLoading: boolean
  selectedItems: string[]
  onSelectionChange: (ids: string[]) => void
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: number) => void
}

export function ItemTable({
  items,
  isLoading,
  selectedItems,
  onSelectionChange,
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: ItemTableProps) {
  const navigate = useNavigate()
  
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange(items.map(item => item.id))
    } else {
      onSelectionChange([])
    }
  }
  
  const handleSelectItem = (itemId: string, checked: boolean) => {
    if (checked) {
      onSelectionChange([...selectedItems, itemId])
    } else {
      onSelectionChange(selectedItems.filter(id => id !== itemId))
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="mt-2 text-xs text-muted-foreground">Đang tải...</p>
      </div>
    )
  }
  
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center">
        <Package className="h-8 w-8 text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          Không tìm thấy tài sản
        </p>
      </div>
    )
  }
  
  const totalPages = Math.ceil(total / pageSize)
  const startIndex = (page - 1) * pageSize + 1
  const endIndex = Math.min(page * pageSize, total)
  
  const getStockColor = (status: string) => {
    switch (status) {
      case 'in_stock': return 'text-green-600'
      case 'low_stock': return 'text-yellow-600'
      case 'out_of_stock': return 'text-red-600'
      default: return 'text-muted-foreground'
    }
  }
  
  const getStockLabel = (status: string) => {
    switch (status) {
      case 'in_stock': return 'Đủ'
      case 'low_stock': return 'Thấp'
      case 'out_of_stock': return 'Hết'
      default: return status
    }
  }
  
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-10 py-2">
                <Checkbox
                  checked={selectedItems.length === items.length && items.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </TableHead>
              <TableHead className="w-12 py-2 text-xs">Ảnh</TableHead>
              <TableHead className="py-2 text-xs">Tên / Mã</TableHead>
              <TableHead className="py-2 text-xs">Danh mục</TableHead>
              <TableHead className="py-2 text-xs text-right">Giá</TableHead>
              <TableHead className="py-2 text-xs text-center">Kho</TableHead>
              <TableHead className="py-2 text-xs text-center">Phân bổ</TableHead>
              <TableHead className="py-2 text-xs text-center">Dùng</TableHead>
              <TableHead className="py-2 text-xs">Trạng thái</TableHead>
              <TableHead className="w-10 py-2"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                className="cursor-pointer hover:bg-muted/30"
                onClick={() => navigate(`/items/${item.id}`)}
              >
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <Checkbox
                    checked={selectedItems.includes(item.id)}
                    onCheckedChange={(checked) => 
                      handleSelectItem(item.id, checked as boolean)
                    }
                  />
                </TableCell>
                <TableCell className="py-2">
                  {item.item_images?.[0]?.url ? (
                    <img
                      src={item.item_images[0].url}
                      alt={item.name}
                      className="h-9 w-9 rounded object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded bg-muted">
                      <Package className="h-4 w-4 text-muted-foreground" />
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-2">
                  <div>
                    <p className="text-sm font-medium leading-tight">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.code}</p>
                  </div>
                </TableCell>
                <TableCell className="py-2">
                  {item.category_name && (
                    <span 
                      className="text-xs font-medium"
                      style={{ color: item.category_color || undefined }}
                    >
                      {item.category_name}
                    </span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-right text-sm">
                  {formatCurrency(item.unit_price)}
                </TableCell>
                <TableCell className="py-2 text-center text-sm font-medium">
                  {item.quantity_in_stock}
                </TableCell>
                <TableCell className="py-2 text-center" onClick={(e) => e.stopPropagation()}>
                  {item.warehouse_breakdown && item.warehouse_breakdown.length > 0 ? (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                          <Warehouse className="h-3 w-3 mr-1" />
                          {item.warehouse_breakdown.length}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-52 p-2" align="center">
                        <div className="space-y-1.5">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Phân bổ theo kho</p>
                          {item.warehouse_breakdown.map((wb) => (
                            <div key={wb.warehouse_id} className="flex justify-between items-center text-sm py-1 border-b last:border-0">
                              <span className="text-muted-foreground truncate max-w-[120px]" title={wb.warehouse_name}>
                                {wb.warehouse_name}
                              </span>
                              <span className="font-medium">{wb.quantity}</span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="py-2 text-center text-sm text-muted-foreground">
                  {item.quantity_in_use}
                </TableCell>
                <TableCell className="py-2">
                  <span className={cn('text-xs font-medium', getStockColor(item.stock_status))}>
                    {getStockLabel(item.stock_status)}
                  </span>
                </TableCell>
                <TableCell className="py-2" onClick={(e) => e.stopPropagation()}>
                  <ItemActions item={item} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination */}
      <div className="flex items-center justify-between border-t pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => {
              onPageSizeChange(Number(value))
              onPageChange(1)
            }}
          >
            <SelectTrigger className="h-7 w-14 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="25">25</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <span>/ {total}</span>
        </div>
        
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          
          <span className="px-2 text-xs text-muted-foreground">
            {page}/{totalPages}
          </span>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

function ItemActions({ item }: { item: ItemWithCategory }) {
  const navigate = useNavigate()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showDiscontinueDialog, setShowDiscontinueDialog] = useState(false)
  const deleteItems = useDeleteItems()
  const updateItem = useUpdateItem()
  
  const handleCopy = async () => {
    try {
      const newItem = {
        ...item,
        name: `${item.name} (Copy)`,
        code: `${item.code}-COPY-${Date.now().toString().slice(-4)}`,
      }
      // Create via the create hook would be better but we'll use a direct copy approach
      navigate('/items/new', { state: { copyFrom: item } })
      toast({
        title: 'Đang sao chép',
        description: 'Vui lòng cập nhật thông tin cho item mới',
      })
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    }
  }
  
  const handlePrintQR = async () => {
    try {
      const qrData = item.qr_code || item.code
      const src = await generateQRDataURL(qrData, 300)
      const printWindow = window.open('', '_blank', 'width=400,height=400')
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head><title>QR Code</title></head>
            <body style="display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
              <img src="${src}" style="max-width:100%;" />
            </body>
          </html>
        `)
        printWindow.document.close()
        printWindow.focus()
        printWindow.print()
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
    try {
      await updateItem.mutateAsync({
        id: item.id,
        data: { status: 'discontinued' }
      })
      setShowDiscontinueDialog(false)
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    }
  }
  
  const handleDelete = async () => {
    try {
      await deleteItems.mutateAsync([item.id])
      setShowDeleteDialog(false)
    } catch (error: any) {
      toast({
        title: 'Lỗi',
        description: getFriendlyError(error),
        variant: 'destructive',
      })
    }
  }
  
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => navigate(`/items/${item.id}`)}>
            <Eye className="mr-2 h-4 w-4" />
            Xem chi tiết
          </DropdownMenuItem>
          <PermissionGate module="items" action="update">
            <DropdownMenuItem onClick={() => navigate(`/items/${item.id}/edit`)}>
              <Edit className="mr-2 h-4 w-4" />
              Sửa
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleCopy}>
              <Copy className="mr-2 h-4 w-4" />
              Sao chép
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handlePrintQR}>
              <QrCode className="mr-2 h-4 w-4" />
              In nhãn QR
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowDiscontinueDialog(true)}>
              <Ban className="mr-2 h-4 w-4" />
              Ngừng kinh doanh
            </DropdownMenuItem>
          </PermissionGate>
          <PermissionGate module="items" action="delete">
            <DropdownMenuItem 
              onClick={() => setShowDeleteDialog(true)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Xóa
            </DropdownMenuItem>
          </PermissionGate>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận xóa</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa "{item.name}"? Hành động này không thể hoàn tác.
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
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xóa...
                </>
              ) : (
                'Xóa'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDiscontinueDialog} onOpenChange={setShowDiscontinueDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận ngừng kinh doanh</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn ngừng kinh doanh "{item.name}"? Tài sản sẽ được đánh dấu là discontinued.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updateItem.isPending}>Hủy</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDiscontinue}
              disabled={updateItem.isPending}
            >
              {updateItem.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang xử lý...
                </>
              ) : (
                'Xác nhận'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
