import { supabase } from '@/integrations/supabase/client'

export interface ShiftHandoverData {
  shiftId: string
  staffName: string
  hotelName: string
  startAt: string
  endAt: string
  durationMinutes: number
  notes?: string | null
  transactions: Array<{
    paid_at: string | null
    invoice_number?: string | null
    guest_name?: string | null
    room_number?: string | null
    payment_method: string
    amount: number
    transaction_reference?: string | null
  }>
  totals: {
    cash: number
    bank_transfer: number
    other: number
    total: number
    count: number
  }
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  card: 'Thẻ',
  voucher: 'Voucher',
}

function formatVND(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(Math.round(n)) + ' ₫'
}

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h === 0) return `${m} phút`
  if (m === 0) return `${h} giờ`
  return `${h} giờ ${m} phút`
}

/**
 * Fetch all data needed to build a shift-handover report.
 */
export async function fetchShiftHandoverData(shiftId: string): Promise<ShiftHandoverData> {
  const { data: shift, error: shiftErr } = await supabase
    .from('shift_history')
    .select(`
      *,
      user:users!shift_history_user_id_fkey(id, full_name),
      hotel:hotels!shift_history_hotel_id_fkey(id, name)
    `)
    .eq('id', shiftId)
    .single()
  if (shiftErr) throw shiftErr
  if (!shift) throw new Error('Không tìm thấy ca làm việc')

  const { data: payments, error: payErr } = await supabase
    .from('booking_payments')
    .select(`
      paid_at, payment_method, amount, payment_status, transaction_reference,
      booking:room_bookings!booking_payments_booking_id_fkey(
        id,
        guest_name,
        room:rooms!room_bookings_room_id_fkey(room_number)
      )
    `)
    .eq('tenant_id', shift.tenant_id)
    .eq('created_by', shift.user_id)
    .eq('payment_status', 'completed')
    .gte('paid_at', shift.start_at)
    .lte('paid_at', shift.end_at)
    .order('paid_at', { ascending: true })

  if (payErr) throw payErr

  const transactions = (payments || []).map((p: any) => ({
    paid_at: p.paid_at,
    invoice_number: p.transaction_reference || (p.booking?.id ? p.booking.id.slice(0, 8) : null),
    guest_name: p.booking?.guest_name ?? null,
    room_number: p.booking?.room?.room_number ?? null,
    payment_method: p.payment_method,
    amount: Number(p.amount || 0),
    transaction_reference: p.transaction_reference,
  }))

  const totals = transactions.reduce(
    (acc, t) => {
      acc.total += t.amount
      acc.count += 1
      if (t.payment_method === 'cash') acc.cash += t.amount
      else if (t.payment_method === 'bank_transfer') acc.bank_transfer += t.amount
      else acc.other += t.amount
      return acc
    },
    { cash: 0, bank_transfer: 0, other: 0, total: 0, count: 0 }
  )

  return {
    shiftId: shift.id,
    staffName: (shift as any).user?.full_name || 'Lễ tân',
    hotelName: (shift as any).hotel?.name || '',
    startAt: shift.start_at,
    endAt: shift.end_at,
    durationMinutes: shift.duration_minutes || 0,
    notes: shift.notes,
    transactions,
    totals,
  }
}

