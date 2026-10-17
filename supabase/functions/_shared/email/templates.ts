import { emailActionUrl, type EmailConfig } from './config.ts'

export const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

export function renderEmail(template: string, data: Record<string, unknown>, config: EmailConfig) {
  let subject: string, description: string, label: string, path: string
  const name = String(data.name || 'bạn').slice(0, 150)
  switch (template) {
    case 'system_test':
      subject = 'RoomQC — Kiểm tra dịch vụ email'; description = 'Email thử đã được xử lý bởi dịch vụ gửi của RoomQC.'
      label = 'Mở RoomQC'; path = '/'; break
    case 'workspace_ready':
      subject = 'RoomQC — Khách sạn của bạn đã sẵn sàng'
      description = `${String(data.hotel_name || 'Khách sạn').slice(0, 150)} đã được thiết lập. Bạn có thể bắt đầu thêm phòng và mời nhân viên.`
      label = 'Bắt đầu sử dụng'; path = String(data.path || '/auth/login'); break
    default: throw new Error('Unsupported email template')
  }
  const actionUrl = emailActionUrl(config, path)
  const text = `Xin chào ${name},\n\n${description}\n\n${label}: ${actionUrl}\n\nTrân trọng,\nRoomQC`
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;background:#f3f4f6;color:#111827;font-family:Arial,sans-serif"><main style="max-width:560px;margin:24px auto;padding:32px;background:#fff;border:1px solid #d1d5db;border-radius:8px"><p style="font-size:20px;font-weight:bold">RoomQC</p><h1 style="font-size:22px">${escapeHtml(subject.replace('RoomQC — ', ''))}</h1><p>Xin chào ${escapeHtml(name)},</p><p style="line-height:1.6">${escapeHtml(description)}</p><p style="margin:28px 0"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;padding:14px 22px;background:#1d4ed8;color:#fff;text-decoration:none;border-radius:6px">${escapeHtml(label)}</a></p><p style="font-size:13px;color:#374151">Nếu nút không mở được, sao chép đường dẫn sau:<br>${escapeHtml(actionUrl)}</p><p>Trân trọng,<br>RoomQC</p></main></body></html>`
  return { subject, html, text }
}
