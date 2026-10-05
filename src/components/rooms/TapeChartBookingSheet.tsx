import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { differenceInCalendarDays, format, parseISO } from 'date-fns'
import { vi } from 'date-fns/locale'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn, formatCurrency } from '@/lib/utils'
import { BookingDetailDialog } from '@/components/bookings/BookingDetailDialog'
import type { TapeChartBooking, TapeChartRoom } from '@/hooks/useTapeChart'
import {
  getBarColor,
  getPaymentState,
  PAYMENT_LABEL,
  getSourceBadge,
} from '@/lib/tape-chart'
import {
  getRoomStatusMeta,
  canRoomCheckIn,
  isRoomDirty,
  isRoomBlockedForMaintenance,
} from '@/lib/roomStatus'
import {
  useBookingSheetDetails,
  formatIdType,
  vipLabel,
  actionLabel,
} from '@/hooks/useBookingSheetDetails'
import {
  Link2,
  AlertCircle,
  CheckCircle2,
  ImageIcon,
  Phone,
  ChevronDown,
  ExternalLink,
} from 'lucide-react'

interface Props {
  booking: TapeChartBooking | null
  room: TapeChartRoom | null
  groupBookings?: TapeChartBooking[]
  open: boolean
  onOpenChange: (v: boolean) => void
}

