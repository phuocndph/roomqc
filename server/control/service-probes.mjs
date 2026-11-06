import {createHash,randomBytes} from 'node:crypto';
import {createClusterFetch} from './safe-http.mjs';
import {createClusterSocket} from './safe-websocket.mjs';
import {probeReleaseManifest,releaseExpectation,releaseExpectationFingerprint} from './release-manifest.mjs';
import {ControlError} from './errors.mjs';

const names=['auth','rest','storage','realtime','functions'];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const error=code=>new ControlError(503,code,'Kiểm tra dịch vụ chưa đạt điều kiện.');
const claim=token=>{try{return JSON.parse(Buffer.from(token.split('.')[1],'base64url'))}catch{return null}};
function probeCredential(credential){
  if(!exact(credential,['publishableKey','token'])||typeof credential.publishableKey!=='string'||!credential.publishableKey
    ||credential.publishableKey.length>16000||credential.publishableKey.startsWith('sb_secret_')
    ||claim(credential.publishableKey)?.role==='service_role'||typeof credential.token!=='string'||credential.token.length>16000
    ||claim(credential.token)?.role!=='roomqc_control_probe'||credential.token===credential.publishableKey)throw error('SERVICE_PROBES_UNCONFIGURED');
  return Object.freeze({...credential});
}

export function serviceProbeConfiguration(raw){
  if(!exact(raw,['expected','credential','auth','storage'])||!exact(raw.credential,['publishableKey','token'])
    ||!exact(raw.auth,['token','userId'])||!exact(raw.storage,['sha256']))throw error('SERVICE_PROBES_UNCONFIGURED');
  const expected=releaseExpectation(raw.expected),{auth,storage}=raw,credential=probeCredential(raw.credential);
  if(typeof auth.token!=='string'||auth.token.length>16000
    ||claim(auth.token)?.role!=='authenticated'||claim(auth.token)?.sub!==auth.userId||!uuid.test(auth.userId)
    ||!uuid.test(claim(auth.token)?.session_id)||!Number.isFinite(claim(auth.token)?.exp)
    ||!/^[a-f0-9]{64}$/.test(storage.sha256))throw error('SERVICE_PROBES_UNCONFIGURED');
  return Object.freeze({expected,credential,auth:Object.freeze({...auth}),storage:Object.freeze({...storage})});
}
async function deadline(run,signal){
  signal.throwIfAborted();let listener;
  const aborted=new Promise((resolve,reject)=>{listener=()=>reject(signal.reason);signal.addEventListener('abort',listener,{once:true})});
  try{return await Promise.race([Promise.resolve().then(run),aborted])}finally{signal.removeEventListener('abort',listener)}
}
function status(error_,signal){
  if(signal.aborted)return 'timeout';
  if(['SERVICE_PROBE_DENIED'].includes(error_?.code))return 'denied';
  if(['SERVICE_PROBES_UNCONFIGURED','RELEASE_MANIFEST_REQUIRED'].includes(error_?.code))return 'unconfigured';
  if(['SERVICE_PROBE_INVALID','RELEASE_MANIFEST_MISMATCH'].includes(error_?.code)||error_ instanceof SyntaxError)return 'invalid_response';
  return 'unreachable';
}
function inbox(socket,signal){
  const queue=[];let pending,failed;
  const onMessage=data=>{try{const value=JSON.parse(data.toString());if(pending){const p=pending;pending=null;p.resolve(value)}else{
    if(queue.length>=32)throw error('SERVICE_PROBE_INVALID');queue.push(value)
  }}catch{fail(error('SERVICE_PROBE_INVALID'))}};
  const fail=value=>{failed=value;if(pending){const p=pending;pending=null;p.reject(value)}};
  const onClose=()=>fail(error('SERVICE_PROBE_UNAVAILABLE')),onError=()=>fail(error('SERVICE_PROBE_UNAVAILABLE')),
    abort=()=>fail(signal.reason);
  socket.on('message',onMessage);socket.on('close',onClose);socket.on('error',onError);signal.addEventListener('abort',abort,{once:true});
  return {next:()=>{if(failed)return Promise.reject(failed);if(queue.length)return Promise.resolve(queue.shift());
    return new Promise((resolve,reject)=>{pending={resolve,reject}})},dispose:()=>{
    socket.off('message',onMessage);socket.off('close',onClose);socket.off('error',onError);signal.removeEventListener('abort',abort);
  }};
}
async function realtimeCheck(connect,cluster,credential,signal){
  const url=new URL((cluster.internalUrl||cluster.url)+'/realtime/v1/websocket');url.protocol=url.protocol==='https:'?'wss:':'ws:';
  url.searchParams.set('apikey',credential.publishableKey);url.searchParams.set('vsn','1.0.0');
  const sockets=[],boxes=[],topic='realtime:roomqc-control-probe';
  try{
    for(let i=0;i<2;i++){
      const socket=await connect(url.href,{signal,headers:{authorization:'Bearer '+credential.token}},cluster);
      sockets.push(socket);const box=inbox(socket,signal);boxes.push(box);
      socket.send(JSON.stringify({topic,event:'phx_join',ref:'1',join_ref:'1',payload:{access_token:credential.token,
        config:{private:true,broadcast:{ack:true,self:false},presence:{enabled:false},postgres_changes:[]}}}));
      const reply=await box.next();
      if(reply.event!=='phx_reply'||reply.ref!=='1'||reply.topic!==topic||reply.payload?.status!=='ok')throw error('SERVICE_PROBE_DENIED');
    }
    const nonce=randomBytes(32).toString('hex');
    sockets[0].send(JSON.stringify({topic,event:'broadcast',ref:'2',join_ref:'1',payload:{type:'broadcast',event:'roomqc-probe',payload:{nonce}}}));
    let received=false;
    for(let i=0;i<12;i++){
      const message=await boxes[1].next();
      if(message.event==='broadcast'&&message.topic===topic&&message.payload?.event==='roomqc-probe'
        &&message.payload?.payload?.nonce===nonce){received=true;break}
      if(message.event==='phx_error'||message.event==='phx_close')throw error('SERVICE_PROBE_INVALID');
    }
    if(!received)throw error('SERVICE_PROBE_INVALID');
  }finally{for(const box of boxes)box.dispose();for(const socket of sockets)socket.terminate()}
}

