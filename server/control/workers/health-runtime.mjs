import http from 'node:http';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {ControlError} from '../errors.mjs';
import {HealthStore} from '../telemetry.mjs';
import {PrometheusSource} from '../telemetry-source.mjs';
import {HealthWorker} from './health-worker.mjs';
import {loadHealthConfiguration} from './health-config.mjs';

export function createHealthPool(config){
  const pool=new pg.Pool({connectionString:config.databaseUrl,max:config.poolMax,connectionTimeoutMillis:2000,
    idleTimeoutMillis:30000,statement_timeout:3000,lock_timeout:2000,idle_in_transaction_session_timeout:5000,
    application_name:'roomqc-health-worker'});
  pool.on('error',()=>{});return pool;
}
export async function startHealthRuntime(config,{pool,store,probe,sourceFor,onEvent=()=>{},port=8093,autoStart=true}={}){
  pool??=store?null:createHealthPool(config);store??=new HealthStore(pool);
  const sources=new Map(config.targets.map(entry=>[entry.target.clusterId,new PrometheusSource({...entry.prometheus,allowLocal:config.allowLocal})]));
  const worker=new HealthWorker({store,targets:config.targets.map(e=>e.target),sourceFor:sourceFor??(target=>sources.get(target.clusterId)),
    // No positive fallback. M06 must supply release-specific service probes.
    probe:probe??(async()=>{throw new ControlError(503,'HEALTH_PROBES_UNCONFIGURED','Chưa cấu hình đủ kiểm tra dịch vụ.')}),
    intervalMs:config.intervalMs,targetTimeoutMs:config.targetTimeoutMs,concurrency:config.concurrency,
    shutdownTimeoutMs:config.shutdownTimeoutMs,onEvent});
  const server=http.createServer((req,res)=>{
    res.setHeader('cache-control','no-store');res.setHeader('content-type','application/json; charset=utf-8');
    const path=req.url,view=worker.status();
    if(req.method!=='GET'||!['/livez','/readyz'].includes(path)){res.writeHead(404);res.end('{"status":"not_found"}');return}
    const ok=path==='/livez'?view.alive:view.ready;
    res.writeHead(ok?200:503);res.end(JSON.stringify({status:ok?'ok':'unavailable',instanceId:config.instanceId,...view}));
  });
  try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)})}
  catch(error){await pool?.end();throw error}
  if(autoStart)worker.start();let closing;
  async function shutdown(){
    if(closing)return closing;
    closing=(async()=>{
      const draining=worker.shutdown();server.closeAllConnections();
      const closed=new Promise(resolve=>server.close(resolve));
      const result=await draining;let timer;
      const poolClosed=pool?.end()??Promise.resolve();
      const poolTimedOut=await Promise.race([poolClosed.then(()=>false,()=>true),
        new Promise(resolve=>{timer=setTimeout(()=>resolve(true),config.shutdownTimeoutMs)})]);clearTimeout(timer);
      await closed;return {timedOut:result.timedOut||poolTimedOut};
    })();return closing;
  }
  return {server,worker,pool,shutdown};
}
export async function healthMain(env=process.env){
  let runtime;
  try{
    const config=await loadHealthConfiguration(env);
    runtime=await startHealthRuntime(config,{onEvent:event=>process.stdout.write(JSON.stringify(event)+'\n')});
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
    process.stdout.write('RoomQC health worker (private, fail-closed).\nRequires ROOMQC_HEALTH_CONFIG_FILE and ROOMQC_HEALTH_DATABASE_URL_FILE absolute files.\nNo service probes configured until M06; readiness remains closed.\n');
  }else if(process.argv.length!==2){process.stderr.write('Unsupported health worker arguments. Use --help.\n');process.exitCode=1}
  else await healthMain();
}
