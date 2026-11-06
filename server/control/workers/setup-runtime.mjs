import http from 'node:http';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {SetupWorkerStore} from '../setup-worker-store.mjs';
import {SetupRecoveryGateway,loadRecoveryCredential,recoveryBinding} from '../setup-recovery.mjs';
import {SetupWorker,createSetupReconciler} from './setup-worker.mjs';
import {loadSetupConfiguration,setupCredentialsReady,setupTargetApproval} from './setup-config.mjs';
import {assertProvisioningResources,runtimeResourceView,resourcePoolObservationMode} from '../resource-runtime.mjs';
import {startResourcePoolStatus} from '../resource-pool-observation.mjs';

export async function startSetupRuntime(config,{pool,store,reconcile,credentialReadiness,onEvent=()=>{},port=8095,autoStart=true,poolObservations=false,poolStatusPort=8098}={}){
  assertProvisioningResources(config);
  const resources=runtimeResourceView(config,'provisioning-worker');
  pool??=store?null:new pg.Pool({connectionString:config.databaseUrl,max:config.poolMax,connectionTimeoutMillis:2000,
    statement_timeout:3000,lock_timeout:2000,idle_in_transaction_session_timeout:5000,idleTimeoutMillis:30000,application_name:'roomqc-setup-worker'});
  pool?.on('error',()=>{});
  const closePool=async()=>{let timer;const result=await Promise.race([Promise.resolve().then(()=>pool?.end()).then(()=>false,()=>true),
    new Promise(r=>{timer=setTimeout(()=>r(true),config.shutdownTimeoutMs)})]);clearTimeout(timer);return result};
  let server,worker,poolStatus;
  try{
    store??=new SetupWorkerStore(pool,{leaseMs:config.leaseMs,retryBaseMs:config.retryBaseMs,bindings:config.targets.map(t=>t.identity)});
    const transport={allowLocal:config.allowLocal,inventory:new Map(config.targets.map(t=>[t.cluster.inventoryRef,t.cluster]))};
    const gateways=new Map(config.targets.map(t=>[t.cluster.id,new SetupRecoveryGateway(transport,t.cluster,{
        expected:t.expected,loadCredential:async()=>{
          setupTargetApproval(t,config.trust,config.environment);
          return loadRecoveryCredential(t.credentialFile,recoveryBinding(t.cluster,t.expected));
        }})]));
    const verifyCredential=credentialReadiness??(async({signal})=>{
      for(const gateway of gateways.values())await gateway.readiness({signal});
    });
    const guarded={readiness:async()=>{
      await store.readiness();await setupCredentialsReady(config);
      const deadline=AbortSignal.timeout(config.requestTimeoutMs),shutdown=worker?.abort?.signal;
      await verifyCredential({signal:shutdown?AbortSignal.any([shutdown,deadline]):deadline});
      // This is a pre-batch observation, not an atomic transaction across
      // business Auth and the directory. Each dispatched RPC checks again.
    },claim:()=>store.claim(),settle:(...args)=>store.settle(...args)};
    reconcile??=createSetupReconciler(gateways);
    worker=new SetupWorker({...config,store:guarded,reconcile,onEvent});
    await guarded.readiness();
    if(poolObservations)poolStatus=await startResourcePoolStatus({resources,budget:config.resourceContext?.budget,
      pools:[{consumerId:'provisioning-worker',getPool:()=>pool}]},{port:poolStatusPort});
    server=http.createServer((req,res)=>{
      res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
      const status=worker.status(),found=req.method==='GET'&&['/livez','/readyz'].includes(req.url),ok=req.url==='/livez'?status.alive:status.ready;
      res.writeHead(found?(ok?200:503):404);
      res.end(JSON.stringify(found?{status:ok?'ok':'unavailable',instanceId:config.instanceId,...status,resources}:{status:'not_found'}));
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  }catch(error){await poolStatus?.stop();await closePool();throw error}
  if(autoStart)worker.start();let closing;
  return {pool,server,worker,poolStatus,shutdown:()=>closing??=(async()=>{
    const draining=worker.shutdown();server.closeAllConnections();const closed=new Promise(r=>server.close(r));
    const observationsStopped=await poolStatus?.stop();
    const stopped=await draining,poolTimedOut=await closePool();await closed;return {timedOut:stopped.timedOut||poolTimedOut||!!observationsStopped?.timedOut};
  })()};
}
export async function setupMain(env=process.env){
  let runtime;
  try{runtime=await startSetupRuntime(await loadSetupConfiguration(env),{poolObservations:resourcePoolObservationMode(env),onEvent:e=>process.stdout.write(JSON.stringify(e)+'\n')})}
  catch{process.stderr.write('RoomQC setup worker failed to start (configuration redacted).\n');process.exitCode=1;return}
  let stopping=false;
  const stop=async()=>{
    if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),22000);timer.unref();
    const {timedOut}=await runtime.shutdown();clearTimeout(timer);process.exit(timedOut?1:0);
  };
  process.once('SIGTERM',stop);process.once('SIGINT',stop);return runtime;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--help')process.stdout.write('RoomQC setup recovery worker. Requires absolute ROOMQC_SETUP_{CONFIG,DATABASE_URL,RELEASE_TRUST}_FILE and per-target scoped credential files. Production requires a shared resource budget. Status binds loopback:8095.\n');
  else if(process.argv.length!==2){process.stderr.write('Unsupported setup worker arguments. Use --help.\n');process.exitCode=1}
  else await setupMain();
}
