import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { navigateBack } from '@/lib/navigation'
import { 
  ArrowLeft, 
  Package, 
  CheckCircle, 
  AlertTriangle, 
  TrendingDown, 
  TrendingUp,
  Play,
  Clock,
  XCircle,
  Printer,
  Download,
  User,
  Calendar,
  FileText,
  Search,
  Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Textarea } from '@/components/ui/textarea'
import { 
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { 
  useStockAdjustment,
  useApproveAdjustment,
  useRejectAdjustment,
  useApproveItem,
} from '@/hooks/useStockAdjustments'
import { useUser } from '@/hooks/useUser'
import { isAdminUser, isManager } from '@/lib/userAccess'
import { formatCurrency, formatDate } from '@/lib/utils'
import { ScrollArea } from '@/components/ui/scroll-area'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { PostApprovalActions } from '@/components/inventory/adjustments/PostApprovalActions'
import { InvestigationDialog } from '@/components/inventory/adjustments/InvestigationDialog'

export function MobileAdjustmentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useUser()
  const { data: adjustment, isLoading } = useStockAdjustment(id!)
  const { mutate: approve, isPending: isApproving } = useApproveAdjustment()
  const { mutate: reject, isPending: isRejecting } = useRejectAdjustment()
  const { mutate: approveItem, isPending: isApprovingItem } = useApproveItem()
  
  const [showApproveSheet, setShowApproveSheet] = useState(false)
  const [showRejectSheet, setShowRejectSheet] = useState(false)
  const [approvalNotes, setApprovalNotes] = useState('')
  const [rejectionReason, setRejectionReason] = useState('')
  const [selectedItem, setSelectedItem] = useState<any>(null)
  const [showInvestigationDialog, setShowInvestigationDialog] = useState(false)

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!adjustment) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="text-center py-12">
          <Package className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Không tìm thấy phiếu kiểm kê</p>
        </div>
      </div>
    )
  }

  const adjustmentData = adjustment as any
  const adj = adjustmentData.adjustment
  const items = adjustmentData.items || []

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      draft: { label: 'Nháp', variant: 'secondary' },
      in_progress: { label: 'Đang kiểm', variant: 'default' },
      completed: { label: 'Chờ duyệt', variant: 'outline' },
      approved: { label: 'Đã duyệt', variant: 'default' },
      rejected: { label: 'Từ chối', variant: 'destructive' }
    }
    return variants[status] || { label: status, variant: 'secondary' }
  }

  const statusBadge = getStatusBadge(adj.status)
  
  const stats = {
    total: items.length,
    checked: items.filter((i: any) => i.actual_quantity !== null).length,
    matched: items.filter((i: any) => i.actual_quantity === i.system_quantity).length,
    discrepancy: items.filter((i: any) => i.actual_quantity !== null && i.actual_quantity !== i.system_quantity).length,
    pending: items.filter((i: any) => i.status === 'pending').length,
    investigating: items.filter((i: any) => i.investigation_status === 'investigating').length,
  }
  
  const totalValueDifference = items.reduce((sum: number, item: any) => {
    const diff = ((item.actual_quantity || 0) - item.system_quantity) * (item.unit_price || 0)
    return sum + diff
  }, 0)
  
  // Staff chỉ được kiểm tra phiếu được gán, Manager/Owner được kiểm tra tất cả
  const isAssignedToMe = adj.assigned_to?.includes(user?.id)
  const canContinue = (adj.status === 'draft' || adj.status === 'in_progress') &&
    (isAssignedToMe || isAdminUser(user as any))
  const canApprove = adj.status === 'completed' && 
    (isAdminUser(user as any) || isManager(user as any))
  
  // Filter items by status
  const matchedItems = items.filter((i: any) => i.actual_quantity === i.system_quantity)
  const discrepancyItems = items.filter((i: any) => i.actual_quantity !== null && i.actual_quantity !== i.system_quantity)
  const investigatingItems = items.filter((i: any) => i.investigation_status === 'investigating')
  
  const handleApproveItem = (item: any) => {
    if (!id) return
    approveItem(
      { itemId: item.id, adjustmentId: id },
      {
        onSuccess: () => {
          toast.success('Đã duyệt item')
        },
      }
    )
  }
  
  const handleInvestigateItem = (item: any) => {
    setSelectedItem({
      ...item,
      item: {
        name: item.item_name,
        code: item.item_code,
      }
    })
    setShowInvestigationDialog(true)
  }
  
  const pendingItems = items.filter((i: any) => i.status === 'pending')
  
  const handleApprove = () => {
    if (!id) return
    approve(
      { adjustmentId: id, approvalNotes },
      {
        onSuccess: () => {
          setShowApproveSheet(false)
          setApprovalNotes('')
          toast.success('Đã duyệt phiếu kiểm kê')
        },
      }
    )
  }
  
  const handleReject = () => {
    if (!id) return
    reject(
      { adjustmentId: id, rejectionReason },
      {
        onSuccess: () => {
          setShowRejectSheet(false)
          setRejectionReason('')
          toast.success('Đã từ chối phiếu kiểm kê')
        },
      }
    )
  }
  
  const handlePrint = () => {
    toast.info('Chức năng in báo cáo đang phát triển')
  }
  
  const handleExport = () => {
    toast.info('Chức năng xuất Excel đang phát triển')
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Sticky Header */}
      <div className="sticky top-0 z-10 bg-background border-b">
        <div className="flex items-center gap-3 p-4">
          <Button variant="ghost" size="icon" aria-label="Quay lại" onClick={() => navigateBack(navigate, '/inventory/adjustments')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold truncate">{adj.adjustment_code}</h1>
            <p className="text-sm text-muted-foreground">{formatDate(adj.created_at)}</p>
          </div>
          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
          {canContinue && (
            <Button 
              size="sm" 
              onClick={() => navigate(`/inventory/adjustments/${id}/check`)}
            >
              <Play className="h-4 w-4 mr-1" />
              Tiếp tục
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="h-[calc(100vh-80px)]">
        <div className="p-4 space-y-4">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tổng mặt hàng</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Package className="h-8 w-8 text-muted-foreground" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Đã kiểm</p>
                  <p className="text-2xl font-bold">{stats.checked}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Khớp</p>
                  <p className="text-2xl font-bold text-green-600">{stats.matched}</p>
                </div>
                <TrendingUp className="h-8 w-8 text-green-600" />
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Lệch</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.discrepancy}</p>
                </div>
                <TrendingDown className="h-8 w-8 text-orange-600" />
              </div>
            </Card>
          </div>
          
          {/* Value Difference Card */}
          {stats.discrepancy > 0 && (
            <Card className="p-4 border-orange-200 bg-orange-50/50 dark:bg-orange-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Giá trị chênh lệch</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    totalValueDifference > 0 ? "text-green-600" : "text-red-600"
                  )}>
                    {totalValueDifference > 0 ? '+' : ''}
                    {formatCurrency(Math.abs(totalValueDifference))}
                  </p>
                </div>
                <AlertTriangle className="h-8 w-8 text-orange-500" />
              </div>
            </Card>
          )}

          {/* Detailed Info Card */}
          <Card className="p-4 space-y-4">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileText className="h-4 w-4" />
              Thông tin chi tiết
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Loại kiểm kê</p>
                <p className="font-medium">
                  {adj.adjustment_type === 'inventory_check' && '📋 Định kỳ'}
                  {adj.adjustment_type === 'damage' && '❌ Hư hỏng'}
                  {adj.adjustment_type === 'loss' && '🚫 Mất mát'}
                  {adj.adjustment_type === 'correction' && '🔧 Điều chỉnh'}
                  {adj.adjustment_type === 'full' && '📋 Toàn bộ'}
                  {adj.adjustment_type === 'partial' && '📋 Theo danh mục'}
                </p>
              </div>
              
              {adj.scheduled_date && (
                <div>
                  <p className="text-sm text-muted-foreground">Ngày lập</p>
                  <div className="flex items-center gap-1">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <p className="font-medium">
                      {format(new Date(adj.scheduled_date), 'dd/MM/yyyy', { locale: vi })}
                    </p>
                  </div>
                </div>
              )}
            </div>
            
            <div className="border-t pt-4">
              <p className="text-sm text-muted-foreground mb-2">Người tạo</p>
              <div className="flex items-center gap-2">
                <Avatar className="h-8 w-8">
                  <AvatarImage src={adj.created_by_user?.avatar_url} />
                  <AvatarFallback>
                    {adj.created_by_user?.full_name?.charAt(0) || 'U'}
                  </AvatarFallback>
                </Avatar>
                <span className="font-medium">{adj.created_by_user?.full_name || 'N/A'}</span>
              </div>
            </div>
            
            {adj.assigned_to && adj.assigned_to.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground mb-2">Người thực hiện</p>
                <div className="flex -space-x-2">
                  {adj.assigned_to.map((userId: string, i: number) => (
                    <Avatar key={i} className="h-8 w-8 border-2 border-background">
                      <AvatarFallback className="text-xs bg-primary/10">
                        <User className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  ))}
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              {adj.started_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Bắt đầu</p>
                  <p className="font-medium text-sm">
                    {format(new Date(adj.started_at), 'dd/MM HH:mm', { locale: vi })}
                  </p>
                </div>
              )}
              
              {adj.completed_at && (
                <div>
                  <p className="text-sm text-muted-foreground">Hoàn thành</p>
                  <p className="font-medium text-sm">
                    {format(new Date(adj.completed_at), 'dd/MM HH:mm', { locale: vi })}
                  </p>
                </div>
              )}
            </div>
            
            {adj.notes && (
              <div className="border-t pt-4">
                <p className="text-sm text-muted-foreground">Ghi chú</p>
                <p className="text-sm mt-1">{adj.notes}</p>
              </div>
            )}
          </Card>
          
          {/* Approval Section for Managers/Owners */}
          {canApprove && (
            <Card className="p-4 border-yellow-300 bg-yellow-50/50 dark:bg-yellow-950/20">
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-5 w-5 text-yellow-600" />
                <p className="font-medium">Phiếu cần duyệt</p>
              </div>
              <div className="text-sm text-muted-foreground mb-4">
                <p>• Chênh lệch: <span className="font-semibold text-foreground">{stats.discrepancy} items</span></p>
                <p>• Giá trị: <span className={cn(
                  "font-semibold",
                  totalValueDifference > 0 ? "text-green-600" : "text-red-600"
                )}>
                  {totalValueDifference > 0 ? '+' : ''}{formatCurrency(Math.abs(totalValueDifference))}
                </span></p>
              </div>
              <div className="flex gap-2">
                <Button 
                  className="flex-1" 
                  onClick={() => setShowApproveSheet(true)}
                  disabled={isApproving}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Duyệt
                </Button>
                <Button 
                  variant="destructive" 
                  onClick={() => setShowRejectSheet(true)}
                  disabled={isRejecting}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Từ chối
                </Button>
              </div>
            </Card>
          )}
          
          {/* Post Approval Actions - Show after approved */}
          <PostApprovalActions
            adjustmentId={id!}
            adjustmentCode={adj.adjustment_code}
            hotelId={adj.hotel_id}
            items={items}
            status={adj.status}
            variant="mobile"
          />

          {/* Items Tabs */}
          <Tabs defaultValue="all" className="w-full">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="all" className="text-xs">Tất cả</TabsTrigger>
              <TabsTrigger value="matched" className="text-xs">Khớp</TabsTrigger>
              <TabsTrigger value="discrepancy" className="text-xs">Lệch</TabsTrigger>
              <TabsTrigger value="investigating" className="text-xs">
                Điều tra {stats.investigating > 0 && `(${stats.investigating})`}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="all" className="space-y-2 mt-4">
              {items.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chưa có items
                </div>
              ) : (
                items.map((item: any) => (
                  <ItemCard 
                    key={item.id} 
                    item={item}
                    adjustmentStatus={adj.status}
                    canApprove={canApprove}
                    onApprove={handleApproveItem}
                    onInvestigate={handleInvestigateItem}
                    isApprovingItem={isApprovingItem}
                  />
                ))
              )}
            </TabsContent>
            
            <TabsContent value="matched" className="space-y-2 mt-4">
              {matchedItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Không có items khớp
                </div>
              ) : (
                matchedItems.map((item: any) => (
                  <ItemCard 
                    key={item.id} 
                    item={item}
                    adjustmentStatus={adj.status}
                    canApprove={canApprove}
                    onApprove={handleApproveItem}
                    onInvestigate={handleInvestigateItem}
                    isApprovingItem={isApprovingItem}
                  />
                ))
              )}
            </TabsContent>
            
            <TabsContent value="discrepancy" className="space-y-2 mt-4">
              {discrepancyItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Không có items lệch
                </div>
              ) : (
                discrepancyItems.map((item: any) => (
                  <ItemCard 
                    key={item.id} 
                    item={item} 
                    showDiscrepancy
                    adjustmentStatus={adj.status}
                    canApprove={canApprove}
                    onApprove={handleApproveItem}
                    onInvestigate={handleInvestigateItem}
                    isApprovingItem={isApprovingItem}
                  />
                ))
              )}
            </TabsContent>
            
            <TabsContent value="investigating" className="space-y-2 mt-4">
              {investigatingItems.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Search className="w-12 h-12 mx-auto mb-3 text-muted-foreground/50" />
                  <p>Không có items đang điều tra</p>
                </div>
              ) : (
                investigatingItems.map((item: any) => (
                  <ItemCard 
                    key={item.id} 
                    item={item} 
                    showDiscrepancy
                    adjustmentStatus={adj.status}
                    canApprove={canApprove}
                    onApprove={handleApproveItem}
                    onInvestigate={handleInvestigateItem}
                    isApprovingItem={isApprovingItem}
                  />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      </ScrollArea>
      
      {/* Fixed Footer Actions */}
      <div className="fixed bottom-16 left-0 right-0 p-4 bg-background border-t">
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            In báo cáo
          </Button>
          <Button variant="outline" className="flex-1" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Xuất Excel
          </Button>
        </div>
      </div>
      
      {/* Approve Sheet */}
      <Sheet open={showApproveSheet} onOpenChange={setShowApproveSheet}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Xác nhận duyệt phiếu</SheetTitle>
            <SheetDescription>
              Sau khi duyệt, các thay đổi về số lượng sẽ được áp dụng vào hệ thống. 
              Hành động này không thể hoàn tác.
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Ghi chú (tùy chọn)</label>
            <Textarea
              value={approvalNotes}
              onChange={(e) => setApprovalNotes(e.target.value)}
              placeholder="Nhập ghi chú khi duyệt..."
              rows={3}
            />
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowApproveSheet(false)}>
              Hủy
            </Button>
            <Button onClick={handleApprove} disabled={isApproving}>
              {isApproving ? 'Đang xử lý...' : 'Xác nhận duyệt'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      
      {/* Reject Sheet */}
      <Sheet open={showRejectSheet} onOpenChange={setShowRejectSheet}>
        <SheetContent side="bottom" className="rounded-t-xl">
          <SheetHeader>
            <SheetTitle>Từ chối phiếu kiểm kê</SheetTitle>
            <SheetDescription>
              Phiếu sẽ được chuyển về trạng thái từ chối và cần kiểm tra lại.
            </SheetDescription>
          </SheetHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Lý do từ chối *</label>
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Vui lòng nêu rõ lý do từ chối..."
              rows={3}
            />
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowRejectSheet(false)}>
              Hủy
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleReject} 
              disabled={isRejecting || !rejectionReason}
            >
              {isRejecting ? 'Đang xử lý...' : 'Xác nhận từ chối'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      
      {/* Investigation Dialog */}
      {selectedItem && (
        <InvestigationDialog
          open={showInvestigationDialog}
          onOpenChange={setShowInvestigationDialog}
          item={selectedItem}
          adjustmentId={id!}
        />
      )}
    </div>
  )
}

