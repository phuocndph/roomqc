import {createHash} from 'node:crypto';
import {isAbsolute} from 'node:path';
import {isIP} from 'node:net';
import {checkServerIdentity} from 'node:tls';
import pg from 'pg';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{0,63}$/.test(v);
const hash=v=>createHash('sha256').update(v).digest('hex');
const decimal=(v,max)=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v)&&BigInt(v)<=max;
const name=v=>typeof v==='string'&&Buffer.byteLength(v)>0&&Buffer.byteLength(v)<=63&&!/[\x00-\x1f\x7f]/.test(v);
const invalid=()=>fail('RESOURCE_DATABASE_MANIFEST_INVALID');

/** Explicit target identities. DSNs are separate restricted files, never report data. */
export function resourceDatabaseManifest(raw){
  if(!exact(raw,['schemaVersion','environment','budgetFile','budgetSha256','databases'])||raw.schemaVersion!==1
    ||!['local','staging','production'].includes(raw.environment)||typeof raw.budgetFile!=='string'||!isAbsolute(raw.budgetFile)
    ||!/^[a-f0-9]{64}$/.test(raw.budgetSha256??'')||!Array.isArray(raw.databases)||raw.databases.length<2||raw.databases.length>32)invalid();
  const ids=new Set(),files=new Set();
  for(const d of raw.databases){
    if(!exact(d,['databaseId','dsnFile','expected'])||!id(d.databaseId)||ids.has(d.databaseId)
      ||typeof d.dsnFile!=='string'||!isAbsolute(d.dsnFile)||files.has(d.dsnFile)
      ||!exact(d.expected,['systemIdentifier','databaseOid','databaseName','role'])
      ||!decimal(d.expected.systemIdentifier,18446744073709551615n)||!decimal(d.expected.databaseOid,4294967295n)
      ||!name(d.expected.databaseName)||!name(d.expected.role))invalid();
    ids.add(d.databaseId);files.add(d.dsnFile);
  }
  return structuredClone(raw);
}

/** Build every pg field explicitly: PG* environment and URL options cannot select a target or inject SQL. */
export function resourceDatabaseConnection(secret,entry,environment){
  let u,user,password,database;
  try{
    if(typeof secret!=='string'||Buffer.byteLength(secret)>8192)throw new Error();
    u=new URL(secret.trim());user=decodeURIComponent(u.username);password=decodeURIComponent(u.password);database=decodeURIComponent(u.pathname.slice(1));
  }catch{fail('RESOURCE_DATABASE_DSN_INVALID')}
  const sslmode=u.searchParams.get('sslmode'),local=environment==='local';
  if(!['postgres:','postgresql:'].includes(u.protocol)||!u.hostname||!user||!password||!database||u.hash
    ||user!==entry.expected.role||database!==entry.expected.databaseName
    ||[...u.searchParams.keys()].some(k=>k!=='sslmode')||u.searchParams.getAll('sslmode').length!==1
    ||(!local&&sslmode!=='verify-full')||(local&&!['disable','verify-full'].includes(sslmode))
    ||(local&&!['127.0.0.1','localhost','[::1]','host.docker.internal'].includes(u.hostname))
    ||/[\x00-\x1f\x7f]/.test(user+password+database))fail('RESOURCE_DATABASE_DSN_INVALID');
  const port=u.port?Number(u.port):5432;
  if(!Number.isInteger(port)||port<1||port>65535)fail('RESOURCE_DATABASE_DSN_INVALID');
  const host=u.hostname.replace(/^\[|\]$/g,'');
  return {host,port,user,password,database,ssl:sslmode==='verify-full'?{rejectUnauthorized:true,
      ...(isIP(host)?{}:{servername:host}),checkServerIdentity:(_name,cert)=>checkServerIdentity(host,cert)}:false,
    options:'-c default_transaction_read_only=on -c search_path=pg_catalog -c timezone=UTC -c datestyle=ISO,YMD',
    replication:'false',sslnegotiation:'postgres',client_encoding:'UTF8',
    application_name:'roomqc-resource-attestor',connectionTimeoutMillis:4000,query_timeout:4000,statement_timeout:3000,lock_timeout:1000,
    idle_in_transaction_session_timeout:5000,keepAlive:false};
}

