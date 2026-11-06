import {constants} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {isAbsolute,parse,join,resolve} from 'node:path';
import {isIP} from 'node:net';
import {addressKind} from './safe-http.mjs';
import {resourceMode,loadRuntimeResourceContext,assertBookingResources} from './resource-runtime.mjs';

export const bookingNotificationProblem=code=>Object.assign(new Error(code),{code});
const invalid=()=>bookingNotificationProblem('BOOKING_NOTIFICATION_CONFIG_INVALID');
const exact=(raw,keys)=>raw&&typeof raw==='object'&&!Array.isArray(raw)&&Object.keys(raw).length===keys.length&&keys.every(k=>Object.hasOwn(raw,k));
export function notificationSecretMode(info,{uid,gid,sensitive=true}){
  if((info.mode&0o022)!==0||![0,uid].includes(info.uid))throw invalid();
  if(sensitive){
    const readable=(info.uid===uid&&(info.mode&0o400)!==0)||(info.gid===gid&&(info.mode&0o040)!==0);
    if(!readable||(info.mode&0o007)!==0||((info.mode&0o040)!==0&&info.gid!==gid))throw invalid();
  }
}
export async function bookingNotificationFile(file,max,{sensitive=true,allowLocal=false}={}){
  let handle,bytes;
  try{
    if(typeof file!=='string'||!isAbsolute(file)||!Number.isInteger(max)||max<1||max>32768)throw invalid();
    if(process.platform==='win32'&&!allowLocal)throw invalid(); // Production file permissions are verified on Linux.
    file=resolve(file);
    let cursor=parse(file).root;
    for(const part of file.slice(cursor.length).split(/[\\/]/).filter(Boolean)){
      cursor=join(cursor,part);const entry=await lstat(cursor);
      if(entry.isSymbolicLink())throw invalid();
      if(cursor!==file&&!entry.isDirectory())throw invalid();
      if(process.platform!=='win32'&&cursor!==file&&((entry.mode&0o022)!==0)&&!(entry.uid===0&&(entry.mode&0o1000)!==0))throw invalid();
    }
    const entry=await lstat(file);if(!entry.isFile()||entry.size<1||entry.size>max||entry.nlink!==1)throw invalid();
    handle=await open(file,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const info=await handle.stat();
    if(!info.isFile()||info.dev!==entry.dev||info.ino!==entry.ino||info.size<1||info.size>max||info.nlink!==1)throw invalid();
    if(process.platform!=='win32')notificationSecretMode(info,{uid:process.getuid(),gid:process.getgid(),sensitive});
    bytes=Buffer.alloc(max+1);let length=0;
    while(length<bytes.length){const {bytesRead}=await handle.read(bytes,length,bytes.length-length,null);if(!bytesRead)break;length+=bytesRead}
    if(length>max)throw invalid();return new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,length));
  }catch{throw invalid()}finally{bytes?.fill(0);await handle?.close()}
}
function localMode(env){return ['test','development'].includes(env.NODE_ENV)&&env.ROOMQC_BOOKING_ALLOW_LOCAL==='true'}
async function jsonFile(file,options){try{return JSON.parse((await bookingNotificationFile(file,16384,{...options,sensitive:false})).replace(/^\uFEFF/,''))}catch{throw invalid()}}
export function notificationConnection(databaseUrl,{allowLocal=false,ca}={}){
  try{
    const db=new URL(databaseUrl),sslMode=db.searchParams.get('sslmode'),host=db.hostname.replace(/^\[|\]$/g,'');
    if(!['postgres:','postgresql:'].includes(db.protocol)||!db.username||!db.password||db.hash||db.pathname==='/'
      ||db.searchParams.getAll('sslmode').length>1||[...db.searchParams.keys()].some(k=>k!=='sslmode'))throw invalid();
    const localHost=['db','postgres','localhost','host.docker.internal'].includes(host)||(isIP(host)&&['private','loopback'].includes(addressKind(host)));
    if(sslMode!=='verify-full'&&!(allowLocal&&localHost&&[null,'disable'].includes(sslMode)))throw invalid();
    const database=decodeURIComponent(db.pathname.slice(1)),user=decodeURIComponent(db.username),password=decodeURIComponent(db.password);
    const port=db.port?Number(db.port):5432;
    if(database.length<1||database.length>63||database.includes('/')||!Number.isInteger(port)||port<1||port>65535
      ||!user||user.length>63||!password||password.length>2048)throw invalid();
    return {host,port,database,user,password,...(sslMode==='verify-full'?{ssl:{rejectUnauthorized:true,...(ca?{ca}:{})}}:{ssl:false})};
  }catch{throw invalid()}
}
async function connectionFrom(raw,options){
  const url=(await bookingNotificationFile(raw.databaseUrlFile,8192,options)).trim();
  const ca=raw.databaseCaFile?await bookingNotificationFile(raw.databaseCaFile,16384,{...options,sensitive:false}):undefined;
  return notificationConnection(url,{...options,ca});
}
export async function loadBookingOperatorConfiguration(file,env=process.env){
  const options={allowLocal:localMode(env)},raw=await jsonFile(file,options);
  if(!exact(raw,['version','databaseUrlFile',...(Object.hasOwn(raw,'databaseCaFile')?['databaseCaFile']:[])])||raw.version!==1)throw invalid();
  return {connection:await connectionFrom(raw,options)};
}
export async function loadBookingWorkerConfiguration(file,env=process.env){
  const {production}=resourceMode(env),resourceContext=loadRuntimeResourceContext(env,{kind:'business'});
  const options={allowLocal:!production&&localMode(env)},raw=await jsonFile(file,options);
  if(!raw||!Array.isArray(raw.channels)||raw.channels.length<1||raw.channels.length>2||new Set(raw.channels).size!==raw.channels.length
    ||raw.channels.some(c=>!['push','telegram'].includes(c)))throw invalid();
  const keys=['version','instanceId','databaseUrlFile','channels','connectionBudget',...raw.channels,
    ...(Object.hasOwn(raw,'databaseCaFile')?['databaseCaFile']:[]),...(options.allowLocal&&Object.hasOwn(raw,'developmentOrigins')?['developmentOrigins']:[])];
  if(!exact(raw,keys)||raw.version!==1||typeof raw.instanceId!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(raw.instanceId))throw invalid();
  const budget=raw.connectionBudget;
  if(!exact(budget,['maxConnections','reservedConnections','otherConnections','workerInstances','workerPoolMax'])
    ||Object.values(budget).some(v=>!Number.isInteger(v)||v<0||v>10000)||budget.maxConnections<5||budget.reservedConnections<1
    ||budget.workerInstances<1||budget.workerInstances>100||budget.workerPoolMax!==2
    ||budget.otherConnections+budget.reservedConnections+2*budget.workerInstances>budget.maxConnections)throw invalid();
  const providers={};
  for(const channel of raw.channels){
    if(channel==='push'){
      if(!exact(raw.push,['publicKeyFile','privateKeyFile','subject']))throw invalid();
      providers.push={publicKey:(await bookingNotificationFile(raw.push.publicKeyFile,1024,{...options,sensitive:false})).trim(),
        privateKey:(await bookingNotificationFile(raw.push.privateKeyFile,1024,options)).trim(),subject:raw.push.subject};
    }else{
      const localApi=options.allowLocal&&Object.hasOwn(raw.telegram,'apiOrigin');
      if(!exact(raw.telegram,['botTokenFile','appOrigin',...(localApi?['apiOrigin']:[])]))throw invalid();
      if(localApi&&(!/^http:\/\/(?:127\.0\.0\.1|\[::1\]):\d+$/.test(raw.telegram.apiOrigin)
        ||!Array.isArray(raw.developmentOrigins)||!raw.developmentOrigins.includes(raw.telegram.apiOrigin)))throw invalid();
      providers.telegram={botToken:(await bookingNotificationFile(raw.telegram.botTokenFile,1024,options)).trim(),appOrigin:raw.telegram.appOrigin,
        ...(localApi?{apiOrigin:raw.telegram.apiOrigin}:{})};
    }
  }
  const config={instanceId:raw.instanceId,connection:await connectionFrom(raw,options),providers,allowLocal:options.allowLocal,production,resourceContext,
    developmentOrigins:raw.developmentOrigins??[],connectionBudget:{...budget},limit:20,intervalMs:5000,timeoutMs:5000};
  assertBookingResources(config);return config;
}
export async function loadBookingOperatorCommand(file,env=process.env){
  const raw=await jsonFile(file,{allowLocal:localMode(env)});
  if(!raw||raw.version!==1)throw bookingNotificationProblem('BOOKING_OPERATOR_COMMAND_INVALID');
  const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
  const reason=v=>typeof v==='string'&&v===v.trim()&&v.length>=5&&v.length<=1000;
  const bad=()=>{throw bookingNotificationProblem('BOOKING_OPERATOR_COMMAND_INVALID')};
  if(raw.operation==='channels'){if(!exact(raw,['version','operation']))bad()}
  else if(raw.operation==='list'){
    if(!exact(raw,['version','operation','state','eventId','after','limit'])
      ||(raw.state!==null&&!['pending','leased','accepted','rejected','obsolete','unknown','blocked','resolved'].includes(raw.state))
      ||(raw.eventId!==null&&!uuid(raw.eventId))||(raw.after!==null&&!uuid(raw.after))||!Number.isInteger(raw.limit)||raw.limit<1||raw.limit>50)bad();
  }else if(raw.operation==='receipt'){if(!exact(raw,['version','operation','commandId'])||!uuid(raw.commandId))bad()}
  else if(raw.operation==='configure'){
    if(!exact(raw,['version','operation','commandId','channel','configurationId','enabled','reason'])||!uuid(raw.commandId)||!reason(raw.reason)
      ||!['push','telegram'].includes(raw.channel)||typeof raw.configurationId!=='string'||!/^[a-f0-9]{64}$/.test(raw.configurationId)||typeof raw.enabled!=='boolean')bad();
  }else if(raw.operation==='resolve'){
    if(!exact(raw,['version','operation','commandId','targetId','resolution','reason','acceptDuplicateRisk'])||!uuid(raw.commandId)||!uuid(raw.targetId)
      ||!reason(raw.reason)||!['retry','suppress'].includes(raw.resolution)||typeof raw.acceptDuplicateRisk!=='boolean')bad();
  }else bad();
  return raw;
}