// Deployment initialization must exercise the real private channel before a
// trusted build freezes its schema. It does not require or install a manifest,
// and is not a replacement for the complete five-service health decision.
export async function probeRealtimeCanary(config,cluster,credential,{signal,connect,timeoutMs=5000}={}){
  credential=probeCredential(credential);
  if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>5000)throw error('SERVICE_PROBES_UNCONFIGURED');
  const deadline_=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
  await deadline(()=>realtimeCheck(connect??createClusterSocket(config),cluster,credential,deadline_),deadline_);
}

// Deployment/acceptance check, not part of the five-second health path. Pinned
// Realtime v2.143.3 intentionally sleeps CHANNEL_ERROR_BACKOFF_MS (5000ms) before
// replying to a rejected join. Keep that server protection; await an explicit,
// correlated Unauthorized reply within a separate bounded acceptance deadline.
export async function verifyRealtimeProbeIsolation(config,cluster,credential,{signal,connect,timeoutMs=8000}={}){
  credential=probeCredential(credential);
  if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>10000)throw error('SERVICE_PROBES_UNCONFIGURED');
  const deadline_=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
  const name='roomqc-control-probe-denied',topic='realtime:'+name,ref='isolation-1';
  const url=new URL((cluster.internalUrl||cluster.url)+'/realtime/v1/websocket');
  url.protocol=url.protocol==='https:'?'wss:':'ws:';url.searchParams.set('apikey',credential.publishableKey);url.searchParams.set('vsn','1.0.0');
  let socket,box;
  try{
    return await deadline(async()=>{
      socket=await (connect??createClusterSocket(config))(url.href,{signal:deadline_,headers:{authorization:'Bearer '+credential.token}},cluster);
      box=inbox(socket,deadline_);
      socket.send(JSON.stringify({topic,event:'phx_join',ref,join_ref:ref,payload:{access_token:credential.token,
        config:{private:true,broadcast:{ack:true,self:false},presence:{enabled:false},postgres_changes:[]}}}));
      const reply=await box.next();
      if(reply.event!=='phx_reply'||reply.topic!==topic||reply.ref!==ref||reply.payload?.status!=='error'
        ||reply.payload?.response?.reason!=='Unauthorized: You do not have permissions to read from this Channel topic: '+name){
        throw error('SERVICE_PROBE_INVALID');
      }
      return Object.freeze({verified:true,event:'phx_reply',status:'error',reasonCode:'Unauthorized',matchedRequest:true,timeoutMs});
    },deadline_);
  }finally{box?.dispose();socket?.terminate()}
}

