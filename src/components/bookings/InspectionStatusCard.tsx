import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  Loader2,
  Clock,
  AlertCircle,
  CheckCircle2,
  Send,
  Phone,
  X,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { StaffStatusBadge } from '@/components/staff/StaffStatusBadge'
import { OnShiftStaffMember } from '@/hooks/useOnShiftStaffList'
import { getTelegramPhoneLink, openTelegramWithFallback, getTelegramDownloadLink } from '@/lib/phone-utils'

interface Phase1DamageData {
  lost_items?: Array<{ item_id: string; item_name: string; quantity: number; estimated_value: number }>
  damaged_items?: Array<{ item_id: string; item_name: string; quantity: number; damage_cost: number; damage_type?: string }>
  consumed_items?: Array<{ item_id: string; item_name: string; quantity: number }>
  lost_total?: number
  damaged_total?: number
}

interface InspectionData {
  bookingId: string
  roomId: string
  status: 'pending' | 'in_progress' | 'completed' | 'not_requested' | 'cancelled'
  inspectionId?: string
  startedAt?: string
  createdAt?: string
  assignedTo?: string
  damageCharge?: number
  phase1DamageData?: Phase1DamageData
}

interface InspectionStatusCardProps {
  inspection: InspectionData
  staffList: OnShiftStaffMember[]
  onViewDetail: (staff: OnShiftStaffMember) => void
  onCancelInspection: (inspectionId: string) => Promise<void>
  isProcessing: boolean
}

export function InspectionStatusCard({
  inspection,
  staffList,
  onViewDetail,
  onCancelInspection,
  isProcessing,
}: InspectionStatusCardProps) {
  // Timer state for in_progress
  const [elapsedTime, setElapsedTime] = useState('')
  const [isCancelling, setIsCancelling] = useState(false)

  // Timer effect (same as CheckoutInspectionSection)
  useEffect(() => {
    if (inspection.status !== 'in_progress' || !inspection.startedAt) {
      setElapsedTime('')
      return
    }

    const startTime = new Date(inspection.startedAt).getTime()

    const updateTimer = () => {
      const now = Date.now()
      const diff = Math.floor((now - startTime) / 1000)
      const hours = Math.floor(diff / 3600)
      const minutes = Math.floor((diff % 3600) / 60)
      const seconds = diff % 60

      if (hours > 0) {
        setElapsedTime(
          `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        )
      } else {
        setElapsedTime(
          `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
        )
      }
    }

    updateTimer() // Run immediately
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [inspection.status, inspection.startedAt])

  const staff = staffList.find((s) => s.id === inspection.assignedTo)

  const handleCancel = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!inspection.inspectionId) return

    setIsCancelling(true)
    try {
      await onCancelInspection(inspection.inspectionId)
    } finally {
      setIsCancelling(false)
    }
  }

  // Render in_progress status
  if (inspection.status === 'in_progress') {
    return (
      <div className="p-2.5 border rounded-lg mt-2">
        {/* Header with timer */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs font-medium">Đang kiểm tra phòng</span>
          </div>
          {elapsedTime && (
            <div className="flex items-center gap-1 px-1.5 py-0.5 bg-muted rounded">
              <Clock className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              <span className="font-mono text-xs font-medium text-blue-700 dark:text-blue-300">
                {elapsedTime}
              </span>
            </div>
          )}
        </div>

        {/* Staff info with status + contact buttons */}
        <StaffInfoLine staff={staff} onViewDetail={onViewDetail} />

        {/* Time info */}
        {inspection.startedAt && (
          <div className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-500 mt-1.5">
            <Clock className="h-3 w-3" />
            <span>
              Bắt đầu: {format(new Date(inspection.startedAt), 'HH:mm dd/MM', { locale: vi })}
            </span>
          </div>
        )}

        {/* Phase 1 damage summary */}
        <Phase1DamageSummary data={inspection.phase1DamageData} />

        {/* Actions */}
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isProcessing || isCancelling}
            className="h-7 text-xs gap-1"
          >
            {isCancelling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
            Hủy yêu cầu
          </Button>
        </div>
      </div>
    )
  }

  // Render pending status
  if (inspection.status === 'pending') {
    return (
      <div className="p-2.5 border rounded-lg mt-2">
        {/* Header */}
        <div className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400 mb-2">
          <AlertCircle className="h-4 w-4" />
          <span className="text-xs font-medium">Đang chờ kiểm tra</span>
        </div>

        {/* Staff info */}
        <StaffInfoLine staff={staff} onViewDetail={onViewDetail} />

        {/* Time info */}
        {inspection.createdAt && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-500 mt-1.5">
            <Clock className="h-3 w-3" />
            <span>
              Yêu cầu lúc: {format(new Date(inspection.createdAt), 'HH:mm dd/MM', { locale: vi })}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-2 flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleCancel}
            disabled={isProcessing || isCancelling}
            className="h-7 text-xs gap-1"
          >
            {isCancelling ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <X className="h-3 w-3" />
            )}
            Hủy yêu cầu
          </Button>
        </div>
      </div>
    )
  }

  // Render completed status
  if (inspection.status === 'completed') {
    return (
      <div className="p-2.5 border rounded-lg mt-2">
        <div className="flex items-center gap-1.5 text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-xs font-medium">Kiểm tra hoàn thành</span>
        </div>
        {staff && (
          <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-500 mt-1">
            <span>Nhân viên: {staff.full_name}</span>
          </div>
        )}
        {/* Phase 1 damage summary */}
        <Phase1DamageSummary data={inspection.phase1DamageData} />
      </div>
    )
  }

  return null
}

