// Generate a private observer. Original Node/kernel calls always run.
import assert from 'node:assert/strict';
export function installerVolumeObserverPreload({stopBeforeRename=false}={}){
 assert.equal(typeof stopBeforeRename,'boolean');
 const lines=[
 "import fs from 'node:fs';",
 "import {syncBuiltinESMExports} from 'node:module';",
 "const target='/faults/credential.json',stopBeforeRename="+JSON.stringify(stopBeforeRename)+";",
 "const emit=v=>fs.writeSync(2,JSON.stringify({event:'installer_volume_syscall',actualKernelCall:true,...v})+'\\n');",
 "const type=p=>p==='/faults'?'directory':typeof p==='string'&&p.startsWith('/faults/.credential.json.')?p.endsWith('.intent')?'intent':p.endsWith('.stage')?'stage':null:p===target?'output':null;",
 "const code=e=>['EIO','ENOSPC','EACCES','EROFS'].includes(e?.code)?e.code:'OTHER';",
 "const originalOpen=fs.promises.open,originalRename=fs.promises.rename;",
 "fs.promises.open=async function(...args){",
 " const kind=type(args[0]);let handle;",
 " try{handle=await originalOpen.apply(this,args)}catch(e){if(kind)emit({operation:'open',kind,code:code(e)});throw e}",
 " if(kind)for(const [method,operation]of [['writeFile','write'],['sync','fsync']]){const original=handle[method];",
 "  handle[method]=async function(...values){try{return await original.apply(this,values)}catch(e){emit({operation,kind,code:code(e)});throw e}}",
 " }return handle;",
 "};",
 "fs.promises.rename=async function(...args){",
 " const ours=args[1]===target&&type(args[0])==='stage';",
 " if(ours&&stopBeforeRename){fs.writeSync(2,JSON.stringify({event:'installer_volume_barrier',phase:'before_rename',uid:process.getuid(),gid:process.getgid(),actualKernelCalls:true})+'\\n');process.kill(process.pid,'SIGSTOP')}",
 " try{const value=await originalRename.apply(this,args);if(ours)emit({operation:'rename',kind:'stage',code:null,completed:true});return value}",
 " catch(e){if(ours)emit({operation:'rename',kind:'stage',code:code(e)});throw e}",
 "};",
 "syncBuiltinESMExports();",
 ""
 ];
 return lines.join('\n');
}