export async function collectServiceProbes(config,cluster,input,{signal,fetcher,connect,clock=Date.now,timeoutMs=5000}={}){
  const settings=serviceProbeConfiguration(input);if(settings.expected.clusterId!==cluster.id)throw error('SERVICE_PROBES_UNCONFIGURED');
  if(!Number.isInteger(timeoutMs)||timeoutMs<10||timeoutMs>5000)throw error('SERVICE_PROBES_UNCONFIGURED');
  fetcher??=createClusterFetch(config,{maxResponseBytes:16384});connect??=createClusterSocket(config);
  const fingerprint=releaseExpectationFingerprint(settings.expected),origin=cluster.internalUrl||cluster.url;
  const request=async(path,deadline_,{token=settings.credential.token,body}={})=>{
    const result=await fetcher(origin+path,{method:body===undefined?'GET':'POST',redirect:'error',signal:deadline_,
      headers:{apikey:settings.credential.publishableKey,authorization:'Bearer '+token,'content-type':'application/json'},
      ...(body===undefined?{}:{body:JSON.stringify(body)})},cluster);
    if([401,403].includes(result.status))throw error('SERVICE_PROBE_DENIED');
    if(!result.ok)throw error(result.status>=500?'SERVICE_PROBE_UNAVAILABLE':'SERVICE_PROBE_INVALID');return result;
  };
  const actions={
    auth:async deadline_=>{
      const value=await (await request('/auth/v1/user',deadline_,{token:settings.auth.token})).json();
      if(value?.id!==settings.auth.userId||!value.email_confirmed_at)throw error('SERVICE_PROBE_INVALID');
    },
    rest:deadline_=>probeReleaseManifest(config,cluster,{expected:settings.expected,credential:settings.credential,
      signal:deadline_,fetcher,now:clock()}),
    storage:async deadline_=>{
      const response=await request('/storage/v1/object/authenticated/roomqc-control-probe/health.bin',deadline_);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length<1||bytes.length>4096||createHash('sha256').update(bytes).digest('hex')!==settings.storage.sha256)throw error('SERVICE_PROBE_INVALID');
    },
    realtime:deadline_=>realtimeCheck(connect,cluster,settings.credential,deadline_),
    functions:async deadline_=>{
      const challenge=randomBytes(32).toString('hex');
      const value=await (await request('/functions/v1/control-probe',deadline_,{body:{challenge}})).json();
      const timestamp=Date.parse(value?.checkedAt);
      if(!exact(value,['contractVersion','service','clusterId','releaseId','challenge','checkedAt'])||value.contractVersion!==3
        ||value.service!=='functions'||value.clusterId!==cluster.id||value.releaseId!==settings.expected.releaseId||value.challenge!==challenge
        ||!Number.isFinite(timestamp)||timestamp>clock()+5000||timestamp<clock()-30000)throw error('SERVICE_PROBE_INVALID');
    },
  };
  const results=await Promise.all(names.map(async service=>{
    const started=clock(),deadline_=signal?AbortSignal.any([signal,AbortSignal.timeout(timeoutMs)]):AbortSignal.timeout(timeoutMs);
    let state='ok';try{await deadline(()=>actions[service](deadline_),deadline_)}catch(error_){state=status(error_,deadline_)}
    return Object.freeze({service,status:state,checkedAt:new Date(clock()).toISOString(),durationMs:Math.max(0,clock()-started),
      reasonCode:state==='ok'?'SERVICE_PROBE_OK':'SERVICE_PROBE_'+state.toUpperCase(),clusterId:cluster.id,
      releaseId:settings.expected.releaseId,targetFingerprint:fingerprint});
  }));
  return Object.freeze({probes:Object.freeze(Object.fromEntries(results.map(r=>[r.service,r.status==='ok']))),results:Object.freeze(results)});
}
