import { useState } from 'react'

import { AlertTriangle, ChevronDown, ChevronUp, Package, Clock, Zap, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useQueryClient } from '@tanstack/react-query'
import { usePendingSupplementCount, useSupplementRequests, type SupplementRequest } from '@/hooks/useSupplementRequests'
import { useCreateDistributionFromSupplements } from '@/hooks/useCreateDistributionFromSupplements'
import { useOnShiftStaffList } from '@/hooks/useOnShiftStaffList'
import { useHotelContext } from '@/contexts/HotelContext'
import { formatDistanceToNow } from 'date-fns'
import { vi } from 'date-fns/locale'
import { cn } from '@/lib/utils'

export function PendingSupplementsBanner() {
  const queryClient = useQueryClient()
  const { selectedHotel } = useHotelContext()
  const { data: pendingCount = 0, isLoading: isLoadingCount } = usePendingSupplementCount()
  const { data: pendingRequests = [], isLoading: isLoadingRequests } = useSupplementRequests({ status: 'pending' })
  const { data: staffUsers = [], isLoading: staffLoading } = useOnShiftStaffList(selectedHotel?.id)
  const { mutate: createFromSupplements, isPending } = useCreateDistributionFromSupplements()

  const [isOpen, setIsOpen] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [assignedTo, setAssignedTo] = useState<string>('')
  const [autoRelease, setAutoRelease] = useState(true)

  if (isLoadingCount || pendingCount === 0) {
    return null
  }

  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id)
        ? prev.filter(i => i !== id)
        : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedIds.length === pendingRequests.length) {
      setSelectedIds([])
    } else {
      setSelectedIds(pendingRequests.map(r => r.id))
    }
  }

  const handleCreateDistribution = () => {
    if (selectedIds.length === 0 || isPending) return
    createFromSupplements(
      {
        supplementRequestIds: selectedIds,
        assignedTo: assignedTo || undefined,
        autoRelease,
      },
      {
        onSuccess: () => {
          setSelectedIds([])
          setAssignedTo('')
          queryClient.invalidateQueries({ queryKey: ['distribution-routes'] })
        },
      },
    )
  }

  const getRequestTypeClass = (type: string) => {
    switch (type) {
      case 'lost': return 'text-red-600 dark:text-red-400'
      case 'damaged': return 'text-amber-600 dark:text-amber-400'
      case 'consumed': return 'text-blue-600 dark:text-blue-400'
      case 'mixed': return 'text-purple-600 dark:text-purple-400'
      default: return 'text-muted-foreground'
    }
  }

  const getRequestTypeLabel = (type: string) => {
    switch (type) {
      case 'lost': return 'Mất'
      case 'damaged': return 'Hỏng'
      case 'consumed': return 'Tiêu hao'
      case 'mixed': return 'Hỗn hợp'
      default: return type
    }
  }

  return (
    <div className="border border-amber-200 dark:border-amber-800 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 overflow-hidden">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 flex items-center justify-between hover:bg-amber-100/50 dark:hover:bg-amber-900/20 transition-colors">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              <span className="font-medium text-amber-800 dark:text-amber-200">
                {pendingCount} yêu cầu bổ sung đang chờ xử lý
              </span>
            </div>
            {isOpen ? (
              <ChevronUp className="h-4 w-4 text-amber-600" />
            ) : (
              <ChevronDown className="h-4 w-4 text-amber-600" />
            )}
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-amber-200 dark:border-amber-800 p-3 space-y-3">
            {/* Select all */}
            {pendingRequests.length > 1 && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={selectedIds.length === pendingRequests.length}
                    onCheckedChange={toggleSelectAll}
                  />
                  <span className="text-sm text-muted-foreground">Chọn tất cả</span>
                </label>
                <span className="text-xs text-muted-foreground">
                  {selectedIds.length}/{pendingRequests.length} đã chọn
                </span>
              </div>
            )}

            {/* Request cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {isLoadingRequests ? (
                <div className="col-span-full text-center text-sm text-muted-foreground py-4">
                  Đang tải...
                </div>
              ) : (
                pendingRequests.slice(0, 10).map((request) => (
                  <SupplementCard
                    key={request.id}
                    request={request}
                    isSelected={selectedIds.includes(request.id)}
                    onToggle={() => toggleSelect(request.id)}
                    getRequestTypeLabel={getRequestTypeLabel}
                    getRequestTypeClass={getRequestTypeClass}
                  />
                ))
              )}
            </div>

            {pendingRequests.length > 10 && (
              <p className="text-xs text-muted-foreground text-center">
                Và {pendingRequests.length - 10} yêu cầu khác...
              </p>
            )}

            {/* Inline options + action */}
            {selectedIds.length > 0 && (
              <div className="pt-3 border-t border-amber-200/60 dark:border-amber-800/60 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">
                      Gán cho nhân viên <span className="opacity-70">(đang trong ca)</span>
                    </Label>
                    <Select
                      value={assignedTo || 'unassigned'}
                      onValueChange={(val) => setAssignedTo(val === 'unassigned' ? '' : val)}
                      disabled={staffLoading || isPending}
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

                  <div className="flex items-start gap-2 rounded-md border bg-background p-2.5">
                    <Checkbox
                      id="banner-auto-release"
                      checked={autoRelease}
                      onCheckedChange={(checked) => setAutoRelease(!!checked)}
                      disabled={!assignedTo || isPending}
                      className="mt-0.5"
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="banner-auto-release"
                        className="text-sm font-medium flex items-center gap-1.5 cursor-pointer"
                      >
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        Giao ngay (bỏ qua bước kho)
                      </Label>
                      <p className="text-[11px] text-muted-foreground leading-snug">
                        Cần chọn nhân viên để bật
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleCreateDistribution}
                    size="sm"
                    className="gap-2"
                    disabled={isPending}
                  >
                    {isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Package className="h-4 w-4" />
                    )}
                    {isPending ? 'Đang tạo...' : `Tạo phiếu từ ${selectedIds.length} yêu cầu`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

interface SupplementCardProps {
  request: SupplementRequest
  isSelected: boolean
  onToggle: () => void
  getRequestTypeLabel: (type: string) => string
  getRequestTypeClass: (type: string) => string
}

function SupplementCard({ request, isSelected, onToggle, getRequestTypeLabel, getRequestTypeClass }: SupplementCardProps) {
  const itemCount = request.items?.length || 0
  const timeAgo = formatDistanceToNow(new Date(request.created_at), { addSuffix: true, locale: vi })

  return (
    <div
      onClick={onToggle}
      className={cn(
        'py-1.5 px-2 rounded border cursor-pointer transition-all',
        isSelected
          ? 'border-l-4 border-l-primary border-t border-r border-b bg-muted/30'
          : 'border-l-4 border-l-transparent hover:border-l-primary/50'
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-mono text-xs font-medium truncate">
          {request.request_code}
        </span>
        <Checkbox
          checked={isSelected}
          className="h-4 w-4"
          onClick={(e) => e.stopPropagation()}
          onCheckedChange={onToggle}
        />
      </div>
      <div className="mt-1">
        <div className="font-semibold text-sm">P.{request.room?.room_number}</div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Package className="h-3 w-3" />
          {itemCount} SP
          <span className={cn('text-[10px] ml-1', getRequestTypeClass(request.request_type))}>
            {getRequestTypeLabel(request.request_type)}
          </span>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-1">
          <Clock className="h-3 w-3" />
          {timeAgo}
        </div>
      </div>
    </div>
  )
}
