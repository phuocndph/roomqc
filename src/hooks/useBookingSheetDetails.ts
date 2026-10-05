import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { useTenant } from '@/hooks/useTenant'

export interface BookingFinancialBreakdown {
  room_price: number | null
  subtotal: number | null
  early_checkin_charge: number
  late_checkout_charge: number
  service_charges_field: number
  extra_charges: number
  damage_charges: number
  service_items: Array<{ id: string; name: string; qty: number; total: number }>
  minibar_items: Array<{ id: string; name: string; qty: number; total: number }>
  service_items_total: number
  minibar_items_total: number
}

export interface BookingSheetDetails {
  // CCCD
  guest_id_type: string | null
  guest_id_number: string | null
  guest_id_image_url: string | null
  // Financial breakdown
  breakdown: BookingFinancialBreakdown
  // Audit timeline
  history: Array<{
    id: number
    action: string
    actor_role: string | null
    changed_fields: string[] | null
    created_at: string
  }>
  // CRM guest record
  crmGuest: {
    id: string
    full_name: string
    vip_level: string
    total_stays: number
    total_spent: number
    last_stay_date: string | null
  } | null
}

export function useBookingSheetDetails(
  bookingId: string | undefined,
  enabled = true,
) {
  const { tenant } = useTenant()
  const tenantId = tenant?.id

  return useQuery<BookingSheetDetails | null>({
    queryKey: ['booking-sheet-details', bookingId, tenantId],
    enabled: enabled && !!bookingId && !!tenantId,
    staleTime: 30_000,
    queryFn: async () => {
      if (!bookingId || !tenantId) return null

      const [bookingRes, scRes, ccRes, auditRes] = await Promise.all([
        supabase
          .from('room_bookings')
          .select(
            'guest_id_type, guest_id_number, guest_id_image_url, guest_phone, room_price, subtotal, early_checkin_charge, late_checkout_charge, service_charges, extra_charges, damage_charges',
          )
          .eq('id', bookingId)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        supabase
          .from('booking_service_charges')
          .select('id, service_name, quantity, total_price')
          .eq('booking_id', bookingId)
          .eq('tenant_id', tenantId),
        supabase
          .from('chargeable_consumptions')
          .select('id, item_name, quantity, unit_price, total_amount')
          .eq('booking_id', bookingId)
          .eq('tenant_id', tenantId),
        supabase
          .from('audit_log')
          .select('id, action, actor_role, changed_fields, created_at')
          .eq('record_id', bookingId)
          .eq('table_name', 'room_bookings')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: false })
          .limit(8),
      ])

      const b = bookingRes.data
      const phone = b?.guest_phone || null
      const idNumber = b?.guest_id_number || null

      // CRM lookup by id_number first, then phone
      let crmGuest: BookingSheetDetails['crmGuest'] = null
      if (idNumber || phone) {
        let q = supabase
          .from('guests')
          .select('id, full_name, vip_level, total_stays, total_spent, last_stay_date')
          .eq('tenant_id', tenantId)
          .limit(1)
        if (idNumber) q = q.eq('id_number', idNumber)
        else if (phone) q = q.eq('phone', phone)
        const { data } = await q.maybeSingle()
        crmGuest = data ?? null
      }

      const service_items = (scRes.data || []).map((r) => ({
        id: r.id,
        name: r.service_name,
        qty: r.quantity,
        total: Number(r.total_price) || 0,
      }))
      const minibar_items = (ccRes.data || []).map((r) => ({
        id: r.id,
        name: r.item_name,
        qty: r.quantity,
        total:
          Number(r.total_amount) || Number(r.quantity) * Number(r.unit_price) || 0,
      }))

      return {
        guest_id_type: b?.guest_id_type ?? null,
        guest_id_number: b?.guest_id_number ?? null,
        guest_id_image_url: b?.guest_id_image_url ?? null,
        breakdown: {
          room_price: b?.room_price ?? null,
          subtotal: b?.subtotal ?? null,
          early_checkin_charge: Number(b?.early_checkin_charge) || 0,
          late_checkout_charge: Number(b?.late_checkout_charge) || 0,
          service_charges_field: Number(b?.service_charges) || 0,
          extra_charges: Number(b?.extra_charges) || 0,
          damage_charges: Number(b?.damage_charges) || 0,
          service_items,
          minibar_items,
          service_items_total: service_items.reduce((s, x) => s + x.total, 0),
          minibar_items_total: minibar_items.reduce((s, x) => s + x.total, 0),
        },
        history: auditRes.data || [],
        crmGuest,
      }
    },
  })
}

const ID_TYPE_LABEL: Record<string, string> = {
  cccd: 'CCCD',
  cmnd: 'CMND',
  passport: 'Hộ chiếu',
  visa: 'Visa',
}

export function formatIdType(t: string | null | undefined): string {
  if (!t) return 'Giấy tờ'
  return ID_TYPE_LABEL[t] || t.toUpperCase()
}

const VIP_LABEL: Record<string, string> = {
  none: '',
  silver: 'VIP Bạc',
  gold: 'VIP Vàng',
  platinum: 'VIP Bạch Kim',
  diamond: 'VIP Kim Cương',
}
export function vipLabel(level: string | null | undefined): string {
  if (!level) return ''
  return VIP_LABEL[level] ?? ''
}

const ACTION_LABEL: Record<string, string> = {
  INSERT: 'Tạo booking',
  UPDATE: 'Cập nhật booking',
  DELETE: 'Xoá booking',
  insert: 'Tạo booking',
  update: 'Cập nhật booking',
  delete: 'Xoá booking',
  create: 'Tạo booking',
  checkin: 'Nhận phòng',
  check_in: 'Nhận phòng',
  checkout: 'Trả phòng',
  check_out: 'Trả phòng',
  payment: 'Thu tiền',
  pay: 'Thu tiền',
  deposit: 'Thu cọc',
  refund: 'Hoàn tiền',
  cancel: 'Huỷ booking',
  cancelled: 'Huỷ booking',
  block: 'Khoá phòng',
  unblock: 'Mở khoá phòng',
  move: 'Đổi phòng',
  room_change: 'Đổi phòng',
  change_room: 'Đổi phòng',
  price_change: 'Sửa giá',
  rate_change: 'Sửa giá',
  date_change: 'Đổi ngày',
  extend: 'Gia hạn lưu trú',
  shorten: 'Rút ngắn lưu trú',
  note: 'Thêm ghi chú',
  status_change: 'Đổi trạng thái',
  add_service: 'Thêm dịch vụ',
  add_minibar: 'Thêm minibar',
  add_surcharge: 'Thêm phụ thu',
  scan_id: 'Scan giấy tờ',
  guest_update: 'Cập nhật khách',
}
export function actionLabel(a: string): string {
  if (!a) return 'Thao tác'
  return ACTION_LABEL[a] ?? ACTION_LABEL[a.toLowerCase()] ?? a.replace(/_/g, ' ')
}

