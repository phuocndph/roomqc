import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import { 
  Package, 
  Clock, 
  CheckCircle, 
  XCircle, 
  Filter,
  ChevronRight,
  AlertTriangle,
  DoorOpen,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  useSupplementRequests,
  usePendingSupplementCount,
  type SupplementRequest,
} from '@/hooks/useSupplementRequests'
import { SupplementRequestSheet } from '@/components/supplements/SupplementRequestSheet'
import { cn } from '@/lib/utils'
import { supabase } from '@/integrations/supabase/client'
import { useQueryClient } from '@tanstack/react-query'
import { useUser } from '@/hooks/useUser'

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Chờ duyệt', color: 'text-amber-600', icon: Clock },
  approved: { label: 'Đã duyệt', color: 'text-blue-600', icon: CheckCircle },
  completed: { label: 'Hoàn thành', color: 'text-green-600', icon: CheckCircle },
  rejected: { label: 'Từ chối', color: 'text-red-600', icon: XCircle },
  cancelled: { label: 'Đã hủy', color: 'text-muted-foreground', icon: XCircle },
}

const TYPE_CONFIG: Record<string, { label: string; color: string }> = {
  lost: { label: 'Mất', color: 'text-red-600' },
  consumed: { label: 'Tiêu hao', color: 'text-amber-600' },
  damaged: { label: 'Hỏng', color: 'text-orange-600' },
  mixed: { label: 'Hỗn hợp', color: 'text-purple-600' },
}

