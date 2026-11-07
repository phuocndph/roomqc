import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {ProbeKeyring} from './probe-secrets.mjs';
import {ProbeCredentialStore,probeBinding} from './probe-credentials.mjs';
import {ProbeSessionManager} from './probe-session.mjs';
import {syntheticBundle,syntheticRelease} from './probe-test-fixtures.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r});return {promise,resolve}};
export function registerProbeCredentialCases({dbtest,database,password,cluster}){
  let serial=0;
  async function fixture(label){
    const {pool,url}=await database(label);await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool,'cluster-a',{probeSeed:false});
    const binding=probeBinding(cluster,syntheticRelease),keyring=new ProbeKeyring({activeKeyId:'key-one',keys:new Map([['key-one',randomBytes(32)]])});
    const role='probe_runtime_'+(++serial),installer=role+'_installer';
    await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}';GRANT roomqc_control_probe_runtime TO ${role};
      CREATE ROLE ${installer} LOGIN PASSWORD '${password}';GRANT roomqc_control_probe_installer TO ${installer};`);
    const runtimeUrl=new URL(url);runtimeUrl.username=role;const installerUrl=new URL(url);installerUrl.username=installer;
    const runtime=new pg.Pool({connectionString:runtimeUrl.href,max:4,statement_timeout:4000,lock_timeout:2000});
    const installPool=new pg.Pool({connectionString:installerUrl.href,max:2,statement_timeout:4000,lock_timeout:2000});
    const store=new ProbeCredentialStore(runtime,keyring),writer=new ProbeCredentialStore(installPool,keyring);
    const row=async()=>(await pool.query('SELECT * FROM roomqc_control.probe_credentials')).rows[0];
    return {pool,url,store,writer,binding,keyring,runtime,row,close:async()=>{await Promise.all([runtime.end(),installPool.end()])}};
  }
  dbtest('probe credentials DB: least privilege, encrypted persistence, immutable canary and atomic audit',async()=>{
    const f=await fixture('probe_secrets_grants');
    try{
      const bundle=syntheticBundle();await f.writer.install(f.binding,bundle,{expectedRevision:0});
      assert.equal((await f.store.readiness()).schemaVersion,(await migrationManifest()).at(-1).version);
      await assert.rejects(()=>f.writer.readiness(),{code:'PROBE_RUNTIME_PRIVILEGES'});
      await assert.rejects(()=>new ProbeCredentialStore(f.pool,f.keyring).readiness(),{code:'PROBE_RUNTIME_PRIVILEGES'});
      const row=await f.row();assert.equal(row.revision,'1');assert.equal(row.state,'ready');
      const serialized=JSON.stringify(row);assert.ok(!serialized.includes(bundle.auth.refreshToken));assert.ok(!serialized.includes(bundle.auth.token));
      assert.deepEqual((await f.store.acquire(f.binding)).bundle,bundle);
      for(const role of ['roomqc_control_api','roomqc_control_worker','roomqc_control_metrics']){
        const privileges=(await f.pool.query(`SELECT has_table_privilege($1,'roomqc_control.probe_credentials','SELECT,INSERT,UPDATE,DELETE')
          OR has_column_privilege($1,'roomqc_control.probe_credentials','envelope','SELECT')
          OR has_column_privilege($1,'roomqc_control.probe_credentials','auth_user_id','SELECT')
          OR has_column_privilege($1,'roomqc_control.probe_credentials','auth_session_id','SELECT')
          OR has_any_column_privilege($1,'roomqc_control.probe_credentials','INSERT,UPDATE') AS allowed`,[role])).rows[0];
        assert.equal(privileges.allowed,false,role+' must not see/modify ciphertext');
      }
      for(const query of ["SELECT * FROM roomqc_control.workspaces","DELETE FROM roomqc_control.probe_credentials",
        "UPDATE roomqc_control.probe_credentials SET binding_hash=repeat('0',64)","UPDATE roomqc_control.cluster_events SET source='tampered'",
        "UPDATE roomqc_control.clusters SET credential_ref='other'","CREATE TABLE roomqc_control.probe_unwanted(id int)"]){
        await assert.rejects(()=>f.runtime.query(query),{code:'42501'});
      }
      await assert.rejects(()=>f.store.install(f.binding,bundle,{expectedRevision:1}),{code:'42501'});
      await assert.rejects(()=>f.writer.install(f.binding,bundle,{expectedRevision:0}),{code:'PROBE_REVISION_CONFLICT'});
      await assert.rejects(()=>f.writer.install(f.binding,syntheticBundle(),{expectedRevision:1}),{code:'PROBE_CANARY_IDENTITY_CHANGED'});
      assert.equal((await f.row()).revision,'1');
      const events=(await f.pool.query("SELECT type,before_state,after_state FROM roomqc_control.cluster_events WHERE source='probe_credentials'")).rows;
      assert.equal(events.length,1);assert.deepEqual(events[0].after_state,{revision:1,state:'ready',reasonCode:null});
      assert.ok(!JSON.stringify(events).includes(bundle.auth.userId));assert.ok(!JSON.stringify(events).includes(bundle.auth.refreshToken));
      // If audit cannot be written, seed/rotation is rolled back too.
      await f.pool.query('REVOKE INSERT ON roomqc_control.cluster_events FROM roomqc_control_probe_installer');
      try{await assert.rejects(()=>f.writer.install(f.binding,bundle,{expectedRevision:1}),{code:'42501'})}
      finally{await f.pool.query('GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_probe_installer')}
      assert.equal((await f.row()).revision,'1');
    }finally{await f.close()}
  });
  dbtest('probe disable DB: installer-only, atomic audit, no runtime resurrection and fresh same-user session recovery',async()=>{
    const f=await fixture('probe_disable_authority');
    try{
      const bundle=syntheticBundle();await f.writer.install(f.binding,bundle,{expectedRevision:0});
      const before=await f.row();
      await assert.rejects(()=>f.store.disable(f.binding,{expectedRevision:1}),{code:'PROBE_INSTALLER_REQUIRED',status:403});
      await assert.rejects(()=>f.runtime.query("UPDATE roomqc_control.probe_credentials SET state='disabled',revision=revision+1,reason_code='OPERATOR_DISABLED'"),{code:'42501'});
      for(const type of ['probe_credentials_seeded','probe_credentials_rotated','probe_credentials_disabled']){
        await assert.rejects(()=>f.runtime.query("INSERT INTO roomqc_control.cluster_events(cluster_id,type,source) VALUES($1,$2,'forged')",[cluster.id,type]),{code:'42501'});
      }
      assert.deepEqual(await f.row(),before);
      await f.pool.query('REVOKE INSERT ON roomqc_control.cluster_events FROM roomqc_control_probe_installer');
      try{await assert.rejects(()=>f.writer.disable(f.binding,{expectedRevision:1}),{code:'42501'})}
      finally{await f.pool.query('GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_probe_installer')}
      assert.deepEqual(await f.row(),before,'Failed audit must roll back state, revision and timestamp');
      const disabled=await new ProbeCredentialStore(f.writer.pool,null).disable(f.binding,{expectedRevision:1});
      assert.deepEqual(disabled,{revision:2,state:'disabled',reasonCode:'OPERATOR_DISABLED'});
      const after=await f.row();assert.deepEqual(after.envelope,before.envelope);
      assert.equal(after.auth_session_id,before.auth_session_id);
      await assert.rejects(()=>f.store.acquire(f.binding),{code:'PROBE_CREDENTIAL_DISABLED'});
      await assert.rejects(()=>f.store.assertCurrent(f.binding,1),{code:'PROBE_RESULT_FENCED'});
      await assert.rejects(()=>f.store.disable(f.binding,{expectedRevision:2}),{code:'PROBE_INSTALLER_REQUIRED'});
      await assert.rejects(()=>f.writer.disable(f.binding,{expectedRevision:1}),{code:'PROBE_REVISION_CONFLICT'});
      assert.deepEqual(await f.writer.disable(f.binding,{expectedRevision:2}),disabled);
      assert.deepEqual(await f.row(),after,'Authorized retry at current revision is a no-op');
      for(const query of [
        "UPDATE roomqc_control.probe_credentials SET state='ready',reason_code=NULL,revision=revision+1",
        "UPDATE roomqc_control.probe_credentials SET state='needs_recovery',reason_code='REFRESH_UNCERTAIN',revision=revision+1",
        "UPDATE roomqc_control.probe_credentials SET revision=revision+1",
        'UPDATE roomqc_control.probe_credentials SET envelope=envelope'
      ])await assert.rejects(()=>f.runtime.query(query),{code:'42501'});
      await assert.rejects(()=>f.store.transaction(client=>f.store.recover(client,f.binding,after,'REFRESH_UNCERTAIN')),{code:'42501'});
      for(const query of [
        "UPDATE roomqc_control.probe_credentials SET state='ready',reason_code=NULL,revision=revision+1",
        "UPDATE roomqc_control.probe_credentials SET state='needs_recovery',reason_code='REFRESH_UNCERTAIN',revision=revision+1"
      ])await assert.rejects(()=>f.writer.pool.query(query),{code:'23514'});
      await assert.rejects(()=>f.writer.install(f.binding,bundle,{expectedRevision:2}),{code:'PROBE_NEW_SESSION_REQUIRED'});
      await assert.rejects(()=>f.writer.install(f.binding,syntheticBundle(),{expectedRevision:2}),{code:'PROBE_CANARY_IDENTITY_CHANGED'});
      assert.deepEqual(await f.row(),after);
      const events=(await f.pool.query("SELECT type,before_state,after_state FROM roomqc_control.cluster_events WHERE type='probe_credentials_disabled'")).rows;
      assert.deepEqual(events,[{type:'probe_credentials_disabled',before_state:{revision:1,state:'ready',reasonCode:null},after_state:disabled}]);
      assert.ok(!JSON.stringify(events).includes(bundle.auth.userId));assert.ok(!JSON.stringify(events).includes(bundle.auth.refreshToken));
      const replacement=syntheticBundle({userId:bundle.auth.userId});
      await f.writer.install(f.binding,replacement,{expectedRevision:2});
      assert.equal((await f.store.acquire(f.binding)).bundle.auth.sessionId,replacement.auth.sessionId);
      assert.equal((await f.row()).revision,'3');
    }finally{await f.close()}
  });
  dbtest('probe disable DB: competing installer rotation is fenced; disable of refreshing or expired credentials requires no secret',async()=>{
    const f=await fixture('probe_disable_race');
    try{
      const bundle=syntheticBundle();await f.writer.install(f.binding,bundle,{expectedRevision:0});
      const outcomes=await Promise.allSettled([f.writer.disable(f.binding,{expectedRevision:1}),
        f.writer.install(f.binding,syntheticBundle({userId:bundle.auth.userId}),{expectedRevision:1})]);
      assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
      assert.equal(outcomes.find(x=>x.status==='rejected').reason.code,'PROBE_REVISION_CONFLICT');
      assert.equal((await f.row()).revision,'2');
      const short=syntheticBundle({userId:bundle.auth.userId,expiresIn:60});
      await f.writer.install(f.binding,short,{expectedRevision:2});
      const claim=await f.store.acquire(f.binding);assert.equal(claim.kind,'refresh');
      assert.equal((await f.writer.disable(f.binding,{expectedRevision:claim.revision})).revision,5);
      await assert.rejects(()=>f.store.complete(f.binding,claim,syntheticBundle({userId:short.auth.userId,sessionId:short.auth.sessionId})),{code:'PROBE_REFRESH_FENCED'});
      await assert.rejects(()=>f.store.fail(f.binding,claim),{code:'PROBE_REFRESH_FENCED'});
      const ready=syntheticBundle({userId:bundle.auth.userId});await f.writer.install(f.binding,ready,{expectedRevision:5});
      await f.pool.query("UPDATE roomqc_control.probe_credentials SET auth_expires_at=clock_timestamp()-interval '1 hour',probe_expires_at=clock_timestamp()-interval '1 hour',envelope='{}'");
      assert.equal((await new ProbeCredentialStore(f.writer.pool,null).disable(f.binding,{expectedRevision:6})).revision,7);
      assert.equal((await f.row()).state,'disabled');
      await assert.rejects(()=>f.store.acquire(f.binding),{code:'PROBE_CREDENTIAL_DISABLED'});
    }finally{await f.close()}
  });
  dbtest('probe disable migration: version8 seeded credentials and checksums survive upgrade; old installer cannot reuse disabled session',async()=>{
    const {pool}=await database('probe_disable_upgrade'),dir=await mkdtemp(join(tmpdir(),'roomqc-probe-upgrade-'));
    try{
      const manifest=await migrationManifest();
      for(const item of manifest.slice(0,8))await writeFile(join(dir,item.version),item.sql);
      await migrateDirectory(pool,{location:pathToFileURL(dir+'/')});await importInitialRegistry(pool,[cluster]);
      await seedOperationalCluster(pool,'cluster-a',{probeSeed:false});
      const keyring=new ProbeKeyring({activeKeyId:'upgrade-key',keys:new Map([['upgrade-key',randomBytes(32)]])});
      const writer=new ProbeCredentialStore(pool,keyring),binding=probeBinding(cluster,syntheticRelease),bundle=syntheticBundle();
      await writer.install(binding,bundle,{expectedRevision:0});
      const before=(await pool.query('SELECT * FROM roomqc_control.probe_credentials')).rows;
      const history=(await pool.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version')).rows;
      const result=await migrateDirectory(pool);assert.deepEqual(result.applied.map(x=>typeof x==='string'?x:x.version),manifest.slice(8).map(x=>x.version));
      assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.probe_credentials')).rows,before);
      assert.deepEqual((await pool.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version')).rows.slice(0,8),history);
      assert.equal((await migrateDirectory(pool)).applied.length,0);
      await writer.disable(binding,{expectedRevision:1});
      await assert.rejects(()=>pool.query("UPDATE roomqc_control.probe_credentials SET state='ready',revision=revision+1,reason_code=NULL"),{code:'23514'});
      for(const sql of ["UPDATE roomqc_control.probe_credentials SET state='needs_recovery',reason_code=NULL",
        "UPDATE roomqc_control.probe_credentials SET reason_code=NULL"]){await assert.rejects(()=>pool.query(sql),{code:'23514'})}
      const fresh=syntheticBundle({userId:bundle.auth.userId});await writer.install(binding,fresh,{expectedRevision:2});
      assert.equal((await writer.acquire(binding)).bundle.auth.sessionId,fresh.auth.sessionId);
    }finally{await rm(dir,{recursive:true,force:true})}
  });
  dbtest('probe credentials DB: competing workers refresh once without retaining a transaction during HTTP',async()=>{
    const f=await fixture('probe_refresh_race');
    try{
      const bundle=syntheticBundle({expiresIn:60});await f.writer.install(f.binding,bundle,{expectedRevision:0});
      let requests=0,probes=0;const entered=deferred(),release=deferred();
      const fetcher=async()=>{
        requests++;entered.resolve();await release.promise;
        const next=syntheticBundle({userId:bundle.auth.userId,sessionId:bundle.auth.sessionId});
        return {ok:true,json:async()=>({access_token:next.auth.token,refresh_token:next.auth.refreshToken,
          user:{id:bundle.auth.userId,email_confirmed_at:'confirmed'}})};
      };
      const manager=()=>new ProbeSessionManager({store:f.store,config:{},cluster,expected:syntheticRelease,fetcher});
      const winner=manager().run(async settings=>{
        probes++;assert.deepEqual(Object.keys(settings.auth).sort(),['token','userId']);assert.equal(settings.auth.refreshToken,undefined);return 'healthy';
      });
      await entered.promise;
      // Prove a separate connection can get the exact lock while HTTP is held.
      const lock=await f.pool.connect();try{await lock.query('BEGIN');
        assert.equal((await lock.query('SELECT pg_try_advisory_xact_lock(727001) AS acquired')).rows[0].acquired,true);
      }finally{await lock.query('ROLLBACK');lock.release()}
      const results=await Promise.allSettled(Array.from({length:8},()=>manager().run(()=>{throw new Error('loser must not probe')})));
      assert.ok(results.every(r=>r.status==='rejected'&&r.reason.code==='PROBE_REFRESH_BUSY'));assert.equal(requests,1);
      release.resolve();const result=await winner;assert.equal(result.result,'healthy');assert.equal(result.credentialRevision,3);assert.equal(probes,1);
      const next=await f.store.acquire(f.binding);assert.equal(next.kind,'ready');assert.notEqual(next.bundle.auth.refreshToken,bundle.auth.refreshToken);
      const restarted=new ProbeCredentialStore(f.runtime,f.keyring);assert.equal((await restarted.acquire(f.binding)).revision,3);
      assert.deepEqual((await f.pool.query("SELECT type FROM roomqc_control.cluster_events WHERE source='probe_credentials' ORDER BY id")).rows.map(r=>r.type),
        ['probe_credentials_seeded','probe_refresh_claimed','probe_refresh_completed']);
    }finally{await f.close()}
  });
  dbtest('probe credentials DB: lost response/crash quarantines token, no lease stealing; same-user recovery is explicit',async()=>{
    const f=await fixture('probe_refresh_recovery');
    try{
      const bundle=syntheticBundle({expiresIn:60});await f.writer.install(f.binding,bundle,{expectedRevision:0});let requests=0;
      const manager=new ProbeSessionManager({store:f.store,config:{},cluster,expected:syntheticRelease,
        fetcher:async()=>{requests++;throw new Error('provider secret must never escape '+bundle.auth.refreshToken)}});
      await assert.rejects(()=>manager.run(()=>true),{code:'PROBE_REFRESH_UNCERTAIN'});
      assert.equal((await f.row()).state,'needs_recovery');assert.equal((await f.row()).reason_code,'REFRESH_UNCERTAIN');
      await assert.rejects(()=>manager.run(()=>true),{code:'PROBE_RECOVERY_REQUIRED'});assert.equal(requests,1);
      const newSession=syntheticBundle({expiresIn:60,userId:bundle.auth.userId});
      await f.writer.install(f.binding,newSession,{expectedRevision:3});const claim=await f.store.acquire(f.binding);assert.equal(claim.kind,'refresh');
      // Simulate a killed process after its committed claim, not a retryable HTTP failure.
      await f.pool.query("UPDATE roomqc_control.probe_credentials SET lease_until=now()-interval '1 second'");
      const restarted=new ProbeCredentialStore(f.runtime,f.keyring);
      await assert.rejects(()=>restarted.acquire(f.binding),{code:'PROBE_RECOVERY_REQUIRED'});
      const row=await f.row();assert.equal(row.reason_code,'REFRESH_LEASE_EXPIRED');assert.equal(row.revision,'6');
      const late=syntheticBundle({userId:newSession.auth.userId,sessionId:newSession.auth.sessionId});
      await assert.rejects(()=>f.store.complete(f.binding,claim,late),{code:'PROBE_REFRESH_FENCED'});
      const recovered=syntheticBundle({userId:bundle.auth.userId});await f.writer.install(f.binding,recovered,{expectedRevision:6});
      assert.equal((await restarted.acquire(f.binding)).bundle.auth.userId,bundle.auth.userId);
    }finally{await f.close()}
  });
  dbtest('probe credentials DB: installer rotation and binding changes fence in-flight refresh/probe results',async()=>{
    const f=await fixture('probe_refresh_fencing');
    try{
      const bundle=syntheticBundle({expiresIn:60});await f.writer.install(f.binding,bundle,{expectedRevision:0});
      const claim=await f.store.acquire(f.binding),replacement=syntheticBundle({userId:bundle.auth.userId});
      await f.writer.install(f.binding,replacement,{expectedRevision:claim.revision});
      const late=syntheticBundle({userId:bundle.auth.userId,sessionId:bundle.auth.sessionId});
      await assert.rejects(()=>f.store.complete(f.binding,claim,late),{code:'PROBE_REFRESH_FENCED'});
      await assert.rejects(()=>f.store.fail(f.binding,claim),{code:'PROBE_REFRESH_FENCED'});
      assert.equal((await f.store.acquire(f.binding)).bundle.auth.sessionId,replacement.auth.sessionId);
      const manager=new ProbeSessionManager({store:f.store,config:{},cluster,expected:syntheticRelease});
      await assert.rejects(()=>manager.run(async()=>{
        await f.writer.install(f.binding,replacement,{expectedRevision:3});return true;
      }),{code:'PROBE_RESULT_FENCED'});
      const changed=probeBinding(cluster,{...syntheticRelease,artifactDigest:'e'.repeat(64)});
      await assert.rejects(()=>f.store.acquire(changed),{code:'PROBE_TARGET_CHANGED'});
      await f.pool.query("UPDATE roomqc_control.clusters SET credential_ref='new-ref'");
      await assert.rejects(()=>f.store.acquire(f.binding),{code:'PROBE_TARGET_CHANGED'});
    }finally{await f.close()}
  });
  dbtest('probe credentials DB: tampering, missing keys and wrong-session refresh never create a healthy result',async()=>{
    const f=await fixture('probe_secret_corruption');
    try{
      const bundle=syntheticBundle({expiresIn:60});await f.writer.install(f.binding,bundle,{expectedRevision:0});
      const lost=new ProbeCredentialStore(f.runtime,new ProbeKeyring({activeKeyId:'key-other',keys:new Map([['key-other',randomBytes(32)]])}));
      await assert.rejects(()=>lost.acquire(f.binding),{code:'PROBE_KEY_UNAVAILABLE'});assert.equal((await f.row()).revision,'1');
      await f.pool.query("UPDATE roomqc_control.probe_credentials SET binding_hash=repeat('e',64)");
      await assert.rejects(()=>f.store.acquire(f.binding),{code:'PROBE_TARGET_CHANGED'});
      await f.pool.query('UPDATE roomqc_control.probe_credentials SET binding_hash=$1',[f.binding.bindingHash]);
      await f.pool.query('UPDATE roomqc_control.probe_credentials SET revision=2');
      await assert.rejects(()=>f.store.acquire(f.binding),{code:'PROBE_SECRET_INVALID'});
      await f.pool.query('UPDATE roomqc_control.probe_credentials SET revision=1');
      const wrong=syntheticBundle({userId:bundle.auth.userId});let called=false;
      const manager=new ProbeSessionManager({store:f.store,config:{},cluster,expected:syntheticRelease,fetcher:async()=>({ok:true,json:async()=>({
        access_token:wrong.auth.token,refresh_token:wrong.auth.refreshToken,user:{id:bundle.auth.userId,email_confirmed_at:'confirmed'}})})});
      await assert.rejects(()=>manager.run(()=>{called=true;return true}),{code:'PROBE_REFRESH_UNCERTAIN'});assert.equal(called,false);
      assert.equal((await f.row()).state,'needs_recovery');
    }finally{await f.close()}
  });
  dbtest('probe credentials DB: explicit key rotation re-encrypts without changing identity or invoking Auth',async()=>{
    const f=await fixture('probe_secret_key_rotation');
    try{
      const bundle=syntheticBundle();await f.writer.install(f.binding,bundle,{expectedRevision:0});
      const before=await f.store.acquire(f.binding),ring=new ProbeKeyring({activeKeyId:'key-next',keys:new Map([['key-next',randomBytes(32)]])});
      const nextWriter=new ProbeCredentialStore(f.writer.pool,ring),nextRuntime=new ProbeCredentialStore(f.runtime,ring);
      await nextWriter.install(f.binding,before.bundle,{expectedRevision:1});
      const after=await nextRuntime.acquire(f.binding);assert.equal(after.revision,2);assert.deepEqual(after.bundle,bundle);
      assert.equal((await f.row()).envelope.keyId,'key-next');
      await assert.rejects(()=>f.store.acquire(f.binding),{code:'PROBE_KEY_UNAVAILABLE'});
      await assert.rejects(()=>f.store.assertCurrent(f.binding,1),{code:'PROBE_RESULT_FENCED'});
    }finally{await f.close()}
  });
  dbtest('probe credentials DB: shutdown after committed claim quarantines without HTTP or probes; database deadline rolls back',async()=>{
    const f=await fixture('probe_abort_timeout');
    try{
      const bundle=syntheticBundle({expiresIn:60});await f.writer.install(f.binding,bundle,{expectedRevision:0});
      const controller=new AbortController();let requests=0,probes=0;
      const interrupted={acquire:async binding=>{const claim=await f.store.acquire(binding);controller.abort();return claim},
        fail:(...args)=>f.store.fail(...args)};
      const manager=new ProbeSessionManager({store:interrupted,config:{},cluster,expected:syntheticRelease,fetcher:async()=>{requests++}});
      await assert.rejects(()=>manager.run(()=>{probes++},{signal:controller.signal}),{code:'PROBE_REFRESH_UNCERTAIN'});
      assert.equal(requests,0);assert.equal(probes,0);assert.equal((await f.row()).state,'needs_recovery');
      const recovered=syntheticBundle({userId:bundle.auth.userId});await f.writer.install(f.binding,recovered,{expectedRevision:3});
      const blocker=await f.pool.connect();
      try{
        await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(727001)');
        const impatient=new ProbeCredentialStore(f.runtime,f.keyring,{transactionTimeoutMs:50});
        await assert.rejects(()=>impatient.acquire(f.binding),{code:'PROBE_DATABASE_TIMEOUT'});
      }finally{await blocker.query('ROLLBACK');blocker.release()}
      assert.equal((await f.row()).revision,'4');assert.equal((await f.store.acquire(f.binding)).kind,'ready');
    }finally{await f.close()}
  });
}
