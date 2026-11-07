import {lstat,open} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,isAbsolute,parse,relative,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {boundedHealthFile} from './workers/health-config.mjs';

const exec=promisify(execFile);
const invalid=()=>Object.assign(new Error('SETUP_BACKFILL_FILE_ACCESS'),{code:'SETUP_BACKFILL_FILE_ACCESS'});
// Paths are passed through an environment variable, never interpolated as code.
const aclScript="$ErrorActionPreference='Stop'; $p=$env:ROOMQC_BACKFILL_ACL_PATH; "
  +"$a=if([System.IO.Directory]::Exists($p)){[System.IO.Directory]::GetAccessControl($p)}else{[System.IO.File]::GetAccessControl($p)}; "
  +"$u=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; "
  +"$entries=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier]) | ForEach-Object { "
  +"@{sid=$_.IdentityReference.Value; allow=($_.AccessControlType -eq 'Allow'); rights=[int]$_.FileSystemRights} }); "
  +"@{user=$u; owner=$a.GetOwner([System.Security.Principal.SecurityIdentifier]).Value; rules=$entries} | ConvertTo-Json -Depth 4 -Compress";

/** Private operator files. POSIX and Windows ACL checks fail closed. */
export async function assertSetupBackfillAccess(path,{directory=false}={}){
  try{
    if(typeof path!=='string'||!isAbsolute(path))throw invalid();
    const absolute=resolve(path),root=parse(absolute).root;let current=root;
    for(const segment of relative(root,absolute).split(/[\\/]/)){
      current=resolve(current,segment);if((await lstat(current)).isSymbolicLink())throw invalid();
    }
    const info=await lstat(absolute);
    if(directory?!info.isDirectory():!info.isFile())throw invalid();
    if(!directory&&info.nlink!==1)throw invalid();
    if(process.platform==='win32'){
      const {stdout}=await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',aclScript],{
        env:{...process.env,ROOMQC_BACKFILL_ACL_PATH:absolute},windowsHide:true,timeout:8000,maxBuffer:65536});
      const acl=JSON.parse(stdout),allowed=new Set([acl.user,'S-1-5-18','S-1-5-32-544']);
      if(typeof acl.user!=='string'||!allowed.has(acl.owner)||!Array.isArray(acl.rules)||!acl.rules.length
        ||acl.rules.some(r=>r.allow&&!allowed.has(r.sid))
        ||!acl.rules.some(r=>r.allow&&[acl.user,'S-1-5-32-544'].includes(r.sid)&&(r.rights&1)!==0))throw invalid();
    }else if(info.uid!==process.getuid()&&info.uid!==0||(info.mode&0o077)!==0)throw invalid();
  }catch{throw invalid()}
}
export async function readSetupBackfillFile(path,max){
  await assertSetupBackfillAccess(dirname(path),{directory:true});
  await assertSetupBackfillAccess(path);
  return boundedHealthFile(path,max,{sensitive:true});
}
/** Exclusive, append-only, fsynced JSONL. A truncated last line is not a receipt. */
export async function createSetupBackfillOutput(path){
  let file;
  try{
    await assertSetupBackfillAccess(dirname(path),{directory:true});
    file=await open(path,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|(constants.O_NOFOLLOW??0),0o600);
    await assertSetupBackfillAccess(path);
    return {async append(value){await file.writeFile(JSON.stringify(value)+'\n');await file.sync()},async close(){await file.close()}};
  }catch(error){await file?.close();if(error?.code==='EEXIST')throw Object.assign(new Error('SETUP_BACKFILL_OUTPUT_EXISTS'),{code:'SETUP_BACKFILL_OUTPUT_EXISTS'});throw invalid()}
}
