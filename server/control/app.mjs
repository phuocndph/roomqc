import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { ControlError } from './store.mjs';
import { inspectSupport, reconcileSupport } from './support.mjs';

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
  const buckets=new Map();
  return createServer(async (req,res) => {
    const requestId=randomUUID();
    let failureWorkspaceId;
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Request-Id',requestId);
    const send=(status,data) => {
      if(lifecycle.draining)res.setHeader('Connection','close');
      res.writeHead(status);res.end(JSON.stringify(data));
    };
    try {
      const path=new URL(req.url,'http://control.invalid').pathname;
      if (req.method==='GET' && path===`${prefix}/livez`) {
        send(200,{status:'alive'}); return;
      }
      if(lifecycle.draining) {
        res.setHeader('Connection','close');
        throw new ControlError(503,'CONTROL_DRAINING','Dịch vụ đang khởi động lại. Vui lòng thử lại.');
      }
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
      if(bucket.count>120 || buckets.size>10000) throw new ControlError(429,'RATE_LIMIT','Quá nhiều yêu cầu. Vui lòng thử lại sau.');
      if(req.method==='POST' && req.headers.origin!==config.publicOrigin) throw new ControlError(403,'ORIGIN_DENIED','Nguồn yêu cầu không hợp lệ.');
      if(req.method==='POST' && !/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new ControlError(415,'CONTENT_TYPE','Yêu cầu phải là JSON.');
      if(req.method==='POST' && [`${prefix}/support/lookup`,`${prefix}/support/reconcile`].includes(path)) {
        const token=req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
        const actor=await gateway.supportActor(token);
        const body=await readBody(req);
        const result=path.endsWith('/lookup')?await inspectSupport(store,gateway,body.query)
          :await reconcileSupport(store,gateway,actor,body,requestId);
        send(200,{...result,requestId}); return;
      }
      if(req.method==='POST' && path===`${prefix}/signup-intents`) {
        if(!config.signupEnabled) throw new ControlError(503,'SIGNUP_CLOSED','Hệ thống đang tạm dừng đăng ký doanh nghiệp mới.');
        const w=await store.reserve(await readBody(req),requestId);
        send(201,{slug:w.slug,expiresAt:w.expires_at || null,path:`/app/${w.slug}/auth/${w.status==='active'||w.owner_id?'login':'register'}`}); return;
      }
      const match=path.match(/^\/api\/control\/workspaces\/([a-z0-9-]+)\/(bootstrap|provision)$/);
      if(!match) throw new ControlError(404,'NOT_FOUND','Không tìm thấy yêu cầu.');
      let workspace=await store.workspace(match[1]);
      if(req.method==='GET' && match[2]==='bootstrap') {
        // Recover a successful cluster commit even when directory activation/HTTP response was lost.
        if(workspace.status!=='active') {
          failureWorkspaceId=workspace.id;
          const binding=await gateway.binding(workspace);
          if(binding?.tenant_id) workspace=await store.activate(workspace,binding,requestId);
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
        // Persist the no-expiry state BEFORE the remote call. A lost response
        // or concurrent cleanup must never make a committed business reusable.
        workspace=await store.beginProvision(workspace,user,requestId);
        failureWorkspaceId=workspace.id;
        const result=await gateway.provision(workspace,user,clean);
        if(!result?.success || !result.tenant_id || !result.hotel_id || result.owner_id!==user.id) {
          // RPC diagnostics can contain customer values from SQL constraints.
          // Keep public/operational logs keyed by request ID, not raw payloads.
          console.error(JSON.stringify({requestId,code:'CLUSTER_REJECTED'}));
          await store.audit(workspace.id,requestId,'cluster_rejected');
          throw new ControlError(422,'PROVISIONING_REJECTED','Không thể hoàn tất thiết lập. Kiểm tra thông tin và thử lại; nếu vẫn lỗi, cung cấp mã hỗ trợ.');
        }
        // The provision RPC is scoped by the server-supplied workspace ID;
        // its legacy success payload omits that field. Never infer it for a
        // receipt read, which must carry its own immutable workspace ID.
        await store.activate(workspace,{...result,workspace_id:workspace.id},requestId);
        send(200,{success:true,tenant_id:result.tenant_id,hotel_id:result.hotel_id,idempotent:!!result.idempotent}); return;
      }
      throw new ControlError(405,'METHOD_NOT_ALLOWED','Phương thức không hỗ trợ.');
    } catch(error) {
      const status=error instanceof ControlError?error.status:503;
      if(failureWorkspaceId) {
        try {await store.recordFailure(failureWorkspaceId,requestId,error instanceof ControlError?error.code:'CONTROL_UNAVAILABLE')}
        catch {console.error(JSON.stringify({requestId,code:'ATTEMPT_AUDIT_UNAVAILABLE'}))}
      }
      if(!(error instanceof ControlError)) console.error(JSON.stringify({requestId,code:'CONTROL_UNAVAILABLE'}));
      send(status,{error:error instanceof ControlError?error.code:'CONTROL_UNAVAILABLE',
        message:error instanceof ControlError?error.message:'Dịch vụ thiết lập đang tạm gián đoạn. Vui lòng thử lại.',requestId});
    }
  });
}
