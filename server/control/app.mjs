import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ControlError } from './store.mjs';
import { inspectSupport, reconcileSupport, supportReconcileResult } from './support.mjs';
import {clusterCommand,requireCapability} from './admin.mjs';
import {adminRead} from './admin-read.mjs';
import {commandResultLookup} from './command-results.mjs';
import {alertAcknowledgement} from './alert-commands.mjs';
import {createRequestGate} from './request-gate.mjs';
import {runtimeResourceView} from './resource-runtime.mjs';
import {workspaceSetupStatus} from './setup-status.mjs';
import {provisionWorkspace,recoverSetupReceipt} from './provisioning.mjs';
import {workspaceRecheckCommand,workspaceRecheckLookup} from './setup-recheck.mjs';
import {assertLiveSupportAuthority,supportCommandAuthorizer} from './support-authority.mjs';

const prefix = '/api/control';
function publicBootstrap(w) {
  return { version:1,workspace:{id:w.id,slug:w.slug,displayName:w.display_name,tenantId:w.tenant_id,
    status:w.status,routingVersion:w.routing_version,reservationExpiresAt:w.expires_at || null},cluster:{id:w.cluster_id,url:w.api_url,
    publishableKey:w.publishable_key,vapidPublicKey:w.vapid_public_key} };
}
async function readBody(req) {
  let body='';
  for await (const chunk of req) {
    body+=chunk;
    if (Buffer.byteLength(body)>16384) throw new ControlError(413,'BODY_TOO_LARGE','Yêu cầu quá lớn.');
  }
  try { const value=JSON.parse(body); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value; }
  catch { throw new ControlError(400,'INVALID_JSON','Nội dung yêu cầu không hợp lệ.'); }
}

