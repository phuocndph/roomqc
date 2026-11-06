import {isIP} from 'node:net';
import {posix} from 'node:path';
import {ControlError} from './errors.mjs';
import {validateTelemetryTarget} from './telemetry-source.mjs';
import {addressKind} from './safe-http.mjs';

const invalid=()=>new ControlError(400,'INVALID_MONITORING_CONFIG','Cấu hình giám sát chưa hợp lệ hoặc không đủ an toàn.');
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export function validateExporterSecretAccess({mode,uid,gid}){
  if(![mode,uid,gid].every(Number.isSafeInteger)||mode<0||uid<0||gid<0
    ||(mode&0o007)!==0||(mode&0o020)!==0||((mode&0o040)!==0&&gid!==65534)
    ||!((uid===65534&&(mode&0o400)!==0)||(gid===65534&&(mode&0o040)!==0)))throw invalid();
}
export function nodeMountInclude(input){
  const target=validateTelemetryTarget(input);return '^(?:'+target.dataMounts.map(m=>escapeRegex(m.mountpoint)).join('|')+')$';
}
export function prometheusConfiguration(input,{intervalSeconds=15}={}){
  const target=validateTelemetryTarget(input);
  if(!Number.isInteger(intervalSeconds)||intervalSeconds<(target.environment==='local'?5:15)||intervalSeconds>30)throw invalid();
  const labels={cluster_id:target.clusterId,host_id:target.hostId,environment:target.environment};
  const common={scrape_interval:intervalSeconds+'s',scrape_timeout:'4s',sample_limit:5000,body_size_limit:'2MB',honor_labels:false};
  return {global:{scrape_interval:intervalSeconds+'s',evaluation_interval:'30s',scrape_timeout:'4s'},scrape_configs:[
    {...common,job_name:'roomqc-node',static_configs:[{targets:['node-exporter:9100'],labels}],metric_relabel_configs:[
      {source_labels:['__name__'],action:'keep',regex:'node_cpu_seconds_total|node_memory_MemAvailable_bytes|node_memory_MemTotal_bytes|node_filesystem_(avail_bytes|size_bytes|files_free|files|readonly)|node_scrape_collector_success'}]},
    {...common,job_name:'roomqc-postgres',static_configs:[{targets:['postgres-exporter:9187'],labels}],metric_relabel_configs:[
      {source_labels:['__name__'],action:'keep',regex:'roomqc_connections_(used|monitor_permission)|pg_up|pg_exporter_last_scrape_error'}]}
  ]};
}
export function validateExporterSecrets({uri,user,password,environment}){
  if(!['local','staging','production'].includes(environment)||typeof uri!=='string'||typeof user!=='string'||typeof password!=='string'
    ||user.trim()!=='roomqc_monitor'||password.trim().length<32||password.trim().length>256||/[\x00-\x1f]/.test(password.trim()))throw invalid();
  let url;try{url=new URL('postgresql://'+uri.trim())}catch{throw invalid()}
  const host=url.hostname.replace(/^\[|\]$/g,'');
  if(url.username||url.password||url.hash||!/^\/[a-zA-Z_][a-zA-Z0-9_-]{0,62}$/.test(url.pathname)
    ||!host||(!isIP(host)&&!/^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$/.test(host))
    ||[...url.searchParams.keys()].some(key=>!['sslmode','sslrootcert','connect_timeout','application_name'].includes(key))
    ||[...new Set(url.searchParams.keys())].some(key=>url.searchParams.getAll(key).length!==1))throw invalid();
  if(isIP(host)&&addressKind(host)==='forbidden')throw invalid();
  const mode=url.searchParams.get('sslmode');
  if(!['verify-full',...(environment==='local'?['disable']:[])].includes(mode))throw invalid();
  if(mode==='verify-full'){
    const ca=url.searchParams.get('sslrootcert');
    if(!ca||!ca.startsWith('/etc/roomqc/tls/')||posix.normalize(ca)!==ca||!ca.endsWith('.pem'))throw invalid();
  }
  const timeout=url.searchParams.get('connect_timeout');if(!/^[1-3]$/.test(timeout??''))throw invalid();
  return {host,port:url.port||'5432',database:url.pathname.slice(1),sslmode:mode};
}
