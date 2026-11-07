// Actual pinned GoTrue, owned synthetic identity, separate directory database.
// This narrow lifecycle fixture is NOT the complete vendor backend/gateway.
import test,{before,after} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHmac,randomBytes} from 'node:crypto';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {ProbeKeyring} from './probe-secrets.mjs';
import {ProbeCredentialStore,probeBinding} from './probe-credentials.mjs';
import {ProbeSessionManager} from './probe-session.mjs';

const enabled=process.env.ROOMQC_CONTROL_DB_TEST==='true',run=randomBytes(6).toString('hex');
const network='roomqc-probe-auth-'+run,dbName=network+'-db',authName=network+'-auth',label='roomqc.probe-auth-test';
const dbImage='postgres:16-alpine@sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383';
const authImage='supabase/gotrue:v2.197.0@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b';
const password=randomBytes(32).toString('hex'),secret=randomBytes(32).toString('hex'),pools=[],owned=[];
const token=role=>{
  const body=[{alg:'HS256',typ:'JWT'},{role,iss:'roomqc-test',exp:Math.floor(Date.now()/1000)+3600}]
    .map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
};
const publicKey=token('anon'),serviceKey=token('service_role'),probeToken=token('roomqc_control_probe');
const docker=(args,env={})=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,maxBuffer:500000,
  env:{...process.env,...env},stdio:['pipe','pipe','pipe']});
