import {ControlError} from '../errors.mjs';
import {dispatchMatches} from '../setup-dispatch.mjs';

const reviewCodes=new Set(['RECOVERY_CREDENTIAL_INVALID','RECOVERY_CREDENTIAL_DENIED','RECOVERY_RECEIPT_INVALID',
  'RECOVERY_TARGET_CHANGED','SETUP_TARGET_UNCONFIGURED']);
const interrupted=signal=>({outcome:'retry',code:signal.reason?.name==='TimeoutError'?'SETUP_TIMEOUT':'SETUP_INTERRUPTED'});
export function createSetupReconciler(gateways){
  const targets=new Map(gateways);
  if(!targets.size||targets.size>128||[...targets].some(([id,g])=>id!==g?.binding?.clusterId||typeof g?.close!=='function'))
    throw new ControlError(400,'INVALID_SETUP_WORKER','Đích đối soát chưa hợp lệ.');
  return async(claim,{signal})=>{
    try{
      signal.throwIfAborted();
      const gateway=targets.get(claim.workspace?.cluster_id);
      if(!gateway)return {outcome:'review',code:'SETUP_TARGET_UNCONFIGURED'};
      if(gateway.binding.url!==claim.workspace.api_url)return {outcome:'review',code:'RECOVERY_TARGET_CHANGED'};
      // Close is idempotent: it returns committed proof or creates a tombstone.
      // A missing receipt alone never authorizes a new provisioning request.
      const receipt=await gateway.close(claim.workspace,claim.dispatch,{signal});
      signal.throwIfAborted();
      if(receipt?.state==='busy'){
        const d=claim.dispatch,w=claim.workspace;
        if(receipt.dispatch_id!==d.id||receipt.workspace_id!==w.id||receipt.owner_id!==w.owner_id
          ||receipt.routing_version!==w.routing_version||receipt.payload_sha256!==d.payload_sha256)
          return {outcome:'review',code:'RECOVERY_RECEIPT_INVALID'};
        return {outcome:'retry',code:'SETUP_BUSY'};
      }
      if(!dispatchMatches(claim.workspace,claim.dispatch,receipt))return {outcome:'review',code:'RECOVERY_RECEIPT_INVALID'};
      // Persist only protocol evidence, never a provider body, token or URL.
      return {outcome:'terminal',receipt:Object.fromEntries(['dispatch_id','workspace_id','owner_id','routing_version',
        'payload_sha256','state','success','tenant_id','hotel_id'].map(key=>[key,receipt[key]]))};
    }catch(error){
      if(signal.aborted)return interrupted(signal);
      return reviewCodes.has(error?.code)?{outcome:'review',code:error.code}:{outcome:'retry',code:'RECOVERY_UNAVAILABLE'};
    }
  };
}
export class SetupWorker{
  constructor({store,reconcile,concurrency=2,intervalMs=1000,requestTimeoutMs=6000,shutdownTimeoutMs=10000,onEvent=()=>{}}){
    if(!store||!['readiness','claim','settle'].every(key=>typeof store[key]==='function')||typeof reconcile!=='function'
      ||!Number.isSafeInteger(concurrency)||concurrency<1||concurrency>4
      ||!Number.isSafeInteger(intervalMs)||intervalMs<100||intervalMs>30000
      ||!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<10||requestTimeoutMs>15000
      ||!Number.isSafeInteger(shutdownTimeoutMs)||shutdownTimeoutMs<100||shutdownTimeoutMs>20000)
      throw new ControlError(400,'INVALID_SETUP_WORKER','Cấu hình worker đối soát không hợp lệ.');
    Object.assign(this,{store,reconcile,concurrency,intervalMs,requestTimeoutMs,shutdownTimeoutMs,onEvent});
    this.stopping=false;this.ready=false;this.lastCycleAt=null;this.lastErrorCode=null;
  }
  emit(event){try{this.onEvent(event)}catch{/* A telemetry sink cannot change settlement. */}}
  status(){return {alive:!this.stopping,ready:!this.stopping&&this.ready
    &&Date.now()-Date.parse(this.lastCycleAt)<this.intervalMs+this.requestTimeoutMs+16000,
    active:!!this.running,lastCycleAt:this.lastCycleAt,lastErrorCode:this.lastErrorCode}}
  async dispatch(){
    if(this.stopping)return;
    const claim=await this.store.claim();if(!claim)return;
    if(claim.exhausted){this.emit({type:'setup_recovery_review',jobId:claim.id,code:claim.code});return}
    if(this.stopping){await this.store.settle(claim,{outcome:'retry',code:'SETUP_INTERRUPTED'});return}
    const signal=AbortSignal.any([this.abort.signal,AbortSignal.timeout(this.requestTimeoutMs)]);let listener;
    const stopped=new Promise(resolve=>{listener=()=>resolve(interrupted(signal));
      if(signal.aborted)listener();else signal.addEventListener('abort',listener,{once:true})});
    let result;
    try{result=await Promise.race([Promise.resolve().then(()=>this.reconcile(claim,{signal})),stopped])}
    catch{result={outcome:'retry',code:'RECOVERY_UNAVAILABLE'}}finally{signal.removeEventListener('abort',listener)}
    const settled=await this.store.settle(claim,result);
    this.emit({type:'setup_recovery_result',jobId:claim.id,attempt:claim.attempt,settled:settled?.settled===true,
      ...(settled?.settled?{state:settled.state}:{}),...(result.code?{code:result.code}:{})});
  }
  async tick(){
    if(this.stopping)return {skipped:true,reason:'STOPPING'};
    if(this.running)return {skipped:true,reason:'ALREADY_RUNNING'};
    this.abort=new AbortController();
    this.running=(async()=>{
      try{
        await this.store.readiness();
        if(this.stopping)return;
        const results=await Promise.allSettled(Array.from({length:this.concurrency},()=>this.dispatch()));
        if(results.some(r=>r.status==='rejected'))throw new Error('dependency');
        this.ready=!this.stopping;this.lastErrorCode=null;
      }catch{this.ready=false;this.lastErrorCode='SETUP_DEPENDENCY_FAILED';this.emit({type:'setup_worker_unavailable',code:this.lastErrorCode})}
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
    const timedOut=await Promise.race([Promise.resolve(this.running).then(()=>false),
      new Promise(resolve=>{timer=setTimeout(()=>resolve(true),this.shutdownTimeoutMs)})]);
    clearTimeout(timer);return {timedOut};
  }
}
