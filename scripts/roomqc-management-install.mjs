// Operator CLI. No service credentials or file content are returned to stdout.
import {isAbsolute,dirname,resolve} from 'node:path';
import {lstat,readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {managementInstallPlan,managementInstallCapacity} from '../server/control/management-install-plan.mjs';
import {readSetupBackfillFile} from '../server/control/setup-backfill-files.mjs';
import {boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {collectVpsPreflight,preflightArguments} from './roomqc-vps-preflight.mjs';
import {runSsh} from './roomqc-vps-deploy.mjs';
import {managementInstallRemoteScript} from './lib/management-install-remote.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
async function publicInput(path){
 if(!isAbsolute(path))fail('MANAGEMENT_INSTALL_INPUT_INVALID');
 let cursor=resolve(path);
 while(true){if((await lstat(cursor)).isSymbolicLink())fail('MANAGEMENT_INSTALL_INPUT_INVALID');const parent=dirname(cursor);if(parent===cursor)break;cursor=parent;}
 const info=await lstat(path);if(!info.isFile()||info.nlink!==1||info.size>256*1024)fail('MANAGEMENT_INSTALL_INPUT_INVALID');
 return boundedHealthFile(path,256*1024);
}
export async function readManagementInstallInput(path){
 const config=JSON.parse(await readSetupBackfillFile(path,64*1024));
 if(!exact(config,['version','target','bundleFile','files','registryFile','requiredDiskBytes','backendSourceSha256'])||config.version!==1
  ||!exact(config.target,['host','user',...(config.target?.identityFile?['identityFile']:[])])||config.target.user!=='root'
  ||!isAbsolute(config.bundleFile??'')||!isAbsolute(config.registryFile??'')||!Array.isArray(config.files)||config.files.length>256)fail('MANAGEMENT_INSTALL_CONFIG_INVALID');
 const target=preflightArguments(['--host',config.target.host,'--user',config.target.user,...(config.target.identityFile?['--identity-file',config.target.identityFile]:[])]);
 const descriptor=JSON.parse(await readSetupBackfillFile(config.bundleFile,64*1024)),files=[];
 for(const value of config.files){
  if(!exact(value,['source','target'])||!isAbsolute(value.source??'')||typeof value.target!=='string')fail('MANAGEMENT_INSTALL_CONFIG_INVALID');
  const sensitive=!value.target.startsWith('/opt/RoomQC/management/'+descriptor.deploymentId+'/metadata/');
  files.push({path:value.target,content:await (sensitive?readSetupBackfillFile(value.source,256*1024):publicInput(value.source))});
 }
 const registryText=await readSetupBackfillFile(config.registryFile,128*1024),budgetText=files.find(f=>f.path===descriptor.files.budget)?.content;
 if(typeof budgetText!=='string')fail('MANAGEMENT_INSTALL_CONFIG_INVALID');
 const plan=managementInstallPlan({descriptor,budgetText,files,registryText,requiredDiskBytes:config.requiredDiskBytes,
  backendSourceSha256:config.backendSourceSha256,targetHost:target.host});
 return {config,target,plan,payload:{plan,files:[...files,{path:plan.root+'/private/management.json',content:JSON.stringify(descriptor)+'\n'},
  {path:plan.root+'/private/initial-registry.json',content:registryText}]}};
}
export async function managementInstallMain(args=process.argv.slice(2),{output=process.stdout,preflight=collectVpsPreflight,ssh=runSsh}={}){
 if(args.length===1&&args[0]==='--help'){
  output.write('RoomQC dedicated management installer. --config-file ABSOLUTE_PRIVATE_JSON --mode plan|prepare|initialize|resume|verify. Prepare initializes only the directory and capability DSNs; install scoped external worker credentials before resume starts the services. Requires a root SSH target, verified preloaded images, Docker, OpenSSL and flock. No existing unowned data is adopted; prepare/initialize/resume never upgrades or opens signup.\n');return 0;
 }
 let plan,remoteStarted=false;
 try{
  if(args.length!==4||args[0]!=='--config-file'||!isAbsolute(args[1])||args[2]!=='--mode'||!['plan','prepare','initialize','resume','verify'].includes(args[3]))fail('MANAGEMENT_INSTALL_ARGUMENTS_INVALID');
  const mode=args[3],input=await readManagementInstallInput(args[1]);plan=input.plan;
  if(mode==='plan'){
   output.write(JSON.stringify({ok:true,mode,deploymentId:plan.deploymentId,specSha256:plan.specSha256,services:Object.keys(plan.descriptor.workers),
    memoryRequiredBytes:plan.memoryRequiredBytes,cpusRequired:plan.cpusRequired,requiredDiskBytes:plan.requiredDiskBytes,
    externalConsumers:plan.externalConsumers,remoteChanged:false,signupOpened:false,deploymentReady:false})+'\n');return 0;
  }
  const facts=await preflight(input.target),capacity=managementInstallCapacity(plan,facts);
  if(facts.host!==input.target.host||!capacity.allowed){
   output.write(JSON.stringify({ok:false,code:'MANAGEMENT_INSTALL_PREFLIGHT_BLOCKED',reasons:capacity.reasons,remoteChanged:false,signupOpened:false})+'\n');return 2;
  }
  remoteStarted=true;
  const response=await ssh(input.target,managementInstallRemoteScript(plan,mode),JSON.stringify(input.payload),{timeoutMs:600000});
  const lines=response.stdout.trim().split(/\r?\n/),receipt=JSON.parse(lines.at(-1));
   if(receipt.ok!==true){
   const phase=/ROOMQC_MANAGEMENT_PHASE=([a-z_]+)/.exec(response.stderr??'')?.[1];
   output.write(JSON.stringify({ok:false,code:'MANAGEMENT_INSTALL_REMOTE_FAILED',phase:phase??null,nextAction:'verify_same_configuration',signupOpened:false,deploymentReady:false,...(process.env.ROOMQC_MANAGEMENT_DEBUG==='1'?{debug:response.stderr?.slice(-4000)}:{})})+'\n');return 1;
  }
  if(receipt.specSha256!==plan.specSha256||receipt.deploymentId!==plan.deploymentId||receipt.mode!==mode||receipt.signupOpened!==false
    ||receipt.deploymentReady!==false||mode==='prepare'&&(receipt.directoryPrepared!==true||receipt.runtimeStarted!==false))fail('MANAGEMENT_INSTALL_RECEIPT_INVALID');
  // Catch local edits after a long remote install instead of certifying new input.
  if((await readManagementInstallInput(args[1])).plan.specSha256!==plan.specSha256)fail('MANAGEMENT_INSTALL_INPUT_CHANGED');
  output.write(JSON.stringify({...receipt,remoteChanged:mode!=='verify',externalConsumers:plan.externalConsumers})+'\n');return 0;
 }catch(error){
  const code=/^(?:MANAGEMENT_INSTALL_|VPS_PREFLIGHT_)[A-Z_]+$/.test(error?.code??'')?error.code:'MANAGEMENT_INSTALL_FAILED';
  output.write(JSON.stringify({ok:false,code,...(remoteStarted?{nextAction:'verify_same_configuration'}:{}),signupOpened:false,deploymentReady:false})+'\n');return 1;
 }
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await managementInstallMain();
