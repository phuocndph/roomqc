import http from 'node:http';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {AlertDeliveryStore} from '../alert-delivery.mjs';
import {AlertWorker,createAlertSender} from './alert-worker.mjs';
import {loadAlertConfiguration} from './alert-config.mjs';
import {assertAlertResources,runtimeResourceView,resourcePoolObservationMode} from '../resource-runtime.mjs';
import {startResourcePoolStatus} from '../resource-pool-observation.mjs';

export async function startAlertRuntime(config,{pool,store,send,onEvent=()=>{},port=8094,autoStart=true,poolObservations=false,poolStatusPort=8098}={}){
  assertAlertResources(config);
  const resources=runtimeResourceView(config,'alert-worker');
  pool??=store?null:new pg.Pool({connectionString:config.databaseUrl,max:config.poolMax,connectionTimeoutMillis:2000,
    statement_timeout:3000,lock_timeout:2000,idle_in_transaction_session_timeout:5000,idleTimeoutMillis:30000,application_name:'roomqc-alert-worker'});
  pool?.on('error',()=>{});store??=new AlertDeliveryStore(pool,{leaseMs:config.leaseMs});
  const worker=new AlertWorker({...config,store,send:send??createAlertSender(config),onEvent});let server,poolStatus;
  const closePool=async()=>{let timer;const result=await Promise.race([Promise.resolve().then(()=>pool?.end()).then(()=>false,()=>true),
    new Promise(resolve=>{timer=setTimeout(()=>resolve(true),config.shutdownTimeoutMs)})]);clearTimeout(timer);return result};
  try{
    await store.readiness();
    if(poolObservations)poolStatus=await startResourcePoolStatus({resources,budget:config.resourceContext?.budget,
      pools:[{consumerId:'alert-worker',getPool:()=>pool}]},{port:poolStatusPort});
    server=http.createServer((req,res)=>{
      res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
      const view=worker.status(),found=req.method==='GET'&&['/livez','/readyz'].includes(req.url),ok=req.url==='/livez'?view.alive:view.ready;
      res.writeHead(found?(ok?200:503):404);res.end(JSON.stringify(found?{status:ok?'ok':'unavailable',instanceId:config.instanceId,...view,resources}:{status:'not_found'}));
    });
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  }catch(error){await poolStatus?.stop();await closePool();throw error}
  if(autoStart)worker.start();let closing;
  return {pool,server,worker,poolStatus,shutdown:()=>closing??=(async()=>{
    const draining=worker.shutdown();server.closeAllConnections();const closed=new Promise(resolve=>server.close(resolve));
    const observationsStopped=await poolStatus?.stop();
    const stopped=await draining,poolTimedOut=await closePool();await closed;return {timedOut:stopped.timedOut||poolTimedOut||!!observationsStopped?.timedOut};
  })()};
}
export async function alertMain(env=process.env){
  let runtime;
  try{runtime=await startAlertRuntime(await loadAlertConfiguration(env),{poolObservations:resourcePoolObservationMode(env),onEvent:e=>process.stdout.write(JSON.stringify(e)+'\n')})}
  catch{process.stderr.write('RoomQC alert worker failed to start (configuration redacted).\n');process.exitCode=1;return}
  let stopping=false;
  const stop=async()=>{
    if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),22000);timer.unref();
    const {timedOut}=await runtime.shutdown();clearTimeout(timer);process.exit(timedOut?1:0);
  };
  process.once('SIGTERM',stop);process.once('SIGINT',stop);return runtime;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.length===3&&process.argv[2]==='--help')process.stdout.write('RoomQC alert worker. Requires absolute ROOMQC_ALERT_{CONFIG,DATABASE_URL,ENDPOINT,TOKEN}_FILE files. Local HTTP requires ROOMQC_ALERT_ALLOW_LOCAL=true outside production. Status binds loopback:8094.\n');
  else if(process.argv.length!==2){process.stderr.write('Unsupported alert worker arguments. Use --help.\n');process.exitCode=1}
  else await alertMain();
}
