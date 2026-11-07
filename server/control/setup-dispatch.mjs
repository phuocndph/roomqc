import {createHash,randomUUID} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {admissionDecision} from './health-policy.mjs';

const fieldNames=['fullName','phone','tenantName','hotelName','hotelAddress','hotelPhone','hotelEmail','totalRooms'];
export function setupPayload(workspace,fields){
  if(!fields||typeof fields!=='object'||Array.isArray(fields))throw new ControlError(400,'INVALID_SETUP_FIELDS','Thông tin thiết lập không hợp lệ.');
  const values={};
  for(const name of fieldNames){
    const value=fields[name];if(value===undefined)continue;
    if(name==='totalRooms'?!Number.isSafeInteger(value)||value<0||value>100000:typeof value!=='string'||value.length>2000)
      throw new ControlError(400,'INVALID_SETUP_FIELDS','Thông tin thiết lập không hợp lệ.');
    values[name]=value;
  }
  values.workspaceSlug=workspace.slug;
  const fieldsJson=JSON.stringify(values);
  if(Buffer.byteLength(fieldsJson)>16384)throw new ControlError(413,'BODY_TOO_LARGE','Thông tin thiết lập quá lớn.');
  return {fieldsJson,payloadSha256:createHash('sha256').update(fieldsJson).digest('hex')};
}
const uuid=value=>typeof value==='string'&&uuidPattern.test(value);
export function dispatchMatches(workspace,dispatch,result){
  return !!dispatch&&!!result&&uuid(dispatch.id)&&uuid(dispatch.owner_id)
    &&dispatch.workspace_id===workspace.id&&dispatch.cluster_id===workspace.cluster_id
    &&dispatch.owner_id===workspace.owner_id&&dispatch.routing_version===workspace.routing_version
    &&result.dispatch_id===dispatch.id&&result.workspace_id===workspace.id&&result.owner_id===dispatch.owner_id
    &&result.routing_version===dispatch.routing_version&&result.payload_sha256===dispatch.payload_sha256
    &&(result.state==='closed'?result.success===false&&result.tenant_id===null&&result.hotel_id===null
      :result.state==='committed'&&result.success===true&&uuid(result.tenant_id)&&uuid(result.hotel_id)
        &&(!workspace.tenant_id||workspace.tenant_id===result.tenant_id)&&(!workspace.hotel_id||workspace.hotel_id===result.hotel_id));
}
const changed=()=>new ControlError(409,'SETUP_DISPATCH_CHANGED','Thiết lập vừa thay đổi. Vui lòng kiểm tra lại tiến độ.');
async function transaction(pool,fn){
  const client=await pool.connect();
  try{await client.query('BEGIN');const value=await fn(client);await client.query('COMMIT');return value}
  catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
}

