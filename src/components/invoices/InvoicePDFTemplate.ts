import QRCode from 'qrcode'
import { GuestInvoice } from '@/hooks/useGuestInvoices'
import { PaperSize, PAPER_CONFIG } from './PaperSizeSelector'
import { getPublicBaseUrl } from '@/utils/getPublicUrl'

export interface HotelInfo {
  name?: string
  address?: string
  phone?: string
  taxCode?: string
}

export interface QrPayload {
  url: string
  label?: string
}

function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount)
}

/**
 * Escape user-controlled strings before embedding into HTML templates that
 * are later rendered via dangerouslySetInnerHTML / document.write. Prevents
 * stored XSS via guest data, line item descriptions, hotel info, etc.
 */
function esc(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Chuẩn hoá thuế suất hiển thị về số phần trăm nguyên.
 * - Quy ước mới: lưu integer % (8, 10, 5).
 * - Tương thích ngược: dữ liệu cũ lưu decimal (0.08, 0.1) — nếu < 1 thì × 100.
 */
function normalizeRatePct(r: number | null | undefined): number {
  const v = Number(r) || 0
  if (v > 0 && v < 1) return Math.round(v * 100)
  return Math.round(v)
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  card: 'Thẻ',
  qr: 'QR / VietQR',
  vietqr: 'QR / VietQR',
  ota: 'OTA',
  other: 'Khác',
}
function paymentMethodLabel(m: string | null | undefined): string {
  if (!m) return ''
  return PAYMENT_METHOD_LABEL[m] || m
}

async function qrDataUrl(text: string, size = 180): Promise<string> {
  try {
    return await QRCode.toDataURL(text, {
      width: size,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
  } catch {
    return ''
  }
}

/**
 * Build QR URL khách quét lấy HĐĐT VAT.
 * BẮT BUỘC phải có `claimToken` thật từ `ensure_vat_claim_token` —
 * không fallback `invoice.id` (RPC public sẽ trả `not_found` ⇒ "Mã QR không hợp lệ").
 * Trả `null` nếu chưa có token để caller biết không render QR.
 */
export function buildVatClaimUrl(_invoice: GuestInvoice, claimToken?: string | null): string | null {
  if (!claimToken) return null
  const origin = typeof window !== 'undefined' ? getPublicBaseUrl() : 'https://roomqc.com'
  return new URL(`/i/${encodeURIComponent(claimToken)}`, `${origin}/`).toString()
}

function signatureBlock() {
  return `
    <div style="display:flex;justify-content:space-between;margin-top:40px;text-align:center;page-break-inside:avoid;">
      <div style="width:45%;">
        <div style="font-weight:600;">Thu ngân</div>
        <div style="font-size:11px;color:#888;margin-top:4px;">(Ký, ghi rõ họ tên)</div>
      </div>
      <div style="width:45%;">
        <div style="font-weight:600;">Khách hàng</div>
        <div style="font-size:11px;color:#888;margin-top:4px;">(Ký, ghi rõ họ tên)</div>
      </div>
    </div>`
}

function qrBlockReceipt(qr: string, label: string, size: number) {
  if (!qr) return ''
  return `
    <div style="text-align:center;margin-top:10px;padding-top:8px;border-top:1px dashed #999;">
      <div style="font-weight:700;margin-bottom:4px;">QUÉT MÃ LẤY HOÁ ĐƠN VAT</div>
      <img src="${qr}" alt="QR" style="width:${size}px;height:${size}px;display:block;margin:0 auto;" />
      <div style="font-size:10px;color:#555;margin-top:4px;line-height:1.3;">${esc(label)}</div>
    </div>`
}

function qrBlockA4(qr: string, label: string) {
  if (!qr) return ''
  return `
    <div style="margin-top:24px;display:flex;gap:12px;align-items:center;border:1px solid #ccc;border-radius:6px;padding:12px;page-break-inside:avoid;">
      <img src="${qr}" alt="QR" style="width:110px;height:110px;flex-shrink:0;" />
      <div style="font-size:12px;line-height:1.5;">
        <div style="font-weight:700;font-size:14px;margin-bottom:4px;">Lấy hoá đơn VAT điện tử</div>
        <div style="color:#444;">Quý khách dùng camera điện thoại quét mã QR bên trái, nhập thông tin công ty và email để nhận hoá đơn GTGT điện tử qua email.</div>
        <div style="color:#888;font-size:11px;margin-top:4px;">${esc(label)}</div>
      </div>
    </div>`
}

async function buildReceiptHTML(
  invoice: GuestInvoice,
  paperSize: 'K80' | 'K58',
  hotelInfo: HotelInfo | undefined,
  qrPayload: QrPayload | undefined,
): Promise<string> {
  const config = PAPER_CONFIG[paperSize]
  const lineItems = invoice.line_items || []
  const remaining = invoice.total_amount - invoice.amount_paid - (invoice.deposit_amount || 0)
  const qrSize = paperSize === 'K58' ? 140 : 170
  const qr = qrPayload ? await qrDataUrl(qrPayload.url, qrSize * 2) : ''
  const qrLabel = qrPayload?.label || 'Quét để lấy hoá đơn VAT'

  return `
    <div id="invoice-pdf" style="width:${config.width}px;padding:${config.padding};font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:${config.fontSize}px;color:#111;background:#fff;line-height:1.4;word-wrap:break-word;">
      <div style="text-align:center;margin-bottom:4px;">
        <div style="font-size:${config.fontSize + 2}px;font-weight:700;">${esc(hotelInfo?.name || 'KHÁCH SẠN')}</div>
        ${hotelInfo?.address ? `<div style="font-size:${config.fontSize - 1}px;color:#555;">${esc(hotelInfo.address)}</div>` : ''}
        ${hotelInfo?.phone ? `<div style="font-size:${config.fontSize - 1}px;color:#555;">ĐT: ${esc(hotelInfo.phone)}</div>` : ''}
        ${hotelInfo?.taxCode ? `<div style="font-size:${config.fontSize - 1}px;color:#555;">MST: ${esc(hotelInfo.taxCode)}</div>` : ''}
      </div>
      <div style="text-align:center;margin:8px 0 6px;border-top:1px dashed #999;border-bottom:1px dashed #999;padding:4px 0;">
        <div style="font-size:${config.fontSize + 3}px;font-weight:700;">PHIẾU THANH TOÁN</div>
        <div style="font-size:${config.fontSize - 1}px;color:#555;">${esc(invoice.invoice_number)}</div>
        <div style="font-size:${config.fontSize - 1}px;color:#555;">${esc(new Date(invoice.issued_at || invoice.created_at).toLocaleString('vi-VN'))}</div>
      </div>
      <div style="margin-bottom:6px;line-height:1.5;">
        <div>Khách: ${esc(invoice.guest_name)}</div>
        ${invoice.room_number ? `<div>Phòng: ${esc(invoice.room_number)}</div>` : ''}
      </div>
      <div style="border-top:1px dashed #999;border-bottom:1px dashed #999;padding:4px 0;margin-bottom:4px;">
        ${lineItems.map(item => `
          <div style="padding:2px 0;">
            <div style="word-break:break-word;">${esc(item.description || '')}</div>
            <div style="display:flex;justify-content:space-between;">
              <span style="color:#555;">${item.quantity} × ${formatVND(item.unit_price)}</span>
              <span style="font-weight:600;">${formatVND(item.amount)}</span>
            </div>
          </div>
        `).join('')}
      </div>
      <div style="padding:2px 0;">
        <div style="display:flex;justify-content:space-between;"><span>Tạm tính:</span><span>${formatVND(invoice.subtotal)}</span></div>
        ${invoice.vat_amount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>VAT ${normalizeRatePct(invoice.vat_rate)}%:</span><span>${formatVND(invoice.vat_amount)}</span></div>` : ''}
        ${invoice.service_fee_amount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Phí DV ${normalizeRatePct(invoice.service_fee_rate)}%:</span><span>${formatVND(invoice.service_fee_amount)}</span></div>` : ''}
        <div style="display:flex;justify-content:space-between;font-weight:700;border-top:1px dashed #999;padding-top:4px;margin-top:4px;font-size:${config.fontSize + 1}px;">
          <span>TỔNG:</span><span>${formatVND(invoice.total_amount)}</span>
        </div>
        ${invoice.deposit_amount > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Đã cọc:</span><span>${formatVND(invoice.deposit_amount)}</span></div>` : ''}
        ${invoice.amount_paid > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Đã TT:</span><span>${formatVND(invoice.amount_paid)}</span></div>` : ''}
        ${remaining > 0 ? `<div style="display:flex;justify-content:space-between;font-weight:600;"><span>Còn lại:</span><span>${formatVND(remaining)}</span></div>` : ''}
        ${remaining < 0 ? `<div style="display:flex;justify-content:space-between;font-weight:600;"><span>Tiền thừa trả khách:</span><span>${formatVND(Math.abs(remaining))}</span></div>` : ''}
        ${invoice.payment_method ? `<div style="display:flex;justify-content:space-between;margin-top:2px;"><span>Hình thức:</span><span>${esc(paymentMethodLabel(invoice.payment_method))}</span></div>` : ''}
      </div>
      ${qrBlockReceipt(qr, qrLabel, qrSize)}
      <div style="text-align:center;margin-top:8px;font-size:${config.fontSize - 1}px;color:#888;line-height:1.5;">
        <div>Cảm ơn quý khách. Hẹn gặp lại!</div>
        ${qrPayload ? `<div style="margin-top:2px;">Quét QR trong vòng 7 ngày để lấy HĐ GTGT điện tử.</div>` : ''}
      </div>
    </div>`
}

async function buildSheetHTML(
  invoice: GuestInvoice,
  paperSize: 'A4' | 'A5',
  hotelInfo: HotelInfo | undefined,
  qrPayload: QrPayload | undefined,
): Promise<string> {
  const config = PAPER_CONFIG[paperSize]
  const lineItems = invoice.line_items || []
  const remaining = invoice.total_amount - invoice.amount_paid - (invoice.deposit_amount || 0)
  const qr = qrPayload ? await qrDataUrl(qrPayload.url, 220) : ''
  const qrLabel = qrPayload?.label || 'Quét để lấy hoá đơn VAT'

  return `
    <div id="invoice-pdf" style="width:${config.width}px;padding:${config.padding};font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:${config.fontSize}px;color:#111;background:#fff;">
      <div style="text-align:center;margin-bottom:8px;">
        <div style="font-size:${config.fontSize + 5}px;font-weight:700;">${esc(hotelInfo?.name || 'KHÁCH SẠN')}</div>
        ${hotelInfo?.address ? `<div style="font-size:${config.fontSize - 2}px;color:#555;">${esc(hotelInfo.address)}</div>` : ''}
        ${hotelInfo?.phone ? `<div style="font-size:${config.fontSize - 2}px;color:#555;">ĐT: ${esc(hotelInfo.phone)}</div>` : ''}
        ${hotelInfo?.taxCode ? `<div style="font-size:${config.fontSize - 2}px;color:#555;">MST: ${esc(hotelInfo.taxCode)}</div>` : ''}
      </div>
      <div style="text-align:center;margin:16px 0 12px;">
        <div style="font-size:${config.fontSize + 7}px;font-weight:700;">HÓA ĐƠN THANH TOÁN</div>
        <div style="font-size:${config.fontSize - 1}px;color:#555;">Số: ${esc(invoice.invoice_number)} · ${esc(new Date(invoice.issued_at || invoice.created_at).toLocaleString('vi-VN'))}</div>
      </div>
      <div style="margin-bottom:12px;line-height:1.8;">
        <div><b>Khách hàng:</b> ${esc(invoice.guest_name)}</div>
        ${invoice.guest_phone ? `<div><b>SĐT:</b> ${esc(invoice.guest_phone)}</div>` : ''}
        ${invoice.guest_address ? `<div><b>Địa chỉ:</b> ${esc(invoice.guest_address)}</div>` : ''}
        ${invoice.guest_tax_code ? `<div><b>MST:</b> ${esc(invoice.guest_tax_code)}</div>` : ''}
        ${invoice.company_name ? `<div><b>Công ty:</b> ${esc(invoice.company_name)}</div>` : ''}
        ${invoice.room_number ? `<div><b>Phòng:</b> ${esc(invoice.room_number)}</div>` : ''}
        ${invoice.check_in_date && invoice.check_out_date ? `<div><b>Thời gian:</b> ${esc(invoice.check_in_date)} → ${esc(invoice.check_out_date)}</div>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
        <thead>
          <tr style="border-bottom:2px solid #333;">
            <th style="text-align:left;padding:6px 4px;width:40px;">STT</th>
            <th style="text-align:left;padding:6px 4px;">Nội dung</th>
            <th style="text-align:right;padding:6px 4px;width:50px;">SL</th>
            <th style="text-align:right;padding:6px 4px;width:110px;">Đơn giá</th>
            <th style="text-align:right;padding:6px 4px;width:120px;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item, i) => `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="padding:5px 4px;">${i + 1}</td>
              <td style="padding:5px 4px;">${esc(item.description || '')}</td>
              <td style="text-align:right;padding:5px 4px;">${item.quantity}</td>
              <td style="text-align:right;padding:5px 4px;font-family:monospace;">${formatVND(item.unit_price)}</td>
              <td style="text-align:right;padding:5px 4px;font-family:monospace;">${formatVND(item.amount)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="display:flex;justify-content:flex-end;">
        <div style="width:300px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Tạm tính:</span><span style="font-family:monospace;">${formatVND(invoice.subtotal)}</span></div>
          ${invoice.vat_amount > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>VAT (${normalizeRatePct(invoice.vat_rate)}%):</span><span style="font-family:monospace;">${formatVND(invoice.vat_amount)}</span></div>` : ''}
          ${invoice.service_fee_amount > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Phí dịch vụ (${normalizeRatePct(invoice.service_fee_rate)}%):</span><span style="font-family:monospace;">${formatVND(invoice.service_fee_amount)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-top:2px solid #333;font-size:${config.fontSize + 2}px;font-weight:700;"><span>TỔNG CỘNG:</span><span style="font-family:monospace;">${formatVND(invoice.total_amount)}</span></div>
          ${invoice.deposit_amount > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Đã cọc:</span><span style="font-family:monospace;">${formatVND(invoice.deposit_amount)}</span></div>` : ''}
          ${invoice.amount_paid > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Đã thanh toán:</span><span style="font-family:monospace;">${formatVND(invoice.amount_paid)}</span></div>` : ''}
          ${remaining > 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;color:#c00;font-weight:600;"><span>Còn lại:</span><span style="font-family:monospace;">${formatVND(remaining)}</span></div>` : ''}
          ${remaining < 0 ? `<div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:600;"><span>Tiền thừa trả khách:</span><span style="font-family:monospace;">${formatVND(Math.abs(remaining))}</span></div>` : ''}
          ${invoice.payment_method ? `<div style="display:flex;justify-content:space-between;padding:3px 0;"><span>Hình thức thanh toán:</span><span>${esc(paymentMethodLabel(invoice.payment_method))}</span></div>` : ''}
        </div>
      </div>
      ${qrBlockA4(qr, qrLabel)}
      ${signatureBlock()}
    </div>`
}

/** Async builder (with QR rendering). */
export async function buildInvoiceHTMLAsync(
  invoice: GuestInvoice,
  paperSize: PaperSize = 'A4',
  hotelInfo?: HotelInfo,
  qrPayload?: QrPayload,
): Promise<string> {
  if (paperSize === 'K80' || paperSize === 'K58') {
    return buildReceiptHTML(invoice, paperSize, hotelInfo, qrPayload)
  }
  return buildSheetHTML(invoice, paperSize, hotelInfo, qrPayload)
}

/** @deprecated Sync version — không có QR. Dùng buildInvoiceHTMLAsync. */
export function buildInvoiceHTML(
  invoice: GuestInvoice,
  paperSize: PaperSize = 'A4',
  hotelInfo?: HotelInfo,
): string {
  // Fallback đồng bộ (không QR) cho code cũ
  const config = PAPER_CONFIG[paperSize]
  if (config.isReceipt) {
    const lineItems = invoice.line_items || []
    const remaining = invoice.total_amount - invoice.amount_paid - (invoice.deposit_amount || 0)
    return `<div id="invoice-pdf" style="width:${config.width}px;padding:${config.padding};font-family:'Segoe UI',Arial,sans-serif;font-size:${config.fontSize}px;color:#111;background:#fff;">
      <div style="text-align:center;font-weight:700;">${esc(hotelInfo?.name || 'KHÁCH SẠN')}</div>
      <div style="text-align:center;border-top:1px dashed #999;border-bottom:1px dashed #999;padding:4px 0;margin:6px 0;font-weight:700;">${esc(invoice.invoice_number)}</div>
      <div>Khách: ${esc(invoice.guest_name)}</div>
      ${lineItems.map(i => `<div style="display:flex;justify-content:space-between;"><span>${esc(i.description)}</span><span>${formatVND(i.amount)}</span></div>`).join('')}
      <div style="border-top:1px dashed #999;margin-top:4px;padding-top:4px;display:flex;justify-content:space-between;font-weight:700;"><span>TỔNG:</span><span>${formatVND(invoice.total_amount)}</span></div>
      ${remaining > 0 ? `<div style="display:flex;justify-content:space-between;"><span>Còn lại:</span><span>${formatVND(remaining)}</span></div>` : ''}
    </div>`
  }
  // delegate to async-less rendering via simple template
  return `<div id="invoice-pdf" style="width:${config.width}px;padding:${config.padding};font-family:Arial,sans-serif;background:#fff;">Đang tải...</div>`
}

async function renderInvoiceToPDF(
  invoice: GuestInvoice,
  paperSize: PaperSize = 'A4',
  hotelInfo?: HotelInfo,
  qrPayload?: QrPayload,
) {
  const config = PAPER_CONFIG[paperSize]
  const html = await buildInvoiceHTMLAsync(invoice, paperSize, hotelInfo, qrPayload)

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.left = '-9999px'
  container.style.top = '0'
  container.innerHTML = html
  document.body.appendChild(container)

  try {
    const { default: html2canvas } = await import('html2canvas')
    const { default: jsPDF } = await import('jspdf')

    const element = container.querySelector('#invoice-pdf') as HTMLElement
    const canvas = await html2canvas(element, { scale: 2, useCORS: true, backgroundColor: '#fff' })

    const imgWidth = config.pdfWidth
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: config.isReceipt ? [config.pdfWidth, imgHeight] : [config.pdfWidth, config.pdfHeight],
    })
    doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, imgWidth, imgHeight)
    return doc
  } finally {
    document.body.removeChild(container)
  }
}

export async function generateInvoicePDF(
  invoice: GuestInvoice,
  paperSize: PaperSize = 'A4',
  hotelInfo?: HotelInfo,
  qrPayload?: QrPayload,
) {
  const doc = await renderInvoiceToPDF(invoice, paperSize, hotelInfo, qrPayload)
  doc.save(`${invoice.invoice_number}.pdf`)
}

export async function generateInvoicePDFBase64(
  invoice: GuestInvoice,
  paperSize: PaperSize = 'A4',
  hotelInfo?: HotelInfo,
  qrPayload?: QrPayload,
): Promise<string> {
  const doc = await renderInvoiceToPDF(invoice, paperSize, hotelInfo, qrPayload)
  return doc.output('datauristring').split(',')[1]
}

function pageCSS(paperSize: PaperSize): string {
  switch (paperSize) {
    case 'K80':
      return `@page { size: 80mm auto; margin: 2mm; }`
    case 'K58':
      return `@page { size: 58mm auto; margin: 2mm; }`
    case 'A5':
      return `@page { size: A5 portrait; margin: 8mm; }`
    case 'A4':
    default:
      return `@page { size: A4 portrait; margin: 10mm; }`
  }
}

export async function printInvoice(
  invoice: GuestInvoice,
  paperSize: PaperSize = 'A4',
  hotelInfo?: HotelInfo,
  qrPayload?: QrPayload,
) {
  const html = await buildInvoiceHTMLAsync(invoice, paperSize, hotelInfo, qrPayload)
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head>
      <meta charset="utf-8" />
      <title>${esc(invoice.invoice_number)}</title>
      <style>
        ${pageCSS(paperSize)}
        html, body { margin: 0; padding: 0; background: #fff; }
        body { display: flex; justify-content: center; }
        @media print {
          body { display: block; }
          #invoice-pdf { width: 100% !important; padding: 0 !important; }
        }
      </style>
    </head><body>${html}</body></html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => { printWindow.print(); printWindow.close() }, 400)
}

/** In một tem nhỏ chỉ chứa QR + hướng dẫn lấy VAT (khổ K80). */
export async function printVatQrSlip(
  invoice: GuestInvoice,
  qrPayload: QrPayload,
  hotelInfo?: HotelInfo,
) {
  const qr = await qrDataUrl(qrPayload.url, 360)
  const printWindow = window.open('', '_blank')
  if (!printWindow) return
  printWindow.document.write(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8" /><title>QR VAT ${esc(invoice.invoice_number)}</title>
    <style>
      @page { size: 80mm auto; margin: 3mm; }
      html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #fff; }
      .wrap { width: 74mm; padding: 4mm 2mm; text-align: center; }
      .title { font-weight: 700; font-size: 13px; }
      .hotel { font-size: 11px; color: #555; margin-bottom: 4px; }
      .num { font-size: 11px; color: #555; margin: 4px 0 6px; }
      img { width: 60mm; height: 60mm; }
      .hint { font-size: 11px; color: #333; margin-top: 6px; line-height: 1.4; }
    </style></head>
    <body><div class="wrap">
      <div class="hotel">${esc(hotelInfo?.name || '')}</div>
      <div class="title">LẤY HOÁ ĐƠN VAT</div>
      <div class="num">${esc(invoice.invoice_number)}</div>
      <img src="${qr}" alt="QR" />
      <div class="hint">Quét mã bằng camera điện thoại, nhập thông tin công ty & email để nhận hoá đơn GTGT điện tử.</div>
    </div></body></html>
  `)
  printWindow.document.close()
  printWindow.focus()
  setTimeout(() => { printWindow.print(); printWindow.close() }, 400)
}
