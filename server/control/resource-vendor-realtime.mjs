// Inventory for the pinned Realtime release. These components deliberately do
// not turn a metadata pool setting into a bound for the whole service.
const fail=code=>{throw Object.assign(new Error(code),{code})};
const mismatch=()=>fail('RESOURCE_VENDOR_PROCESS_MISMATCH');
const unbounded=()=>fail('RESOURCE_VENDOR_POOL_UNBOUNDED');
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const positive=(value,fallback)=>{
  if(value===undefined||value===null||value===false)return fallback;
  if(!Number.isSafeInteger(value)||value<1||value>10000)unbounded();return value;
};
const envInteger=(env,key,fallback)=>{
  if(env[key]===undefined)return fallback;
  if(typeof env[key]!=='string'||!/^[1-9][0-9]{0,4}$/.test(env[key]))unbounded();
  return positive(Number(env[key]));
};
const boolean=(env,key,fallback)=>{
  if(env[key]===undefined)return fallback;
  if(!['true','false'].includes(env[key]))unbounded();return env[key]==='true';
};

/** Only pass persisted postgres_cdc_rls settings here, not Compose seed values.
 * Credential fields may be present in the input but are never returned. */
export function realtimeTenantResourceComponents(settings){
  if(!object(settings))unbounded();
  const connect=positive(settings.db_pool,1);
  // This spelling is the actual stored key in v2.143.3. The public API maps
  // postgres_changes_pool to it; SubscriptionManager overrides subs_pool_size.
  const subscribers=Object.hasOwn(settings,'subcriber_pool_size')?positive(settings.subcriber_pool_size,1):4;
  const guardSubscribers=positive(settings.subs_pool_size,1),guardTotal=connect+guardSubscribers+8;
  const components=[
    {id:'connect',applicationName:'realtime_connect',kind:'client-pool',max:connect},
    {id:'subscription-manager',applicationName:'realtime_subscription_manager',kind:'client-pool',max:1},
    {id:'subscriptions',applicationName:'realtime_subscription_manager_pub',kind:'client-pool',max:subscribers},
    {id:'rls-poller',applicationName:'realtime_rls',kind:'client-pool',max:1},
    {id:'broadcast-replication',applicationName:'realtime_replication_connection',kind:'replication-session',max:1}
  ];
  return {scope:'one-tenant-process-tree-with-all-data-paths-active',components,
    configuredClientConnections:connect+subscribers+2,configuredReplicationSessions:1,
    configuredSessions:connect+subscribers+3,
    vendorReadinessEstimate:{subscriberPoolMax:guardSubscribers,rawSessionEstimate:guardTotal,
      requirement:Math.ceil(guardTotal*0.95),comparison:'available-must-be-strictly-greater-than-requirement',
      subscriberInputMatchesActual:guardSubscribers===subscribers,wholeStackAdmissionVerified:false},
    transientComponents:[{id:'connect-probe',maxPerOperation:1},{id:'tenant-migration',maxPerOperation:2},
      {id:'janitor',maxPerOperation:1},{id:'slot-teardown',maxPerOperation:1},{id:'dashboard-query',maxPerOperation:1},
      {id:'dashboard-pgdelta-pool',maxPerPool:5,globalConcurrencyBoundVerified:false}],
    dedicatedHealthConnections:0,healthUsesExistingConnectPool:true,
    tenantTlsPolicy:settings.ssl_enforced===false?'disabled':'verify-none',
    tenantTlsPeerVerified:false,globalConcurrencyBoundVerified:false,
    limitations:['Only persisted tenant settings describe tenant pools; Compose DB_POOL_SIZE describes metadata.',
      'The vendor tenant health endpoint reuses Connect; the unused health pool helper is not an additional running consumer.',
      'The vendor readiness helper reads subs_pool_size while the running subscription manager reads subcriber_pool_size; they can disagree.',
      'Process trees may overlap across nodes/restarts; transient operations, slots/WAL, external dashboard tools and retiring sessions require separate inventory.']};
}