// Phase 1 damage summary component
function Phase1DamageSummary({ data }: { data?: Phase1DamageData }) {
  if (!data) return null
  const lostCount = data.lost_items?.length || 0
  const damagedCount = data.damaged_items?.length || 0
  const consumedCount = data.consumed_items?.length || 0
  if (lostCount === 0 && damagedCount === 0 && consumedCount === 0) return null

  const fmt = (v: number) => new Intl.NumberFormat('vi-VN').format(v)

  return (
    <div className="mt-1.5 space-y-1">
      {lostCount > 0 && (
        <div>
          <div className="text-xs font-medium text-red-600">
            Đồ mất ({lostCount}) — {fmt(data.lost_total || 0)}đ
          </div>
          <div className="pl-2 space-y-0.5 mt-0.5">
            {data.lost_items!.map((item, idx) => (
              <div key={idx} className="text-xs text-red-600/80 flex justify-between">
                <span>- {item.item_name} x{item.quantity}</span>
                <span>{fmt(item.estimated_value * item.quantity)}đ</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {damagedCount > 0 && (
        <div>
          <div className="text-xs font-medium text-amber-600">
            Đồ hỏng ({damagedCount}) — {fmt(data.damaged_total || 0)}đ
          </div>
          <div className="pl-2 space-y-0.5 mt-0.5">
            {data.damaged_items!.map((item, idx) => (
              <div key={idx} className="text-xs text-amber-600/80 flex justify-between">
                <span>- {item.item_name} x{item.quantity}{item.damage_type ? ` (${item.damage_type})` : ''}</span>
                <span>{fmt(item.damage_cost * item.quantity)}đ</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {consumedCount > 0 && (
        <div>
          <div className="text-xs font-medium text-blue-600">
            Đồ đã dùng ({consumedCount})
          </div>
          <div className="pl-2 space-y-0.5 mt-0.5">
            {data.consumed_items!.map((item, idx) => (
              <div key={idx} className="text-xs text-blue-600/80">
                - {item.item_name} x{item.quantity}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Internal component for staff info line
function StaffInfoLine({
  staff,
  onViewDetail,
}: {
  staff: OnShiftStaffMember | undefined
  onViewDetail: (staff: OnShiftStaffMember) => void
}) {
  if (!staff) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Nhân viên:</span>
        <span className="text-amber-600">Không xác định</span>
      </div>
    )
  }

  const hasTelegramConnection = staff.telegram_username || staff.phone || staff.telegram_chat_id

  const handleTelegram = (e: React.MouseEvent) => {
    e.stopPropagation()
    let url: string | null = null
    if (staff.telegram_username) {
      url = `tg://resolve?domain=${staff.telegram_username}`
    } else if (staff.phone) {
      url = getTelegramPhoneLink(staff.phone)
    } else if (staff.telegram_chat_id) {
      url = `tg://user?id=${staff.telegram_chat_id}`
    }

    if (url) {
      openTelegramWithFallback(url, () => {
        const downloadLink = getTelegramDownloadLink()
        toast.info(
          <div className="flex flex-col gap-2">
            <span>Chưa cài Telegram trên máy</span>
            <a
              href={downloadLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 underline font-medium"
            >
              Tải Telegram ngay
            </a>
          </div>,
          { duration: 8000 }
        )
      })
    }
  }

  const handleCall = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (staff.phone) window.location.href = `tel:${staff.phone}`
  }

  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-muted-foreground">Nhân viên:</span>

      {/* Staff name - clickable to view detail */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onViewDetail(staff)
        }}
        className="font-medium text-primary hover:underline"
      >
        {staff.full_name}
      </button>

      {/* Status badge */}
      <StaffStatusBadge status={staff.status} size="sm" showLabel={false} />

      {/* Quick action buttons */}
      <div className="flex items-center gap-0.5 ml-auto">
        {hasTelegramConnection && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-blue-500 hover:text-blue-600"
            onClick={handleTelegram}
           aria-label="Gửi">
            <Send className="h-3 w-3" />
          </Button>
        )}
        {staff.phone && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={handleCall}
           aria-label="Gọi điện">
            <Phone className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  )
}
