import { isIP } from 'node:net';

export function validateMobileEnvironment(env, { local = false } = {}) {
  function origin(name, raw = env[name]) {
    const value = String(raw || '').trim();
    if (!value) throw new Error(`Missing ${name}. Configure .env.mobile.local first.`);
    let url;
    try { url = new URL(value); } catch { throw new Error(`Invalid ${name}.`); }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash) throw new Error(`${name} must be an HTTP(S) origin without credentials, path or query.`);
    const host = url.hostname.toLowerCase();
    if (!local && (url.protocol !== 'https:' || isIP(host.replace(/^\[|\]$/g, ''))
      || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || !host.includes('.')
      || /(?:your-domain|example\.(?:com|org|net)|replace)/.test(host))) {
      throw new Error(`${name} must be a real public HTTPS domain for a release. Use --local only for internal testing.`);
    }
    if (local && ['localhost', '127.0.0.1', '[::1]'].includes(host)) {
      throw new Error(`${name} points to the phone itself. Use 10.0.2.2 for an Android emulator or the computer's LAN IP.`);
    }
    return url.origin;
  }
  const publicWebOrigin = origin('VITE_ROOMQC_PUBLIC_WEB_URL');
  const supabaseOrigin = origin('VITE_SUPABASE_URL');
  const key = String(env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  let role;
  try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()).role; } catch { /* publishable key */ }
  if (!key || /^sb_secret_|service_role/i.test(key) || role === 'service_role') throw new Error('Use a Supabase publishable/anon key, never an admin key.');
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !(key.split('.').length === 3 && role === 'anon')) {
    throw new Error('Use a Supabase publishable/anon key, never a user access token or an unknown key.');
  }
  if (!local && /replace|example|test|dummy/i.test(key)) throw new Error('Replace the placeholder publishable key before release.');
  const clusterOrigins = String(env.VITE_ROOMQC_CLUSTER_ORIGINS || supabaseOrigin).split(',')
    .map(value => origin('VITE_ROOMQC_CLUSTER_ORIGINS', value));
  if (!clusterOrigins.includes(supabaseOrigin)) throw new Error('Cluster allowlist must include VITE_SUPABASE_URL.');
  if (env.VITE_ENABLE_DEMO_DATA === 'true') throw new Error('Demo seeding must be disabled in the mobile app.');
  return { localDevelopment: local, publicWebOrigin, supabaseOrigin, clusterOrigins };
}
