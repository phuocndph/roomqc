// Private durable command spool. Complete command directories become visible
// by rename before dispatch; UUID paths are never reused for a later cycle.
import {open,mkdir,readdir,lstat,rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import {join,parse,relative,resolve,isAbsolute} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {summaryCredentialCanonical} from './tenant-summary-signing.mjs';
import {assertSetupBackfillAccess,readSetupBackfillFile} from './setup-backfill-files.mjs';
import {summaryCredentialInstallerCommand} from './tenant-summary-installer.mjs';
import {exact} from './probe-secrets.mjs';
import {uuidPattern} from './errors.mjs';
const fail=()=>{throw Object.assign(new Error('SUMMARY_ROTATION_JOURNAL_INVALID'),{code:'SUMMARY_ROTATION_JOURNAL_INVALID'})};
const sha=v=>createHash('sha256').update(v).digest('hex');
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const missing=async path=>{try{return await lstat(path)}catch(e){if(e.code==='ENOENT')return null;throw e}};
async function directory(path){
 await assertSetupBackfillAccess(path,{directory:true});
 if(process.platform!=='win32'){
  let cursor=parse(path).root;
  for(const part of relative(cursor,path).split('/')){
   cursor=resolve(cursor,part);const info=await lstat(cursor);
   if(info.isSymbolicLink()||![0,process.getuid()].includes(info.uid)
    ||(info.mode&0o022)!==0&&!(info.uid===0&&(info.mode&0o1000)!==0))fail();
  }
 }
 return lstat(path);
}
async function syncDirectory(path){
 const before=await directory(path);
 if(process.platform==='win32')return; // Local component only; runtime requires Linux.
 const f=await open(path,constants.O_RDONLY|constants.O_DIRECTORY|(constants.O_NOFOLLOW??0));
 try{if(!same(before,await f.stat()))fail();await f.sync();if(!same(before,await directory(path)))fail()}finally{await f.close()}
}
async function privateJson(path,value){
 const f=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
 try{await f.writeFile(summaryCredentialCanonical(value)+'\n');await f.sync()}finally{await f.close()}
}
const json=async path=>{try{return JSON.parse(await readSetupBackfillFile(path,32768))}catch{fail()}};
function receipt(value,command){
 if(exact(value,['version','outcome','commandId','credentialId','expiresAt'])&&value.version===1&&value.outcome==='published'
  &&value.commandId===command.key&&uuidPattern.test(value.credentialId??'')&&Number.isSafeInteger(value.expiresAt))return value;
 if(exact(value,['version','outcome','commandId','code'])&&value.version===1&&value.outcome==='superseded'
  &&value.commandId===command.key&&['SUMMARY_INSTALLER_VERSION_CONFLICT','SUMMARY_INSTALLER_PREDECESSOR_CONFLICT'].includes(value.code))return value;
 fail();
}
export class SummaryRotationJournal{
 constructor({directory:parent,instanceId,allowWindowsLocal=false,onPhase=async()=>{}}){
  if(typeof parent!=='string'||!isAbsolute(parent)||resolve(parent)!==parent
   ||typeof instanceId!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(instanceId)
   ||process.platform==='win32'&&!allowWindowsLocal||typeof onPhase!=='function')fail();
  this.parent=parent;this.root=join(parent,instanceId);this.pendingRoot=join(this.root,'pending');this.historyRoot=join(this.root,'history');this.onPhase=onPhase;
 }
 async initialize(){
  await directory(this.parent);
  for(const path of [this.root,this.pendingRoot,this.historyRoot,join(this.historyRoot,'published'),join(this.historyRoot,'superseded')]){
   try{await mkdir(path,{mode:0o700})}catch(e){if(e.code!=='EEXIST')throw e}
   await directory(path);
  }
  await syncDirectory(this.pendingRoot);await syncDirectory(this.historyRoot);await syncDirectory(this.root);await syncDirectory(this.parent);
 }
 async readCommand(path,context){
  const before=await directory(path),entries=(await readdir(path)).sort();
  if(summaryCredentialCanonical(entries)!==summaryCredentialCanonical(['command.json','context.json']))fail();
  const manifest=await json(join(path,'context.json')),command=await json(join(path,'command.json'));
  if(!exact(manifest,['version','context','commandSha256'])||manifest.version!==1
   ||summaryCredentialCanonical(manifest.context)!==summaryCredentialCanonical(context)
   ||manifest.commandSha256!==sha(summaryCredentialCanonical(command)))fail();
  const binding={clusterId:context.clusterId,bindingHash:context.bindingSha256,releaseFingerprint:context.releaseSha256};
  summaryCredentialInstallerCommand(command,binding,'issuer');if(command.operation!=='issue')fail();
  if(!same(before,await directory(path)))fail();
  return {directory:path,commandFile:join(path,'command.json'),command,context};
 }
 async readPending(context){
  await this.initialize();const names=await readdir(this.pendingRoot);if(names.length>64||names.some(n=>!uuidPattern.test(n)))fail();
  const pending=[];
  for(const name of names){
   let p;try{p=await this.readCommand(join(this.pendingRoot,name),context)}catch(e){
    if(!await missing(join(this.pendingRoot,name))){await this.archivedCommand(name,context);continue}throw e;
   }
   if(p.command.key!==name)fail();
   pending.push(p);
  }
  pending.sort((a,b)=>a.command.expectedVersion-b.command.expectedVersion||a.command.key.localeCompare(b.command.key));
  return pending[0]??null;
 }
 async prepare(context,command){
  const existing=await this.readPending(context);if(existing)return existing;
  if((await readdir(this.root)).filter(n=>/^prepare-/.test(n)).length>=16)fail();
  const stage=join(this.root,'prepare-'+randomUUID());await mkdir(stage,{mode:0o700});
  await privateJson(join(stage,'command.json'),command);
  await privateJson(join(stage,'context.json'),{version:1,context,commandSha256:sha(summaryCredentialCanonical(command))});
  await syncDirectory(stage);await this.onPhase('command_synced');
  const target=join(this.pendingRoot,command.key);
  try{await rename(stage,target)}catch(e){if(!['EEXIST','ENOTEMPTY'].includes(e.code))throw e}
  await syncDirectory(this.pendingRoot);await syncDirectory(this.root);await this.onPhase('pending_synced');
  // A concurrent process may have prepared another key at the same version.
  // Both keys remain durable; the database CAS permits only one issuer.
  return this.readPending(context);
 }
 async checkCommand(){
  await this.initialize();const path=join(this.root,'check.json'),value={version:1,operation:'check'};
  try{await privateJson(path,value)}catch(e){if(e.code!=='EEXIST')throw e}
  if(summaryCredentialCanonical(await json(path))!==summaryCredentialCanonical(value))fail();
  await syncDirectory(this.root);return path;
 }
 async archivedCommand(key,context){
  const found=[];
  for(const outcome of ['published','superseded']){
   const path=join(this.historyRoot,outcome,key);if(await missing(path))found.push(await this.readCommand(path,context));
  }
  if(found.length!==1)fail();return found[0];
 }
 async archive(pending,result){
  if(pending.directory!==join(this.pendingRoot,pending.command.key))fail();
  result=receipt(result,pending.command);
  let current;
  try{current=await this.readCommand(pending.directory,pending.context)}catch(e){
   if(await missing(pending.directory))throw e;
   const archived=await this.readCommand(join(this.historyRoot,result.outcome,pending.command.key),pending.context);
   if(summaryCredentialCanonical(archived.command)!==summaryCredentialCanonical(pending.command))fail();return;
  }
  if(summaryCredentialCanonical(current.command)!==summaryCredentialCanonical(pending.command))fail();
  // The DB owns the immutable receipt. Archive the entire durable command in
  // one rename after a verified result; no partial local receipt can strand a
  // successful publication. Kill before rename replays exactly this command.
  const terminal=join(this.historyRoot,result.outcome);await this.onPhase('before_archive');
  try{await rename(pending.directory,join(terminal,pending.command.key))}catch(e){
   if(e.code!=='ENOENT')throw e;
   const archived=await this.readCommand(join(terminal,pending.command.key),pending.context);
   if(summaryCredentialCanonical(archived.command)!==summaryCredentialCanonical(pending.command))fail();
  }
  await syncDirectory(terminal);await syncDirectory(this.pendingRoot);await this.onPhase('archive_synced');
 }
}
