export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const allowLocal = !production && env.ROOMQC_CONTROL_ALLOW_LOCAL === 'true';
  const publicOrigin = new URL(env.ROOMQC_PUBLIC_URL || 'http://localhost:8082').origin;
  if (production && !publicOrigin.startsWith('https://')) throw new Error('Production requires HTTPS');
  const emailKey = env.ROOMQC_CONTROL_EMAIL_HASH_KEY || '';
  if (emailKey.length < 32) throw new Error('ROOMQC_CONTROL_EMAIL_HASH_KEY needs at least 32 characters');
  const databaseUrl = env.ROOMQC_CONTROL_DATABASE_URL;
  if (!databaseUrl) throw new Error('ROOMQC_CONTROL_DATABASE_URL is required');
  if (production && new URL(databaseUrl).searchParams.get('sslmode') !== 'verify-full') throw new Error('Production control database requires sslmode=verify-full');
  const clusters = JSON.parse(env.ROOMQC_CONTROL_CLUSTERS || '[]');
  if (!Array.isArray(clusters) || clusters.length === 0) throw new Error('Configure at least one cluster');
  const ids = new Set();
  for (const cluster of clusters) {
    if (!/^[a-z][a-z0-9-]{1,39}$/.test(cluster.id) || ids.has(cluster.id)) throw new Error('Invalid cluster ID');
    ids.add(cluster.id);
    const url = new URL(cluster.url);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Cluster URL must be an origin');
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(allowLocal && loopback && url.protocol === 'http:')) throw new Error('Cluster URL requires HTTPS');
    if (!cluster.publishableKey || !cluster.serviceKey || !cluster.vapidPublicKey) throw new Error('Cluster credentials/VAPID are missing');
    let serviceRole=false;
    try { serviceRole=JSON.parse(Buffer.from(cluster.publishableKey.split('.')[1] || '', 'base64url').toString()).role==='service_role'; } catch { /* not a JWT */ }
    if (serviceRole || /^sb_secret_/.test(cluster.publishableKey) || cluster.publishableKey === cluster.serviceKey) throw new Error('Public key cannot be secret');
    if (!Number.isInteger(cluster.maxWorkspaces) || cluster.maxWorkspaces < 1) throw new Error('Invalid cluster capacity');
    cluster.url = url.origin;
  }
  if(new Set(clusters.map(c=>c.vapidPublicKey)).size!==1) throw new Error('Shared-origin clusters must use the same platform VAPID key');
  const supportClusterId = env.ROOMQC_CONTROL_SUPPORT_CLUSTER_ID || null;
  if (supportClusterId && !ids.has(supportClusterId)) throw new Error('Support authority must be a configured cluster');
  const boundedInteger=(name,fallback,min,max)=>{
    const value=Number(env[name] ?? fallback);
    if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);
    return value;
  };
  return { production, publicOrigin, emailKey, databaseUrl, clusters, supportClusterId,
    reservationMinutes:boundedInteger('ROOMQC_CONTROL_RESERVATION_MINUTES',1440,15,10080),
    signupHourLimit:boundedInteger('ROOMQC_CONTROL_SIGNUP_HOUR_LIMIT',100,1,10000),
    emailDayLimit:boundedInteger('ROOMQC_CONTROL_EMAIL_DAY_LIMIT',3,1,20),
    signupEnabled: env.ROOMQC_CONTROL_SIGNUP_ENABLED === 'true',
    host: env.ROOMQC_CONTROL_HOST || '127.0.0.1', port: boundedInteger('ROOMQC_CONTROL_PORT',8091,1,65535) };
}
