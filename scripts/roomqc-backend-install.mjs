// Operator installation of a fresh backend over strict SSH. All secrets travel
// on stdin. Admission and the serving frontend are outside this command.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {backendOptions,backendServices,backendPostMigrationRest} from './roomqc-backend-bundle.mjs';
import {deploymentCompose,shellQuote} from '../server/control/vps-deploy.mjs';
import {collectVpsPreflight,preflightArguments} from './roomqc-vps-preflight.mjs';
import {runSsh} from './roomqc-vps-deploy.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');

export function validateBackendInstall(bundle){
 const {specSha256,...body}=bundle;assert.equal(sha(JSON.stringify(body)),specSha256,'BACKEND_INSTALL_SPEC_MISMATCH');
 assert.equal(bundle.kind,'roomqc-fresh-backend-install');assert.equal(bundle.version,2);backendOptions(bundle);
 assert.deepEqual(bundle.postMigrationRest,backendPostMigrationRest());
 assert.equal(bundle.root,'/opt/RoomQC/clusters/'+bundle.clusterId);assert.equal(bundle.project,'roomqc-'+bundle.clusterId);
 assert.equal(bundle.signupOpened,false);assert.equal(bundle.productionReady,false);
 assert.deepEqual(Object.keys(bundle.images).sort(),backendServices);assert.match(bundle.controlImage,/^roomqc\/control@sha256:[a-f0-9]{64}$/);
 const compose=deploymentCompose(bundle.compose,{...bundle,image:bundle.images.db.reference});
 assert.equal(compose.sha256,bundle.composeSha256);assert.deepEqual(Object.keys(compose.model.services).sort(),backendServices);
 for(const name of backendServices){assert.equal(compose.model.services[name].image,bundle.images[name].reference);assert.match(bundle.images[name].imageId,/^sha256:[a-f0-9]{64}$/);assert(bundle.images[name].reference.endsWith('@'+bundle.images[name].imageId));}
 assert.equal(compose.model.services.functions.read_only,true);assert.equal(compose.model.services.functions.volumes.length,0);
 assert.deepEqual(compose.model.services.functions.command,['start','--user-worker-request-idle-timeout','150000','--main-service','/home/deno/functions/main.eszip']);
 assert(Number.isSafeInteger(bundle.migration.count)&&bundle.migration.count>0);assert.match(bundle.migration.sha256,/^[a-f0-9]{64}$/);
 assert(Number.isSafeInteger(bundle.requiredRuntimeDiskBytes)&&bundle.requiredRuntimeDiskBytes>=512*1024**2);
 assert(Number.isFinite(bundle.memoryRequiredBytes)&&bundle.memoryRequiredBytes>=1024**3);assert(Number.isFinite(bundle.cpusRequired)&&bundle.cpusRequired>0);
 const paths=new Set();
 assert(Array.isArray(bundle.files)&&bundle.files.length<=64&&bundle.files.reduce((n,f)=>n+Buffer.byteLength(f.content),0)<2*1024**2);
 for(const f of bundle.files){
  assert.match(f.path,/^config\/(?:assets\/[a-zA-Z0-9_.\/-]+|env\/[a-f0-9]{64}\.env|operator\/backend\.json)$/);
  assert(!f.path.split('/').some(x=>['','..','.'].includes(x)));assert(!paths.has(f.path));paths.add(f.path);
  assert.equal(sha(f.content),f.sha256);assert.equal(f.mode,f.path.startsWith('config/assets/')?0o444:0o600);
  if(f.path.startsWith('config/env/'))assert.equal(f.path,'config/env/'+f.sha256+'.env');
 }
 for(const service of Object.values(compose.model.services)){
  for(const f of service.env_file)assert(paths.has(f.path.slice(bundle.root.length+1)));
  for(const m of service.volumes??[])if(m.type==='bind')assert(paths.has(m.source.slice(bundle.root.length+1)));
 }
 assert(paths.has('config/operator/backend.json'));
 const auth=bundle.files.find(f=>f.path===compose.model.services.auth.env_file[0].path.slice(bundle.root.length+1));
 assert(auth.content.split('\n').includes('GOTRUE_DISABLE_SIGNUP=true'));
 const rest=bundle.files.find(f=>f.path===compose.model.services.rest.env_file[0].path.slice(bundle.root.length+1));
 assert.deepEqual(rest.content.split('\n').filter(line=>line.startsWith('PGRST_DB_SCHEMAS=')),['PGRST_DB_SCHEMAS=public,graphql_public']);
 assert.equal(compose.model.services.rest.environment,undefined);
 const ports=Object.entries(compose.model.services).flatMap(([name,s])=>(s.ports??[]).map(p=>({name,...p})));
 assert.equal(ports.length,1);assert.equal(ports[0].name,'api-gw');assert.equal(ports[0].host_ip,'127.0.0.1');
 assert.equal(ports[0].target,8000);assert.equal(ports[0].published,String(bundle.listenPort));
 return bundle;
}
export function backendInstallCapacity(bundle,facts,{mode='initialize',allocatedRuntimeDiskBytes=0}={}){
 validateBackendInstall(bundle);const reasons=[...(facts.reasons??[])];
 assert(['initialize','resume','verify'].includes(mode));assert(Number.isSafeInteger(allocatedRuntimeDiskBytes)&&allocatedRuntimeDiskBytes>=0);
 const diskGrowth=mode==='verify'?0:Math.max(0,bundle.requiredRuntimeDiskBytes-allocatedRuntimeDiskBytes);
 if(!facts.deploymentAllowed)reasons.push('HOST_PREFLIGHT_BLOCKED');
 if(!Number.isSafeInteger(facts.memory?.availableBytes)||facts.memory.availableBytes<bundle.memoryRequiredBytes)reasons.push('BACKEND_MEMORY_HEADROOM_LOW');
 if(!Number.isSafeInteger(facts.cpuCount)||facts.cpuCount<bundle.cpusRequired)reasons.push('BACKEND_CPU_BUDGET_LOW');
 if(!Number.isSafeInteger(facts.rootFilesystem?.availableBytes)||!Number.isSafeInteger(facts.rootFilesystem?.totalBytes)||facts.rootFilesystem.totalBytes<=0||facts.rootFilesystem.availableBytes-diskGrowth<facts.rootFilesystem.totalBytes*0.15)reasons.push('BACKEND_DISK_HEADROOM_LOW');
 return {allowed:reasons.length===0,reasons:[...new Set(reasons)],remainingRuntimeDiskBytes:diskGrowth,allocatedRuntimeDiskBytes};
}

