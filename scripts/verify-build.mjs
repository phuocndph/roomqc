import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { loadEnvFile } from 'node:process'
import { join } from 'node:path'

const distDir = 'dist'
const mode = (process.env.ROOMQC_ENVIRONMENT || 'local').trim().toLowerCase()
if (!process.env.VITE_SUPABASE_URL) {
  const envFile = mode === 'vps' ? '.env.vps' : '.env'
  if (existsSync(envFile)) loadEnvFile(envFile)
}
const supabaseUrl = (process.env.VITE_SUPABASE_URL || '').trim()

function collectFiles(directory) {
  const files = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...collectFiles(path))
    else if (/\.(?:html|js|css|json|webmanifest)$/i.test(entry.name)) files.push(path)
  }
  return files
}

if (!statSync(distDir, { throwIfNoEntry: false })) {
  console.error(`Build verification failed: ${distDir} does not exist`)
  process.exit(1)
}

const files = collectFiles(distDir)
const bundle = files.map((file) => readFileSync(file, 'utf8')).join('\n')
const indexHtml = readFileSync(join(distDir, 'index.html'), 'utf8')
const errors = []

if (!supabaseUrl) errors.push('VITE_SUPABASE_URL is missing during build verification')
else {
  const supabaseOrigin = new URL(supabaseUrl).origin
  if (!bundle.includes(supabaseUrl)) errors.push('The Supabase URL was not embedded in the production bundle')
  if (!indexHtml.includes(supabaseOrigin)) errors.push('index.html does not contain the configured Supabase origin')
}

if (/replace_with_/i.test(bundle)) errors.push('The production bundle contains an environment placeholder')

if (mode === 'vps') {
  if (/(?:localhost|127\.0\.0\.1|\[::1\]):5432[12]\b/i.test(bundle)) {
    errors.push('VPS bundle contains a local Supabase URL')
  }
  if (/demoDataEnabled\s*:\s*(?:true|!0)/i.test(bundle)) {
    errors.push('VPS bundle appears to enable demo data')
  }
}

if (errors.length) {
  console.error('Build verification failed:')
  errors.forEach((error) => console.error(`- ${error}`))
  process.exit(1)
}

console.log(`Build verified for ${mode} (${files.length} web assets)`)
