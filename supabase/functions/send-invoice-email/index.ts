import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { buildCorsHeaders } from '../_shared/cors.ts'
import { getBearerToken, isInternalRequest } from '../_shared/internalAuth.ts'
import { readEmailConfig, validEmail } from '../_shared/email/config.ts'
import { sendEmail } from '../_shared/email/provider.ts'
import { escapeHtml } from '../_shared/email/templates.ts'

function escapedFields<T>(value: T): T {
  if (typeof value === 'string') return escapeHtml(value) as T
  if (Array.isArray(value)) return value.map(escapedFields) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, field]) => [key, escapedFields(field)])) as T
  return value
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: corsHeaders })

  try {
    const internal = isInternalRequest(req), token = getBearerToken(req)
    if (!internal && !token) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    const { invoice_id, to_email, pdf_base64, pdf_filename } = await req.json()

    if (!invoice_id || typeof to_email !== 'string' || !validEmail(to_email)
      || (pdf_base64 && (typeof pdf_base64 !== 'string' || pdf_base64.length > 7_000_000 || !/^[A-Za-z0-9+/=\r\n]+$/.test(pdf_base64)))
      || (pdf_filename && (typeof pdf_filename !== 'string' || pdf_filename.length > 150 || /[\r\n\\/]/.test(pdf_filename) || !pdf_filename.toLowerCase().endsWith('.pdf')))) {
      return new Response(JSON.stringify({ error: 'Missing invoice_id or to_email' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    const authData = internal ? { user: null } : (await supabase.auth.getUser(token!)).data
    if (!internal && !authData.user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const { data: rawInvoice, error: invoiceError } = await supabase
      .from('guest_invoices')
      .select('*')
      .eq('id', invoice_id)
      .single()

    if (invoiceError || !rawInvoice) {
      return new Response(JSON.stringify({ error: 'Invoice not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const invoice = escapedFields(rawInvoice)
    const { data: caller } = !internal ? await supabase.from('users').select('tenant_id,status,account_locked').eq('id', authData.user!.id).single() : { data: null }
    const permissions = !internal ? await Promise.all(['reports.create','reports.update','bookings.update'].map(code =>
      supabase.rpc('has_permission', { _user_id: authData.user!.id, _permission_code: code }))) : []
    const allowed = internal || permissions.some(result => !result.error && result.data === true)
    if (!internal && (!caller?.tenant_id || caller.status !== 'active' || caller.account_locked || caller.tenant_id !== invoice.tenant_id || !allowed)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Query hotel info
    const { data: rawHotel } = await supabase
      .from('hotels')
      .select('name, address, phone, email, logo_url, website')
      .eq('id', invoice.hotel_id)
      .single()

    const hotel = escapedFields(rawHotel)
    if (hotel?.logo_url) {
      try { if (new URL(rawHotel?.logo_url || '').protocol !== 'https:') hotel.logo_url = null }
      catch { hotel.logo_url = null }
    }

    const hotelName = hotel?.name || 'Hotel'
    const lineItems = (invoice.line_items || []) as any[]
    const remaining = invoice.total_amount - invoice.amount_paid

    const logoSection = hotel?.logo_url
      ? `<img src="${hotel.logo_url}" alt="${hotelName}" style="max-height:60px;max-width:200px;margin-bottom:8px;" />`
      : ''

    const hotelContactLines = [
      hotel?.address,
      hotel?.phone ? `ĐT: ${hotel.phone}` : null,
      hotel?.email ? `Email: ${hotel.email}` : null,
      hotel?.website,
    ].filter(Boolean).join(' | ')

    const emailHtml = `
<!DOCTYPE html>
<html lang="vi">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:'Segoe UI',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background:#1a1a2e;color:#fff;padding:24px 32px;text-align:center;">
      ${logoSection}
      <h1 style="margin:0;font-size:20px;font-weight:700;letter-spacing:0.5px;">${hotelName}</h1>
      ${hotelContactLines ? `<p style="margin:6px 0 0;font-size:11px;color:#b0b0c0;line-height:1.6;">${hotelContactLines}</p>` : ''}
    </td>
  </tr>

  <!-- Invoice Title -->
  <tr>
    <td style="padding:24px 32px 8px;text-align:center;">
      <h2 style="margin:0;font-size:18px;color:#1a1a2e;font-weight:700;">HÓA ĐƠN THANH TOÁN</h2>
      <p style="margin:4px 0 0;font-size:13px;color:#888;">Số: <span style="font-family:monospace;font-weight:600;color:#333;">${invoice.invoice_number}</span></p>
      ${invoice.issued_at ? `<p style="margin:2px 0 0;font-size:12px;color:#999;">Ngày: ${formatDate(invoice.issued_at)}</p>` : ''}
      ${pdf_base64 ? `<p style="margin:6px 0 0;font-size:12px;color:#16a34a;font-weight:500;">📎 File PDF hóa đơn đính kèm bên dưới</p>` : ''}
    </td>
  </tr>

  <!-- Guest & Stay Info -->
  <tr>
    <td style="padding:16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="50%" valign="top" style="padding-right:12px;">
            <p style="margin:0 0 4px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Khách hàng</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#333;">${invoice.guest_name}</p>
            ${invoice.guest_phone ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">SĐT: ${invoice.guest_phone}</p>` : ''}
            ${invoice.guest_email ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">Email: ${invoice.guest_email}</p>` : ''}
            ${invoice.guest_address ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">${invoice.guest_address}</p>` : ''}
            ${invoice.guest_tax_code ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">MST: ${invoice.guest_tax_code}</p>` : ''}
            ${invoice.company_name ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">Cty: ${invoice.company_name}</p>` : ''}
          </td>
          <td width="50%" valign="top" style="padding-left:12px;">
            <p style="margin:0 0 4px;font-size:11px;color:#999;text-transform:uppercase;letter-spacing:0.5px;">Thông tin lưu trú</p>
            ${invoice.room_number ? `<p style="margin:0;font-size:14px;font-weight:600;color:#333;">Phòng ${invoice.room_number}</p>` : ''}
            ${invoice.check_in_date ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">Nhận phòng: ${formatDate(invoice.check_in_date)}</p>` : ''}
            ${invoice.check_out_date ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">Trả phòng: ${formatDate(invoice.check_out_date)}</p>` : ''}
            ${invoice.payment_method ? `<p style="margin:2px 0 0;font-size:12px;color:#666;">Thanh toán: ${invoice.payment_method}</p>` : ''}
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Line Items Table -->
  <tr>
    <td style="padding:8px 32px 16px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <thead>
          <tr style="background:#f8f9fb;">
            <th style="padding:8px 6px;font-size:11px;color:#666;text-align:center;border-bottom:2px solid #e0e0e0;width:36px;">STT</th>
            <th style="padding:8px 6px;font-size:11px;color:#666;text-align:left;border-bottom:2px solid #e0e0e0;">Nội dung</th>
            <th style="padding:8px 6px;font-size:11px;color:#666;text-align:right;border-bottom:2px solid #e0e0e0;width:40px;">SL</th>
            <th style="padding:8px 6px;font-size:11px;color:#666;text-align:right;border-bottom:2px solid #e0e0e0;width:100px;">Đơn giá</th>
            <th style="padding:8px 6px;font-size:11px;color:#666;text-align:right;border-bottom:2px solid #e0e0e0;width:110px;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item, idx) => `
          <tr>
            <td style="padding:6px;font-size:12px;color:#666;text-align:center;border-bottom:1px solid #f0f0f0;">${idx + 1}</td>
            <td style="padding:6px;font-size:12px;color:#333;border-bottom:1px solid #f0f0f0;">${item.description || ''}</td>
            <td style="padding:6px;font-size:12px;color:#333;text-align:right;border-bottom:1px solid #f0f0f0;">${item.quantity}</td>
            <td style="padding:6px;font-size:12px;color:#333;text-align:right;border-bottom:1px solid #f0f0f0;">${formatVND(item.unit_price)}</td>
            <td style="padding:6px;font-size:12px;color:#333;text-align:right;border-bottom:1px solid #f0f0f0;font-weight:500;">${formatVND(item.amount)}</td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </td>
  </tr>

  <!-- Totals -->
  <tr>
    <td style="padding:0 32px 20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td width="55%"></td>
          <td width="45%">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e0e0e0;">
              <tr>
                <td style="padding:6px 0;font-size:12px;color:#666;">Tạm tính</td>
                <td style="padding:6px 0;font-size:12px;color:#333;text-align:right;">${formatVND(invoice.subtotal)}</td>
              </tr>
              ${invoice.vat_amount > 0 ? `
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#666;">VAT (${(Number(invoice.vat_rate) > 0 && Number(invoice.vat_rate) < 1) ? Math.round(Number(invoice.vat_rate) * 100) : Math.round(Number(invoice.vat_rate))}%)</td>
                <td style="padding:4px 0;font-size:12px;color:#333;text-align:right;">${formatVND(invoice.vat_amount)}</td>
              </tr>` : ''}
              ${invoice.service_fee_amount > 0 ? `
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#666;">Phí dịch vụ (${(Number(invoice.service_fee_rate) > 0 && Number(invoice.service_fee_rate) < 1) ? Math.round(Number(invoice.service_fee_rate) * 100) : Math.round(Number(invoice.service_fee_rate))}%)</td>
                <td style="padding:4px 0;font-size:12px;color:#333;text-align:right;">${formatVND(invoice.service_fee_amount)}</td>
              </tr>` : ''}
              <tr>
                <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#1a1a2e;border-top:2px solid #1a1a2e;">TỔNG CỘNG</td>
                <td style="padding:10px 0 4px;font-size:15px;font-weight:700;color:#1a1a2e;text-align:right;border-top:2px solid #1a1a2e;">${formatVND(invoice.total_amount)}</td>
              </tr>
              ${invoice.amount_paid > 0 ? `
              <tr>
                <td style="padding:4px 0;font-size:12px;color:#666;">Đã thanh toán</td>
                <td style="padding:4px 0;font-size:12px;color:#16a34a;text-align:right;font-weight:500;">${formatVND(invoice.amount_paid)}</td>
              </tr>` : ''}
              ${remaining > 0 ? `
              <tr>
                <td style="padding:4px 0;font-size:13px;font-weight:600;color:#dc2626;">Còn lại</td>
                <td style="padding:4px 0;font-size:13px;font-weight:600;color:#dc2626;text-align:right;">${formatVND(remaining)}</td>
              </tr>` : ''}
            </table>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f8f9fb;padding:20px 32px;text-align:center;border-top:1px solid #e8e8e8;">
      <p style="margin:0 0 4px;font-size:13px;color:#333;font-weight:500;">Cảm ơn Quý khách đã sử dụng dịch vụ!</p>
      <p style="margin:0;font-size:11px;color:#999;">Mọi thắc mắc vui lòng liên hệ ${hotelName}${hotel?.phone ? ` - ${hotel.phone}` : ''}${hotel?.email ? ` - ${hotel.email}` : ''}</p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`

    await sendEmail(readEmailConfig(key => Deno.env.get(key)), {
      id: crypto.randomUUID(), to: to_email, subject: `Hóa đơn ${rawInvoice.invoice_number} - ${rawHotel?.name || 'Hotel'}`,
      html: emailHtml, text: `Hóa đơn ${rawInvoice.invoice_number}. Tổng cộng: ${formatVND(rawInvoice.total_amount)}.`,
      ...(pdf_base64 && pdf_filename ? { attachments: [{ filename: pdf_filename, content: pdf_base64 }] } : {}),
    })

    // Only record provider acceptance after a successful send.
    await supabase.from('guest_invoices').update({ guest_email: to_email, email_sent_at: new Date().toISOString() }).eq('id', invoice_id)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Không thể gửi email hóa đơn.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
