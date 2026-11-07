// One management project; tenant stacks retain their independent release path.
// All credentials are file references. This is not an admission decision.
import {posix} from 'node:path';
import {resourceBudget} from './resource-budget.mjs';
const fail=()=>{throw Object.assign(new Error('MANAGEMENT_BUNDLE_INVALID'),{code:'MANAGEMENT_BUNDLE_INVALID'})};
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const digest=v=>typeof v==='string'&&/^[a-z0-9][a-z0-9/_.:-]*@sha256:[a-f0-9]{64}$/.test(v);
const owned=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{1,62}$/.test(v);
const file=v=>typeof v==='string'&&v.startsWith('/')&&posix.normalize(v)===v&&!/[\x00-\x20$`\\"']/.test(v)&&v!=='/';
const mount=(source,target)=>({type:'bind',source,target,read_only:true,bind:{create_host_path:false}});
const secret=(path)=>({file:path});
export const managementDirectoryImage='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const health=(port,path='/readyz')=>({test:['CMD','node','-e',`fetch('http://127.0.0.1:${port}${path}',{signal:AbortSignal.timeout(2000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))`],interval:'10s',timeout:'3s',retries:6,start_period:'20s'});
function limit(v){
 if(!exact(v,['memoryBytes','cpus'])||!Number.isSafeInteger(v.memoryBytes)||v.memoryBytes<64*1024*1024||v.memoryBytes>16*1024**3
  ||!Number.isFinite(v.cpus)||v.cpus<0.1||v.cpus>32)fail();
 return {mem_limit:v.memoryBytes,memswap_limit:v.memoryBytes,cpus:v.cpus};
}
export function renderManagementBundle(raw,budgetInput){
 if(!exact(raw,['version','deploymentId','environment','images','resources','networks','volumes','files','workers','listenPort',...(raw?.apiRelease?['apiRelease']:[])])||raw.version!==1
  ||!/^[a-z][a-z0-9-]{1,23}$/.test(raw.deploymentId??'')||!['local','staging','production'].includes(raw.environment)
  ||!exact(raw.images,['directory','control','frontend'])||!Object.values(raw.images).every(digest)||raw.images.directory!==managementDirectoryImage
  ||!exact(raw.resources,['directory','control','frontend'])||!exact(raw.networks,['directory','egress','web','metrics'])
  ||!Object.values(raw.networks).every(owned)||new Set(Object.values(raw.networks)).size!==4
  ||!exact(raw.volumes,['data','private','ca'])||!Object.values(raw.volumes).every(owned)||new Set(Object.values(raw.volumes)).size!==3
  ||!exact(raw.files,['budget','apiEnvironment','apiDsn','postgresConfig','hbaConfig','webConfig'])||!Object.values(raw.files).every(file)
  ||!Number.isSafeInteger(raw.listenPort)||!(raw.environment==='local'&&raw.listenPort===0||raw.listenPort>=1024&&raw.listenPort<=65535)
  ||!raw.workers||typeof raw.workers!=='object'||Array.isArray(raw.workers)||Object.keys(raw.workers).some(k=>!['health','setup','alert'].includes(k)))fail();
 const budget=resourceBudget(budgetInput),db=budget.databases.find(d=>d.kind==='directory');
 if(budget.environment!==raw.environment)fail();
 const consumer=id=>db.consumers.find(c=>c.id===id);
 if(consumer('control-api').replicas!==1)fail();
 const directory=raw.resources.directory;
 if(!exact(directory,['memoryBytes','cpus','sharedBuffersBytes','shmBytes'])||!Number.isSafeInteger(directory.sharedBuffersBytes)
  ||directory.sharedBuffersBytes<16*1024*1024||directory.sharedBuffersBytes>directory.memoryBytes/2
  ||!Number.isSafeInteger(directory.shmBytes)||directory.shmBytes<directory.sharedBuffersBytes||directory.shmBytes>directory.memoryBytes)fail();
 const {sharedBuffersBytes,shmBytes,...directoryLimit}=directory;
 const project='roomqc-management-'+raw.deploymentId;
 const labels={'roomqc.management':raw.deploymentId};
 const common={user:'1000:1000',working_dir:'/app',read_only:true,cap_drop:['ALL'],security_opt:['no-new-privileges:true'],
  init:true,restart:'unless-stopped',stop_grace_period:'30s',pids_limit:128,labels,
  tmpfs:['/tmp:rw,nosuid,noexec,size=8m'],logging:{driver:'json-file',options:{'max-size':'10m','max-file':'3'}}};
 const shared={NODE_ENV:raw.environment==='local'?'development':'production',ROOMQC_RESOURCE_ENVIRONMENT:raw.environment,
  ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/resource-budget.json',NODE_EXTRA_CA_CERTS:'/run/roomqc-directory-ca/ca.crt'};
 const ca={type:'volume',source:'directory-ca',target:'/run/roomqc-directory-ca',read_only:true};
 const metadata=[mount(raw.files.budget,'/etc/roomqc/resource-budget.json'),ca];
 const services={
  'roomqc-directory':{...common,user:'70:70',working_dir:'/',image:raw.images.directory,pull_policy:'never',...limit(directoryLimit),shm_size:shmBytes,
   environment:{POSTGRES_DB:'roomqc_control',POSTGRES_USER:'postgres',POSTGRES_PASSWORD_FILE:'/run/roomqc-directory-private/admin-password',
    POSTGRES_INITDB_ARGS:'--auth-host=scram-sha-256 --auth-local=peer',PGDATA:'/var/lib/postgresql/data/pgdata'},
   command:['postgres','-c','config_file=/etc/roomqc-directory/postgresql.conf','-c','hba_file=/etc/roomqc-directory/pg_hba.conf',
    '-c','max_connections='+db.maxConnections,'-c','shared_buffers='+sharedBuffersBytes+'B'],
   volumes:[{type:'volume',source:'directory-data',target:'/var/lib/postgresql/data'},
    {type:'volume',source:'directory-private',target:'/run/roomqc-directory-private',read_only:true},
    mount(raw.files.postgresConfig,'/etc/roomqc-directory/postgresql.conf'),mount(raw.files.hbaConfig,'/etc/roomqc-directory/pg_hba.conf')],
   tmpfs:['/tmp:rw,nosuid,noexec,size=16m,uid=70,gid=70,mode=1770','/var/run/postgresql:rw,nosuid,noexec,size=8m,uid=70,gid=70,mode=0770'],
   networks:{directory:{aliases:['roomqc-directory']}},stop_grace_period:'60s',
   healthcheck:{test:['CMD','pg_isready','-U','postgres','-d','roomqc_control'],interval:'5s',timeout:'3s',retries:12}},
  'roomqc-control':{...common,image:raw.images.control,pull_policy:'never',...limit(raw.resources.control),command:['node','server.mjs'],
   env_file:[{path:raw.files.apiEnvironment,required:true,format:'raw'}],
   environment:{...shared,ROOMQC_CONTROL_HOST:'0.0.0.0',ROOMQC_CONTROL_PORT:'8091',ROOMQC_CONTROL_DATABASE_URL:'',
    ROOMQC_CONTROL_DATABASE_URL_FILE:'/run/secrets/control-dsn',ROOMQC_CONTROL_MIGRATION_DATABASE_URL:'',
    ROOMQC_CONTROL_API_INSTANCES:'1',ROOMQC_CONTROL_POOL_MAX:String(consumer('control-api').poolMax),ROOMQC_CONTROL_POOL_BUDGET:String(db.maxConnections),
    ROOMQC_CONTROL_SIGNUP_ENABLED:'false',ROOMQC_CONTROL_SETUP_DISPATCH_ENABLED:'false'},
   secrets:['control-dsn'],volumes:metadata,networks:['directory','egress','web'],
   depends_on:{'roomqc-directory':{condition:'service_healthy'}},healthcheck:health(8091,'/api/control/readyz')},
  'roomqc-web':{...common,user:'101:101',working_dir:'/',image:raw.images.frontend,pull_policy:'never',...limit(raw.resources.frontend),
   command:['nginx','-g','daemon off;'],volumes:[mount(raw.files.webConfig,'/etc/nginx/conf.d/default.conf')],networks:['web'],
   tmpfs:['/var/cache/nginx:rw,nosuid,noexec,size=16m,uid=101,gid=101','/var/run:rw,nosuid,noexec,size=1m,uid=101,gid=101'],
   ports:[{target:8080,published:String(raw.listenPort),host_ip:'127.0.0.1',protocol:'tcp'}],
   depends_on:{'roomqc-control':{condition:'service_healthy'}},
   healthcheck:{test:['CMD','wget','--spider','--quiet','http://127.0.0.1:8080/healthz'],interval:'10s',timeout:'3s',retries:6,start_period:'10s'}}
 };
 if(raw.apiRelease){
  const release=raw.apiRelease;
  if(!exact(release,['catalogFile','trustFile','maximumValidityMs'])||!file(release.catalogFile)||!file(release.trustFile)
   ||release.catalogFile===release.trustFile||!Number.isSafeInteger(release.maximumValidityMs)||release.maximumValidityMs<1000||release.maximumValidityMs>86400000)fail();
  services['roomqc-control'].volumes.push(mount(release.catalogFile,'/etc/roomqc/release-catalog.json'),mount(release.trustFile,'/etc/roomqc/release-trust.json'));
  Object.assign(services['roomqc-control'].environment,{ROOMQC_CONTROL_RELEASE_VALIDATION_FILE:'/etc/roomqc/release-catalog.json',
   ROOMQC_CONTROL_RELEASE_TRUST_FILE:'/etc/roomqc/release-trust.json',ROOMQC_CONTROL_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(release.maximumValidityMs)});
 }
 const secrets={'control-dsn':secret(raw.files.apiDsn)};
 const included=['control-api'];
 const definitions={health:{id:'health-worker',name:'health-worker',port:8093,config:'ROOMQC_HEALTH_CONFIG_FILE',dsn:'ROOMQC_HEALTH_DATABASE_URL_FILE',secret:'metrics-dsn',command:'health-runtime.mjs',keys:['configFile','dsnFile','resources']},
  setup:{id:'provisioning-worker',name:'setup-worker',port:8095,config:'ROOMQC_SETUP_CONFIG_FILE',dsn:'ROOMQC_SETUP_DATABASE_URL_FILE',secret:'setup-dsn',command:'setup-runtime.mjs',keys:['configFile','dsnFile','trustFile','credentialsDirectory','resources']},
  alert:{id:'alert-worker',name:'alert-worker',port:8094,config:'ROOMQC_ALERT_CONFIG_FILE',dsn:'ROOMQC_ALERT_DATABASE_URL_FILE',secret:'alert-dsn',command:'alert-runtime.mjs',keys:['configFile','dsnFile','endpointFile','tokenFile','resources']}};
 for(const [kind,def]of Object.entries(definitions)){
  const entry=raw.workers[kind],allocation=consumer(def.id);
  if(!entry){if(allocation.replicas!==0)fail();continue}
  if(!exact(entry,[...def.keys,...(kind==='health'&&entry.managed?['managed']:[])])
   ||!Object.entries(entry).filter(([k])=>!['resources','managed'].includes(k)).every(([,v])=>file(v))||allocation.replicas!==1)fail();
  const configTarget='/etc/roomqc/'+kind+'.json';
  const service={...common,image:raw.images.control,pull_policy:'never',...limit(entry.resources),command:['node','workers/'+def.command],
   environment:{...shared,[def.config]:configTarget,[def.dsn]:'/run/secrets/'+def.secret},
   volumes:[...metadata,mount(entry.configFile,configTarget)],secrets:[def.secret],networks:['directory',kind==='health'?'metrics':'egress'],
   depends_on:{'roomqc-directory':{condition:'service_healthy'}},healthcheck:health(def.port)};
  secrets[def.secret]=secret(entry.dsnFile);
  if(kind==='health'){
   const catalog=consumer('probe-catalog');
   if(entry.managed){
    const managed=entry.managed;
    if(!exact(managed,['configFile','dsnFile','keyringFile','trustFile','maximumValidityMs'])
     ||!['configFile','dsnFile','keyringFile','trustFile'].every(k=>file(managed[k]))||catalog.replicas!==1
     ||!Number.isSafeInteger(managed.maximumValidityMs)||managed.maximumValidityMs<1000||managed.maximumValidityMs>86400000)fail();
    Object.assign(service.environment,{ROOMQC_HEALTH_PROBE_CONFIG_FILE:'/etc/roomqc/health-probes.json',
     ROOMQC_HEALTH_PROBE_DATABASE_URL_FILE:'/run/secrets/probe-dsn',ROOMQC_HEALTH_PROBE_KEYRING_FILE:'/run/secrets/probe-keyring',
     ROOMQC_HEALTH_RELEASE_TRUST_FILE:'/etc/roomqc/release-trust.json',ROOMQC_HEALTH_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(managed.maximumValidityMs)});
    service.volumes.push(mount(managed.configFile,'/etc/roomqc/health-probes.json'),mount(managed.trustFile,'/etc/roomqc/release-trust.json'));
    service.secrets.push('probe-dsn','probe-keyring');secrets['probe-dsn']=secret(managed.dsnFile);secrets['probe-keyring']=secret(managed.keyringFile);
    service.networks.push('egress');included.push('probe-catalog');
   }else if(catalog.replicas!==0)fail();
  }
  if(kind==='setup'){
   service.environment.ROOMQC_SETUP_RELEASE_TRUST_FILE='/etc/roomqc/setup-trust.json';
   service.volumes.push(mount(entry.trustFile,'/etc/roomqc/setup-trust.json'),mount(entry.credentialsDirectory,'/run/roomqc/setup'));
  }
  if(kind==='alert')for(const key of ['endpoint','token']){
   const name='alert-'+key;service.environment['ROOMQC_ALERT_'+key.toUpperCase()+'_FILE']='/run/secrets/'+name;
   service.secrets.push(name);secrets[name]=secret(entry[key+'File']);
  }
  services[def.name]=service;included.push(def.id);
 }
 if(!raw.workers.health&&consumer('probe-catalog').replicas!==0)fail();
 // DSN substitution must not quietly combine capabilities in one runtime.
 const dsnFiles=Object.entries(secrets).filter(([name])=>name.endsWith('-dsn')).map(([,s])=>s.file);
 if(new Set(dsnFiles).size!==dsnFiles.length)fail();
 return {compose:{name:project,services,secrets,
  networks:Object.fromEntries(Object.entries(raw.networks).map(([key,name])=>[key,{external:true,name}])),
  volumes:{'directory-data':{external:true,name:raw.volumes.data},'directory-private':{external:true,name:raw.volumes.private},'directory-ca':{external:true,name:raw.volumes.ca}}},
  report:{version:1,deploymentId:raw.deploymentId,project,services:Object.keys(services),environment:raw.environment,
   directoryConsumers:included,externalConsumers:db.consumers.filter(c=>c.replicas>0&&!included.includes(c.id)).map(c=>c.id),
   totalMemoryLimitBytes:Object.values(services).reduce((n,s)=>n+s.mem_limit,0),signupOpened:false,deploymentReady:false}};
}
