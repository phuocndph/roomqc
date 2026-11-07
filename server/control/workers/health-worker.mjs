import {randomUUID} from 'node:crypto';
import {ControlError} from '../errors.mjs';
import {validateTelemetryTarget} from '../telemetry-source.mjs';
import {normalizeHealthProof} from '../health-evidence.mjs';

const failureCode=error=>error instanceof ControlError?error.code:'HEALTH_DEPENDENCY_FAILED';
async function bounded(run,signal){
  signal.throwIfAborted();let listener;
  const stopped=new Promise((resolve,reject)=>{
    listener=()=>reject(signal.reason);signal.addEventListener('abort',listener,{once:true});
  });
  try{return await Promise.race([Promise.resolve().then(run),stopped])}
  finally{signal.removeEventListener('abort',listener)}
}
export class HealthWorker {
  constructor({store,targets,sourceFor,probe,clock=Date.now,random=Math.random,
    intervalMs=30000,targetTimeoutMs=25000,concurrency=2,shutdownTimeoutMs=10000,onEvent=()=>{}}){
    if(!store||!Array.isArray(targets)||targets.length<1||targets.length>100
      ||typeof sourceFor!=='function'||typeof probe!=='function'
      ||!Number.isInteger(intervalMs)||intervalMs<100||intervalMs>30000
      ||!Number.isInteger(targetTimeoutMs)||targetTimeoutMs<10||targetTimeoutMs>25000
      ||!Number.isInteger(concurrency)||concurrency<1||concurrency>4
      ||!Number.isInteger(shutdownTimeoutMs)||shutdownTimeoutMs<10||shutdownTimeoutMs>30000){
      throw new ControlError(400,'INVALID_HEALTH_WORKER','Cấu hình worker giám sát không hợp lệ.');
    }
    const clean=targets.map(validateTelemetryTarget);
    if(new Set(clean.map(t=>t.clusterId)).size!==clean.length)throw new ControlError(400,'INVALID_HEALTH_WORKER','Cụm giám sát bị trùng.');
    Object.assign(this,{store,targets:clean,sourceFor,probe,clock,random,intervalMs,targetTimeoutMs,concurrency,shutdownTimeoutMs,onEvent});
    this.controller=new AbortController();this.active=false;this.stopping=false;this.timer=null;this.current=null;
    this.state={startedAt:clock(),lastStartedAt:null,lastFinishedAt:null,lastSuccessfulAt:null,failures:0,consecutiveFailures:0,
      sweepSucceeded:false,targetsSucceeded:0,targetsFailed:0,lastErrorCode:null};
  }
  status(){
    const now=this.clock(),fresh=this.state.lastFinishedAt!==null&&now-this.state.lastFinishedAt<120000;
    return {...this.state,alive:!this.stopping,ready:!this.stopping&&fresh&&this.state.sweepSucceeded&&this.state.targetsFailed===0,
      active:this.active,targetCount:this.targets.length,heartbeatAt:this.state.lastFinishedAt};
  }
  tick(){
    if(this.stopping)return Promise.resolve({skipped:true,reason:'STOPPING'});
    if(this.active)return Promise.resolve({skipped:true,reason:'ALREADY_RUNNING'});
    this.active=true;this.current=this.run().finally(()=>{this.active=false;this.current=null});return this.current;
  }
  async run(){
    this.state.lastStartedAt=this.clock();let sweepSucceeded=false,success=0,failed=0,lastError=null;
    try{await this.store.readiness();await this.store.expireStale(randomUUID());sweepSucceeded=true}
    catch(error){lastError=failureCode(error)}
    // A source failure cannot prevent the independent stale sweep above.
    if(sweepSucceeded){
      let cursor=0;
      await Promise.all(Array.from({length:Math.min(this.concurrency,this.targets.length)},async()=>{
        while(cursor<this.targets.length&&!this.controller.signal.aborted){
          const target=this.targets[cursor++],signal=AbortSignal.any([this.controller.signal,AbortSignal.timeout(this.targetTimeoutMs)]);
          try{
            const context=await this.store.assertTarget(target);
            const sample=await bounded(async()=>{
              const result=await bounded(()=>this.probe(target,signal,context),signal);
              const evidence=normalizeHealthProof(result?.evidence);
              const measured=await this.sourceFor(target).collect(target,result.probes,signal);
              return {...measured,probeEvidence:evidence};
            },signal);
            signal.throwIfAborted();
            const result=await this.store.record(target.clusterId,sample,randomUUID());
            if(!result.accepted&&result.reason!=='SAMPLE_NOT_NEWER')throw new Error('Rejected snapshot');
            success++;
          }catch(error){failed++;lastError=signal.aborted?'HEALTH_TARGET_TIMEOUT':failureCode(error)}
        }
      }));
    }else failed=this.targets.length;
    const completed=this.clock();
    this.state={...this.state,lastFinishedAt:completed,sweepSucceeded,targetsSucceeded:success,targetsFailed:failed,lastErrorCode:lastError,
      failures:this.state.failures+(failed||!sweepSucceeded?1:0),
      consecutiveFailures:failed||!sweepSucceeded?this.state.consecutiveFailures+1:0,
      lastSuccessfulAt:!failed&&sweepSucceeded?completed:this.state.lastSuccessfulAt};
    try{this.onEvent({event:'health_cycle',...this.status()})}catch{}
    return this.status();
  }
  start(){
    if(this.loop||this.stopping)return;
    const cycle=async()=>{
      const started=this.clock();
      try{await this.tick()}catch{this.state.lastErrorCode='HEALTH_CYCLE_FAILED';this.state.failures++}
      if(this.stopping)return;
      const failures=Math.min(this.state.consecutiveFailures,3),backoff=failures?Math.min(60000,this.intervalMs*2**failures):this.intervalMs;
      // Cadence is start-to-start, not collection duration plus thirty seconds.
      const cadence=Math.floor(backoff*(0.9+Math.max(0,Math.min(1,this.random()))*0.2));
      this.timer=setTimeout(cycle,Math.max(100,cadence-(this.clock()-started)));
    };
    this.loop=true;void cycle();
  }
  async shutdown(){
    if(this.shutdownPromise)return this.shutdownPromise;
    this.stopping=true;clearTimeout(this.timer);this.controller.abort();
    this.shutdownPromise=(async()=>{
      let timer;const timedOut=await Promise.race([Promise.resolve(this.current).then(()=>false,()=>false),
        new Promise(resolve=>{timer=setTimeout(()=>resolve(true),this.shutdownTimeoutMs)})]);clearTimeout(timer);
      return {timedOut};
    })();return this.shutdownPromise;
  }
}