// Count only resources whose immutable installation marker and Compose
// ownership match. Resuming must not reserve an already-created DB twice.
const allocationProgram=String.raw`
import os,sys,json,stat,subprocess
b=json.load(sys.stdin);root=b['root'];project=b['project']
assert root=='/opt/RoomQC/clusters/'+b['clusterId'] and os.path.realpath(root)==root
marker=root+'/.roomqc-backend-owner';s=os.lstat(marker)
assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and open(marker).read()==b['specSha256']
total=int(subprocess.check_output(['du','-x','-s','-B1',root]).split()[0])
for name in b['volumes']:
 name=project+'_'+name;p=subprocess.run(['docker','volume','inspect',name],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if p.returncode:continue
 v=json.loads(p.stdout)[0];assert v['Labels']['com.docker.compose.project']==project
 path=v['Mountpoint'];assert os.path.realpath(path)==path and path.endswith('/volumes/'+name+'/_data')
 if os.stat(path).st_dev==os.stat(root).st_dev:total+=int(subprocess.check_output(['du','-x','-s','-B1',path]).split()[0])
print(json.dumps(dict(allocatedRuntimeDiskBytes=total,specSha256=b['specSha256'])))
`;
const pythonCommand=(program,name)=>'python3 -c '+shellQuote("import base64;exec(compile(base64.b64decode("+JSON.stringify(Buffer.from(program).toString('base64'))+"),"+JSON.stringify(name)+",'exec'))");

