import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { supabase } from '@/integrations/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { format, parseISO, differenceInMinutes, differenceInCalendarDays } from 'date-fns'
import { vi } from 'date-fns/locale'

import { useToast } from '@/hooks/use-toast'
import { getFriendlyError } from '@/lib/errorMessage'
import { useReceptionRoomDetail } from '@/hooks/useReceptionRoomDetail'
import { useRoomTypePricing } from '@/hooks/useRoomTypePricing'
import { useHotelContext } from '@/contexts/HotelContext'
import { RoomAuditLogDialog } from './RoomAuditLogDialog'
import { RoomQuickHeader } from './RoomQuickHeader'
import { ExtendBookingDialog } from '@/components/bookings/ExtendBookingDialog'
import {
  Phone, MoreVertical, Users, Building2, BedDouble, Calendar,
  History, BadgeCheck, FileText, ExternalLink,
} from 'lucide-react'

import type { FloorPlanRoom } from '@/hooks/useFloorPlanLive'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  room: FloorPlanRoom | null
  onBookRoom: (roomId: string, roomNumber: string) => void
  onOpenBookingDetail: (bookingId: string) => void
}

function formatCountdown(target: Date) {
  const mins = differenceInMinutes(target, new Date())
  if (mins < 0) return { label: `Trễ ${Math.abs(Math.round(mins / 60))}h`, tone: 'overdue' as const }
  if (mins < 60) return { label: `Còn ${mins} phút`, tone: 'soon' as const }
  if (mins < 24 * 60) return { label: `Còn ${Math.round(mins / 60)}h`, tone: 'normal' as const }
  return { label: `Còn ${Math.round(mins / (60 * 24))} ngày`, tone: 'normal' as const }
}

const PRIORITY_COLORS: Record<string, string> = {
  urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-500', low: 'bg-slate-400',
}


