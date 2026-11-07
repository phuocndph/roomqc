import {ControlError} from './errors.mjs';
import {bindingMatches} from './store.mjs';

export async function recoverSetupReceipt(store,gateway,workspace,receipt,requestId){
  if(!bindingMatches(workspace,receipt))throw new ControlError(409,'BINDING_CONFLICT','Receipt không khớp đăng ký; cần đối soát.');
  const dispatch=await store.setup.current(workspace);
  if(!dispatch)return store.activate(workspace,receipt,requestId);
  // A committed directory receipt was settled atomically with activation.
  // Reuse it after checking the current remote binding; closing it again would
  // make successful concurrent retries contend on the cluster's close lock.
  // settle() still locks and validates the current workspace/job/dispatch.
  const result=dispatch.terminal_state==='committed'?{
    dispatch_id:dispatch.id,workspace_id:dispatch.workspace_id,owner_id:dispatch.owner_id,
    routing_version:dispatch.routing_version,payload_sha256:dispatch.payload_sha256,
    state:'committed',success:true,tenant_id:dispatch.tenant_id,hotel_id:dispatch.hotel_id,
  }:await gateway.closeSetupDispatch(workspace,dispatch);
  if(result.state!=='committed'||result.tenant_id!==receipt.tenant_id||result.hotel_id!==receipt.hotel_id)
    throw new ControlError(409,'PROVISIONING_RESULT_UNKNOWN','Cần đối soát lần gửi trước khi mở khách sạn.');
  return (await store.setup.settle(workspace,dispatch,result,requestId)).workspace;
}

export async function provisionWorkspace(store,gateway,workspace,user,fields,requestId,enabled){
  if(['provisioning','active'].includes(workspace.status)){
    const receipt=await gateway.binding(workspace);
    if(receipt?.tenant_id){
      const recovered=await recoverSetupReceipt(store,gateway,workspace,receipt,requestId);
      return {status:200,body:{success:true,tenant_id:recovered.tenant_id,hotel_id:recovered.hotel_id,idempotent:true}};
    }
    if(workspace.status==='active')throw new ControlError(409,'PROVISIONING_RESULT_UNKNOWN','Cần đối soát kết quả thiết lập; không tạo lại khách sạn.');
  }
  if(!enabled)throw new ControlError(503,'SETUP_PROTOCOL_DISABLED','Thiết lập mới đang tạm dừng để nâng cấp. Đăng ký được giữ nguyên.');
  const attempt=await store.setup.begin(workspace,user,fields,requestId);
  if(!attempt.started)return {status:202,body:{success:false,pending:true,retryAfter:3,requestId}};
  const result=await gateway.provisionSetupDispatch(attempt.workspace,user,attempt);
  const settled=await store.setup.settle(attempt.workspace,attempt.dispatch,result,requestId);
  if(settled.state==='closed')throw new ControlError(422,'PROVISIONING_REJECTED','Lần thiết lập đã đóng an toàn. Kiểm tra thông tin và tiếp tục trên đăng ký này.');
  return {status:200,body:{success:true,tenant_id:settled.workspace.tenant_id,hotel_id:settled.workspace.hotel_id,idempotent:!!result.idempotent}};
}
