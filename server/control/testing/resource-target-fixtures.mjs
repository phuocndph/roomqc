// Synthetic isolated configuration; never a deployment/capacity recommendation.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {vendorResourceCatalog} from '../resource-vendor-catalog.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex');
export async function resourceTargetFixture(root,{password='owned-private-password',attestor='resource_attestor',
 endpoints=[{port:5432,systemIdentifier:'123456789',databaseOid:'100',databaseName:'fixture_0'},
  {port:5432,systemIdentifier:'123456789',databaseOid:'101',databaseName:'fixture_1'}],
 roles={api:'api_role',auth:'auth_role',rest:'rest_role',alert:'alert_role'}}={}){
 const put=async(name,value)=>{const p=join(root,name);await writeFile(p,typeof value==='string'?value:JSON.stringify(value),{mode:0o600});return p};
 const budget=JSON.parse(await readFile(new URL('../../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));budget.environment='local';
 for(const d of budget.databases){for(const c of d.consumers)c.replicas=['control-api','alert-worker','auth','rest'].includes(c.id)?1:0;
  d.consumers.push({id:'resource-attestor',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0})}
 const budgetFile=await put('budget.json',budget),image='roomqc/native@sha256:'+'a'.repeat(64);
 const mount=(source,target)=>({type:'bind',source,target,read_only:true,bind:{create_host_path:false}});
 const uri=(role,i)=>`postgresql://${encodeURIComponent(role)}:${encodeURIComponent(password)}@127.0.0.1:${endpoints[i].port}/${endpoints[i].databaseName}?sslmode=disable`;
 const env={ROOMQC_RESOURCE_ENVIRONMENT:'local',ROOMQC_RESOURCE_BUDGET_FILE:'/etc/roomqc/budget.json'};
 const api={image,working_dir:'/app',command:['node','server.mjs'],environment:{...env,ROOMQC_CONTROL_DATABASE_URL:uri(roles.api,0)},volumes:[mount(budgetFile,env.ROOMQC_RESOURCE_BUDGET_FILE)]};
 const alertFile=await put('alert.json',{schemaVersion:1,instanceId:'fixture-alerts',poolMax:1,concurrency:1,intervalMs:1000,requestTimeoutMs:1000,leaseMs:12000,
  shutdownTimeoutMs:3000,approvedAddresses:[],connectionBudget:{maxConnections:100,otherAllocatedConnections:6,instances:1,reservedConnections:5}});
 const alertDsnFile=await put('alert.dsn',uri(roles.alert,0));
 const alert={image,working_dir:'/app',command:['node','workers/alert-runtime.mjs'],environment:{...env,ROOMQC_ALERT_CONFIG_FILE:'/etc/roomqc/alerts.json',
  ROOMQC_ALERT_DATABASE_URL_FILE:'/run/secrets/alert-dsn'},volumes:[mount(budgetFile,env.ROOMQC_RESOURCE_BUDGET_FILE),mount(alertFile,'/etc/roomqc/alerts.json')],secrets:['alert-dsn']};
 const vendorImage=id=>vendorResourceCatalog.entries.find(e=>e.id===id).image;
 const auth={image:vendorImage('auth'),environment:{GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:uri(roles.auth,1),GOTRUE_DB_CONN_PERCENTAGE:'0',
  GOTRUE_DB_MAX_POOL_SIZE:'5',GOTRUE_DB_MAX_IDLE_POOL_SIZE:'0'}};
 const rest={image:vendorImage('rest'),command:['postgrest'],environment:{PGRST_DB_URI:uri(roles.rest,1),PGRST_DB_POOL:'10',PGRST_DB_CONFIG:'false',PGRST_DB_CHANNEL_ENABLED:'false'}};
 const service=(name,adapter,databaseId,image)=>({name,adapter,databaseId,image});
 const project=(id,services)=>({id,files:[join(root,id+'.compose.json')],envFiles:[],profiles:[],services});
 const consumerManifest={schemaVersion:1,environment:'local',budgetFile,budgetSha256:'',vendorCatalogId:vendorResourceCatalog.id,
  nativeProjects:[project('native',[service('api','control-api',budget.databases[0].id,image),service('alert','alert-worker',budget.databases[0].id,image)])],
  vendorProjects:[project('vendor',[service('auth','auth',budget.databases[1].id,auth.image),service('rest','rest',budget.databases[1].id,rest.image)])]};
 const databaseManifest={schemaVersion:1,environment:'local',budgetFile,budgetSha256:'',databases:[]};
 for(const [i,d]of budget.databases.entries()){
  const {port,...identity}=endpoints[i],dsnFile=await put('attestor-'+i+'.dsn',uri(attestor,i));
  databaseManifest.databases.push({databaseId:d.id,dsnFile,expected:{...identity,role:attestor}});
 }
 const bindings=[['native','api',0,'control-api',roles.api],['native','alert',0,'alert-worker',roles.alert],
  ['vendor','auth',1,'auth',roles.auth],['vendor','rest',1,'rest',roles.rest]].map(([project,service,i,consumerId,role])=>({project,service,databaseId:budget.databases[i].id,consumerId,role}));
 const manifest={schemaVersion:1,consumerManifest,databaseManifest,bindings};
 const resolved={native:{name:'native',services:{api,alert},secrets:{'alert-dsn':{file:alertDsnFile}}},vendor:{name:'vendor',services:{auth,rest}}};
 const resolveProject=async p=>structuredClone(resolved[p.id]);
 const rebind=async()=>{const text=JSON.stringify(budget);await put('budget.json',text);consumerManifest.budgetSha256=databaseManifest.budgetSha256=sha(text)};await rebind();
 const observation=config=>{
  const endpoint=endpoints.find(e=>e.databaseName===config.database);
  return {...endpoint,port:undefined,role:config.user,sessionRole:config.user,maxConnections:100,reservedConnections:3,inRecovery:false,
   postmasterStartedAt:'2026-10-30 01:00:00+00',readOnly:true,superuser:false,createDatabase:false,createRole:false,replication:false,bypassRls:false,
   canLogin:true,roleConnectionLimit:config.user===attestor?1:-1,memberships:0};
 };
 const readTarget=async config=>{const o=observation(config);delete o.port;return o};
 return {root,put,budget,budgetFile,manifest,consumerManifest,databaseManifest,resolved,api,alert,alertDsnFile,auth,rest,roles,attestor,endpoints,uri,resolveProject,rebind,readTarget};
}
