import { createClient } from 'npm:@supabase/supabase-js@2'
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

interface EmailRequest {
  notification_type: string
  to_email: string
  to_name?: string
  template_data: Record<string, any>
}

// Email template generator functions
function subscriptionExpiringTemplate(data: any): { subject: string; html: string; text: string } {
  const daysText = data.days_remaining === 1 ? 'ngày' : 'ngày'
  return {
    subject: `⏰ Gói đăng ký ${data.plan_name} sắp hết hạn`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px;">
            <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 0 0 24px 0;">⏰ Gói đăng ký sắp hết hạn</h1>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 16px 0;">Xin chào ${data.tenant_name},</p>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
              Gói đăng ký <strong>${data.plan_name}</strong> của bạn sẽ hết hạn trong <strong>${data.days_remaining} ${daysText}</strong> (vào ngày ${new Date(data.expires_at).toLocaleDateString('vi-VN')}).
            </p>
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 16px; margin: 24px 0;">
              <p style="color: #856404; font-size: 14px; margin: 0;">
                Để tiếp tục sử dụng dịch vụ mà không bị gián đoạn, vui lòng gia hạn ngay.
              </p>
            </div>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${data.renewal_url}" style="display: inline-block; background-color: #5469d4; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: bold;">Gia hạn ngay</a>
            </div>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 24px 0 0 0;">
              Nếu bạn không gia hạn, tài khoản của bạn sẽ bị tạm ngưng khi hết hạn.
            </p>
            <p style="color: #8898aa; font-size: 14px; margin-top: 32px;">
              Trân trọng,<br />Đội ngũ RoomQc
            </p>
          </div>
        </body>
      </html>
    `,
    text: `
GÓI ĐĂNG KÝ SẮP HẾT HẠN - RoomQc

Xin chào ${data.tenant_name},

Gói đăng ký ${data.plan_name} của bạn sẽ hết hạn trong ${data.days_remaining} ngày (vào ngày ${new Date(data.expires_at).toLocaleDateString('vi-VN')}).

Để tiếp tục sử dụng dịch vụ mà không bị gián đoạn, vui lòng gia hạn ngay tại: ${data.renewal_url}

Nếu bạn không gia hạn, tài khoản của bạn sẽ bị tạm ngưng khi hết hạn.

Trân trọng,
Đội ngũ RoomQc
    `.trim(),
  }
}

function paymentSucceededTemplate(data: any): { subject: string; html: string; text: string } {
  const formattedAmount = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: data.currency || 'VND',
  }).format(data.amount)

  const linksHtml = data.invoice_url || data.receipt_url ? `
    <hr style="border: none; border-top: 1px solid #e6ebf1; margin: 24px 0;" />
    <p style="text-align: center; font-size: 14px;">
      ${data.invoice_url ? `<a href="${data.invoice_url}" style="color: #5469d4; text-decoration: underline;">Xem hóa đơn</a>` : ''}
      ${data.invoice_url && data.receipt_url ? ' | ' : ''}
      ${data.receipt_url ? `<a href="${data.receipt_url}" style="color: #5469d4; text-decoration: underline;">Tải biên lai</a>` : ''}
    </p>
  ` : ''

  return {
    subject: `✅ Thanh toán thành công cho gói ${data.plan_name}`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px;">
            <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 0 0 24px 0;">✅ Thanh toán thành công</h1>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 16px 0;">Xin chào ${data.tenant_name},</p>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
              Chúng tôi đã nhận được thanh toán của bạn thành công!
            </p>
            <div style="background-color: #f8f9fa; border: 1px solid #dee2e6; border-radius: 4px; padding: 20px; margin: 24px 0;">
              <p style="color: #6c757d; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Gói dịch vụ:</p>
              <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">${data.plan_name}</p>
              <p style="color: #6c757d; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Số tiền:</p>
              <p style="color: #333; font-size: 16px; margin: 0 0 16px 0;">${formattedAmount}</p>
              <p style="color: #6c757d; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Ngày thanh toán tiếp theo:</p>
              <p style="color: #333; font-size: 16px; margin: 0;">${new Date(data.next_billing_date).toLocaleDateString('vi-VN')}</p>
            </div>
            ${linksHtml}
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 24px 0 0 0;">
              Cảm ơn bạn đã tin tưởng và sử dụng dịch vụ của chúng tôi!
            </p>
            <p style="color: #8898aa; font-size: 14px; margin-top: 32px;">
              Trân trọng,<br />Đội ngũ RoomQc
            </p>
          </div>
        </body>
      </html>
    `,
    text: `
THANH TOÁN THÀNH CÔNG - RoomQc

Xin chào ${data.tenant_name},

Chúng tôi đã nhận được thanh toán của bạn thành công!

CHI TIẾT THANH TOÁN:
- Gói dịch vụ: ${data.plan_name}
- Số tiền: ${formattedAmount}
- Ngày thanh toán tiếp theo: ${new Date(data.next_billing_date).toLocaleDateString('vi-VN')}

Cảm ơn bạn đã tin tưởng và sử dụng dịch vụ của chúng tôi!

Trân trọng,
Đội ngũ RoomQc
    `.trim(),
  }
}