export function SupplementsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { tenantId } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(
    searchParams.get('request')
  )
  
  const [filters, setFilters] = useState({
    status: searchParams.get('status') || '',
    search: searchParams.get('search') || '',
    source: searchParams.get('source') || '',
  })
  
  const { data: rawRequests, isLoading } = useSupplementRequests({
    status: filters.status && filters.status !== 'all' ? filters.status : undefined,
    search: filters.search || undefined,
  })
  const requests = filters.source === 'room_check'
    ? (rawRequests ?? []).filter(r => !!r.room_check_id)
    : filters.source === 'manual'
      ? (rawRequests ?? []).filter(r => !r.room_check_id)
      : rawRequests
  
  const { data: pendingCount } = usePendingSupplementCount()
  
  // Realtime subscription (filter tenant + visibility pause)
  useEffect(() => {
    if (!tenantId) return
    let channel: ReturnType<typeof supabase.channel> | null = null

    const subscribe = () => {
      if (channel) return
      channel = supabase
        .channel(`supplement-requests-${tenantId}`)
        .on('postgres_changes',
          { event: '*', schema: 'public', table: 'supplement_requests', filter: `tenant_id=eq.${tenantId}` },
          () => {
            queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
            queryClient.invalidateQueries({ queryKey: ['supplement-requests-pending-count'] })
          }
        )
        .subscribe()
    }
    const unsubscribe = () => { if (channel) { supabase.removeChannel(channel); channel = null } }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        subscribe()
        queryClient.invalidateQueries({ queryKey: ['supplement-requests'] })
      } else { unsubscribe() }
    }
    if (document.visibilityState === 'visible') subscribe()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      unsubscribe()
    }
  }, [tenantId, queryClient])
  
  const handleFilterChange = (key: string, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
    if (value) {
      searchParams.set(key, value)
    } else {
      searchParams.delete(key)
    }
    setSearchParams(searchParams)
  }
  
  const handleRequestClick = (request: SupplementRequest) => {
    setSelectedRequestId(request.id)
    searchParams.set('request', request.id)
    setSearchParams(searchParams)
  }
  
  const handleSheetClose = () => {
    setSelectedRequestId(null)
    searchParams.delete('request')
    setSearchParams(searchParams)
  }
  
  // Stats
  const totalValue = requests?.reduce((sum, r) => sum + (r.total_value || 0), 0) || 0
  const completedCount = requests?.filter(r => r.status === 'completed').length || 0
  const rejectedCount = requests?.filter(r => r.status === 'rejected').length || 0
  
  return (
    <div className="container max-w-5xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Yêu cầu bổ sung đồ
          </h1>
          <p className="text-sm text-muted-foreground">
            Quản lý yêu cầu bổ sung đồ dùng từ kiểm tra phòng
          </p>
        </div>
        {pendingCount && pendingCount > 0 && (
          <Badge variant="outline" className="text-amber-600 border-amber-600">
            {pendingCount} chờ duyệt
          </Badge>
        )}
      </div>
      
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Chờ duyệt</div>
          <div className="text-2xl font-bold text-amber-600">{pendingCount || 0}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Hoàn thành</div>
          <div className="text-2xl font-bold text-green-600">{completedCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Từ chối</div>
          <div className="text-2xl font-bold text-red-600">{rejectedCount}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Tổng giá trị</div>
          <div className="text-2xl font-bold">
            {new Intl.NumberFormat('vi-VN').format(totalValue)}đ
          </div>
        </Card>
      </div>
      
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Tìm mã yêu cầu..."
          value={filters.search}
          onChange={(e) => handleFilterChange('search', e.target.value)}
          className="w-48"
        />
        <Select
          value={filters.status}
          onValueChange={(value) => handleFilterChange('status', value)}
        >
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả</SelectItem>
            <SelectItem value="pending">Chờ duyệt</SelectItem>
            <SelectItem value="approved">Đã duyệt</SelectItem>
            <SelectItem value="completed">Hoàn thành</SelectItem>
            <SelectItem value="rejected">Từ chối</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={filters.source || 'all'}
          onValueChange={(value) => handleFilterChange('source', value === 'all' ? '' : value)}
        >
          <SelectTrigger className="w-40"><SelectValue placeholder="Nguồn" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Mọi nguồn</SelectItem>
            <SelectItem value="room_check">Từ kiểm tra phòng</SelectItem>
            <SelectItem value="manual">Tạo thủ công</SelectItem>
          </SelectContent>
        </Select>
        {(filters.status || filters.search || filters.source) && (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => {
              setFilters({ status: '', search: '', source: '' })
              setSearchParams(new URLSearchParams())
            }}
          >
            Xóa bộ lọc
          </Button>
        )}
      </div>
      
      {/* Request List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))
        ) : requests?.length === 0 ? (
          <Card className="p-8 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">Chưa có yêu cầu bổ sung nào</p>
          </Card>
        ) : (
          requests?.map((request) => {
            const statusConfig = STATUS_CONFIG[request.status] || STATUS_CONFIG.pending
            const typeConfig = TYPE_CONFIG[request.request_type] || TYPE_CONFIG.mixed
            const StatusIcon = statusConfig.icon
            
            return (
              <Card 
                key={request.id}
                className={cn(
                  "hover:bg-muted/50 cursor-pointer transition-colors",
                  request.status === 'pending' && "border-amber-200 bg-amber-50/30"
                )}
                onClick={() => handleRequestClick(request)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium">
                          {request.request_code}
                        </span>
                        <Badge 
                          variant="outline" 
                          className={cn("text-xs", typeConfig.color)}
                        >
                          {typeConfig.label}
                        </Badge>
                        <span className={cn("flex items-center gap-1 text-xs", statusConfig.color)}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig.label}
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <DoorOpen className="h-3.5 w-3.5" />
                          Phòng {request.room?.room_number || 'N/A'}
                        </span>
                        <span>•</span>
                        <span>{request.items?.length || 0} món</span>
                        <span>•</span>
                        <span className="font-medium text-foreground">
                          {new Intl.NumberFormat('vi-VN').format(request.total_value)}đ
                        </span>
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        {format(new Date(request.created_at), "HH:mm dd/MM/yyyy", { locale: vi })}
                        {request.requester && ` • ${request.requester.full_name}`}
                      </div>
                    </div>
                    
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
      
      {/* Detail Sheet */}
      <SupplementRequestSheet
        requestId={selectedRequestId}
        open={!!selectedRequestId}
        onOpenChange={(open) => {
          if (!open) handleSheetClose()
        }}
      />
    </div>
  )
}
