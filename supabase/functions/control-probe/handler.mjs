// This function has no imports, business access, provider calls or side effects.
// Verify the dedicated probe role even when the gateway's JWT check is disabled.
const hex=/^[a-f0-9]{64}$/;
const response=(status,body)=>new Response(JSON.stringify(body),{status,headers:{
  'content-type':'application/json','cache-control':'no-store',...(status===405?{allow:'POST'}:{})}});
function decode(value){
  if(!/^[A-Za-z0-9_-]+$/.test(value))throw new Error('Invalid encoding');
  return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
}
async function authorized(req,secret,time){
  const bearer=req.headers.get('authorization');
  if(typeof secret!=='string'||secret.length<32||!bearer||bearer.length>16000)return false;
  const match=/^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(bearer);
  if(!match)return false;
  try{
    const [header,body,signature]=match[1].split('.'),decoder=new TextDecoder('utf-8',{fatal:true});
    const h=JSON.parse(decoder.decode(decode(header))),claims=JSON.parse(decoder.decode(decode(body)));
    if(h.alg!=='HS256'||h.crit!==undefined||h.b64!==undefined||claims.role!=='roomqc_control_probe'
      ||!Number.isFinite(claims.exp)||claims.exp*1000<=time
      ||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf*1000>time)))return false;
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
    return crypto.subtle.verify('HMAC',key,decode(signature),new TextEncoder().encode(header+'.'+body));
  }catch{return false}
}
async function body(req){
  if(req.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new Error('Invalid type');
  const reader=req.body?.getReader();if(!reader)throw new Error('Missing body');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;
    size+=value.length;if(size>4096)throw new Error('Body limit');chunks.push(value);
  }}catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(!value||Array.isArray(value)||Object.keys(value).length!==1||!hex.test(value.challenge))throw new Error('Invalid challenge');
  return value.challenge;
}
export async function handleControlProbe(req,{jwtSecret,clusterId,releaseId,now=Date.now}={}){
  if(req.method!=='POST')return response(405,{code:'PROBE_METHOD_REQUIRED'});
  const time=now();
  if(!await authorized(req,jwtSecret,time))return response(401,{code:'PROBE_UNAUTHORIZED'});
  if(typeof clusterId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(clusterId)
    ||typeof releaseId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(releaseId)){
    return response(503,{code:'PROBE_IDENTITY_UNCONFIGURED'});
  }
  let challenge;try{challenge=await body(req)}catch{return response(400,{code:'PROBE_CHALLENGE_INVALID'})}
  return response(200,{contractVersion:3,service:'functions',clusterId,releaseId,challenge,checkedAt:new Date(time).toISOString()});
}
