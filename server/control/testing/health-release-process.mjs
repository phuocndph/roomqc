// Exact-owned directory acceptance worker. Synthetic loopback HTTP collector;
// proves process/transaction fences, not the separate full-vendor pipeline.
// Private fixture inputs arrive over IPC and are never returned or logged.
import pg from 'pg';
import {HealthStore} from '../telemetry.mjs';
import {ProbeKeyring} from '../probe-secrets.mjs';
import {ReleaseApprovalTrust} from '../release-approval.mjs';
import {ManagedHealthCatalog,createManagedHealthProbe} from '../workers/health-probes.mjs';
import {HealthWorker} from '../workers/health-worker.mjs';
let worker,metrics,probe;
process.on('message',async message=>{
  const reply=value=>process.send?.({id:message.id,...value});
  try{
    if(message.operation==='init'){
      if(worker)throw new Error('ALREADY_INITIALIZED');
      const i=message.input,trust=new ReleaseApprovalTrust(i.trust,{maximumValidityMs:i.maximumValidityMs});
      const config={catalog:new ManagedHealthCatalog(i.metadata,{schemaVersion:2,allowLocal:true,targets:[{target:i.target}]},trust),
        keyring:new ProbeKeyring({activeKeyId:'health-key',keys:new Map([['health-key',Buffer.from(i.key,'hex')]])})};
      const options=connectionString=>({connectionString,max:1,connectionTimeoutMillis:2000,statement_timeout:3000,lock_timeout:2000});
      metrics=new pg.Pool(options(i.metricsDsn));probe=new pg.Pool(options(i.probeDsn));
      const adapter=createManagedHealthProbe(config,probe,{collect:async(config_,cluster,input,{signal})=>{
        const origin=new URL(cluster.url);
        if(origin.hostname!=='127.0.0.1'||origin.protocol!=='http:')throw new Error('LOOPBACK_FIXTURE_REQUIRED');
        const response=await fetch(origin.origin+'/fixture-health',{signal,redirect:'error'});
        return response.json();
      }});
      worker=new HealthWorker({store:new HealthStore(metrics),targets:[i.target],probe:adapter,targetTimeoutMs:9000,
        sourceFor:()=>({collect:async()=>({...i.sample,observedAt:new Date().toISOString()})})});
      reply({ready:true});
    }else if(message.operation==='tick'){
      const status=await worker.tick();reply({status:{ready:status.ready,targetsSucceeded:status.targetsSucceeded,lastErrorCode:status.lastErrorCode}});
    }else if(message.operation==='close'){
      await worker?.shutdown();await Promise.all([metrics?.end(),probe?.end()]);
      reply({closed:true});process.disconnect();
    }else throw new Error('UNKNOWN_OPERATION');
  }catch(error){reply({failed:true,code:/^[A-Z][A-Z0-9_]{2,80}$/.test(error.code??'')?error.code:'HEALTH_FIXTURE_OPERATION_FAILED'})}
});
