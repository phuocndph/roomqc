import { createClient } from 'npm:@supabase/supabase-js@2'
import { checkRateLimit, rateLimitedResponse } from '../_shared/rateLimit.ts'
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

interface PasswordResetRequest {
  email: string
}

// Generate a random 6-digit OTP
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}

// Simple hash function for OTP (for storage)
async function hashOTP(otp: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(otp + Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function generateOTPEmail(otp: string): { subject: string; html: string; text: string } {
  const otpDigits = otp.split('')
  return {
    subject: '🔐 [RoomQc] Mã xác nhận đặt lại mật khẩu',
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

            <!-- Title -->
            <div style="text-align: center; margin-bottom: 24px;">
              <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 28px;">🔐</span>
              </div>
              <h2 style="color: #1a1a1a; font-size: 20px; font-weight: 600; margin: 0;">Mã xác nhận đặt lại mật khẩu</h2>
            </div>

            <!-- Content -->
            <p style="color: #4a5568; font-size: 15px; line-height: 24px; margin: 0 0 24px 0; text-align: center;">
              Nhập mã bên dưới để tiếp tục đặt lại mật khẩu của bạn:
            </p>

            <!-- OTP Code - Individual boxes -->
            <div style="text-align: center; margin: 32px 0;">
              <table cellpadding="0" cellspacing="0" border="0" style="margin: 0 auto;">
                <tr>
                  ${otpDigits.map(digit => `
                    <td style="padding: 0 4px;">
                      <div style="width: 48px; height: 56px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 8px; padding: 2px;">
                        <div style="width: 100%; height: 100%; background: #ffffff; border-radius: 6px; display: flex; align-items: center; justify-content: center;">
                          <span style="font-size: 28px; font-weight: bold; color: #1a1a1a; font-family: 'Courier New', monospace;">${digit}</span>
                        </div>
                      </div>
                    </td>
                  `).join('')}
                </tr>
              </table>
            </div>

            <!-- Warning -->
            <div style="background-color: #fef3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 16px; margin: 24px 0;">
              <p style="color: #856404; font-size: 14px; margin: 0; text-align: center;">
                ⏱️ Mã này sẽ hết hạn sau <strong>5 phút</strong>
              </p>
              <p style="color: #856404; font-size: 13px; margin: 8px 0 0 0; text-align: center;">
                Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.
              </p>
            </div>

            <!-- Footer -->
            <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0;" />
            <p style="color: #a0aec0; font-size: 12px; text-align: center; margin: 0;">
              Email này được gửi tự động từ hệ thống <strong>RoomQc</strong>.
            </p>
            <p style="color: #a0aec0; font-size: 12px; text-align: center; margin: 4px 0 0 0;">
              Cần hỗ trợ? Liên hệ support@roomqc.com
            </p>
          </div>
        </body>
      </html>
    `,
    text: `
MÃ XÁC NHẬN ĐẶT LẠI MẬT KHẨU - RoomQc

Mã xác nhận của bạn: ${otp}

Nhập mã này để tiếp tục đặt lại mật khẩu của bạn.

⏱️ Lưu ý: Mã này sẽ hết hạn sau 5 phút.

Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.

Cần hỗ trợ? Liên hệ support@roomqc.com

Trân trọng,
Đội ngũ RoomQc
    `.trim(),
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { email }: PasswordResetRequest = await req.json()

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email là bắt buộc' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: 'Email không hợp lệ' }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()
    console.log('Processing password reset for:', normalizedEmail)

    // Rate limit: max 3 OTP requests per email / 10 minutes,
    // and 10 requests per source IP / 10 minutes (to slow enumeration).
    const ip =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown'
    const okEmail = await checkRateLimit({
      key: `pwd-reset:email:${normalizedEmail}`,
      max: 3,
      windowSeconds: 600,
    })
    const okIp = await checkRateLimit({
      key: `pwd-reset:ip:${ip}`,
      max: 10,
      windowSeconds: 600,
    })
    if (!okEmail || !okIp) {
      console.warn('[send-password-reset] rate limited', { normalizedEmail, ip })
      return rateLimitedResponse(corsHeaders)
    }

    // Create Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Check if email exists in the system
    const { data: existingUser, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (userError) {
      console.error('Error checking user:', userError)
    }

    if (!existingUser) {
      console.log('Email not found in system:', normalizedEmail)
      return new Response(
        JSON.stringify({ 
          success: false,
          error: 'Email này chưa được đăng ký trong hệ thống',
          email_not_found: true
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    console.log('Found user:', existingUser.id)

    // Delete any existing unused OTPs for this email
    await supabaseAdmin
      .from('password_reset_otps')
      .delete()
      .eq('email', normalizedEmail)

    // Generate new OTP
    const otp = generateOTP()
    const otpHash = await hashOTP(otp)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000) // 5 minutes

    console.log('Generated OTP for:', normalizedEmail)

    // Store OTP in database
    const { error: insertError } = await supabaseAdmin
      .from('password_reset_otps')
      .insert({
        email: normalizedEmail,
        otp_hash: otpHash,
        expires_at: expiresAt.toISOString(),
        used: false,
        attempts: 0,
      })

    if (insertError) {
      console.error('Error storing OTP:', insertError)
      return new Response(
        JSON.stringify({ error: 'Không thể tạo mã xác nhận. Vui lòng thử lại.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    // Generate email content
    const emailContent = generateOTPEmail(otp)

    // Send email via Resend (direct API call to reduce bundle size)
    try {
      await sendEmailViaResend({
        from: 'RoomQc <notifications@roomqc.com>',
        to: [normalizedEmail],
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        reply_to: 'support@roomqc.com',
      })
    } catch (err: any) {
      console.error('Resend API error:', err?.message || String(err))
      // Clean up OTP if email fails
      await supabaseAdmin
        .from('password_reset_otps')
        .delete()
        .eq('email', normalizedEmail)

      return new Response(
        JSON.stringify({ error: 'Không thể gửi email. Vui lòng thử lại sau.' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
      )
    }

    console.log('OTP email sent successfully')

    // Log to database (optional)
    try {
      await supabaseAdmin
        .from('email_notifications')
        .insert({
          notification_type: 'password_reset_otp',
          to_email: normalizedEmail,
          subject: emailContent.subject,
          body_html: emailContent.html,
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
    } catch (dbError) {
      console.error('Failed to log email:', dbError)
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Mã xác nhận đã được gửi đến email của bạn.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  } catch (error: any) {
    console.error('Error in send-password-reset:', error)

    return new Response(
      JSON.stringify({ error: 'Đã xảy ra lỗi. Vui lòng thử lại sau.' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    )
  }
})