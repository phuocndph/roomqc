import { pathToFileURL } from 'node:url';
import { loadRuntimeConfig } from './config.mjs';
import { ControlStore } from './store.mjs';
import { ClusterGateway } from './cluster.mjs';
import { createControlServer } from './app.mjs';
import {assertControlResources,resourcePoolObservationMode,runtimeResourceView} from './resource-runtime.mjs';
import {startResourcePoolStatus} from './resource-pool-observation.mjs';

export async function startControl(config,{store,gateway,poolObservations=false,poolStatusPort=8098}={}) {
  assertControlResources(config);store??=new ControlStore(config);gateway??=new ClusterGateway(config,undefined,store);
  const lifecycle={draining:false};
  const server=createControlServer({config,store,gateway,lifecycle});
  server.requestTimeout=30000;server.headersTimeout=10000;
  let poolStatus;
  try{
  if(poolObservations)poolStatus=await startResourcePoolStatus({resources:runtimeResourceView(config,'control-api'),budget:config.resourceContext?.budget,
    pools:[{consumerId:'control-api',getPool:()=>store.pool}]},{port:poolStatusPort});
  await new Promise((resolve,reject)=>{
    server.once('error',reject);
    server.listen(config.port,config.host,()=>{server.off('error',reject);resolve()});
  });
  }catch(error){await poolStatus?.stop();await store.close();throw error}
  let stopped;
  const shutdown=()=>stopped ??= (async()=>{
    lifecycle.draining=true;
    lifecycle.stopAdmission?.();
    const observationsStopped=poolStatus?.stop();
    let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;server.closeAllConnections()},config.shutdownTimeoutMs??25000);
    await new Promise(resolve=>server.close(resolve));
    clearTimeout(timer);
    const observationResult=await observationsStopped;
    await Promise.race([store.close(),new Promise(resolve=>{const t=setTimeout(resolve,3000);t.unref()})]);
    return {timedOut:timedOut||!!observationResult?.timedOut};
  })();
  return {server,store,lifecycle,poolStatus,shutdown};
}

async function main() {
  const config=await loadRuntimeConfig();
  if(process.argv.includes('--migrate')) {
    if(!config.migrationDatabaseUrl)throw Object.assign(new Error('MIGRATION_DATABASE_URL_REQUIRED'),{code:'MIGRATION_DATABASE_URL_REQUIRED'});
    const store=new ControlStore({...config,databaseUrl:config.migrationDatabaseUrl});
    try {const result=await store.migrate();console.log(JSON.stringify(result))} finally {await store.close()}
  } else if(process.argv.includes('--expire-reservations')) {
    const store=new ControlStore(config);
    try {const result=await store.sweepReservations();console.log(JSON.stringify({expired:result.rowCount}))} finally {await store.close()}
  } else {
    const runtime=await startControl(config,{poolObservations:resourcePoolObservationMode()});
    console.log(JSON.stringify({event:'control_listening',host:config.host,port:config.port}));
    const stop=()=>runtime.shutdown().then(result=>process.exit(result.timedOut?1:0)).catch(()=>{
      console.error(JSON.stringify({event:'control_shutdown_failed'}));process.exit(1);
    });
    process.once('SIGINT',stop);process.once('SIGTERM',stop);
  }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{
    console.error(JSON.stringify({event:'control_start_failed',code:error.code || 'CONTROL_START_FAILED'}));
    process.exitCode=1;
  });
}
