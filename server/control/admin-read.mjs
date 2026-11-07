import {createHash} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {clusterSelect,publicCluster} from './admin.mjs';
import {receiptStatus} from './support.mjs';
import {alertView} from './alerts.mjs';
import {readWorkspaceRecheckSnapshot} from './setup-recheck.mjs';
import {setupBackfillFingerprint} from './setup-backfill.mjs';
import {unavailableTenantSummary} from './tenant-summary.mjs';
import {hostPreflightReady} from './registry.mjs';
import {deploymentStates,deploymentView} from './deployment-journal.mjs';
import {deploymentJobStates,deploymentJobView,deploymentSpecView} from './deployment-queue.mjs';
import {hostResourcesView} from './host-monitor.mjs';
const bad=()=>new ControlError(400,'INVALID_PAGE','Bộ lọc hoặc trang dữ liệu không hợp lệ.');
export function pageOptions(params,route,filters={}){
  const entries=[...params.entries()];
  if(new Set(entries.map(([k])=>k)).size!==entries.length||entries.some(([k])=>!['limit','cursor',...Object.keys(filters)].includes(k)))throw bad();
  const limit=Number(params.get('limit')??25);if(!Number.isInteger(limit)||limit<1||limit>100)throw bad();
  const values={};
  for(const[key,allowed]of Object.entries(filters))if(params.has(key)){
    const value=params.get(key);if(!value||value.length>120||(allowed&&!allowed.includes(value)))throw bad();values[key]=value;
  }
  const filterHash=createHash('sha256').update(JSON.stringify(values)).digest('hex');
  let cursor=null;
  if(params.has('cursor')){
    const text=params.get('cursor');if(text.length>1024||!/^[-_a-z0-9]+$/i.test(text))throw bad();
    try{cursor=JSON.parse(Buffer.from(text,'base64url'));if(cursor.v!==1||cursor.route!==route||cursor.filterHash!==filterHash
      ||typeof cursor.at!=='string'||!Number.isFinite(Date.parse(cursor.at))||typeof cursor.id!=='string'||cursor.id.length>64)throw bad()}catch{throw bad()}
  }
  return {limit,values,cursor,route,filterHash};
}
export function pageResult(rows,page,mapper){
  const selected=rows.slice(0,page.limit),last=selected.at(-1);
  return {items:selected.map(mapper),nextCursor:rows.length>page.limit?Buffer.from(JSON.stringify({v:1,route:page.route,filterHash:page.filterHash,
    at:last.cursor_at,id:String(last.id)})).toString('base64url'):null};
}
function seek(page,values,alias,column='created_at'){
  if(!page.cursor)return '';
  if(['c','i'].includes(alias)?!/^[a-z][a-z0-9-]{1,39}$/.test(page.cursor.id):alias==='h'?!/^[a-z][a-z0-9-]{1,63}$/.test(page.cursor.id):alias==='e'?!/^\d+$/.test(page.cursor.id):!uuidPattern.test(page.cursor.id))throw bad();
  values.push(page.cursor.at,page.cursor.id);return `(${alias}.${column},${alias}.id)<($${values.length-1}::timestamptz,$${values.length})`;
}
const timestamp=value=>value instanceof Date?value.toISOString():value??null;
const displayText=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200)||null:null;
export function hostView(row,config){
  const inventory=[...(config?.inventory?.values?.()??[])];
  // Prefer the exact cluster inventory reference; for an unlinked host fall
  // back to the first server-owned entry for that host. The projection only
  // contains the four preflight facts and never endpoint or credential data.
  const entry=(row.cluster?.inventory_ref&&config?.inventory?.get?.(row.cluster.inventory_ref))
    ||inventory.find(candidate=>candidate.hostId===row.id);
  const resources=hostResourcesView(row.resources);
  const storedPreflight=entry?.preflight?{
    capturedAt:timestamp(entry.preflight.capturedAt),
    deploymentAllowed:entry.preflight.deploymentAllowed===true,
    diskFreePercent:entry.preflight.diskFreePercent,
    dockerServerVersion:entry.preflight.dockerServerVersion??null,
  }:null;
  const preflight=resources&&(!storedPreflight||Date.parse(resources.observedAt)>=Date.parse(storedPreflight.capturedAt))
    ?{capturedAt:resources.observedAt,deploymentAllowed:resources.deploymentAllowed,diskFreePercent:resources.diskFreePercent,
      dockerServerVersion:resources.dockerServerVersion}:storedPreflight;
  return {id:row.id,name:displayText(row.name)||row.id,region:displayText(row.region),providerLabel:displayText(row.provider_label),
    environment:row.environment,status:row.status,rowVersion:Number(row.row_version),createdAt:timestamp(row.created_at),
    preflight,preflightReady:row.environment==='local'||hostPreflightReady(preflight),resources,cluster:row.cluster?publicCluster(row.cluster,config):null}
}
export const backupScopes=Object.freeze(['directory','cluster','objects','bundle']);
export const backupVerificationStates=Object.freeze(['pending','verified','failed']);
export function backupView(row){
  // Public identifiers only: never return object paths, signed URLs or arbitrary
  // stored manifest content. Missing metadata is not proof of a usable backup.
  return {id:row.id,clusterId:row.cluster_id,scope:row.scope,
    backupId:typeof row.backup_id==='string'&&/^[a-z0-9][a-z0-9._-]{0,119}$/i.test(row.backup_id)?row.backup_id:null,
    manifestHash:typeof row.manifest_hash==='string'&&/^[a-f0-9]{64}$/.test(row.manifest_hash)?row.manifest_hash:null,
    verificationState:row.verification_state,completedAt:timestamp(row.completed_at),restoreTestAt:timestamp(row.restore_test_at),createdAt:timestamp(row.created_at)};
}
export function workspaceView(row){return {id:row.id,slug:row.slug,displayName:row.display_name,clusterId:row.cluster_id,tenantId:row.tenant_id,
  hotelId:row.hotel_id,ownerId:row.owner_id,status:row.status,routingVersion:row.routing_version,lastErrorCode:row.last_error_code,
  expiresAt:timestamp(row.expires_at),createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at)}}
