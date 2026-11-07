// Immutable installation of a dedicated management project. No upgrade/adoption
// policy is inferred from a working container or an operator supplied label.
import {createHash} from 'node:crypto';
import {renderManagementBundle} from './management-bundle.mjs';
import {directoryRuntimePlan} from './directory-runtime-plan.mjs';
import {resourceBudget} from './resource-budget.mjs';
import {isIP} from 'node:net';
import {assertManagementRegistry} from './management-registry.mjs';
import {ReleaseValidationCatalog} from './release-validation.mjs';
import {ReleaseApprovalTrust} from './release-approval.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
export const managementInstallHash=value=>createHash('sha256').update(value).digest('hex');
export function managementInstallPlan({descriptor,budgetText,files,registryText,requiredDiskBytes,backendSourceSha256,targetHost}){
 const budget=JSON.parse(budgetText),bundle=renderManagementBundle(descriptor,budget),root='/opt/RoomQC/management/'+descriptor.deploymentId;
 if(!Number.isSafeInteger(requiredDiskBytes)||requiredDiskBytes<1024**3||requiredDiskBytes>1024**5
  ||!/^[a-f0-9]{64}$/.test(backendSourceSha256??'')||typeof targetHost!=='string'||isIP(targetHost)!==4)fail('MANAGEMENT_INSTALL_PLAN_INVALID');
 const inside=(path,part)=>typeof path==='string'&&!/[\x00-\x20$`\\"']/.test(path)&&path.startsWith(root+'/'+part+'/')&&!path.slice(root.length+part.length+2).split('/').some(s=>!s||s==='.'||s==='..');
 const inputPaths=new Set([descriptor.files.budget,descriptor.files.apiEnvironment,descriptor.files.postgresConfig,descriptor.files.hbaConfig,descriptor.files.webConfig]);
 const privatePaths=new Set([descriptor.files.budget,descriptor.files.apiEnvironment]),credentialDirectories=[];
 for(const entry of Object.values(descriptor.workers)){
  for(const [key,value]of Object.entries(entry))if(key.endsWith('File')&&key!=='dsnFile'){inputPaths.add(value);privatePaths.add(value);}
  if(entry.credentialsDirectory)credentialDirectories.push(entry.credentialsDirectory);
  if(entry.managed)for(const key of ['configFile','keyringFile','trustFile']){inputPaths.add(entry.managed[key]);privatePaths.add(entry.managed[key]);}
 }
 if(descriptor.apiRelease)for(const key of ['catalogFile','trustFile']){inputPaths.add(descriptor.apiRelease[key]);privatePaths.add(descriptor.apiRelease[key]);}
 for(const path of privatePaths)if(!inside(path,'private'))fail('MANAGEMENT_INSTALL_PATH_INVALID');
 for(const path of [descriptor.files.postgresConfig,descriptor.files.hbaConfig,descriptor.files.webConfig])if(!inside(path,'metadata'))fail('MANAGEMENT_INSTALL_PATH_INVALID');
 for(const directory of credentialDirectories)if(!inside(directory,'private')||directory===root+'/private/runtime')fail('MANAGEMENT_INSTALL_PATH_INVALID');
 const snapshot={sha256:managementInstallHash(budgetText),budget:resourceBudget(budget)};
 const runtime=directoryRuntimePlan({version:1,deploymentId:descriptor.deploymentId,environment:descriptor.environment,
  expected:{databaseName:'roomqc_control',databaseOid:'1',systemIdentifier:'1'},budgetSha256:snapshot.sha256},snapshot);
 const runtimeDirectory=root+'/private/runtime';
 const dsn=(consumer,ordinal=1)=>runtimeDirectory+'/'+runtime.roles.find(r=>r.consumerId===consumer&&r.ordinal===ordinal)?.name+'.dsn';
 if(descriptor.files.apiDsn!==dsn('control-api'))fail('MANAGEMENT_INSTALL_DSN_INVALID');
 for(const [kind,entry]of Object.entries(descriptor.workers)){
  if(entry.dsnFile!==dsn({health:'health-worker',setup:'provisioning-worker',alert:'alert-worker'}[kind]))fail('MANAGEMENT_INSTALL_DSN_INVALID');
  if(entry.managed&&entry.managed.dsnFile!==dsn('probe-catalog'))fail('MANAGEMENT_INSTALL_DSN_INVALID');
 }
 if(!Array.isArray(files)||files.length<5||files.length>256||new Set(files.map(f=>f?.path)).size!==files.length)fail('MANAGEMENT_INSTALL_FILES_INVALID');
 for(const f of files){
  if(!exact(f,['path','content'])||typeof f.content!=='string'||Buffer.byteLength(f.content)>256*1024
   ||!inputPaths.has(f.path)&&!credentialDirectories.some(d=>f.path.startsWith(d+'/')&&inside(f.path,'private')))
   fail('MANAGEMENT_INSTALL_FILES_INVALID');
 }
 if([...inputPaths].some(p=>!files.some(f=>f.path===p))||files.find(f=>f.path===descriptor.files.budget).content!==budgetText)fail('MANAGEMENT_INSTALL_FILES_INVALID');
 if(descriptor.apiRelease){
  // Reject missing/pending/mismatched release evidence before SSH or allocating
  // directory resources. The runtime repeats these checks from mounted files.
  try{
   const release=descriptor.apiRelease;
   const trust=new ReleaseApprovalTrust(JSON.parse(files.find(f=>f.path===release.trustFile).content),{maximumValidityMs:release.maximumValidityMs});
   new ReleaseValidationCatalog(JSON.parse(files.find(f=>f.path===release.catalogFile).content),
    {trust,requireMigrationReceipt:descriptor.environment!=='local'});
  }catch{fail('MANAGEMENT_INSTALL_RELEASE_INVALID');}
 }
 if(files.some(f=>[runtimeDirectory,root+'/operator',root+'/private/management.json',root+'/private/initial-registry.json',root+'/private/install-plan.json',root+'/private/tls'].some(p=>f.path===p||f.path.startsWith(p+'/'))))fail('MANAGEMENT_INSTALL_PATH_INVALID');
 const api=files.find(f=>f.path===descriptor.files.apiEnvironment).content;
 for(const line of api.split(/\r?\n/).filter(l=>l.trim()&&!l.startsWith('#'))){
  if(!/^ROOMQC_[A-Z0-9_]+=[^\r\n\0]*$/.test(line))fail('MANAGEMENT_INSTALL_API_ENV_INVALID');
 }
 let registry;try{registry=JSON.parse(registryText)}catch{fail('MANAGEMENT_INSTALL_REGISTRY_INVALID')}
 assertManagementRegistry(registry,'MANAGEMENT_INSTALL_REGISTRY_INVALID');
 const allFiles=[...files,{path:root+'/private/management.json',content:JSON.stringify(descriptor)+'\n'},
  {path:root+'/private/initial-registry.json',content:registryText}].map(f=>({path:f.path,sha256:managementInstallHash(f.content),
   bytes:Buffer.byteLength(f.content),sensitive:!inside(f.path,'metadata')})).sort((a,b)=>a.path.localeCompare(b.path));
 if(allFiles.reduce((n,f)=>n+f.bytes,0)>2*1024*1024)fail('MANAGEMENT_INSTALL_FILES_INVALID');
 const body={version:1,deploymentId:descriptor.deploymentId,environment:descriptor.environment,targetHost,root,
  project:bundle.report.project,descriptor,budgetSha256:snapshot.sha256,backendSourceSha256,files:allFiles,requiredDiskBytes,
  memoryRequiredBytes:bundle.report.totalMemoryLimitBytes+128*1024*1024,
  cpusRequired:Object.values(bundle.compose.services).reduce((n,s)=>n+s.cpus,0),runtimeDirectory,credentialDirectories,
  resourceLabels:{'roomqc.management.install':descriptor.deploymentId},externalConsumers:bundle.report.externalConsumers};
 return {...body,specSha256:managementInstallHash(JSON.stringify(body))};
}
export function assertManagementInstallPlan(plan){
 const {specSha256,...body}=plan??{};
 if(!/^[a-f0-9]{64}$/.test(specSha256??'')||managementInstallHash(JSON.stringify(body))!==specSha256
  ||body.root!=='/opt/RoomQC/management/'+body.deploymentId||!/^roomqc-management-[a-z0-9-]+$/.test(body.project??''))fail('MANAGEMENT_INSTALL_PLAN_INVALID');
}
export function managementInstallCapacity(plan,facts){
 assertManagementInstallPlan(plan);
 const reasons=[...(facts?.reasons??[])];
 if(!facts?.deploymentAllowed)reasons.push('HOST_PREFLIGHT_BLOCKED');
 if(!Number.isFinite(facts?.memory?.availableBytes)||facts.memory.availableBytes<plan.memoryRequiredBytes)reasons.push('MANAGEMENT_MEMORY_HEADROOM_LOW');
 if(!Number.isFinite(facts?.cpuCount)||facts.cpuCount<plan.cpusRequired)reasons.push('MANAGEMENT_CPU_BUDGET_LOW');
 const disk=facts?.rootFilesystem;
 if(!disk||disk.availableBytes-plan.requiredDiskBytes<disk.totalBytes*0.15)reasons.push('MANAGEMENT_DISK_HEADROOM_LOW');
 return {allowed:reasons.length===0,reasons:[...new Set(reasons)]};
}
