import {createHash} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {migrationManifest,verifyHistory} from './migrate.mjs';
import {dispatchMatches} from './setup-dispatch.mjs';

const invalid=()=>new ControlError(400,'INVALID_SETUP_BACKFILL','Thông tin đối soát dữ liệu cũ không hợp lệ.');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const uuid=value=>typeof value==='string'&&uuidPattern.test(value);
const clusterId=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{1,39}$/.test(value);
// Preserve PostgreSQL microseconds from jsonb. Rounding to JS milliseconds
// could hide a second update within the same millisecond from the CAS guard.
const timestamp=value=>{
  if(value===null||value===undefined)return null;
  if(value instanceof Date)return value.toISOString();
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw invalid();
  return value;
};
const fields={
  workspace:'id,cluster_id,owner_id,tenant_id,hotel_id,status,routing_version,created_at,updated_at',
  job:'id,workspace_id,state,attempts,lease_token,lease_until,expected_routing_version,dispatch_id,next_attempt_at,created_at,updated_at,max_attempts,deadline_at',
  dispatch:'id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256,terminal_state,tenant_id,hotel_id,created_at,settled_at',
  cluster:'id,api_url,status,credential_ref,host_id,inventory_ref',
  authority:'cluster_id,approval_id,epoch,row_version,state,updated_at',
  approval:'approval_id,cluster_id,epoch,envelope_digest,key_fingerprint,host_id,inventory_ref,environment,not_before_ms,expires_at_ms',
};
const tableColumns={schema_migrations:'version,checksum',workspaces:fields.workspace,provisioning_jobs:fields.job,
  setup_dispatches:fields.dispatch,clusters:fields.cluster,hosts:'id,environment',
  release_authority:fields.authority,release_approvals:fields.approval,release_key_revocations:'key_fingerprint'};
const project=(value,names)=>value?Object.fromEntries(names.split(',').map(k=>[k,
  k.endsWith('_at')||k.endsWith('_until')?timestamp(value[k]):value[k]??null])):null;

/** The hash guards a concrete DB snapshot; it is not an authorization token. */
export function setupBackfillFingerprint(snapshot){
  try{
    const out={version:1};for(const [key,names]of Object.entries(fields))out[key]=project(snapshot[key],names);
    out.environment=snapshot.environment??null;out.keyRevoked=snapshot.keyRevoked===true;
    return hash(out);
  }catch{throw invalid()}
}
const result=(group,reason,action)=>({group,reason,action});
export const setupBackfillGroups=Object.freeze(['active_valid','committed_pending','dispatch_pending','closed','legacy_unknown','conflict','unavailable']);
const receiptMatches=(w,r)=>r&&r.workspace_id===w.id&&r.owner_id===w.owner_id&&uuid(r.tenant_id)&&uuid(r.hotel_id)
  &&(!w.tenant_id||w.tenant_id===r.tenant_id)&&(!w.hotel_id||w.hotel_id===r.hotel_id);
const releaseAvailable=(s,now)=>{
  const {workspace:w,cluster:c,authority:a,approval:p}=s;
  return !!a&&!!p&&a.state==='active'&&a.approval_id===p.approval_id&&String(a.epoch)===String(p.epoch)
    &&p.cluster_id===w.cluster_id&&p.host_id===c.host_id&&p.inventory_ref===c.inventory_ref&&p.environment===s.environment
    &&s.keyRevoked!==true&&Number.isFinite(Number(p.not_before_ms))&&Number.isFinite(Number(p.expires_at_ms))
    &&now>=Number(p.not_before_ms)&&now<Number(p.expires_at_ms);
};