export const backendRemoteProgram=String.raw`
import os,sys,json,stat,hashlib,subprocess,fcntl,time,tempfile,urllib.request,urllib.error
b=json.load(sys.stdin);mode=sys.argv[1];expected=sys.argv[2]
assert b['specSha256']==expected and mode in ('initialize','resume','verify')
root=b['root'];project=b['project'];assert root=='/opt/RoomQC/clusters/'+b['clusterId']
assert os.path.realpath(root)==root and not os.path.islink(root)
rest_path=root+'/post-migration-rest.json'
rest_text=json.dumps(b['postMigrationRest']['compose'],separators=(',',':'))
assert hashlib.sha256(rest_text.encode()).hexdigest()==b['postMigrationRest']['sha256']
phase='preflight';log_number=0
def sha(x):return hashlib.sha256(x.encode()).hexdigest()
def call(args,input=None,allow=False):
 global log_number
 p=subprocess.run(args,input=input,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=240)
 if os.path.isdir(root+'/operator-logs'):
  log_number+=1
  path=root+'/operator-logs/%d-%s.log'%(log_number,mode)
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600)
  with os.fdopen(fd,'wb') as f:f.write(p.stdout+b'\n'+p.stderr)
 if not allow and p.returncode:raise RuntimeError('BACKEND_COMMAND_FAILED')
 return p
def verify_rest_overlay():
 s=os.lstat(rest_path)
 assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==0o600 and os.path.realpath(rest_path)==rest_path
 assert open(rest_path,'rb').read()==rest_text.encode(),'BACKEND_REST_OVERLAY_CHANGED'

def dc(*args):
 files=['-f',root+'/compose.json']
 if os.path.lexists(rest_path):
  verify_rest_overlay();files+=['-f',rest_path]
 return call(['docker','compose','-p',project,*files,*args])
def inspect(kind,name):return json.loads(call(['docker',kind,'inspect',name]).stdout)[0]
def owned_resources():
 for kind in ('container','network','volume'):
  args=['docker',kind,'ls','-q','--filter','label=com.docker.compose.project='+project]
  if kind=='container':args.insert(3,'--all')
  for value in call(args).stdout.decode().split():
   x=inspect(kind,value);labels=x['Config']['Labels'] if kind=='container' else x['Labels']
   assert labels.get('com.docker.compose.project')==project
   if kind=='container':
    assert labels.get('com.roomqc.cluster')==b['clusterId'] and labels.get('com.roomqc.release')==b['releaseId']
def verify_files():
 for f in b['files']:
  path=root+'/'+f['path'];s=os.lstat(path)
  assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==f['mode'] and os.path.realpath(path)==path
  assert hashlib.sha256(open(path,'rb').read()).hexdigest()==f['sha256']
def verify_runtime():
 rows=json.loads(call(['docker','inspect',*[(project+'-'+s+'-1') for s in sorted(b['compose']['services'])]]).stdout)
 for x in rows:
  service=x['Config']['Labels']['com.docker.compose.service']
  assert x['State']['Running'] and x['State'].get('Health',{}).get('Status')=='healthy'
  expected=inspect('image',b['images'][service]['reference'])
  assert x['Image']==expected['Id']
  if service=='auth':assert 'GOTRUE_DISABLE_SIGNUP=true' in x['Config']['Env']
  if service=='rest':
   schemas=b['postMigrationRest']['compose']['services']['rest']['environment']['PGRST_DB_SCHEMAS']
   assert [v for v in x['Config']['Env'] if v.startswith('PGRST_DB_SCHEMAS=')]==['PGRST_DB_SCHEMAS='+schemas],'BACKEND_REST_EXPOSURE_MISSING'
  if service=='api-gw':assert x['NetworkSettings']['Ports']['8000/tcp']==[{'HostIp':'127.0.0.1','HostPort':str(b['listenPort'])}]
 return len(rows)
def http(path,body=None):
 req=urllib.request.Request('http://127.0.0.1:'+str(b['listenPort'])+path,headers={'apikey':private['publishableKey'],'Content-Type':'application/json'},data=body)
 try:
  with urllib.request.urlopen(req,timeout=15) as r:return r.status,r.read()
 except urllib.error.HTTPError as e:return e.code,e.read()
try:
 for value in list(b['images'].values())+[{'reference':b['controlImage']}]:
  image=inspect('image',value['reference']);assert image['Os']=='linux' and image['Architecture']=='amd64'
 if mode=='initialize':
  assert not os.path.lexists(root),'BACKEND_ALREADY_EXISTS'
  assert not call(['docker','ps','-aq','--filter','label=com.docker.compose.project='+project]).stdout.strip()
  for kind,names in [('volume',[project+'_'+n for n in b['compose'].get('volumes',{})]),('network',[project+'_default'])]:
   for name in names:assert call(['docker',kind,'inspect',name],allow=True).returncode!=0,'BACKEND_RESOURCE_EXISTS'
  os.makedirs(root,mode=0o700)
  with open(root+'/.roomqc-backend-owner','x') as f:f.write(expected)
 else:
  assert os.path.isdir(root) and open(root+'/.roomqc-backend-owner').read()==expected,'BACKEND_OWNER_MISMATCH'
 lock=os.open(root+'/.install.lock',os.O_CREAT|os.O_RDWR|os.O_NOFOLLOW,0o600);fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
 if mode!='verify':
  os.makedirs(root+'/operator-logs',mode=0o700,exist_ok=True)
  def install_file(path,content,mode):
   if os.path.lexists(path):
    s=os.lstat(path);assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and stat.S_IMODE(s.st_mode)==mode
    assert open(path,'rb').read()==content.encode(),'BACKEND_IMMUTABLE_FILE_CHANGED'
    return
   os.makedirs(os.path.dirname(path),mode=0o700,exist_ok=True)
   fd,temp=tempfile.mkstemp(prefix='.roomqc-install-',dir=os.path.dirname(path))
   try:
    with os.fdopen(fd,'w',encoding='utf-8',newline='') as out:out.write(content);out.flush();os.fsync(out.fileno())
    os.chmod(temp,mode);assert not os.path.lexists(path);os.rename(temp,path)
   finally:
    if os.path.exists(temp):os.unlink(temp)
  for f in b['files']:
   path=root+'/'+f['path'];assert path.startswith(root+'/config/') and os.path.realpath(path)==path
   install_file(path,f['content'],f['mode'])
  install_file(root+'/compose.json',json.dumps(b['compose'],separators=(',',':')),0o600)
 phase='verify_configuration';verify_files();owned_resources()
 assert json.load(open(root+'/compose.json'))==b['compose']
 private=json.load(open(root+'/config/operator/backend.json'))
 if mode!='verify':
  phase='start_services';dc('config','--quiet');dc('up','-d','--no-build','--pull','never')
  # Realtime can briefly report unhealthy while its native tenant bootstrap
  # finishes on a CPU-limited first start. Keep a bounded gate and still require
  # every actual service healthy before any business migration is attempted.
  deadline=time.monotonic()+240
  while True:
   rows=json.loads(call(['docker','inspect',*[(project+'-'+s+'-1') for s in sorted(b['compose']['services'])]]).stdout)
   assert all(x['State']['Running'] and not x['State'].get('OOMKilled') for x in rows),'BACKEND_SERVICE_STOPPED'
   if all(x['State'].get('Health',{}).get('Status')=='healthy' for x in rows):break
   assert time.monotonic()<deadline,'BACKEND_HEALTH_DEADLINE'
   time.sleep(3)
  phase='business_migrations'
  def migrate(action,allow=False):
   args=['docker','run','--rm','-i','--label','roomqc.backend.migration='+b['clusterId'],
    '--network','container:'+project+'-db-1','--read-only','--user','1000:1000','--cap-drop','ALL',
    '--security-opt','no-new-privileges:true','--memory','256m','--pids-limit','64',
    '--tmpfs','/run/roomqc:rw,nosuid,noexec,size=1m,mode=0700,uid=1000,gid=1000','--entrypoint','sh',b['controlImage'],'-c',
    'umask 077; cat > /run/roomqc/business.dsn; exec node /app/business-migrate-cli.mjs "$@"','--','--mode',action,
    '--database-url-file','/run/roomqc/business.dsn','--expected-hash',b['migration']['sha256'],'--expected-count',str(b['migration']['count']),'--allow-local']
   dsn=('postgresql://supabase_admin:'+private['databasePassword']+'@127.0.0.1:5432/postgres\n').encode()
   p=call(args,input=dsn,allow=allow);value=json.loads(p.stdout)
   if not allow:assert value.get('ok') is True
   return value
  plan=migrate('plan',True)
  if not plan.get('ok'):
   # A pristine vendor may not have the history schema at all. Initialization
   # itself verifies vendor tables, no application relations/directory, and an
   # absent or empty ledger; these errors never permit history adoption.
   assert plan.get('code') in ('BUSINESS_MIGRATION_HISTORY_MISSING','BUSINESS_DATABASE_REQUIRED')
   assert migrate('initialize').get('initialized') is True
  migrate('apply');migrate('verify');receipt=migrate('receipt')['receipt']
  assert receipt['status']=='complete' and receipt['appliedCount']==b['migration']['count']
  with open(root+'/migration-receipt.json','w') as f:json.dump(receipt,f)
  os.chmod(root+'/migration-receipt.json',0o600)
  phase='post_migration_rest_exposure'
  install_file(rest_path,rest_text,0o600)
  dc('config','--quiet');dc('up','-d','--no-deps','--no-build','--pull','never','rest')
  deadline=time.monotonic()+90
  while True:
   rest=inspect('container',project+'-rest-1')
   assert rest['State']['Running'] and not rest['State'].get('OOMKilled'),'BACKEND_REST_STOPPED'
   if rest['State'].get('Health',{}).get('Status')=='healthy':break
   assert time.monotonic()<deadline,'BACKEND_REST_HEALTH_DEADLINE'
   time.sleep(2)
 verify_rest_overlay()
 phase='health';owned_resources();count=verify_runtime()
 status,_=http('/auth/v1/health');assert status==200
 status,body=http('/auth/v1/signup',b'{"email":"closed-install-check@roomqc.invalid","password":"AdmissionMustRemainClosed!42"}')
 assert status in (400,403,422) and b'signup_disabled' in body.lower(),'BACKEND_SIGNUP_NOT_CLOSED'
 receipt=json.load(open(root+'/migration-receipt.json'));assert receipt['appliedCount']==b['migration']['count'] and receipt['migrationSetSha256']==b['migration']['sha256']
 print(json.dumps(dict(ok=True,mode=mode,clusterId=b['clusterId'],specSha256=expected,services=count,migrations=receipt['appliedCount'],postMigrationRestVerified=True,signupOpened=False,productionReady=False,phase='closed_backend_verified')))
except Exception as e:
 print(json.dumps(dict(ok=False,mode=mode,clusterId=b['clusterId'],specSha256=expected,phase=phase,code='BACKEND_INSTALL_REMOTE_FAILED',errorType=type(e).__name__,signupOpened=False,productionReady=False)))
`;

