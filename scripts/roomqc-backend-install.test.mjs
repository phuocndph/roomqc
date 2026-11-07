import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {validateBackendInstall,backendInstallCapacity,backendRemoteProgram} from './roomqc-backend-install.mjs';
import {deploymentEnvironment} from '../server/control/deployment-environment.mjs';
import {deploymentCompose} from '../server/control/vps-deploy.mjs';
import {backendServices,backendPostMigrationRest} from './roomqc-backend-bundle.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function seal(b){
 delete b.specSha256;
 for(const f of b.files)f.sha256=sha(f.content);
 const c=deploymentCompose(b.compose,{...b,image:b.images.db.reference});b.compose=c.model;b.composeSha256=c.sha256;
 b.specSha256=sha(JSON.stringify(b));return b;
}
function fixture(){
 const clusterId='test-fresh',env=deploymentEnvironment({GOTRUE_DISABLE_SIGNUP:'true',PGRST_DB_SCHEMAS:'public,graphql_public'},clusterId);
 const b={version:2,kind:'roomqc-fresh-backend-install',clusterId,releaseId:'backend-test',publicUrl:'https://roomqc.invalid',listenPort:18000,
  root:'/opt/RoomQC/clusters/'+clusterId,project:'roomqc-'+clusterId,controlImage:'roomqc/control@sha256:'+'e'.repeat(64),
  images:Object.fromEntries(backendServices.map((s,i)=>[s,{imageId:'sha256:'+String(i+1).repeat(64),reference:'roomqc/backend-'+s+'@sha256:'+String(i+1).repeat(64)}])),
  compose:{services:{},networks:{default:{}},volumes:{}},postMigrationRest:backendPostMigrationRest(),files:[{path:env.path.slice(('/opt/RoomQC/clusters/'+clusterId+'/').length),content:env.source,mode:0o600},
   {path:'config/operator/backend.json',content:'{}\n',mode:0o600}],migration:{count:591,sha256:'a'.repeat(64)},
  memoryRequiredBytes:2*1024**3,cpusRequired:2,requiredRuntimeDiskBytes:768*1024**2,signupOpened:false,productionReady:false};
 for(const s of backendServices)b.compose.services[s]={image:b.images[s].reference,env_file:[env.envFile],healthcheck:{test:['CMD','health']}};
 Object.assign(b.compose.services.functions,{read_only:true,volumes:[],command:['start','--user-worker-request-idle-timeout','150000','--main-service','/home/deno/functions/main.eszip']});
 b.compose.services['api-gw'].ports=[{host_ip:'127.0.0.1',published:'18000',target:8000,protocol:'tcp'}];
 return seal(b);
}
const facts=()=>({deploymentAllowed:true,reasons:[],memory:{availableBytes:4*1024**3},cpuCount:4,rootFilesystem:{availableBytes:20*1024**3,totalBytes:100*1024**3}});
test('closed fresh bundle accepts loopback-only ingress',()=>assert.equal(validateBackendInstall(fixture()).signupOpened,false));
test('changing content without its immutable digest fails',()=>{const b=fixture();b.files[0].content+='X=tampered\n';assert.throws(()=>validateBackendInstall(b));});
test('an edited spec cannot open host ingress',()=>{const b=fixture();b.compose.services['api-gw'].ports[0].host_ip='0.0.0.0';assert.throws(()=>validateBackendInstall(seal(b)));});
test('a rehashed service cannot substitute another image',()=>{const b=fixture();b.compose.services.auth.image=b.images.db.reference;assert.throws(()=>validateBackendInstall(seal(b)));});
test('private environment files cannot become world-readable',()=>{const b=fixture();b.files[0].mode=0o644;assert.throws(()=>validateBackendInstall(seal(b)));});
test('path traversal is rejected even with a rehashed spec',()=>{const b=fixture();b.files.push({path:'config/assets/../../outside',content:'x',mode:0o444});assert.throws(()=>validateBackendInstall(seal(b)));});
test('packaged functions cannot gain a source mount',()=>{const b=fixture();b.compose.services.functions.volumes=[{type:'volume',source:'arbitrary',target:'/home/deno/functions'}];assert.throws(()=>validateBackendInstall(seal(b)));});
test('post-migration exposure cannot omit capability schemas or expose private/admin schemas',()=>{
 for(const schemas of ['public,graphql_public','public,graphql_public,roomqc_setup,roomqc_summary,private']){
  const b=fixture();b.postMigrationRest.compose.services.rest.environment.PGRST_DB_SCHEMAS=schemas;
  b.postMigrationRest.sha256=sha(JSON.stringify(b.postMigrationRest.compose));assert.throws(()=>validateBackendInstall(seal(b)));
 }
 const b=fixture();b.postMigrationRest.compose.services.auth={environment:{GOTRUE_DISABLE_SIGNUP:'false'}};
 b.postMigrationRest.sha256=sha(JSON.stringify(b.postMigrationRest.compose));assert.throws(()=>validateBackendInstall(seal(b)));
});
test('startup cannot expose capability schemas before migration or override its private env file',()=>{
 const b=fixture();b.compose.services.rest.environment={PGRST_DB_SCHEMAS:'public,private'};assert.throws(()=>validateBackendInstall(seal(b)));
});
test('legacy installation specifications require an explicit v2 rebuild and cannot silently claim exposure verified',()=>{
 const b=fixture();b.version=1;delete b.postMigrationRest;assert.throws(()=>validateBackendInstall(seal(b)));
});
test('capacity keeps 15 percent after runtime growth',()=>{const f=facts();f.rootFilesystem.availableBytes=15*1024**3;assert(backendInstallCapacity(fixture(),f).reasons.includes('BACKEND_DISK_HEADROOM_LOW'));});
test('resume counts the owned existing database allocation once and preserves the same reserve',()=>{const b=fixture(),f=facts();f.rootFilesystem.availableBytes=15*1024**3+128*1024**2;assert.equal(backendInstallCapacity(b,f).allowed,false);const r=backendInstallCapacity(b,f,{mode:'resume',allocatedRuntimeDiskBytes:b.requiredRuntimeDiskBytes});assert.equal(r.allowed,true);assert.equal(r.remainingRuntimeDiskBytes,0);f.rootFilesystem.availableBytes=14*1024**3;assert.equal(backendInstallCapacity(b,f,{mode:'resume',allocatedRuntimeDiskBytes:b.requiredRuntimeDiskBytes}).allowed,false);});
test('missing memory and CPU facts fail closed',()=>{const f=facts();delete f.memory;delete f.cpuCount;const r=backendInstallCapacity(fixture(),f);assert.equal(r.allowed,false);assert(r.reasons.includes('BACKEND_MEMORY_HEADROOM_LOW'));assert(r.reasons.includes('BACKEND_CPU_BUDGET_LOW'));});
test('missing disk measurements cannot pass the reserve calculation',()=>{const f=facts();delete f.rootFilesystem.totalBytes;assert(backendInstallCapacity(fixture(),f).reasons.includes('BACKEND_DISK_HEADROOM_LOW'));});
test('remote installation program compiles as Python',()=>{execFileSync('python',['-c','import ast,sys; ast.parse(sys.stdin.read())'],{input:backendRemoteProgram,windowsHide:true});});
