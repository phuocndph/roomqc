import { useState, useEffect, useMemo } from 'react'
import { format, addDays, differenceInDays, parseISO } from 'date-fns'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useRescheduleBookingCheckin } from '@/hooks/useRescheduleBookingCheckin'
import { useRoomAvailabilityWindow } from '@/hooks/useRoomAvailabilityWindow'
import { RoomAvailabilityStrip } from './RoomAvailabilityStrip'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookingId: string
  roomId?: string | null
  guestName: string
  roomNumber: string
  currentCheckIn: string // yyyy-MM-dd
  currentCheckOut: string
  onSuccess?: () => void
}

const DEFAULT_WINDOW_DAYS = 30
const EXTRA_WINDOW_DAYS = 30
const MAX_WINDOW_DAYS = 120

export function RescheduleCheckinDialog({
  open,
  onOpenChange,
  bookingId,
  roomId,
  guestName,
  roomNumber,
  currentCheckIn,
  currentCheckOut,
  onSuccess,
}: Props) {
  const today = format(new Date(), 'yyyy-MM-dd')
  const nights = Math.max(
    1,
    differenceInDays(parseISO(currentCheckOut), parseISO(currentCheckIn)),
  )

  const [newIn, setNewIn] = useState(today)
  const [newOut, setNewOut] = useState(format(addDays(parseISO(today), nights), 'yyyy-MM-dd'))
  const [reason, setReason] = useState('')
  const [windowDays, setWindowDays] = useState(DEFAULT_WINDOW_DAYS)
  const [pickMode, setPickMode] = useState<'keep_nights' | 'range'>('keep_nights')
  const [pickingStep, setPickingStep] = useState<'in' | 'out'>('in')
  const mutation = useRescheduleBookingCheckin()

  // Auto-adjust check-out khi đổi check-in (chỉ ở mode giữ số đêm)
  useEffect(() => {
    if (!newIn || pickMode !== 'keep_nights') return
    setNewOut(format(addDays(parseISO(newIn), nights), 'yyyy-MM-dd'))
  }, [newIn, nights, pickMode])

  // Reset khi mở lại
  useEffect(() => {
    if (open) {
      setWindowDays(DEFAULT_WINDOW_DAYS)
      setNewIn(today)
      setPickMode('keep_nights')
      setPickingStep('in')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toDate = useMemo(
    () => format(addDays(parseISO(today), windowDays), 'yyyy-MM-dd'),
    [today, windowDays],
  )

  const { isLoading, isDateBooked, isRangeFree, findNextFreeWindow } = useRoomAvailabilityWindow({
    roomId,
    fromDate: today,
    toDate,
    excludeBookingId: bookingId,
    enabled: open && !!roomId,
  })

  const rangeFree = newIn && newOut ? isRangeFree(newIn, newOut) : false
  const suggestion = useMemo(() => {
    if (rangeFree || !roomId) return null
    return findNextFreeWindow(nights, newIn)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeFree, roomId, nights, newIn, isLoading])

  const handlePickDate = (d: string) => {
    if (pickMode === 'keep_nights') {
      setNewIn(d)
      return
    }
    // range mode
    if (pickingStep === 'in') {
      setNewIn(d)
      // Reset check-out để chờ chạm lần 2
      setNewOut('')
      setPickingStep('out')
      return
    }
    // pickingStep === 'out'
    if (d <= newIn) {
      // Chạm ngày trước hoặc bằng check-in → coi như chọn lại check-in
      setNewIn(d)
      setNewOut('')
      return
    }
    // selectedOut là exclusive → cộng thêm 1 ngày so với ô khách rời
    setNewOut(format(addDays(parseISO(d), 1), 'yyyy-MM-dd'))
    setPickingStep('in')
  }

  const resetRange = () => {
    setNewIn(today)
    setNewOut('')
    setPickingStep('in')
  }

  const nightsSelected =
    newIn && newOut ? Math.max(0, differenceInDays(parseISO(newOut), parseISO(newIn))) : 0

  const handleSubmit = async () => {
    if (!newIn || !newOut || newOut <= newIn) return
    await mutation.mutateAsync({
      bookingId,
      newCheckInDate: newIn,
      newCheckOutDate: newOut,
      reason: reason.trim() || undefined,
    })
    onOpenChange(false)
    setReason('')
    onSuccess?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Dời ngày check-in</DialogTitle>
          <DialogDescription>
            Đổi lịch nhận phòng cho khách <b>{guestName}</b> — phòng <b>{roomNumber}</b>.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          {roomId && (
            <div className="space-y-2">
              {/* Mode toggle */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Cách chọn:</span>
                <div className="inline-flex rounded border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => {
                      setPickMode('keep_nights')
                      setPickingStep('in')
                      if (newIn)
                        setNewOut(format(addDays(parseISO(newIn), nights), 'yyyy-MM-dd'))
                    }}
                    className={
                      pickMode === 'keep_nights'
                        ? 'px-2 py-1 bg-primary text-primary-foreground'
                        : 'px-2 py-1 bg-background hover:bg-muted'
                    }
                  >
                    Giữ {nights} đêm
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPickMode('range')
                      resetRange()
                    }}
                    className={
                      pickMode === 'range'
                        ? 'px-2 py-1 bg-primary text-primary-foreground'
                        : 'px-2 py-1 bg-background hover:bg-muted'
                    }
                  >
                    Chọn ngày trả riêng
                  </button>
                </div>
                {pickMode === 'range' && (
                  <span
                    className={
                      pickingStep === 'in' ? 'text-primary font-medium' : 'text-amber-600 font-medium'
                    }
                  >
                    {pickingStep === 'in' ? '→ Chạm ngày nhận' : '→ Chạm ngày trả phòng'}
                  </span>
                )}
                {pickMode === 'range' && newOut && (
                  <button
                    type="button"
                    onClick={resetRange}
                    className="ml-auto text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Đặt lại
                  </button>
                )}
              </div>

              <RoomAvailabilityStrip
                fromDate={today}
                days={windowDays}
                selectedIn={newIn}
                selectedOut={newOut || undefined}
                isDateBooked={isDateBooked}
                onPickDate={handlePickDate}
                isLoading={isLoading}
                pickingStep={pickMode === 'range' ? pickingStep : undefined}
              />

              {windowDays < MAX_WINDOW_DAYS && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() =>
                      setWindowDays((d) => Math.min(MAX_WINDOW_DAYS, d + EXTRA_WINDOW_DAYS))
                    }
                  >
                    Xem thêm {EXTRA_WINDOW_DAYS} ngày
                  </Button>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-primary inline-block" />
                Check-in mới
              </Label>
              <Input
                type="date"
                min={today}
                value={newIn}
                onChange={(e) => {
                  setNewIn(e.target.value)
                  if (pickMode === 'range') setPickingStep('out')
                }}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <span className="w-2 h-2 rounded-sm bg-primary/70 inline-block" />
                Check-out mới
              </Label>
              <Input
                type="date"
                min={newIn}
                value={newOut}
                onChange={(e) => {
                  setNewOut(e.target.value)
                  if (pickMode === 'range') setPickingStep('in')
                }}
              />
            </div>
          </div>

          {/* Tóm tắt khoảng đang chọn */}
          {newIn && newOut && rangeFree && (
            <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
              Đang chọn: <b>{format(parseISO(newIn), 'dd/MM/yyyy')}</b> →{' '}
              <b>{format(parseISO(newOut), 'dd/MM/yyyy')}</b> ({nightsSelected} đêm) — phòng trống ✓
            </div>
          )}

          {roomId && newIn && newOut && !rangeFree && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs space-y-1">
              <div className="text-red-700 font-medium">
                Khoảng {format(parseISO(newIn), 'dd/MM')} → {format(parseISO(newOut), 'dd/MM')}{' '}
                trùng lịch khác của phòng này.
              </div>
              {suggestion && (
                <button
                  type="button"
                  onClick={() => setNewIn(suggestion.in)}
                  className="text-red-700 underline hover:no-underline"
                >
                  Dùng khoảng trống gần nhất:{' '}
                  <b>
                    {format(parseISO(suggestion.in), 'dd/MM')} →{' '}
                    {format(parseISO(suggestion.out), 'dd/MM')}
                  </b>
                </button>
              )}
              {!suggestion && (
                <div className="text-red-600">
                  Không tìm thấy khoảng trống {nights} đêm trong cửa sổ hiện tại — thử mở rộng lịch.
                </div>
              )}
            </div>
          )}

          <div className="text-xs text-muted-foreground">
            Lịch cũ: {format(parseISO(currentCheckIn), 'dd/MM/yyyy')} →{' '}
            {format(parseISO(currentCheckOut), 'dd/MM/yyyy')} ({nights} đêm)
          </div>

          <div className="space-y-1">
            <Label htmlFor="r-reason" className="text-xs">
              Lý do (tuỳ chọn)
            </Label>
            <Textarea
              id="r-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Khách báo đến muộn 1 ngày..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={
              !newIn ||
              !newOut ||
              newOut <= newIn ||
              mutation.isPending ||
              (!!roomId && !rangeFree)
            }
          >
            {mutation.isPending ? 'Đang lưu...' : 'Xác nhận dời lịch'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

