import {isAbsolute,join,relative,sep,resolve} from 'node:path';
import {lstat,readdir,realpath} from 'node:fs/promises';
import {assertSetupBackfillAccess,readSetupBackfillFile} from './setup-backfill-files.mjs';
import {loadResourceBudgetSnapshot} from './resource-budget.mjs';
import {directoryRuntimePlan,validateDirectoryRuntimeCredentials} from './directory-runtime-logins.mjs';
import {writeDirectoryPrivateFile} from './directory-runtime-logins-cli.mjs';
import {renderDirectoryRuntimeWiring} from './directory-runtime-wiring.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const overlaps=(a,b)=>{const r=relative(a,b);return r!=='..'&&!r.startsWith('..'+sep)&&!isAbsolute(r)};
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys;
export async function directoryRuntimeWiringMain(args=process.argv.slice(2),{output=process.stdout}={}){
 if(args.length===1&&args[0]==='--help'){
  output.write('Render RoomQC per-runtime Compose overlays from prepared credentials. --config-file ABSOLUTE_PRIVATE_JSON. Config: version:1, loginConfigFile, outputDirectory, summaryInputs:[{ordinal,installerFile}]. Uses no database/provider. Writes only private output, never starts services or prints credentials.\n');return 0;
 }
 try{
  if(args.length!==2||args[0]!=='--config-file'||!isAbsolute(args[1]))fail('DIRECTORY_WIRING_ARGUMENTS_INVALID');
  const raw=JSON.parse(await readSetupBackfillFile(args[1],16384));
  if(!exact(raw,'loginConfigFile,outputDirectory,summaryInputs,version')||raw.version!==1
   ||![raw.loginConfigFile,raw.outputDirectory].every(p=>typeof p==='string'&&isAbsolute(p))||!Array.isArray(raw.summaryInputs)
   ||raw.summaryInputs.some(i=>!exact(i,'installerFile,ordinal')||!Number.isSafeInteger(i.ordinal)||i.ordinal<1||!isAbsolute(i.installerFile)))
   fail('DIRECTORY_WIRING_INPUT_INVALID');
  const login=JSON.parse(await readSetupBackfillFile(raw.loginConfigFile,16384));
  if(!exact(login,'budgetFile,budgetSha256,credentialsDirectory,deploymentId,dsnFile,environment,expected,version')
   ||![login.budgetFile,login.credentialsDirectory].every(p=>typeof p==='string'&&isAbsolute(p)))fail('DIRECTORY_WIRING_INPUT_INVALID');
  const plan=directoryRuntimePlan({version:login.version,environment:login.environment,deploymentId:login.deploymentId,
   expected:login.expected,budgetSha256:login.budgetSha256},loadResourceBudgetSnapshot(login.budgetFile));
  await assertSetupBackfillAccess(raw.outputDirectory,{directory:true});await assertSetupBackfillAccess(login.credentialsDirectory,{directory:true});
  const out=await realpath(raw.outputDirectory),credentials=await realpath(login.credentialsDirectory);
  if(overlaps(out,credentials)||overlaps(credentials,out)||[args[1],raw.loginConfigFile,login.budgetFile,login.dsnFile,...raw.summaryInputs.map(i=>i.installerFile)]
   .some(p=>typeof p!=='string'||overlaps(out,resolve(p))))fail('DIRECTORY_WIRING_OUTPUT_OVERLAP');
  const bundle=JSON.parse(await readSetupBackfillFile(join(credentials,'runtime-credentials.json'),256*1024));
  const entries=validateDirectoryRuntimeCredentials(plan,bundle);
  for(const r of plan.roles){
   if(await readSetupBackfillFile(join(credentials,r.name+'.dsn'),8192)!==entries.get(r.name).databaseUrl+'\n')fail('DIRECTORY_WIRING_CREDENTIAL_MISMATCH');
  }
  const summaryInputs=[];
  for(const input of raw.summaryInputs)summaryInputs.push({ordinal:input.ordinal,installer:JSON.parse(await readSetupBackfillFile(input.installerFile,131072))});
  const rendered=renderDirectoryRuntimeWiring(plan,bundle,{credentialsDirectory:credentials,outputDirectory:out,summaryInputs});
  const manifest={version:1,planSha256:plan.planSha256,services:rendered.services,otherConsumers:plan.otherConsumers,
   runtimeVerified:false,deploymentReady:false,signupOpened:false};
  const files=[...rendered.files,{name:'wiring.json',content:JSON.stringify(manifest,null,2)+'\n'}],allowed=new Set(files.map(f=>f.name));
  if((await readdir(out)).some(n=>!allowed.has(n)))fail('DIRECTORY_WIRING_OUTPUT_NOT_OWNED');
  for(const file of files){
   const p=join(out,file.name);let present=false;
   try{await lstat(p);present=true}catch(e){if(e.code!=='ENOENT')throw e}
   if(present){if(await readSetupBackfillFile(p,256*1024)!==file.content)fail('DIRECTORY_WIRING_OUTPUT_CONFLICT')}
   else await writeDirectoryPrivateFile(p,file.content);
  }
  output.write(JSON.stringify({ok:true,planSha256:plan.planSha256,services:rendered.services.map(({consumerId,ordinal})=>({consumerId,ordinal})),
   files:files.length,databaseChanged:false,runtimeStarted:false,deploymentReady:false,signupOpened:false})+'\n');return 0;
 }catch(error){
  output.write(JSON.stringify({ok:false,code:/^[A-Z0-9_]+$/.test(error.code??'')?error.code:'DIRECTORY_WIRING_UNAVAILABLE'})+'\n');return 1;
 }
}
