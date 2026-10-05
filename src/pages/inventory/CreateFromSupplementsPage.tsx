import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Package, AlertTriangle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { navigateBack } from '@/lib/navigation'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useSupplementRequests, SupplementRequest } from '@/hooks/useSupplementRequests'
import { useCreateDistributionFromSupplements } from '@/hooks/useCreateDistributionFromSupplements'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import { useHotelContext } from '@/contexts/HotelContext'
import { useIsMobile } from '@/hooks/use-mobile'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

const REQUEST_TYPE_LABELS: Record<string, string> = {
  lost: 'Mất',
  damaged: 'Hỏng',
  consumed: 'Tiêu thụ',
  mixed: 'Hỗn hợp',
}

interface CreateFromSupplementsPageProps {
  embedded?: boolean
}

export default function CreateFromSupplementsPage({ embedded = false }: CreateFromSupplementsPageProps = {}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const isMobile = useIsMobile()
  const { selectedHotel } = useHotelContext()
  const { data: requests = [], isLoading } = useSupplementRequests({ status: 'pending' })
  const { data: staffUsers = [], isLoading: staffLoading } = useOnShiftStaffList(selectedHotel?.id)
  const { mutate: createFromSupplements, isPending } = useCreateDistributionFromSupplements()

  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [autoRelease, setAutoRelease] = useState(true) // Default true for supplements

  // Initialize from URL params
  useEffect(() => {
    const idsFromUrl = searchParams.getAll('ids')
    if (idsFromUrl.length > 0 && requests.length > 0) {
      // Only select IDs that exist in current requests
      const validIds = idsFromUrl.filter(id => requests.some(r => r.id === id))
      if (validIds.length > 0) {
        setSelectedIds(validIds)
      }
    }
  }, [searchParams, requests])
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    )
  }

  const toggleAll = () => {
    if (selectedIds.length === requests.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(requests.map(r => r.id))
    }
  }

  const selectedRequests = useMemo(() => 
    requests.filter(r => selectedIds.includes(r.id)),
    [requests, selectedIds]
  )

  const summary = useMemo(() => {
    const roomSet = new Set<string>()
    let totalItems = 0
    let totalValue = 0

    selectedRequests.forEach(req => {
      roomSet.add(req.room_id)
      req.items.forEach(item => {
        totalItems += item.quantity
        totalValue += item.quantity * item.unit_price
      })
    })

    return {
      requestCount: selectedRequests.length,
      roomCount: roomSet.size,
      totalItems,
      totalValue,
    }
  }, [selectedRequests])

  const handleSubmit = () => {
    if (selectedIds.length === 0) return

    createFromSupplements({
      supplementRequestIds: selectedIds,
      assignedTo: assignedTo || undefined,
      autoRelease,
    }, {
      onSuccess: (result) => {
        if (embedded) {
          // Quay về tab Danh sách phiếu trong hub Xuất kho
          const next = new URLSearchParams(searchParams)
          next.set('tab', 'operations')
          next.set('sub', 'outbound')
          next.set('view', 'list')
          setSearchParams(next, { replace: true })
        } else {
          navigate(`/inventory/distributions/${result.order_id}`)
        }
      }
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className={embedded ? 'space-y-4' : (isMobile ? 'flex flex-col h-full' : 'container mx-auto py-6 space-y-6')}>
      {/* Header — ẩn khi embedded trong hub Xuất kho */}
      {!embedded && (
        <div className={isMobile 
          ? 'sticky top-0 z-10 bg-background border-b p-4 flex items-center gap-3'
          : 'flex items-center gap-4'
        }>
          <Button variant="ghost" size="icon" onClick={() => navigateBack(navigate, '/inventory')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className={isMobile ? 'text-lg font-semibold' : 'text-2xl font-bold'}>
              Tạo phiếu từ yêu cầu bổ sung
            </h1>
            {!isMobile && (
              <p className="text-muted-foreground">
                Chọn các yêu cầu để tạo phiếu giao hàng
              </p>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className={cn("space-y-4", isMobile ? 'flex-1 overflow-auto p-4' : '')}>
        {requests.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-medium">Không có yêu cầu bổ sung</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Tất cả yêu cầu đã được xử lý hoặc chưa có yêu cầu mới
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Select all */}
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={selectedIds.length === requests.length}
                  onCheckedChange={toggleAll}
                />
                <span className="text-sm font-medium">Chọn tất cả</span>
              </div>
              <span className="text-sm text-muted-foreground">
                {selectedIds.length}/{requests.length} đã chọn
              </span>
            </div>

            {/* Requests list */}
            <div className="space-y-2">
              {requests.map(request => (
                <SupplementRequestCard
                  key={request.id}
                  request={request}
                  selected={selectedIds.includes(request.id)}
                  onToggle={() => toggleSelection(request.id)}
                  isMobile={isMobile}
                />
              ))}
            </div>

            {/* Options */}
            {selectedIds.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Tùy chọn tạo phiếu</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center gap-1">
                      Gán cho nhân viên
                      <span className="text-muted-foreground">(đang trong ca)</span>
                    </Label>
                    <Select 
                      value={assignedTo || 'unassigned'} 
                      onValueChange={(val) => setAssignedTo(val === 'unassigned' ? '' : val)}
                      disabled={staffLoading}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder={staffLoading ? 'Đang tải...' : 'Chọn nhân viên...'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassigned">Chưa phân công</SelectItem>
                        {staffUsers.length === 0 ? (
                          <div className="py-2 px-3 text-sm text-muted-foreground">
                            Không có nhân viên đang trong ca
                          </div>
                        ) : (
                          staffUsers.map(user => (
                            <SelectItem key={user.id} value={user.id}>
                              {user.full_name}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-start gap-3 p-3 border rounded-lg bg-muted/50">
                    <Checkbox
                      id="auto-release"
                      checked={autoRelease}
                      onCheckedChange={(checked) => setAutoRelease(!!checked)}
                      disabled={!assignedTo}
                    />
                    <div className="space-y-1">
                      <Label htmlFor="auto-release" className="text-sm font-medium flex items-center gap-2">
                        <Zap className="h-4 w-4 text-amber-500" />
                        Giao ngay (bỏ qua bước kho)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Phiếu sẽ được giao trực tiếp cho nhân viên mà không cần kho xác nhận
                      </p>
                    </div>
                  </div>

                  {!assignedTo && autoRelease && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription className="text-xs">
                        Cần chọn nhân viên để bật tính năng giao ngay
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            {selectedIds.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Tóm tắt</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-muted-foreground">Yêu cầu:</span>
                      <span className="font-medium ml-2">{summary.requestCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Phòng:</span>
                      <span className="font-medium ml-2">{summary.roomCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Sản phẩm:</span>
                      <span className="font-medium ml-2">{summary.totalItems}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Giá trị:</span>
                      <span className="font-medium ml-2">{formatCurrency(summary.totalValue)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      {requests.length > 0 && (
        <div className={isMobile 
          ? 'sticky bottom-0 bg-background border-t p-4 flex gap-3'
          : 'flex justify-end gap-3'
        }>
          {!embedded && (
            <Button 
              variant="outline" 
              onClick={() => navigateBack(navigate, '/inventory')}
              className={isMobile ? 'flex-1' : ''}
            >
              Hủy
            </Button>
          )}
          <Button 
            onClick={handleSubmit} 
            disabled={isPending || selectedIds.length === 0}
            className={cn(isMobile ? 'flex-1' : '', 'gap-2')}
          >
            <CheckCircle className="h-4 w-4" />
            {isPending ? 'Đang tạo...' : `Tạo phiếu (${selectedIds.length})`}
          </Button>
        </div>
      )}
    </div>
  )
}

interface SupplementRequestCardProps {
  request: SupplementRequest
  selected: boolean
  onToggle: () => void
  isMobile: boolean
}

function SupplementRequestCard({ request, selected, onToggle, isMobile }: SupplementRequestCardProps) {
  const itemsPreview = request.items.slice(0, 3)
  const hasMore = request.items.length > 3

  return (
    <div 
      className={cn(
        "flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors",
        selected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      )}
      onClick={onToggle}
    >
      <Checkbox checked={selected} className="mt-1" />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs font-medium">{request.request_code}</span>
          <Badge variant="outline" className="text-xs">
            {request.room?.room_number || 'N/A'}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {REQUEST_TYPE_LABELS[request.request_type] || request.request_type}
          </Badge>
        </div>
        
        <div className="mt-1.5 text-xs text-muted-foreground">
          {itemsPreview.map((item, idx) => (
            <span key={item.item_id}>
              {item.item_name} x{item.quantity}
              {idx < itemsPreview.length - 1 && ', '}
            </span>
          ))}
          {hasMore && <span className="text-primary"> +{request.items.length - 3}</span>}
        </div>
      </div>

      <div className="text-right shrink-0">
        <div className="text-sm font-medium">{formatCurrency(request.total_value)}</div>
        <div className="text-xs text-muted-foreground">{request.items.length} SP</div>
      </div>
    </div>
  )
}
