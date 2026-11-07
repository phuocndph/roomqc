import http from 'node:http';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {ControlError} from '../errors.mjs';
import {HealthStore} from '../telemetry.mjs';
import {PrometheusSource} from '../telemetry-source.mjs';
import {HealthWorker} from './health-worker.mjs';
import {loadHealthConfiguration} from './health-config.mjs';
import {loadManagedHealthConfiguration,createHealthProbePool,createManagedHealthProbe} from './health-probes.mjs';
import {assertHealthResources,runtimeResourceView,resourcePoolObservationMode} from '../resource-runtime.mjs';
import {startResourcePoolStatus} from '../resource-pool-observation.mjs';

export function createHealthPool(config){
  assertHealthResources(config);
  const pool=new pg.Pool({connectionString:config.databaseUrl,max:config.poolMax,connectionTimeoutMillis:2000,
    idleTimeoutMillis:30000,statement_timeout:3000,lock_timeout:2000,idle_in_transaction_session_timeout:5000,
    application_name:'roomqc-health-worker'});
  pool.on('error',()=>{});return pool;
}
async function closePools(pools,timeoutMs){
  let timer;
  const result=await Promise.race([Promise.allSettled([...new Set(pools.filter(Boolean))].map(p=>Promise.resolve().then(()=>p.end())))
    .then(results=>results.some(r=>r.status==='rejected')),
  new Promise(resolve=>{timer=setTimeout(()=>resolve(true),timeoutMs)})]);clearTimeout(timer);return result;
}
export async function startHealthRuntime(config,{pool,store,probe,managed,probePool,probeStore,collect,sourceFor,
  onEvent=()=>{},port=8093,autoStart=true,poolObservations=false,poolStatusPort=8098}={}){
  assertHealthResources(config);
  const owned=[pool,probePool];let server,worker,poolStatus;
  const resources=runtimeResourceView(config,'health-worker');
  try{
    pool??=store?null:createHealthPool(config);owned.push(pool);store??=new HealthStore(pool);
    if(managed){
      if(probe||config.schemaVersion!==2||managed.poolMax!==config.connectionBudget.probePoolMax)
        throw new ControlError(503,'INVALID_MANAGED_HEALTH_CONFIG','Cấu hình worker giám sát chưa hợp lệ.');
      probePool??=createHealthProbePool(managed);owned.push(probePool);
      if(probePool===pool)throw new ControlError(503,'INVALID_MANAGED_HEALTH_CONFIG','Worker cần hai pool ít quyền riêng.');
      probe=createManagedHealthProbe(managed,probePool,{collect,store:probeStore});
    }else if(probePool||probeStore||collect)throw new ControlError(503,'INVALID_MANAGED_HEALTH_CONFIG','Thiếu cấu hình managed probe.');
    const sources=new Map(config.targets.map(entry=>[entry.target.clusterId,new PrometheusSource({...entry.prometheus,allowLocal:config.allowLocal})]));
    worker=new HealthWorker({store,targets:config.targets.map(e=>e.target),sourceFor:sourceFor??(target=>sources.get(target.clusterId)),
      // No configuration still means no positive fallback or ready admission.
      probe:probe??(async()=>{throw new ControlError(503,'HEALTH_PROBES_UNCONFIGURED','Chưa cấu hình đủ kiểm tra dịch vụ.')}),
      intervalMs:config.intervalMs,targetTimeoutMs:config.targetTimeoutMs,concurrency:config.concurrency,
      shutdownTimeoutMs:config.shutdownTimeoutMs,onEvent});
    if(poolObservations)poolStatus=await startResourcePoolStatus({resources,budget:config.resourceContext?.budget,pools:[
      {consumerId:'health-worker',getPool:()=>pool},...(config.schemaVersion===2?[{consumerId:'probe-catalog',getPool:()=>probePool}]:[])]},{port:poolStatusPort});
    server=http.createServer((req,res)=>{
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
    const path=req.url,view=worker.status();
    if(req.method!=='GET'||!['/livez','/readyz'].includes(path)){res.writeHead(404);res.end('{"status":"not_found"}');return}
    const ok=path==='/livez'?view.alive:view.ready;
    res.writeHead(ok?200:503);res.end(JSON.stringify({status:ok?'ok':'unavailable',instanceId:config.instanceId,...view,resources}));
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  }catch(error){
    await poolStatus?.stop();
    await worker?.shutdown();if(server?.listening){server.closeAllConnections();server.close()}
    await closePools(owned,config.shutdownTimeoutMs);throw error;
  }
  if(autoStart)worker.start();let closing;
  async function shutdown(){
    if(closing)return closing;
    closing=(async()=>{
      const draining=worker.shutdown();server.closeAllConnections();
      const observationsStopped=poolStatus?.stop();
      const closed=new Promise(resolve=>server.close(resolve));
      const result=await draining;
      const observationResult=await observationsStopped;
      const poolTimedOut=await closePools(owned,config.shutdownTimeoutMs);
      await closed;return {timedOut:result.timedOut||poolTimedOut||!!observationResult?.timedOut};
    })();return closing;
  }
  return {server,worker,pool,probePool,poolStatus,shutdown};
}
export async function healthMain(env=process.env){
  let runtime;
  try{
    const config=await loadHealthConfiguration(env);
    const managed=await loadManagedHealthConfiguration(env,config);
    runtime=await startHealthRuntime(config,{managed,poolObservations:resourcePoolObservationMode(env),onEvent:event=>process.stdout.write(JSON.stringify(event)+'\n')});
  }catch{process.stderr.write('RoomQC health worker failed to start (configuration redacted).\n');process.exitCode=1;return}
  let stopping=false;
  const stop=async()=>{
    if(stopping)return;stopping=true;
    const timer=setTimeout(()=>process.exit(1),22000);timer.unref();
    const {timedOut}=await runtime.shutdown();clearTimeout(timer);
    // A stuck DB socket must not hold a half-stopped worker indefinitely.
    process.exit(timedOut?1:0);
  };
  process.once('SIGTERM',stop);process.once('SIGINT',stop);
  return runtime;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--help'){
    process.stdout.write('RoomQC health worker (private, fail-closed).\nRequires ROOMQC_HEALTH_CONFIG_FILE and ROOMQC_HEALTH_DATABASE_URL_FILE absolute files.\nManaged probes require schemaVersion 2 and all three ROOMQC_HEALTH_PROBE_{CONFIG,DATABASE_URL,KEYRING}_FILE paths.\nWithout managed probes readiness remains closed.\n');
  }else if(process.argv.length!==2){process.stderr.write('Unsupported health worker arguments. Use --help.\n');process.exitCode=1}
  else await healthMain();
}
