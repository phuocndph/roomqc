// Recipe for the pinned Storage Node entry point, not Watt or a tenant fleet.
// Single-tenant here means one Supabase project; it can hold many RoomQC hotels.
const fail=code=>{throw Object.assign(new Error(code),{code})};
const processMismatch=()=>fail('RESOURCE_VENDOR_PROCESS_MISMATCH');
const unbounded=()=>fail('RESOURCE_VENDOR_POOL_UNBOUNDED');
const imagePath='/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const reviewedKeys=new Set([
  'DATABASE_URL','DATABASE_ENGINE','DATABASE_MAX_CONNECTIONS','DATABASE_APPLICATION_NAME','DATABASE_CONNECTION_TIMEOUT',
  'DATABASE_FREE_POOL_AFTER_INACTIVITY','DATABASE_STATEMENT_TIMEOUT','DATABASE_SSL_ROOT_CERT',
  'DATABASE_TLS_SESSION_RESUMPTION','DATABASE_ENABLE_QUERY_CANCELLATION','DATABASE_HEALTHCHECK_UNSCOPED',
  'DATABASE_POOL_URL','DATABASE_MULTITENANT_URL','DATABASE_MULTITENANT_POOL_URL',
  'MULTITENANT_DATABASE_URL','MULTITENANT_DATABASE_POOL_URL','MULTI_TENANT','IS_MULTITENANT',
  'WORKERS_NUM','CLUSTER_DISCOVERY','PG_QUEUE_ENABLE','ENABLE_QUEUE_EVENTS','PG_QUEUE_WORKERS_ENABLE','PG_QUEUE_CONNECTION_URL',
  'VECTOR_ENABLED','VECTOR_STORE_MIGRATIONS_ENABLED','VECTOR_DATABASE_URL','VECTOR_BUCKET_PROVIDER',
  'VECTOR_DATABASE_CREATE','ICEBERG_ENABLED','STORAGE_BACKEND','FILE_STORAGE_BACKEND_PATH','NODE_ENV'
]);
export function storageResourcePlan(service,{image,environment,integer,configuredTarget}){
  const env=service.environment;
  if(!env||typeof env!=='object'||Array.isArray(env)||Object.values(env).some(v=>typeof v!=='string')
    ||service.image!==image||service.build!==undefined||service.env_file!==undefined||service.entrypoint!=null
    ||service.working_dir!=null&&service.working_dir!=='/app'||service.privileged||service.volumes_from||service.devices
    ||service.configs||service.use_api_socket||service.post_start||service.pre_stop
    ||(service.secrets?.length??0)>0||(service.tmpfs?.length??0)>0)processMismatch();
  if(![null,['node','dist/start/server.js']].some(v=>JSON.stringify(v)===JSON.stringify(service.command??null)))processMismatch();
  for(const [key,value] of Object.entries(env)){
    if(key==='PATH'&&value!==imagePath)processMismatch();
    if(/^(?:DATABASE_|DB_SEARCH_PATH$|MULTITENANT_|MULTI_TENANT$|IS_MULTITENANT$|PG|VECTOR_|ICEBERG_|WORKERS_|CLUSTER_|NODE_|LD_|DYLD_|BASH_ENV$|ENV$)/.test(key)
      &&!reviewedKeys.has(key)&&value)processMismatch();
  }
  // Keep every enable/alias explicit. Empty primary aliases fall through in the
  // vendor config parser, so checking only the preferred name is insufficient.
  for(const key of ['MULTI_TENANT','IS_MULTITENANT','PG_QUEUE_ENABLE','ENABLE_QUEUE_EVENTS','PG_QUEUE_WORKERS_ENABLE',
    'VECTOR_ENABLED','VECTOR_STORE_MIGRATIONS_ENABLED','ICEBERG_ENABLED','DATABASE_ENABLE_QUERY_CANCELLATION',
    'DATABASE_TLS_SESSION_RESUMPTION'])if(env[key]!=='false')unbounded();
  if(env.WORKERS_NUM!=='1'||env.DATABASE_ENGINE!=='postgres')unbounded();
  for(const key of ['DATABASE_POOL_URL','DATABASE_MULTITENANT_URL','DATABASE_MULTITENANT_POOL_URL',
    'MULTITENANT_DATABASE_URL','MULTITENANT_DATABASE_POOL_URL','PG_QUEUE_CONNECTION_URL','VECTOR_DATABASE_URL','CLUSTER_DISCOVERY'])
    if(env[key])unbounded();
  if(env.STORAGE_BACKEND!=='file'||env.FILE_STORAGE_BACKEND_PATH!=='/var/lib/storage')processMismatch();
  const mounts=service.volumes??[];
  if(!Array.isArray(mounts)||mounts.length!==1)processMismatch();
  const mount=mounts[0];
  if(!mount||mount.target!=='/var/lib/storage'||!['bind','volume'].includes(mount.type)
    ||typeof mount.source!=='string'||!mount.source||mount.read_only||mount.volume?.subpath
    ||mount.bind?.propagation&&!['rprivate','private'].includes(mount.bind.propagation))processMismatch();
  const max=integer(env,'DATABASE_MAX_CONNECTIONS');
  return {consumerId:'storage',pools:[{id:'main',max}],fixedConnectionsPerReplica:2,
    configuredTargetSha256:configuredTarget(env.DATABASE_URL,environment),
    components:[{id:'tenant-main',kind:'pool',max},{id:'pubsub',kind:'listener',max:1},
      {id:'startup-migration',kind:'startup-client',max:1}],
    steadyStatePlannedConnections:max+1,startupConnectionsReserved:1,
    connectionBoundScope:'configured-client-allocation',
    limitations:['Startup migration precedes HTTP and pubsub; its one connection is reserved conservatively alongside steady state.',
      'pg-listen reconnect does not await the old client end. Retiring/server-side sessions, network faults and rolling overlap require runtime/server inventory; this is not a hard server-session ceiling.']};
}
