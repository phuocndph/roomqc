import {registryConfiguration} from './registry.mjs';
import {loadReleaseValidationCatalog} from './release-validation.mjs';
import {resourceMode,loadRuntimeResourceContext,assertControlResources} from './resource-runtime.mjs';
import {boundedHealthFile,healthDatabaseUrl} from './workers/health-config.mjs';
import {readHostInventoryDocument} from './host-inventory.mjs';

export async function loadRuntimeConfig(env=process.env){
  let runtimeEnv=env;
  if(env.ROOMQC_CONTROL_INVENTORY_FILE!==undefined){
    const invalid=()=>Object.assign(new Error('CONTROL_INVENTORY_FILE_INVALID'),{code:'CONTROL_INVENTORY_FILE_INVALID'});
    if(env.ROOMQC_CONTROL_INVENTORY!==undefined||env.ROOMQC_CONTROL_CREDENTIALS!==undefined||!env.ROOMQC_CONTROL_INVENTORY_FILE)throw invalid();
    let document;
    try{document=await readHostInventoryDocument(env.ROOMQC_CONTROL_INVENTORY_FILE)}catch{throw invalid()}
    if(!document||document.version!==1||!Array.isArray(document.inventory)||!Array.isArray(document.credentials))throw invalid();
    runtimeEnv={...runtimeEnv,ROOMQC_CONTROL_INVENTORY:JSON.stringify(document.inventory),ROOMQC_CONTROL_CREDENTIALS:JSON.stringify(document.credentials)};
  }
  if(runtimeEnv.ROOMQC_CONTROL_DATABASE_URL_FILE===undefined)return loadConfig(runtimeEnv);
  const invalid=()=>Object.assign(new Error('CONTROL_DATABASE_SECRET_INVALID'),{code:'CONTROL_DATABASE_SECRET_INVALID'});
  if(runtimeEnv.ROOMQC_CONTROL_DATABASE_URL||!runtimeEnv.ROOMQC_CONTROL_DATABASE_URL_FILE
    ||runtimeEnv.NODE_TLS_REJECT_UNAUTHORIZED!==undefined&&runtimeEnv.NODE_TLS_REJECT_UNAUTHORIZED!=='1')throw invalid();
  let databaseUrl;
  try{
    databaseUrl=(await boundedHealthFile(runtimeEnv.ROOMQC_CONTROL_DATABASE_URL_FILE,8192,{sensitive:true})).trim();
    const {production}=resourceMode(runtimeEnv);
    healthDatabaseUrl(databaseUrl,{production,allowLocal:!production&&env.ROOMQC_CONTROL_ALLOW_LOCAL==='true'});
  }catch{throw invalid()}
  return loadConfig({...runtimeEnv,ROOMQC_CONTROL_DATABASE_URL:databaseUrl});
}
export function loadConfig(env = process.env) {
  const {production} = resourceMode(env);
  const allowLocal = !production && env.ROOMQC_CONTROL_ALLOW_LOCAL === 'true';
  const publicOrigin = new URL(env.ROOMQC_PUBLIC_URL || 'http://localhost:8082').origin;
  if (production && !publicOrigin.startsWith('https://')) throw new Error('Production requires HTTPS');
  const emailKey = env.ROOMQC_CONTROL_EMAIL_HASH_KEY || '';
  if (emailKey.length < 32) throw new Error('ROOMQC_CONTROL_EMAIL_HASH_KEY needs at least 32 characters');
  const databaseUrl = env.ROOMQC_CONTROL_DATABASE_URL;
  if (!databaseUrl) throw new Error('ROOMQC_CONTROL_DATABASE_URL is required');
  if (production && new URL(databaseUrl).searchParams.get('sslmode') !== 'verify-full') throw new Error('Production control database requires sslmode=verify-full');
  const migrationDatabaseUrl = env.ROOMQC_CONTROL_MIGRATION_DATABASE_URL || null;
  if (production && migrationDatabaseUrl && new URL(migrationDatabaseUrl).searchParams.get('sslmode') !== 'verify-full') throw new Error('Production migration database requires sslmode=verify-full');
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
    if (cluster.internalUrl) {
      const internal = new URL(cluster.internalUrl);
      if (internal.username || internal.password || internal.search || internal.hash || internal.pathname !== '/') throw new Error('Internal cluster URL must be an origin');
      if (internal.protocol !== 'https:' && !(allowLocal && ['localhost','127.0.0.1','[::1]','host.docker.internal'].includes(internal.hostname) && internal.protocol === 'http:')) throw new Error('Internal cluster URL requires HTTPS');
      cluster.internalUrl = internal.origin;
    }
  }
  if(new Set(clusters.map(c=>c.vapidPublicKey)).size!==1) throw new Error('Shared-origin clusters must use the same platform VAPID key');
  const supportClusterId = env.ROOMQC_CONTROL_SUPPORT_CLUSTER_ID || null;
  if (supportClusterId && !ids.has(supportClusterId)) throw new Error('Support authority must be a configured cluster');
  const boundedInteger=(name,fallback,min,max)=>{
    const value=Number(env[name] ?? fallback);
    if(!Number.isInteger(value)||value<min||value>max)throw new Error(`${name} must be an integer between ${min} and ${max}`);
    return value;
  };
  const poolMax=boundedInteger('ROOMQC_CONTROL_POOL_MAX',5,1,30);
  const poolBudget=boundedInteger('ROOMQC_CONTROL_POOL_BUDGET',20,2,1000000);
  if(poolMax>=poolBudget)throw new Error('Control pool must leave capacity for migrations, workers and monitoring');
  const apiInstances=boundedInteger('ROOMQC_CONTROL_API_INSTANCES',1,1,1024);
  const resourceContext=loadRuntimeResourceContext(env,{kind:'directory',legacyFile:env.ROOMQC_CONTROL_RESOURCE_BUDGET_FILE});
  const resources=resourceContext?.budget??null;
  assertControlResources({production,resourceContext,resourceBudget:resources,poolMax,poolBudget,apiInstances});
  const registry=registryConfiguration(env,clusters,allowLocal);
  const releaseValidation=loadReleaseValidationCatalog(env.ROOMQC_CONTROL_RELEASE_VALIDATION_FILE,{
    trustFile:env.ROOMQC_CONTROL_RELEASE_TRUST_FILE,
    maximumValidityMs:env.ROOMQC_CONTROL_RELEASE_APPROVAL_MAX_VALIDITY_MS===undefined?undefined:Number(env.ROOMQC_CONTROL_RELEASE_APPROVAL_MAX_VALIDITY_MS),
    requireMigrationReceipt:production||env.ROOMQC_CONTROL_REQUIRE_MIGRATION_RECEIPT==='true'});
  return { production, allowLocal, publicOrigin, emailKey, databaseUrl, migrationDatabaseUrl, clusters, supportClusterId,poolMax,poolBudget,apiInstances,resourceContext,resourceBudget:resources,...registry,releaseValidation,
    requestBudget:{maxActive:boundedInteger('ROOMQC_CONTROL_MAX_ACTIVE_REQUESTS',16,1,256),
      maxQueued:boundedInteger('ROOMQC_CONTROL_MAX_QUEUED_REQUESTS',32,0,1024),
      queueTimeoutMs:boundedInteger('ROOMQC_CONTROL_QUEUE_TIMEOUT_MS',1000,1,10000)},
    shutdownTimeoutMs:boundedInteger('ROOMQC_CONTROL_SHUTDOWN_TIMEOUT_MS',25000,100,60000),
    reservationMinutes:boundedInteger('ROOMQC_CONTROL_RESERVATION_MINUTES',1440,15,10080),
    signupHourLimit:boundedInteger('ROOMQC_CONTROL_SIGNUP_HOUR_LIMIT',100,1,10000),
    emailDayLimit:boundedInteger('ROOMQC_CONTROL_EMAIL_DAY_LIMIT',3,1,20),
    signupEnabled: env.ROOMQC_CONTROL_SIGNUP_ENABLED === 'true',
    setupDispatchEnabled: env.ROOMQC_CONTROL_SETUP_DISPATCH_ENABLED === 'true',
    host: env.ROOMQC_CONTROL_HOST || '127.0.0.1', port: boundedInteger('ROOMQC_CONTROL_PORT',8091,1,65535) };
}
