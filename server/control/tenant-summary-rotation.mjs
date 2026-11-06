// Rotation orchestrates the existing fenced installer. It never binds a
// target, bootstraps a missing credential, or revives a revoked/expired head.
import {randomUUID,createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {isAbsolute,resolve,dirname,relative} from 'node:path';
import {exact} from './probe-secrets.mjs';
import {uuidPattern} from './errors.mjs';
import {summaryCredentialCanonical} from './tenant-summary-signing.mjs';
import {summaryMaintenanceBinding} from './tenant-summary-maintenance.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const absolute=p=>typeof p==='string'&&isAbsolute(p)&&resolve(p)===p;
const sha=v=>createHash('sha256').update(v).digest('hex');
export const summaryRotationInstallerDeadlineMs=45000;
export function summaryRotationConfiguration(raw){
 if(!exact(raw,['version','instanceId','installerConfigFile','journalDirectory','ttlSeconds','overlapSeconds','rotateBeforeSeconds','intervalMs'])
  ||raw.version!==1||typeof raw.instanceId!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(raw.instanceId)
  ||!absolute(raw.installerConfigFile)||!absolute(raw.journalDirectory)
  ||!Number.isSafeInteger(raw.ttlSeconds)||raw.ttlSeconds<120||raw.ttlSeconds>3600
  ||!Number.isSafeInteger(raw.overlapSeconds)||raw.overlapSeconds<10||raw.overlapSeconds>60
  ||!Number.isSafeInteger(raw.rotateBeforeSeconds)||raw.rotateBeforeSeconds<60||raw.rotateBeforeSeconds>raw.ttlSeconds-60
  ||!Number.isSafeInteger(raw.intervalMs)||raw.intervalMs<100||raw.intervalMs>30000
  ||raw.ttlSeconds-raw.rotateBeforeSeconds<=raw.overlapSeconds
  ||raw.rotateBeforeSeconds*1000<summaryRotationInstallerDeadlineMs+raw.intervalMs+10000)fail('SUMMARY_ROTATION_CONFIG_INVALID');
 return Object.freeze({...raw});
}
export function summaryRotationContext(policy,installer){
 if(installer.consumerId!=='summary-credential-rotation'||!installer.publisher)fail('SUMMARY_ROTATION_ISSUER_REQUIRED');
 // No command/journal or daemon configuration may become worker-visible.
 const output=dirname(installer.publisher.outputFile);
 for(const input of [policy.journalDirectory,policy.installerConfigFile]){
  const rel=relative(output,input);
  if(rel===''||!rel.startsWith('..')&&!isAbsolute(rel))fail('SUMMARY_ROTATION_OUTPUT_ISOLATION');
 }
 const binding=summaryMaintenanceBinding(installer.target.cluster,installer.target.expected);
 return Object.freeze({version:1,instanceId:policy.instanceId,configurationSha256:sha(summaryCredentialCanonical(installer)),
  policySha256:sha(summaryCredentialCanonical(policy)),clusterId:binding.clusterId,bindingSha256:binding.bindingHash,
  releaseSha256:binding.releaseFingerprint});
}
export function summaryRotationDecision(policy,observation,{elapsedMs=0}={}){
 if(!observation||observation.contractVersion!==1||observation.historicalResult!==false
  ||!Number.isSafeInteger(observation.version)||observation.version<0||observation.version>=9007199254740989
  ||typeof observation.observedAt!=='string'||!Number.isFinite(Date.parse(observation.observedAt))
  ||!Number.isFinite(elapsedMs)||elapsedMs<0||elapsedMs>summaryRotationInstallerDeadlineMs)fail('SUMMARY_ROTATION_OBSERVATION_INVALID');
 if(observation.ready!==true){
  const reasons=['UNBOUND','CREDENTIAL_MISSING','CREDENTIAL_TARGET_MISMATCH','CREDENTIAL_REVOKED',
   'CREDENTIAL_NOT_YET_VALID','CREDENTIAL_EXPIRED','CREDENTIAL_RETIRED'];
  if(!reasons.includes(observation.reasonCode))fail('SUMMARY_ROTATION_OBSERVATION_INVALID');
  return {action:'review',code:'SUMMARY_ROTATION_MANUAL_REQUIRED',reasonCode:observation.reasonCode};
 }
 // DB time owns validity. Conservatively include the entire monotonic check
 // duration; wall-clock skew on the daemon must never extend a credential.
 const c=observation.credential,observedAt=Date.parse(observation.observedAt),at=observedAt+elapsedMs;
 if(observation.reasonCode!==null||!c||!uuidPattern.test(c.id??'')||c.revokedAt!==null||c.retireAfter!==null
  ||!Number.isFinite(Date.parse(c.notBefore))||!Number.isFinite(Date.parse(c.expiresAt))
  ||Date.parse(c.notBefore)>observedAt||Date.parse(c.expiresAt)<=observedAt
  ||Date.parse(c.expiresAt)-Date.parse(c.notBefore)>3600000)fail('SUMMARY_ROTATION_OBSERVATION_INVALID');
 if(Date.parse(c.expiresAt)<=at)return {action:'review',code:'SUMMARY_ROTATION_MANUAL_REQUIRED',reasonCode:'CREDENTIAL_EXPIRED'};
 return Date.parse(c.expiresAt)-at>policy.rotateBeforeSeconds*1000?{action:'idle'}:{action:'rotate',
  expectedVersion:observation.version,predecessorId:c.id};
}
export function summaryRotationCommand(policy,context,installer,decision,{uuid=randomUUID}={}){
 if(decision.action!=='rotate')fail('SUMMARY_ROTATION_OBSERVATION_INVALID');
 return Object.freeze({version:1,operation:'issue',key:uuid(),requestId:uuid(),reason:'Scheduled summary credential rotation',
  expectedVersion:decision.expectedVersion,clusterId:context.clusterId,bindingSha256:context.bindingSha256,
  releaseSha256:context.releaseSha256,predecessorId:decision.predecessorId,ttlSeconds:policy.ttlSeconds,
  overlapSeconds:policy.overlapSeconds,signerAlgorithm:installer.publisher.signer.algorithm,
  signerFingerprint:installer.publisher.signer.fingerprint});
}
const safeInstallerCode=error=>/^(?:SUMMARY_INSTALLER|SUMMARY_PUBLICATION|SUMMARY_ROTATION)_[A-Z_]{1,64}$/.test(error?.code??'')
 ?error.code:'SUMMARY_ROTATION_DEPENDENCY_FAILED';
export class SummaryCredentialRotator{
 constructor({policy,loadInstaller,runInstaller,journal,now=Date.now,monotonic=()=>performance.now(),random=Math.random,onEvent=()=>{}}){
  this.policy=summaryRotationConfiguration(policy);
  if(typeof loadInstaller!=='function'||typeof runInstaller!=='function'||!journal
   ||!['readPending','prepare','archive','checkCommand'].every(k=>typeof journal[k]==='function'))fail('SUMMARY_ROTATION_CONFIG_INVALID');
  Object.assign(this,{loadInstaller,runInstaller,journal,now,monotonic,random,onEvent});this.stopping=false;this.ready=false;this.failures=0;
 }
 emit(event){try{this.onEvent({type:'summary_rotation_cycle',instanceId:this.policy.instanceId,...event})}catch{}}
 async dispatch(pending){
  if(this.stopping)return {action:'stopping',commandId:pending.command.key};
  try{
   const result=await this.runInstaller(pending.commandFile);
   if(!result||result.ok!==true||result.operation!=='issue'||result.commandId!==pending.command.key
    ||!uuidPattern.test(result.credentialId??'')||result.filePublished!==true||result.nativeRpcVerified!==true
    ||!Number.isSafeInteger(result.expiresAt))fail('SUMMARY_ROTATION_RESULT_INVALID');
   await this.journal.archive(pending,{version:1,outcome:'published',commandId:result.commandId,
    credentialId:result.credentialId,expiresAt:result.expiresAt});
   this.ready=!this.stopping;return {action:'rotated',commandId:result.commandId,credentialId:result.credentialId,expiresAt:result.expiresAt};
  }catch(error){
   if(['SUMMARY_INSTALLER_VERSION_CONFLICT','SUMMARY_INSTALLER_PREDECESSOR_CONFLICT'].includes(error?.code)){
    await this.journal.archive(pending,{version:1,outcome:'superseded',commandId:pending.command.key,code:error.code});
    this.ready=false;return {action:'superseded',code:error.code,commandId:pending.command.key};
   }
   // Keep the original key/body/caller through transport loss, timeout,
   // publication failure, file faults and restart. Never infer rollback.
   this.ready=false;return {action:'review',code:safeInstallerCode(error),sameCommandRequired:true,commandId:pending.command.key};
  }
 }
 async cycle(){
  if(this.stopping)return {action:'stopping'};
  const loaded=await this.loadInstaller(),context=summaryRotationContext(this.policy,loaded.config);
  if(this.stopping)return {action:'stopping'};
  let pending=await this.journal.readPending(context);
  if(this.stopping)return {action:'stopping',...(pending?{commandId:pending.command.key}:{})};
  if(pending)return this.dispatch(pending);
  const checkCommand=await this.journal.checkCommand(context);
  if(this.stopping)return {action:'stopping'};
  const started=this.monotonic(),checked=await this.runInstaller(checkCommand),elapsedMs=this.monotonic()-started;
  if(this.stopping)return {action:'stopping'};
  if(checked?.ok!==true||checked.operation!=='check'||checked.capability!=='issuer'||checked.preflightVerified!==true)
   fail('SUMMARY_ROTATION_OBSERVATION_INVALID');
  const o=checked.observation;
  if(o?.clusterId!==context.clusterId||o.bindingSha256!==context.bindingSha256||o.releaseSha256!==context.releaseSha256)
   fail('SUMMARY_ROTATION_TARGET_CHANGED');
  const decision=summaryRotationDecision(this.policy,o,{elapsedMs});
  if(decision.action!=='rotate'){this.ready=!this.stopping&&decision.action==='idle';return decision}
  pending=await this.journal.prepare(context,summaryRotationCommand(this.policy,context,loaded.config,decision));
  if(!pending){this.ready=false;return {action:'peer-completed'}}
  if(this.stopping)return {action:'stopping',commandId:pending.command.key};
  return this.dispatch(pending);
 }
 async tick(){
  if(this.running)return {action:'busy'};
  this.running=(async()=>{
   let result;
   try{result=await this.cycle()}catch(error){this.ready=false;result={action:'review',code:/^SUMMARY_ROTATION_[A-Z_]{1,64}$/.test(error?.code??'')?error.code:safeInstallerCode(error)}}
   this.failures=result.action==='review'?Math.min(6,this.failures+1):0;
   this.lastCycleAt=new Date(this.now()).toISOString();this.lastResult=result;this.emit(result);return result;
  })();try{return await this.running}finally{this.running=null}
 }
 start(){
  if(this.started||this.stopping)return;this.started=true;
  const cycle=async()=>{await this.tick();if(!this.stopping){
   const base=this.failures?Math.min(30000,Math.max(1000,this.policy.intervalMs)*2**(this.failures-1)):this.policy.intervalMs;
   const delay=this.failures?Math.min(30000,Math.ceil(base*(1+Math.max(0,Math.min(1,this.random()))*0.2))):base;
   this.timer=setTimeout(cycle,delay);
  }};void cycle();
 }
 async shutdown(){
  this.stopping=true;this.ready=false;clearTimeout(this.timer);await this.running;this.ready=false;
 }
}
