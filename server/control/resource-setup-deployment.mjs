// Resource PLAN only: public metadata/trust are read; DSNs and recovery
// credentials are never opened and no database/provider connection is made.
import {isAbsolute,posix,resolve,relative,sep} from 'node:path';
import {lstat,realpath} from 'node:fs/promises';
import {ControlError} from './errors.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';
import {setupConfiguration} from './workers/setup-config.mjs';
import {loadReleaseApprovalTrust} from './release-approval.mjs';
import {loadRuntimeResourceContext,resourceMode,runtimeResourceView} from './resource-runtime.mjs';
import {withoutPublicDirectoryCa} from './directory-ca-mount.mjs';

const fail=code=>{throw new ControlError(400,code,'Kiểm tra tài nguyên triển khai chưa đạt. Chi tiết cấu hình đã được ẩn.')};
const metadata=['/etc/roomqc/setup.json','/etc/roomqc/resource-budget.json','/etc/roomqc/setup-trust.json'];
const credentials='/run/roomqc/setup';
const overlaps=(a,b)=>{const r=relative(a,b);return r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r)};
const health=['CMD','node','-e',"fetch('http://127.0.0.1:8095/readyz',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"];
const allowedEnv=['NODE_ENV','ROOMQC_RESOURCE_ENVIRONMENT','ROOMQC_RESOURCE_DATABASE_ID','ROOMQC_RESOURCE_BUDGET_FILE',
 'ROOMQC_SETUP_CONFIG_FILE','ROOMQC_SETUP_DATABASE_URL_FILE','ROOMQC_SETUP_RELEASE_TRUST_FILE','ROOMQC_SETUP_ALLOW_LOCAL','ROOMQC_RESOURCE_POOL_OBSERVATIONS','NODE_EXTRA_CA_CERTS'];

function shape(service,expected){
 const env=service.environment;
 if(!env||typeof env!=='object'||Array.isArray(env)||Object.entries(env).some(([k,v])=>!allowedEnv.includes(k)||typeof v!=='string')
  ||service.image!==expected.image||service.build!==undefined||service.entrypoint!=null||service.env_file!==undefined
  ||service.working_dir!=='/app'||JSON.stringify(service.command)!==JSON.stringify(['node','workers/setup-runtime.mjs'])
  ||service.privileged||service.volumes_from||service.devices||service.configs||service.use_api_socket||service.post_start||service.pre_stop
  ||service.network_mode!==undefined||service.ports?.length||service.cap_add?.length||service.user!=='1000:1000'||service.read_only!==true
  ||JSON.stringify(service.cap_drop)!==JSON.stringify(['ALL'])||JSON.stringify(service.security_opt)!==JSON.stringify(['no-new-privileges:true'])
  ||service.healthcheck&&!service.healthcheck.disable&&JSON.stringify(service.healthcheck.test)!==JSON.stringify(health))
  fail('RESOURCE_DEPLOYMENT_PROCESS_MISMATCH');
 if(env.ROOMQC_SETUP_CONFIG_FILE!==metadata[0]||env.ROOMQC_RESOURCE_BUDGET_FILE!==metadata[1]
  ||env.ROOMQC_SETUP_RELEASE_TRUST_FILE!==metadata[2]||env.ROOMQC_SETUP_DATABASE_URL_FILE!=='/run/secrets/setup-dsn')
  fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
 if(service.tmpfs?.some(p=>typeof p!=='string'||!/^\/tmp(?::[^\r\n]*)?$/.test(p)))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
 const secret=service.secrets?.[0];
 if(!Array.isArray(service.secrets)||service.secrets.length!==1
  ||(typeof secret==='string'?secret!=='setup-dsn':!secret||secret.source!=='setup-dsn'
    ||!['setup-dsn','/run/secrets/setup-dsn'].includes(secret.target??secret.source)))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
 const mode=resourceMode(env);
 if(env.ROOMQC_SETUP_ALLOW_LOCAL!==undefined&&(!['true','false'].includes(env.ROOMQC_SETUP_ALLOW_LOCAL)
  ||mode.production&&env.ROOMQC_SETUP_ALLOW_LOCAL!=='false'))fail('RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH');
 return {env,mode};
}

async function mounts(service){
 const allowed=[...metadata,credentials],sources=[],found=new Map();
 const remaining=withoutPublicDirectoryCa(service);
 if(remaining.length!==allowed.length)fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
 for(const mount of remaining){
  if(!allowed.includes(mount.target)||found.has(mount.target)||mount.type!=='bind'||mount.read_only!==true
   ||typeof mount.source!=='string'||!isAbsolute(mount.source)||mount.bind?.create_host_path===true)fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  let stat,path;try{stat=await lstat(mount.source);path=await realpath(mount.source)}catch{fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID')}
  if(stat.isSymbolicLink()||(mount.target===credentials?!stat.isDirectory():!stat.isFile())
   ||sources.some(source=>overlaps(source,path)||overlaps(path,source)))fail('RESOURCE_DEPLOYMENT_MOUNT_INVALID');
  sources.push(path);found.set(mount.target,path);
 }
 return found;
}

export async function setupDeploymentResources(service,expected,manifest){
 const {env,mode}=shape(service,expected);
 if(mode.environment!==manifest.environment)fail('RESOURCE_DEPLOYMENT_ENVIRONMENT_MISMATCH');
 const files=await mounts(service),context=loadRuntimeResourceContext({...env,ROOMQC_RESOURCE_BUDGET_FILE:files.get(metadata[1])},{kind:'directory'});
 if(context.databaseId!==expected.databaseId||context.budgetSha256!==manifest.budgetSha256)fail('RESOURCE_DEPLOYMENT_PROFILE_MISMATCH');
 let config;
 try{
  const raw=JSON.parse(await boundedHealthFile(files.get(metadata[0]),128*1024));
  // Keep approval/cluster fields intact. Only normalize un-opened POSIX file
  // references for the shared metadata validator on Windows planners.
  for(const target of raw.targets){
   if(typeof target.credentialFile!=='string'||posix.normalize(target.credentialFile)!==target.credentialFile
    ||!/^\/run\/roomqc\/setup\/[a-z0-9][a-z0-9.-]{0,127}\.json$/.test(target.credentialFile))throw 0;
   target.credentialFile=resolve(target.credentialFile);
  }
  const trust=await loadReleaseApprovalTrust(files.get(metadata[2]),{maximumValidityMs:86400000});
  config={...setupConfiguration(raw,{databaseUrl:'postgresql://unused:unused@db.invalid/unused?sslmode=verify-full',trust,
   environment:mode.environment,allowLocal:env.ROOMQC_SETUP_ALLOW_LOCAL==='true'}),resourceContext:context};
 }catch{fail('RESOURCE_DEPLOYMENT_METADATA_INVALID')}
 return {resources:runtimeResourceView(config,'provisioning-worker'),setupInstanceId:config.instanceId};
}