// Closed, catalog-only projection. The caller cannot supply SQL or session options.
const identitySql=`SELECT c.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",
  pg_catalog.current_database() AS "databaseName",current_user::text AS "role",session_user::text AS "sessionRole",
  pg_catalog.current_setting('max_connections')::integer AS "maxConnections",
  (pg_catalog.current_setting('superuser_reserved_connections')::integer
    +coalesce(pg_catalog.current_setting('reserved_connections',true),'0')::integer) AS "reservedConnections",
  pg_catalog.pg_is_in_recovery() AS "inRecovery",pg_catalog.pg_postmaster_start_time()::text AS "postmasterStartedAt",
  (pg_catalog.current_setting('transaction_read_only')='on') AS "readOnly",
  r.rolsuper AS "superuser",r.rolcreatedb AS "createDatabase",r.rolcreaterole AS "createRole",
  r.rolreplication AS "replication",r.rolbypassrls AS "bypassRls",r.rolcanlogin AS "canLogin",r.rolconnlimit AS "roleConnectionLimit",
  (SELECT count(*)::integer FROM pg_catalog.pg_auth_members m WHERE m.member=r.oid) AS "memberships"
 FROM pg_catalog.pg_control_system() c
 JOIN pg_catalog.pg_database d ON d.datname=pg_catalog.current_database()
 JOIN pg_catalog.pg_roles r ON r.rolname=current_user`;

