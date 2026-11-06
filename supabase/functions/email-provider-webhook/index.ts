import { adminClient, json } from '../_shared/email/admin.ts'
import { verifyEmailWebhook } from '../_shared/email/webhook.ts'

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, {}, 405)
  const secret = Deno.env.get('ROOMQC_EMAIL_WEBHOOK_SECRET')
  if (!secret) return json({ error: 'Webhook not configured' }, {}, 503)
  // Bounded streaming read; Content-Length alone is not trustworthy.
  const reader = req.body?.getReader()
  if (!reader) return json({ error: 'Missing body' }, {}, 400)
  let length = 0; const chunks: Uint8Array[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    length += value.length
    if (length > 65536) { await reader.cancel(); return json({ error: 'Body too large' }, {}, 413) }
    chunks.push(value)
  }
  const bytes = new Uint8Array(length); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  const body = new TextDecoder().decode(bytes)
  if (!await verifyEmailWebhook(body, req.headers, secret)) return json({ error: 'Invalid signature' }, {}, 401)
  try {
    const event = JSON.parse(body)
    const supported = ['email.delivered', 'email.delivery_delayed', 'email.bounced', 'email.complained', 'email.failed', 'email.suppressed']
    if (!supported.includes(event.type)) return json({ ignored: true })
    if (typeof event.data?.email_id !== 'string') return json({ error: 'Invalid event' }, {}, 400)
    const { data, error } = await adminClient().rpc('record_email_provider_event', { p_event_id: req.headers.get('svix-id'), p_provider_id: event.data.email_id, p_type: event.type })
    if (error || !data) return json({ error: 'Delivery is not recorded yet; retry later' }, {}, 503)
    return json({ success: true })
  } catch { return json({ error: 'Invalid event' }, {}, 400) }
})
