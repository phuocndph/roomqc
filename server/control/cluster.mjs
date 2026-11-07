import {createHash} from 'node:crypto';
import { ControlError, uuidPattern } from './store.mjs';
import {createClusterFetch} from './safe-http.mjs';
import {probeReleaseManifest} from './release-manifest.mjs';
import {setupPayload,dispatchMatches} from './setup-dispatch.mjs';
import {supportAcceptanceContext,supportAcceptanceReceipt} from './support-acceptance.mjs';
import {readTenantSummary} from './tenant-summary.mjs';

export class ClusterGateway {
  constructor(config, fetcher,store=null) { this.config = config; this.fetcher = fetcher??createClusterFetch(config);this.store=store; }
  async resolve(workspace){return this.store?this.store.clusterCredential(workspace):this.cluster(workspace)}
  cluster(workspace) {
    const cluster = this.config.clusters.find(c => c.id === workspace.cluster_id && c.url === workspace.api_url);
    if (!cluster) throw new ControlError(503,'CLUSTER_UNAVAILABLE','Cụm dữ liệu chưa sẵn sàng.');
    return cluster;
  }
  async request(cluster,path,{ token, body, method = 'POST', timeoutMs=20000, supportAcceptance=false } = {}) {
    let response;
    try {
      response = await this.fetcher(`${cluster.internalUrl || cluster.url}${path}`, { method, redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs), headers: { apikey: token ? cluster.publishableKey : cluster.serviceKey,
          ...(token || !cluster.serviceKey.startsWith('sb_secret_') ? {Authorization: `Bearer ${token || cluster.serviceKey}`} : {}), 'Content-Type':'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }) },cluster);
    } catch { throw new ControlError(503,'CLUSTER_UNAVAILABLE','Không thể kết nối cụm dữ liệu. Vui lòng thử lại; không đăng ký lại doanh nghiệp.'); }
    if (!response.ok) {
      // Only this exact canonical RPC error proves that the original attempt
      // has expired. Transport failures, scope conflicts and generic503 remain
      // unknown and must never cause an automatic recovery generation.
      if(supportAcceptance&&path==='/rest/v1/rpc/accept_platform_support_command'&&response.status!==401&&response.status!==403){
        let value;try{value=await response.json()}catch{}
        if(value?.code==='55000'&&value.message==='SUPPORT_ACCEPTANCE_EXPIRED')
          throw new ControlError(503,'SUPPORT_ACCEPTANCE_EXPIRED','Biên nhận nhận lệnh đã hết hạn. Giữ nguyên mã lệnh để đối soát.');
      }
      throw new ControlError(response.status === 401 || response.status === 403 ? response.status : 503,
        'CLUSTER_REQUEST_FAILED', 'Không thể xác nhận phiên đăng nhập hoặc thiết lập. Vui lòng thử lại.');
    }
    return response.json();
  }
  async user(workspace, token) {
    if (!token || token.length > 16000) throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập.');
    // PostgREST verifies the JWT; this RPC also checks the live Auth session and
    // registration eligibility. A successful GoTrue /user alone is insufficient.
    const user = await this.request(await this.resolve(workspace),'/rest/v1/rpc/registration_actor',{token,body:{}});
    if (!uuidPattern.test(user?.id??'') || !uuidPattern.test(user?.session_id??'')
      || typeof user.email!=='string' || !user.email.includes('@') || !user.email_confirmed_at) {
      throw new ControlError(503,'REGISTRATION_ACTOR_INVALID','Không thể xác nhận tài khoản thiết lập. Vui lòng thử lại.');
    }
    return {id:user.id,email:user.email,email_confirmed_at:user.email_confirmed_at,session_id:user.session_id};
  }
  async supportActor(token,{timeoutMs=20000}={}) {
    const cluster = this.config.clusters.find(c => c.id === this.config.supportClusterId);
    if (!cluster) throw new ControlError(503,'SUPPORT_DISABLED','Công cụ hỗ trợ chưa được cấu hình.');
    if (!token || token.length > 16000) throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập quản trị.');
    // This RPC checks live role, lock and auth.sessions in the canonical cluster.
    // Never let the caller choose an authority or authorize from user_metadata.
    const actor = await this.request(cluster,'/rest/v1/rpc/platform_support_actor',{token,body:{},timeoutMs});
    if (typeof actor !== 'string' || !uuidPattern.test(actor)) {
      throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Cần quyền quản trị nền tảng đang hoạt động.');
    }
    return { id:actor, clusterId:cluster.id };
  }
  async binding(workspace,{timeoutMs=20000}={}) {
    return this.request(await this.resolve(workspace),'/rest/v1/rpc/get_workspace_provisioning', { body:{p_workspace_id:workspace.id},timeoutMs });
  }
  async tenantSummary(workspace){
    return readTenantSummary(this.config,await this.resolve(workspace),workspace);
  }
  supportSessionId(token){
    // Binding only: callers must first verify this token via supportActor.
    // Never treat decoded session_id as authority or accept it from a body.
    let sessionId;
    if(typeof token==='string'&&token.length<=16000)try{sessionId=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id}catch{}
    if(typeof sessionId!=='string'||!uuidPattern.test(sessionId))throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập quản trị.');
    return sessionId.toLowerCase();
  }
  async acceptSupportCommand(actor,token,scope,{timeoutMs=5000}={}){
    const context=supportAcceptanceContext(actor,scope);
    const cluster=this.config.clusters.find(c=>c.id===this.config.supportClusterId);
    if(!cluster||actor.clusterId!==cluster.id)throw new ControlError(403,'SUPPORT_ACTOR_CHANGED','Phiên quản trị đã thay đổi.');
    if(!token||token.length>16000)throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập quản trị.');
    const sessionId=this.supportSessionId(token);
    // JWT parsing here binds the returned receipt only. PostgREST verifies the
    // JWT and the RPC locks/checks live Auth/profile/role/session rows.
    const value=await this.request(cluster,'/rest/v1/rpc/accept_platform_support_command',{token,timeoutMs,supportAcceptance:true,body:{
      p_attempt_id:context.attemptId,p_audience:context.audience,p_operation:context.operation,p_target:context.target,
      p_request_key:context.key,p_payload_sha256:context.payloadHash}});
    return supportAcceptanceReceipt(value,context,sessionId);
  }
  async provision(workspace,user,fields) {
    if(!uuidPattern.test(user?.session_id??''))throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập lại.');
    return this.request(await this.resolve(workspace),'/rest/v1/rpc/provision_workspace_registration', {
      body:{p_workspace_id:workspace.id,p_owner_id:user.id,p_fields:{...fields,workspaceSlug:workspace.slug,registrationSessionId:user.session_id}} });
  }
  async provisionSetupDispatch(workspace,user,attempt){
    const dispatch=attempt?.dispatch;
    if(!uuidPattern.test(user?.session_id??'')||user.id!==workspace.owner_id)
      throw new ControlError(401,'LOGIN_REQUIRED','Vui lòng đăng nhập lại.');
    let payload;
    try{payload=setupPayload(workspace,JSON.parse(attempt.fieldsJson))}catch{throw new ControlError(409,'SETUP_DISPATCH_CHANGED','Thông tin lần gửi không hợp lệ.')}
    if(!dispatch||payload.fieldsJson!==attempt.fieldsJson||payload.payloadSha256!==dispatch.payload_sha256
      ||dispatch.workspace_id!==workspace.id||dispatch.owner_id!==user.id||dispatch.cluster_id!==workspace.cluster_id
      ||dispatch.routing_version!==workspace.routing_version)
      throw new ControlError(409,'SETUP_DISPATCH_CHANGED','Thông tin lần gửi không khớp đăng ký.');
    const result=await this.request(await this.resolve(workspace),'/rest/v1/rpc/provision_workspace_setup_dispatch',{
      body:{p_workspace_id:workspace.id,p_dispatch_id:dispatch.id,p_owner_id:user.id,p_routing_version:dispatch.routing_version,
        p_payload_sha256:dispatch.payload_sha256,p_fields_json:attempt.fieldsJson,p_session_id:user.session_id}});
    if(!dispatchMatches(workspace,dispatch,result))throw new ControlError(503,'SETUP_RECEIPT_INVALID','Cần đối soát kết quả thiết lập.');
    return result;
  }
  async closeSetupDispatch(workspace,dispatch){
    if(!dispatch||dispatch.workspace_id!==workspace.id||dispatch.owner_id!==workspace.owner_id
      ||dispatch.cluster_id!==workspace.cluster_id||dispatch.routing_version!==workspace.routing_version)
      throw new ControlError(409,'SETUP_DISPATCH_CHANGED','Lần gửi cần đối soát đã thay đổi.');
    const result=await this.request(await this.resolve(workspace),'/rest/v1/rpc/close_workspace_setup_dispatch',{
      body:{p_workspace_id:workspace.id,p_dispatch_id:dispatch.id,p_owner_id:dispatch.owner_id,
        p_routing_version:dispatch.routing_version,p_payload_sha256:dispatch.payload_sha256}});
    if(result?.state==='busy'&&result.dispatch_id===dispatch.id&&result.workspace_id===workspace.id
      &&result.owner_id===dispatch.owner_id&&result.routing_version===dispatch.routing_version&&result.payload_sha256===dispatch.payload_sha256)return result;
    if(!dispatchMatches(workspace,dispatch,result))throw new ControlError(503,'SETUP_RECEIPT_INVALID','Cần đối soát kết quả thiết lập.');
    return result;
  }
  async validateCluster(row){
    if(!this.store?.authorizeRelease)throw new ControlError(503,'RELEASE_AUTHORITY_REQUIRED','Cần xác nhận phê duyệt triển khai hiện thời từ directory.');
    const {entry,cluster,expected,migrationReceipt,credential,fingerprint}=await this.store.authorizeRelease(row);
    const manifest=await probeReleaseManifest(this.config,cluster,{expected,credential,fetcher:this.fetcher});
    // This is release compatibility, not five-service health. Never open
    // admission or use service_role because a manifest credential is missing.
    return {inventoryRef:entry.id,validationFingerprint:fingerprint,migrationReceiptFingerprint:createHash('sha256').update(JSON.stringify(migrationReceipt)).digest('hex'),releaseId:expected.releaseId,schemaManifestHash:expected.schemaManifestHash,frontendReady:true,
      publishableKey:cluster.publishableKey,vapidPublicKey:cluster.vapidPublicKey,manifest};
  }
}
