export type EmailEnvironment = (key: string) => string | undefined
export type EmailConfig = ReturnType<typeof readEmailConfig>

export function readEmailConfig(env: EmailEnvironment) {
  const provider = env('ROOMQC_EMAIL_PROVIDER')?.trim() || 'disabled'
  if (!['disabled', 'mailpit', 'resend'].includes(provider)) throw new Error('Invalid email provider')
  const environment = env('ROOMQC_EMAIL_ENVIRONMENT')?.trim() || 'local'
  if (!['local', 'staging', 'production'].includes(environment)) throw new Error('Invalid email environment')
  const publicUrl = env('ROOMQC_PUBLIC_URL')?.trim() || 'http://127.0.0.1:8082'
  const url = new URL(publicUrl)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('ROOMQC_PUBLIC_URL must be an origin')
  }
  if (environment !== 'local' && url.protocol !== 'https:') throw new Error('HTTPS is required for email links')
  const fromEmail = env('ROOMQC_EMAIL_FROM')?.trim() || 'notifications@roomqc.test'
  const fromName = env('ROOMQC_EMAIL_FROM_NAME')?.trim() || 'RoomQC'
  const replyTo = env('ROOMQC_EMAIL_REPLY_TO')?.trim() || ''
  if (!validEmail(fromEmail) || (replyTo && !validEmail(replyTo)) || /[\r\n<>]/.test(fromName)) throw new Error('Invalid sender')
  const apiKey = env('RESEND_API_KEY')?.trim() || ''
  if (provider === 'resend' && !apiKey) throw new Error('RESEND_API_KEY is not configured')
  if (environment === 'production' && provider === 'mailpit') throw new Error('Mail capture is not a production provider')
  if (provider === 'resend' && environment === 'production' && /\.(test|invalid|localhost)$/i.test(fromEmail)) throw new Error('A verified sender domain is required')
  const allowlist = new Set((env('ROOMQC_EMAIL_TEST_RECIPIENTS') || '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean))
  if (provider === 'resend' && environment !== 'production' && !allowlist.size) throw new Error('A recipient allowlist is required outside production')
  const mailpitUrl = env('ROOMQC_MAILPIT_URL')?.trim() || 'http://supabase_inbucket_ehjtoajnlnuvuiwkpmbp:8025'
  const captureUrl = new URL(mailpitUrl)
  if (!['http:', 'https:'].includes(captureUrl.protocol) || captureUrl.username || captureUrl.password) throw new Error('Invalid mail capture URL')
  return { provider, environment, publicUrl: url.origin, fromEmail, fromName, replyTo, apiKey, allowlist, mailpitUrl: captureUrl.origin }
}

export function validEmail(value: string): boolean {
  return value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value) && !/[\r\n]/.test(value)
}

export function assertRecipient(config: EmailConfig, email: string) {
  if (!validEmail(email)) throw new Error('Invalid recipient')
  if (config.provider === 'resend' && config.environment !== 'production' && !config.allowlist.has(email.toLowerCase())) {
    throw new Error('Recipient is outside the test allowlist')
  }
}

export function emailActionUrl(config: EmailConfig, path: string) {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\\r\n]/.test(path)) throw new Error('Invalid email destination')
  const url = new URL(path, config.publicUrl)
  if (url.origin !== config.publicUrl) throw new Error('Invalid email destination')
  return url.toString()
}
