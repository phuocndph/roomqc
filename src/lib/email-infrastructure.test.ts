// Pure Edge-runtime modules are exercised with fake provider responses, never real recipients.
import { webcrypto } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { readEmailConfig, emailActionUrl } from '../../supabase/functions/_shared/email/config'
import { sendEmail } from '../../supabase/functions/_shared/email/provider'
import { renderEmail } from '../../supabase/functions/_shared/email/templates'
import { verifyEmailWebhook } from '../../supabase/functions/_shared/email/webhook'

const config = (values: Record<string, string> = {}) => readEmailConfig(key => values[key])
const email = { id: 'event-123', to: 'person@example.test', subject: 'Test', html: '<p>Test</p>', text: 'Test' }

describe('email configuration and delivery boundaries', () => {
  it('defaults to disabled and rejects unsafe production configuration', async () => {
    await expect(sendEmail(config(), email)).rejects.toThrow('EMAIL_DISABLED')
    expect(() => config({ ROOMQC_EMAIL_ENVIRONMENT: 'production' })).toThrow('HTTPS')
    expect(() => config({ ROOMQC_EMAIL_ENVIRONMENT: 'production', ROOMQC_PUBLIC_URL: 'https://app.example.com', ROOMQC_EMAIL_PROVIDER: 'mailpit' })).toThrow('production')
    expect(() => config({ ROOMQC_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test' })).toThrow('allowlist')
  })
  it('rejects unsafe destinations and escapes untrusted template text', () => {
    const settings = config()
    for (const path of ['https://evil.test', '//evil.test', '/\\evil.test', '/auth/login\r\n']) expect(() => emailActionUrl(settings, path)).toThrow()
    const rendered = renderEmail('workspace_ready', { name: '<script>alert(1)</script>', hotel_name: '<img src=x>', path: '/app/hotel-1/auth/login' }, settings)
    expect(rendered.html).not.toContain('<script>')
    expect(rendered.html).not.toContain('<img src=x>')
    expect(rendered.html).toContain('&lt;script&gt;')
    expect(rendered.text).toContain('http://127.0.0.1:8082/app/hotel-1/auth/login')
  })
  it('uses a stable provider idempotency key and excludes non-allowlisted recipients', async () => {
    const settings = config({ ROOMQC_EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'private-key', ROOMQC_EMAIL_TEST_RECIPIENTS: email.to })
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'provider-1' })))
    expect(await sendEmail(settings, email, fetcher)).toBe('provider-1')
    expect(fetcher.mock.calls[0][1].headers['Idempotency-Key']).toBe('roomqc/event-123')
    await expect(sendEmail(settings, { ...email, to: 'other@example.test' }, fetcher)).rejects.toThrow('allowlist')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('classifies rate limits and permanent errors without copying response secrets', async () => {
    const settings = config({ ROOMQC_EMAIL_PROVIDER: 'mailpit' })
    const failed = (status: number) => vi.fn().mockResolvedValue(new Response('sensitive recipient/body', { status, headers: { 'retry-after': '120' } }))
    await expect(sendEmail(settings, email, failed(429))).rejects.toMatchObject({ code: 'PROVIDER_HTTP_429', retryable: true, retryAfter: 120 })
    await expect(sendEmail(settings, email, failed(403))).rejects.toMatchObject({ code: 'PROVIDER_HTTP_403', retryable: false })
    await expect(sendEmail(settings, email, vi.fn().mockRejectedValue(new Error('secret details')))).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT_OR_NETWORK', retryable: true })
  })
})

describe('email webhook authenticity', () => {
  it('accepts only signatures over the raw body, event id and a recent timestamp', async () => {
    vi.stubGlobal('crypto', webcrypto)
    const rawSecret = 'local-test-webhook-key', secret = `whsec_${btoa(rawSecret)}`
    const timestamp = Math.floor(Date.now() / 1000), body = '{"type":"email.delivered"}'
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(rawSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`evt-1.${timestamp}.${body}`)))))
    const headers = new Headers({ 'svix-id': 'evt-1', 'svix-timestamp': String(timestamp), 'svix-signature': `v1,${signature}` })
    expect(await verifyEmailWebhook(body, headers, secret)).toBe(true)
    expect(await verifyEmailWebhook(body + ' ', headers, secret)).toBe(false)
    expect(await verifyEmailWebhook(body, headers, secret, Date.now() + 600000)).toBe(false)
    headers.set('svix-id', 'forged')
    expect(await verifyEmailWebhook(body, headers, secret)).toBe(false)
    vi.unstubAllGlobals()
  })
})
