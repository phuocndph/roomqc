import { createClient } from 'npm:@supabase/supabase-js@2.80.0'
import { isInternalRequest } from '../_shared/internalAuth.ts'
import { readEmailConfig } from '../_shared/email/config.ts'
import { renderEmail } from '../_shared/email/templates.ts'
import { EmailProviderError, sendEmail } from '../_shared/email/provider.ts'
import { json } from '../_shared/email/admin.ts'

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, {}, 405)
  if (!isInternalRequest(req)) return json({ error: 'Forbidden' }, {}, 403)
  const client = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const worker = crypto.randomUUID()
  let processed = 0
  try {
    const config = readEmailConfig(key => Deno.env.get(key))
    if (config.provider === 'disabled') return json({ skipped: true, reason: 'email_disabled' })
    const { data: acquired, error: lockError } = await client.rpc('acquire_email_worker', { p_worker: worker })
    if (lockError) throw lockError
    if (!acquired) return json({ skipped: true, reason: 'busy_or_cooldown' })
    const deadline = Date.now() + 45000
    for (let i = 0; i < 4 && Date.now() < deadline; i++) {
      const { data: messages, error } = await client.rpc('read_email_batch', { queue_name: 'transactional_emails', batch_size: 1, vt: 120 })
      if (error) throw error
      const message = messages?.[0]
      if (!message) break
      const id = message.message?.delivery_id
      // Old bodies may contain expired auth tokens. Never replay them through a new provider.
      if (typeof id !== 'string') {
        const { error: moveError } = await client.rpc('move_to_dlq', { source_queue: 'transactional_emails', dlq_name: 'transactional_emails_dlq',
          message_id: message.msg_id, payload: { reason: 'legacy_payload_requires_review', legacy_queue_id: message.msg_id } })
        if (moveError) throw moveError
        continue
      }
      const claim = crypto.randomUUID()
      const { data: rows, error: claimError } = await client.rpc('claim_email_delivery', { p_id: id, p_claim: claim })
      if (claimError) throw claimError
      const row = rows?.[0]
      if (!row) {
        const { data: current, error: lookupError } = await client.from('email_deliveries').select('status').eq('id', id).maybeSingle()
        if (lookupError) throw lookupError
        if (!current || !['queued', 'processing'].includes(current.status)) {
          const { error: deleteError } = await client.rpc('delete_email', { queue_name: 'transactional_emails', message_id: message.msg_id })
          if (deleteError) throw deleteError
        }
        continue
      }
      let status = 'accepted', providerId: string | null = null, code: string | null = null, retry = 60
      try {
        if (Date.parse(row.expires_at) <= Date.now() || row.attempts > 5) {
          status = 'expired'; code = 'EXPIRED_OR_RETRY_LIMIT'
        } else {
          const { data: suppression, error: suppressionError } = await client.from('suppressed_emails').select('reason').eq('email', row.recipient_email).maybeSingle()
          if (suppressionError) throw new EmailProviderError('SUPPRESSION_CHECK_UNAVAILABLE', true)
          if (suppression) { status = 'suppressed'; code = 'RECIPIENT_SUPPRESSED' }
          else providerId = await sendEmail(config, { id, to: row.recipient_email, ...renderEmail(row.template_name, row.template_data, config) })
        }
      } catch (error) {
        const providerError = error instanceof EmailProviderError ? error : new EmailProviderError('EMAIL_VALIDATION_FAILED', false)
        code = providerError.code
        status = providerError.retryable && row.attempts < 5 ? 'queued' : 'failed'
        retry = Math.max(providerError.retryAfter, Math.min(1800, 30 * 2 ** row.attempts)) + Math.floor(Math.random() * 10)
        if (code === 'PROVIDER_HTTP_429') {
          const { error: stateError } = await client.from('email_send_state').update({ retry_after_until: new Date(Date.now() + retry * 1000).toISOString() }).eq('id', 1)
          if (stateError) throw stateError
        }
      }
      const { data: finished, error: finishError } = await client.rpc('finish_email_delivery', { p_id: id, p_claim: claim, p_queue_id: message.msg_id,
        p_status: status, p_provider_id: providerId, p_error: code, p_retry_seconds: retry })
      if (finishError || !finished) throw new Error('DELIVERY_COMMIT_FAILED')
      processed++
      if (code === 'PROVIDER_HTTP_429') break
      await new Promise(resolve => setTimeout(resolve, 600))
    }
    return json({ processed })
  } catch {
    console.error('EMAIL_WORKER_FAILED') // Never log payloads, tokens, recipients or provider bodies.
    return json({ error: 'Email worker unavailable', processed }, {}, 503)
  } finally {
    await client.rpc('release_email_worker', { p_worker: worker })
  }
})
