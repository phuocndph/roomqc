// Render runtime references only. Credential values never enter Compose/env output.
import {isAbsolute,join,resolve} from 'node:path';
import {validateDirectoryRuntimeCredentials} from './directory-runtime-logins.mjs';
import {summaryCredentialInstallerConfiguration} from './tenant-summary-installer.mjs';
const fail=()=>{throw Object.assign(new Error('DIRECTORY_WIRING_INPUT_INVALID'),{code:'DIRECTORY_WIRING_INPUT_INVALID'})};
const spec={
 'control-api':{name:'roomqc-control',key:'ROOMQC_CONTROL_DATABASE_URL_FILE',secret:'control-dsn'},
 'health-worker':{name:'health-worker',key:'ROOMQC_HEALTH_DATABASE_URL_FILE',secret:'metrics-dsn'},
 'probe-catalog':{name:'health-worker',key:'ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE',secret:'probe-dsn'},
 'alert-worker':{name:'alert-worker',key:'ROOMQC_ALERT_DATABASE_URL_FILE',secret:'alert-dsn'},
 'provisioning-worker':{name:'setup-worker',key:'ROOMQC_SETUP_DATABASE_URL_FILE',secret:'setup-dsn'},
 'deployment-executor':{name:'deployment-executor',key:'ROOMQC_DEPLOY_DATABASE_URL_FILE',secret:'deployment-dsn'}
};
export function renderDirectoryRuntimeWiring(plan,bundle,{credentialsDirectory,outputDirectory,summaryInputs=[]}={}){
 validateDirectoryRuntimeCredentials(plan,bundle);
 if(![credentialsDirectory,outputDirectory].every(p=>typeof p==='string'&&isAbsolute(p)&&!/[\x00-\x1f$]/.test(p))
  ||!Array.isArray(summaryInputs))fail();
 const summaries=plan.roles.filter(r=>r.consumerId==='summary-credential-rotation');
 if(summaryInputs.length!==summaries.length||new Set(summaryInputs.map(i=>i.ordinal)).size!==summaryInputs.length
  ||summaryInputs.some(i=>!summaries.some(r=>r.ordinal===i.ordinal)))fail();
 const files=[],services=[];
 if(plan.roles.some(r=>r.consumerId==='deployment-executor'))files.push({name:'deployment-login-plan.json',content:JSON.stringify(plan)+'\n'});
 for(const role of plan.roles){
  if(role.consumerId==='probe-catalog'){
   if(!plan.roles.some(r=>r.consumerId==='health-worker'&&r.ordinal===role.ordinal))fail();continue;
  }
  const id=role.consumerId+'-'+role.ordinal,environment={},secrets={},mounts=[],vars={};
  let name;
  if(role.consumerId==='summary-credential-rotation'){
   name='summary-credential-rotation';
   const input=summaryInputs.find(i=>i.ordinal===role.ordinal),raw=structuredClone(input.installer);
   if(!raw||raw.environment!==plan.environment||raw.consumerId!==role.consumerId||raw.resourceBudgetSha256!==plan.budgetSha256
    ||raw.replicas!==summaries.length||Object.entries(plan.expected).some(([k,v])=>raw.directory?.expected?.[k]!==v))fail();
   raw.directory={dsnFile:'/etc/roomqc/private/summary-directory.dsn',expected:{...plan.expected,role:role.name}};
   // Validate container metadata using native paths on Windows planners only.
   const native=structuredClone(raw);
   try{
    for(const db of ['business','directory'])native[db].dsnFile=resolve(native[db].dsnFile);
    for(const k of ['resourceBudgetFile','releaseTrustFile'])native[k]=resolve(native[k]);
    if(native.publisher){native.publisher.signer.keyFile=resolve(native.publisher.signer.keyFile);
     native.publisher.publishableKeyFile=resolve(native.publisher.publishableKeyFile);native.publisher.outputFile=resolve(native.publisher.outputFile)}
    summaryCredentialInstallerConfiguration(native,{allowLocal:plan.environment==='local'});
   }catch{fail()}
   const metadata=id+'.installer.json';files.push({name:metadata,content:JSON.stringify(raw,null,2)+'\n'});
   mounts.push({type:'bind',source:join(credentialsDirectory,role.name+'.dsn'),target:'/etc/roomqc/private/summary-directory.dsn',read_only:true,bind:{create_host_path:false}},
    {type:'bind',source:join(outputDirectory,metadata),target:'/etc/roomqc/private/summary-installer.json',read_only:true,bind:{create_host_path:false}});
  }else{
   const s=spec[role.consumerId];if(!s)fail();name=s.name;
   const members=[role,...(role.consumerId==='health-worker'?plan.roles.filter(r=>r.consumerId==='probe-catalog'&&r.ordinal===role.ordinal):[])];
   for(const member of members){
    const m=spec[member.consumerId],source=join(credentialsDirectory,member.name+'.dsn');
    vars[m.key]=source;environment[m.key]='/run/secrets/'+m.secret;secrets[m.secret]={file:source};
   }
   if(role.consumerId==='control-api'){
    environment.ROOMQC_CONTROL_DATABASE_URL='';environment.ROOMQC_CONTROL_API_INSTANCES=String(plan.roles.filter(r=>r.consumerId==='control-api').length);
   }
   if(role.consumerId==='deployment-executor'){
    vars.ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE=join(outputDirectory,'deployment-login-plan.json');
    Object.assign(environment,{NODE_ENV:plan.environment==='local'?'development':'production',ROOMQC_RESOURCE_ENVIRONMENT:plan.environment,
      ROOMQC_DEPLOYMENT_EXECUTOR_INSTANCES:String(plan.roles.filter(r=>r.consumerId==='deployment-executor').length),
      ROOMQC_DEPLOYMENT_EXECUTOR_ORDINAL:String(role.ordinal),ROOMQC_DEPLOYMENT_LOGIN_PLAN_FILE:'/etc/roomqc/deployment-login-plan.json'});
    mounts.push({type:'bind',source:join(outputDirectory,'deployment-login-plan.json'),target:'/etc/roomqc/deployment-login-plan.json',
      read_only:true,bind:{create_host_path:false}});
   }
  }
  const service={environment,scale:1,deploy:{replicas:1}};
  if(Object.keys(secrets).length)service.secrets=Object.keys(secrets);
  if(mounts.length)service.volumes=mounts;
  const overlay={services:{[name]:service}};if(Object.keys(secrets).length)overlay.secrets=secrets;
  const compose=id+'.compose.json',envFile=id+'.env';files.push({name:compose,content:JSON.stringify(overlay,null,2)+'\n'},
   {name:envFile,content:Object.entries(vars).map(([k,v])=>k+'='+JSON.stringify(v.replaceAll('\\','/'))).join('\n')+'\n'});
  services.push({id,service:name,consumerId:role.consumerId,ordinal:role.ordinal,login:role.name,composeFile:compose,envFile});
 }
 return {files,services,planSha256:plan.planSha256,deploymentReady:false,signupOpened:false};
}