// ItemCard component for displaying individual items
function ItemCard({ 
  item, 
  showDiscrepancy = false,
  adjustmentStatus,
  canApprove,
  onApprove,
  onInvestigate,
  isApprovingItem,
}: { 
  item: any
  showDiscrepancy?: boolean
  adjustmentStatus?: string
  canApprove?: boolean
  onApprove?: (item: any) => void
  onInvestigate?: (item: any) => void
  isApprovingItem?: boolean
}) {
  const discrepancy = (item.actual_quantity ?? 0) - item.system_quantity
  const hasDiscrepancy = item.actual_quantity !== null && item.actual_quantity !== item.system_quantity
  
  // Item status badge config
  const getItemStatusBadge = (status: string, investigationStatus: string | null) => {
    if (investigationStatus === 'investigating') {
      return { label: 'Đang điều tra', variant: 'secondary' as const, className: 'bg-amber-100 text-amber-800' }
    }
    if (investigationStatus === 'resolved') {
      return { label: 'Đã xử lý', variant: 'default' as const, className: 'bg-blue-100 text-blue-800' }
    }
    switch (status) {
      case 'approved':
        return { label: 'Đã duyệt', variant: 'default' as const, className: 'bg-green-100 text-green-800' }
      default:
        return { label: 'Chờ duyệt', variant: 'outline' as const, className: '' }
    }
  }
  
  const itemStatusBadge = getItemStatusBadge(item.status || 'pending', item.investigation_status)
  const isInvestigating = item.investigation_status === 'investigating'
  const showActions = canApprove && adjustmentStatus === 'completed' && item.status !== 'approved'
  
  return (
    <Card className="p-3">
      <div className="flex justify-between items-start mb-2">
        <div className="flex-1">
          <p className="font-medium">{item.item_name}</p>
          <p className="text-sm text-muted-foreground">{item.item_code}</p>
        </div>
        <div className="flex items-center gap-1">
          {item.actual_quantity !== null && (
            <Badge variant={hasDiscrepancy ? 'destructive' : 'default'}>
              {hasDiscrepancy ? 'Lệch' : 'Khớp'}
            </Badge>
          )}
          {adjustmentStatus === 'completed' && (
            <Badge variant={itemStatusBadge.variant} className={itemStatusBadge.className}>
              {itemStatusBadge.label}
            </Badge>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-muted-foreground">Hệ thống</p>
          <p className="font-semibold">{item.system_quantity}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Thực tế</p>
          <p className="font-semibold">{item.actual_quantity ?? '-'}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Chênh lệch</p>
          <p className={cn(
            "font-semibold",
            hasDiscrepancy && discrepancy > 0 && "text-green-600",
            hasDiscrepancy && discrepancy < 0 && "text-red-600"
          )}>
            {item.actual_quantity !== null ? (discrepancy > 0 ? '+' : '') + discrepancy : '-'}
          </p>
        </div>
      </div>
      {showDiscrepancy && item.unit_price && hasDiscrepancy && (
        <div className="mt-2 pt-2 border-t text-sm">
          <p className="text-muted-foreground">
            Giá trị chênh lệch: 
            <span className={cn(
              "font-semibold ml-1",
              discrepancy > 0 ? "text-green-600" : "text-red-600"
            )}>
              {discrepancy > 0 ? '+' : ''}{formatCurrency(Math.abs(discrepancy * item.unit_price))}
            </span>
          </p>
        </div>
      )}
      {item.discrepancy_reason && (
        <p className="text-xs text-muted-foreground mt-2 border-t pt-2">
          Lý do: {item.discrepancy_reason}
        </p>
      )}
      
      {/* Per-item Actions */}
      {showActions && (
        <div className="mt-3 pt-3 border-t flex gap-2">
          {isInvestigating ? (
            // Item is investigating - show resolve button
            <Button 
              size="sm" 
              variant="outline"
              className="flex-1"
              onClick={() => onInvestigate?.(item)}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Xử lý
            </Button>
          ) : hasDiscrepancy ? (
            // Item has discrepancy - show investigate button
            <>
              <Button 
                size="sm" 
                variant="outline"
                className="flex-1"
                onClick={() => onInvestigate?.(item)}
              >
                <Search className="h-3 w-3 mr-1" />
                Điều tra
              </Button>
              <Button 
                size="sm" 
                variant="default"
                className="flex-1"
                onClick={() => onApprove?.(item)}
                disabled={isApprovingItem}
              >
                <Shield className="h-3 w-3 mr-1" />
                Duyệt
              </Button>
            </>
          ) : (
            // Item matches - show approve button
            <Button 
              size="sm" 
              variant="default"
              className="flex-1"
              onClick={() => onApprove?.(item)}
              disabled={isApprovingItem}
            >
              <CheckCircle className="h-3 w-3 mr-1" />
              Duyệt
            </Button>
          )}
        </div>
      )}
    </Card>
  )
}
