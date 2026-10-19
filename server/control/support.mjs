import { ControlError, bindingMatches, supportSnapshot, uuidPattern } from './store.mjs';

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

export async function reconcileSupport(store,gateway,actor,body,requestId) {
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(reason.length<5 || reason.length>1000) throw new ControlError(400,'REASON_REQUIRED','Lý do xử lý cần 5–1.000 ký tự.');
  if(!uuidPattern.test(body.workspaceId || '') || !Number.isInteger(body.routingVersion) || body.routingVersion<1) {
    throw new ControlError(400,'INVALID_EXPECTATION','Cần mã workspace và phiên bản từ lần tra cứu vừa rồi.');
  }
  const workspace=await store.supportFind(body.query);
  const actionId=await store.startSupportAction(workspace,actor,reason,requestId);
  try {
    if(workspace.id!==body.workspaceId || workspace.routing_version!==body.routingVersion) {
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
    const result=await store.activate(workspace,receipt.binding,requestId,actionId);
    return {success:true,actionId,workspace:supportSnapshot(result)};
  } catch(error) {
    await store.failSupportAction(actionId,error instanceof ControlError?error.code:'CONTROL_UNAVAILABLE');
    throw error;
  }
}