export function createControlServer({config,store,gateway,lifecycle={draining:false}}) {
  const resources=runtimeResourceView(config,'control-api');
  const buckets=new Map();
  const requests=createRequestGate(config.requestBudget),readiness=createRequestGate({maxActive:1,maxQueued:0,queueTimeoutMs:1000});
  lifecycle.stopAdmission=()=>{requests.close();readiness.close()};
  lifecycle.requestCapacity=()=>({requests:requests.snapshot(),readiness:readiness.snapshot()});
  return createServer(async (req,res) => {
    const requestId=randomUUID();
    let failureWorkspaceId;
    let releaseSlot;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Request-Id',requestId);
    const send=(status,data) => {
      if(res.destroyed||res.writableEnded)return;
      if(lifecycle.draining)res.setHeader('Connection','close');
      res.writeHead(status);res.end(JSON.stringify(data));
    };
    try {
      const path=new URL(req.url,'http://control.invalid').pathname;
      if (req.method==='GET' && path===`${prefix}/livez`) {
        send(200,{status:'alive',resources}); return;
      }
      if(lifecycle.draining) {
        res.setHeader('Connection','close');
        throw new ControlError(503,'CONTROL_DRAINING','Dịch vụ đang khởi động lại. Vui lòng thử lại.');
      }
      const controller=new AbortController(),disconnected=()=>controller.abort();
      req.once('aborted',disconnected);res.once('close',disconnected);
      try {
        const gate=req.method==='GET'&&[`${prefix}/healthz`,`${prefix}/readyz`].includes(path)?readiness:requests;
        releaseSlot=await gate.acquire({signal:controller.signal});
      }finally{req.off('aborted',disconnected);res.off('close',disconnected)}
      if(lifecycle.draining)throw new ControlError(503,'CONTROL_DRAINING','Dịch vụ đang khởi động lại. Vui lòng thử lại.');
      if (req.method==='GET' && [`${prefix}/healthz`,`${prefix}/readyz`].includes(path)) {
        const readiness=await store.readiness();
        send(200,path.endsWith('/healthz')?{status:'ok'}:readiness);return;
      }
      if (!['GET','POST'].includes(req.method)) throw new ControlError(405,'METHOD_NOT_ALLOWED','Phương thức không hỗ trợ.');
      // Do not trust forwarded IP headers from arbitrary clients. Front proxy adds a shared limiter as well.
      const now=Date.now(); const ip=req.socket.remoteAddress || 'unknown';
      for (const [key,value] of buckets) if(value.reset<=now) buckets.delete(key);
      const bucket=buckets.get(ip) || {count:0,reset:now+60000};
      bucket.count++; buckets.set(ip,bucket);
      if(bucket.count>120 || buckets.size>10000) {
        const error=new ControlError(429,'RATE_LIMIT','Quá nhiều yêu cầu. Vui lòng thử lại sau.');
        error.retryAfter=Math.max(1,Math.ceil((bucket.reset-now)/1000));throw error;
      }
      if(req.method==='POST' && req.headers.origin!==config.publicOrigin) throw new ControlError(403,'ORIGIN_DENIED','Nguồn yêu cầu không hợp lệ.');
      if(req.method==='POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new ControlError(415,'CONTENT_TYPE','Yêu cầu phải là JSON.');
      if(path.startsWith(`${prefix}/admin/`)){
        const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const actor=await gateway.supportActor(token);
        const authorize=supportCommandAuthorizer(gateway,actor,token);
        const sendRead=async value=>{await assertLiveSupportAuthority(actor,authorize);send(200,value)};
        requireCapability(actor,req.method==='GET'?'platform-read':'infra-operate',config);
        const adminPath=path.slice(`${prefix}/admin`.length);
        const recheckResult=adminPath.match(/^\/workspaces\/([^/]+)\/recheck-result$/);
        if(req.method==='GET'&&recheckResult){
          requireCapability(actor,'support-reconcile',config);
          const lookup=workspaceRecheckLookup(recheckResult[1],req.headers['idempotency-key'],new URL(req.url,'http://control.invalid').searchParams);
          await sendRead({...await store.rechecks.lookup(actor,lookup,authorize),requestId});return;
        }
        const alertResult=adminPath.match(/^\/alerts\/([^/]+)\/acknowledgement-result$/);
        if(req.method==='GET'&&alertResult){
          if([...new URL(req.url,'http://control.invalid').searchParams].length)throw new ControlError(400,'INVALID_ALERT_COMMAND','Yêu cầu tra kết quả không nhận tham số bổ sung.');
          await sendRead({...await store.alerts.result(actor,alertResult[1],req.headers['idempotency-key']),requestId});return;
        }
        const resultTarget=adminPath.match(/^\/clusters\/([^/]+)\/command-result$/);
        if(req.method==='GET'&&resultTarget){
          const lookup=commandResultLookup(resultTarget[1],new URL(req.url,'http://control.invalid').searchParams,req.headers['idempotency-key']);
          await sendRead({...await store.admin.commandResult(actor,lookup),requestId});return;
        }
        if(req.method==='GET'){await sendRead(await adminRead(store,adminPath,new URL(req.url,'http://control.invalid').searchParams,gateway));return}
        const body=await readBody(req),key=req.headers['idempotency-key'];
        const recheckTarget=adminPath.match(/^\/workspaces\/([^/]+)\/recheck$/);
        if(recheckTarget){
          requireCapability(actor,'support-reconcile',config);
          const command=workspaceRecheckCommand(recheckTarget[1],body,key);
          const result=await store.rechecks.execute(actor,command,requestId,gateway,authorize);
          send(['queued','reused_job','running'].includes(result.outcome)?202:200,{...result,requestId});return;
        }
        const alertTarget=adminPath.match(/^\/alerts\/([^/]+)\/acknowledge$/);
        if(alertTarget){
          send(200,{...await store.alerts.acknowledge(actor,alertAcknowledgement(alertTarget[1],body,key),requestId,authorize),requestId});return;
        }
        if(adminPath==='/clusters/register'){
          send(200,{...await store.admin.register(actor,body,key,requestId,authorize),requestId});return;
        }
        const target=adminPath.match(/^\/clusters\/([a-z][a-z0-9-]{1,39})\/commands$/);
        if(target){
          const command=clusterCommand(body,key,target[1]);
          let result=await store.admin.replay(actor,command);
          if(result){await assertLiveSupportAuthority(actor,authorize)}else{
            let validation;
            if(command.operation==='validate')validation=await gateway.validateCluster(await store.admin.cluster(target[1]));
            result=await store.admin.execute(actor,command,requestId,validation,authorize);
          }
          send(200,{...result,requestId});return;
        }
        throw new ControlError(404,'NOT_FOUND','Không tìm thấy thao tác quản trị.');
      }
      if(req.method==='GET'&&path===`${prefix}/support/reconcile-result`){
        const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1],actor=await gateway.supportActor(token);
        requireCapability(actor,'support-reconcile',config);
        const query=new URL(req.url,'http://control.invalid').searchParams;
        if([...query.keys()].length!==1||!query.has('workspaceId'))throw new ControlError(400,'INVALID_SUPPORT_LOOKUP','Cần đúng mã đăng ký gốc.');
        const result=await supportReconcileResult(store,actor,query.get('workspaceId'),req.headers['idempotency-key']);
        await assertLiveSupportAuthority(actor,()=>gateway.supportActor(token,{timeoutMs:5000}));
        if(!result)throw new ControlError(404,'SUPPORT_RESULT_NOT_FOUND','Chưa có kết quả thành công. Giữ nguyên mã lệnh để đối soát.');
        send(200,{...result,requestId});return;
      }
      if(req.method==='POST' && [`${prefix}/support/lookup`,`${prefix}/support/reconcile`].includes(path)) {
        const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const actor=await gateway.supportActor(token);
        requireCapability(actor,path.endsWith('/reconcile')?'support-reconcile':'platform-read',config);
        const body=await readBody(req);
        const result=path.endsWith('/lookup')?await inspectSupport(store,gateway,body.query)
          :await reconcileSupport(store,gateway,actor,body,requestId,supportCommandAuthorizer(gateway,actor,token),req.headers['idempotency-key']);
        if(path.endsWith('/lookup'))await assertLiveSupportAuthority(actor,()=>gateway.supportActor(token,{timeoutMs:5000}));
        send(200,{...result,requestId}); return;
      }
      if(req.method==='POST' && path===`${prefix}/signup-intents`) {
        if(!config.signupEnabled) throw new ControlError(503,'SIGNUP_CLOSED','Hệ thống đang tạm dừng đăng ký doanh nghiệp mới.');
        const w=await store.reserve(await readBody(req),requestId);
        send(201,{slug:w.slug,expiresAt:w.expires_at || null,path:`/app/${w.slug}/auth/${w.status==='active'||w.owner_id?'login':'register'}`}); return;
      }
      const match=path.match(/^\/api\/control\/workspaces\/([a-z0-9-]+)\/(bootstrap|provision|setup-status)$/);
      if(!match) throw new ControlError(404,'NOT_FOUND','Không tìm thấy yêu cầu.');
      if(req.method==='GET'&&match[2]==='setup-status'){
        const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        send(200,await workspaceSetupStatus(store,gateway,match[1],token,requestId,new URL(req.url,'http://control.invalid').searchParams));return;
      }
      let workspace=await store.workspace(match[1]);
      if(req.method==='GET' && match[2]==='bootstrap') {
        // Recover a successful cluster commit even when directory activation/HTTP response was lost.
        if(workspace.status!=='active') {
          failureWorkspaceId=workspace.id;
          const binding=await gateway.binding(workspace);
          if(binding?.tenant_id) workspace=await recoverSetupReceipt(store,gateway,workspace,binding,requestId);
        }
        send(200,publicBootstrap(workspace)); return;
      }
      if(req.method==='POST' && match[2]==='provision') {
        const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const user=await gateway.user(workspace,token);
        if(store.hashEmail(user.email)!==workspace.email_hash || (workspace.owner_id && workspace.owner_id!==user.id)) {
          throw new ControlError(403,'OWNER_MISMATCH','Tài khoản này không có quyền thiết lập doanh nghiệp.');
        }
        const fields=await readBody(req);
        // Only business fields are accepted. IDs, email and subscription/role come from server.
        const keys=['fullName','phone','tenantName','hotelName','hotelAddress','hotelPhone','hotelEmail','totalRooms'];
        const clean=Object.fromEntries(keys.map(k=>[k,fields[k]]));
        failureWorkspaceId=workspace.id;
        const result=await provisionWorkspace(store,gateway,workspace,user,clean,requestId,config.setupDispatchEnabled===true);
        if(result.status===202)res.setHeader('Retry-After',String(result.body.retryAfter));
        send(result.status,result.body);return;
      }
      throw new ControlError(405,'METHOD_NOT_ALLOWED','Phương thức không hỗ trợ.');
    } catch(error) {
      const status=error instanceof ControlError?error.status:503;
      if(status===429||error.code==='CONTROL_OVERLOADED')res.setHeader('Retry-After',String(error.retryAfter??60));
      if(failureWorkspaceId) {
        try {await store.recordFailure(failureWorkspaceId,requestId,error instanceof ControlError?error.code:'CONTROL_UNAVAILABLE')}
        catch {console.error(JSON.stringify({requestId,code:'ATTEMPT_AUDIT_UNAVAILABLE'}))}
      }
      if(!(error instanceof ControlError)) console.error(JSON.stringify({requestId,code:'CONTROL_UNAVAILABLE'}));
      send(status,{error:error instanceof ControlError?error.code:'CONTROL_UNAVAILABLE',
        message:error instanceof ControlError?error.message:'Dịch vụ thiết lập đang tạm gián đoạn. Vui lòng thử lại.',requestId});
    } finally { releaseSlot?.() }
  });
}