export async function readResourceDatabaseCatalog(client){
  const result=await client.query(identitySql);
  if(result.rows.length!==1)fail('RESOURCE_DATABASE_OBSERVATION_INVALID');
  return result.rows[0];
}
export function resourceDatabaseObservationDigests(o){
  const canonical=v=>JSON.stringify(v,(_k,item)=>item&&typeof item==='object'&&!Array.isArray(item)
    ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  return {roleSha256:hash(o.role),lineageSha256:hash(o.systemIdentifier),
    databaseIdentitySha256:hash(canonical({systemIdentifier:o.systemIdentifier,databaseOid:o.databaseOid,databaseName:o.databaseName})),
    serverSettingsSha256:hash(canonical({systemIdentifier:o.systemIdentifier,maxConnections:o.maxConnections,
      reservedConnections:o.reservedConnections,postmasterStartedAt:o.postmasterStartedAt}))};
}

async function bounded(operation,client){
  let timer;
  try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>{
    client.connection?.stream?.destroy();reject(Object.assign(new Error('RESOURCE_DATABASE_TIMEOUT'),{code:'RESOURCE_DATABASE_TIMEOUT'}));
  },5000)})])}finally{clearTimeout(timer)}
}
export async function readResourceDatabaseTarget(config){
  const client=new pg.Client(config);client.on('error',()=>{});
  try{
    await bounded(()=>client.connect(),client);
    await bounded(()=>client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'),client);
    const observed=await bounded(()=>readResourceDatabaseCatalog(client),client);
    await bounded(()=>client.query('ROLLBACK'),client);return observed;
  }catch{fail('RESOURCE_DATABASE_READ_FAILED')}
  finally{try{await bounded(()=>client.end(),client)}catch{fail('RESOURCE_DATABASE_CLOSE_FAILED')}}
}

const observedKeys=['systemIdentifier','databaseOid','databaseName','role','sessionRole','maxConnections','reservedConnections',
  'inRecovery','postmasterStartedAt','readOnly','superuser','createDatabase','createRole','replication','bypassRls','canLogin','roleConnectionLimit','memberships'];
export function validateResourceDatabaseObservation(o,entry,database,{application=false}={}){
  if(!exact(o,observedKeys)||!decimal(o.systemIdentifier,18446744073709551615n)||!decimal(o.databaseOid,4294967295n)
    ||!name(o.databaseName)||!name(o.role)||!name(o.sessionRole)||typeof o.postmasterStartedAt!=='string'||o.postmasterStartedAt.length>64||!Number.isFinite(Date.parse(o.postmasterStartedAt))
    ||!Number.isSafeInteger(o.maxConnections)||o.maxConnections<5||o.maxConnections>1000000
    ||!Number.isSafeInteger(o.reservedConnections)||o.reservedConnections<0||o.reservedConnections>=o.maxConnections
    ||['inRecovery','readOnly','superuser','createDatabase','createRole','replication','bypassRls','canLogin'].some(k=>typeof o[k]!=='boolean')
    ||!Number.isSafeInteger(o.memberships)||o.memberships<0||o.memberships>1024||!Number.isSafeInteger(o.roleConnectionLimit)
    ||o.roleConnectionLimit< -1||o.roleConnectionLimit>2147483647)fail('RESOURCE_DATABASE_OBSERVATION_INVALID');
  if(Object.entries(entry.expected).some(([k,v])=>o[k]!==v)||o.sessionRole!==entry.expected.role||o.inRecovery)fail('RESOURCE_DATABASE_IDENTITY_MISMATCH');
  if(!o.readOnly||!o.canLogin||['superuser','createDatabase','createRole','replication','bypassRls'].some(k=>o[k])
    ||(!application&&(o.memberships!==0||o.roleConnectionLimit!==1))||(application&&o.roleConnectionLimit===0))fail('RESOURCE_DATABASE_ROLE_MISMATCH');
  if(database.maxConnections>o.maxConnections||database.reservedConnections<o.reservedConnections)fail('RESOURCE_DATABASE_SETTINGS_MISMATCH');
}
const checkObservation=validateResourceDatabaseObservation;

/** system_identifier identifies a lineage, not a unique physical host. Group identical
 * lineages conservatively, rejecting clones/replicas rather than double-counting capacity. */
export function accountResourceDatabaseServers(budget,entries,observations){
  const groups=new Map(),identities=new Set();
  for(const d of budget.databases){
    const entry=entries.find(e=>e.databaseId===d.id),o=observations.get(d.id);
    if(!entry||!o)fail('RESOURCE_DATABASE_MAPPING_MISMATCH');checkObservation(o,entry,d);
    const identity=o.systemIdentifier+'/'+o.databaseOid;
    if(identities.has(identity))fail('RESOURCE_DATABASE_DUPLICATE_TARGET');identities.add(identity);
    let group=groups.get(o.systemIdentifier);
    if(!group){group={lineageSha256:hash(o.systemIdentifier),databaseIds:[],observedMaxConnections:o.maxConnections,observedReservedConnections:o.reservedConnections,
      postmasterStartedAt:o.postmasterStartedAt,budgetMaxConnections:d.maxConnections,reservedConnections:d.reservedConnections,allocatedConnections:0};groups.set(o.systemIdentifier,group)}
    if(group.observedMaxConnections!==o.maxConnections||group.observedReservedConnections!==o.reservedConnections||group.postmasterStartedAt!==o.postmasterStartedAt)
      fail('RESOURCE_DATABASE_LINEAGE_AMBIGUOUS');
    group.databaseIds.push(d.id);group.budgetMaxConnections=Math.min(group.budgetMaxConnections,d.maxConnections);
    group.reservedConnections=Math.max(group.reservedConnections,d.reservedConnections);group.allocatedConnections+=d.allocatedConnections;
  }
  return [...groups.values()].map(({postmasterStartedAt,...g})=>{
    const committedConnections=g.allocatedConnections+g.reservedConnections;
    if(committedConnections>g.budgetMaxConnections)fail('RESOURCE_DATABASE_SERVER_OVERCOMMITTED');
    return {...g,committedConnections,remainingConnections:g.budgetMaxConnections-committedConnections};
  });
}

export async function attestResourceDatabases(raw,{readTarget=readResourceDatabaseTarget,readSecret=path=>boundedHealthFile(path,8192,{sensitive:true})}={}){
  const manifest=resourceDatabaseManifest(raw),snapshot=loadResourceBudgetSnapshot(manifest.budgetFile),budget=snapshot.budget;
  if(snapshot.sha256!==manifest.budgetSha256)fail('RESOURCE_DATABASE_PROFILE_MISMATCH');
  if(manifest.environment==='local'?!['local','example'].includes(budget.environment):budget.environment!==manifest.environment)
    fail('RESOURCE_DATABASE_ENVIRONMENT_MISMATCH');
  if(manifest.databases.length!==budget.databases.length||budget.databases.some(d=>!manifest.databases.some(e=>e.databaseId===d.id)))
    fail('RESOURCE_DATABASE_MAPPING_MISMATCH');
  // The checker itself uses a real session. It must fit the same budget.
  for(const d of budget.databases){
    const c=d.consumers.find(c=>c.id==='resource-attestor');
    if(!c||c.replicas!==1||c.pools.length!==1||c.pools[0].max!==1||c.fixedConnectionsPerReplica!==0)fail('RESOURCE_DATABASE_ATTESTOR_UNACCOUNTED');
  }
  const connections=new Map(),secretHashes=new Map(),first=new Map();
  // Validate every file/DSN before the first connection. Never print a secret or pg Error.
  for(const entry of manifest.databases){
    let secret;try{secret=await readSecret(entry.dsnFile)}catch{fail('RESOURCE_DATABASE_SECRET_INVALID')}
    connections.set(entry.databaseId,resourceDatabaseConnection(secret,entry,manifest.environment));secretHashes.set(entry.databaseId,hash(secret));
  }
  for(let pass=0;pass<2;pass++)for(const entry of manifest.databases){
    let o;try{o=await readTarget(connections.get(entry.databaseId))}catch{fail('RESOURCE_DATABASE_READ_FAILED')}
    checkObservation(o,entry,budget.databases.find(d=>d.id===entry.databaseId));
    if(pass===0)first.set(entry.databaseId,o);
    else if(JSON.stringify(o)!==JSON.stringify(first.get(entry.databaseId)))fail('RESOURCE_DATABASE_OBSERVATION_DRIFT');
  }
  const servers=accountResourceDatabaseServers(budget,manifest.databases,first);
  for(const entry of manifest.databases){
    let secret;try{secret=await readSecret(entry.dsnFile)}catch{fail('RESOURCE_DATABASE_SECRET_INVALID')}
    if(hash(secret)!==secretHashes.get(entry.databaseId))fail('RESOURCE_DATABASE_SECRET_DRIFT');
  }
  if(loadResourceBudgetSnapshot(manifest.budgetFile).sha256!==snapshot.sha256)fail('RESOURCE_DATABASE_PROFILE_MISMATCH');
  return {schemaVersion:1,mode:'database-targets',environment:manifest.environment,budgetSha256:snapshot.sha256,
    databaseTargetsVerified:true,observedServerBudgetsVerified:true,servers,observationsPerDatabase:2,maxSimultaneousAttestorConnections:1,
    targets:manifest.databases.map(e=>({databaseId:e.databaseId,...resourceDatabaseObservationDigests(first.get(e.databaseId))})),
    databaseIdentityVerified:false,runtimeVerified:false,capacityProven:false,deploymentReady:false,
    limitations:['Only explicitly mapped attestor endpoints were checked; native/vendor DSNs are not yet bound to these targets.',
      'system_identifier is a PostgreSQL lineage. Matching lineages are grouped conservatively; clones and standby capacity are not independently accepted.',
      'Connection maxima are configuration evidence, not current traffic, host resources, workload capacity or release acceptance.',
      'Two sequential observations can detect drift during this check; they do not guarantee stability after it.'],
    acceptance:{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false}};
}
