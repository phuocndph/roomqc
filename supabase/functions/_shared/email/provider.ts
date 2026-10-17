import { assertRecipient, type EmailConfig } from './config.ts'

export class EmailProviderError extends Error {
  constructor(public code: string, public retryable: boolean, public retryAfter = 60) { super(code) }
}

export interface OutgoingEmail { id: string; to: string; subject: string; html: string; text: string; attachments?: { filename: string; content: string }[] }

export async function sendEmail(config: EmailConfig, email: OutgoingEmail, fetcher: typeof fetch = fetch): Promise<string> {
  assertRecipient(config, email.to)
  if (config.provider === 'disabled') throw new EmailProviderError('EMAIL_DISABLED', false)
  // Resend retains idempotency keys for 24h. Queue expiry is deliberately shorter.
  const capture = config.provider === 'mailpit'
  let response: Response
  try {
    response = await fetcher(capture ? `${config.mailpitUrl}/api/v1/send` : 'https://api.resend.com/emails', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
      headers: { 'Content-Type': 'application/json', ...(capture ? {} : { Authorization: `Bearer ${config.apiKey}`, 'Idempotency-Key': `roomqc/${email.id}` }) },
      body: JSON.stringify(capture
        ? { From: { Email: config.fromEmail, Name: config.fromName }, To: [{ Email: email.to }], Subject: email.subject, HTML: email.html, Text: email.text, Headers: { 'X-RoomQC-Event': email.id },
            ...(email.attachments?.length ? { Attachments: email.attachments.map(a => ({ Filename: a.filename, ContentType: 'application/pdf', Content: a.content })) } : {}) }
        : { from: `${config.fromName} <${config.fromEmail}>`, to: [email.to], subject: email.subject, html: email.html, text: email.text,
          ...(config.replyTo ? { reply_to: config.replyTo } : {}), ...(email.attachments?.length ? { attachments: email.attachments } : {}) }),
    })
  } catch { throw new EmailProviderError('PROVIDER_TIMEOUT_OR_NETWORK', true) }
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('retry-after'))
    // Provider bodies can contain recipient addresses/content. Never copy them into logs.
    await response.body?.cancel()
    throw new EmailProviderError(`PROVIDER_HTTP_${response.status}`, response.status === 429 || response.status >= 500 || response.status === 408 || response.status === 409,
      Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 3600) : 60)
  }
  const data = await response.json()
  const id = capture ? data.ID : data.id
  if (typeof id !== 'string' || !id) throw new EmailProviderError('PROVIDER_RESPONSE_INVALID', true)
  return id
}