export function ReceptionQuickDialog({ open, onOpenChange, room, onBookRoom, onOpenBookingDetail }: Props) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const qc = useQueryClient()
  const bk = room?.current_booking
  const [auditOpen, setAuditOpen] = useState(false)
  const [extendOpen, setExtendOpen] = useState(false)
  const [tab, setTab] = useState('overview')

  const { selectedHotel } = useHotelContext()
  const { data: detail, isLoading } = useReceptionRoomDetail(room?.id, bk?.id ?? null, open)
  const pricing = useRoomTypePricing(room?.room_type ?? null, selectedHotel?.id ?? null)

  const transitionMut = useMutation({
    mutationFn: async (params: { to: string; reason?: string; until?: string }) => {
      if (!room) throw new Error('no room')
      const { error } = await supabase.rpc('transition_room_status', {
        _room_id: room.id,
        _to_status: params.to,
        _reason: params.reason || null,
        _dnd_until: params.to === 'dnd' ? (params.until || null) : null,
        _oos_until: params.to === 'out_of_service' ? (params.until || null) : null,
      } as any)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['floor-plan-live'] })
      qc.invalidateQueries({ queryKey: ['reception-room-detail'] })
      toast({ title: 'Đã đổi trạng thái phòng' })
      onOpenChange(false)
    },
    onError: (e: any) => toast({ variant: 'destructive', title: 'Lỗi', description: getFriendlyError(e) }),
  })

  if (!room) return null

  const isOccupied = !!bk
  const r = detail?.room
  const guest = detail?.guest

  const checkoutDate = bk?.check_out_date
    ? parseISO(`${bk.check_out_date}T${(bk.expected_check_out_time || '12:00').slice(0, 5)}:00`)
    : null
  const countdown = checkoutDate ? formatCountdown(checkoutDate) : null

  // Finance math
  const roomPrice = Number((bk as any)?.room_price ?? 0) || 0
  const scTotal = (detail?.serviceCharges || []).reduce((s, x) => s + Number(x.total_price || 0), 0)
  const mbTotal = (detail?.minibar || []).reduce((s, x) => s + Number(x.total_amount || x.quantity * x.unit_price || 0), 0)
  const totalAmount = Number(bk?.total_amount ?? 0) || 0
  const paid = Number(bk?.amount_paid ?? 0) || 0
  const deposit = Number(bk?.deposit_amount ?? 0) || 0
  const remaining = totalAmount - paid - deposit
  const stayDays = bk ? differenceInCalendarDays(parseISO(bk.check_out_date || ''), parseISO(bk.check_in_date)) : 0
  const stayedDays = bk?.actual_check_in
    ? differenceInCalendarDays(new Date(), parseISO(bk.actual_check_in)) + 1
    : 0

  const amenityLabels: Record<string, string> = {
    wifi: 'Wifi', tv: 'TV', minibar: 'Minibar', safe: 'Két', balcony: 'Ban công',
    bathtub: 'Bồn tắm', city_view: 'View phố', sea_view: 'View biển', mountain_view: 'View núi',
    smoking: 'Hút thuốc', kitchen: 'Bếp', ac: 'Điều hòa', desk: 'Bàn làm việc',
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0 max-h-[90vh] flex flex-col">
          {/* Header — dùng shared RoomQuickHeader, đồng bộ 100% với RoomQuickViewDialog */}
          <RoomQuickHeader
            roomNumber={room.room_number}
            status={room.status}
            trailingBadge={
              guest?.vip_level && guest.vip_level !== 'normal' ? (
                <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                  VIP {guest.vip_level}
                </span>
              ) : null
            }
            rightSlot={
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Thêm tùy chọn">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
                  <DropdownMenuItem onClick={() => { onOpenChange(false); navigate(`/rooms/${room.id}`) }}>
                    <ExternalLink className="h-3.5 w-3.5 mr-2" /> Xem chi tiết phòng
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { onOpenChange(false); navigate(`/rooms/${room.id}/check`) }}>
                    Kiểm tra phòng
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Đổi trạng thái</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => transitionMut.mutate({ to: 'vacant_clean', reason: 'Lễ tân gỡ trạng thái' })}>
                    Gỡ về Trống sạch
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => transitionMut.mutate({ to: 'dnd', reason: 'Khách yêu cầu DND' })}>
                    Đặt DND (Không làm phiền)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => transitionMut.mutate({ to: 'out_of_service', reason: 'Tạm ngừng kinh doanh' })}>
                    OOS (Tạm ngừng)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => transitionMut.mutate({ to: 'out_of_order', reason: 'Phòng hỏng' })}>
                    OOO (Hỏng)
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => { onOpenChange(false); navigate(`/maintenance/requests/new?roomId=${room.id}`) }}>
                    Tạo yêu cầu bảo trì
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { onOpenChange(false); navigate(`/housekeeping?roomId=${room.id}`) }}>
                    Tạo task buồng phòng
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setAuditOpen(true)}>
                    <History className="h-3.5 w-3.5 mr-2" /> Lịch sử phòng
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            }
            subline={
              <>
                <span>{r?.room_type || room.room_type}</span>
                {r?.bed_type && <><span>·</span><span>{r.bed_type}</span></>}
                {r?.floor != null && <><span>·</span><span>Tầng {r.floor}</span></>}
                {r?.area_sqm && <><span>·</span><span>{r.area_sqm}m²</span></>}
                {r?.view_type && <><span>·</span><span>{r.view_type}</span></>}
              </>
            }
          />


          {/* Tabs */}
          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col overflow-hidden">
            <TabsList className="grid grid-cols-3 mx-5 mt-3 shrink-0">
              <TabsTrigger value="overview">Tổng quan</TabsTrigger>
              <TabsTrigger value="finance" disabled={!isOccupied}>Tài chính</TabsTrigger>
              <TabsTrigger value="ops">Vận hành</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* ========== OVERVIEW ========== */}
              <TabsContent value="overview" className="mt-0 space-y-4">
                {isOccupied && bk ? (
                  <>
                    {/* Guest card */}
                    <div className="rounded-lg border p-3 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-xs text-muted-foreground">Khách đang ở</div>
                          <div className="text-lg font-semibold">{guest?.full_name || bk.guest_name || 'Khách lẻ'}</div>
                          {guest?.phone && (
                            <a href={`tel:${guest.phone}`} className="flex items-center gap-1 text-sm text-blue-600 hover:underline mt-0.5">
                              <Phone className="h-3 w-3" /> {guest.phone}
                            </a>
                          )}
                          {guest?.email && (
                            <div className="text-xs text-muted-foreground">{guest.email}</div>
                          )}
                        </div>
                        <div className="text-right text-xs">
                          {bk.guest_count && <div><Users className="inline h-3 w-3 mr-0.5" />{bk.guest_count} khách</div>}
                          {guest?.nationality && <div className="text-muted-foreground">{guest.nationality}</div>}
                        </div>
                      </div>
                      {(guest?.id_number || guest?.id_type) && (
                        <div className="text-xs border-t pt-2 flex items-center gap-2">
                          <BadgeCheck className="h-3.5 w-3.5 text-emerald-600" />
                          <span className="font-medium uppercase">{guest.id_type || 'CCCD'}</span>
                          <span className="font-mono">{guest.id_number || '—'}</span>
                          {guest.id_image_url && (
                            <a href={guest.id_image_url} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline ml-auto">
                              Xem ảnh
                            </a>
                          )}
                        </div>
                      )}
                      {guest && guest.total_stays > 0 && (
                        <div className="text-xs text-muted-foreground border-t pt-2">
                          Khách thân thiết: <span className="font-semibold text-foreground">{guest.total_stays} lần</span> ·
                          tổng chi <span className="font-semibold text-foreground">{formatCurrency(Number(guest.total_spent))}</span>
                        </div>
                      )}
                    </div>

                    {/* Booking meta */}
                    <div className="rounded-lg border p-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">Mã booking</div>
                        <div className="font-mono font-semibold">{(bk as any).booking_reference || bk.id.slice(0, 8).toUpperCase()}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Nguồn</div>
                        <div className="font-semibold capitalize">{bk.booking_source || 'Walk-in'}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Check-in</div>
                        <div className="font-semibold">
                          {bk.actual_check_in
                            ? format(parseISO(bk.actual_check_in), 'HH:mm dd/MM', { locale: vi })
                            : format(parseISO(bk.check_in_date), 'dd/MM', { locale: vi })}
                        </div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Số đêm</div>
                        <div className="font-semibold">{stayedDays}/{stayDays} đêm</div>
                      </div>
                    </div>

                    {/* Countdown */}
                    {checkoutDate && countdown && (
                      <div className="rounded-lg border p-3 flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">Checkout dự kiến</div>
                          <div className="text-base font-semibold">{format(checkoutDate, 'HH:mm · dd/MM', { locale: vi })}</div>
                        </div>
                        <div className={`text-sm font-bold ${
                          countdown.tone === 'overdue' ? 'text-red-600'
                            : countdown.tone === 'soon' ? 'text-amber-600' : 'text-emerald-600'
                        }`}>{countdown.label}</div>
                      </div>
                    )}

                    {/* Recent stays */}
                    {detail && detail.recentStays.length > 0 && (
                      <div className="rounded-lg border p-3">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Lịch sử lưu trú gần đây</div>
                        <div className="space-y-1 text-xs">
                          {detail.recentStays.map((s) => (
                            <div key={s.id} className="flex justify-between">
                              <span>{format(parseISO(s.check_in_date), 'dd/MM/yy', { locale: vi })} → {format(parseISO(s.check_out_date), 'dd/MM/yy', { locale: vi })}</span>
                              <span className="font-medium">{formatCurrency(Number(s.total_amount || 0))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    {/* Pricing card — Đêm linh hoạt (seasonal/override), Giờ & Tháng cố định */}
                    <div className="grid grid-cols-3 gap-2">
                      {/* GIÁ ĐÊM */}
                      <div className="rounded-lg border p-3 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase flex items-center justify-center gap-1">
                          Theo đêm
                          {pricing.nightlySource === 'seasonal' && (
                            <span className="text-amber-600" title="Áp dụng quy tắc mùa">●</span>
                          )}
                          {pricing.nightlySource === 'override' && (
                            <span className="text-blue-600" title="Có giá ghi đè theo ngày">●</span>
                          )}
                        </div>
                        {pricing.isClosed ? (
                          <div className="text-sm font-semibold mt-1 text-red-600">Đóng bán</div>
                        ) : pricing.nightly != null ? (
                          <>
                            <div className="text-lg font-bold mt-1">{formatCurrency(pricing.nightly)}</div>
                            {pricing.nightlyBase != null && pricing.nightly !== pricing.nightlyBase && (
                              <div className="text-[10px] text-muted-foreground line-through">{formatCurrency(pricing.nightlyBase)}</div>
                            )}
                          </>
                        ) : (
                          <div className="mt-1">
                            <div className="text-lg font-bold text-muted-foreground">—</div>
                            <button type="button" onClick={() => navigate(pricing.configureUrl)} className="text-[10px] text-blue-600 hover:underline">Cấu hình giá</button>
                          </div>
                        )}
                      </div>

                      {/* GIÁ GIỜ */}
                      <div className="rounded-lg border p-3 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase">Theo giờ</div>
                        {pricing.hourly != null ? (
                          <>
                            <div className="text-lg font-bold mt-1">{formatCurrency(pricing.hourly)}</div>
                            {pricing.hourlyFirstBlock && (
                              <div className="text-[10px] text-muted-foreground">
                                {pricing.hourlyFirstBlock.hours}h đầu: {formatCurrency(pricing.hourlyFirstBlock.price)}
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="mt-1">
                            <div className="text-lg font-bold text-muted-foreground">—</div>
                            <button type="button" onClick={() => navigate(pricing.configureUrl)} className="text-[10px] text-blue-600 hover:underline">Cấu hình giá</button>
                          </div>
                        )}
                      </div>

                      {/* GIÁ THÁNG */}
                      <div className="rounded-lg border p-3 text-center">
                        <div className="text-[10px] text-muted-foreground uppercase">Theo tháng</div>
                        {pricing.monthly != null ? (
                          <div className="text-lg font-bold mt-1">{formatCurrency(pricing.monthly)}</div>
                        ) : (
                          <div className="mt-1">
                            <div className="text-lg font-bold text-muted-foreground">—</div>
                            <button type="button" onClick={() => navigate(pricing.configureUrl)} className="text-[10px] text-blue-600 hover:underline">Cấu hình giá</button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Specs */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded border p-2 flex items-center gap-1.5 justify-center">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>{r?.max_guests ?? '—'} khách</span>
                      </div>
                      <div className="rounded border p-2 flex items-center gap-1.5 justify-center">
                        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Tầng {r?.floor ?? '—'}</span>
                      </div>
                      <div className="rounded border p-2 flex items-center gap-1.5 justify-center">
                        <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="truncate">{r?.bed_type || '—'}</span>
                      </div>
                    </div>

                    {/* Amenities */}
                    {r?.amenities && r.amenities.length > 0 && (
                      <div className="rounded-lg border p-3">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Tiện nghi</div>
                        <div className="flex flex-wrap gap-1.5">
                          {r.amenities.map((a) => (
                            <span key={a} className="text-xs bg-muted px-2 py-0.5 rounded">
                              {amenityLabels[a] || a}
                            </span>
                          ))}
                          {r.has_balcony && <span className="text-xs bg-muted px-2 py-0.5 rounded">Ban công</span>}
                          {r.smoking_allowed && <span className="text-xs bg-muted px-2 py-0.5 rounded">Hút thuốc</span>}
                        </div>
                      </div>
                    )}

                    {/* Upcoming bookings 7 days */}
                    {detail && detail.upcomingBookings.length > 0 && (
                      <div className="rounded-lg border p-3">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Booking 7 ngày tới</div>
                        <div className="space-y-1.5 text-xs">
                          {detail.upcomingBookings.map((b) => (
                            <div key={b.id} className="flex justify-between items-center">
                              <span>{format(parseISO(b.check_in_date), 'dd/MM', { locale: vi })} → {format(parseISO(b.check_out_date), 'dd/MM', { locale: vi })}</span>
                              <span className="font-medium truncate ml-2">{b.guest_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {room.next_booking && (
                      <div className="rounded-lg border border-orange-200 bg-orange-50 p-2.5 text-xs">
                        <div className="flex items-center gap-1.5 font-semibold text-orange-700">
                          <Calendar className="h-3.5 w-3.5" /> Sắp có khách: {room.next_booking.guest_name}
                        </div>
                        <div className="text-orange-600 mt-0.5">
                          {room.next_booking.check_in_date} {(room.next_booking.expected_check_in_time || '14:00').slice(0, 5)}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* ========== FINANCE ========== */}
              <TabsContent value="finance" className="mt-0 space-y-3">
                {isOccupied && bk && (
                  <>
                    <div className="rounded-lg border divide-y text-sm">
                      <Row label="Tiền phòng" value={roomPrice} />
                      <Row label={`Dịch vụ thêm${detail?.serviceCharges.length ? ` (${detail.serviceCharges.length})` : ''}`} value={scTotal} />
                      <Row label={`Minibar${detail?.minibar.length ? ` (${detail.minibar.length})` : ''}`} value={mbTotal} />
                      <Row label="Phụ thu sớm/muộn" value={Number((bk as any).early_checkin_charge || 0) + Number((bk as any).late_checkout_charge || 0)} />
                      <Row label="Tạm tính" value={Number((bk as any).subtotal || 0)} bold />
                      <Row label={`Thuế GTGT (${Number((bk as any).vat_rate || 0)}%)`} value={Number((bk as any).vat_amount || 0)} />
                      <Row label="Tổng tiền" value={totalAmount} bold />
                      <Row label="Đã cọc" value={-deposit} muted />
                      <Row label="Đã thanh toán" value={-paid} muted />
                      <Row label="Còn phải thu" value={remaining} bold danger={remaining > 1000} />
                    </div>

                    {detail && (detail.serviceCharges.length > 0 || detail.minibar.length > 0) && (
                      <div className="rounded-lg border p-3">
                        <div className="text-xs font-semibold text-muted-foreground mb-2">Chi tiết dịch vụ & minibar</div>
                        <div className="space-y-1 text-xs">
                          {detail.serviceCharges.map((s) => (
                            <div key={s.id} className="flex justify-between">
                              <span>{s.service_name} <span className="text-muted-foreground">×{s.quantity}</span></span>
                              <span className="font-medium">{formatCurrency(s.total_price)}</span>
                            </div>
                          ))}
                          {detail.minibar.map((m) => (
                            <div key={m.id} className="flex justify-between">
                              <span>{m.item_name} <span className="text-muted-foreground">×{m.quantity}</span></span>
                              <span className="font-medium">{formatCurrency(Number(m.total_amount || m.quantity * m.unit_price))}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <button
                      className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                      onClick={() => { onOpenChange(false); onOpenBookingDetail(bk.id) }}
                    >
                      <FileText className="h-3 w-3" /> Mở hoá đơn đầy đủ <ExternalLink className="h-3 w-3" />
                    </button>
                  </>
                )}
              </TabsContent>

              {/* ========== OPS ========== */}
              <TabsContent value="ops" className="mt-0 space-y-3">
                {detail?.openHkTasks.length === 0 && detail?.openMaintenance.length === 0 && (
                  <div className="text-xs text-muted-foreground text-center py-6">
                    Không có task đang mở cho phòng này
                  </div>
                )}
                {detail && detail.openHkTasks.length > 0 && (
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Buồng phòng đang mở ({detail.openHkTasks.length})</div>
                    <div className="space-y-1.5 text-xs">
                      {detail.openHkTasks.map((t) => (
                        <div key={t.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[t.priority] || 'bg-slate-400'}`} />
                            <span>{t.title || t.task_type}</span>
                          </div>
                          <span className="text-muted-foreground capitalize">{t.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail && detail.openMaintenance.length > 0 && (
                  <div className="rounded-lg border p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Bảo trì đang mở ({detail.openMaintenance.length})</div>
                    <div className="space-y-1.5 text-xs">
                      {detail.openMaintenance.map((t) => (
                        <div key={t.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${PRIORITY_COLORS[t.priority] || 'bg-slate-400'}`} />
                            <span>{t.title}</span>
                          </div>
                          <span className="text-muted-foreground capitalize">{t.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detail?.lastHkTask?.completed_at && (
                  <div className="rounded-lg border p-3 text-xs">
                    <div className="text-muted-foreground">Lần dọn gần nhất</div>
                    <div className="font-semibold">
                      {format(parseISO(detail.lastHkTask.completed_at), 'HH:mm dd/MM/yyyy', { locale: vi })}
                    </div>
                  </div>
                )}
                <button
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  onClick={() => setAuditOpen(true)}
                >
                  <History className="h-3 w-3" /> Xem toàn bộ lịch sử thay đổi phòng
                </button>
              </TabsContent>
            </div>
          </Tabs>

          {/* Footer */}
          <div className="border-t bg-muted/30 px-5 py-3 flex gap-2 shrink-0">
            {isOccupied && bk ? (
              <>
                <Button variant="outline" className="flex-1" onClick={() => setExtendOpen(true)}>
                  Gia hạn
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => { onOpenChange(false); onOpenBookingDetail(bk.id) }}>
                  Chi tiết
                </Button>
                <Button
                  className="flex-1"
                  onClick={() => {
                    // Unified flow: dispatch to BookingsPage which owns the checkout dialogs
                    // (group detection, overdue → ExtendDialog, summary + surcharges, …)
                    onOpenChange(false)
                    navigate(`/bookings?action=checkout&bookingId=${bk.id}`)
                  }}
                >
                  Checkout
                </Button>
              </>
            ) : (() => {
              // Find a booking eligible for check-in today (status confirmed + check_in_date <= today)
              const todayStr = format(new Date(), 'yyyy-MM-dd')
              const pending = detail?.upcomingBookings?.find(
                (b) => b.status === 'confirmed' && b.check_in_date <= todayStr
              )
              return (
                <>
                  {pending ? (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        // Unified flow: validate + early-checkin dialog handled by BookingsPage
                        onOpenChange(false)
                        navigate(`/bookings?action=checkin&bookingId=${pending.id}`)
                      }}
                    >
                      Check-in ({pending.guest_name})
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => { onOpenChange(false); navigate(`/bookings?action=new`) }}
                    >
                      Check-in nhanh
                    </Button>
                  )}
                  <Button
                    className="flex-1"
                    onClick={() => { onOpenChange(false); navigate(`/bookings?action=new`) }}
                  >
                    Đặt phòng
                  </Button>
                </>
              )
            })()}
          </div>

        </DialogContent>
      </Dialog>

      <RoomAuditLogDialog
        open={auditOpen}
        onOpenChange={setAuditOpen}
        roomId={room.id}
        roomNumber={room.room_number}
      />

      {bk && (
        <ExtendBookingDialog
          open={extendOpen}
          onOpenChange={setExtendOpen}
          booking={{
            id: bk.id,
            guest_name: bk.guest_name || '',
            room_id: room.id,
            check_in_date: bk.check_in_date,
            check_out_date: bk.check_out_date || bk.check_in_date,
            room_price: roomPrice,
            room: { room_number: room.room_number },
          }}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['floor-plan-live'] })
            qc.invalidateQueries({ queryKey: ['reception-room-detail'] })
          }}
        />
      )}
    </>
  )
}

function Row({ label, value, bold, muted, danger }: { label: string; value: number; bold?: boolean; muted?: boolean; danger?: boolean }) {
  return (
    <div className={`flex justify-between px-3 py-2 ${bold ? 'font-semibold' : ''} ${danger ? 'text-red-600' : muted ? 'text-muted-foreground' : ''}`}>
      <span>{label}</span>
      <span className="font-mono">{formatCurrency(value)}</span>
    </div>
  )
}
