// Immutable private CLI intent. No token/receipt is stored; the server owns the
// authoritative result. A partial file fails closed and is never overwritten.
import {randomUUID} from 'node:crypto';
import {open,lstat} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,isAbsolute,resolve} from 'node:path';
import {createSetupBackfillOutput,readSetupBackfillFile,assertSetupBackfillAccess} from './setup-backfill-files.mjs';
import {supportReconcileCommand} from './support.mjs';
import {uuidPattern} from './errors.mjs';
const invalid=()=>Object.assign(new Error('SUPPORT_CLIENT_INTENT_UNAVAILABLE: giữ nguyên file và mã lệnh để đối soát.'),{code:'SUPPORT_CLIENT_INTENT_UNAVAILABLE'});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===keys.sort().join(',');
export function supportClientActor(token){
 let id;try{id=JSON.parse(Buffer.from(token.split('.')[1],'base64url')).sub}catch{}
 if(typeof id!=='string'||!uuidPattern.test(id))throw invalid();
 return id.toLowerCase(); // Binding only; canonical live RPC still authorizes.
}
async function syncParent(path){
 await assertSetupBackfillAccess(path);
 const before=await lstat(path),intent=await open(path,(process.platform==='win32'?constants.O_RDWR:constants.O_RDONLY)|(constants.O_NOFOLLOW??0));
 try{
  const opened=await intent.stat();if(opened.dev!==before.dev||opened.ino!==before.ino||opened.nlink!==1)throw invalid();
  await intent.sync();const after=await lstat(path);
  if(after.dev!==opened.dev||after.ino!==opened.ino||after.nlink!==1)throw invalid();
 }finally{await intent.close()}
 await assertSetupBackfillAccess(dirname(path),{directory:true});
 // Windows is local verification only; Linux operational durability uses fsync.
 if(process.platform==='win32')return;
 const file=await open(dirname(path),constants.O_RDONLY|constants.O_DIRECTORY|(constants.O_NOFOLLOW??0));
 try{await file.sync()}finally{await file.close()}
}
export async function supportClientIntent(path,context,body=null){
 if(typeof path!=='string'||!isAbsolute(path)||resolve(path)!==path)throw invalid();
 if(body){
  const key=randomUUID(),command=supportReconcileCommand(body,key);
  const normalized={query:command.query,workspaceId:command.workspaceId,routingVersion:command.routingVersion,reason:command.reason};
  const value={version:1,controlOrigin:context.controlOrigin,publicOrigin:context.publicOrigin,actorId:context.actorId,key,body:normalized};
  let output;
  try{output=await createSetupBackfillOutput(path);await output.append(value)}
  catch(error){if(error.code!=='SETUP_BACKFILL_OUTPUT_EXISTS')throw invalid()}
  finally{await output?.close()}
 }
 let value;
 try{value=JSON.parse(await readSetupBackfillFile(path,8192))}catch{throw invalid()}
 if(!exact(value,['version','controlOrigin','publicOrigin','actorId','key','body'])||value.version!==1
   ||value.controlOrigin!==context.controlOrigin||value.publicOrigin!==context.publicOrigin||value.actorId!==context.actorId)throw invalid();
 let command;try{command=supportReconcileCommand(value.body,value.key)}catch{throw invalid()}
 if(body){const expected=supportReconcileCommand(body,value.key);
  if(expected.payloadHash!==command.payloadHash||expected.query!==command.query)throw invalid();
 }
 // Also sync when opening an existing complete file: another process may have
 // finished writing it but not synced the parent directory before crashing.
  try{await syncParent(path)}catch{throw invalid()}
  let stable;try{stable=JSON.parse(await readSetupBackfillFile(path,8192))}catch{throw invalid()}
  if(JSON.stringify(stable)!==JSON.stringify(value))throw invalid();
 return Object.freeze({...value,body:Object.freeze({...value.body})});
}
