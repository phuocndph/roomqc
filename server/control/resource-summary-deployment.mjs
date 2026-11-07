// Read-only resource PLAN adapter. It reads policy/config/budget metadata only;
// DSNs, signing keys, release trust and output credentials are never opened.
import {posix,resolve,join,relative,isAbsolute,sep} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {ControlError} from './errors.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';
import {resourceMode} from './resource-runtime.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {summaryCredentialInstallerConfiguration,assertSummaryCredentialBudget} from './tenant-summary-installer.mjs';
import {summaryRotationConfiguration,summaryRotationContext} from './tenant-summary-rotation.mjs';
import {summaryResourceConfigurationHash,summaryResourceProfile} from './summary-resource-profile.mjs';
import {withoutPublicDirectoryCa} from './directory-ca-mount.mjs';

const fail=code=>{throw new ControlError(400,code,'Kiểm tra tài nguyên triển khai chưa đạt. Chi tiết cấu hình đã được ẩn.')};
const command=['node','workers/summary-rotation-runtime.mjs','--config-file','/etc/roomqc/rotation.json'];
const privateRoot='/etc/roomqc/private',journalRoot='/var/lib/roomqc/summary-rotation-journal',outputRoot='/run/roomqc/summary';
const containerPath=p=>typeof p==='string'&&p.startsWith('/')&&posix.normalize(p)===p&&!/[\\\x00-\x1f]/.test(p);
const overlaps=(a,b)=>{const r=relative(a,b);return r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r)};
const native=p=>{if(!containerPath(p))fail('RESOURCE_DEPLOYMENT_METADATA_INVALID');return resolve(p)};
const privatePath=p=>{
 if(!containerPath(p)||!new RegExp('^'+privateRoot+'/[a-z0-9][a-z0-9.-]{0,127}$').test(p))fail('RESOURCE_DEPLOYMENT_METADATA_INVALID');
 return p;
};
const readJson=async(file,max)=>{
 try{return JSON.parse(await boundedHealthFile(file,max))}catch{fail('RESOURCE_DEPLOYMENT_METADATA_INVALID')}
};
function processShape(s,expected){
 const env=s.environment;
 if(!env||typeof env!=='object'||Array.isArray(env)||s.image!==expected.image||s.build!==undefined||s.entrypoint!=null
  ||s.env_file!==undefined||s.working_dir!=='/app'||JSON.stringify(s.command)!==JSON.stringify(command)
  ||s.privileged||s.volumes_from||s.devices||s.configs||s.secrets||s.use_api_socket||s.post_start||s.pre_stop
  ||s.network_mode!==undefined||s.ports?.length||s.cap_add?.length||s.user!=='1000:1000'||s.read_only!==true
  ||JSON.stringify(s.cap_drop)!==JSON.stringify(['ALL'])||JSON.stringify(s.security_opt)!==JSON.stringify(['no-new-privileges:true'])
  ||s.healthcheck&&!s.healthcheck.disable||Object.keys(env).some(k=>!['NODE_ENV','ROOMQC_RESOURCE_ENVIRONMENT','NODE_EXTRA_CA_CERTS'].includes(k)))
  fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
 if(s.tmpfs?.some(p=>typeof p!=='string'||!/^\/tmp(?::[^\r\n]*)?$/.test(p)))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
 return resourceMode(env);
}
async function mountMap(service){
 const targets=new Map([['/etc/roomqc/rotation.json',true],[privateRoot,true],[journalRoot,false],[outputRoot,false]]);
 const remaining=withoutPublicDirectoryCa(service);
 const extra=[privateRoot+'/summary-directory.dsn',privateRoot+'/summary-installer.json'];
 if(remaining.some(m=>extra.includes(m.target)))for(const target of extra)targets.set(target,true);
 if(remaining.length!==targets.size)fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
 const mounts=new Map(),sources=[];
 for(const m of remaining){
  if(!targets.has(m.target)||mounts.has(m.target)||m.type!=='bind'||(m.read_only===true)!==targets.get(m.target)
   ||typeof m.source!=='string'||!isAbsolute(m.source)||m.bind?.create_host_path===true)fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  let stat,source;try{stat=await lstat(m.source);source=await realpath(m.source)}catch{fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID')}
  if(stat.isSymbolicLink()||([ '/etc/roomqc/rotation.json',...extra].includes(m.target)?!stat.isFile():!stat.isDirectory()))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  if(sources.some(p=>overlaps(p,source)||overlaps(source,p)))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  sources.push(source);mounts.set(m.target,source);
 }
 return mounts;
}
function normalizedInstaller(raw){
 const config=structuredClone(raw);
 // Container paths are POSIX even when the read-only planning CLI runs on
 // Windows. Validate POSIX spelling first, then use native equivalents solely
 // for the product metadata validator; these synthetic paths are never opened.
 try{
  for(const d of [config.business,config.directory])d.dsnFile=native(privatePath(d.dsnFile));
  config.resourceBudgetFile=native(privatePath(config.resourceBudgetFile));
  config.releaseTrustFile=native(privatePath(config.releaseTrustFile));
  config.publisher.signer.keyFile=native(privatePath(config.publisher.signer.keyFile));
  config.publisher.publishableKeyFile=native(privatePath(config.publisher.publishableKeyFile));
  if(config.publisher.outputFile!==outputRoot+'/summary.json')fail('RESOURCE_DEPLOYMENT_METADATA_INVALID');
  config.publisher.outputFile=native(config.publisher.outputFile);
  return summaryCredentialInstallerConfiguration(config,{allowLocal:config.environment==='local'});
 }catch{fail('RESOURCE_DEPLOYMENT_METADATA_INVALID')}
}
export async function summaryRotationDeploymentResources(service,expected,manifest){
 const mode=processShape(service,expected);
 if(mode.environment!==manifest.environment)fail('RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH');
 const mounts=await mountMap(service),policyRaw=await readJson(mounts.get('/etc/roomqc/rotation.json'),32768);
 if(mounts.has(privateRoot+'/summary-installer.json')&&policyRaw.installerConfigFile!==privateRoot+'/summary-installer.json')
  fail('RESOURCE_DEPLOYMENT_METADATA_INVALID');
 let policy;try{
  privatePath(policyRaw.installerConfigFile);
  if(policyRaw.journalDirectory!==journalRoot)fail('RESOURCE_DEPLOYMENT_METADATA_INVALID');
  policy=summaryRotationConfiguration({...policyRaw,installerConfigFile:native(policyRaw.installerConfigFile),journalDirectory:native(policyRaw.journalDirectory)});
 }catch{fail('RESOURCE_DEPLOYMENT_METADATA_INVALID')}
 const privateFile=p=>mounts.get(privatePath(p))??join(mounts.get(privateRoot),posix.basename(privatePath(p)));
 const raw=await readJson(privateFile(policyRaw.installerConfigFile),131072),config=normalizedInstaller(raw);
 if(mounts.has(privateRoot+'/summary-directory.dsn')&&raw.directory.dsnFile!==privateRoot+'/summary-directory.dsn')
  fail('RESOURCE_DEPLOYMENT_METADATA_INVALID');
 if(config.consumerId!=='summary-credential-rotation'||config.businessDatabaseId!==expected.databaseId)
  fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
 if(config.environment!==manifest.environment)fail('RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH');
 try{summaryRotationContext(policy,config)}catch{fail('RESOURCE_DEPLOYMENT_METADATA_INVALID')}
 const snapshot=loadResourceBudgetSnapshot(privateFile(raw.resourceBudgetFile));
 if(snapshot.sha256!==manifest.budgetSha256||snapshot.sha256!==config.resourceBudgetSha256
  ||(mode.production?snapshot.budget.environment!==mode.environment:!['local','example'].includes(snapshot.budget.environment)))
  fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
 const contexts={};
 for(const kind of ['directory','business']){
  const database=snapshot.budget.databases.find(d=>d.kind===kind&&(kind==='directory'||d.id===expected.databaseId));
  if(!database)fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
  try{assertSummaryCredentialBudget(config,{budget:snapshot.budget,budgetSha256:snapshot.sha256,databaseId:database.id},kind)}
  catch{fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH')}
  contexts[kind]={environment:mode.environment,budget:snapshot.budget,budgetSha256:snapshot.sha256,databaseId:database.id};
 }
 // Metadata/config validation is not signature approval, DB identity or proof
 // that this image/process is currently running with these inputs.
 return {resources:summaryResourceProfile(config,contexts,summaryResourceConfigurationHash(policyRaw,raw)),
  isolation:{instanceId:policy.instanceId,logins:['directory','business'].map(kind=>{
   const {systemIdentifier,role}=config[kind].expected;return JSON.stringify([systemIdentifier,role]);
  })}};
}
