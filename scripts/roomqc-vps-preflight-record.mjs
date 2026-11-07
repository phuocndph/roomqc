import {lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import {dirname,isAbsolute,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {collectVpsPreflight,preflightArguments} from './roomqc-vps-preflight.mjs';
import {validateHostInventory} from '../server/control/host-inventory.mjs';
import {normalizeAddress} from '../server/control/safe-http.mjs';

const id=/^[a-z][a-z0-9-]{1,39}$/;
const invalid=(code='VPS_PREFLIGHT_RECORD_INVALID')=>Object.assign(new Error(code),{code});

function exact(value,keys){return value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).every(key=>keys.includes(key));}

/** Parse arguments without ever accepting a secret or inline command. */
export function recordArguments(args){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))throw invalid('VPS_PREFLIGHT_RECORD_ARGUMENTS_INVALID');
  if(args.length===1&&args[0]==='--help')return {help:true};
  const values=new Map();let write=false;
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--write'){if(write)throw invalid('VPS_PREFLIGHT_RECORD_ARGUMENTS_INVALID');write=true;continue}
    if(!['--host','--user','--identity-file','--inventory-file','--cluster-id'].includes(key)
      ||values.has(key)||typeof args[i+1]!=='string'||!args[i+1])throw invalid('VPS_PREFLIGHT_RECORD_ARGUMENTS_INVALID');
    values.set(key,args[++i]);
  }
  const preflight=preflightArguments([...['--host',values.get('--host'),'--user',values.get('--user')],
    ...(values.has('--identity-file')?['--identity-file',values.get('--identity-file')]:[])]);
  const inventoryFile=values.get('--inventory-file');
  if(!inventoryFile||!isAbsolute(inventoryFile))throw invalid('VPS_PREFLIGHT_RECORD_INVENTORY_INVALID');
  const clusterId=values.get('--cluster-id');
  if(!clusterId||!id.test(clusterId))throw invalid('VPS_PREFLIGHT_RECORD_CLUSTER_INVALID');
  return { ...preflight,inventoryFile:resolve(inventoryFile),clusterId,write };
}

function preflightRecord(facts){
  if(!facts||typeof facts!=='object'||typeof facts.capturedAt!=='string'||typeof facts.deploymentAllowed!=='boolean'
    ||!Number.isFinite(facts.rootFilesystem?.freePercent)||typeof facts.docker?.serverVersion!=='string')
    throw invalid('VPS_PREFLIGHT_RECORD_FACTS_INVALID');
  return {capturedAt:new Date(facts.capturedAt).toISOString(),deploymentAllowed:facts.deploymentAllowed,
    diskFreePercent:Number(facts.rootFilesystem.freePercent),dockerServerVersion:facts.docker.serverVersion};
}

/** Merge only server-observed preflight fields into one existing inventory entry. */
export function mergePreflightInventory(raw,facts,{clusterId,host}={}){
  if(!exact(raw,['version','inventory','credentials'])||raw.version!==1||!Array.isArray(raw.inventory)||!Array.isArray(raw.credentials))
    throw invalid('VPS_PREFLIGHT_RECORD_INVENTORY_INVALID');
  if(!id.test(clusterId||''))throw invalid('VPS_PREFLIGHT_RECORD_CLUSTER_INVALID');
  const index=raw.inventory.findIndex(item=>item&&item.id===clusterId);
  if(index<0)throw invalid('VPS_PREFLIGHT_RECORD_ENTRY_NOT_FOUND');
  const entry=raw.inventory[index];
  if(entry.hostId&&entry.approvedAddresses?.length){
    const target=normalizeAddress(host);
    const approved=entry.approvedAddresses.map(normalizeAddress);
    if(!approved.includes(target))throw invalid('VPS_PREFLIGHT_RECORD_HOST_MISMATCH');
  }
  const updated=structuredClone(raw);
  updated.inventory[index]={...entry,preflight:preflightRecord(facts)};
  return updated;
}

async function readJson(file){
  const info=await lstat(file).catch(()=>null);
  if(!info||!info.isFile()||info.isSymbolicLink())throw invalid('VPS_PREFLIGHT_RECORD_INVENTORY_INVALID');
  try{return JSON.parse(await readFile(file,'utf8'))}catch{throw invalid('VPS_PREFLIGHT_RECORD_INVENTORY_INVALID')}
}

async function writeJsonAtomic(file,value){
  const temp=`${file}.roomqc-preflight-${process.pid}.tmp`;
  try{
    await writeFile(temp,JSON.stringify(value,null,2)+'\n',{encoding:'utf8',mode:0o600});
    await rename(temp,file);
  }catch(error){await unlink(temp).catch(()=>{});throw error}
}

export async function recordVpsPreflight(args=process.argv.slice(2),output=console,{collector=collectVpsPreflight}={}){
  try{
    const parsed=recordArguments(args);
    if(parsed.help){output.log('Usage: node scripts/roomqc-vps-preflight-record.mjs --host PUBLIC_IP --user SSH_USER --inventory-file ABSOLUTE_PRIVATE_JSON --cluster-id CLUSTER_ID [--identity-file ABSOLUTE_KEY] [--write]');return 0}
    const raw=await readJson(parsed.inventoryFile);
    const facts=await collector(parsed);
    const updated=mergePreflightInventory(raw,facts,{clusterId:parsed.clusterId,host:parsed.host});
    validateHostInventory(updated,{allowLocal:process.env.NODE_ENV!=='production'&&process.env.ROOMQC_HOST_INVENTORY_ALLOW_LOCAL==='true'});
    if(parsed.write)await writeJsonAtomic(parsed.inventoryFile,updated);
    const record=updated.inventory.find(item=>item.id===parsed.clusterId).preflight;
    output.log(JSON.stringify({ok:true,written:parsed.write,host:parsed.host,clusterId:parsed.clusterId,preflight:record}));return 0;
  }catch(error){output.error(JSON.stringify({ok:false,code:error?.code??'VPS_PREFLIGHT_RECORD_FAILED'}));return 1}
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url)process.exitCode=await recordVpsPreflight();
