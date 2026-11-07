import http from 'node:http';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {BookingExternalWorker} from './booking-external-worker.mjs';
import {createNotificationTransport,createWebPushBookingAdapter,createTelegramBookingAdapter} from '../booking-notification-providers.mjs';
import {loadBookingWorkerConfiguration,bookingNotificationProblem} from '../booking-notification-config.mjs';
import {bookingNotificationChannels} from '../booking-notification-access.mjs';
import {assertBookingResources,runtimeResourceView,resourcePoolObservationMode} from '../resource-runtime.mjs';
import {startResourcePoolStatus} from '../resource-pool-observation.mjs';

export async function startBookingExternalRuntime(config,{Pool=pg.Pool,port=8094,autoStart=true,onEvent=()=>{},poolObservations=false,poolStatusPort=8098}={}){
  assertBookingResources(config);
  const resources=runtimeResourceView(config,'external-notifications');
  if(!Number.isInteger(port)||port<0||port>65535)throw bookingNotificationProblem('BOOKING_NOTIFICATION_CONFIG_INVALID');
  const transport=createNotificationTransport({developmentOrigins:config.allowLocal?config.developmentOrigins:[],timeoutMs:config.timeoutMs});
  const adapters=[];
  if(config.providers.push)adapters.push(createWebPushBookingAdapter({...config.providers.push,transport}));
  if(config.providers.telegram)adapters.push(createTelegramBookingAdapter({...config.providers.telegram,transport}));
  let lastCycle=null,lastError=null,checking=false,stopping=false,server,poolStatus;
  const worker=new BookingExternalWorker({Pool,connection:config.connection,adapters,limit:config.limit,intervalMs:config.intervalMs,onEvent:event=>{
    if(event.event==='booking_external_cycle'){lastCycle=Date.now();lastError=null}
    if(event.event==='booking_external_error')lastError=event.code;onEvent(event);
  }});
  const inspect=async()=>{
    const client=await worker.pool.connect();try{
      await worker.safe(client);
      const channels=bookingNotificationChannels((await client.query('SELECT private.inspect_booking_notification_channels() AS result')).rows[0]?.result);
      return adapters.map(adapter=>{
        const live=channels.find(c=>c.channel===adapter.channel);
        return {channel:adapter.channel,enabled:live.enabled,configurationMatches:live.configurationId===adapter.configurationId,
          requiredConfigurationId:adapter.configurationId};
      });
    }finally{client.release()}
  };
  try{
    await inspect(); // Role/schema readiness before scheduling any outbound work.
    if(poolObservations)poolStatus=await startResourcePoolStatus({resources,budget:config.resourceContext?.budget,
      pools:[{consumerId:'external-notifications',getPool:()=>worker.pool}]},{port:poolStatusPort});
    server=http.createServer(async(req,res)=>{
      res.setHeader('content-type','application/json; charset=utf-8');res.setHeader('cache-control','no-store');
      if(req.method!=='GET'||!['/livez','/readyz'].includes(req.url)){res.writeHead(404);res.end('{"status":"not_found"}');return}
      if(req.url==='/livez'){res.writeHead(stopping?503:200);res.end(JSON.stringify({alive:!stopping,instanceId:config.instanceId,resources}));return}
      if(checking||stopping){res.writeHead(503);res.end('{"ready":false,"code":"BOOKING_WORKER_BUSY_OR_STOPPING"}');return}
      checking=true;
      try{
        const channels=await inspect(),ready=!stopping&&!lastError&&channels.every(c=>c.enabled&&c.configurationMatches)
          &&lastCycle!==null&&Date.now()-lastCycle<=180000;
        res.writeHead(ready?200:503);res.end(JSON.stringify({ready,instanceId:config.instanceId,channels,lastCycleAt:lastCycle,
          code:lastError??(ready?null:'BOOKING_WORKER_NOT_READY'),deviceDeliveryProven:false}));
      }catch{res.writeHead(503);res.end('{"ready":false,"code":"BOOKING_WORKER_UNAVAILABLE"}')}
      finally{checking=false}
    });
    server.requestTimeout=5000;server.headersTimeout=5000;server.keepAliveTimeout=1000;server.maxConnections=8;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve)});
  }catch(error){await poolStatus?.stop();await worker.shutdown();if(server?.listening){server.closeAllConnections();server.close()}throw error}
  if(autoStart)worker.start();let closing;
  const shutdown=()=>{
    if(closing)return closing;stopping=true;
    closing=(async()=>{
      server.closeAllConnections();const closed=new Promise(resolve=>server.close(resolve));let timer;
      const observationsStopped=await poolStatus?.stop();
      const result=await Promise.race([worker.shutdown().then(()=>({timedOut:false})),
        new Promise(resolve=>{timer=setTimeout(()=>resolve({timedOut:true}),20000)})]);
      clearTimeout(timer);await closed;return {timedOut:result.timedOut||!!observationsStopped?.timedOut};
    })();return closing;
  };
  return {worker,server,inspect,poolStatus,shutdown,instanceId:config.instanceId};
}
export function bookingWorkerArguments(args){
  if(args.length===1&&args[0]==='--help')return {help:true};
  const check=args[0]==='--check',values=check?args.slice(1):args;
  if(values.length!==2||values[0]!=='--config-file'||!values[1])throw bookingNotificationProblem('BOOKING_WORKER_ARGUMENTS_INVALID');
  return {check,configFile:values[1]};
}
export async function bookingExternalMain(args=process.argv.slice(2),env=process.env,output=console){
  let runtime;
  try{
    const parsed=bookingWorkerArguments(args);
    if(parsed.help){output.log('Usage: node server/control/workers/booking-external-runtime.mjs [--check] --config-file ABSOLUTE_JSON_FILE');return {exitCode:0}}
    const config=await loadBookingWorkerConfiguration(parsed.configFile,env);
    runtime=await startBookingExternalRuntime(config,{port:parsed.check?0:8094,poolStatusPort:parsed.check?0:8098,autoStart:!parsed.check,poolObservations:resourcePoolObservationMode(env),onEvent:event=>output.log(JSON.stringify(event))});
    if(parsed.check){
      const channels=await runtime.inspect(),ready=channels.every(c=>c.enabled&&c.configurationMatches);
      output.log(JSON.stringify({ok:true,checkOnly:true,ready,instanceId:config.instanceId,channels,deviceDeliveryProven:false}));
      await runtime.shutdown();return {exitCode:ready?0:2};
    }
    output.log(JSON.stringify({event:'booking_external_runtime_started',instanceId:config.instanceId,providerDeliveryProven:false}));
  }catch(error){
    await runtime?.shutdown();const allowed=['BOOKING_WORKER_ARGUMENTS_INVALID','BOOKING_NOTIFICATION_CONFIG_INVALID',
      'BOOKING_PUSH_UNCONFIGURED','BOOKING_TELEGRAM_UNCONFIGURED','BOOKING_EXTERNAL_ROLE_UNSAFE','BOOKING_NOTIFICATION_STATE_INVALID',
      'RESOURCE_BUDGET_REQUIRED','RESOURCE_RUNTIME_MISMATCH','INVALID_RESOURCE_BUDGET','RESOURCE_CONNECTION_BUDGET'];
    output.error(JSON.stringify({ok:false,code:allowed.includes(error.code??error.message)?(error.code??error.message):'BOOKING_WORKER_START_FAILED'}));return {exitCode:1};
  }
  let stopping=false;
  const stop=async()=>{
    if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),22000);timer.unref();
    const result=await runtime.shutdown();clearTimeout(timer);process.exit(result.timedOut?1:0);
  };
  process.once('SIGTERM',stop);process.once('SIGINT',stop);return {exitCode:null,runtime};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const result=await bookingExternalMain();if(result.exitCode!==null)process.exitCode=result.exitCode}
