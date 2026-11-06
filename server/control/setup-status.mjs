import {ControlError,uuidPattern} from './errors.mjs';
import {bindingMatches} from './store.mjs';

function assertOwner(store,workspace,user){
  if(!uuidPattern.test(user?.id??'')||!uuidPattern.test(user?.session_id??'')||!user.email_confirmed_at
    ||typeof user.email!=='string'||store.hashEmail(user.email)!==workspace.email_hash
    ||(workspace.owner_id&&workspace.owner_id!==user.id)){
    throw new ControlError(403,'OWNER_MISMATCH','Tài khoản này không có quyền xem tiến độ thiết lập.');
  }
}
function snapshotKey(w){
  return JSON.stringify([w.id,w.cluster_id,w.routing_version,w.email_hash,w.owner_id,w.tenant_id,w.hotel_id,w.status,
    w.expires_at,w.updated_at,w.setup_job]);
}
export function setupStatusView(workspace,receipt,requestId){
  const base={workspaceId:workspace.id,routingVersion:workspace.routing_version,requestId};
  const result=(step,nextAction,lastErrorCode=null,retryAfter=null)=>({...base,step,nextAction,lastErrorCode,retryAfter});
  const job=workspace.setup_job;
  if(job&&job.routingVersion!==workspace.routing_version)return result('needs_review','contact_support','SETUP_MAPPING_CHANGED');
  if(receipt.status==='unavailable')return result('retry','wait','CLUSTER_UNAVAILABLE',5);
  if(receipt.status==='conflict')return result('needs_review','contact_support','RECEIPT_CONFLICT');
  if(workspace.status==='active')return receipt.status==='verified'
    ?result('active','open_workspace'):result('needs_review','contact_support','PROVISIONING_RESULT_UNKNOWN');
  if(receipt.status==='verified')return result('retry','wait','DIRECTORY_ACTIVATION_PENDING',3);
  if(workspace.status==='reserved'&&!job)return result('ready_to_setup','continue_setup');
  // A job label alone cannot prove that a late remote write can no longer
  // commit. The primary read model verifies the immutable closed dispatch and
  // its current workspace/owner/cluster/routing identity in the same snapshot.
  if(job?.state==='waiting_owner'&&job.closureVerified===true)return result('waiting_owner','continue_setup');
  if(job&&['queued','leased','retry'].includes(job.state)){
    const next=job.state==='leased'?job.leaseUntil:job.nextAttemptAt;
    const retryAfter=Math.min(60,Math.max(3,Math.ceil((Date.parse(next??'')-Date.parse(workspace.checked_at))/1000)||5));
    return result(job.state==='retry'?'retry':'provisioning','wait',null,retryAfter);
  }
  // A missing receipt is not proof that an earlier remote transaction cannot
  // commit. Legacy provisioning without a durable job must be reconciled.
  return result('needs_review','contact_support','PROVISIONING_RESULT_UNKNOWN');
}

/** Owner-only, no writes and no implicit provisioning/reconciliation on GET. */
export async function workspaceSetupStatus(store,gateway,slug,token,requestId,params){
  if([...params].length)throw new ControlError(400,'INVALID_SETUP_STATUS','Tiến độ thiết lập không nhận tham số bổ sung.');
  if(typeof token!=='string'||!token||token.length>16000)throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập để xem tiến độ thiết lập.');
  const initial=await store.workspace(slug),user=await gateway.user(initial,token);
  assertOwner(store,initial,user);
  const current=await store.setupStatusSnapshot(initial,user);
  assertOwner(store,current,user);
  let receipt;
  try{
    const binding=await gateway.binding(current);
    receipt={status:!binding?'missing':current.owner_id&&bindingMatches(current,binding)?'verified':'conflict'};
  }catch{receipt={status:'unavailable'}}
  const after=await store.setupStatusSnapshot(current,user);
  if(snapshotKey(after)!==snapshotKey(current))throw new ControlError(409,'SETUP_STATUS_CHANGED','Tiến độ vừa thay đổi. Vui lòng kiểm tra lại.');
  // Do not serve a result after logout/revocation while the receipt was read.
  const confirmed=await gateway.user(after,token);assertOwner(store,after,confirmed);
  if(confirmed.id!==user.id||confirmed.session_id!==user.session_id)throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập lại.');
  return setupStatusView(after,receipt,requestId);
}