export function TapeChartBookingSheet({
  booking,
  room,
  groupBookings,
  open,
  onOpenChange,
}: Props) {
  const navigate = useNavigate()
  const [showDetails, setShowDetails] = useState(false)

  const total = Number(booking?.total_amount) || 0
  const paid = Number(booking?.amount_paid) || 0
  const deposit = Number(booking?.deposit_amount) || 0
  const settled = paid + deposit
  const remaining = total - settled
  const paymentState = booking ? getPaymentState(booking) : null
  const colors = booking ? getBarColor(booking) : null
  const sourceBadge = getSourceBadge(booking?.booking_source)
  const roomMeta = room ? getRoomStatusMeta(room.status) : null

  const { data: details } = useBookingSheetDetails(booking?.id, open && !!booking)
  const breakdown = details?.breakdown
  const hasIdScan = !!details?.guest_id_image_url || !!details?.guest_id_number
  const crm = details?.crmGuest
  const vip = vipLabel(crm?.vip_level)

  const statusLabel = useMemo(() => {
    if (!booking) return ''
    switch (booking.status) {
      case 'confirmed':
        return 'Đã xác nhận'
      case 'checked_in':
        return 'Đang lưu trú'
      case 'checked_out':
        return 'Đã trả phòng'
      default:
        return booking.status
    }
  }, [booking])

  const nights = useMemo(() => {
    if (!booking) return 0
    return Math.max(
      1,
      differenceInCalendarDays(
        parseISO(booking.check_out_date),
        parseISO(booking.check_in_date),
      ),
    )
  }, [booking])

  // ---- Operational warnings ----
  const warnings: { tone: 'red' | 'amber'; text: string }[] = []
  if (booking && room) {
    if (booking.status === 'confirmed') {
      if (isRoomBlockedForMaintenance(room.status)) {
        warnings.push({
          tone: 'red',
          text: `Phòng đang ${roomMeta?.label.toLowerCase()} — không thể nhận khách`,
        })
      } else if (isRoomDirty(room.status)) {
        warnings.push({
          tone: 'amber',
          text: 'Phòng đang bẩn — cần dọn trước khi nhận khách',
        })
      } else if (!canRoomCheckIn(room.status)) {
        warnings.push({
          tone: 'amber',
          text: `Phòng đang "${roomMeta?.label}" — kiểm tra trước khi nhận`,
        })
      }
      if (details && !hasIdScan) {
        warnings.push({
          tone: 'amber',
          text: 'Chưa scan giấy tờ — cần bổ sung khi nhận phòng',
        })
      }
    }
    if (booking.status === 'checked_out' && remaining > 1000) {
      warnings.push({
        tone: 'red',
        text: `Khách đã trả phòng nhưng còn nợ ${formatCurrency(remaining)}`,
      })
    }
  }

  // ---- Primary CTA label theo status ----
  const primaryCta = useMemo(() => {
    if (!booking) return { label: 'Mở booking', emphasize: false }
    if (booking.status === 'confirmed') {
      return { label: 'Tiếp tục nhận phòng', emphasize: true }
    }
    if (booking.status === 'checked_in') {
      return remaining > 1000
        ? { label: 'Thu tiền & trả phòng', emphasize: true }
        : { label: 'Trả phòng', emphasize: true }
    }
    return { label: 'Mở phiếu booking', emphasize: false }
  }, [booking, remaining])

  const [detailOpen, setDetailOpen] = useState(false)
  const [detailBookingId, setDetailBookingId] = useState<string | null>(null)

  const openDetail = (id?: string) => {
    const targetId = id ?? booking?.id
    if (!targetId) return
    setDetailBookingId(targetId)
    setDetailOpen(true)
  }

  const goDetail = () => openDetail()


  // Format ngày kiểu lễ tân: "T6 29/05 · 14:00"
  const fmtDateTime = (date: string, time?: string | null, fallback?: string) =>
    `${format(parseISO(date), 'EEE dd/MM', { locale: vi })} · ${
      time?.slice(0, 5) || fallback
    }`

  // ----- Tài chính cốt lõi (3 số) -----
  const remainingLabel =
    booking?.status === 'checked_out' ? 'Còn nợ' : 'Còn phải thu'
  const remainingTone =
    booking?.status === 'checked_out' ? 'text-red-700' : 'text-amber-700'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full max-w-md flex-col gap-0 overflow-hidden p-0 sm:max-w-md"
      >
        {booking && (
          <>
            {/* ============== HEADER ============== */}
            <div className={cn('shrink-0 px-5 pt-5 pb-3', colors?.bg)}>
              <SheetHeader className="space-y-1 text-left">
                <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide opacity-75">
                  <span className="font-semibold">Phòng {room?.room_number}</span>
                  {sourceBadge && (
                    <span className="rounded bg-background/60 px-1.5 py-0.5 font-mono text-[10px]">
                      {sourceBadge}
                    </span>
                  )}
                  <span className="ml-auto">{statusLabel}</span>
                </div>

                <SheetTitle className="truncate text-xl">
                  {booking.guest_name}
                </SheetTitle>

                <SheetDescription className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                  {booking.guest_phone && (
                    <a
                      href={`tel:${booking.guest_phone}`}
                      className="font-medium text-foreground/90 underline-offset-2 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {booking.guest_phone}
                    </a>
                  )}
                  {booking.guest_count && <span>{booking.guest_count} khách</span>}
                  {paymentState && (
                    <span className="ml-auto opacity-75">
                      {PAYMENT_LABEL[paymentState]}
                    </span>
                  )}
                </SheetDescription>
              </SheetHeader>
            </div>

            {/* ============== WARNINGS ============== */}
            {warnings.length > 0 && (
              <div className="shrink-0 space-y-1 border-y bg-muted/40 px-5 py-2">
                {warnings.map((w, i) => (
                  <div
                    key={i}
                    className={cn(
                      'text-xs font-medium leading-snug',
                      w.tone === 'red' ? 'text-red-700' : 'text-amber-700',
                    )}
                  >
                    {w.text}
                  </div>
                ))}
              </div>
            )}

            {/* ============== BODY (scroll) ============== */}
            <div className="flex-1 overflow-y-auto">
              {/* ====== 1. TÓM TẮT NHANH ====== */}
              <section className="border-b px-5 py-4">
                {/* Lưu trú: 2 dòng đơn giản */}
                <div className="space-y-1 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Nhận
                    </span>
                    <span className="font-medium tabular-nums">
                      {fmtDateTime(
                        booking.check_in_date,
                        booking.expected_check_in_time,
                        '14:00',
                      )}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      Trả
                    </span>
                    <span className="font-medium tabular-nums">
                      {fmtDateTime(
                        booking.check_out_date,
                        booking.expected_check_out_time,
                        '12:00',
                      )}
                    </span>
                  </div>
                  <div className="pt-0.5 text-[11px] text-muted-foreground">
                    {nights} đêm · {room?.room_type}
                  </div>
                </div>

                {/* 3 số tài chính cốt lõi */}
                <div className="mt-3 space-y-1.5 rounded-md border bg-muted/30 px-3 py-2.5">
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Tổng</span>
                    <span className="font-semibold tabular-nums">
                      {formatCurrency(total)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between text-sm">
                    <span className="text-muted-foreground">Đã thu</span>
                    <span className="tabular-nums">{formatCurrency(settled)}</span>
                  </div>
                  {remaining > 1000 ? (
                    <div className="flex items-baseline justify-between border-t pt-1.5">
                      <span className={cn('text-sm font-semibold', remainingTone)}>
                        {remainingLabel}
                      </span>
                      <span
                        className={cn(
                          'text-base font-bold tabular-nums',
                          remainingTone,
                        )}
                      >
                        {formatCurrency(remaining)}
                      </span>
                    </div>
                  ) : (
                    settled > 0 && (
                      <div className="border-t pt-1.5 text-sm font-medium text-emerald-700">
                        Đã thanh toán đủ
                      </div>
                    )
                  )}
                </div>
              </section>

              {/* ====== 2. QUICK ACTIONS ====== */}
              <section className="border-b px-5 py-3">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    disabled={!booking.guest_phone}
                    asChild={!!booking.guest_phone}
                  >
                    {booking.guest_phone ? (
                      <a href={`tel:${booking.guest_phone}`}>
                        <Phone className="mr-1.5 h-3.5 w-3.5" />
                        Gọi khách
                      </a>
                    ) : (
                      <span>
                        <Phone className="mr-1.5 h-3.5 w-3.5" />
                        Gọi khách
                      </span>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9"
                    onClick={goDetail}
                  >
                    <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                    Mở phiếu booking
                  </Button>
                </div>
              </section>

              {/* ====== 3. CHI TIẾT (collapse mặc định) ====== */}
              <Collapsible
                open={showDetails}
                onOpenChange={setShowDetails}
                className="border-b"
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
                  >
                    <span>Xem chi tiết</span>
                    <ChevronDown
                      className={cn(
                        'h-4 w-4 transition-transform',
                        showDetails && 'rotate-180',
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  {/* Mốc thực tế nếu có */}
                  {(booking.actual_check_in || booking.actual_check_out) && (
                    <section className="border-t px-5 py-3">
                      <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Mốc thực tế
                      </h3>
                      <div className="space-y-0.5 text-xs">
                        {booking.actual_check_in && (
                          <div>
                            Nhận:{' '}
                            <span className="font-medium text-foreground/90 tabular-nums">
                              {format(
                                parseISO(booking.actual_check_in),
                                'dd/MM HH:mm',
                              )}
                            </span>
                          </div>
                        )}
                        {booking.actual_check_out && (
                          <div>
                            Trả:{' '}
                            <span className="font-medium text-foreground/90 tabular-nums">
                              {format(
                                parseISO(booking.actual_check_out),
                                'dd/MM HH:mm',
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </section>
                  )}

                  {/* Chi tiết tài chính */}
                  <section className="border-t px-5 py-3">
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Chi tiết tài chính
                    </h3>
                    <div className="space-y-1 text-sm">
                      {breakdown?.subtotal != null && breakdown.subtotal > 0 ? (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">
                            Tiền phòng
                            {breakdown.room_price
                              ? ` (${formatCurrency(breakdown.room_price)} × ${nights}đ)`
                              : ` (${nights} đêm)`}
                          </span>
                          <span className="tabular-nums">
                            {formatCurrency(breakdown.subtotal)}
                          </span>
                        </div>
                      ) : (
                        total > 0 &&
                        nights > 0 && (
                          <div className="flex justify-between text-muted-foreground">
                            <span>Trung bình / đêm</span>
                            <span className="tabular-nums">
                              {formatCurrency(Math.round(total / nights))}
                            </span>
                          </div>
                        )
                      )}

                      {breakdown && breakdown.early_checkin_charge > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Phụ thu nhận sớm</span>
                          <span className="tabular-nums">
                            {formatCurrency(breakdown.early_checkin_charge)}
                          </span>
                        </div>
                      )}
                      {breakdown && breakdown.late_checkout_charge > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Phụ thu trả muộn</span>
                          <span className="tabular-nums">
                            {formatCurrency(breakdown.late_checkout_charge)}
                          </span>
                        </div>
                      )}
                      {breakdown && breakdown.extra_charges > 0 && (
                        <div className="flex justify-between text-muted-foreground">
                          <span>Phụ thu khác</span>
                          <span className="tabular-nums">
                            {formatCurrency(breakdown.extra_charges)}
                          </span>
                        </div>
                      )}
                      {breakdown && breakdown.damage_charges > 0 && (
                        <div className="flex justify-between text-red-700">
                          <span>Đền bù hư hỏng</span>
                          <span className="tabular-nums">
                            {formatCurrency(breakdown.damage_charges)}
                          </span>
                        </div>
                      )}

                      {breakdown && breakdown.service_items.length > 0 && (
                        <div className="pt-1">
                          <div className="flex justify-between font-medium">
                            <span>Dịch vụ ({breakdown.service_items.length})</span>
                            <span className="tabular-nums">
                              {formatCurrency(breakdown.service_items_total)}
                            </span>
                          </div>
                          <ul className="mt-0.5 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                            {breakdown.service_items.slice(0, 4).map((s) => (
                              <li key={s.id} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {s.name} × {s.qty}
                                </span>
                                <span className="tabular-nums">
                                  {formatCurrency(s.total)}
                                </span>
                              </li>
                            ))}
                            {breakdown.service_items.length > 4 && (
                              <li className="italic">
                                … và {breakdown.service_items.length - 4} mục khác
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      {breakdown && breakdown.minibar_items.length > 0 && (
                        <div className="pt-1">
                          <div className="flex justify-between font-medium">
                            <span>Minibar ({breakdown.minibar_items.length})</span>
                            <span className="tabular-nums">
                              {formatCurrency(breakdown.minibar_items_total)}
                            </span>
                          </div>
                          <ul className="mt-0.5 space-y-0.5 pl-3 text-[11px] text-muted-foreground">
                            {breakdown.minibar_items.slice(0, 4).map((s) => (
                              <li key={s.id} className="flex justify-between gap-2">
                                <span className="truncate">
                                  {s.name} × {s.qty}
                                </span>
                                <span className="tabular-nums">
                                  {formatCurrency(s.total)}
                                </span>
                              </li>
                            ))}
                            {breakdown.minibar_items.length > 4 && (
                              <li className="italic">
                                … và {breakdown.minibar_items.length - 4} mục khác
                              </li>
                            )}
                          </ul>
                        </div>
                      )}

                      <div className="mt-2 flex justify-between border-t pt-2">
                        <span className="text-muted-foreground">Đã cọc</span>
                        <span className="tabular-nums">
                          {formatCurrency(deposit)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Đã thu</span>
                        <span className="tabular-nums">{formatCurrency(paid)}</span>
                      </div>
                    </div>
                  </section>

                  {/* Giấy tờ */}
                  <section className="border-t px-5 py-3">
                    <div className="mb-2 flex items-baseline justify-between">
                      <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Giấy tờ
                      </h3>
                      {hasIdScan ? (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                          <CheckCircle2 className="h-3 w-3" /> Đã scan
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[11px] font-medium text-amber-700">
                          <AlertCircle className="h-3 w-3" /> Chưa scan
                        </span>
                      )}
                    </div>
                    {hasIdScan ? (
                      <div className="flex items-center gap-3 text-sm">
                        {details?.guest_id_image_url ? (
                          <a
                            href={details.guest_id_image_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border bg-muted"
                          >
                            <img
                              src={details.guest_id_image_url}
                              alt="Giấy tờ"
                              className="h-full w-full object-cover"
                            />
                          </a>
                        ) : (
                          <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded border bg-muted text-muted-foreground">
                            <ImageIcon className="h-4 w-4" />
                          </div>
                        )}
                        <div className="min-w-0 leading-tight">
                          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {formatIdType(details?.guest_id_type)}
                          </div>
                          <div className="truncate font-mono text-sm">
                            {details?.guest_id_number || '—'}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">
                        Yêu cầu khách xuất trình CCCD/Hộ chiếu để bổ sung vào hồ sơ.
                      </p>
                    )}
                  </section>

                  {/* CRM */}
                  {crm && (
                    <section className="border-t px-5 py-3">
                      <div className="mb-2 flex items-baseline justify-between">
                        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Hồ sơ khách
                        </h3>
                        {vip && (
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                            {vip}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          onOpenChange(false)
                          navigate(`/guests/${crm.id}`)
                        }}
                        className="flex w-full items-center justify-between gap-2 rounded border px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium">
                            {crm.full_name}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {crm.total_stays} lượt lưu trú ·{' '}
                            {formatCurrency(crm.total_spent || 0)}
                            {crm.last_stay_date &&
                              ` · Gần nhất ${format(
                                parseISO(crm.last_stay_date),
                                'dd/MM/yy',
                              )}`}
                          </div>
                        </div>
                        <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      </button>
                    </section>
                  )}

                  {/* Lịch sử */}
                  {details && details.history.length > 0 && (
                    <section className="border-t px-5 py-3">
                      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Lịch sử ({details.history.length})
                      </h3>
                      <ul className="space-y-1.5">
                        {details.history.slice(0, 6).map((h) => (
                          <li
                            key={h.id}
                            className="flex items-start gap-2 text-[11px] leading-snug"
                          >
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-border" />
                            <div className="min-w-0 flex-1">
                              <div className="flex justify-between gap-2">
                                <span className="font-medium text-foreground/90">
                                  {actionLabel(h.action)}
                                </span>
                                <span className="tabular-nums text-muted-foreground">
                                  {format(parseISO(h.created_at), 'dd/MM HH:mm')}
                                </span>
                              </div>
                              {h.changed_fields && h.changed_fields.length > 0 && (
                                <div className="truncate text-muted-foreground">
                                  {h.changed_fields.slice(0, 4).join(', ')}
                                </div>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}

                  {/* Ghi chú */}
                  {booking.notes && (
                    <section className="border-t px-5 py-3">
                      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Ghi chú
                      </h3>
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">
                        {booking.notes}
                      </p>
                    </section>
                  )}
                </CollapsibleContent>
              </Collapsible>

              {/* Nhóm đặt phòng — luôn hiện vì là điều hướng */}
              {groupBookings && groupBookings.length > 1 && (
                <section className="border-b px-5 py-3">
                  <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Nhóm đặt phòng · {groupBookings.length} phòng
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {groupBookings.map((gb) => (
                      <button
                        key={gb.id}
                        type="button"
                        onClick={() => openDetail(gb.id)}
                        className={cn(
                          'rounded border px-2 py-1 text-xs hover:bg-accent',
                          gb.id === booking.id &&
                            'border-primary bg-accent font-semibold',
                        )}
                      >
                        {gb.guest_name}
                      </button>
                    ))}
                  </div>
                </section>

              )}

              <div className="h-2" />
            </div>

            {/* ============== STICKY FOOTER ============== */}
            <div className="shrink-0 border-t bg-background px-5 py-3">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => onOpenChange(false)}
                >
                  Đóng
                </Button>
                <Button
                  className="flex-[2]"
                  variant={primaryCta.emphasize ? 'default' : 'secondary'}
                  onClick={goDetail}
                >
                  {primaryCta.label}
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
      <BookingDetailDialog
        bookingId={detailBookingId}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </Sheet>
  )
}