export class SetupDispatchStore {
  constructor(store){this.store=store;this.pool=store.pool}
  async current(workspace){
    const {rows}=await this.pool.query(`SELECT d.* FROM roomqc_control.setup_dispatches d
      JOIN roomqc_control.provisioning_jobs j ON j.dispatch_id=d.id
      JOIN roomqc_control.workspaces w ON w.id=d.workspace_id
      WHERE w.id=$1 AND w.cluster_id=$2 AND w.routing_version=$3
        AND d.cluster_id=w.cluster_id AND d.routing_version=w.routing_version AND d.owner_id=w.owner_id
      ORDER BY d.created_at DESC,d.id DESC LIMIT 1`,[workspace.id,workspace.cluster_id,workspace.routing_version]);
    return rows[0]??null;
  }
  async begin(workspace,user,fields,requestId){
    if(!uuid(user?.id)||!uuid(user?.session_id)||!user.email_confirmed_at||typeof user.email!=='string')
      throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập lại để thiết lập.');
    const payload=setupPayload(workspace,fields);
    return transaction(this.pool,async client=>{
      // Same ordering as admission/reservation/cluster commands, then workspace,
      // then job and dispatch. No transaction is held across a network request.
      await client.query('SELECT pg_advisory_xact_lock(727001)');
      const current=(await client.query(`SELECT *,clock_timestamp() AS checked_at FROM roomqc_control.workspaces WHERE id=$1 FOR UPDATE`,[workspace.id])).rows[0];
      if(!current||current.slug!==workspace.slug||current.cluster_id!==workspace.cluster_id||current.routing_version!==workspace.routing_version
        ||current.email_hash!==this.store.hashEmail(user.email)||(current.owner_id&&current.owner_id!==user.id)
        ||!['reserved','provisioning','active'].includes(current.status)
        ||(current.status==='reserved'&&current.expires_at&&current.expires_at<=current.checked_at))throw changed();
      if(current.status==='active')return {workspace:{...workspace,...current},dispatch:null,started:false,active:true};
      const job=(await client.query(`SELECT * FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1
        AND state NOT IN ('succeeded','cancelled') FOR UPDATE`,[current.id])).rows[0];
      if(job){
        const dispatch=job.dispatch_id?(await client.query('SELECT * FROM roomqc_control.setup_dispatches WHERE id=$1 FOR UPDATE',[job.dispatch_id])).rows[0]:null;
        if(!dispatch||dispatch.cluster_id!==current.cluster_id||dispatch.owner_id!==user.id
          ||dispatch.routing_version!==current.routing_version)throw new ControlError(409,'PROVISIONING_RESULT_UNKNOWN','Đăng ký cần đối soát trước khi tiếp tục; không tạo lại khách sạn.');
        if(job.state==='waiting_owner'&&dispatch.terminal_state==='closed'){
          await client.query("UPDATE roomqc_control.provisioning_jobs SET state='cancelled',updated_at=clock_timestamp() WHERE id=$1",[job.id]);
        }else{
          if(!['queued','leased','retry'].includes(job.state)||dispatch.terminal_state!==null)
            throw new ControlError(409,'PROVISIONING_RESULT_UNKNOWN','Đăng ký cần được đối soát trước khi thử lại.');
          if(dispatch.payload_sha256!==payload.payloadSha256)throw new ControlError(409,'SETUP_PAYLOAD_CONFLICT','Yêu cầu trước đang được đối soát. Giữ nguyên đăng ký và kiểm tra tiến độ.');
          return {workspace:{...workspace,...current},dispatch,started:false};
        }
      }else if(current.status==='provisioning'){
        throw new ControlError(409,'PROVISIONING_RESULT_UNKNOWN','Kết quả đăng ký cũ cần được đối soát; không tạo lại khách sạn.');
      }
      const cluster=await this.store.admin.cluster(current.cluster_id,client);
      if(admissionDecision(cluster,{ignoreCapacity:true}).decision!=='open')
        throw new ControlError(503,'PROVISIONING_WAIT','Cụm đang tạm ngừng thiết lập mới. Đăng ký được giữ nguyên.');
      const id=randomUUID(),jobId=randomUUID();
      const dispatch=(await client.query(`INSERT INTO roomqc_control.setup_dispatches(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256)
        VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,[id,current.id,current.cluster_id,user.id,current.routing_version,payload.payloadSha256])).rows[0];
      await client.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,expected_routing_version,dispatch_id,next_attempt_at)
        VALUES($1,$2,$3,$4,clock_timestamp()+interval '30 seconds')`,[jobId,current.id,current.routing_version,id]);
      const saved=(await client.query(`UPDATE roomqc_control.workspaces SET status='provisioning',owner_id=$2,expires_at=NULL,
        last_error_code=NULL,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,[current.id,user.id])).rows[0];
      await client.query(`INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,'setup_dispatch_started')`,[requestId,current.id]);
      return {workspace:{...workspace,...saved},dispatch,jobId,started:true,...payload};
    });
  }
  async settle(workspace,dispatch,result,requestId){
    if(!dispatchMatches(workspace,dispatch,result))throw new ControlError(409,'SETUP_RECEIPT_CONFLICT','Kết quả thiết lập không khớp đăng ký; cần đối soát.');
    return transaction(this.pool,async client=>{
      const current=(await client.query('SELECT * FROM roomqc_control.workspaces WHERE id=$1 FOR UPDATE',[workspace.id])).rows[0];
      if(!current||current.cluster_id!==dispatch.cluster_id||current.routing_version!==dispatch.routing_version
        ||current.owner_id!==dispatch.owner_id||!['provisioning','active'].includes(current.status))throw changed();
      const job=(await client.query(`SELECT * FROM roomqc_control.provisioning_jobs WHERE dispatch_id=$1
        ORDER BY (state NOT IN ('succeeded','cancelled')) DESC,created_at DESC,id DESC LIMIT 1 FOR UPDATE`,[dispatch.id])).rows[0];
      const saved=(await client.query('SELECT * FROM roomqc_control.setup_dispatches WHERE id=$1 FOR UPDATE',[dispatch.id])).rows[0];
      if(!job||!saved||!dispatchMatches({...workspace,...current},saved,result))throw changed();
      if(saved.terminal_state){
        if(saved.terminal_state!==result.state||saved.tenant_id!==(result.tenant_id??null)||saved.hotel_id!==(result.hotel_id??null))throw changed();
        return {workspace:{...workspace,...current},state:saved.terminal_state,idempotent:true};
      }
      // Synchronous replies cannot overwrite a worker's lease/result or an
      // already superseded attempt. A leased attempt is left to its worker.
      if(!['queued','retry'].includes(job.state)||job.expected_routing_version!==current.routing_version)throw changed();
      if(result.state==='closed'&&current.status==='active')throw changed();
      await client.query(`UPDATE roomqc_control.setup_dispatches SET terminal_state=$2,tenant_id=$3,hotel_id=$4,
        settled_at=clock_timestamp() WHERE id=$1`,[dispatch.id,result.state,result.tenant_id,result.hotel_id]);
      await client.query(`UPDATE roomqc_control.provisioning_jobs SET state=$2,lease_token=NULL,lease_until=NULL,
        last_error_code=$3,updated_at=clock_timestamp() WHERE id=$1`,[job.id,result.state==='committed'?'succeeded':'waiting_owner',
        result.state==='committed'?null:'SETUP_DISPATCH_CLOSED']);
      let after=current;
      if(result.state==='committed')after=(await client.query(`UPDATE roomqc_control.workspaces SET tenant_id=$2,hotel_id=$3,
        status='active',expires_at=NULL,last_error_code=NULL,updated_at=clock_timestamp() WHERE id=$1 RETURNING *`,
        [current.id,result.tenant_id,result.hotel_id])).rows[0];
      await client.query(`INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,$3)`,
        [requestId,current.id,result.state==='committed'?'setup_dispatch_active':'setup_dispatch_closed']);
      return {workspace:{...workspace,...after},state:result.state,idempotent:false};
    });
  }
}
