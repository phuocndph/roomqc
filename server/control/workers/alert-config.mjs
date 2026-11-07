import {ControlError} from '../errors.mjs';
import {boundedHealthFile,healthDatabaseUrl} from './health-config.mjs';
import {normalizeAddress} from '../safe-http.mjs';
import {resourceMode,loadRuntimeResourceContext,assertAlertResources} from '../resource-runtime.mjs';

const invalid=()=>new ControlError(400,'INVALID_ALERT_CONFIG','Cấu hình gửi cảnh báo chưa hợp lệ.');
export function alertConfiguration(raw,{databaseUrl,endpoint,token,production=true,allowLocal=false}={}){
  const keys=['schemaVersion','instanceId','poolMax','concurrency','intervalMs','requestTimeoutMs','leaseMs','shutdownTimeoutMs','approvedAddresses','connectionBudget'];
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).length!==keys.length||keys.some(key=>!Object.hasOwn(raw,key))
    ||raw.schemaVersion!==1||typeof raw.instanceId!=='string'||!/^[a-z][a-z0-9-]{1,63}$/.test(raw.instanceId))throw invalid();
  const ranges={poolMax:[1,4],concurrency:[1,4],intervalMs:[100,30000],requestTimeoutMs:[100,15000],leaseMs:[1000,300000],shutdownTimeoutMs:[1000,20000]};
  for(const [key,[min,max]] of Object.entries(ranges))if(!Number.isInteger(raw[key])||raw[key]<min||raw[key]>max)throw invalid();
  if(raw.concurrency>raw.poolMax||raw.leaseMs<raw.requestTimeoutMs*2+8000||raw.shutdownTimeoutMs<raw.requestTimeoutMs+1000)throw invalid();
  const budget=raw.connectionBudget;
  if(!budget||typeof budget!=='object'||Object.keys(budget).length!==4
    ||!['maxConnections','otherAllocatedConnections','instances','reservedConnections'].every(key=>Number.isSafeInteger(budget[key])&&budget[key]>=1&&budget[key]<=10000)
    ||budget.otherAllocatedConnections+budget.instances*raw.poolMax+budget.reservedConnections>budget.maxConnections)throw invalid();
  try{healthDatabaseUrl(databaseUrl,{production,allowLocal})}catch{throw invalid()}
  let url;try{url=new URL(endpoint)}catch{throw invalid()}
  const local=!production&&allowLocal===true;
  if(url.username||url.password||url.hash||url.search||url.href.length>2048
    ||(url.protocol!=='https:'&&!(local&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw invalid();
  if(typeof token!=='string'||token.length<16||token.length>4096||!/^[\x21-\x7e]+$/.test(token))throw invalid();
  if(!Array.isArray(raw.approvedAddresses)||raw.approvedAddresses.length>32)throw invalid();
  let addresses;try{addresses=raw.approvedAddresses.map(normalizeAddress)}catch{throw invalid()}
  if(new Set(addresses).size!==addresses.length)throw invalid();
  return {...raw,databaseUrl,endpoint:url.href,token,approvedAddresses:addresses,allowLocal:local,production};
}
export async function loadAlertConfiguration(env=process.env){
  try{
    const {production}=resourceMode(env),resourceContext=loadRuntimeResourceContext(env,{kind:'directory'});
    const raw=JSON.parse(await boundedHealthFile(env.ROOMQC_ALERT_CONFIG_FILE,16384));
    const databaseUrl=(await boundedHealthFile(env.ROOMQC_ALERT_DATABASE_URL_FILE,8192,{sensitive:true})).trim();
    const endpoint=(await boundedHealthFile(env.ROOMQC_ALERT_ENDPOINT_FILE,4096,{sensitive:true})).trim();
    const token=(await boundedHealthFile(env.ROOMQC_ALERT_TOKEN_FILE,8192,{sensitive:true})).trim();
    const config={...alertConfiguration(raw,{databaseUrl,endpoint,token,production,allowLocal:env.ROOMQC_ALERT_ALLOW_LOCAL==='true'}),resourceContext};
    assertAlertResources(config);return config;
  }catch(error){if(error instanceof ControlError&&['RESOURCE_BUDGET_REQUIRED','INVALID_RESOURCE_BUDGET','RESOURCE_CONNECTION_BUDGET','RESOURCE_RUNTIME_MISMATCH'].includes(error.code))throw error;throw invalid()}
}
