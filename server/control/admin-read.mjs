import {createHash} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {clusterSelect,publicCluster} from './admin.mjs';
import {receiptStatus} from './support.mjs';
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
function seek(page,values,alias){
  if(!page.cursor)return '';
  if(alias==='c'?!/^[a-z][a-z0-9-]{1,39}$/.test(page.cursor.id):alias==='e'?!/^\d+$/.test(page.cursor.id):!uuidPattern.test(page.cursor.id))throw bad();
  values.push(page.cursor.at,page.cursor.id);return `(${alias}.created_at,${alias}.id)<($${values.length-1}::timestamptz,$${values.length})`;
}
const timestamp=value=>value instanceof Date?value.toISOString():value??null;
export function workspaceView(row){return {id:row.id,slug:row.slug,displayName:row.display_name,clusterId:row.cluster_id,tenantId:row.tenant_id,
  hotelId:row.hotel_id,ownerId:row.owner_id,status:row.status,routingVersion:row.routing_version,lastErrorCode:row.last_error_code,
  expiresAt:timestamp(row.expires_at),createdAt:timestamp(row.created_at),updatedAt:timestamp(row.updated_at)}}
export async function adminRead(store,path,params,gateway){
  const {pool,admin,config}=store;
  if(path==='/overview'){
    const [clusters,workspaces,alerts]=await Promise.all([
      pool.query(`SELECT count(*)::integer AS total,array_agg(c.id) FILTER (WHERE h.valid_until IS NULL OR h.valid_until<=now()) AS stale
        FROM roomqc_control.clusters c LEFT JOIN roomqc_control.cluster_health_current h ON h.cluster_id=c.id`),
      pool.query('SELECT status,count(*)::integer AS count FROM roomqc_control.workspaces GROUP BY status'),
      pool.query("SELECT count(*)::integer AS count FROM roomqc_control.alerts WHERE severity='critical' AND resolved_at IS NULL"),
    ]);
    const rows=(await pool.query(clusterSelect)).rows;
    return {asOf:new Date().toISOString(),clusterCount:clusters.rows[0].total,admissionOpenCount:rows.filter(r=>publicCluster(r,config).admission.decision==='open').length,
      workspaceCounts:Object.fromEntries(['reserved','provisioning','active','suspended','migrating','expired'].map(s=>[s,workspaces.rows.find(r=>r.status===s)?.count??0])),
      openCriticalAlerts:alerts.rows[0].count,staleClusterIds:clusters.rows[0].stale??[]};
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
    const {rows}=await pool.query(`SELECT w.*,c.api_url,c.status AS cluster_status FROM roomqc_control.workspaces w
      JOIN roomqc_control.clusters c ON c.id=w.cluster_id WHERE w.id=$1`,[workspace[1]]);
    if(!rows[0])throw new ControlError(404,'WORKSPACE_NOT_FOUND','Không tìm thấy đăng ký.');
    const page=pageOptions(params,'workspace-timeline:'+workspace[1]),values=[workspace[1]],conditions=['e.workspace_id=$1'];
    const cursor=seek(page,values,'e');if(cursor)conditions.push(cursor);values.push(page.limit+1);
    const attempts=await pool.query(`SELECT e.*,e.created_at::text AS cursor_at FROM roomqc_control.attempts e
      WHERE ${conditions.join(' AND ')} ORDER BY e.created_at DESC,e.id DESC LIMIT $${values.length}`,values);
    const job=await pool.query(`SELECT id,workspace_id,state,attempts,next_attempt_at,lease_until,last_error_code,updated_at
      FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 1`,[workspace[1]]);
    return {workspace:workspaceView(rows[0]),receipt:await receiptStatus(rows[0],gateway),job:job.rowCount?{id:job.rows[0].id,workspaceId:job.rows[0].workspace_id,
      state:job.rows[0].state,attempts:job.rows[0].attempts,nextAttemptAt:timestamp(job.rows[0].next_attempt_at),leaseUntil:timestamp(job.rows[0].lease_until),
      lastErrorCode:job.rows[0].last_error_code,updatedAt:timestamp(job.rows[0].updated_at)}:null,timeline:pageResult(attempts.rows,page,a=>({
      id:String(a.id),clusterId:rows[0].cluster_id,type:a.outcome,source:'provisioning',actorId:null,requestId:a.request_id,commandId:null,
      createdAt:a.created_at,before:null,after:null}))};
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
