import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const execute=promisify(execFile),root=resolve(import.meta.dirname,'..');
if(process.argv.slice(2).join(' ')!=='--run'){console.log('Usage: node scripts/test-host-observer-service-local.mjs --run (owned isolated Docker fixture, no VPS access)');process.exit(0)}
const run=randomBytes(6).toString('hex'),project='roomqc-observer-test-'+run,labelKey='roomqc.host-observer-test',label=labelKey+'='+run;
const dir=await mkdtemp(join(root,'.local/host-observer-service-'));
const names={db:project+'-db',ssh:project+'-ssh',client:project+'-host-observer-1',network:project+'-private',data:project+'-data',private:project+'-private',ca:project+'-ca',config:project+'-config'};
const image=process.env.ROOMQC_HOST_OBSERVER_TEST_IMAGE??'roomqc/host-observer:trial-20261031',postgres='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const octet=parseInt(run.slice(0,2),16),host=`11.252.${octet}.2`;
const receipt={kind:'roomqc-host-observer-service-local',run,startedAt:new Date().toISOString(),scope:{realSsh:true,strictHostKeys:true,realPostgresTls:true,packagedObserver:true,productionConfiguration:true,fullRoomQC:false,vpsAccess:false,signupOpened:false},checks:[]};
const event=phase=>console.log(JSON.stringify({event:'host_observer_service_test',phase,run}));
async function docker(args,input,timeout=60000){
  try{return await new Promise((accept,reject)=>{
    const child=execFile('docker',args,{cwd:root,encoding:'utf8',windowsHide:true,timeout,maxBuffer:8_000_000},(error,stdout,stderr)=>{
      if(error){error.stderr=stderr;reject(error)}else accept(args[0]==='logs'?stdout+stderr:stdout);
    });child.stdin.end(input??'');
  })}
  catch(error){
    // Child input can contain ephemeral test credentials; never attach the child exception.
    const safe=String(error.stderr??'').replace(/[a-f0-9]{64}/gi,'[redacted]').replace(/postgres(?:ql)?:\/\/[^\s]+/gi,'[redacted-dsn]');
    await writeFile(join(dir,'failure-private.log'),safe,{mode:0o600});
    throw Object.assign(new Error('OBSERVER_FIXTURE_DOCKER_FAILED'),{code:'OBSERVER_FIXTURE_DOCKER_FAILED'});
  }
}
const inspect=async name=>JSON.parse(await docker(['inspect',name]))[0];
const put=async(path,text)=>docker(['run','--rm','-i','--name',project+'-put','--label',label,'--network','none','--user','0:0','--read-only',
  '--cap-drop','ALL','--cap-add','DAC_OVERRIDE','--security-opt','no-new-privileges','--mount',`type=volume,src=${names.config},dst=/config`,
  '--entrypoint','node',image,'--input-type=module','-e',"import {writeFile} from 'node:fs/promises';let s='';for await(const c of process.stdin)s+=c;const v=JSON.parse(s);await writeFile('/config/'+v.path,v.text);"],JSON.stringify({path,text}));
