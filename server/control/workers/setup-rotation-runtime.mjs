import {isAbsolute,resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readSetupBackfillFile} from '../setup-backfill-files.mjs';
import {loadSetupCredentialInstaller,runSetupCredentialInstaller} from '../setup-credential-installer.mjs';
import {setupRotationConfiguration,setupRotationContext,SetupCredentialRotator} from '../setup-credential-rotation.mjs';
import {SetupRotationJournal} from '../setup-rotation-journal.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const sha=v=>createHash('sha256').update(v).digest('hex');
const assertRunning=signal=>{if(signal?.aborted)fail('SETUP_ROTATION_STOPPED')};
export function setupRotationArguments(args){
 if(args.length===1&&args[0]==='--help')return {help:true};
 let configFile,allowLocal=false,once=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--allow-local'&&!allowLocal){allowLocal=true;continue}
  if(args[i]==='--once'&&!once){once=true;continue}
  if(args[i]!=='--config-file'||configFile||typeof args[i+1]!=='string'||!isAbsolute(args[i+1])||resolve(args[i+1])!==args[i+1])
   fail('SETUP_ROTATION_ARGUMENTS_INVALID');
  configFile=args[++i];
 }
 if(!configFile)fail('SETUP_ROTATION_ARGUMENTS_INVALID');return {configFile,allowLocal,once};
}
export async function loadSetupRotation(configFile,{allowLocal=false,signal}={}){
 assertRunning(signal);
 const policyText=await readSetupBackfillFile(configFile,32768),policy=setupRotationConfiguration(JSON.parse(policyText));
 assertRunning(signal);
 const initial=await loadSetupCredentialInstaller(policy.installerConfigFile,{allowLocal});
 assertRunning(signal);
 setupRotationContext(policy,initial.config);
 const output=dirname(initial.config.publisher.outputFile),rel=relative(output,configFile);
 if(rel===''||!rel.startsWith('..')&&!isAbsolute(rel))fail('SETUP_ROTATION_OUTPUT_ISOLATION');
 const installerSha256=initial.files.get(policy.installerConfigFile).hash,policySha256=sha(policyText);
 return {policy,initial,installerSha256,async assertPolicy(){
  if(sha(await readSetupBackfillFile(configFile,32768))!==policySha256)fail('SETUP_ROTATION_CONFIG_CHANGED');
 }};
}
export async function startSetupRotation({configFile,allowLocal=false,once=false},{env=process.env,signal,onEvent=e=>process.stdout.write(JSON.stringify(e)+'\n')}={}){
 assertRunning(signal);
 const local=allowLocal&&env.NODE_ENV!=='production';
 if(process.platform!=='linux'&&!local)fail('SETUP_ROTATION_PLATFORM_UNSUPPORTED');
 const loaded=await loadSetupRotation(configFile,{allowLocal:local,signal});
 const journal=new SetupRotationJournal({directory:loaded.policy.journalDirectory,instanceId:loaded.policy.instanceId,allowWindowsLocal:local});
 await journal.initialize();
 assertRunning(signal);
 const rotator=new SetupCredentialRotator({policy:loaded.policy,journal,onEvent,
  loadInstaller:async()=>{
   await loaded.assertPolicy();const value=await loadSetupCredentialInstaller(loaded.policy.installerConfigFile,{allowLocal:local});
   if(value.files.get(loaded.policy.installerConfigFile)?.hash!==loaded.installerSha256)fail('SETUP_ROTATION_CONFIG_CHANGED');return value;
  },
  runInstaller:async commandFile=>{
   await loaded.assertPolicy();
   return runSetupCredentialInstaller(['--config-file',loaded.policy.installerConfigFile,'--command-file',commandFile,...(local?['--allow-local']:[])],
    {env,expectedConfigSha256:loaded.installerSha256});
  }});
 // The latch must reach the rotator before tick/start yields, including --once.
 // shutdown synchronously closes readiness and the timer before draining I/O.
 const abort=()=>{void rotator.shutdown()};
 signal?.addEventListener('abort',abort,{once:true});
 const shutdown=async()=>{try{await rotator.shutdown()}finally{signal?.removeEventListener('abort',abort)}};
 try{
  assertRunning(signal);
  if(once){const result=await rotator.tick();return {rotator,result,shutdown}}
  rotator.start();return {rotator,shutdown};
 }catch(error){await shutdown();throw error}
}
export async function setupRotationMain(args=process.argv.slice(2),env=process.env,{host=process,start=startSetupRotation}={}){
 let runtime,parsed,failed=false,stopping=false,stopPromise,timer;
 const cancel=new AbortController();
 let startupSettled;const startupDone=new Promise(resolve=>startupSettled=resolve);
 const emit=value=>host.stdout.write(JSON.stringify(value)+'\n');
 const removeSignals=()=>{host.removeListener('SIGTERM',stop);host.removeListener('SIGINT',stop)};
 const stop=()=>{
  if(stopping)return;stopping=true;cancel.abort();
  timer=setTimeout(()=>host.exit(1),55000);timer.unref();
  emit({type:'setup_rotation_stopping',...(runtime?{instanceId:runtime.rotator.policy.instanceId}:{})});
  stopPromise=(async()=>{
   await startupDone;
   try{
    await runtime?.shutdown();
    emit({type:'setup_rotation_stopped',...(runtime?{instanceId:runtime.rotator.policy.instanceId}:{})});
    if(!failed)host.exitCode=0;
   }catch{failed=true;host.exitCode=1}
   finally{clearTimeout(timer);removeSignals()}
  })();
 };
 try{
  parsed=setupRotationArguments(args);
  if(parsed.help){host.stdout.write('RoomQC scoped setup credential rotation. --config-file <absolute private JSON> [--once] [--allow-local]. Linux required outside local. Bootstrap/revoked/expired heads require operator review.\n');return}
  // Install handlers BEFORE the first asynchronous configuration/journal load.
  // Startup errors remain failures even when a signal arrives concurrently.
  host.on('SIGTERM',stop);host.on('SIGINT',stop);
  try{runtime=await start(parsed,{env,signal:cancel.signal,onEvent:emit})}finally{startupSettled()}
  if(stopping){await stopPromise;return runtime}
  if(parsed.once){host.exitCode=['rotated','idle','superseded','peer-completed'].includes(runtime.result.action)?0:1;await runtime.shutdown();removeSignals()}
  return runtime;
 }catch(error){
  if(!(cancel.signal.aborted&&error?.code==='SETUP_ROTATION_STOPPED')){
   failed=true;const code=/^(?:SETUP_ROTATION|SETUP_INSTALLER)_[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SETUP_ROTATION_START_FAILED';
   host.stderr.write(JSON.stringify({type:'setup_rotation_unavailable',code})+'\n');host.exitCode=1;
  }
  startupSettled();
  if(stopping)await stopPromise;else removeSignals();
 }finally{
  startupSettled();
  if(parsed?.help||failed||parsed?.once)removeSignals();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await setupRotationMain();
