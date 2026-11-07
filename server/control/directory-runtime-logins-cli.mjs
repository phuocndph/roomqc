import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {isAbsolute,join,resolve,dirname} from 'node:path';
import pg from 'pg';
import {assertSetupBackfillAccess,readSetupBackfillFile} from './setup-backfill-files.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {healthDatabaseUrl} from './workers/health-config.mjs';
import {directoryRuntimePlan,createDirectoryRuntimeCredentials,validateDirectoryRuntimeCredentials,provisionDirectoryRuntimeLogins} from './directory-runtime-logins.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const samePath=(a,b)=>resolve(a)===resolve(b);
async function exists(file){try{await lstat(file);return true}catch(e){if(e.code==='ENOENT')return false;throw e}}
export async function writeDirectoryPrivateFile(file,content){
 await assertSetupBackfillAccess(dirname(file),{directory:true});let handle;
 try{
  handle=await open(file,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
  await assertSetupBackfillAccess(file);await handle.writeFile(content);await handle.sync();
 }finally{await handle?.close()}
 if(process.platform!=='win32'){
  const directory=await open(dirname(file),constants.O_RDONLY);try{await directory.sync()}finally{await directory.close()}
 }
}
export async function directoryRuntimeLoginsMain(args=process.argv.slice(2),{output=process.stdout,poolFactory=options=>new pg.Pool(options)}={}){
 if(args.length===1&&args[0]==='--help'){
  output.write('RoomQC deployment-side directory LOGIN provisioner. --config-file ABSOLUTE_PRIVATE_JSON --prepare|--apply|--verify. Prepare creates exclusive private credentials before database changes; apply creates only new bounded capability members; verify changes no grants. Repeat with the same configuration and files. Never rotates passwords or adopts conflicting existing roles. No credentials in arguments/output.\n');return 0;
 }
 let pool,configFile,mode;
 try{
  for(let i=0;i<args.length;i++){
   if(args[i]==='--config-file'&&!configFile)configFile=args[++i];
   else if(['--prepare','--apply','--verify'].includes(args[i])&&!mode)mode=args[i].slice(2);
   else fail('DIRECTORY_LOGIN_ARGUMENTS_INVALID');
  }
  if(!configFile||!isAbsolute(configFile)||!mode)fail('DIRECTORY_LOGIN_ARGUMENTS_INVALID');
  const config=JSON.parse(await readSetupBackfillFile(configFile,16384));
  if(Object.keys(config).sort().join(',')!=='budgetFile,budgetSha256,credentialsDirectory,deploymentId,dsnFile,environment,expected,version'
   ||![config.budgetFile,config.dsnFile,config.credentialsDirectory].every(p=>typeof p==='string'&&isAbsolute(p)))fail('DIRECTORY_LOGIN_CONFIG_INVALID');
  const plan=directoryRuntimePlan({version:config.version,environment:config.environment,deploymentId:config.deploymentId,
   expected:config.expected,budgetSha256:config.budgetSha256},loadResourceBudgetSnapshot(config.budgetFile));
  await assertSetupBackfillAccess(config.credentialsDirectory,{directory:true});
  const bundleFile=join(config.credentialsDirectory,'runtime-credentials.json'),dsnFiles=plan.roles.map(r=>join(config.credentialsDirectory,r.name+'.dsn'));
  if([bundleFile,...dsnFiles].some(p=>[configFile,config.budgetFile,config.dsnFile].some(q=>samePath(p,q))))fail('DIRECTORY_LOGIN_FILE_COLLISION');
  let bundle;
  if(await exists(bundleFile))bundle=JSON.parse(await readSetupBackfillFile(bundleFile,256*1024));
  else{
   if(mode!=='prepare')fail('DIRECTORY_LOGIN_PREPARE_REQUIRED');
   bundle=createDirectoryRuntimeCredentials(plan);await writeDirectoryPrivateFile(bundleFile,JSON.stringify(bundle)+'\n');
  }
  const credentials=validateDirectoryRuntimeCredentials(plan,bundle);
  for(let i=0;i<plan.roles.length;i++){
   const content=credentials.get(plan.roles[i].name).databaseUrl+'\n';
   if(await exists(dsnFiles[i])){
    if(await readSetupBackfillFile(dsnFiles[i],8192)!==content)fail('DIRECTORY_LOGIN_SECRET_FILE_MISMATCH');
   }else{
    if(mode!=='prepare')fail('DIRECTORY_LOGIN_PREPARE_REQUIRED');
    await writeDirectoryPrivateFile(dsnFiles[i],content);
   }
  }
  // Validate/re-read all credential bytes before any administrative connection.
  const durable=JSON.parse(await readSetupBackfillFile(bundleFile,256*1024));
  validateDirectoryRuntimeCredentials(plan,durable);
  if(JSON.stringify(durable)!==JSON.stringify(bundle))fail('DIRECTORY_LOGIN_SECRET_FILE_MISMATCH');
  if(mode==='prepare'){
   output.write(JSON.stringify({ok:true,mode,planSha256:plan.planSha256,credentialsPrepared:plan.roles.length,databaseChanged:false,
    otherConsumers:plan.otherConsumers,deploymentReady:false,signupOpened:false})+'\n');return 0;
  }
  if(process.env.NODE_TLS_REJECT_UNAUTHORIZED!==undefined&&process.env.NODE_TLS_REJECT_UNAUTHORIZED!=='1')fail('DIRECTORY_LOGIN_TLS_UNSAFE');
  const dsn=(await readSetupBackfillFile(config.dsnFile,8192)).trim();
  healthDatabaseUrl(dsn,{production:config.environment!=='local',allowLocal:config.environment==='local'});
  pool=poolFactory({connectionString:dsn,max:1,connectionTimeoutMillis:5000,idleTimeoutMillis:1000,
   statement_timeout:5000,lock_timeout:5000,idle_in_transaction_session_timeout:10000,application_name:'roomqc-directory-login-installer'});
  const result=await provisionDirectoryRuntimeLogins(pool,plan,durable,{verifyOnly:mode==='verify'});
  output.write(JSON.stringify({ok:true,mode,...result})+'\n');return 0;
 }catch(error){
  output.write(JSON.stringify({ok:false,code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'DIRECTORY_LOGIN_UNAVAILABLE',
   ...(error.commitMayHaveSucceeded?{commitMayHaveSucceeded:true,nextAction:'Verify using the same private credential bundle; never generate replacement passwords.'}:{})})+'\n');return 1;
 }finally{await pool?.end()}
}
