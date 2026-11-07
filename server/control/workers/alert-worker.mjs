import {createClusterFetch} from '../safe-http.mjs';
import {ControlError} from '../errors.mjs';

export function createAlertSender(config,{lookup}={}){
  // Destination comes only from operator files, never from an alert or a request.
  const origin=new URL(config.endpoint).origin,cluster={id:'operations',url:origin};
  const request=createClusterFetch({allowLocal:config.allowLocal,inventory:new Map([['operations',{
    url:origin,approvedAddresses:config.approvedAddresses}]])},{lookup,maxResponseBytes:4096});
  return async (claim,{signal})=>{
    try{
      const response=await request(config.endpoint,{method:'POST',redirect:'error',signal,headers:{
        'content-type':'application/json','authorization':'Bearer '+config.token,'idempotency-key':claim.id,
        'x-roomqc-delivery-id':claim.id},body:JSON.stringify(claim.payload)},cluster);
      if(response.ok)return {outcome:'delivered'};
      if(response.status===429)return {outcome:'retry',code:'DELIVERY_RATE_LIMIT'};
      if(response.status>=500)return {outcome:'retry',code:'DELIVERY_SERVER_ERROR'};
      if(response.status===408)return {outcome:'retry',code:'DELIVERY_TIMEOUT'};
      return {outcome:'permanent',code:[401,403].includes(response.status)?'DELIVERY_AUTH_REJECTED':'DELIVERY_REJECTED'};
    }catch(error){
      if(signal.aborted)return {outcome:'retry',code:signal.reason?.name==='TimeoutError'?'DELIVERY_TIMEOUT':'DELIVERY_INTERRUPTED'};
      if(error?.code==='CLUSTER_DESTINATION_DENIED')return {outcome:'permanent',code:'DELIVERY_DESTINATION_DENIED'};
      if(error?.code==='CLUSTER_RESPONSE_TOO_LARGE')return {outcome:'retry',code:'DELIVERY_RESPONSE_INVALID'};
      return {outcome:'retry',code:'DELIVERY_NETWORK'};
    }
  };
}
export class AlertWorker {
  constructor({store,send,concurrency=2,intervalMs=1000,requestTimeoutMs=10000,shutdownTimeoutMs=15000,onEvent=()=>{}}){
    if(!store||!['readiness','claim','settle'].every(key=>typeof store[key]==='function')||typeof send!=='function'
      ||!Number.isInteger(concurrency)||concurrency<1||concurrency>4||!Number.isInteger(intervalMs)||intervalMs<100||intervalMs>30000
      ||!Number.isInteger(requestTimeoutMs)||requestTimeoutMs<10||requestTimeoutMs>15000
      ||!Number.isInteger(shutdownTimeoutMs)||shutdownTimeoutMs<100||shutdownTimeoutMs>20000)
      throw new ControlError(400,'INVALID_ALERT_WORKER','Cấu hình worker gửi cảnh báo không hợp lệ.');
    Object.assign(this,{store,send,concurrency,intervalMs,requestTimeoutMs,shutdownTimeoutMs,onEvent});
    this.stopping=false;this.lastCycleAt=null;this.lastErrorCode=null;this.ready=false;
  }
  emit(event){try{this.onEvent(event)}catch{/* Telemetry must not affect committed delivery. */}}
  status(){return {alive:!this.stopping,ready:!this.stopping&&this.ready&&Date.now()-Date.parse(this.lastCycleAt)<this.intervalMs+this.requestTimeoutMs+16000,
    active:!!this.running,lastCycleAt:this.lastCycleAt,lastErrorCode:this.lastErrorCode}}
  async dispatch(){
    if(this.stopping)return;
    const claim=await this.store.claim();if(!claim)return;
    if(claim.exhausted){this.emit({type:'alert_dead_letter',deliveryId:claim.id});return}
    if(this.stopping){await this.store.settle(claim,{outcome:'retry',code:'DELIVERY_INTERRUPTED'});return}
    const signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(this.requestTimeoutMs)]);
    let listener;
    const interrupted=new Promise(resolve=>{listener=()=>resolve({outcome:'retry',code:signal.reason?.name==='TimeoutError'?'DELIVERY_TIMEOUT':'DELIVERY_INTERRUPTED'});
      if(signal.aborted)listener();else signal.addEventListener('abort',listener,{once:true})});
    let result;
    try{result=await Promise.race([Promise.resolve().then(()=>this.send(claim,{signal})),interrupted])}
    catch{result={outcome:'retry',code:'DELIVERY_NETWORK'}}finally{signal.removeEventListener('abort',listener)}
    const settled=await this.store.settle(claim,result);
    this.emit({type:'alert_delivery_result',deliveryId:claim.id,attempt:claim.attempt,...settled,...(result.code?{code:result.code}:{})});
  }
  async tick(){
    if(this.stopping)return {skipped:true,reason:'STOPPING'};
    if(this.running)return {skipped:true,reason:'ALREADY_RUNNING'};
    this.abort=new AbortController();
    this.running=(async()=>{
      try{
        await this.store.readiness();
        const results=await Promise.allSettled(Array.from({length:this.concurrency},()=>this.dispatch()));
        if(results.some(r=>r.status==='rejected'))throw new Error('dependency');
        this.ready=true;this.lastErrorCode=null;
      }catch{this.ready=false;this.lastErrorCode='ALERT_DEPENDENCY_FAILED';this.emit({type:'alert_worker_unavailable',code:this.lastErrorCode})}
      finally{this.lastCycleAt=new Date().toISOString()}
    })();
    try{await this.running}finally{this.running=null}
  }
  start(){
    if(this.started||this.stopping)return;this.started=true;
    const cycle=async()=>{await this.tick();if(!this.stopping)this.timer=setTimeout(cycle,this.intervalMs)};void cycle();
  }
  async shutdown(){
    this.stopping=true;this.ready=false;clearTimeout(this.timer);this.abort?.abort();let timer;
    const timedOut=await Promise.race([Promise.resolve(this.running).then(()=>false),new Promise(resolve=>{timer=setTimeout(()=>resolve(true),this.shutdownTimeoutMs)})]);
    clearTimeout(timer);return {timedOut};
  }
}