const sql=async text=>(await docker(['exec','-i',names.db,'psql','-U','postgres','-d','observer_fixture','-X','-qAt','-v','ON_ERROR_STOP=1'],text)).trim();
const check=(name,value)=>{assert(value,name);receipt.checks.push(name);event(name)};
async function waitFor(action,timeout=40000){const end=Date.now()+timeout;while(Date.now()<end){try{if(await action())return}catch{}await delay(750)}throw new Error('OBSERVER_FIXTURE_WAIT_FAILED')}
const admin=randomBytes(32).toString('hex'),password=randomBytes(32).toString('hex'),login='observer_'+run;
const databaseUrl=`postgresql://${login}:${password}@observer-directory:5432/observer_fixture?sslmode=verify-full`;
let composeArgs,config,knownHost;
const ids=(await docker(['ps','-q'])).trim().split(/\s+/).filter(Boolean);
const before=new Map((ids.length?JSON.parse(await docker(['inspect',...ids])):[]).map(c=>[c.Id,c.State.StartedAt]));
try{
  const built=JSON.parse(await docker(['image','inspect',image]))[0];receipt.imageId=built.Id;
  const immutable=built.RepoDigests.find(v=>v.startsWith('roomqc/host-observer@sha256:'));assert(immutable);receipt.imageReference=immutable;
  const packagedFiles=['scripts/roomqc-host-observer.mjs','scripts/roomqc-vps-preflight.mjs','server/control/host-monitor.mjs',
    'server/control/resource-runtime.mjs','server/control/workers/host-observer-status.mjs'];
  const expected=await Promise.all(packagedFiles.map(async path=>({path,sha256:createHash('sha256').update(await readFile(join(root,path))).digest('hex')})));
  const verify=`import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';let s='';for await(const c of process.stdin)s+=c;
    assert.equal(process.getuid(),1000);for(const f of JSON.parse(s))assert.equal(createHash('sha256').update(await readFile(f.path)).digest('hex'),f.sha256);console.log('PACKAGED_SOURCE_MATCHES');`;
  check('packaged_runtime_matches_current_source',(await docker(['run','--rm','-i','--name',project+'-verify','--label',label,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges',
    '--entrypoint','node',immutable,'--input-type=module','-e',verify],JSON.stringify(expected))).trim()==='PACKAGED_SOURCE_MATCHES');
  const targetImage=(await inspect('roomqc/ssh-drill-target:local-20261031')).Id;
  const packet=JSON.parse(await readFile(join(root,'artifacts/roomqc-current-backend-image-packet-2026-10-30.json'),'utf8'));
  const helper=packet.images.find(i=>i.service==='realtime').imageId;
  await docker(['network','create','--internal','--subnet',`11.252.${octet}.0/29`,'--label',label,names.network]);
  check('fixture_network_internal',(await inspect(names.network)).Internal===true);
  for(const key of ['data','private','ca','config'])await docker(['volume','create','--label',label,names[key]]);
  const tls=String.raw`set -eu
read -r adminPassword
umask 077
cd /work
openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out /public/ca.crt -days 2 -subj /CN=RoomQC-Observer-Fixture-CA
openssl req -newkey rsa:2048 -nodes -keyout /private/server.key -out server.csr -subj /CN=observer-directory
printf 'subjectAltName=DNS:observer-directory\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA /public/ca.crt -CAkey ca.key -CAcreateserial -out /private/server.crt -days 2 -extfile server.ext
printf '%s' "$adminPassword" > /private/password
chown -R 70:70 /private /data
chmod 0700 /private /data
chmod 0600 /private/server.key /private/password
chmod 0444 /private/server.crt /public/ca.crt
chmod 0755 /public
`;
  await docker(['run','--rm','-i','--name',project+'-tls','--label',label,'--network','none','--user','0:0','--read-only','--cap-drop','ALL',
    '--cap-add','CHOWN','--cap-add','FOWNER','--cap-add','DAC_OVERRIDE','--security-opt','no-new-privileges','--tmpfs','/work:rw,nosuid,noexec,size=8m',
    '--mount',`type=volume,src=${names.data},dst=/data`,'--mount',`type=volume,src=${names.private},dst=/private`,'--mount',`type=volume,src=${names.ca},dst=/public`,
    '--entrypoint','sh',helper,'-c',tls],admin+'\n');
  const budget=JSON.parse(await readFile(join(root,'deploy/control-resource-budget.example.json'),'utf8'));budget.environment='staging';
  budget.databases[0].consumers.find(c=>c.id==='host-observer').replicas=1;
  config={budget,hosts:{version:1,hosts:[{id:'fixture-'+run,name:'Owned SSH fixture',region:null,providerLabel:'Docker fixture',environment:'staging',
    ssh:{host,user:'root',identityFile:'/home/node/.ssh/observer-key'}}]},databaseUrl};
  const seed=`import {writeFile,chmod,chown} from 'node:fs/promises';import {execFileSync} from 'node:child_process';
    let s='';for await(const c of process.stdin)s+=c;const v=JSON.parse(s);await chmod('/config',0o700);await chown('/config',1000,1000);
    for(const [name,value]of Object.entries({'budget.json':JSON.stringify(v.budget),'hosts.json':JSON.stringify(v.hosts),'observer-dsn':v.databaseUrl,'known_hosts':'not-yet-configured\\n'})){
      await writeFile('/config/'+name,value,{mode:0o600});await chown('/config/'+name,1000,1000)}
    execFileSync('ssh-keygen',['-q','-t','ed25519','-N','','-f','/config/observer-key']);
    for(const name of ['observer-key','observer-key.pub'])await chown('/config/'+name,1000,1000);`;
  await docker(['run','--rm','-i','--name',project+'-seed','--label',label,'--network','none','--user','0:0','--read-only','--cap-drop','ALL','--cap-add','CHOWN','--cap-add','FOWNER','--cap-add','DAC_OVERRIDE',
    '--mount',`type=volume,src=${names.config},dst=/config`,'--entrypoint','node',image,'--input-type=module','-e',seed],JSON.stringify(config));
  await docker(['run','-d','--name',names.ssh,'--label',label,'--network',names.network,'--ip',host,
    '--mount',`type=volume,src=${names.config},dst=/fixture,readonly`,'--entrypoint','sh',targetImage,'-c',
    'cp /fixture/observer-key.pub /root/.ssh/authorized_keys; chmod 600 /root/.ssh/authorized_keys; ssh-keygen -A >/dev/null 2>&1; exec /usr/sbin/sshd -D -e']);
  await waitFor(async()=>Boolean((await docker(['exec',names.ssh,'cat','/etc/ssh/ssh_host_ed25519_key.pub'])).trim()));
  knownHost=host+' '+(await docker(['exec',names.ssh,'cat','/etc/ssh/ssh_host_ed25519_key.pub'])).trim()+'\n';await put('known_hosts',knownHost);
  await docker(['run','-d','--name',names.db,'--label',label,'--network',names.network,'--network-alias','observer-directory','--user','70:70',
    '--env','POSTGRES_DB=observer_fixture','--env','POSTGRES_PASSWORD_FILE=/private/password','--mount',`type=volume,src=${names.private},dst=/private,readonly`,
    '--mount',`type=volume,src=${names.data},dst=/var/lib/postgresql/data`,postgres,'postgres','-c','ssl=on','-c','ssl_cert_file=/private/server.crt','-c','ssl_key_file=/private/server.key']);
  await waitFor(async()=>(await docker(['exec',names.db,'pg_isready','-U','postgres','-d','observer_fixture'])).includes('accepting connections'));
  const migrate=`import pg from './server/control/node_modules/pg/lib/index.js';import {migrateDirectory} from './server/control/migrate.mjs';let s='';for await(const c of process.stdin)s+=c;const v=JSON.parse(s);
    const pool=new pg.Pool({connectionString:v.databaseUrl,max:1});try{await migrateDirectory(pool);await pool.query("CREATE ROLE ${login} LOGIN CONNECTION LIMIT 1 PASSWORD '"+v.password+"' IN ROLE roomqc_control_host_observer");console.log('MIGRATED')}finally{await pool.end()}`;
  assert.equal((await docker(['run','--rm','-i','--name',project+'-migrate','--label',label,'--network',names.network,'--user','1000:1000','--read-only',
    '--env','NODE_EXTRA_CA_CERTS=/tls/ca.crt','--mount',`type=volume,src=${names.ca},dst=/tls,readonly`,
    '--mount',`type=bind,src=${join(root,'server/control/migrations')},dst=/opt/roomqc/server/control/migrations,readonly`,
    '--entrypoint','node',image,'--input-type=module','-e',migrate],JSON.stringify({databaseUrl:`postgresql://postgres:${admin}@observer-directory:5432/observer_fixture?sslmode=verify-full`,password}))).trim(),'MIGRATED');
  const placeholder=join(dir,'placeholder');await writeFile(placeholder,'fixture-only');
  const env={...process.env,ROOMQC_HOST_OBSERVER_PROJECT:project,ROOMQC_HOST_OBSERVER_IMAGE:immutable,ROOMQC_RESOURCE_ENVIRONMENT:'staging',
    ROOMQC_HOST_OBSERVER_TARGETS_FILE:placeholder,ROOMQC_RESOURCE_BUDGET_FILE:placeholder,ROOMQC_HOST_OBSERVER_KNOWN_HOSTS_FILE:placeholder,
    ROOMQC_HOST_OBSERVER_CA_FILE:placeholder,ROOMQC_HOST_OBSERVER_DATABASE_URL_FILE:placeholder,ROOMQC_HOST_OBSERVER_SSH_KEY_FILE:placeholder,
    ROOMQC_HOST_OBSERVER_DIRECTORY_NETWORK:names.network};
  const override=join(dir,'compose.yml');
  await writeFile(override,`services:
  host-observer:
    labels: {${labelKey}: '${run}'}
    secrets: !reset []
    environment:
      ROOMQC_RESOURCE_BUDGET_FILE: /home/node/.ssh/budget.json
      NODE_EXTRA_CA_CERTS: /tls/ca.crt
    volumes: !override
      - {type: volume, source: config, target: /home/node/.ssh, read_only: true}
      - {type: volume, source: ca, target: /tls, read_only: true}
    command: [node, scripts/roomqc-host-observer.mjs, --targets-file, /home/node/.ssh/hosts.json, --database-url-file, /home/node/.ssh/observer-dsn, --status-file, /run/roomqc/observer-status.json, --watch, --interval-seconds, '60']
volumes:
  config: {external: true, name: '${names.config}'}
  ca: {external: true, name: '${names.ca}'}
networks:
  ssh-egress:
    internal: true
    labels: {${labelKey}: '${run}'}
`);
  composeArgs=['compose','-p',project,'-f',join(root,'deploy/monitoring/host-observer.compose.yml'),'-f',override];
  const compose=async args=>{
    try{return (await execute('docker',[...composeArgs,...args],{cwd:root,env,windowsHide:true,timeout:90000,maxBuffer:8_000_000})).stdout}
    catch(error){await writeFile(join(dir,'compose-private.log'),String(error.stderr??''),{mode:0o600});throw new Error('OBSERVER_FIXTURE_COMPOSE_FAILED')}
  };
  const rendered=JSON.parse(await compose(['config','--format','json']));const service=rendered.services['host-observer'];
  receipt.composeSettings={user:service.user,readOnly:service.read_only,memoryBytes:Number(service.mem_limit),pidsLimit:Number(service.pids_limit),cpuLimit:Number(service.cpus)};
  check('compose_has_no_ports_or_docker_socket',!service.ports&&!JSON.stringify(service.volumes).includes('docker.sock'));
  check('compose_is_bounded_readonly_nonroot',service.user==='1000:1000'&&service.read_only===true&&Number(service.mem_limit)===268435456&&Number(service.pids_limit)===64&&Number(service.cpus)===0.5);
  await compose(['up','-d','--no-build','--pull','never','--wait','--wait-timeout','60','host-observer']);
  const sample=()=>sql("SELECT coalesce(max(observed_at)::text,'') FROM roomqc_control.host_resources_current;");
  const healthy=async()=>{const value=await inspect(names.client);return value.State.Running&&value.State.Health?.Status==='healthy'};
  await waitFor(healthy);const first=await sample();assert(first);
  check('actual_ssh_sample_written',Number(await sql('SELECT count(*) FROM roomqc_control.hosts;'))===1);
  check('observer_connection_verified_tls',await sql(`SELECT count(*) FROM pg_stat_activity a JOIN pg_stat_ssl s USING(pid) WHERE a.usename='${login}' AND s.ssl;`)==='1');
  check('no_cluster_or_workspace_created',await sql('SELECT (SELECT count(*) FROM roomqc_control.clusters)+(SELECT count(*) FROM roomqc_control.workspaces);')==='0');
  const actual=await inspect(names.client);check('actual_process_hardened',actual.Config.User==='1000:1000'&&actual.HostConfig.ReadonlyRootfs&&actual.HostConfig.RestartPolicy.Name==='unless-stopped');
  const pub=(await docker(['exec',names.ssh,'cat','/fixture/observer-key.pub'])).trim();await put('known_hosts',host+' '+pub+'\n');
  await compose(['restart','host-observer']);
  await waitFor(async()=>JSON.parse(await docker(['exec',names.client,'cat','/run/roomqc/observer-status.json'])).failed===1);
  check('wrong_host_key_preserves_last_sample',await sample()===first);
  const status=await docker(['exec',names.client,'node','--input-type=module','-e',"import {readFile} from 'node:fs/promises';import {hostObserverStatusReady} from './server/control/workers/host-observer-status.mjs';console.log(hostObserverStatusReady(JSON.parse(await readFile('/run/roomqc/observer-status.json','utf8'))))"]);
  check('wrong_host_key_not_ready',status.trim()==='false');
  await put('known_hosts',knownHost);await compose(['restart','host-observer']);
  await waitFor(async()=>await sample()!==first&&await healthy());const second=await sample();check('recovers_after_correct_host_key',second!==first);
  await docker(['stop',names.db]);await compose(['restart','host-observer']);
  await waitFor(async()=>{const s=(await inspect(names.client)).State;return s.Restarting||s.ExitCode!==0});
  await docker(['start',names.db]);await waitFor(async()=>await sample()!==second&&await healthy(),60000);
  check('database_outage_recovers_without_manual_observer_start',await sample()!==second);
  const previous=await sample();await sql(`GRANT roomqc_control_api TO ${login};`);await compose(['restart','host-observer']);
  await waitFor(async()=>(await docker(['logs',names.client])).includes('HOST_OBSERVER_ROLE_REQUIRED'));
  check('overprivileged_login_rejected',await sample()===previous);
  await sql(`REVOKE roomqc_control_api FROM ${login};`);await waitFor(async()=>await healthy()&&await sample()!==previous,60000);
  check('recovers_after_role_fixed',await sample()!==previous);
  const safeLogs=await docker(['logs',names.client]);check('credentials_absent_from_stdout',!safeLogs.includes(password)&&!safeLogs.includes(databaseUrl));
  const started=Date.now();await compose(['stop','host-observer']);const stopped=await inspect(names.client);
  check('graceful_stop_exits_zero',stopped.State.ExitCode===0&&Date.now()-started<35000);
  for(const [id,time]of before)assert.equal((await inspect(id)).State.StartedAt,time);
  check('other_local_containers_unchanged',true);receipt.passed=true;
}catch(error){receipt.passed=false;receipt.errorCode=error.code??error.message;event('failed');process.exitCode=1}
finally{
  for(const id of (await docker(['ps','-aq','--filter','label='+label])).trim().split(/\s+/).filter(Boolean)){
    assert.equal((await inspect(id)).Config.Labels[labelKey],run);await docker(['rm','-f',id]);
  }
  for(const name of (await docker(['network','ls','--filter','label='+label,'--format','{{.Name}}'])).trim().split(/\s+/).filter(Boolean)){
    assert.equal((await inspect(name)).Labels[labelKey],run);await docker(['network','rm',name]);
  }
  for(const name of (await docker(['volume','ls','--filter','label='+label,'--format','{{.Name}}'])).trim().split(/\s+/).filter(Boolean)){
    assert.equal((await inspect(name)).Labels[labelKey],run);await docker(['volume','rm',name]);
  }
  receipt.cleanup={containers:(await docker(['ps','-aq','--filter','label='+label])).trim()==='',networks:(await docker(['network','ls','--filter','label='+label,'--format','{{.Name}}'])).trim()==='',volumes:(await docker(['volume','ls','--filter','label='+label,'--format','{{.Name}}'])).trim()===''};
  const paths=['scripts/roomqc-host-observer.mjs','scripts/test-host-observer-service-local.mjs','server/control/workers/host-observer-status.mjs','server/control/resource-runtime.mjs','deploy/monitoring/host-observer.Dockerfile','deploy/monitoring/host-observer.compose.yml'];
  receipt.sourceBindings=Object.fromEntries(await Promise.all(paths.map(async path=>[path,createHash('sha256').update(await readFile(join(root,path))).digest('hex')])));
  receipt.finishedAt=new Date().toISOString();
  await writeFile(join(root,`artifacts/roomqc-host-observer-service-${run}-local-2026-10-31.json`),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
  await writeFile(join(root,'artifacts/roomqc-host-observer-service-local-2026-10-31.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify({passed:receipt.passed,checks:receipt.checks.length,cleanup:receipt.cleanup,errorCode:receipt.errorCode??null}));
}
