import {pathToFileURL} from 'node:url';
import {isAbsolute} from 'node:path';
import pg from 'pg';
import {readSetupBackfillFile,createSetupBackfillOutput} from './setup-backfill-files.mjs';
import {inspectControlLoginRetirement,retireControlApiLogin} from './control-login-retirement.mjs';
export async function controlApiLoginRetireMain(args=process.argv.slice(2)){
 if(args.length===1&&args[0]==='--help'){
  process.stdout.write('RoomQC dedicated control API login retirement. --config-file ABSOLUTE_PRIVATE_JSON [--apply --expected-plan-sha256 SHA256]. Default: inspect only. Config: version:1, environment:local|staging|production, dsnFile, auditFile, expected:{databaseName,databaseOid,systemIdentifier}, login. Apply writes an exclusive fsynced private audit before retiring NOLOGIN + API membership and terminating exact existing sessions; never re-enables a login. No DSN/password in arguments or output.\n');return;
 }
 let configFile,apply=false,expectedPlanSha256,pool,audit,appliedResult;
 try{
  for(let i=0;i<args.length;i++){
   if(args[i]==='--config-file'&&!configFile)configFile=args[++i];
   else if(args[i]==='--apply'&&!apply)apply=true;
   else if(args[i]==='--expected-plan-sha256'&&!expectedPlanSha256)expectedPlanSha256=args[++i];
   else throw Object.assign(new Error(),{code:'CONTROL_LOGIN_RETIREMENT_ARGUMENTS_INVALID'});
  }
  if(!configFile||!isAbsolute(configFile)||apply!==Boolean(expectedPlanSha256))throw Object.assign(new Error(),{code:'CONTROL_LOGIN_RETIREMENT_ARGUMENTS_INVALID'});
  const config=JSON.parse(await readSetupBackfillFile(configFile,8192));
  if(Object.keys(config).sort().join(',')!=='auditFile,dsnFile,environment,expected,login,version'||config.version!==1
   ||!['local','staging','production'].includes(config.environment)||!isAbsolute(config.dsnFile)||!isAbsolute(config.auditFile)
   ||config.auditFile===configFile||config.auditFile===config.dsnFile)
   throw Object.assign(new Error(),{code:'CONTROL_LOGIN_RETIREMENT_CONFIG_INVALID'});
  const dsn=(await readSetupBackfillFile(config.dsnFile,8192)).trim(),url=new URL(dsn);
  if(!['postgres:','postgresql:'].includes(url.protocol)||url.hash||!url.username||!url.password||
   (config.environment!=='local'&&url.searchParams.get('sslmode')!=='verify-full'))
   throw Object.assign(new Error(),{code:'CONTROL_LOGIN_RETIREMENT_DSN_INVALID'});
  pool=new pg.Pool({connectionString:dsn,max:1,connectionTimeoutMillis:5000,statement_timeout:5000,query_timeout:6000});
  const options={expected:config.expected,login:config.login};
  if(apply){
   const plan=await inspectControlLoginRetirement(pool,options);
   if(plan.planSha256!==expectedPlanSha256)throw Object.assign(new Error(),{code:'CONTROL_LOGIN_RETIREMENT_PLAN_CHANGED'});
   audit=await createSetupBackfillOutput(config.auditFile);
   await audit.append({event:'control_login_retirement_planned',recordedAtUtc:new Date().toISOString(),plan});
   appliedResult=await retireControlApiLogin(pool,{...options,expectedPlanSha256});
   await audit.append({event:'control_login_retirement_verified',recordedAtUtc:new Date().toISOString(),result:appliedResult});
  }
  const result=apply?appliedResult:await inspectControlLoginRetirement(pool,options);
  process.stdout.write(JSON.stringify({ok:true,mode:apply?'apply':'inspect',...result})+'\n');
 }catch(error){process.stdout.write(JSON.stringify({ok:false,code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'CONTROL_LOGIN_RETIREMENT_UNAVAILABLE',
  ...(error.retirementCommitted||appliedResult?{retirementCommitted:true}:error.retirementMayHaveCommitted?{retirementMayHaveCommitted:true}:{}),
  ...(error.retirementCommitted||appliedResult||error.retirementMayHaveCommitted?
   {nextAction:'Inspect the same login and complete session retirement; never re-enable old credentials.'}:{})})+'\n');process.exitCode=1}
 finally{await audit?.close();await pool?.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await controlApiLoginRetireMain();
