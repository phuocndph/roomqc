import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {isAbsolute} from 'node:path';
import {isIP} from 'node:net';
import {pathToFileURL} from 'node:url';
import {addressKind,normalizeAddress} from '../server/control/safe-http.mjs';

const run=promisify(execFile);
export const remoteScript=`set -eu
printf 'ROOMQC_SSH_VERIFIED\\n'
hostname
uname -srmo
. /etc/os-release
printf 'OS=%s\\n' "$PRETTY_NAME"
printf 'CPU=%s\\n' "$(nproc)"
free -b | awk 'NR==2{printf "MEM_TOTAL=%s MEM_AVAILABLE=%s\\n",$2,$7}'
df -P -B1 / | awk 'NR==2{printf "ROOT_TOTAL=%s ROOT_USED=%s ROOT_AVAILABLE=%s ROOT_USE=%s\\n",$2,$3,$4,$5}'
if command -v docker >/dev/null 2>&1; then
  docker --version | sed 's/^Docker version /DOCKER_VERSION=/'
  docker info --format 'DOCKER_SERVER={{.ServerVersion}}' 2>/dev/null || true
else
  echo DOCKER=missing
fi`;

const invalid=(code='VPS_PREFLIGHT_INVALID')=>Object.assign(new Error(code),{code});
const positive=value=>Number.isSafeInteger(value)&&value>0;

export function parsePreflightOutput(output){
  if(typeof output!=='string'||output.length>65536)throw invalid('VPS_PREFLIGHT_OUTPUT_INVALID');
  const lines=output.split(/\r?\n/).filter(Boolean);
  if(lines[0]!=='ROOMQC_SSH_VERIFIED'||lines.length<6)throw invalid('VPS_PREFLIGHT_OUTPUT_INVALID');
  const values={};
  for(const line of lines.slice(3)){
    if(line.startsWith('OS=')){values.OS=line.slice(3);continue}
    for(const match of line.matchAll(/([A-Z_]+)=([^\s]+)/g))values[match[1]]=match[2];
  }
  const cpu=Number(values.CPU),memoryTotal=Number(values.MEM_TOTAL),memoryAvailable=Number(values.MEM_AVAILABLE);
  const rootTotal=Number(values.ROOT_TOTAL),rootUsed=Number(values.ROOT_USED),rootAvailable=Number(values.ROOT_AVAILABLE);
  if(!positive(cpu)||![memoryTotal,rootTotal].every(positive)
    ||![memoryAvailable,rootUsed,rootAvailable].every(value=>Number.isSafeInteger(value)&&value>=0)
    ||memoryAvailable>memoryTotal||rootUsed>rootTotal||rootAvailable>rootTotal)throw invalid('VPS_PREFLIGHT_OUTPUT_INVALID');
  const freePercent=rootAvailable/rootTotal*100;
  const reasons=[];
  if(freePercent<15)reasons.push('DISK_HEADROOM_LOW');
  if(values.DOCKER_SERVER===undefined||values.DOCKER_SERVER==='')reasons.push('DOCKER_UNAVAILABLE');
  return {hostname:lines[1],kernel:lines[2],os:values.OS??null,cpuCount:cpu,
    memory:{totalBytes:memoryTotal,availableBytes:memoryAvailable},
    rootFilesystem:{totalBytes:rootTotal,usedBytes:rootUsed,availableBytes:rootAvailable,
      usePercent:Number(((rootUsed/rootTotal)*100).toFixed(2)),freePercent:Number(freePercent.toFixed(2))},
    docker:{installed:values.DOCKER_VERSION!==undefined,version:values.DOCKER_VERSION??null,serverVersion:values.DOCKER_SERVER??null},
    deploymentAllowed:reasons.length===0,reasons};
}

export function preflightArguments(args){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))throw invalid('VPS_PREFLIGHT_ARGUMENTS_INVALID');
  if(args.length===1&&args[0]==='--help')return {help:true};
  const values=new Map();
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(!['--host','--user','--identity-file'].includes(key)||values.has(key)||typeof args[i+1]!=='string'||!args[i+1])throw invalid('VPS_PREFLIGHT_ARGUMENTS_INVALID');
    values.set(key,args[++i]);
  }
  if(!values.has('--host')||!values.has('--user'))throw invalid('VPS_PREFLIGHT_ARGUMENTS_INVALID');
  const host=values.get('--host'),user=values.get('--user');
  if(isIP(host)!==4)throw invalid('VPS_PREFLIGHT_HOST_INVALID');
  if(addressKind(normalizeAddress(host))!=='public')throw invalid('VPS_PREFLIGHT_HOST_INVALID');
  if(!/^[a-z_][a-z0-9_-]{0,31}$/.test(user))throw invalid('VPS_PREFLIGHT_USER_INVALID');
  const identityFile=values.get('--identity-file');
  if(identityFile!==undefined&&!isAbsolute(identityFile))throw invalid('VPS_PREFLIGHT_IDENTITY_INVALID');
  return {host,user,identityFile};
}

/**
 * Run the read-only SSH probe and return facts with a local capture timestamp.
 * The caller decides whether those facts should be persisted in the control
 * inventory. This keeps the probe useful for both a one-off check and the
 * server-owned enrollment flow without ever accepting credentials from input.
 */
export async function collectVpsPreflight(parsed,{executor=run,now=new Date()}={}){
  const sshArgs=['-o','BatchMode=yes','-o','ConnectTimeout=10','-o','StrictHostKeyChecking=yes'];
  if(parsed.identityFile)sshArgs.push('-i',parsed.identityFile);
  sshArgs.push(`${parsed.user}@${parsed.host}`,remoteScript);
  const result=await executor('ssh',sshArgs,{encoding:'utf8',timeout:30000,maxBuffer:65536,windowsHide:true});
  const facts=parsePreflightOutput(result.stdout);
  const capturedAt=now instanceof Date?now.toISOString():new Date(now).toISOString();
  if(!Number.isFinite(Date.parse(capturedAt)))throw invalid('VPS_PREFLIGHT_TIME_INVALID');
  return {host:parsed.host,user:parsed.user,capturedAt,...facts};
}

export async function runVpsPreflight(args=process.argv.slice(2),output=console){
  try{
    const parsed=preflightArguments(args);
    if(parsed.help){output.log('Usage: node scripts/roomqc-vps-preflight.mjs --host PUBLIC_IP --user SSH_USER [--identity-file ABSOLUTE_KEY]');return 0}
    const facts=await collectVpsPreflight(parsed);
    output.log(JSON.stringify({ok:true,readOnly:true,...facts}));return facts.deploymentAllowed?0:2;
  }catch(error){output.error(JSON.stringify({ok:false,code:error?.code??'VPS_PREFLIGHT_FAILED'}));return 1}
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await runVpsPreflight();