function paymentFailedTemplate(data: any): { subject: string; html: string; text: string } {
  const formattedAmount = new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: data.currency || 'VND',
  }).format(data.amount)

  const retryDateHtml = data.retry_date ? `
    <p style="color: #721c24; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Thử lại vào:</p>
    <p style="color: #721c24; font-size: 16px; margin: 0;">${new Date(data.retry_date).toLocaleDateString('vi-VN')}</p>
  ` : ''

  return {
    subject: `❌ Thanh toán không thành công`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px;">
            <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 0 0 24px 0;">❌ Thanh toán không thành công</h1>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 16px 0;">Xin chào ${data.tenant_name},</p>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
              Chúng tôi không thể xử lý thanh toán của bạn cho gói <strong>${data.plan_name}</strong>.
            </p>
            <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; border-radius: 4px; padding: 20px; margin: 24px 0;">
              <p style="color: #721c24; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Số tiền:</p>
              <p style="color: #721c24; font-size: 16px; margin: 0 0 16px 0;">${formattedAmount}</p>
              <p style="color: #721c24; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Lý do:</p>
              <p style="color: #721c24; font-size: 16px; margin: 0 0 16px 0;">${data.failure_reason}</p>
              ${retryDateHtml}
            </div>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
              Vui lòng cập nhật phương thức thanh toán của bạn để tránh gián đoạn dịch vụ.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${data.update_payment_url}" style="display: inline-block; background-color: #dc3545; color: #ffffff; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: bold;">Cập nhật thanh toán</a>
            </div>
            <p style="color: #8898aa; font-size: 14px; margin-top: 32px;">
              Trân trọng,<br />Đội ngũ RoomQc
            </p>
          </div>
        </body>
      </html>
    `,
    text: `
THANH TOÁN KHÔNG THÀNH CÔNG - RoomQc

Xin chào ${data.tenant_name},

Chúng tôi không thể xử lý thanh toán của bạn cho gói ${data.plan_name}.

CHI TIẾT:
- Số tiền: ${formattedAmount}
- Lý do: ${data.failure_reason}
${data.retry_date ? `- Thử lại vào: ${new Date(data.retry_date).toLocaleDateString('vi-VN')}` : ''}

Vui lòng cập nhật phương thức thanh toán tại: ${data.update_payment_url}

Trân trọng,
Đội ngũ RoomQc
    `.trim(),
  }
}

function quotaWarningTemplate(data: any): { subject: string; html: string; text: string } {
  const resourceNames: Record<string, string> = {
    hotel: 'khách sạn',
    user: 'người dùng',
    room: 'phòng',
    item: 'tài sản',
    storage: 'lưu trữ',
  }

  const resourceName = resourceNames[data.resource_type] || data.resource_type

  return {
    subject: `⚠️ Cảnh báo: Sắp đạt giới hạn tài nguyên`,
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
        </head>
        <body style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,sans-serif; background-color: #f6f9fc; margin: 0; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 40px; border-radius: 8px;">
            <h1 style="color: #333; font-size: 24px; font-weight: bold; margin: 0 0 24px 0;">⚠️ Cảnh báo mức sử dụng</h1>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 16px 0;">Xin chào ${data.tenant_name},</p>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
              Bạn đang sử dụng <strong>${data.percentage}%</strong> giới hạn <strong>${resourceName}</strong> của gói hiện tại.
            </p>
            <div style="background-color: #fff3cd; border: 1px solid #ffc107; border-radius: 4px; padding: 20px; margin: 24px 0;">
              <p style="color: #856404; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Tài nguyên:</p>
              <p style="color: #856404; font-size: 16px; margin: 0 0 16px 0;">${resourceName}</p>
              <p style="color: #856404; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Đã sử dụng:</p>
              <p style="color: #856404; font-size: 16px; margin: 0 0 16px 0;">${data.current_usage} / ${data.limit}</p>
              <p style="color: #856404; font-size: 14px; font-weight: bold; margin: 0 0 4px 0;">Phần trăm:</p>
              <p style="color: #856404; font-size: 16px; margin: 0;">${data.percentage}%</p>
            </div>
            <p style="color: #333; font-size: 16px; line-height: 26px; margin: 0 0 24px 0;">
              Khi đạt 100%, bạn sẽ không thể thêm ${resourceName} mới cho đến khi nâng cấp gói hoặc giải phóng tài nguyên.
            </p>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${data.upgrade_url}" style="display: inline-block; background-color: #ffc107; color: #000000; padding: 12px 32px; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: bold;">Nâng cấp gói ngay</a>
            </div>
            <p style="color: #8898aa; font-size: 14px; margin-top: 32px;">
              Trân trọng,<br />Đội ngũ RoomQc
            </p>
          </div>
        </body>
      </html>
    `,
    text: `
CẢNH BÁO MỨC SỬ DỤNG - RoomQc

Xin chào ${data.tenant_name},

Bạn đang sử dụng ${data.percentage}% giới hạn ${resourceName} của gói hiện tại.

CHI TIẾT:
- Tài nguyên: ${resourceName}
- Đã sử dụng: ${data.current_usage} / ${data.limit}
- Phần trăm: ${data.percentage}%

Khi đạt 100%, bạn sẽ không thể thêm ${resourceName} mới cho đến khi nâng cấp gói hoặc giải phóng tài nguyên.

Nâng cấp gói tại: ${data.upgrade_url}

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
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('Missing authorization header')
    }

    // Create Supabase client with the auth token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: authHeader },
        },
      }
    )

    // Create service role client for cross-checks
    const supabaseService = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify user is authenticated
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      throw new Error('Unauthorized')
    }

    // Parse request body
    const { notification_type, to_email, to_name, template_data }: EmailRequest = await req.json()

    // Authorization check: Get calling user's tenant and verify they can send to target email
    const { data: callerData } = await supabaseService
      .from('users')
      .select('tenant_id, user_level_code')
      .eq('id', user.id)
      .single()

    if (callerData?.tenant_id) {
      // Check if target email belongs to a user in a different tenant
      const { data: targetUser } = await supabaseService
        .from('users')
        .select('tenant_id')
        .eq('email', to_email)
        .single()

      if (targetUser && targetUser.tenant_id !== callerData.tenant_id) {
        console.error('Cross-tenant email attempt blocked:', {
          callerId: user.id,
          callerTenant: callerData.tenant_id,
          targetEmail: to_email,
          targetTenant: targetUser.tenant_id
        })
        throw new Error('Cannot send emails to users in different tenants')
      }
    }

    console.log('Sending email:', { notification_type, to_email })

    // Select the appropriate template
    let emailContent: { subject: string; html: string; text: string }

    switch (notification_type) {
      case 'subscription_expiring':
        emailContent = subscriptionExpiringTemplate(template_data)
        break
      case 'payment_succeeded':
        emailContent = paymentSucceededTemplate(template_data)
        break
      case 'payment_failed':
        emailContent = paymentFailedTemplate(template_data)
        break
      case 'quota_warning':
        emailContent = quotaWarningTemplate(template_data)
        break
      default:
        throw new Error(`Unknown notification type: ${notification_type}`)
    }

    // Send email via Resend (direct API call to reduce bundle size)
    const { id: providerMessageId } = await sendEmailViaResend({
      from: 'RoomQc <notifications@roomqc.com>',
      to: [to_email],
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text,
      reply_to: 'support@roomqc.com',
    })

    console.log('Email sent successfully:', { providerMessageId })

    // Log the email notification in database
    const { error: dbError } = await supabaseClient
      .from('email_notifications')
      .insert({
        user_id: user.id,
        notification_type,
        to_email,
        subject: emailContent.subject,
        body_html: emailContent.html,
        status: 'sent',
        sent_at: new Date().toISOString(),
      })

    if (dbError) {
      console.error('Failed to log email notification:', dbError)
      // Don't throw - email was sent successfully
    }

    return new Response(
      JSON.stringify({
        success: true,
        message_id: providerMessageId,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    )
  } catch (error: any) {
    console.error('Error in send-notification-email:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Internal server error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    )
  }
})