import { 
  Copy, 
  Printer, 
  Trash2,
  Download,
  Upload,
  Settings,
  AlertCircle,
  MapPin,
  Calendar,
  FileText,
  Package,
} from 'lucide-react'
import { ResponsiveDialog } from '@/components/mobile/ResponsiveDialog'
import { PermissionGate } from '@/components/auth/PermissionGate'
import { Button } from '@/components/ui/button'
import { TouchButton } from '@/components/mobile/TouchOptimized'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/separator'
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/components/ui/carousel'
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
import { useState } from 'react'
import { useInventoryTransaction, useDeleteTransaction } from '@/hooks/useInventoryTransactions'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useBreakpoint } from '@/lib/breakpoints'

interface TransactionDetailDialogProps {
  transactionId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const transactionIcons: Record<string, any> = {
  in: Download,
  out: Upload,
  adjust: Settings,
  damaged: AlertCircle,
  lost: AlertCircle,
}

const transactionLabels: Record<string, string> = {
  in: 'NHẬP KHO',
  out: 'XUẤT KHO',
  transfer: 'CHUYỂN KHO',
  adjust: 'ĐIỀU CHỈNH',
  damaged: 'HƯ HỎNG',
  lost: 'MẤT MÁT',
}

const transactionVariants: Record<string, 'default' | 'destructive' | 'secondary'> = {
  in: 'default',
  out: 'secondary',
  adjust: 'secondary',
  damaged: 'destructive',
  lost: 'destructive',
}

export function TransactionDetailDialog({
  transactionId,
  open,
  onOpenChange,
}: TransactionDetailDialogProps) {
  const { isMobile } = useBreakpoint()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const { data: transaction, isLoading } = useInventoryTransaction(transactionId || undefined)
  const { mutate: deleteTransaction, isPending: isDeleting } = useDeleteTransaction()
  
  if (!transaction || isLoading) {
    return null
  }
  
  const Icon = transactionIcons[transaction.transaction_type]
  const label = transactionLabels[transaction.transaction_type]
  const variant = transactionVariants[transaction.transaction_type]
  
  const canDelete = 
    (Date.now() - new Date(transaction.created_at).getTime()) / (1000 * 60 * 60) < 24
  
  const handleCopy = () => {
    navigator.clipboard.writeText(transaction.transaction_code)
    toast.success('Đã sao chép mã giao dịch')
  }
  
  const handlePrint = () => {
    window.print()
  }
  
  const handleDelete = () => {
    if (transactionId) {
      deleteTransaction(transactionId, {
        onSuccess: () => {
          setShowDeleteConfirm(false)
          onOpenChange(false)
        },
      })
    }
  }

  const hasImages = transaction.photos && transaction.photos.length > 0
  const hasDocuments = transaction.documents && transaction.documents.length > 0
  
  return (
    <>
      <ResponsiveDialog
        open={open}
        onOpenChange={onOpenChange}
        title={transaction.transaction_code}
      >
        {isMobile ? (
          <div className="space-y-4 pb-4">
            <div className="flex items-center justify-between">
              <Badge variant={variant} className="gap-1.5">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {format(new Date(transaction.created_at), 'dd/MM/yyyy HH:mm', { locale: vi })}
              </span>
            </div>

            {hasImages && (
              <Carousel className="w-full">
                <CarouselContent>
                  {transaction.photos!.map((photo, index) => (
                    <CarouselItem key={index}>
                      <div className="aspect-video rounded-lg overflow-hidden bg-muted">
                        <img 
                          src={photo} 
                          alt={`Ảnh ${index + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    </CarouselItem>
                  ))}
                </CarouselContent>
                {transaction.photos!.length > 1 && (
                  <>
                    <CarouselPrevious className="left-2" />
                    <CarouselNext className="right-2" />
                  </>
                )}
              </Carousel>
            )}

            <div className="space-y-2">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                  {transaction.item?.item_images?.[0]?.url ? (
                    <img
                      src={transaction.item.item_images[0].url}
                      alt={transaction.item.name}
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <Package className="h-6 w-6 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-base truncate">
                    {transaction.item?.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {transaction.item?.code}
                  </p>
                  {transaction.item?.category && (
                    <Badge variant="outline" className="mt-1">
                      {transaction.item.category.name}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="p-3 bg-muted/50 rounded-lg border">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Package className="h-4 w-4" />
                <span className="text-xs">Số lượng</span>
              </div>
              <p className={cn(
                'text-xl font-bold',
                transaction.transaction_type === 'in' ? 'text-success' : 'text-destructive'
              )}>
                {transaction.transaction_type === 'in' ? '+' : '-'}{transaction.quantity}
              </p>
            </div>

            <div className="p-3 bg-muted/30 rounded-lg space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Trước:</span>
                <span className="font-medium">{transaction.quantity_before}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Sau:</span>
                <span className="font-medium">{transaction.quantity_after}</span>
              </div>
              <Separator />
              <div className="flex justify-between text-sm font-semibold">
                <span>Thay đổi:</span>
                <span className={cn(
                  transaction.transaction_type === 'in' ? 'text-success' : 'text-destructive'
                )}>
                  {transaction.transaction_type === 'in' ? '+' : '-'}{transaction.quantity}
                </span>
              </div>
            </div>

            {(transaction.from_location || transaction.to_location) && (
              <div className="space-y-2">
                {transaction.from_location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Từ:</span>
                    <span className="font-medium">{transaction.from_location}</span>
                  </div>
                )}
                {transaction.to_location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Đến:</span>
                    <span className="font-medium">{transaction.to_location}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20">
              <Avatar className="h-10 w-10">
                <AvatarImage src={transaction.created_by_user?.avatar_url} />
                <AvatarFallback className="bg-primary/10">
                  {transaction.created_by_user?.full_name?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <p className="font-medium text-sm">{transaction.created_by_user?.full_name}</p>
                <p className="text-xs text-muted-foreground">Người tạo</p>
              </div>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </div>

            {transaction.notes && (
              <div className="p-3 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Ghi chú</span>
                </div>
                <p className="text-sm text-muted-foreground">{transaction.notes}</p>
              </div>
            )}

            {hasDocuments && (
              <div className="space-y-2">
                <h3 className="font-semibold text-sm">Tài liệu</h3>
                <div className="flex flex-wrap gap-2">
                  {transaction.documents!.map((doc, index) => (
                    <Button key={index} variant="outline" size="sm" asChild>
                      <a href={doc} target="_blank" rel="noopener noreferrer">
                        <FileText className="mr-2 h-4 w-4" />
                        Tài liệu {index + 1}
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 pt-2">
              <TouchButton
                variant="outline"
                className="w-full justify-start"
                onClick={handleCopy}
              >
                <Copy className="mr-2 h-4 w-4" />
                Sao chép mã giao dịch
              </TouchButton>
              
              <PermissionGate module="inventory" action="delete">
                {canDelete && (
                  <TouchButton
                    variant="destructive"
                    className="w-full justify-start"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Xóa giao dịch
                  </TouchButton>
                )}
              </PermissionGate>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn('rounded-lg p-2', transactionVariants[transaction.transaction_type] === 'default' ? 'bg-success/10 text-success' : transactionVariants[transaction.transaction_type] === 'destructive' ? 'bg-destructive/10 text-destructive' : 'bg-warning/10 text-warning')}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{transaction.transaction_code}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopy}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                  <Badge variant={variant}>{label}</Badge>
                </div>
              </div>
            </div>
            
            <div className="space-y-3">
              <h3 className="font-semibold">Thông tin giao dịch</h3>
              <div className="grid gap-3 rounded-lg border p-4">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Thời gian:</span>
                  <span className="font-medium">
                    {format(new Date(transaction.created_at), 'PPP HH:mm', { locale: vi })}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Người thực hiện:</span>
                  <div className="flex items-center gap-2">
                    <Avatar className="h-5 w-5">
                      <AvatarImage src={transaction.created_by_user?.avatar_url} />
                      <AvatarFallback>
                        {transaction.created_by_user?.full_name?.charAt(0)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="font-medium">
                      {transaction.created_by_user?.full_name}
                    </span>
                  </div>
                </div>
                
                {transaction.from_location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Từ:</span>
                    <span className="font-medium">{transaction.from_location}</span>
                  </div>
                )}
                
                {transaction.to_location && (
                  <div className="flex items-center gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">Đến:</span>
                    <span className="font-medium">{transaction.to_location}</span>
                  </div>
                )}
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <h3 className="font-semibold">Chi tiết đồ dùng</h3>
              <div className="rounded-lg border p-4">
                <div className="flex items-start gap-4">
                  {transaction.item?.item_images?.[0]?.url && (
                    <img
                      src={transaction.item.item_images[0].url}
                      alt={transaction.item.name}
                      className="h-20 w-20 rounded-lg object-cover"
                    />
                  )}
                  <div className="flex-1 space-y-2">
                    <div>
                      <p className="font-semibold">{transaction.item?.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {transaction.item?.code}
                      </p>
                      {transaction.item?.category && (
                        <Badge variant="outline" className="mt-1">
                          {transaction.item.category.name}
                        </Badge>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-1 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Số lượng:</p>
                        <p className={cn(
                          'text-lg font-bold',
                          transaction.transaction_type === 'in' ? 'text-success' : 'text-destructive'
                        )}>
                          {transaction.transaction_type === 'in' ? '+' : '-'}{transaction.quantity}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <h3 className="font-semibold">Số lượng trước/sau</h3>
              <div className="grid grid-cols-3 gap-4 rounded-lg border p-4">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Trước giao dịch</p>
                  <p className="text-2xl font-bold">{transaction.quantity_before}</p>
                </div>
                <div className="flex items-center justify-center">
                  <div className={cn(
                    'rounded-full p-2',
                    transaction.transaction_type === 'in' ? 'bg-success/10' : 'bg-destructive/10'
                  )}>
                    {transaction.transaction_type === 'in' ? (
                      <Download className="h-5 w-5 text-success" />
                    ) : (
                      <Upload className="h-5 w-5 text-destructive" />
                    )}
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">Sau giao dịch</p>
                  <p className="text-2xl font-bold">{transaction.quantity_after}</p>
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm text-muted-foreground">Thay đổi</p>
                <p className={cn(
                  'text-xl font-bold',
                  transaction.transaction_type === 'in' ? 'text-success' : 'text-destructive'
                )}>
                  {transaction.transaction_type === 'in' ? '+' : '-'}{transaction.quantity}
                </p>
              </div>
            </div>
            
            {transaction.notes && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold">Ghi chú</h3>
                  <p className="text-sm text-muted-foreground">{transaction.notes}</p>
                </div>
              </>
            )}
            
            {transaction.documents && transaction.documents.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold">Tài liệu</h3>
                  <div className="flex flex-wrap gap-2">
                    {transaction.documents.map((doc, index) => (
                      <Button key={index} variant="outline" size="sm" asChild>
                        <a href={doc} target="_blank" rel="noopener noreferrer">
                          <FileText className="mr-2 h-4 w-4" />
                          Tài liệu {index + 1}
                        </a>
                      </Button>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            {transaction.photos && transaction.photos.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-semibold">Hình ảnh</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {transaction.photos.map((photo, index) => (
                      <a
                        key={index}
                        href={photo}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group relative aspect-square overflow-hidden rounded-lg border"
                      >
                        <img
                          src={photo}
                          alt={`Photo ${index + 1}`}
                          className="h-full w-full object-cover transition-transform group-hover:scale-110"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
                          <Package className="h-6 w-6 text-white" />
                        </div>
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
            
            <div className="flex justify-between border-t pt-4">
              <div className="flex gap-2">
                <Button variant="outline" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  In phiếu
                </Button>
              </div>
              
              <PermissionGate module="inventory" action="delete">
                {canDelete && (
                  <Button
                    variant="destructive"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Hủy giao dịch
                  </Button>
                )}
              </PermissionGate>
            </div>
          </div>
        )}
      </ResponsiveDialog>
      
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận hủy giao dịch</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc chắn muốn hủy giao dịch này? Số lượng sẽ được hoàn về trạng thái trước đó.
              Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Đang xử lý...' : 'Xác nhận hủy'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