/** Pure classification. Remote observation must come from receipt(), never close(). */
export function classifySetupBackfill(snapshot,observation,{now=Date.now()}={}){
  const {workspace:w,job:j,dispatch:d,cluster:c}=snapshot??{};
  if(!w||!uuid(w.id)||!clusterId(w.cluster_id)||!Number.isSafeInteger(w.routing_version)||w.routing_version<1
    ||!Number.isFinite(now))throw invalid();
  if(!['provisioning','active'].includes(w.status))return result('legacy_unknown','SETUP_STATE_PROTECTED','manual_review');
  if(!uuid(w.owner_id))return result('legacy_unknown','SETUP_OWNER_UNKNOWN','manual_review');
  if(!c||c.id!==w.cluster_id||c.status==='offline')return result('unavailable','SETUP_CLUSTER_UNAVAILABLE','retry_later');
  if(j&&(j.workspace_id!==w.id||j.expected_routing_version!==w.routing_version))return result('conflict','SETUP_JOB_IDENTITY_CONFLICT','manual_review');
  if(d&&(!uuid(d.id)||!/^[a-f0-9]{64}$/.test(d.payload_sha256??'')||d.workspace_id!==w.id||d.cluster_id!==w.cluster_id||d.owner_id!==w.owner_id||d.routing_version!==w.routing_version
    ||(j&&j.dispatch_id!==d.id)))return result('conflict','SETUP_DISPATCH_IDENTITY_CONFLICT','manual_review');
  if(j&&(!d||!j.dispatch_id))return result('legacy_unknown','SETUP_DISPATCH_MISSING','manual_review');
  if(!releaseAvailable(snapshot,now))
    return result('unavailable','SETUP_RELEASE_UNAVAILABLE','retry_later');
  if(!observation||!['present','missing','unavailable','conflict'].includes(observation.status))throw invalid();
  if(observation.status==='conflict')return result('conflict','SETUP_REMOTE_IDENTITY_CONFLICT','manual_review');
  if(observation.status==='unavailable')return result('unavailable','SETUP_REMOTE_UNAVAILABLE','retry_later');
  const r=observation.status==='present'?observation.receipt:null;
  if(observation.status==='present'&&!r)return result('conflict','SETUP_RECEIPT_IDENTITY_CONFLICT','manual_review');
  if(r&&!receiptMatches(w,r))return result('conflict','SETUP_RECEIPT_IDENTITY_CONFLICT','manual_review');
  if(w.status==='active'&&(!uuid(w.tenant_id)||!uuid(w.hotel_id)))return result('conflict','SETUP_ACTIVE_BINDING_MISSING','manual_review');
  if(w.status==='active'&&j&&!['succeeded','cancelled'].includes(j.state))return result('conflict','SETUP_ACTIVE_JOB_UNFINISHED','manual_review');
  if(w.status==='active'&&d?.terminal_state==='closed')return result('conflict','SETUP_CLOSED_CONFLICT','manual_review');
  if(w.status==='active'&&d&&d.terminal_state!=='committed')return result('conflict','SETUP_ACTIVE_DISPATCH_UNSETTLED','manual_review');
  if(w.status==='active'&&d?.terminal_state==='committed'&&(d.tenant_id!==w.tenant_id||d.hotel_id!==w.hotel_id))
    return result('conflict','SETUP_COMMITTED_CONFLICT','manual_review');
  if(w.status==='active')return r?result('active_valid','SETUP_ACTIVE_VERIFIED','no_op')
    :result('legacy_unknown','SETUP_ACTIVE_RECEIPT_MISSING','manual_review');
  if(d?.terminal_state==='closed'){
    const proof={...d,dispatch_id:d.id,state:'closed',success:false};
    if(r||!dispatchMatches(w,d,proof))return result('conflict','SETUP_CLOSED_CONFLICT','manual_review');
    return result('closed','SETUP_CLOSED_VERIFIED','review_closed');
  }
  if(d?.terminal_state==='committed'){
    const proof={...d,dispatch_id:d.id,state:'committed',success:true};
    if(!dispatchMatches(w,d,proof)||!r||r.tenant_id!==d.tenant_id||r.hotel_id!==d.hotel_id)
      return result('conflict','SETUP_COMMITTED_CONFLICT','manual_review');
    return result('committed_pending','SETUP_COMMITTED_NOT_ACTIVE','review_committed');
  }
  if(d?.terminal_state!=null)return result('conflict','SETUP_TERMINAL_UNKNOWN','manual_review');
  if(!d)return result('legacy_unknown','SETUP_DISPATCH_MISSING','manual_review');
  // A generic receipt does not attest a dispatch/hash. The existing worker must
  // obtain committed/closed protocol proof before it may activate or wait owner.
  if(r)return result('dispatch_pending','SETUP_RECEIPT_REQUIRES_DISPATCH_PROOF','review_existing_job');
  return result('dispatch_pending','SETUP_DISPATCH_OUTCOME_UNKNOWN','review_existing_job');
}

