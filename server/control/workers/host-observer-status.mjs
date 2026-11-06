import {writeFile,rename,unlink} from 'node:fs/promises';
import {isAbsolute} from 'node:path';
import {assertHostObserverResources,loadRuntimeResourceContext,resourceMode} from '../resource-runtime.mjs';

const invalid=()=>Object.assign(new Error('HOST_OBSERVER_RUNTIME_INVALID'),{code:'HOST_OBSERVER_RUNTIME_INVALID'});
export function hostObserverRuntimeConfiguration(env=process.env,{local=false,allowLocalTargets=false,watch=false,interval=60,statusFile}={}){
  const {production,environment}=resourceMode(env);
  if(local&&production||production&&(!watch||interval>60||!statusFile)||statusFile&&!isAbsolute(statusFile))throw invalid();
  if(allowLocalTargets&&(local||production||env.NODE_ENV==='production'||environment!=='local'
    ||env.ROOMQC_HOST_OBSERVER_ALLOW_LOCAL_TARGETS!=='true'))throw invalid();
  const observerInstances=Number(env.ROOMQC_HOST_OBSERVER_INSTANCES??1);
  if(!Number.isSafeInteger(observerInstances)||observerInstances<1||observerInstances>100)throw invalid();
  const config={production,allowLocalTargets,poolMax:1,observerInstances,resourceContext:loadRuntimeResourceContext(env,{kind:'directory'})};
  assertHostObserverResources(config);return config;
}
export async function publishHostObserverStatus(file,{ok,targets,failed,now=Date.now()}={}){
  if(!file)return;
  const status={version:1,ok:ok===true,targets,failed,checkedAt:new Date(now).toISOString()};
  const temporary=file+'.'+process.pid+'.tmp';
  try{await writeFile(temporary,JSON.stringify(status)+'\n',{mode:0o600,flag:'wx'});await rename(temporary,file)}
  finally{await unlink(temporary).catch(()=>{})}
}
export function hostObserverStatusReady(status,now=Date.now()){
  const age=now-Date.parse(status?.checkedAt);
  return status?.version===1&&status.ok===true&&Number.isInteger(status.targets)&&status.targets>=1&&status.targets<=100
    &&status.failed===0&&Number.isFinite(age)&&age>=-5000&&age<=120000;
}
