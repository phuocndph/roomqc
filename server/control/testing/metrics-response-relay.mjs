// Disposable full-vendor acceptance instrumentation only. Never mounted by the
// production worker entry point. Both listeners bind loopback; upstream is fixed.
import http from 'node:http';
import {createHash,randomUUID,timingSafeEqual} from 'node:crypto';

const origin='http://managed-prometheus:9090';
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const error=code=>Object.assign(new Error(code),{code});
export async function createMetricsResponseRelay({token,metricsPort=19090,controlPort=19091,
  holdMs=6000,armMs=75000,fetchImpl=fetch}={}){
  if(!/^[a-f0-9]{64}$/.test(token??'')||![metricsPort,controlPort].every(p=>Number.isInteger(p)&&p>=0&&p<=65535)
    ||!Number.isInteger(holdMs)||holdMs<10||holdMs>6000||!Number.isInteger(armMs)||armMs<holdMs||armMs>75000)
    throw error('METRICS_RELAY_CONFIG_INVALID');
  const epoch=randomUUID();let generation=0,current=null,closing=false;
  const controllers=new Set();
  const view=()=>({epoch,generation,phase:current?.phase??'idle',armedAt:current?.armedAt??null,
    heldAt:current?.heldAt??null,releasedAt:current?.releasedAt??null,releaseReason:current?.releaseReason??null,
    upstreamStatus:current?.upstreamStatus??null,byteLength:current?.byteLength??null,sha256:current?.sha256??null});
  const release=(entry,reason)=>{
    if(!entry||entry!==current||!['armed','held'].includes(entry.phase))return;
    clearTimeout(entry.timer);entry.phase='released';entry.releasedAt=Date.now();entry.releaseReason=reason;
    entry.resolve?.();
  };
  const matches=value=>value.epoch===epoch&&value.generation===generation;
  const respond=(res,status,value)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(value))};
  const control=http.createServer(async(req,res)=>{
    try{
      const supplied=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
      if(!supplied||!timingSafeEqual(Buffer.from(supplied),Buffer.from(token))){respond(res,403,{error:'RELAY_AUTH_REQUIRED'});return}
      if(req.method==='GET'&&req.url==='/status'){respond(res,200,view());return}
      if(req.method!=='POST'||!['/arm','/release'].includes(req.url)){respond(res,404,{error:'RELAY_NOT_FOUND'});return}
      if(req.headers['content-type']!=='application/json'){respond(res,415,{error:'RELAY_JSON_REQUIRED'});return}
      let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>1024)throw error('RELAY_BODY_INVALID')}
      let value;try{value=JSON.parse(body)}catch{throw error('RELAY_BODY_INVALID')}
      if(!exact(value,['epoch','generation'])||!Number.isSafeInteger(value.generation)||value.generation<0)throw error('RELAY_BODY_INVALID');
      if(!matches(value)){respond(res,409,{error:'RELAY_GENERATION_CHANGED'});return}
      if(req.url==='/arm'){
        if(closing||['armed','held'].includes(current?.phase)){respond(res,409,{error:'RELAY_BUSY'});return}
        generation++;current={phase:'armed',armedAt:Date.now()};
        const entry=current;entry.timer=setTimeout(()=>release(entry,'arm_timeout'),armMs);
      }else release(current,'operator');
      respond(res,200,view());
    }catch{if(!res.destroyed)respond(res,400,{error:'RELAY_BODY_INVALID'})}
  });
  const metrics=http.createServer(async(req,res)=>{
    const controller=new AbortController();controllers.add(controller);
    let entry,onClose;
    try{
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method!=='GET'||url.origin!=='http://127.0.0.1'||url.pathname!=='/api/v1/query'
        ||url.search.length>32768){res.writeHead(404);res.end();return}
      const result=await fetchImpl(origin+url.pathname+url.search,
        {redirect:'error',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(4000)])});
      const chunks=[];let size=0;
      for await(const chunk of result.body){size+=chunk.length;if(size>128*1024)throw error('RELAY_UPSTREAM_TOO_LARGE');chunks.push(Buffer.from(chunk))}
      const bytes=Buffer.concat(chunks);
      // Only an authentic successful response is held. Never synthesize or
      // modify success bytes, timestamps, values or the production deadlines.
      if(result.status===200&&current?.phase==='armed'&&!res.destroyed){
        entry=current;clearTimeout(entry.timer);entry.phase='held';entry.heldAt=Date.now();
        entry.upstreamStatus=result.status;entry.byteLength=bytes.length;entry.sha256=createHash('sha256').update(bytes).digest('hex');
        const held=new Promise(resolve=>{entry.resolve=resolve});
        entry.timer=setTimeout(()=>release(entry,'hold_timeout'),holdMs);
        onClose=()=>release(entry,'client_closed');res.once('close',onClose);
        await held;
      }
      if(!res.destroyed){res.writeHead(result.status,{'content-type':result.headers.get('content-type')??'application/json'});res.end(bytes)}
    }catch{if(!res.destroyed){res.writeHead(503,{'content-type':'application/json'});res.end('{"status":"error"}')}}
    finally{if(onClose)res.removeListener('close',onClose);controllers.delete(controller)}
  });
  control.requestTimeout=2000;control.headersTimeout=2000;metrics.requestTimeout=15000;metrics.headersTimeout=2000;
  const listen=(server,port)=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  const closeServer=async server=>{if(!server.listening)return;server.closeAllConnections();await new Promise(resolve=>server.close(resolve))};
  try{await listen(metrics,metricsPort);await listen(control,controlPort)}
  catch(cause){await closeServer(metrics);await closeServer(control);throw cause}
  let shutdown;
  return {metricsPort:metrics.address().port,controlPort:control.address().port,
    close:()=>shutdown??=(async()=>{closing=true;release(current,'shutdown');for(const c of controllers)c.abort();
      await Promise.all([closeServer(metrics),closeServer(control)])})()};
}