export function realtimeResourceInventory(service,{image,managedBootstrapVerified=false}){
  if(typeof managedBootstrapVerified!=='boolean')mismatch();
  const env=service.environment;
  if(!object(env)||Object.values(env).some(v=>typeof v!=='string')||service.image!==image
    ||service.build!==undefined||service.env_file!==undefined||service.entrypoint!=null
    ||service.working_dir!=null&&service.working_dir!=='/app'||service.privileged||service.volumes_from
    ||service.devices||service.configs||service.use_api_socket||service.post_start||service.pre_stop
    ||(service.secrets?.length??0)>0||(service.tmpfs?.length??0)>0)mismatch();
  const caMounts=service.volumes??[];
  if(!Array.isArray(caMounts)||caMounts.length>1||caMounts.length&&(!managedBootstrapVerified
    ||!caMounts.every(m=>object(m)&&['bind','volume'].includes(m.type)&&typeof m.source==='string'&&m.source.length>0
      &&m.target==='/run/roomqc-ca'&&m.read_only===true)))mismatch();
  if(![null,['/app/bin/server']].some(v=>JSON.stringify(v)===JSON.stringify(service.command??null)))mismatch();
  for(const [key,value]of Object.entries(env)){
    if(!value)continue;
    if(/^(?:LD_|DYLD_|BASH_ENV$|ENV$|ELIXIR_|RELEASE_|MIX_)/.test(key)
      ||key.startsWith('ERL_')&&!['ERL_AFLAGS','ERL_FLAGS'].includes(key))mismatch();
    if(key==='ERL_AFLAGS'&&!['-proto_dist inet_tcp','-proto_dist inet6_tcp'].includes(value))mismatch();
    if(key==='ERL_FLAGS'&&!/^\+S [1-9][0-9]?:[1-9][0-9]?$/.test(value))mismatch();
  }
  const primaryPoolMax=envInteger(env,'DB_POOL_SIZE',5),replicaPoolMax=envInteger(env,'DB_REPLICA_POOL_SIZE',5);
  const region=env.REGION??'local',master=env.DB_MASTER_REGION??region;
  const runJanitor=boolean(env,'RUN_JANITOR',false),reseed=boolean(env,'SEED_SELF_HOST',false);
  if(managedBootstrapVerified){
    if(!reseed)mismatch();
    envInteger(env,'ROOMQC_REALTIME_CONNECT_POOL',1);envInteger(env,'ROOMQC_REALTIME_SUBSCRIBER_POOL',4);
  }
  boolean(env,'DB_SSL',false);
  const tenantTlsConfigured=managedBootstrapVerified&&env.DB_SSL==='true'&&env.DB_SSL_CA_CERT==='/run/roomqc-ca/ca.crt'&&caMounts.length===1;
  return {scope:'partial-configured-inventory',metadata:{primaryPoolMax,readReplicaPoolMax:replicaPoolMax,
      activePoolMax:master===region?primaryPoolMax:null,activeRepoSelectionVerified:master===region,
      configuredRepoCountIsNotRunningRepoCount:true},
    discovery:{strategies:(env.CLUSTER_STRATEGIES??'POSTGRES').split(',').map(s=>['DNS','EPMD','POSTGRES'].includes(s)?s:'unreviewed'),
      serverSessions:null,dependencyRuntimeInventoryRequired:true},
    scheduledMaintenance:{enabled:runJanitor,maxConcurrentTasks:runJanitor?envInteger(env,'JANITOR_MAX_CHILDREN',5):0,
      maxConnectionsPerTask:1,globalSessionCeilingVerified:false},
    startup:{metadataMigrationSessions:null,selfHostReseedEnabled:reseed,
      seedImplementation:managedBootstrapVerified?'roomqc-preserve-existing':'upstream-destructive',
      storedTenantOverridesSurviveReseed:managedBootstrapVerified?true:reseed?false:null,tenantMigrationsAndJanitorCanRunDuringSeed:reseed,
      bootstrapSessionAdvisoryLockImplemented:managedBootstrapVerified,globalBootstrapConcurrencyBoundVerified:false},
    tenantSettingsSource:'persisted-postgres-cdc-rls-extension-rows',tenantCount:null,tenantSettingsObserved:false,
    healthUsesExistingConnectPool:true,tenantTlsPeerVerificationSupportedByReviewedPath:tenantTlsConfigured,
    plannedServerConnections:null,poolPlanVerified:false,capacityProven:false,
    unresolvedReasons:['persisted_tenant_targets_settings_and_active_process_trees_not_observed',
      'discovery_migration_dashboard_teardown_and_retiring_sessions_not_globally_bound',
      'replication_slots_wal_and_cross_node_overlap_not_bound',
      ...(!tenantTlsConfigured?[managedBootstrapVerified?'tenant_tls_peer_verification_not_configured':'tenant_tls_uses_verify_none_when_enabled']:[]),
      ...(!managedBootstrapVerified?['vendor_readiness_and_actual_subscriber_pools_use_different_stored_keys']:[]),
      ...(env.DB_AFTER_CONNECT_QUERY&&!/^SET search_path (?:TO|=) _realtime;?$/i.test(env.DB_AFTER_CONNECT_QUERY)
        ?['metadata_after_connect_sql_not_reviewed']:[]),
      ...(reseed&&!managedBootstrapVerified?['self_host_seed_deletes_and_recreates_existing_tenant']:[])]};
}
