import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { format, differenceInDays } from 'date-fns'
import { vi } from 'date-fns/locale'
import { ArrowLeft, Phone, Mail, MapPin, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { supabase } from '@/integrations/supabase/client'
import { BookingConsumablesCard } from '@/components/bookings/BookingConsumablesCard'
import { BookingIssuesCard } from '@/components/bookings/BookingIssuesCard'
import { ChargeableConsumablesCard } from '@/components/bookings/ChargeableConsumablesCard'
import { BookingServiceCharges } from '@/components/services/BookingServiceCharges'
import { BookingPaymentHistory } from '@/components/bookings/BookingPaymentHistory'
import { BookingMetadataCard } from '@/components/bookings/BookingMetadataCard'
import { GuestStayHistoryCard } from '@/components/bookings/GuestStayHistoryCard'
import { BookingActionBar } from '@/components/bookings/BookingActionBar'
import { navigateBack } from '@/lib/navigation'
import { BookingPaymentDialog } from '@/components/bookings/BookingPaymentDialog'
import { RoomBookingDialog } from '@/components/rooms/RoomBookingDialog'
import { useBookingPayments } from '@/hooks/useBookingPayments'
import { useBookingConsumables } from '@/hooks/useBookingConsumables'
import { useBookingIssues } from '@/hooks/useBookingConsumables'
import { useGuestInvoices } from '@/hooks/useGuestInvoices'
import { useHotelContext } from '@/contexts/HotelContext'
import { printInvoice, buildVatClaimUrl } from '@/components/invoices/InvoicePDFTemplate'
import { useEnsureVatClaimToken } from '@/hooks/useVatClaimToken'
import { cn, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const statusMap: Record<string, { text: string; className: string }> = {
  checked_in: { text: 'Đang ở', className: 'text-green-600 border-green-500/40' },
  confirmed: { text: 'Đã đặt', className: 'text-blue-600 border-blue-500/40' },
  checked_out: { text: 'Đã trả phòng', className: 'text-muted-foreground border-border' },
  cancelled: { text: 'Đã hủy', className: 'text-red-600 border-red-500/40' },
  no_show: { text: 'Không đến', className: 'text-red-600 border-red-500/40' },
}

const paymentMap: Record<string, { text: string; className: string }> = {
  paid: { text: 'Đã thu đủ', className: 'text-green-600' },
  partial: { text: 'Thu một phần', className: 'text-amber-600' },
  pending: { text: 'Chưa thu', className: 'text-red-600' },
  refunded: { text: 'Đã hoàn', className: 'text-muted-foreground' },
}

interface BookingDetailPageProps {
  idProp?: string
  embedded?: boolean
  onClose?: () => void
}

export function BookingDetailPage({ idProp, embedded, onClose }: BookingDetailPageProps = {}) {
  const params = useParams<{ id: string }>()
  const id = idProp ?? params.id
  const navigate = useNavigate()
  const { selectedHotel } = useHotelContext()

  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showPayDialog, setShowPayDialog] = useState(false)

  const { data: booking, isLoading, isError } = useQuery({
    queryKey: ['booking-detail', id],
    queryFn: async () => {
      if (!id) throw new Error('No booking ID')
      const { data, error } = await supabase
        .from('room_bookings')
        .select(`*, room:rooms(room_number, room_type, floor, hotel_id)`)
        .eq('id', id)
        .single()
      if (error) throw error
      return data
    },
    enabled: !!id,
    retry: 1,
  })

  // Lookup invoice cho booking này
  const { data: invoices } = useGuestInvoices()
  const invoice = useMemo(() => invoices?.find((i) => i.booking_id === id), [invoices, id])

  const { data: payments } = useBookingPayments(id)
  const { data: consumables } = useBookingConsumables(id)
  const { data: issues } = useBookingIssues(
    booking?.room_id,
    booking?.check_in_date,
    booking?.actual_check_out || booking?.check_out_date,
  )
  const ensureToken = useEnsureVatClaimToken()

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (isError || !booking) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <p className="text-sm">Không tìm thấy thông tin đặt phòng.</p>
        <Button variant="outline" size="sm" onClick={() => navigateBack(navigate, '/bookings')}>Quay lại</Button>
      </div>
    )
  }

  const nights = Math.max(
    1,
    differenceInDays(new Date(booking.check_out_date), new Date(booking.check_in_date)),
  )
  const status = statusMap[booking.status] || { text: booking.status, className: '' }
  const paymentStatus = paymentMap[booking.payment_status || 'pending']
  const total = booking.total_amount || 0
  const deposit = booking.deposit_amount || 0
  const paid = booking.amount_paid || 0
  const damageCharges = booking.damage_charges || 0
  const remaining = Math.max(0, total - deposit - paid)
  const consumablesCount = consumables?.length || 0
  const issuesCount = (issues?.length || 0) + (damageCharges > 0 ? 1 : 0)

  const completedPayments = payments?.filter((p) => p.payment_status === 'completed') || []
  const totalReceived = deposit + paid

  const handlePrintInvoice = async () => {
    if (!invoice) {
      toast.error('Chưa có hóa đơn cho booking này. Vui lòng tạo hóa đơn trước.')
      return
    }
    const hotelInfo = selectedHotel
      ? {
          name: selectedHotel.name,
          address: selectedHotel.address || undefined,
          phone: selectedHotel.phone || undefined,
          taxCode: (selectedHotel as any).tax_code || undefined,
        }
      : undefined
    let qrPayload: { url: string; label: string } | undefined
    try {
      const t = await ensureToken(invoice.id)
      const url = buildVatClaimUrl(invoice, t?.token)
      if (url) qrPayload = { url, label: `${url.replace(/^https?:\/\//, '')} · Hạn 7 ngày` }
    } catch (e: any) {
      toast.error('Không tạo được mã QR VAT', { description: e?.message })
    }
    printInvoice(invoice, 'K80', hotelInfo, qrPayload)
  }

  const shortId = booking.id.slice(0, 8).toUpperCase()
  const bookingCode = booking.booking_reference || `BK-${shortId}`

  return (
    <div className="space-y-4 pb-2">
      {/* === STICKY SUMMARY HEADER === */}
      <div className="sticky top-0 z-20 -mx-4 px-4 py-3 border-b bg-background/95 backdrop-blur">
        <div className="flex items-start gap-3">
          {!embedded && (
            <Button variant="ghost" size="icon" className="h-9 w-9 -ml-2" onClick={() => navigateBack(navigate, '/bookings')}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base font-semibold truncate">{booking.guest_name}</h1>
              <span className="font-mono text-xs text-muted-foreground">#{bookingCode}</span>
              <Badge variant="outline" className={cn('text-xs', status.className)}>
                {status.text}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              P{booking.room?.room_number} • <span className="capitalize">{booking.room?.room_type}</span> • {nights} đêm
              {' • '}
              {format(new Date(booking.check_in_date), 'dd/MM', { locale: vi })}
              {'→'}
              {format(new Date(booking.check_out_date), 'dd/MM/yyyy', { locale: vi })}
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-end text-right">
            <span className="text-base font-bold">{formatCurrency(total)}</span>
            <span className={cn('text-xs', paymentStatus?.className)}>
              {remaining > 0 ? `Còn nợ ${formatCurrency(remaining)}` : paymentStatus?.text}
            </span>
          </div>
          <Button size="sm" variant="outline" className="h-9" onClick={() => setShowEditDialog(true)}>
            Chỉnh sửa
          </Button>
        </div>
        {/* Mobile total */}
        <div className="sm:hidden flex items-center justify-between mt-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground">Tổng</span>
          <div className="flex items-center gap-2">
            <span className="font-bold">{formatCurrency(total)}</span>
            <span className={cn('text-xs', paymentStatus?.className)}>
              {remaining > 0 ? `• Còn ${formatCurrency(remaining)}` : `• ${paymentStatus?.text}`}
            </span>
          </div>
        </div>
      </div>

      {/* === TABS === */}
      <Tabs defaultValue="info" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="info" className="text-xs h-7">Thông tin</TabsTrigger>
          <TabsTrigger value="consumables" className="text-xs h-7">
            Đồ dùng{consumablesCount > 0 && <span className="ml-1 text-muted-foreground">({consumablesCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="issues" className="text-xs h-7">
            Vấn đề{issuesCount > 0 && <span className="ml-1 text-red-600">({issuesCount})</span>}
          </TabsTrigger>
          <TabsTrigger value="payment" className="text-xs h-7">
            Thanh toán{paymentStatus && <span className={cn('ml-1', paymentStatus.className)}>• {paymentStatus.text}</span>}
          </TabsTrigger>
        </TabsList>

        {/* ============ TAB 1: THÔNG TIN ============ */}
        <TabsContent value="info" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Cột trái: Khách + Lịch sử lưu trú */}
            <div className="space-y-4">
              <div className="rounded-lg border">
                <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Thông tin khách
                </div>
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Họ tên</span>
                    <span className="font-medium">{booking.guest_name}</span>
                  </div>
                  {booking.guest_phone && (
                    <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Phone className="h-3 w-3" /> Điện thoại
                      </span>
                      <span className="font-mono text-xs">{booking.guest_phone}</span>
                    </div>
                  )}
                  {booking.guest_email && (
                    <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Mail className="h-3 w-3" /> Email
                      </span>
                      <span className="text-xs truncate">{booking.guest_email}</span>
                    </div>
                  )}
                  {booking.guest_id_number && (
                    <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">
                        {booking.guest_id_type === 'passport' ? 'Hộ chiếu' : 'CCCD/CMND'}
                      </span>
                      <span className="font-mono text-xs">{booking.guest_id_number}</span>
                    </div>
                  )}
                  {booking.guest_nationality && (
                    <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground">Quốc tịch</span>
                      <span>{booking.guest_nationality}</span>
                    </div>
                  )}
                  {booking.guest_address && (
                    <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <MapPin className="h-3 w-3" /> Địa chỉ
                      </span>
                      <span className="text-xs">{booking.guest_address}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Số khách</span>
                    <span>{booking.guest_count || 1} người</span>
                  </div>
                </div>
              </div>

              <GuestStayHistoryCard
                bookingId={booking.id}
                guestPhone={booking.guest_phone}
                guestIdNumber={booking.guest_id_number}
              />
            </div>

            {/* Cột phải: Phòng + Metadata */}
            <div className="space-y-4">
              <div className="rounded-lg border">
                <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Phòng & Thời gian
                </div>
                <div className="divide-y divide-border">
                  <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Phòng</span>
                    <span className="font-medium">
                      P{booking.room?.room_number}{' '}
                      <span className="text-xs text-muted-foreground capitalize">• {booking.room?.room_type}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Check-in</span>
                    <span className="text-blue-600">
                      {format(new Date(booking.check_in_date), 'dd/MM/yyyy', { locale: vi })}
                      {booking.actual_check_in && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({format(new Date(booking.actual_check_in), 'HH:mm')})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Check-out</span>
                    <span className="text-orange-600">
                      {format(new Date(booking.check_out_date), 'dd/MM/yyyy', { locale: vi })}
                      {booking.actual_check_out && (
                        <span className="text-xs text-muted-foreground ml-1">
                          ({format(new Date(booking.actual_check_out), 'HH:mm')})
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Thời lượng</span>
                    <span>{nights} đêm</span>
                  </div>
                </div>
              </div>

              <BookingMetadataCard
                bookingId={booking.id}
                bookingReference={booking.booking_reference}
                bookingSource={booking.booking_source}
                bookingType={booking.booking_type}
                createdAt={booking.created_at}
              />
            </div>
          </div>

          {booking.notes && (
            <div className="rounded-lg border">
              <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ghi chú
              </div>
              <p className="px-3 py-2 text-sm whitespace-pre-wrap">{booking.notes}</p>
            </div>
          )}
        </TabsContent>

        {/* ============ TAB 2: ĐỒ DÙNG ============ */}
        <TabsContent value="consumables" className="space-y-4">
          <ChargeableConsumablesCard
            bookingId={booking.id}
            showBillAction={booking.status !== 'checked_out'}
          />
          <BookingConsumablesCard bookingId={booking.id} />
          <div className="rounded-lg border">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Dịch vụ cộng thêm
            </div>
            <div className="p-3">
              <BookingServiceCharges bookingId={booking.id} readOnly />
            </div>
          </div>
        </TabsContent>

        {/* ============ TAB 3: VẤN ĐỀ ============ */}
        <TabsContent value="issues">
          <BookingIssuesCard
            bookingId={booking.id}
            roomId={booking.room_id}
            checkInDate={booking.check_in_date}
            checkOutDate={booking.actual_check_out || booking.check_out_date}
            damageCharges={damageCharges}
          />
          {booking.damage_notes && (
            <div className="rounded-lg border mt-4">
              <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Ghi chú thiệt hại
              </div>
              <p className="px-3 py-2 text-sm whitespace-pre-wrap">{booking.damage_notes}</p>
            </div>
          )}
        </TabsContent>

        {/* ============ TAB 4: THANH TOÁN ============ */}
        <TabsContent value="payment" className="space-y-4">
          {/* Breakdown */}
          <div className="rounded-lg border">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Chi tiết thanh toán
            </div>
            <div className="divide-y divide-border">
              {/* Tiền phòng */}
              <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">
                  Tiền phòng ({formatCurrency(booking.room_price || 0)} × {nights})
                </span>
                <span className="text-right font-mono">
                  {formatCurrency((booking.room_price || 0) * nights)}
                </span>
              </div>
              {(booking.early_checkin_charge || 0) > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Phụ thu check-in sớm</span>
                  <span className="text-right font-mono text-amber-600">
                    +{formatCurrency(booking.early_checkin_charge || 0)}
                  </span>
                </div>
              )}
              {(booking.late_checkout_charge || 0) > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Phụ thu check-out trễ</span>
                  <span className="text-right font-mono text-amber-600">
                    +{formatCurrency(booking.late_checkout_charge || 0)}
                  </span>
                </div>
              )}
              {(booking.extra_charges || 0) > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Chi phí khác</span>
                  <span className="text-right font-mono text-amber-600">
                    +{formatCurrency(booking.extra_charges || 0)}
                  </span>
                </div>
              )}
              {damageCharges > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Chi phí đền bù thiệt hại</span>
                  <span className="text-right font-mono text-red-600">
                    +{formatCurrency(damageCharges)}
                  </span>
                </div>
              )}
              {(booking.service_charges || 0) > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Dịch vụ & Minibar</span>
                  <span className="text-right font-mono">
                    {formatCurrency(booking.service_charges || 0)}
                  </span>
                </div>
              )}
              <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm bg-muted/40">
                <span className="font-medium">Tạm tính</span>
                <span className="text-right font-mono font-medium">
                  {formatCurrency(booking.subtotal || 0)}
                </span>
              </div>
              {(booking.vat_rate ?? 0) > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Thuế GTGT ({booking.vat_rate}%)</span>
                  <span className="text-right font-mono">
                    {formatCurrency(booking.vat_amount || 0)}
                  </span>
                </div>
              )}
              {(booking.service_fee_rate ?? 0) > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Phí dịch vụ ({booking.service_fee_rate}%)</span>
                  <span className="text-right font-mono">
                    {formatCurrency(booking.service_fee_amount || 0)}
                  </span>
                </div>
              )}
              <div className="px-3 py-2.5 grid grid-cols-2 gap-2 bg-muted/60">
                <span className="font-semibold">TỔNG CỘNG</span>
                <span className="text-right font-mono font-bold text-base">
                  {formatCurrency(total)}
                </span>
              </div>
            </div>
          </div>

          {/* Đã thu */}
          <div className="rounded-lg border">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Đã thu
            </div>
            <div className="divide-y divide-border">
              {deposit > 0 && (
                <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                  <span className="text-muted-foreground">Tiền cọc</span>
                  <span className="text-right font-mono text-green-600">
                    -{formatCurrency(deposit)}
                  </span>
                </div>
              )}
              <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">Đã thanh toán</span>
                <span className="text-right font-mono text-green-600">
                  -{formatCurrency(paid)}
                </span>
              </div>
              <div className="px-3 py-2 grid grid-cols-2 gap-2 text-sm bg-muted/40">
                <span className="font-medium">Tổng đã thu</span>
                <span className="text-right font-mono font-medium text-green-600">
                  {formatCurrency(totalReceived)}
                </span>
              </div>
            </div>
          </div>

          {/* Còn phải thu - nổi bật */}
          <div
            className={cn(
              'rounded-lg border-2 p-4 flex items-center justify-between',
              remaining > 0 ? 'border-red-500/40 bg-red-50/40 dark:bg-red-950/10' : 'border-green-500/40',
            )}
          >
            <div className="flex flex-col">
              <span className="font-semibold">{remaining > 0 ? 'CÒN PHẢI THU' : 'ĐÃ THU ĐỦ'}</span>
              {remaining <= 0 && totalReceived > 0 && (
                <span className="text-xs text-muted-foreground mt-0.5">
                  Tổng đã thu {formatCurrency(totalReceived)}
                </span>
              )}
            </div>
            {remaining > 0 ? (
              <span className="text-2xl font-bold font-mono text-red-600">
                {formatCurrency(remaining)}
              </span>
            ) : (
              <span className="text-2xl font-bold text-green-600 flex items-center gap-2">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
          </div>

          {/* Lịch sử giao dịch */}
          <div>
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Lịch sử giao dịch ({completedPayments.length})
            </div>
            <BookingPaymentHistory bookingId={booking.id} />
          </div>

          {/* Hóa đơn */}
          <div className="rounded-lg border">
            <div className="px-3 py-2 border-b text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center justify-between">
              <span>Hóa đơn</span>
              {invoice && (
                <button
                  type="button"
                  onClick={() => navigate('/guest-invoices')}
                  className="text-[10px] normal-case tracking-normal text-blue-600 hover:underline flex items-center gap-1"
                >
                  Mở danh sách <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>
            <div className="px-3 py-2 text-sm">
              {invoice ? (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-xs">{invoice.invoice_number}</p>
                    <p className="text-xs text-muted-foreground">
                      {invoice.issued_at
                        ? `Phát hành ${format(new Date(invoice.issued_at), 'dd/MM/yyyy HH:mm')}`
                        : 'Chưa phát hành'}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {invoice.status}
                  </Badge>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">Chưa có hóa đơn cho booking này</p>
              )}
            </div>
          </div>

          {/* Action bar */}
          <BookingActionBar
            remaining={remaining}
            canCollect={booking.status !== 'cancelled' && booking.status !== 'no_show'}
            onCollect={() => setShowPayDialog(true)}
            onPrintInvoice={handlePrintInvoice}
          />
        </TabsContent>
      </Tabs>

      {/* === Dialogs === */}
      {showEditDialog && (
        <RoomBookingDialog
          open={showEditDialog}
          onOpenChange={setShowEditDialog}
          roomId={booking.room_id}
          roomNumber={booking.room?.room_number || ''}
          hotelId={booking.room?.hotel_id || ''}
          tenantId={booking.tenant_id}
          booking={booking}
        />
      )}

      {showPayDialog && (
        <BookingPaymentDialog
          open={showPayDialog}
          onOpenChange={setShowPayDialog}
          booking={{
            id: booking.id,
            guest_name: booking.guest_name,
            room_number: booking.room?.room_number || '',
            total_amount: total,
            amount_paid: paid,
            deposit_amount: deposit,
            tenant_id: booking.tenant_id,
            hotel_id: booking.hotel_id,
          }}
        />
      )}
    </div>
  )
}
