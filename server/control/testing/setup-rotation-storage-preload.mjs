// Fixture observation only. The original journal, daemon and kernel calls run.
import assert from 'node:assert/strict';
export function rotationStorageObserverPreload({pendingMarker=null,pendingRelease=null}={}){
 assert.equal(pendingMarker===null,pendingRelease===null);
 return `import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {SetupRotationJournal} from '/repository/server/control/setup-rotation-journal.mjs';
import {SetupCredentialRotator} from '/repository/server/control/setup-credential-rotation.mjs';
const marker=${JSON.stringify(pendingMarker)},release=${JSON.stringify(pendingRelease)};
const emit=v=>fs.writeSync(2,JSON.stringify({event:'rotation_storage_observation',...v})+'\\n');
const kind=p=>typeof p!=='string'||!p.startsWith('/faults/journal/')?null:
 p.endsWith('/command.json')?'journal_command':p.endsWith('/context.json')?'journal_context':
 p.includes('/prepare-')?'journal_prepare':p.endsWith('/pending')||p.includes('/pending/')?'journal_pending':
 p.endsWith('/history/published')?'journal_archive':null;
const code=e=>['EIO','EACCES','ENOSPC','EROFS','ENOENT'].includes(e?.code)?e.code:'OTHER';
const open=fs.promises.open,rename=fs.promises.rename;
fs.promises.open=async function(...args){const type=kind(args[0]);let h;
 try{h=await open.apply(this,args)}catch(e){if(type)emit({type:'syscall',operation:'open',kind:type,code:code(e),actualKernelCall:true});throw e}
 if(type)for(const [method,operation]of [['writeFile','write'],['sync','fsync']]){const original=h[method];
  h[method]=async function(...values){try{return await original.apply(this,values)}catch(e){emit({type:'syscall',operation,kind:type,code:code(e),actualKernelCall:true});throw e}};
 }return h;
};
fs.promises.rename=async function(...args){const type=kind(args[0]);
 try{return await rename.apply(this,args)}catch(e){if(type)emit({type:'syscall',operation:'rename',kind:type,code:code(e),actualKernelCall:true});throw e}
};syncBuiltinESMExports();
const originalEmit=SetupCredentialRotator.prototype.emit;
SetupCredentialRotator.prototype.emit=function(value){emit({type:'rotator_state',action:value.action,ready:this.ready});return originalEmit.call(this,value)};
if(marker){const read=SetupRotationJournal.prototype.readPending;let held=false;
 SetupRotationJournal.prototype.readPending=async function(...args){const pending=await read.apply(this,args);
  if(pending&&!held){held=true;await fs.promises.writeFile(marker,JSON.stringify({pid:process.pid,uid:process.getuid(),gid:process.getgid(),readPendingCompleted:true}),{flag:'wx',mode:0o600});
   while(true){try{await fs.promises.access(release);break}catch{await delay(20)}}
  }return pending;
 };
}
`;
}
