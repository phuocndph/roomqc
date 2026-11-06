import { ControlError, bindingMatches, supportSnapshot, uuidPattern } from './store.mjs';
import {assertLiveSupportAuthority,durableSupportTransaction} from './support-authority.mjs';
import {createHash} from 'node:crypto';

export function supportReconcileCommand(body,key){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='query,reason,routingVersion,workspaceId')
    throw new ControlError(400,'INVALID_EXPECTATION','Cần thông tin đăng ký vừa tra cứu.');
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<5||reason.length>1000)throw new ControlError(400,'REASON_REQUIRED','Lý do xử lý cần 5–1.000 ký tự.');
  if(typeof body.workspaceId!=='string'||!uuidPattern.test(body.workspaceId)||!Number.isSafeInteger(body.routingVersion)||body.routingVersion<1
    ||typeof body.query!=='string'||body.query.length<1||body.query.length>48)
    throw new ControlError(400,'INVALID_EXPECTATION','Cần mã workspace và phiên bản từ lần tra cứu vừa rồi.');
  if(typeof key!=='string'||!uuidPattern.test(key))throw new ControlError(400,'SUPPORT_COMMAND_KEY_REQUIRED','Cần mã lệnh hỗ trợ cố định.');
  const workspaceId=body.workspaceId.toLowerCase();
  return Object.freeze({key,workspaceId,routingVersion:body.routingVersion,reason,query:body.query,
    payloadHash:createHash('sha256').update(JSON.stringify([workspaceId,body.routingVersion,reason])).digest('hex')});
}

export async function supportReconcileResult(store,actor,workspaceId,key,{client,payloadHash}={}){
  if(typeof workspaceId!=='string'||!uuidPattern.test(workspaceId)||typeof key!=='string'||!uuidPattern.test(key))
    throw new ControlError(400,'INVALID_SUPPORT_LOOKUP','Cần mã đăng ký và mã lệnh gốc.');
  const row=await store.supportCommandAction(actor,workspaceId,key,client);
  if(!row)return null;
  if(payloadHash&&row.payload_hash!==payloadHash)throw new ControlError(409,'IDEMPOTENCY_CONFLICT','Mã lệnh đã dùng cho nội dung khác.');
  if(row.outcome!=='reconciled')return null;
  const value=row.after_state;
  if(!uuidPattern.test(row.id??'')||!row.finished_at||!value||value.id!==workspaceId.toLowerCase()||value.status!=='active'
    ||!Number.isSafeInteger(value.routing_version)||!['owner_id','tenant_id','hotel_id'].every(k=>uuidPattern.test(value[k]??'')))
    throw new ControlError(409,'SUPPORT_RESULT_UNAVAILABLE','Kết quả hỗ trợ cần đối soát. Giữ nguyên mã lệnh.');
  return {commandId:row.id,success:true,actionId:row.id,workspace:supportSnapshot(value)};
}

export async function receiptStatus(workspace,gateway) {
  if(workspace.cluster_status==='offline') return {status:'unavailable'};
  try {
    const binding=await gateway.binding(workspace);
    if(!binding) return {status:'missing'};
    // Inspection requires the actual immutable workspace ID in the receipt,
    // plus a durably verified owner. No inference from display name or email.
    const matches=binding.workspace_id===workspace.id && !!workspace.owner_id && bindingMatches(workspace,binding);
    return {status:matches?'verified':'conflict',binding:Object.fromEntries(
      ['workspace_id','tenant_id','hotel_id','owner_id'].map(k=>[k,binding[k] || null]))};
  } catch { return {status:'unavailable'}; }
}

export async function inspectSupport(store,gateway,query) {
  const workspace=await store.supportFind(query);
  return {workspace:supportSnapshot(workspace),clusterStatus:workspace.cluster_status,
    receipt:await receiptStatus(workspace,gateway),...await store.supportHistory(workspace.id)};
}

export async function reconcileSupport(store,gateway,actor,body,requestId,authorize,key) {
  await assertLiveSupportAuthority(actor,authorize);
  const command=supportReconcileCommand(body,key);
  const lookup=client=>supportReconcileResult(store,actor,command.workspaceId,command.key,{client,payloadHash:command.payloadHash});
  const previous=await lookup();
  if(previous){await assertLiveSupportAuthority(actor,authorize);return previous}
  const workspace=await store.supportFind(command.query);
  const actionId=await store.startSupportAction(workspace,actor,command.reason,requestId,command);
  try {
    if(workspace.id!==command.workspaceId || workspace.routing_version!==command.routingVersion) {
      throw new ControlError(409,'WORKSPACE_CHANGED','Đăng ký đã thay đổi. Hãy tra cứu lại trước khi xử lý.');
    }
    if(!['provisioning','active'].includes(workspace.status) || !workspace.owner_id) {
      throw new ControlError(409,'STATE_NOT_RECOVERABLE','Trạng thái này không được khôi phục tự động; không tạo lại tenant.');
    }
    const receipt=await receiptStatus(workspace,gateway);
    if(receipt.status!=='verified') {
      const messages={missing:'Chưa có receipt. Chủ tài khoản cần tiếp tục thiết lập trên đăng ký cũ.',
        unavailable:'Chưa kết nối được cụm. Giữ nguyên mapping và thử lại sau.',conflict:'Receipt khác mapping. Dừng xử lý và chuyển kỹ thuật đối soát.'};
      throw new ControlError(receipt.status==='unavailable'?503:409,`RECEIPT_${receipt.status.toUpperCase()}`,messages[receipt.status]);
    }
    return await durableSupportTransaction(store.pool,actor,authorize,{kind:'support',operation:'reconcile',acceptanceOperation:'reconcile_workspace',
      target:workspace.id,key:command.key,payloadHash:command.payloadHash},{lookup,mutate:async client=>{
        const result=await store.activateInTransaction(client,workspace,receipt.binding,requestId,actionId,{actor,authorize});
        return {commandId:actionId,success:true,actionId,workspace:JSON.parse(JSON.stringify(supportSnapshot(result)))};
      }});
  } catch(error) {
    await store.failSupportAction(actionId,error instanceof ControlError?error.code:'CONTROL_UNAVAILABLE');
    throw error;
  }
}