const jsonObject=(alias,columns)=>`jsonb_build_object(${columns.split(',').map(c=>`'${c}',${alias}.${c}`).join(',')})`;
const snapshotSql=`SELECT ${jsonObject('w',fields.workspace)} AS workspace,
  CASE WHEN j.id IS NOT NULL THEN ${jsonObject('j',fields.job)} END AS job,
  CASE WHEN d.id IS NOT NULL THEN ${jsonObject('d',fields.dispatch)} END AS dispatch,
  ${jsonObject('c',fields.cluster)} AS cluster,
  CASE WHEN a.cluster_id IS NOT NULL THEN ${jsonObject('a',fields.authority)} END AS authority,
  CASE WHEN p.approval_id IS NOT NULL THEN ${jsonObject('p',fields.approval)} END AS approval,
  h.environment AS environment,(k.key_fingerprint IS NOT NULL) AS "keyRevoked"
 FROM roomqc_control.workspaces w JOIN roomqc_control.clusters c ON c.id=w.cluster_id
 LEFT JOIN roomqc_control.hosts h ON h.id=c.host_id
 LEFT JOIN LATERAL (SELECT ${fields.job.split(',').map(x=>'q.'+x).join(',')} FROM roomqc_control.provisioning_jobs q
   WHERE q.workspace_id=w.id ORDER BY (q.state NOT IN ('succeeded','cancelled')) DESC,q.created_at DESC,q.id DESC LIMIT 1) j ON true
 LEFT JOIN LATERAL (SELECT ${fields.dispatch.split(',').map(x=>'x.'+x).join(',')} FROM roomqc_control.setup_dispatches x
   WHERE x.workspace_id=w.id AND (j.id IS NULL OR x.id=j.dispatch_id) ORDER BY x.created_at DESC,x.id DESC LIMIT 1) d ON true
 LEFT JOIN roomqc_control.release_authority a ON a.cluster_id=c.id
 LEFT JOIN roomqc_control.release_approvals p ON p.approval_id=a.approval_id
 LEFT JOIN roomqc_control.release_key_revocations k ON k.key_fingerprint=p.key_fingerprint
 WHERE w.cluster_id=ANY($1::text[]) AND ($2::uuid IS NULL OR w.id>$2::uuid) AND w.created_at<=$3::timestamptz
 ORDER BY w.id LIMIT $4`;
const identitySql=`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",
  current_database() AS "databaseName",current_user::text AS role,
  current_setting('transaction_read_only') AS "readOnly",pg_is_in_recovery() AS "inRecovery"
 FROM pg_catalog.pg_control_system() s JOIN pg_catalog.pg_database d ON d.datname=current_database()`;
const redactedFailure=()=>new ControlError(503,'SETUP_BACKFILL_READ_FAILED','Chưa đọc được dữ liệu đối soát; không thay đổi đăng ký.');

