import { buildCorsHeaders } from '../_shared/cors.ts'
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')?.trim()

type ResendSendEmailParams = {
  from: string
  to: string[]
  subject: string
  html: string
  text?: string
  reply_to?: string
}

async function sendEmailViaResend(params: ResendSendEmailParams): Promise<{ id?: string }> {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })

  const text = await response.text()
  let json: any = null
  try {
    json = JSON.parse(text)
  } catch {
    // ignore
  }

  if (!response.ok) {
    const message = json?.message || json?.error?.message || text || `Resend error ${response.status}`
    throw new Error(message)
  }

  const id = json?.id ?? json?.data?.id
  return { id }
}

interface WelcomeEmailRequest {
  email: string
  fullName: string
  // For staff/manager created by admin
  isCreatedByAdmin?: boolean
  createdByName?: string
  roleName?: string
  hotelName?: string
  tempPassword?: string
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function getLoginUrl(): string {
  const configured = Deno.env.get('ROOMQC_PUBLIC_URL')?.trim()
  if (!configured) {
    try {
      const supabaseUrl = new URL(Deno.env.get('SUPABASE_URL') ?? '')
      if (['localhost', '127.0.0.1'].includes(supabaseUrl.hostname)) {
        return 'http://localhost:8082/auth/login'
      }
      if (supabaseUrl.hostname.endsWith('.supabase.co')) {
        return `https://${supabaseUrl.hostname.replace(/\.supabase\.co$/i, '.lovable.app')}/auth/login`
      }
    } catch {
      // Fall through to the canonical public domain.
    }
  }

  const target = configured || 'https://roomqc.com'
  try {
    const base = new URL(target)
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('unsupported protocol')
    return new URL('/auth/login', base).toString()
  } catch {
    console.error('ROOMQC_PUBLIC_URL is invalid; using the RoomQC fallback domain')
    return 'https://roomqc.com/auth/login'
  }
}

function generateOwnerWelcomeEmail(fullName: string, loginUrl: string): { subject: string; html: string; text: string } {
  const safeFullName = escapeHtml(fullName)
  const safeLoginUrl = escapeHtml(loginUrl)
  return {
    subject: '🎉 [RoomQc] Chào mừng bạn đến với RoomQc!',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <!-- Header with RoomQc branding -->
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="font-size: 32px; font-weight: bold; margin: 0 0 8px 0;">
                <span style="color: #667eea;">Room</span><span style="color: #764ba2;">Qc</span>
              </h1>
              <p style="color: #718096; font-size: 14px; margin: 0;">Hệ thống quản lý khách sạn</p>
            </div>

            <!-- Welcome message -->
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 40px;">🎉</span>
              </div>
              <h2 style="font-size: 24px; color: #1a202c; margin: 0 0 8px 0;">Chào mừng, ${safeFullName}!</h2>
              <p style="font-size: 16px; color: #718096; margin: 0;">Tài khoản của bạn đã được tạo thành công</p>
            </div>

            <!-- Features section -->
            <div style="background-color: #f7fafc; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
              <h3 style="font-size: 16px; color: #2d3748; margin: 0 0 16px 0;">✨ Bạn có thể bắt đầu với:</h3>
              <ul style="margin: 0; padding-left: 20px; color: #4a5568;">
                <li style="margin-bottom: 8px;">Quản lý phòng và tài sản khách sạn</li>
                <li style="margin-bottom: 8px;">Theo dõi tồn kho và giặt ủi</li>
                <li style="margin-bottom: 8px;">Quản lý nhân viên và phân quyền</li>
                <li style="margin-bottom: 8px;">Báo cáo và thống kê chi tiết</li>
              </ul>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin-bottom: 32px;">
              <a href="${safeLoginUrl}"
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Đăng nhập ngay
              </a>
            </div>

            <!-- Help section -->
            <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 14px; color: #718096; margin: 0 0 8px 0;">
                Cần hỗ trợ? Liên hệ với chúng tôi qua email: support@roomqc.com
              </p>
            </div>

            <!-- Footer -->
            <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 12px; color: #a0aec0; margin: 0;">
                Email này được gửi tự động từ hệ thống RoomQc.
              </p>
              <p style="font-size: 12px; color: #cbd5e0; margin: 16px 0 0 0;">
                © ${new Date().getFullYear()} RoomQc. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Chào mừng đến với RoomQc!

Xin chào ${fullName},

Tài khoản RoomQc của bạn đã được tạo thành công.

Bạn có thể bắt đầu với:
- Quản lý phòng và tài sản khách sạn
- Theo dõi tồn kho và giặt ủi
- Quản lý nhân viên và phân quyền
- Báo cáo và thống kê chi tiết

Đăng nhập tại: ${loginUrl}

Cần hỗ trợ? Liên hệ: support@roomqc.com

Trân trọng,
Đội ngũ RoomQc
    `.trim(),
  }
}

function generateStaffWelcomeEmail(
  fullName: string,
  email: string,
  createdByName: string,
  roleName: string,
  hotelName: string | undefined,
  tempPassword: string,
  loginUrl: string
): { subject: string; html: string; text: string } {
  const safeFullName = escapeHtml(fullName)
  const safeEmail = escapeHtml(email)
  const safeCreatedByName = escapeHtml(createdByName)
  const safeRoleName = escapeHtml(roleName)
  const safeHotelName = hotelName ? escapeHtml(hotelName) : undefined
  const safeTempPassword = escapeHtml(tempPassword)
  const safeLoginUrl = escapeHtml(loginUrl)
  return {
    subject: '🔑 [RoomQc] Tài khoản của bạn đã được tạo',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Ubuntu, sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <!-- Header with RoomQc branding -->
            <div style="text-align: center; margin-bottom: 32px;">
              <h1 style="font-size: 32px; font-weight: bold; margin: 0 0 8px 0;">
                <span style="color: #667eea;">Room</span><span style="color: #764ba2;">Qc</span>
              </h1>
              <p style="color: #718096; font-size: 14px; margin: 0;">Hệ thống quản lý khách sạn</p>
            </div>

            <!-- Welcome message -->
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="width: 80px; height: 80px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 20px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 40px;">🔑</span>
              </div>
              <h2 style="font-size: 24px; color: #1a202c; margin: 0 0 8px 0;">Chào mừng, ${safeFullName}!</h2>
              <p style="font-size: 16px; color: #718096; margin: 0;">
                Tài khoản của bạn đã được tạo bởi <strong>${safeCreatedByName}</strong>
              </p>
            </div>

            <!-- Account Info -->
            <div style="background-color: #f7fafc; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
              <h3 style="font-size: 16px; color: #2d3748; margin: 0 0 16px 0;">📋 Thông tin tài khoản:</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #718096; width: 120px;">Vai trò:</td>
                  <td style="padding: 8px 0; color: #2d3748; font-weight: 600;">${safeRoleName}</td>
                </tr>
                ${safeHotelName ? `
                <tr>
                  <td style="padding: 8px 0; color: #718096;">Khách sạn:</td>
                  <td style="padding: 8px 0; color: #2d3748; font-weight: 600;">${safeHotelName}</td>
                </tr>
                ` : ''}
                <tr>
                  <td style="padding: 8px 0; color: #718096;">Email:</td>
                  <td style="padding: 8px 0; color: #2d3748; font-family: monospace;">${safeEmail}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #718096;">Mật khẩu:</td>
                  <td style="padding: 8px 0; color: #2d3748; font-family: monospace; background: #edf2f7; padding: 8px; border-radius: 4px;">${safeTempPassword}</td>
                </tr>
              </table>
            </div>

            <!-- Security Warning -->
            <div style="background-color: #fffaf0; border-left: 4px solid #ed8936; padding: 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #c05621; font-size: 14px;">
                ⚠️ <strong>Lưu ý bảo mật:</strong> Vui lòng đổi mật khẩu ngay khi đăng nhập lần đầu tiên.
              </p>
            </div>

            <!-- CTA Button -->
            <div style="text-align: center; margin-bottom: 32px;">
              <a href="${safeLoginUrl}"
                 style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px;">
                Đăng nhập ngay
              </a>
            </div>

            <!-- Help section -->
            <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 14px; color: #718096; margin: 0 0 8px 0;">
                Nếu bạn không yêu cầu tạo tài khoản này, vui lòng liên hệ quản lý của bạn hoặc email support@roomqc.com
              </p>
            </div>

            <!-- Footer -->
            <div style="text-align: center; margin-top: 32px; padding-top: 24px; border-top: 1px solid #e2e8f0;">
              <p style="font-size: 12px; color: #a0aec0; margin: 0;">
                Email này được gửi tự động từ hệ thống RoomQc.
              </p>
              <p style="font-size: 12px; color: #cbd5e0; margin: 16px 0 0 0;">
                © ${new Date().getFullYear()} RoomQc. All rights reserved.
              </p>
            </div>
          </div>
        </body>
      </html>
    `,
    text: `
Tài khoản RoomQc của bạn đã được tạo

Xin chào ${fullName},

Tài khoản của bạn đã được tạo bởi ${createdByName}.

THÔNG TIN TÀI KHOẢN:
- Vai trò: ${roleName}
${hotelName ? `- Khách sạn: ${hotelName}` : ''}
- Email: ${email}
- Mật khẩu tạm thời: ${tempPassword}

⚠️ LƯU Ý BẢO MẬT: Vui lòng đổi mật khẩu ngay khi đăng nhập lần đầu tiên.

Đăng nhập tại: ${loginUrl}

Nếu bạn không yêu cầu tạo tài khoản này, vui lòng liên hệ quản lý hoặc email support@roomqc.com

Trân trọng,
Đội ngũ RoomQc
    `.trim(),
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  const corsHeaders = buildCorsHeaders(req)
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      email, 
      fullName, 
      isCreatedByAdmin,
      createdByName,
      roleName,
      hotelName,
      tempPassword
    }: WelcomeEmailRequest = await req.json()

    if (!email || !fullName) {
      return new Response(
        JSON.stringify({ error: 'Email và tên là bắt buộc' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Sending welcome email to: ${email}, isCreatedByAdmin: ${isCreatedByAdmin}`)

    let subject: string
    let html: string
    let text: string
    const loginUrl = getLoginUrl()

    if (isCreatedByAdmin && createdByName && roleName && tempPassword) {
      // Staff/Manager welcome email
      const emailContent = generateStaffWelcomeEmail(
        fullName,
        email,
        createdByName,
        roleName,
        hotelName,
        tempPassword,
        loginUrl
      )
      subject = emailContent.subject
      html = emailContent.html
      text = emailContent.text
    } else {
      // Owner welcome email (self-registration)
      const emailContent = generateOwnerWelcomeEmail(fullName, loginUrl)
      subject = emailContent.subject
      html = emailContent.html
      text = emailContent.text
    }

    let providerMessageId: string | undefined
    try {
      const res = await sendEmailViaResend({
        from: 'RoomQc <notifications@roomqc.com>',
        to: [email],
        subject,
        html,
        text,
        reply_to: 'support@roomqc.com',
      })
      providerMessageId = res.id
    } catch (err: any) {
      console.error('Resend API error:', err?.message || String(err))
      return new Response(
        JSON.stringify({ error: err?.message || 'Failed to send email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Welcome email sent successfully:', { providerMessageId })

    return new Response(
      JSON.stringify({ success: true, message: 'Email chào mừng đã được gửi' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Error sending welcome email:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
