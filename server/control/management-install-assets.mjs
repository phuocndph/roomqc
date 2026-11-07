// Short-lived root operator only, never used as the API entrypoint. All paths
// belong to one immutable install plan; existing bytes are never replaced.
import {mkdir,lstat,readFile,open,chown,chmod} from 'node:fs/promises';
import {dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {constants} from 'node:fs';
import {assertManagementInstallPlan,managementInstallHash} from './management-install-plan.mjs';
import {renderManagementBundle} from './management-bundle.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const exists=async p=>{try{return await lstat(p)}catch(e){if(e.code==='ENOENT')return null;throw e}};
async function directory(path,{uid=0,mode=0o700,verify=false}={}){
 const info=await exists(path);
 if(info){if(!info.isDirectory()||info.isSymbolicLink()||info.uid!==uid||(info.mode&0o777)!==mode)fail('MANAGEMENT_INSTALL_DIRECTORY_CHANGED');return;}
 if(verify)fail('MANAGEMENT_INSTALL_ASSET_MISSING');
 await mkdir(path,{mode});await chown(path,uid,uid);
}
async function durable(path,content,{uid=1000,mode=0o600,verify=false}={}){
 const bytes=Buffer.from(content),info=await exists(path);
 if(info){
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.uid!==uid||(info.mode&0o777)!==mode
   ||!bytes.equals(await readFile(path)))fail('MANAGEMENT_INSTALL_ASSET_CHANGED');return;
 }
 if(verify)fail('MANAGEMENT_INSTALL_ASSET_MISSING');
 const file=await open(path,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|(constants.O_NOFOLLOW??0),mode);
 try{await file.writeFile(bytes);await file.chown(uid,uid);await file.sync()}finally{await file.close()}
}
async function parents(root,path,{verify=false,credentialDirectories=[]}={}){
 const segments=path.slice(root.length+1).split('/').slice(0,-1);let parent=root;
 for(const segment of segments){parent+='/'+segment;await directory(parent,{verify,uid:credentialDirectories.some(d=>parent===d||parent.startsWith(d+'/'))?1000:0});}
}
async function loadPlan(root){
 const plan=JSON.parse(await readFile(root+'/private/install-plan.json','utf8'));assertManagementInstallPlan(plan);
 if(plan.root!==root||(await readFile(root+'/.roomqc-install-owner','utf8'))!==plan.specSha256+'\n')fail('MANAGEMENT_INSTALL_OWNER_MISMATCH');
 return plan;
}
export async function prepareManagementInstallAssets({root,payload,verify=false}){
 const {plan,files}=payload;assertManagementInstallPlan(plan);
 if(plan.root!==root||(await readFile(root+'/.roomqc-install-owner','utf8'))!==plan.specSha256+'\n')fail('MANAGEMENT_INSTALL_OWNER_MISMATCH');
 if(!Array.isArray(files)||files.length!==plan.files.length)fail('MANAGEMENT_INSTALL_FILES_INVALID');
 for(const expected of plan.files){
  const values=files.filter(f=>f.path===expected.path);if(values.length!==1)fail('MANAGEMENT_INSTALL_FILES_INVALID');
  const value=values[0];if(typeof value.content!=='string'||managementInstallHash(value.content)!==expected.sha256||Buffer.byteLength(value.content)!==expected.bytes)fail('MANAGEMENT_INSTALL_FILE_HASH');
  await parents(root,expected.path,{verify,credentialDirectories:plan.credentialDirectories});
  await durable(expected.path,value.content,{uid:expected.sensitive?1000:0,mode:expected.sensitive?0o600:0o444,verify});
 }
 await directory(root+'/private',{verify});
 await durable(root+'/private/install-plan.json',JSON.stringify(plan)+'\n',{uid:0,verify});
 await directory(plan.runtimeDirectory,{uid:1000,verify});
 for(const path of plan.credentialDirectories){await parents(root,path+'/placeholder',{verify,credentialDirectories:plan.credentialDirectories});}
 await directory(root+'/operator',{uid:1000,verify});await directory(root+'/output',{verify});
 const budgetText=await readFile(plan.descriptor.files.budget,'utf8');
 if(managementInstallHash(budgetText)!==plan.budgetSha256)fail('MANAGEMENT_INSTALL_FILE_HASH');
 const bundle=renderManagementBundle(plan.descriptor,JSON.parse(budgetText));
 for(const service of Object.values(bundle.compose.services))Object.assign(service.labels,plan.resourceLabels,{'roomqc.management.spec':plan.specSha256});
 await durable(root+'/output/management.compose.json',JSON.stringify(bundle.compose,null,2)+'\n',{uid:0,verify});
 return {ok:true,files:files.length,signupOpened:false};
}
export async function installManagementRuntimeVolumes(root,{verify=false}={}){
 const plan=await loadPlan(root),tls=root+'/private/tls';
 for(const [source,path,uid,mode]of [
  ['server.key','/install-private/server.key',70,0o600],['server.crt','/install-private/server.crt',70,0o444],
  ['admin-password','/install-private/admin-password',70,0o600],['ca.crt','/install-ca/ca.crt',0,0o444]]){
  await durable(path,await readFile(tls+'/'+source),{uid,mode,verify});
 }
 for(const [path,uid,mode]of [['/install-private',70,0o700],['/install-ca',0,0o755],['/install-data',70,0o700]]){
  const info=await lstat(path);if(info.isSymbolicLink()||!info.isDirectory())fail('MANAGEMENT_INSTALL_VOLUME_CHANGED');
  if(verify){if(info.uid!==uid||(info.mode&0o777)!==mode)fail('MANAGEMENT_INSTALL_VOLUME_CHANGED')}
  else{await chown(path,uid,uid);await chmod(path,mode);}
 }
 await durable('/install-data/.roomqc-install-owner',plan.specSha256+'\n',{uid:70,verify});
 return {ok:true,keysRotated:false};
}
export async function configureManagementBootstrap(root,identity,{verify=false}={}){
 const plan=await loadPlan(root),budgetText=await readFile(plan.descriptor.files.budget,'utf8');
 if(identity?.databaseName!=='roomqc_control'||!/^[1-9][0-9]{0,9}$/.test(identity.databaseOid??'')||!/^[1-9][0-9]{0,19}$/.test(identity.systemIdentifier??''))fail('MANAGEMENT_INSTALL_DATABASE_IDENTITY');
 const u=new URL('postgresql://roomqc-directory:5432/roomqc_control?sslmode=verify-full');u.username='postgres';u.password=(await readFile(root+'/private/tls/admin-password','utf8')).trim();
 const values={'budget.json':budgetText,'admin.dsn':u.href+'\n','registry.json':await readFile(root+'/private/initial-registry.json','utf8')};
 const cfg={version:1,deploymentId:plan.deploymentId,environment:plan.environment,expected:identity,budgetFile:'/bootstrap/budget.json',
  budgetSha256:plan.budgetSha256,adminDsnFile:'/bootstrap/admin.dsn',credentialsDirectory:'/runtime',registryFile:'/bootstrap/registry.json'};
 values['bootstrap.json']=JSON.stringify(cfg)+'\n';
 for(const [name,value]of Object.entries(values))await durable(root+'/operator/'+name,value,{verify});
 return {ok:true,identityPinned:true};
}
async function main(){
 try{
  if(process.getuid()!==0)fail('MANAGEMENT_INSTALL_OPERATOR_REQUIRED');
  const [action,root,mode,identity]=process.argv.slice(2);if(!['prepare','volumes','bootstrap'].includes(action)||!/^\/opt\/RoomQC\/management\/[a-z][a-z0-9-]{1,23}$/.test(root??'')||!['initialize','resume','verify'].includes(mode))fail('MANAGEMENT_INSTALL_ARGUMENTS_INVALID');
  await directory(root,{verify:true});let result;
  if(action==='prepare'){let text='';for await(const c of process.stdin){text+=c;if(Buffer.byteLength(text)>4*1024*1024)fail('MANAGEMENT_INSTALL_FILES_INVALID')}
   result=await prepareManagementInstallAssets({root,payload:JSON.parse(text),verify:mode==='verify'});}
  if(action==='volumes')result=await installManagementRuntimeVolumes(root,{verify:mode==='verify'});
  if(action==='bootstrap')result=await configureManagementBootstrap(root,JSON.parse(identity),{verify:mode==='verify'});
  console.log(JSON.stringify(result));
 }catch(error){console.log(JSON.stringify({ok:false,code:/^MANAGEMENT_INSTALL_[A-Z_]+$/.test(error?.code??'')?error.code:'MANAGEMENT_INSTALL_ASSETS_FAILED'}));process.exitCode=1;}
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)await main();
