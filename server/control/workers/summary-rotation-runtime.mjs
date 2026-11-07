import {isAbsolute,resolve,dirname,relative} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {readSetupBackfillFile} from '../setup-backfill-files.mjs';
import {loadSummaryCredentialInstaller,runSummaryCredentialInstaller} from '../tenant-summary-installer.mjs';
import {summaryRotationConfiguration,summaryRotationContext,SummaryCredentialRotator} from '../tenant-summary-rotation.mjs';
import {SummaryRotationJournal} from '../tenant-summary-rotation-journal.mjs';
import {summaryResourceConfigurationHash,summaryResourceProfile} from '../summary-resource-profile.mjs';
import {startSummaryRotationStatus} from './summary-rotation-status.mjs';
import {resourceMode} from '../resource-runtime.mjs';
const fail=code=>{throw Object.assign(new Error(code),{code})};
const sha=v=>createHash('sha256').update(v).digest('hex');
const assertRunning=signal=>{if(signal?.aborted)fail('SUMMARY_ROTATION_STOPPED')};
export function summaryRotationArguments(args){
 if(args.length===1&&args[0]==='--help')return {help:true};
 let configFile,allowLocal=false,once=false;
 for(let i=0;i<args.length;i++){
  if(args[i]==='--allow-local'&&!allowLocal){allowLocal=true;continue}
  if(args[i]==='--once'&&!once){once=true;continue}
  if(args[i]!=='--config-file'||configFile||typeof args[i+1]!=='string'||!isAbsolute(args[i+1])||resolve(args[i+1])!==args[i+1])
   fail('SUMMARY_ROTATION_ARGUMENTS_INVALID');
  configFile=args[++i];
 }
 if(!configFile)fail('SUMMARY_ROTATION_ARGUMENTS_INVALID');return {configFile,allowLocal,once};
}
export async function loadSummaryRotation(configFile,{allowLocal=false,signal}={}){
 assertRunning(signal);
 const policyText=await readSetupBackfillFile(configFile,32768),policy=summaryRotationConfiguration(JSON.parse(policyText));
 assertRunning(signal);
 const initial=await loadSummaryCredentialInstaller(policy.installerConfigFile,{allowLocal});
 assertRunning(signal);
 summaryRotationContext(policy,initial.config);
 const output=dirname(initial.config.publisher.outputFile),rel=relative(output,configFile);
 if(rel===''||!rel.startsWith('..')&&!isAbsolute(rel))fail('SUMMARY_ROTATION_OUTPUT_ISOLATION');
 const installerSha256=initial.files.get(policy.installerConfigFile).hash,policySha256=sha(policyText);
 return {policy,initial,installerSha256,async assertPolicy(){
  if(sha(await readSetupBackfillFile(configFile,32768))!==policySha256)fail('SUMMARY_ROTATION_CONFIG_CHANGED');
 }};
}
export async function startSummaryRotation({configFile,allowLocal=false,once=false},{env=process.env,signal,onEvent=e=>process.stdout.write(JSON.stringify(e)+'\n'),statusPort=8097}={}){
 assertRunning(signal);
 const local=allowLocal&&env.NODE_ENV!=='production';
 if(process.platform!=='linux'&&!local)fail('SUMMARY_ROTATION_PLATFORM_UNSUPPORTED');
 const loaded=await loadSummaryRotation(configFile,{allowLocal:local,signal});
 if(resourceMode(env).environment!==loaded.initial.config.environment)fail('SUMMARY_ROTATION_RESOURCE_INVALID');
 const resources=summaryResourceProfile(loaded.initial.config,loaded.initial.contexts,
  summaryResourceConfigurationHash(loaded.policy,loaded.initial.config));
 const journal=new SummaryRotationJournal({directory:loaded.policy.journalDirectory,instanceId:loaded.policy.instanceId,allowWindowsLocal:local});
 await journal.initialize();
 assertRunning(signal);
 const rotator=new SummaryCredentialRotator({policy:loaded.policy,journal,onEvent,
  loadInstaller:async()=>{
   await loaded.assertPolicy();const value=await loadSummaryCredentialInstaller(loaded.policy.installerConfigFile,{allowLocal:local});
   if(value.files.get(loaded.policy.installerConfigFile)?.hash!==loaded.installerSha256)fail('SUMMARY_ROTATION_CONFIG_CHANGED');return value;
  },
  runInstaller:async commandFile=>{
   await loaded.assertPolicy();
   return runSummaryCredentialInstaller(['--config-file',loaded.policy.installerConfigFile,'--command-file',commandFile,...(local?['--allow-local']:[])],
    {env,expectedConfigSha256:loaded.installerSha256});
  }});
 // The latch must reach the rotator before tick/start yields, including --once.
 // shutdown synchronously closes readiness and the timer before draining I/O.
 let status;
 const abort=()=>{void rotator.shutdown();void status?.stop()};
 signal?.addEventListener('abort',abort,{once:true});
 const shutdown=async()=>{try{await Promise.all([rotator.shutdown(),status?.stop()])}finally{signal?.removeEventListener('abort',abort)}};
 try{
  assertRunning(signal);
  if(once){const result=await rotator.tick();return {rotator,result,resources,shutdown}}
  status=await startSummaryRotationStatus(rotator,resources,{port:statusPort});
  assertRunning(signal);rotator.start();return {rotator,resources,server:status.server,shutdown};
 }catch(error){await shutdown();throw error}
}
export async function summaryRotationMain(args=process.argv.slice(2),env=process.env,{host=process,start=startSummaryRotation}={}){
 let runtime,parsed,failed=false,stopping=false,stopPromise,timer;
 const cancel=new AbortController();
 let startupSettled;const startupDone=new Promise(resolve=>startupSettled=resolve);
 const emit=value=>host.stdout.write(JSON.stringify(value)+'\n');
 const removeSignals=()=>{host.removeListener('SIGTERM',stop);host.removeListener('SIGINT',stop)};
 const stop=()=>{
  if(stopping)return;stopping=true;cancel.abort();
  timer=setTimeout(()=>host.exit(1),55000);timer.unref();
  emit({type:'summary_rotation_stopping',...(runtime?{instanceId:runtime.rotator.policy.instanceId}:{})});
  stopPromise=(async()=>{
   await startupDone;
   try{
    await runtime?.shutdown();
    emit({type:'summary_rotation_stopped',...(runtime?{instanceId:runtime.rotator.policy.instanceId}:{})});
    if(!failed)host.exitCode=0;
   }catch{failed=true;host.exitCode=1}
   finally{clearTimeout(timer);removeSignals()}
  })();
 };
 try{
  parsed=summaryRotationArguments(args);
  if(parsed.help){host.stdout.write('RoomQC scoped summary credential rotation. --config-file <absolute private JSON> [--once] [--allow-local]. Linux required outside local. Bootstrap/revoked/expired heads require operator review.\n');return}
  // Install handlers BEFORE the first asynchronous configuration/journal load.
  // Startup errors remain failures even when a signal arrives concurrently.
  host.on('SIGTERM',stop);host.on('SIGINT',stop);
  try{runtime=await start(parsed,{env,signal:cancel.signal,onEvent:emit})}finally{startupSettled()}
  if(stopping){await stopPromise;return runtime}
  if(parsed.once){host.exitCode=['rotated','idle','superseded','peer-completed'].includes(runtime.result.action)?0:1;await runtime.shutdown();removeSignals()}
  return runtime;
 }catch(error){
  if(!(cancel.signal.aborted&&error?.code==='SUMMARY_ROTATION_STOPPED')){
   failed=true;const code=/^(?:SUMMARY_ROTATION|SUMMARY_INSTALLER)_[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SUMMARY_ROTATION_START_FAILED';
   host.stderr.write(JSON.stringify({type:'summary_rotation_unavailable',code})+'\n');host.exitCode=1;
  }
  startupSettled();
  if(stopping)await stopPromise;else removeSignals();
 }finally{
  startupSettled();
  if(parsed?.help||failed||parsed?.once)removeSignals();
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await summaryRotationMain();