export class SetupBackfillScanner{
  constructor(pool,{expected,gateways,bindings,batchSize=100,concurrency=2,requestTimeoutMs=5000}={}){
    if(!pool||typeof pool.connect!=='function'||!expected||!['systemIdentifier','databaseOid','databaseName','role'].every(k=>typeof expected[k]==='string'&&expected[k])
      ||!Array.isArray(bindings)||!bindings.length||bindings.length>16||bindings.some(b=>!clusterId(b.clusterId)||!uuid(b.approvalId)
        ||!Number.isSafeInteger(b.epoch)||b.epoch<1||!/^[a-f0-9]{64}$/.test(b.envelopeDigest??'')||!/^[a-z][a-z0-9-]{1,63}$/.test(b.credentialRef??''))
      ||new Set(bindings.map(b=>b.clusterId)).size!==bindings.length||!Number.isSafeInteger(batchSize)||batchSize<1||batchSize>100
      ||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>2||!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<10||requestTimeoutMs>5000)throw invalid();
    this.pool=pool;this.expected=Object.freeze(Object.fromEntries(['systemIdentifier','databaseOid','databaseName','role'].map(k=>[k,expected[k]])));
    this.bindings=new Map(bindings.map(b=>[b.clusterId,Object.freeze(Object.fromEntries(
      ['clusterId','approvalId','epoch','envelopeDigest','credentialRef'].map(k=>[k,b[k]])))]));
    this.gateways=new Map(gateways);this.batchSize=batchSize;this.concurrency=concurrency;this.requestTimeoutMs=requestTimeoutMs;
    this.scopeSha256=hash({expected:this.expected,bindings:[...this.bindings.values()].sort((a,b)=>a.clusterId.localeCompare(b.clusterId))});
  }
  async readiness(client){
    const manifest=await migrationManifest();if(await verifyHistory(client,manifest)!==manifest.length)throw redactedFailure();
    const observed=(await client.query(identitySql)).rows[0];
    if(!observed||Object.keys(this.expected).some(k=>observed[k]!==this.expected[k])||observed.readOnly!=='on'||observed.inRecovery)throw redactedFailure();
    const role=(await client.query(`SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR NOT pg_has_role(current_user,'roomqc_control_backfill_reader','USAGE')
      OR has_schema_privilege(current_user,'roomqc_control','CREATE') OR has_schema_privilege(current_user,'public','CREATE')
      OR EXISTS(SELECT 1 FROM pg_roles x WHERE x.rolname NOT IN(current_user,'roomqc_control_backfill_reader') AND pg_has_role(current_user,x.oid,'MEMBER'))
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control'
        AND c.relkind IN('r','p','v','m','f') AND (has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES')))
      OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control' AND c.relkind='S'
        AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))
      OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='roomqc_control'
        AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS excessive FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
    if(role?.excessive!==false)throw redactedFailure();
    const actual=(await client.query(`SELECT c.relname,a.attname,has_column_privilege(current_user,c.oid,a.attnum,'SELECT') AS readable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
      WHERE n.nspname='roomqc_control' AND c.relkind IN('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped`)).rows;
    const allowed=new Set(Object.entries(tableColumns).flatMap(([t,cols])=>cols.split(',').map(c=>t+'.'+c)));
    if(actual.some(r=>r.readable!==allowed.has(r.relname+'.'+r.attname))||[...allowed].some(c=>!actual.some(r=>r.relname+'.'+r.attname===c)))throw redactedFailure();
    return {schemaVersion:manifest.at(-1).version};
  }
  async observe(snapshot){
    const w=snapshot.workspace,b=this.bindings.get(w.cluster_id),g=this.gateways.get(w.cluster_id),p=snapshot.approval;
    if(!releaseAvailable(snapshot,Date.now())||!g||typeof g.receipt!=='function'||g.binding?.clusterId!==w.cluster_id||g.binding.url!==snapshot.cluster.api_url
      ||b.approvalId!==p?.approval_id||b.epoch!==Number(p?.epoch)||b.envelopeDigest!==p?.envelope_digest||b.credentialRef!==snapshot.cluster.credential_ref)
      return {status:'unavailable'};
    const signal=AbortSignal.timeout(this.requestTimeoutMs);let listener;
    const timeout=new Promise(resolve=>{listener=()=>resolve({status:'unavailable'});signal.addEventListener('abort',listener,{once:true})});
    try{
      return await Promise.race([Promise.resolve().then(()=>g.receipt({...w,api_url:snapshot.cluster.api_url},{signal}))
        .then(receipt=>signal.aborted?{status:'unavailable'}:receipt===null?{status:'missing'}:{status:'present',receipt})
        .catch(error=>({status:error?.code==='RECOVERY_RECEIPT_INVALID'?'conflict':'unavailable'})),timeout]);
    }finally{signal.removeEventListener('abort',listener)}
  }
  async scan({cursor=null}={}){
    if(this.running)throw new ControlError(409,'SETUP_BACKFILL_BUSY','Đối soát đang chạy.');
    if(cursor!==null&&(typeof cursor!=='string'||cursor.length>1024||!/^[A-Za-z0-9_-]+$/.test(cursor)))throw invalid();
    let page;try{if(cursor){page=JSON.parse(Buffer.from(cursor,'base64url'));if(Object.keys(page).sort().join(',')!=='after,cutoff,scopeSha256,version'
      ||page.version!==1||page.scopeSha256!==this.scopeSha256||!uuid(page.after)||typeof page.cutoff!=='string'||!Number.isFinite(Date.parse(page.cutoff)))throw invalid()}}
    catch{throw invalid()}
    this.running=true;let client,snapshots,cutoff,schemaVersion;
    try{
      client=await this.pool.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      ({schemaVersion}=await this.readiness(client));
      cutoff=page?.cutoff??(await client.query('SELECT clock_timestamp() AS cutoff')).rows[0].cutoff.toISOString();
      snapshots=(await client.query(snapshotSql,[[...this.bindings.keys()],page?.after??null,cutoff,this.batchSize+1])).rows;
      await client.query('ROLLBACK');client.release();client=null;
      const selected=snapshots.slice(0,this.batchSize),results=new Array(selected.length);let offset=0;
      await Promise.all(Array.from({length:this.concurrency},async()=>{
        while(offset<selected.length){const index=offset++,s=selected[index],observation=await this.observe(s);
          results[index]={workspaceId:s.workspace.id,clusterId:s.workspace.cluster_id,routingVersion:s.workspace.routing_version,
            snapshotSha256:setupBackfillFingerprint(s),...classifySetupBackfill(s,observation),
            lease:s.job?.state==='leased'?(Date.parse(s.job.lease_until)>Date.now()?'held':'expired'):'none',
            jobBudget:s.job&&(Date.parse(s.job.deadline_at)<=Date.now()||s.job.attempts>=s.job.max_attempts)?'exhausted':'unchanged'};
        }
      }));
      const nextCursor=snapshots.length>this.batchSize?Buffer.from(JSON.stringify({version:1,scopeSha256:this.scopeSha256,cutoff,after:selected.at(-1).workspace.id})).toString('base64url'):null;
      return {schemaVersion:1,mode:'dry_run',readOnly:true,directorySchemaVersion:schemaVersion,scopeSha256:this.scopeSha256,
        cutoff,observedAt:new Date().toISOString(),pageCount:results.length,
        counts:Object.fromEntries(setupBackfillGroups.map(g=>[g,results.filter(r=>r.group===g).length])),items:results,nextCursor,
        limits:['A page is a consistent directory snapshot; remote receipts are observed later without holding DB locks.',
          'The cursor fixes creation cutoff and UUID order, not a global multi-page MVCC snapshot. Apply must revalidate every fingerprint.',
          'No database or remote dispatch mutation is performed. Missing receipt never proves a dispatch was closed.']};
    }catch(error){if(error instanceof ControlError&&error.code==='INVALID_SETUP_BACKFILL')throw error;throw redactedFailure()}
    finally{if(client){await client.query('ROLLBACK').catch(()=>{});client.release()}this.running=false}
  }
}
