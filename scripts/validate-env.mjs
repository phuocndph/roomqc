import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

// Make the command useful when run directly from a checkout. Docker Compose
// still injects build args explicitly, so existing process variables win.
const requestedEnvFile = process.env.ROOMQC_ENV_FILE
const defaultEnvFile = process.env.ROOMQC_ENVIRONMENT === 'vps'
  ? '.env.vps'
  : (existsSync('.env') ? '.env' : '.env.vps')
const envCandidates = requestedEnvFile
  ? [requestedEnvFile]
  : [defaultEnvFile]
for (const envFile of envCandidates) {
  if (!existsSync(envFile)) continue
  try {
    loadEnvFile(envFile)
  } catch (error) {
    console.warn(`Could not load ${envFile}:`, error instanceof Error ? error.message : error)
  }
}

const mode = (process.env.ROOMQC_ENVIRONMENT || 'local').trim().toLowerCase()
const required = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'VITE_SUPABASE_PROJECT_ID',
  'VITE_VAPID_PUBLIC_KEY',
]

const errors = []
for (const name of required) {
  const value = (process.env[name] || '').trim()
  if (!value) errors.push(`${name} is required`)
  if (/replace_with_/i.test(value)) errors.push(`${name} still contains a placeholder`)
}

const urlValue = (process.env.VITE_SUPABASE_URL || '').trim()
if (urlValue) {
  try {
    const url = new URL(urlValue)
    if (!['http:', 'https:'].includes(url.protocol)) {
      errors.push('VITE_SUPABASE_URL must use http:// or https://')
    }
    const localHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname)
    if (mode === 'vps' && (!urlValue.startsWith('https://') || localHost)) {
      errors.push('VPS builds require a public HTTPS VITE_SUPABASE_URL')
    }
  } catch {
    errors.push('VITE_SUPABASE_URL must be a valid absolute URL')
  }
}

const publishableKey = (process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
function isServiceRoleKey(value) {
  if (/^(sb_secret_|service_role)/i.test(value) || /service_role/i.test(value)) return true

  const parts = value.split('.')
  if (parts.length !== 3) return false

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    return payload.role === 'service_role'
  } catch {
    return false
  }
}

if (isServiceRoleKey(publishableKey)) {
  errors.push('VITE_SUPABASE_PUBLISHABLE_KEY must not be a service-role/secret key')
}

const vapidPublicKey = (process.env.VITE_VAPID_PUBLIC_KEY || '').trim()
if (vapidPublicKey && !/replace_with_/i.test(vapidPublicKey)) {
  try {
    const decoded = Buffer.from(vapidPublicKey, 'base64url')
    if (decoded.length !== 65 || decoded[0] !== 0x04) {
      errors.push('VITE_VAPID_PUBLIC_KEY must be an uncompressed P-256 public key')
    }
  } catch {
    errors.push('VITE_VAPID_PUBLIC_KEY must be valid base64url')
  }
}

const demoDataEnabled = (process.env.VITE_ENABLE_DEMO_DATA || '').trim().toLowerCase()
if (demoDataEnabled && !['true', 'false'].includes(demoDataEnabled)) {
  errors.push('VITE_ENABLE_DEMO_DATA must be true or false when provided')
}
if (mode === 'vps' && demoDataEnabled === 'true') {
  errors.push('VITE_ENABLE_DEMO_DATA must be false or unset for VPS builds')
}

if (errors.length > 0) {
  console.error('Environment validation failed:')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Environment validated for ${mode} build`)