let proxy,authOrigin,cluster,config,binding,admin,directory,store,installer,user,bundle;
let dropNextRefresh=false,committedRefreshResponseDropped=false,refreshRequests=0;
const call=async(path,body,bearer=publicKey)=>{
  const response=await fetch(cluster.url+'/auth/v1'+path,{method:body===undefined?'GET':'POST',signal:AbortSignal.timeout(5000),
    headers:{apikey:publicKey,authorization:'Bearer '+bearer,'content-type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
  assert.ok(response.ok,'Owned Auth setup request failed (status '+response.status+')');
  return response.status===204?null:response.json();
};
const toBundle=session=>({credential:{publishableKey:publicKey,token:probeToken},auth:{token:session.access_token,
  refreshToken:session.refresh_token,userId:session.user.id,sessionId:JSON.parse(Buffer.from(session.access_token.split('.')[1],'base64url')).session_id}});

before(async()=>{
  if(!enabled)return;
  let stage='database';
  try{
    // Host tests need loopback-published ports (Docker Desktop internal networks
    // are not host-reachable). No provider config, SMTP or real recipient exists.
    docker(['network','create','--label',label+'='+run,network]);owned.push(['network',network]);
    docker(['run','-d','--name',dbName,'--network',network,'--label',label+'='+run,'--env','POSTGRES_PASSWORD',
      '--tmpfs','/var/lib/postgresql/data:rw,nosuid,size=192m','-p','127.0.0.1::5432',dbImage],{POSTGRES_PASSWORD:password});owned.push(['container',dbName]);
    const db=JSON.parse(docker(['inspect',dbName]))[0];const url=new URL(`postgresql://postgres:${password}@127.0.0.1:${db.NetworkSettings.Ports['5432/tcp'][0].HostPort}/postgres`);
    admin=new pg.Pool({connectionString:url.href,max:2,statement_timeout:5000});pools.push(admin);
    stage='database_connect';
    let ready=false;for(let i=0;i<80;i++){try{await admin.query('SELECT 1');ready=true;break}catch{await new Promise(r=>setTimeout(r,100))}}assert.ok(ready,'Owned Auth database ready');
    stage='database_create';
    await admin.query(`CREATE ROLE supabase_auth_admin LOGIN PASSWORD '${password}'`);
    await admin.query('CREATE DATABASE auth_fixture OWNER supabase_auth_admin');
    await admin.query('ALTER ROLE supabase_auth_admin IN DATABASE auth_fixture SET search_path=auth,public');
    const authSetupUrl=new URL(url);authSetupUrl.pathname='/auth_fixture';
    const authSetup=new pg.Pool({connectionString:authSetupUrl.href,max:1});
    try{await authSetup.query('CREATE SCHEMA auth AUTHORIZATION supabase_auth_admin')}
    finally{await authSetup.end()}
    await admin.query('CREATE DATABASE directory_fixture');url.pathname='/directory_fixture';
    directory=new pg.Pool({connectionString:url.href,max:2,statement_timeout:5000});pools.push(directory);
    stage='auth_start';
    const env={GOTRUE_API_HOST:'0.0.0.0',GOTRUE_API_PORT:'9999',API_EXTERNAL_URL:'http://fixture.invalid/auth/v1',
      GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgres://supabase_auth_admin:${password}@${dbName}:5432/auth_fixture`,
      GOTRUE_SITE_URL:'http://fixture.invalid',GOTRUE_DISABLE_SIGNUP:'true',GOTRUE_JWT_ADMIN_ROLES:'service_role',
      GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_JWT_EXP:'120',GOTRUE_JWT_SECRET:secret,
      GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'true',GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED:'false',
      GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED:'true',GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL:'10'};
    stage='auth_container_run';
    docker(['run','-d','--name',authName,'--network',network,'--label',label+'='+run,'--cap-drop','ALL','--security-opt','no-new-privileges',
      '--memory','192m','--cpus','1','--pids-limit','64',...Object.keys(env).flatMap(k=>['--env',k]),'-p','127.0.0.1::9999',authImage],env);owned.push(['container',authName]);
    stage='auth_health';
    const auth=JSON.parse(docker(['inspect',authName]))[0];authOrigin='http://127.0.0.1:'+auth.NetworkSettings.Ports['9999/tcp'][0].HostPort;
    ready=false;for(let i=0;i<120;i++){
      try{if((await fetch(authOrigin+'/health',{signal:AbortSignal.timeout(1000)})).ok){ready=true;break}}catch{}
      await new Promise(r=>setTimeout(r,100));
    }
    assert.ok(ready,'Pinned owned Auth must be ready');
    stage='directory';
    // Prefix adapter only; forwards to a single owned loopback port, never a URL
    // supplied by a request. It is not evidence for production gateway routing.
    proxy=http.createServer((req,res)=>{
      if(!req.url.startsWith('/auth/v1/')||!['POST','GET'].includes(req.method)){res.writeHead(404);res.end();return}
      const isRefresh=req.url==='/auth/v1/token?grant_type=refresh_token';if(isRefresh)refreshRequests++;
      const upstream=http.request(authOrigin+req.url.slice('/auth/v1'.length),{method:req.method,headers:req.headers,timeout:5000},reply=>{
        if(isRefresh&&dropNextRefresh){
          dropNextRefresh=false;
          // Drain the successful upstream body BEFORE severing the client reply:
          // GoTrue has committed and emitted the new token pair, but coordinator
          // never receives it. Neither tokens nor raw payload are retained/logged.
          reply.resume();reply.on('end',()=>{committedRefreshResponseDropped=reply.statusCode===200;res.destroy()});return;
        }
        res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
      });upstream.on('timeout',()=>upstream.destroy());upstream.on('error',()=>{res.writeHead(502);res.end()});req.pipe(upstream);
    });
    await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
    cluster={id:'auth-fixture',url:'http://127.0.0.1:'+proxy.address().port,publishableKey:publicKey,vapidPublicKey:'fixture-vapid',maxWorkspaces:1};
    config={allowLocal:true,inventory:new Map([[cluster.id,cluster]])};
    const expected={clusterId:cluster.id,releaseId:'fixture-v3',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
      migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};binding=probeBinding(cluster,expected);
    await migrateDirectory(directory);await importInitialRegistry(directory,[cluster]);
    await directory.query('UPDATE roomqc_control.clusters SET inventory_ref=id,release_id=$1,schema_manifest_hash=$2',
      [expected.releaseId,expected.schemaManifestHash]);
    await directory.query(`CREATE ROLE probe_auth_runtime LOGIN PASSWORD '${password}';GRANT roomqc_control_probe_runtime TO probe_auth_runtime;
      CREATE ROLE probe_auth_installer LOGIN PASSWORD '${password}';GRANT roomqc_control_probe_installer TO probe_auth_installer;`);
    const runtimeUrl=new URL(url);runtimeUrl.username='probe_auth_runtime';const installerUrl=new URL(url);installerUrl.username='probe_auth_installer';
    const runtimePool=new pg.Pool({connectionString:runtimeUrl.href,max:2,statement_timeout:5000});pools.push(runtimePool);
    const installerPool=new pg.Pool({connectionString:installerUrl.href,max:2,statement_timeout:5000});pools.push(installerPool);
    const keyring=new ProbeKeyring({activeKeyId:'fixture-key',keys:new Map([['fixture-key',randomBytes(32)]])});
    store=new ProbeCredentialStore(runtimePool,keyring);installer=new ProbeCredentialStore(installerPool,keyring);
    stage='canary_create';
    const email='canary-'+run+'@roomqc.invalid';
    user=await call('/admin/users',{email,password,email_confirm:true,app_metadata:{roomqc_control_canary:true}},serviceKey);
    stage='canary_login';
    bundle=toBundle(await call('/token?grant_type=password',{email,password}));
    stage='canary_install';
    assert.ok(bundle.auth.userId===user.id,'Seed must use the one owned canary');await installer.install(binding,bundle,{expectedRevision:0});
  }catch(error){
    // execFile errors include child environment/logs; do not expose them.
    const code=/^[A-Z0-9_]{5,64}$/.test(error?.code??'')?error.code:'REDACTED';
    const httpStatus=error?.message?.match(/status (\d{3})/)?.[1]??'none';
    let diagnostic=stage==='auth_container_run'?String(error.stderr??''):'';
    if(['auth_health','canary_create','canary_login'].includes(stage)){
      const logs=spawnSync('docker',['logs','--tail','8',authName],{encoding:'utf8',timeout:5000,maxBuffer:100000});
      diagnostic=((logs.stdout??'')+(logs.stderr??'')).split(/\r?\n/).map(line=>{
        try{const entry=JSON.parse(line);return ['fatal','error'].includes(entry.level)
          ?(String(entry.msg)+' '+String(entry.error??'')).slice(-1000):''}catch{return ''}
      }).filter(Boolean).join('\n')+' '+error.name+': '+error.message;
    }
    for(const value of [password,secret,publicKey,serviceKey,probeToken])diagnostic=diagnostic.replaceAll(value,'[redacted]');
    diagnostic=diagnostic.replace(/eyJ[A-Za-z0-9_.-]+/g,'[jwt-redacted]').replace(/postgres(?:ql)?:\/\/[^\s"]+/g,'[db-redacted]').slice(0,2500);
    throw new Error('Owned pinned Auth lifecycle fixture failed to initialize (stage='+stage+', code='+code+', http='+httpStatus+'; credentials redacted) '+diagnostic);
  }
});
after(async()=>{
  if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve))}
  await Promise.allSettled(pools.map(p=>p.end()));
  for(const [kind,name] of owned.reverse()){
    const info=JSON.parse(docker([kind==='network'?'network':'container','inspect',name]))[0];
    assert.equal(kind==='network'?info.Labels[label]:info.Config.Labels[label],run,'Exact ownership required before cleanup');
    docker(kind==='network'?['network','rm',name]:['rm','-f',name]);
  }
  for(const kind of ['container','network'])assert.equal(docker([kind,'ls',...(kind==='container'?['-a']:[]),'--filter','label='+label+'='+run,
    '--format',kind==='container'?'{{.Names}}':'{{.Name}}']).trim(),'');
});
test('probe lifecycle: real GoTrue rotates durable refresh pair, preserves canary/session, rejects revoke and explicitly recovers same user',
  {skip:!enabled},async()=>{
    const manager=()=>new ProbeSessionManager({store,config,cluster,expected:binding.expected});let probes=0;
    const probe=async settings=>{
      assert.equal(settings.auth.refreshToken,undefined);
      const response=await fetch(cluster.url+'/auth/v1/user',{signal:AbortSignal.timeout(5000),
        headers:{apikey:settings.credential.publishableKey,authorization:'Bearer '+settings.auth.token}});
      assert.ok(response.ok,'Fresh canary access token must reach real /user');
      const found=await response.json();assert.ok(found.id===user.id,'Live Auth identity must be unchanged');probes++;return true;
    };
    const first=await manager().run(probe);assert.equal(first.credentialRevision,3);
    const second=await manager().run(probe);assert.equal(second.credentialRevision,5);assert.equal(probes,2);
    // Claiming another short-TTL refresh after process reconstruction reads the
    // last durable pair, not a cached initial token from bundle.
    const current=(await directory.query('SELECT * FROM roomqc_control.probe_credentials')).rows[0];
    assert.ok(current.auth_user_id===bundle.auth.userId&&current.auth_session_id===bundle.auth.sessionId,'Refresh must preserve both IDs');
    assert.ok(!JSON.stringify(current).includes(bundle.auth.refreshToken),'No plaintext refresh token in DB');
    const active=store.keyring.unseal(current.envelope,{clusterId:binding.clusterId,credentialRef:binding.credentialRef,bindingHash:binding.bindingHash,revision:5});
    assert.ok(active.auth.refreshToken!==bundle.auth.refreshToken,'Real Auth must rotate the refresh token');
    const beforeDropRequests=refreshRequests;dropNextRefresh=true;
    await assert.rejects(()=>manager().run(probe),{code:'PROBE_REFRESH_UNCERTAIN'});
    assert.equal(committedRefreshResponseDropped,true,'Auth must have emitted 200 before client response was destroyed');
    assert.equal(refreshRequests,beforeDropRequests+1);
    await assert.rejects(()=>manager().run(probe),{code:'PROBE_RECOVERY_REQUIRED'});
    assert.equal(refreshRequests,beforeDropRequests+1,'Uncertain consumed token must never be retried');assert.equal(probes,2);
    const afterDrop=Number((await directory.query('SELECT revision FROM roomqc_control.probe_credentials')).rows[0].revision);
    const sameUser=toBundle(await call('/token?grant_type=password',{email:'canary-'+run+'@roomqc.invalid',password}));
    await installer.install(binding,sameUser,{expectedRevision:afterDrop});assert.equal((await manager().run(probe)).result,true);
    const beforeRevoke=(await directory.query('SELECT * FROM roomqc_control.probe_credentials')).rows[0];
    const revoked=store.keyring.unseal(beforeRevoke.envelope,{clusterId:binding.clusterId,credentialRef:binding.credentialRef,
      bindingHash:binding.bindingHash,revision:Number(beforeRevoke.revision)});
    await call('/logout?scope=global',{},revoked.auth.token);
    await assert.rejects(()=>manager().run(probe),{code:'PROBE_REFRESH_UNCERTAIN'});
    await assert.rejects(()=>manager().run(probe),{code:'PROBE_RECOVERY_REQUIRED'});assert.equal(probes,3);
    const revision=Number((await directory.query('SELECT revision FROM roomqc_control.probe_credentials')).rows[0].revision);
    const recovered=toBundle(await call('/token?grant_type=password',{email:'canary-'+run+'@roomqc.invalid',password}));
    assert.ok(recovered.auth.userId===bundle.auth.userId,'Recovery may not create another canary');
    await installer.install(binding,recovered,{expectedRevision:revision});assert.equal((await manager().run(probe)).result,true);
    const authUrl=new URL(admin.options.connectionString);authUrl.pathname='/auth_fixture';
    const authDb=new pg.Pool({connectionString:authUrl.href,max:1});
    try{assert.equal(Number((await authDb.query('SELECT count(*) FROM auth.users')).rows[0].count),1,'No user accumulation')}
    finally{await authDb.end()}
  });

test('probe disable lifecycle: a real successful Auth response is fenced after installer disable; Auth JWT validity is not directory authority',
  {skip:!enabled,timeout:30000},async()=>{
    const manager=()=>new ProbeSessionManager({store,config,cluster,expected:binding.expected});
    let enter,release,timer;const entered=new Promise(resolve=>{enter=resolve}),held=new Promise(resolve=>{release=resolve});
    let actualResponse=false,probeCalls=0,active;
    const pending=manager().run(async settings=>{
      probeCalls++;
      const response=await fetch(cluster.url+'/auth/v1/user',{signal:AbortSignal.timeout(5000),
        headers:{apikey:settings.credential.publishableKey,authorization:'Bearer '+settings.auth.token}});
      assert.equal(response.status,200);const found=await response.json();assert.equal(found.id,user.id);
      actualResponse=true;enter();await held;return true;
    }).then(value=>({value}),error=>({code:error.code}));
    try{
      await Promise.race([entered,new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error('Real Auth response overlap not observed')),15000)})]);
      assert.equal(actualResponse,true);
      // An independent connection can acquire the directory lock while a real
      // response is held. No PG transaction spans this remote collection.
      const check=await directory.connect();
      try{await check.query('BEGIN');assert.equal((await check.query('SELECT pg_try_advisory_xact_lock(727001) AS acquired')).rows[0].acquired,true)}
      finally{await check.query('ROLLBACK');check.release()}
      const row=(await directory.query('SELECT * FROM roomqc_control.probe_credentials')).rows[0];
      active=store.keyring.unseal(row.envelope,{clusterId:binding.clusterId,credentialRef:binding.credentialRef,
        bindingHash:binding.bindingHash,revision:Number(row.revision)});
      const revision=Number(row.revision);
      const disabled=await new ProbeCredentialStore(installer.pool,null).disable(binding,{expectedRevision:revision});
      assert.equal(disabled.revision,revision+1);assert.equal(disabled.state,'disabled');
      release();assert.deepEqual(await pending,{code:'PROBE_RESULT_FENCED'});
      const beforeRequests=refreshRequests;
      await assert.rejects(()=>manager().run(()=>assert.fail('Disabled canary must not collect')),{code:'PROBE_CREDENTIAL_DISABLED'});
      assert.equal(refreshRequests,beforeRequests);assert.equal(probeCalls,1);
      // Deliberately no Auth logout occurred. The still-unexpired vendor JWT
      // remains usable at Auth, while directory health authority is disabled.
      const claims=JSON.parse(Buffer.from(active.auth.token.split('.')[1],'base64url'));
      assert.ok(claims.exp*1000-Date.now()>30000,'Old token must still be unexpired for this control');
      const oldUser=await call('/user',undefined,active.auth.token);assert.equal(oldUser.id,user.id);
      await assert.rejects(()=>installer.install(binding,active,{expectedRevision:disabled.revision}),{code:'PROBE_NEW_SESSION_REQUIRED'});
      const fresh=toBundle(await call('/token?grant_type=password',{email:'canary-'+run+'@roomqc.invalid',password}));
      assert.equal(fresh.auth.userId,active.auth.userId);assert.notEqual(fresh.auth.sessionId,active.auth.sessionId);
      await installer.install(binding,fresh,{expectedRevision:disabled.revision});
      const recovered=await manager().run(async settings=>{
        const response=await call('/user',undefined,settings.auth.token);return response.id===user.id;
      });assert.equal(recovered.result,true);
      const events=(await directory.query("SELECT before_state,after_state FROM roomqc_control.cluster_events WHERE type='probe_credentials_disabled'")).rows;
      assert.equal(events.length,1);assert.equal(events[0].after_state.revision,disabled.revision);
      assert.ok(!JSON.stringify(events).includes(active.auth.token));assert.ok(!JSON.stringify(events).includes(active.auth.userId));
    }finally{clearTimeout(timer);release();await pending}
  });