export async function adminRead(store,path,params,gateway){
  const {pool,admin,config}=store;
  if(path==='/deployment-specs'||path==='/deployment-jobs'){
    const specs=path==='/deployment-specs';
    const page=pageOptions(params,specs?'deployment-specs':'deployment-jobs',specs?{clusterId:null}:{clusterId:null,state:deploymentJobStates});
    const values=[],conditions=[];
    if(page.values.clusterId&&!/^[a-z][a-z0-9-]{1,39}$/.test(page.values.clusterId))throw bad();
    if(page.values.clusterId){values.push(page.values.clusterId);conditions.push(`d.cluster_id=$${values.length}`)}
    if(page.values.state){values.push(page.values.state);conditions.push(`d.state=$${values.length}`)}
    if(specs)conditions.push('d.expires_at>clock_timestamp()');
    const cursor=seek(page,values,'d');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const result=await pool.query(specs?`SELECT d.*,d.created_at::text AS cursor_at FROM roomqc_control.deployment_specs d
      WHERE ${conditions.join(' AND ')} ORDER BY d.created_at DESC,d.id DESC LIMIT $${values.length}`:
      `SELECT d.*,s.release_id,d.created_at::text AS cursor_at FROM roomqc_control.deployment_jobs d
      JOIN roomqc_control.deployment_specs s ON s.id=d.spec_id ${conditions.length?'WHERE '+conditions.join(' AND '):''}
      ORDER BY d.created_at DESC,d.id DESC LIMIT $${values.length}`,values);
    return pageResult(result.rows,page,specs?deploymentSpecView:deploymentJobView);
  }
  if(path==='/deployments'){
    const page=pageOptions(params,'deployments',{clusterId:null,state:deploymentStates}),values=[],conditions=[];
    if(page.values.clusterId&&!/^[a-z][a-z0-9-]{1,39}$/.test(page.values.clusterId))throw bad();
    for(const [field,column]of [['clusterId','cluster_id'],['state','state']])if(page.values[field]){
      values.push(page.values[field]);conditions.push(`d.${column}=$${values.length}`);
    }
    const cursor=seek(page,values,'d');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const result=await pool.query(`SELECT d.*,d.created_at::text AS cursor_at,row_to_json(r) AS resolution,row_to_json(g) AS gate FROM roomqc_control.deployment_runs d
      LEFT JOIN roomqc_control.deployment_resolutions r ON r.id=d.reconciliation_id
      LEFT JOIN LATERAL(SELECT phase_index,evidence FROM roomqc_control.deployment_gate_checks
        WHERE run_id=d.id ORDER BY recorded_at DESC,id DESC LIMIT 1)g ON true
      ${conditions.length?'WHERE '+conditions.join(' AND '):''} ORDER BY d.created_at DESC,d.id DESC LIMIT $${values.length}`,values);
    return pageResult(result.rows,page,deploymentView);
  }
  if(path==='/hosts'){
    const page=pageOptions(params,'hosts',{environment:['local','staging','production'],status:['active','maintenance','retired']}),values=[],conditions=[];
    for(const [field,column]of [['environment','environment'],['status','status']])if(page.values[field]){
      values.push(page.values[field]);conditions.push(`h.${column}=$${values.length}`);
    }
    const cursor=seek(page,values,'h');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const {rows}=await pool.query(`SELECT h.id,h.name,h.region,h.provider_label,h.environment,h.status,h.row_version,h.created_at,
      h.created_at::text AS cursor_at,row_to_json(c) AS cluster,row_to_json(r) AS resources FROM roomqc_control.hosts h
      LEFT JOIN roomqc_control.host_resources_current r ON r.host_id=h.id
      LEFT JOIN (${clusterSelect}) c ON c.host_id=h.id ${conditions.length?'WHERE '+conditions.join(' AND '):''}
      ORDER BY h.created_at DESC,h.id DESC LIMIT $${values.length}`,values);
    return pageResult(rows,page,row=>hostView(row,config));
  }
  if(path==='/cluster-candidates'){
    // Explicit public references only. Never serialize the inventory itself,
    // credential values, internal endpoints, files or approved network addresses.
    const entries=[...(config.inventory?.values()??[])].filter(entry=>/^[a-z][a-z0-9-]{1,39}$/.test(entry.id)).map(entry=>({
      id:entry.id,hostId:entry.hostId,hostName:displayText(entry.hostName)||entry.hostId,environment:entry.environment,
      region:displayText(entry.region),providerLabel:displayText(entry.providerLabel),backendKind:entry.backendKind,
      endpointRef:entry.id,credentialRef:entry.credentialRef,credentialConfigured:config.credentials?.has(entry.credentialRef)??false,
      preflightReady:entry.environment==='local'||hostPreflightReady(entry.preflight),
    })).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0);
    const json=JSON.stringify(entries),revision=createHash('sha256').update(json).digest('hex');
    const page=pageOptions(params,'cluster-candidates:'+revision),values=[json],conditions=[`NOT EXISTS(SELECT 1 FROM roomqc_control.clusters c WHERE c.id=i.id OR c.host_id=i."hostId")`];
    // Inventory entries have no database creation time: use one fixed epoch and
    // ID keyset, binding the cursor to this exact public inventory revision.
    const cursor=seek(page,values,'i','cursor_at');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const {rows}=await pool.query(`SELECT i.* FROM (SELECT j.*,'1970-01-01 00:00:00+00'::timestamptz AS cursor_at
      FROM jsonb_to_recordset($1::jsonb) AS j(id text,"hostId" text,"hostName" text,environment text,region text,"providerLabel" text,
        "backendKind" text,"endpointRef" text,"credentialRef" text,"credentialConfigured" boolean,"preflightReady" boolean)) i
      WHERE ${conditions.join(' AND ')} ORDER BY i.cursor_at DESC,i.id DESC LIMIT $${values.length}`,values);
    return pageResult(rows,page,({cursor_at,...candidate})=>candidate);
  }
  const summary=path.match(/^\/workspaces\/([a-f0-9-]{36})\/tenant-summary$/);
  if(summary){
    if(!uuidPattern.test(summary[1])||[...params.keys()].length)throw bad();
    const select=`SELECT w.*,c.api_url,c.status AS cluster_status,c.credential_ref,c.inventory_ref,c.row_version AS cluster_version
      FROM roomqc_control.workspaces w JOIN roomqc_control.clusters c ON c.id=w.cluster_id WHERE w.id=$1`;
    const row=(await pool.query(select,[summary[1]])).rows[0];
    if(!row)throw new ControlError(404,'WORKSPACE_NOT_FOUND','Không tìm thấy đăng ký.');
    let result;
    if(!row.tenant_id||!row.owner_id||!row.hotel_id)result=unavailableTenantSummary(row,'TENANT_SUMMARY_UNBOUND');
    else if(row.cluster_status==='offline'||row.status==='migrating')result=unavailableTenantSummary(row,'TENANT_SUMMARY_UNAVAILABLE');
    else try{result=await gateway.tenantSummary(row)}catch(error){result=unavailableTenantSummary(row,error?.code)}
    // No directory connection/transaction is retained across the remote read.
    // Discard it if routing, target, lifecycle or credential identity changed.
    const current=(await pool.query(select,[summary[1]])).rows[0];
    if(!current||['cluster_id','tenant_id','owner_id','hotel_id','routing_version','api_url','status','cluster_status','credential_ref','inventory_ref','cluster_version']
      .some(k=>current[k]!==row[k]))throw new ControlError(409,'TENANT_SUMMARY_TARGET_CHANGED','Đăng ký hoặc cấu hình cụm đã thay đổi. Hãy tải lại chi tiết.');
    return result;
  }
  if(path==='/backups'){
    const page=pageOptions(params,'backups',{clusterId:null,scope:backupScopes,verificationState:backupVerificationStates});
    if(page.values.clusterId&&!/^[a-z][a-z0-9-]{1,39}$/.test(page.values.clusterId))throw bad();
    const values=[],conditions=[];
    for(const [field,column]of [['clusterId','cluster_id'],['scope','scope'],['verificationState','verification_state']])if(page.values[field]){
      values.push(page.values[field]);conditions.push(`b.${column}=$${values.length}`);
    }
    const filter=conditions.length?' WHERE '+conditions.join(' AND '):'';
    const cursor=seek(page,values,'b');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    // One statement gives rows, filter-wide total and observation time the same
    // PostgreSQL snapshot; total deliberately excludes the cursor condition.
    const {rows}=await pool.query(`SELECT statement_timestamp() AS as_of,
      (SELECT count(*)::integer FROM roomqc_control.backup_runs b${filter}) AS total,
      COALESCE((SELECT json_agg(p) FROM (
        SELECT b.id,b.cluster_id,b.scope,b.backup_id,b.manifest_hash,b.verification_state,b.completed_at,b.restore_test_at,b.created_at,
          b.created_at::text AS cursor_at FROM roomqc_control.backup_runs b
        ${conditions.length?'WHERE '+conditions.join(' AND '):''}
        ORDER BY b.created_at DESC,b.id DESC LIMIT $${values.length}) p),'[]'::json) AS items`,values);
    return {...pageResult(rows[0].items,page,backupView),total:rows[0].total,asOf:timestamp(rows[0].as_of)};
  }
  if(path==='/alerts'){
    const page=pageOptions(params,'alerts',{state:['open','acknowledged','resolved'],severity:['warning','critical']}),values=[],conditions=[];
    if(page.values.state==='open')conditions.push('a.resolved_at IS NULL AND a.acknowledged_at IS NULL');
    if(page.values.state==='acknowledged')conditions.push('a.resolved_at IS NULL AND a.acknowledged_at IS NOT NULL');
    if(page.values.state==='resolved')conditions.push('a.resolved_at IS NOT NULL');
    if(page.values.severity){values.push(page.values.severity);conditions.push(`a.severity=$${values.length}`)}
    const cursor=seek(page,values,'a','opened_at');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const result=await pool.query('SELECT a.*,a.opened_at::text AS cursor_at FROM roomqc_control.alerts a'
      +(conditions.length?' WHERE '+conditions.join(' AND '):'')+` ORDER BY a.opened_at DESC,a.id DESC LIMIT $${values.length}`,values);
    return pageResult(result.rows,page,alertView);
  }
  if(path==='/overview'){
    if([...params].length)throw bad();
    // One statement uses one PostgreSQL snapshot without holding a pool lease
    // across Auth/network reads. Counts never come from a paginated UI list.
    const {rows:[snapshot]}=await pool.query(`SELECT statement_timestamp() AS as_of,
      COALESCE((SELECT jsonb_agg(c) FROM (${clusterSelect}) c),'[]'::jsonb) AS clusters,
      COALESCE((SELECT jsonb_object_agg(w.status,w.count) FROM
        (SELECT status,count(*)::integer AS count FROM roomqc_control.workspaces GROUP BY status) w),'{}'::jsonb) AS workspaces,
      (SELECT count(*)::integer FROM roomqc_control.alerts WHERE severity='critical' AND resolved_at IS NULL) AS critical_alerts`);
    const now=Date.parse(timestamp(snapshot.as_of)),views=snapshot.clusters.map(row=>publicCluster(row,config,{now}));
    const open=views.filter(row=>row.admission.decision==='open');
    const availableWorkspaceSlots=open.reduce((total,row)=>total+Math.max(0,row.tenantLimit-row.allocatedCount),0);
    const signupEnabled=config.signupEnabled===true;
    return {asOf:timestamp(snapshot.as_of),clusterCount:views.length,admissionOpenCount:open.length,
      workspaceCounts:Object.fromEntries(['reserved','provisioning','active','suspended','migrating','expired'].map(s=>[s,snapshot.workspaces[s]??0])),
      openCriticalAlerts:snapshot.critical_alerts,staleClusterIds:snapshot.clusters.filter(row=>!Number.isFinite(Date.parse(row.health_valid_until))||Date.parse(row.health_valid_until)<=now).map(row=>row.id).sort(),
      signup:{enabled:signupEnabled,setupDispatchEnabled:config.setupDispatchEnabled===true,
        state:!signupEnabled?'closed':open.length?'open':'no_capacity',openClusterCount:open.length,
        availableWorkspaceSlots,reasonCodes:!signupEnabled?['SIGNUP_CLOSED_CONFIG']:open.length?[]:['NO_OPEN_CLUSTER']}};
  }
  if(path==='/clusters'){
    const page=pageOptions(params,'clusters',{status:['active','draining','offline']}),values=[],conditions=[];
    if(page.values.status){values.push(page.values.status);conditions.push(`c.status=$${values.length}`)}
    const cursor=seek(page,values,'c');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const result=await pool.query(clusterSelect.replace('SELECT c.*','SELECT c.created_at::text AS cursor_at,c.*')
      +(conditions.length?' WHERE '+conditions.join(' AND '):'')+` ORDER BY c.created_at DESC,c.id DESC LIMIT $${values.length}`,values);
    return pageResult(result.rows,page,row=>publicCluster(row,config));
  }
  const cluster=path.match(/^\/clusters\/([a-z][a-z0-9-]{1,39})$/);
  if(cluster)return publicCluster(await admin.cluster(cluster[1]),config);
  if(path==='/workspaces'){
    const page=pageOptions(params,'workspaces',{status:['reserved','provisioning','active','suspended','migrating','expired'],clusterId:null,search:null}),values=[],conditions=[];
    for(const[field,column]of [['status','status'],['clusterId','cluster_id']])if(page.values[field]){values.push(page.values[field]);conditions.push(`w.${column}=$${values.length}`)}
    if(page.values.search){
      values.push('%'+page.values.search.replace(/[\\%_]/g,'\\$&')+'%',page.values.search);
      conditions.push(`(w.slug ILIKE $${values.length-1} OR w.display_name ILIKE $${values.length-1} OR w.id::text=$${values.length}
        OR EXISTS(SELECT 1 FROM roomqc_control.attempts a WHERE a.workspace_id=w.id AND a.request_id::text=$${values.length}))`);
    }
    const cursor=seek(page,values,'w');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const result=await pool.query('SELECT w.*,w.created_at::text AS cursor_at FROM roomqc_control.workspaces w'
      +(conditions.length?' WHERE '+conditions.join(' AND '):'')+` ORDER BY w.created_at DESC,w.id DESC LIMIT $${values.length}`,values);
    return pageResult(result.rows,page,workspaceView);
  }
  const workspace=path.match(/^\/workspaces\/([a-f0-9-]{36})$/i);
  if(workspace&&uuidPattern.test(workspace[1])){
    const page=pageOptions(params,'workspace-timeline:'+workspace[1]),values=[workspace[1]],conditions=['e.workspace_id=$1'];
    const cursor=seek(page,values,'e');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const client=await pool.connect();let detail,row;
    try{
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const {rows}=await client.query(`SELECT w.*,c.api_url,c.status AS cluster_status FROM roomqc_control.workspaces w
      JOIN roomqc_control.clusters c ON c.id=w.cluster_id WHERE w.id=$1`,[workspace[1]]);
    if(!rows[0])throw new ControlError(404,'WORKSPACE_NOT_FOUND','Không tìm thấy đăng ký.');
    row=rows[0];
    const attempts=await client.query(`SELECT e.*,e.created_at::text AS cursor_at FROM roomqc_control.attempts e
      WHERE ${conditions.join(' AND ')} ORDER BY e.created_at DESC,e.id DESC LIMIT $${values.length}`,values);
    const job=await client.query(`SELECT id,workspace_id,state,attempts,next_attempt_at,lease_until,last_error_code,updated_at
      FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1
      ORDER BY (state NOT IN ('succeeded','cancelled')) DESC,created_at DESC,id DESC LIMIT 1`,[workspace[1]]);
    const recheckSnapshot=await readWorkspaceRecheckSnapshot(client,workspace[1],rows[0].cluster_id);
    detail={workspace:workspaceView(rows[0]),
      recheck:recheckSnapshot?{routingVersion:recheckSnapshot.workspace.routing_version,snapshotSha256:setupBackfillFingerprint(recheckSnapshot)}:null,
      job:job.rowCount?{id:job.rows[0].id,workspaceId:job.rows[0].workspace_id,
      state:job.rows[0].state,attempts:job.rows[0].attempts,nextAttemptAt:timestamp(job.rows[0].next_attempt_at),leaseUntil:timestamp(job.rows[0].lease_until),
      lastErrorCode:job.rows[0].last_error_code,updatedAt:timestamp(job.rows[0].updated_at)}:null,timeline:pageResult(attempts.rows,page,a=>({
      id:String(a.id),clusterId:rows[0].cluster_id,type:a.outcome,source:'provisioning',actorId:null,requestId:a.request_id,commandId:null,
      createdAt:a.created_at,before:null,after:null}))};
    await client.query('COMMIT');
    }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
    // A remote receipt is a separate observation, never a reason to retain a
    // read transaction or mix a second DB snapshot into the displayed version.
    return {...detail,receipt:await receiptStatus(row,gateway)};
  }
  if(path==='/audit'){
    const page=pageOptions(params,'audit',{clusterId:null}),values=[],conditions=[];
    if(page.values.clusterId){values.push(page.values.clusterId);conditions.push(`e.cluster_id=$${values.length}`)}
    const cursor=seek(page,values,'e');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const rows=await pool.query('SELECT e.*,e.created_at::text AS cursor_at FROM roomqc_control.cluster_events e'+(conditions.length?' WHERE '+conditions.join(' AND '):'')
      +` ORDER BY e.created_at DESC,e.id DESC LIMIT $${values.length}`,values);
    return pageResult(rows.rows,page,row=>({id:String(row.id),clusterId:row.cluster_id,type:row.type,source:row.source,actorId:row.actor_id,
      requestId:row.request_id,commandId:row.command_id,createdAt:row.created_at,before:row.before_state,after:row.after_state}));
  }
  throw new ControlError(404,'NOT_FOUND','Không tìm thấy trang quản trị.');
}