export async function backendInstallMain(args){
 try{
  if(args.length===1&&args[0]==='--help'){console.log('Usage: --bundle ABSOLUTE_PRIVATE_JSON --host APPROVED_IPV4 --mode plan|initialize|resume|verify. Requires preloaded exact images; creates a separate closed backend and never changes frontend routing.');return 0;}
  assert.equal(args.length,6);const flags=new Map();for(let i=0;i<args.length;i+=2){assert(!flags.has(args[i]));flags.set(args[i],args[i+1]);}
  assert.deepEqual([...flags.keys()].sort(),['--bundle','--host','--mode']);
  const file=resolve(flags.get('--bundle')),info=await lstat(file);assert(info.isFile()&&!info.isSymbolicLink()&&info.nlink===1&&info.size<2*1024**2);
  const bundle=validateBackendInstall(JSON.parse(await readFile(file,'utf8'))),mode=flags.get('--mode');assert(['plan','initialize','resume','verify'].includes(mode));
  const target=preflightArguments(['--host',flags.get('--host'),'--user','root']);
  let allocatedRuntimeDiskBytes=0;
  if(['resume','verify'].includes(mode)){
   const allocation=JSON.parse((await runSsh(target,pythonCommand(allocationProgram,'<roomqc-backend-allocation>'),JSON.stringify({root:bundle.root,project:bundle.project,clusterId:bundle.clusterId,specSha256:bundle.specSha256,volumes:Object.keys(bundle.compose.volumes)}))).stdout);
   assert.equal(allocation.specSha256,bundle.specSha256);allocatedRuntimeDiskBytes=allocation.allocatedRuntimeDiskBytes;
  }
  const facts=await collectVpsPreflight(target),capacity=backendInstallCapacity(bundle,facts,{mode:mode==='plan'?'initialize':mode,allocatedRuntimeDiskBytes});
  if(mode==='plan'||!capacity.allowed){console.log(JSON.stringify({ok:capacity.allowed,mode,clusterId:bundle.clusterId,specSha256:bundle.specSha256,capacity,remoteChanged:false,signupOpened:false,productionReady:false}));return capacity.allowed?0:2;}
  let response;
  try{response=await runSsh(target,pythonCommand(backendRemoteProgram,'<roomqc-backend-install>')+' '+shellQuote(mode)+' '+shellQuote(bundle.specSha256),JSON.stringify(bundle),{timeoutMs:600000});}
  catch{console.log(JSON.stringify({ok:false,code:'BACKEND_INSTALL_REMOTE_FAILED',nextAction:'verify_same_configuration',signupOpened:false,productionReady:false}));return 1;}
  const receipt=JSON.parse(response.stdout.trim().split(/\r?\n/).at(-1));assert.equal(receipt.specSha256,bundle.specSha256);assert.equal(receipt.signupOpened,false);
  await writeFile(joinReceipt(file,mode),JSON.stringify(receipt,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(receipt));return receipt.ok?0:1;
 }catch{console.log(JSON.stringify({ok:false,code:'BACKEND_INSTALL_INPUT_FAILED',signupOpened:false,productionReady:false}));return 1;}
}
const joinReceipt=(file,mode)=>dirname(file)+'/install-'+mode+'-receipt.json';
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))process.exitCode=await backendInstallMain(process.argv.slice(2));
