// Generate a private test-only Node preload. It observes REAL fs operations,
// then stops the actual CLI. No syscall result is fabricated or bypassed.
import assert from 'node:assert/strict';
import {isAbsolute,dirname} from 'node:path';

export function installerFilesystemBarrierPreload({outputFile,phase}){
 assert.ok(isAbsolute(outputFile)&&outputFile.startsWith('/tmp/roomqc-installer-'));
 assert.ok(['intent_synced','stage_synced','before_rename','after_rename','directory_synced'].includes(phase));
 return `import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {dirname,basename} from 'node:path';
const target=${JSON.stringify(outputFile)},directory=${JSON.stringify(dirname(outputFile))},phase=${JSON.stringify(phase)};
const observed={intentSync:0,directorySync:0,stageSync:0,rename:0};let stopped=false;
const stop=()=>{
 if(stopped)return;stopped=true;
 fs.writeSync(2,JSON.stringify({event:'installer_cli_file_barrier',phase,observed,uid:process.getuid(),gid:process.getgid(),actualBuiltinCalls:true})+'\\n');
 process.kill(process.pid,'SIGSTOP');
};
const originalOpen=fs.promises.open,originalRename=fs.promises.rename;
fs.promises.open=async function(...args){
 const handle=await originalOpen.apply(this,args),path=typeof args[0]==='string'?args[0]:null;
 const kind=path===directory?'directory':path&&dirname(path)===directory&&basename(path).startsWith('.'+basename(target)+'.')
  ?path.endsWith('.intent')?'intent':path.endsWith('.stage')?'stage':null:null;
 if(kind){const sync=handle.sync;
  handle.sync=async function(...values){const result=await sync.apply(this,values);observed[kind+'Sync']++;
   if(phase==='intent_synced'&&kind==='directory'&&observed.intentSync===1&&observed.directorySync===1)stop();
   if(phase==='stage_synced'&&kind==='stage'&&observed.intentSync===1&&observed.directorySync===1)stop();
   if(phase==='directory_synced'&&kind==='directory'&&observed.rename===1&&observed.directorySync===2)stop();
   return result;
  };
 }return handle;
};
fs.promises.rename=async function(...args){
 const ours=args[1]===target&&typeof args[0]==='string'&&dirname(args[0])===directory&&args[0].endsWith('.stage');
 if(ours&&phase==='before_rename')stop();
 const result=await originalRename.apply(this,args);
 if(ours){observed.rename++;if(phase==='after_rename')stop()}
 return result;
};
syncBuiltinESMExports();
`;
}
