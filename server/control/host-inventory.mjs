import {lstat,readFile} from 'node:fs/promises';
import {isAbsolute,join,parse,relative,resolve,sep} from 'node:path';
import {registryConfiguration,hostPreflightReady} from './registry.mjs';
import {ControlError} from './errors.mjs';
import {addressKind,normalizeAddress} from './safe-http.mjs';

const invalid=(code='HOST_INVENTORY_INVALID')=>new ControlError(400,code,'Inventory máy chủ chưa hợp lệ.');
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const id=/^[a-z][a-z0-9-]{1,63}$/;
const clusterId=/^[a-z][a-z0-9-]{1,39}$/;
const bounded=value=>typeof value==='string'?value.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,200)||null:null;

export function hostInventoryArguments(args){
  if(!Array.isArray(args)||args.some(value=>typeof value!=='string'))throw invalid('HOST_INVENTORY_ARGUMENTS_INVALID');
  if(args.length===1&&args[0]==='--help')return {help:true};
  if(args.length!==2||args[0]!=='--inventory-file'||!isAbsolute(args[1]))throw invalid('HOST_INVENTORY_ARGUMENTS_INVALID');
  return {inventoryFile:resolve(args[1])};
}

async function privateJsonFile(file,max=524288){
  try{
    if(!isAbsolute(file))throw invalid('HOST_INVENTORY_FILE_INVALID');
    const normalized=resolve(file),root=parse(normalized).root;
    let current=root;
    for(const part of relative(root,normalized).split(sep)){
      current=join(current,part);const info=await lstat(current);
      if(info.isSymbolicLink())throw invalid('HOST_INVENTORY_FILE_INVALID');
      if(current!==normalized&&(!info.isDirectory()||process.platform!=='win32'&&(![0,process.getuid()].includes(info.uid)
        ||((info.mode&0o022)!==0&&!(info.uid===0&&(info.mode&0o1000)!==0)))))throw invalid('HOST_INVENTORY_FILE_INVALID');
    }
    const info=await lstat(normalized);if(!info.isFile()||info.size>max)throw invalid('HOST_INVENTORY_FILE_INVALID');
    return JSON.parse((await readFile(normalized,'utf8')).replace(/^\uFEFF/,''));
  }catch(error){if(error instanceof ControlError)throw error;throw invalid('HOST_INVENTORY_FILE_INVALID')}
}

/** Read the private server-owned document without exposing its credential values. */
export async function readHostInventoryDocument(file){return privateJsonFile(file)}

function safeCredentialSummary(raw){
  const credentials=new Map((raw.credentials??[]).map(value=>[value.ref,value]));
  return credentials;
}

/** Validate private server-owned inventory and return a redacted operator view. */
export function validateHostInventory(raw,{allowLocal=false}={}){
  if(!exact(raw,['version','inventory','credentials'])||raw.version!==1||!Array.isArray(raw.inventory)||!Array.isArray(raw.credentials)
    ||raw.inventory.length<1||raw.inventory.length>100||raw.credentials.length>100)throw invalid();
  let config;
  try{config=registryConfiguration({ROOMQC_CONTROL_INVENTORY:JSON.stringify(raw.inventory),ROOMQC_CONTROL_CREDENTIALS:JSON.stringify(raw.credentials)},[],allowLocal)}
  catch{throw invalid()}
  const credentials=safeCredentialSummary(raw),hosts=new Map(),entries=[];
  for(const entry of config.inventory.values()){
    if(!clusterId.test(entry.id))continue;
    if(!id.test(entry.hostId))throw invalid();
    if((entry.approvedAddresses??[]).some(address=>{
      const kind=addressKind(normalizeAddress(address));
      const localLoopback=allowLocal&&entry.environment==='local'&&kind==='loopback';
      return kind==='forbidden'||(kind==='loopback'&&!localLoopback);
    }))throw invalid();
    const credential=credentials.get(entry.credentialRef);
    const host={id:entry.hostId,name:bounded(entry.hostName)||entry.hostId,region:bounded(entry.region),providerLabel:bounded(entry.providerLabel),
      environment:entry.environment,status:'prepared',clusterIds:hosts.get(entry.hostId)?.clusterIds??[],credentialConfigured:!!credential};
    if(!host.clusterIds.includes(entry.id))host.clusterIds.push(entry.id);
    hosts.set(entry.hostId,host);
    entries.push({id:entry.id,hostId:entry.hostId,hostName:host.name,region:host.region,providerLabel:host.providerLabel,
      environment:entry.environment,backendKind:entry.backendKind,credentialRef:entry.credentialRef,credentialConfigured:!!credential,
      preflightReady:entry.environment==='local'||hostPreflightReady(entry.preflight),
      frontendReady:entry.frontendReady===true,telemetryConfigured:entry.telemetryTarget!==undefined});
  }
  if(entries.length===0)throw invalid('HOST_INVENTORY_NO_CANDIDATES');
  return {version:1,hostCount:hosts.size,candidateCount:entries.length,hosts:[...hosts.values()].sort((a,b)=>a.id.localeCompare(b.id)),
    candidates:entries.sort((a,b)=>a.id.localeCompare(b.id)),secretsExposed:false};
}

export async function readHostInventory(file,options){return validateHostInventory(await privateJsonFile(file),options)}