function esc(s: string | number | null | undefined): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function buildShiftHandoverHTML(data: ShiftHandoverData): string {
  const rows = data.transactions.length
    ? data.transactions.map((t, i) => `
      <tr>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:center;">${i + 1}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;font-family:monospace;">${esc(formatDateTime(t.paid_at))}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;">${esc(t.invoice_number || '-')}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;">${esc(t.guest_name || '-')}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:center;">${esc(t.room_number || '-')}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;">${esc(PAYMENT_METHOD_LABEL[t.payment_method] || t.payment_method)}</td>
        <td style="padding:6px 4px;border-bottom:1px solid #eee;text-align:right;font-family:monospace;">${esc(formatVND(t.amount))}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="7" style="padding:20px;text-align:center;color:#999;">Không có giao dịch trong ca</td></tr>`

  return `
    <div id="shift-handover-pdf" style="width:780px;padding:32px;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#111;background:#fff;">
      <div style="text-align:center;margin-bottom:16px;">
        <div style="font-size:14px;color:#555;">${esc(data.hotelName)}</div>
        <div style="font-size:20px;font-weight:700;margin-top:4px;">BÁO CÁO BÀN GIAO CUỐI CA</div>
      </div>

      <table style="width:100%;margin-bottom:16px;border-collapse:collapse;">
        <tr>
          <td style="padding:4px 0;width:25%;color:#666;">Lễ tân:</td>
          <td style="padding:4px 0;font-weight:600;">${esc(data.staffName)}</td>
          <td style="padding:4px 0;width:20%;color:#666;">Mã ca:</td>
          <td style="padding:4px 0;font-family:monospace;font-size:11px;">${esc(data.shiftId.slice(0, 8))}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#666;">Bắt đầu ca:</td>
          <td style="padding:4px 0;">${esc(formatDateTime(data.startAt))}</td>
          <td style="padding:4px 0;color:#666;">Kết thúc ca:</td>
          <td style="padding:4px 0;">${esc(formatDateTime(data.endAt))}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;color:#666;">Thời lượng:</td>
          <td style="padding:4px 0;" colspan="3">${esc(formatDuration(data.durationMinutes))}</td>
        </tr>
      </table>

      <div style="font-weight:700;font-size:13px;margin:16px 0 8px;border-bottom:2px solid #111;padding-bottom:4px;">
        TỔNG HỢP THEO PHƯƠNG THỨC
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr>
          <td style="padding:8px;border:1px solid #ddd;width:50%;">Tiền mặt</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:monospace;font-weight:600;">${formatVND(data.totals.cash)}</td>
        </tr>
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Chuyển khoản</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:monospace;font-weight:600;">${formatVND(data.totals.bank_transfer)}</td>
        </tr>
        ${data.totals.other > 0 ? `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">Khác (thẻ/voucher)</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:monospace;font-weight:600;">${formatVND(data.totals.other)}</td>
        </tr>` : ''}
        <tr style="background:#f5f5f5;">
          <td style="padding:8px;border:1px solid #ddd;font-weight:700;">TỔNG CỘNG (${data.totals.count} giao dịch)</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:monospace;font-weight:700;font-size:14px;">${formatVND(data.totals.total)}</td>
        </tr>
      </table>

      <div style="font-weight:700;font-size:13px;margin:16px 0 8px;border-bottom:2px solid #111;padding-bottom:4px;">
        CHI TIẾT GIAO DỊCH
      </div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;">
        <thead>
          <tr style="background:#f5f5f5;">
            <th style="padding:6px 4px;border-bottom:2px solid #111;width:30px;">#</th>
            <th style="padding:6px 4px;border-bottom:2px solid #111;text-align:left;">Thời gian</th>
            <th style="padding:6px 4px;border-bottom:2px solid #111;text-align:left;">Số HĐ</th>
            <th style="padding:6px 4px;border-bottom:2px solid #111;text-align:left;">Khách</th>
            <th style="padding:6px 4px;border-bottom:2px solid #111;">Phòng</th>
            <th style="padding:6px 4px;border-bottom:2px solid #111;text-align:left;">Phương thức</th>
            <th style="padding:6px 4px;border-bottom:2px solid #111;text-align:right;">Số tiền</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      ${data.notes ? `
      <div style="margin-top:16px;padding:8px 12px;background:#fafafa;border-left:3px solid #999;">
        <div style="font-size:11px;color:#666;margin-bottom:4px;">Ghi chú ca:</div>
        <div>${esc(data.notes)}</div>
      </div>` : ''}

      <div style="display:flex;justify-content:space-between;margin-top:48px;text-align:center;">
        <div style="width:33%;">
          <div style="font-weight:600;">Lễ tân giao ca</div>
          <div style="font-size:10px;color:#888;margin-top:4px;">(Ký, ghi rõ họ tên)</div>
          <div style="height:60px;"></div>
          <div style="border-top:1px solid #333;padding-top:4px;font-size:11px;">${esc(data.staffName)}</div>
        </div>
        <div style="width:33%;">
          <div style="font-weight:600;">Lễ tân nhận ca</div>
          <div style="font-size:10px;color:#888;margin-top:4px;">(Ký, ghi rõ họ tên)</div>
          <div style="height:60px;"></div>
          <div style="border-top:1px solid #333;padding-top:4px;font-size:11px;">&nbsp;</div>
        </div>
        <div style="width:33%;">
          <div style="font-weight:600;">Quản lý xác nhận</div>
          <div style="font-size:10px;color:#888;margin-top:4px;">(Ký, ghi rõ họ tên)</div>
          <div style="height:60px;"></div>
          <div style="border-top:1px solid #333;padding-top:4px;font-size:11px;">&nbsp;</div>
        </div>
      </div>

      <div style="margin-top:24px;text-align:center;font-size:10px;color:#999;">
        Báo cáo được sinh tự động lúc ${esc(formatDateTime(new Date().toISOString()))}
      </div>
    </div>
  `
}

/**
 * Render shift-handover HTML to a jsPDF doc and trigger download.
 */
export async function generateShiftHandoverPDF(shiftId: string): Promise<void> {
  const data = await fetchShiftHandoverData(shiftId)
  const html = buildShiftHandoverHTML(data)

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    const { default: html2canvas } = await import('html2canvas')
    const { default: jsPDF } = await import('jspdf')

    const element = container.querySelector('#shift-handover-pdf') as HTMLElement
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#fff' })

    const pdfWidth = 210 // A4 portrait width in mm
    const pdfHeight = 297
    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

    if (imgHeight <= pdfHeight) {
      doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight)
    } else {
      // Multi-page: slice canvas
      let position = 0
      let remaining = imgHeight
      const pageImg = canvas.toDataURL('image/png')
      while (remaining > 0) {
        doc.addImage(pageImg, 'PNG', 0, position, imgWidth, imgHeight)
        remaining -= pdfHeight
        if (remaining > 0) {
          position -= pdfHeight
          doc.addPage()
        }
      }
    }

    const dt = new Date(data.startAt)
    const fname = `bao-cao-ca-${data.staffName.replace(/\s+/g, '-')}-${dt.toISOString().slice(0, 10)}.pdf`
    doc.save(fname)
  } finally {
    document.body.removeChild(container)
  }
}
