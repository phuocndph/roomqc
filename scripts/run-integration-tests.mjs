import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

// Keep the normal unit-test command portable and fast. This explicit runner
// fails with an actionable message instead of silently skipping RPC tests.
const requestedEnvFile = process.env.ROOMQC_ENV_FILE
const defaultEnvFile = process.env.ROOMQC_ENVIRONMENT === 'vps' ? '.env.vps' : '.env'
const envFile = requestedEnvFile || defaultEnvFile

if (existsSync(envFile)) {
  loadEnvFile(envFile)
}

const url = (process.env.SUPABASE_TEST_URL || process.env.VITE_SUPABASE_URL || '').trim()
const key = (process.env.SUPABASE_TEST_ANON_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim()
const localTenantId = '00000000-0000-0000-0000-000000000000'
const isLocalUrl = /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(url)
// The clean local schema always creates the system tenant with the nil UUID.
// Keep remote/VPS runs explicit so a test cannot silently target real data.
const tenantId = (process.env.SUPABASE_TEST_TENANT_ID || (isLocalUrl ? localTenantId : '')).trim()
const missing = []

if (!url) missing.push('SUPABASE_TEST_URL (or VITE_SUPABASE_URL)')
if (!key) missing.push('SUPABASE_TEST_ANON_KEY (or VITE_SUPABASE_PUBLISHABLE_KEY)')
if (!tenantId) missing.push('SUPABASE_TEST_TENANT_ID')

if (missing.length > 0) {
  console.error('Integration test configuration is incomplete:')
  missing.forEach((name) => console.error(`- ${name}`))
  console.error('Set the values in the environment or pass ROOMQC_ENV_FILE before running this command.')
  process.exit(1)
}

if (/replace_with_/i.test(url) || /replace_with_/i.test(key)) {
  console.error('Integration test configuration still contains a placeholder value.')
  process.exit(1)
}

if (/^(sb_secret_|service_role)/i.test(key) || /service_role/i.test(key)) {
  console.error('SUPABASE_TEST_ANON_KEY must be a publishable/anon key, not a service-role key.')
  process.exit(1)
}

try {
  const parsed = new URL(url)
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol')
} catch {
  console.error(`SUPABASE_TEST_URL is not a valid HTTP(S) URL: ${url}`)
  process.exit(1)
}

// The local SYSTEM_ADMIN tenant intentionally uses the nil UUID, so validate
// UUID shape without requiring a non-zero version/variant nibble.
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId)) {
  console.error(`SUPABASE_TEST_TENANT_ID is not a UUID: ${tenantId}`)
  process.exit(1)
}

const result = spawnSync(
  process.execPath,
  [
    resolve('node_modules/vitest/vitest.mjs'),
    'run',
    'src/test/critical-rpc-schema-guard.integration.test.ts',
    'src/test/laundry-batches-rpc.integration.test.ts',
  ],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      SUPABASE_TEST_URL: url,
      SUPABASE_TEST_ANON_KEY: key,
      SUPABASE_TEST_TENANT_ID: tenantId,
    },
  },
)

if (result.error) {
  console.error(`Could not start Vitest: ${result.error.message}`)
  process.exit(1)
}

process.exit(result.status ?? 1)
