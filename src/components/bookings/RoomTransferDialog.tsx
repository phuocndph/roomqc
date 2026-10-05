import { useEffect, useMemo, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { supabase } from '@/integrations/supabase/client'
import { useAvailableRooms } from '@/hooks/useAvailableRooms'
import { mapDbError } from '@/lib/dbErrors'

interface RoomTransferDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: {
    id: string
    room_id: string
    hotel_id: string
    tenant_id: string
    guest_name: string
    check_in_date: string
    check_out_date: string
    booking_type?: string
    hourly_start_time?: string | null
    hourly_end_time?: string | null
    room?: { room_number: string; room_type: string }
  }
  onSuccess?: () => void
}

export function RoomTransferDialog({
  open,
  onOpenChange,
  booking,
  onSuccess,
}: RoomTransferDialogProps) {
  const queryClient = useQueryClient()
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [hourlyValidRoomIds, setHourlyValidRoomIds] = useState<Set<string> | null>(null)
  const [hourlyChecking, setHourlyChecking] = useState(false)

  useEffect(() => {
    if (!open) {
      setSelectedRoomId(null)
      setReason('')
    }
  }, [open])

  const isHourly = booking.booking_type === 'hourly'

  const checkIn = useMemo(() => new Date(booking.check_in_date), [booking.check_in_date])
  const checkOut = useMemo(() => new Date(booking.check_out_date), [booking.check_out_date])

  // For hourly bookings, skip the daily overlap filter (pass undefined dates) and
  // validate each candidate room with the validate_hourly_booking RPC instead.
  const { data: rooms, isLoading } = useAvailableRooms(
    isHourly ? undefined : checkIn,
    isHourly ? undefined : checkOut,
  )

  // Pre-filter (without hourly RPC results yet)
  const preCandidates = useMemo(() => {
    const list = (rooms ?? []).filter(
      (r) => r.id !== booking.room_id && r.hotel_id === booking.hotel_id,
    )
    return list.sort((a, b) => {
      const aSame = a.room_type === booking.room?.room_type ? 0 : 1
      const bSame = b.room_type === booking.room?.room_type ? 0 : 1
      if (aSame !== bSame) return aSame - bSame
      if (a.floor !== b.floor) return a.floor - b.floor
      return a.room_number.localeCompare(b.room_number)
    })
  }, [rooms, booking.room_id, booking.hotel_id, booking.room?.room_type])

  // Run validate_hourly_booking for each candidate when hourly
  useEffect(() => {
    if (!isHourly) {
      setHourlyValidRoomIds(null)
      return
    }
    if (!booking.hourly_start_time || !booking.hourly_end_time) {
      setHourlyValidRoomIds(new Set())
      return
    }
    if (preCandidates.length === 0) {
      setHourlyValidRoomIds(new Set())
      return
    }
    let cancelled = false
    setHourlyChecking(true)
    ;(async () => {
      const results = await Promise.all(
        preCandidates.map(async (r) => {
          const { data, error } = await supabase.rpc('validate_hourly_booking', {
            p_room_id: r.id,
            p_start_time: booking.hourly_start_time!,
            p_end_time: booking.hourly_end_time!,
            p_exclude_booking_id: booking.id,
          })
          if (error) return null
          const valid = (data as any)?.valid === true
          return valid ? r.id : null
        }),
      )
      if (!cancelled) {
        setHourlyValidRoomIds(new Set(results.filter((x): x is string => !!x)))
        setHourlyChecking(false)
      }
    })()
    return () => { cancelled = true }
  }, [isHourly, preCandidates, booking.hourly_start_time, booking.hourly_end_time, booking.id])

  const candidates = useMemo(() => {
    if (!isHourly) return preCandidates
    if (hourlyValidRoomIds === null) return []
    return preCandidates.filter((r) => hourlyValidRoomIds.has(r.id))
  }, [isHourly, preCandidates, hourlyValidRoomIds])

  const handleSubmit = async () => {
    if (!selectedRoomId) return
    const target = candidates.find((c) => c.id === selectedRoomId)
    if (!target) return
    setSubmitting(true)
    try {
      const { error } = await supabase.rpc('transfer_booking_room', {
        p_booking_id: booking.id,
        p_new_room_id: selectedRoomId,
        p_reason: reason.trim() || null,
      })
      if (error) throw error
      toast.success(`Đã chuyển sang phòng ${target.room_number}`)
      queryClient.invalidateQueries({ queryKey: ['all-bookings'] })
      queryClient.invalidateQueries({ queryKey: ['available-rooms'] })
      queryClient.invalidateQueries({ queryKey: ['rooms'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      onSuccess?.()
      onOpenChange(false)
    } catch (err: any) {
      toast.error(mapDbError(err?.message ?? String(err)))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Chuyển phòng — {booking.guest_name}</DialogTitle>
          <DialogDescription>
            Chọn phòng trống khác để chuyển khách. Lịch đặt và thông tin khách được giữ nguyên.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <span className="text-xs text-amber-700">Phòng hiện tại:</span>
            <Badge variant="outline" className="border-amber-300 text-amber-700">
              {booking.room?.room_number} · {booking.room?.room_type}
            </Badge>
          </div>

          <div className="space-y-2">
            <Label className="text-sm">Chọn phòng mới</Label>
            {isLoading || hourlyChecking ? (
              <div className="text-sm text-muted-foreground py-4 text-center">
                Đang tải danh sách phòng...
              </div>
            ) : candidates.length === 0 ? (
              <div className="text-sm text-muted-foreground py-4 text-center border rounded-lg">
                Không có phòng trống cùng loại hoặc khác loại
              </div>
            ) : (
              <ScrollArea className="h-64 border rounded-lg">
                <RadioGroup
                  value={selectedRoomId ?? ''}
                  onValueChange={setSelectedRoomId}
                  className="p-1"
                >
                  {candidates.map((room) => {
                    const sameType = room.room_type === booking.room?.room_type
                    return (
                      <div
                        key={room.id}
                        className="flex items-start gap-2 border-b last:border-b-0 p-3 hover:bg-muted/50"
                      >
                        <RadioGroupItem
                          value={room.id}
                          id={`xfer-${room.id}`}
                          className="mt-0.5"
                        />
                        <Label
                          htmlFor={`xfer-${room.id}`}
                          className="font-normal cursor-pointer flex-1"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="text-sm font-medium">
                              Phòng {room.room_number}
                              <span className="text-muted-foreground font-normal">
                                {' '}· Tầng {room.floor}
                              </span>
                            </div>
                            {sameType && (
                              <Badge variant="secondary" className="text-[10px] h-5">
                                Cùng loại
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {room.room_type}
                          </div>
                        </Label>
                      </div>
                    )
                  })}
                </RadioGroup>
              </ScrollArea>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="xfer-reason" className="text-sm">
              Lý do chuyển phòng
            </Label>
            <Textarea
              id="xfer-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="VD: Khách yêu cầu nâng hạng, phòng bị lỗi điều hòa..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={!selectedRoomId || submitting}
          >
            {submitting ? 'Đang chuyển...' : 'Xác nhận chuyển phòng'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
