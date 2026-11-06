import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {fork} from 'node:child_process';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {ReleaseApprovalTrust,releaseApprovalSigningBytes,releaseApprovalEndpointFingerprint} from './release-approval.mjs';
import {ReleaseApprovalStore,assertReleaseAuthority} from './release-authority.mjs';

const options=(expectedVersion,more={})=>({expectedVersion,key:randomUUID(),requestId:randomUUID(),reason:'Owned approval fixture',...more});
export function registerReleaseAuthorityCases({dbtest,database,password,cluster}){
  let serial=0;
  async function fixture(label){
    const {pool,url}=await database(label);
    await migrateDirectory(pool);
    await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool,'cluster-a',{approvalSeed:false});
    const role='release_fixture_'+(++serial),installer=role+'_installer';
    await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api;
      CREATE ROLE ${installer} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_release_installer`);
    const runtimeUrl=new URL(url);runtimeUrl.username=role;const installerUrl=new URL(url);installerUrl.username=installer;
    const runtime=new pg.Pool({connectionString:runtimeUrl.href,max:3,application_name:role});
    const installPool=new pg.Pool({connectionString:installerUrl.href,max:2,application_name:installer});
    const pair=generateKeyPairSync('ed25519');
    const trust=new ReleaseApprovalTrust({version:1,keys:[{issuerId:'fixture-issuer',keyId:'fixture-key',
      publicKey:pair.publicKey.export({format:'jwk'}),environments:['local']}]},{maximumValidityMs:3600000});
    const context={inventoryRef:cluster.id,clusterId:cluster.id,hostId:cluster.id,environment:'local',expected:syntheticRelease,
      endpointFingerprint:releaseApprovalEndpointFingerprint({url:cluster.url,internalUrl:null,approvedAddresses:[],credentialRef:cluster.id})};
    const envelope=(epoch=1,delta={})=>{
      const unsigned={version:1,algorithm:'Ed25519',issuerId:'fixture-issuer',keyId:'fixture-key',
        payload:{approvalId:randomUUID(),epoch,...context,notBefore:Date.now()-10000,expiresAt:Date.now()+600000,...delta}};
      return {...unsigned,signature:sign(null,releaseApprovalSigningBytes(unsigned),pair.privateKey).toString('base64url')};
    };
    const writer=new ReleaseApprovalStore(installPool,trust),api=new ReleaseApprovalStore(runtime,trust);
    const snapshot=async()=>({
      approvals:(await pool.query('SELECT * FROM roomqc_control.release_approvals ORDER BY approval_id')).rows,
      authority:(await pool.query('SELECT * FROM roomqc_control.release_authority ORDER BY cluster_id')).rows,
      commands:(await pool.query('SELECT * FROM roomqc_control.release_commands ORDER BY id')).rows,
      events:(await pool.query("SELECT * FROM roomqc_control.cluster_events WHERE source='release_approval' ORDER BY id")).rows,
      policies:(await pool.query('SELECT * FROM roomqc_control.cluster_policies ORDER BY cluster_id')).rows,
      workspaces:(await pool.query('SELECT * FROM roomqc_control.workspaces ORDER BY id')).rows,
    });
    return {pool,runtime,runtimeUrl:runtimeUrl.href,installPool,writer,api,trust,context,envelope,snapshot,
      verify:e=>trust.verify(e,context),close:()=>Promise.all([runtime.end(),installPool.end()])};
  }
  dbtest('release authority DB: upgrade from nine preserves data/checksums and repeat migration has no effects',async()=>{
    const {pool}=await database('release_upgrade');
    const manifest=await migrationManifest(),temp=await mkdtemp(join(tmpdir(),'roomqc-release-v9-'));
    try{
      assert.equal(manifest[9].version,'0010-release-approval-authority.sql');
      for(const item of manifest.slice(0,9))await writeFile(join(temp,item.version),item.sql);
      await migrateDirectory(pool,{location:pathToFileURL(temp+'/')});
    }finally{await rm(temp,{recursive:true})}
    await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool,'cluster-a',{approvalSeed:false});
    const before=(await pool.query('SELECT * FROM roomqc_control.clusters ORDER BY id')).rows;
    const policies=(await pool.query('SELECT * FROM roomqc_control.cluster_policies ORDER BY cluster_id')).rows;
    const history=(await pool.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version')).rows;
    assert.deepEqual((await migrateDirectory(pool)).applied,manifest.slice(9).map(item=>item.version));
    assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.clusters ORDER BY id')).rows,before);
    assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.cluster_policies ORDER BY cluster_id')).rows,policies);
    assert.deepEqual((await pool.query('SELECT version,checksum FROM roomqc_control.schema_migrations ORDER BY version LIMIT 9')).rows,history);
    assert.equal((await pool.query('SELECT * FROM roomqc_control.release_authority')).rowCount,0);
    assert.deepEqual((await migrateDirectory(pool)).applied,[]);
  });
  dbtest('release authority DB: separate installer, protected history and audit; API can only withdraw',async()=>{
    const f=await fixture('release_grants');
    try{
      const e=f.envelope();
      await assert.rejects(()=>f.api.install(e,f.context,options(0)),{code:'42501'});
      const installed=await f.writer.install(e,f.context,options(0));assert.equal(installed.state,'active');
      assert.equal(installed.epoch,1);assert.equal(installed.version,1);
      await f.api.transaction(c=>assertReleaseAuthority(c,f.verify(e)));
      const unlocked=await f.runtime.connect();
      try{await assert.rejects(()=>assertReleaseAuthority(unlocked,f.verify(e)),{code:'RELEASE_APPROVAL_NOT_CURRENT'})}
      finally{unlocked.release()}
      for(const statement of [
        'INSERT INTO roomqc_control.release_authority SELECT * FROM roomqc_control.release_authority',
        "UPDATE roomqc_control.release_authority SET state='active',epoch=1",
        'DELETE FROM roomqc_control.release_approvals','TRUNCATE roomqc_control.release_commands',
        "INSERT INTO roomqc_control.cluster_events(cluster_id,type,source) VALUES('cluster-a','release_approval_installed','forged')",
        "INSERT INTO roomqc_control.cluster_events(cluster_id,type,source) VALUES('cluster-a','unrelated','release_approval')",
        'SET ROLE roomqc_control_release_writer',
      ])await assert.rejects(()=>f.runtime.query(statement),{code:'42501'});
      for(const runtimeRole of ['roomqc_control_worker','roomqc_control_metrics','roomqc_control_probe_runtime','roomqc_control_probe_installer']){
        const access=(await f.pool.query(`SELECT has_function_privilege($1,
          'roomqc_control.release_approval_command(text,text,bigint,uuid,text,uuid,jsonb)','EXECUTE') AS command,
          has_any_column_privilege($1,'roomqc_control.release_authority','INSERT,UPDATE') AS authority,
          has_table_privilege($1,'roomqc_control.release_commands','SELECT,INSERT,UPDATE,DELETE') AS receipts`,[runtimeRole])).rows[0];
        assert.deepEqual(access,{command:false,authority:false,receipts:false});
      }
      await assert.rejects(()=>f.installPool.query("UPDATE roomqc_control.release_authority SET state='withdrawn'"),{code:'42501'});
      await assert.rejects(()=>f.installPool.query('CREATE TABLE roomqc_control.forbidden_release(id int)'),{code:'42501'});
      const withdrawn=await f.api.withdraw(cluster.id,e.payload.approvalId,options(1));assert.equal(withdrawn.state,'withdrawn');
      assert.equal(withdrawn.epoch,2);assert.equal(withdrawn.version,2);
      await assert.rejects(()=>f.api.transaction(c=>assertReleaseAuthority(c,f.verify(e))),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      const s=await f.snapshot();assert.equal(s.events.length,2);assert.equal(s.commands.length,2);
      assert.equal(s.policies[0].manual_closed,true);assert.equal(s.policies[0].operator_reopen_required,true);
      const forbidden=['signature','privateKey','serviceKey','refreshToken','ciphertext'];
      for(const field of forbidden)assert.ok(!JSON.stringify(s).includes('"'+field+'"'));
    }finally{await f.close()}
  });
  dbtest('release authority DB: stable replay, actor-scoped receipt, increasing epoch and no resurrection after withdrawal',async()=>{
    const f=await fixture('release_replay');
    try{
      const e=f.envelope(),install=options(0),first=await f.writer.install(e,f.context,install),snapshot=await f.snapshot();
      assert.deepEqual(await f.writer.install(e,f.context,{...install,requestId:randomUUID()}),{...first,replayed:true});
      assert.deepEqual(await f.snapshot(),snapshot);assert.deepEqual(await f.writer.receipt(install.key),Object.fromEntries(Object.entries(first).filter(([k])=>k!=='replayed')));
      await assert.rejects(()=>f.api.receipt(install.key),{code:'RELEASE_APPROVAL_RESULT_UNKNOWN',status:404});
      await assert.rejects(()=>f.writer.install(e,f.context,{...install,reason:'Different command content'}),{code:'RELEASE_APPROVAL_IDEMPOTENCY_CONFLICT'});
      const revoke=options(1);await f.api.withdraw(cluster.id,e.payload.approvalId,revoke);
      const next=f.envelope(3),second=await f.writer.install(next,f.context,options(2));assert.equal(second.epoch,3);
      const after=await f.snapshot();
      assert.deepEqual(await f.writer.install(e,f.context,install),{...first,replayed:true});
      assert.equal((await f.api.withdraw(cluster.id,e.payload.approvalId,revoke)).replayed,true);
      assert.deepEqual(await f.snapshot(),after);
      await assert.rejects(()=>f.writer.install(f.envelope(2),f.context,options(3)),{code:'RELEASE_APPROVAL_INSTALL_INVALID'});
      await assert.rejects(()=>f.writer.install(f.envelope(4,{approvalId:e.payload.approvalId}),f.context,options(3)),{code:'RELEASE_APPROVAL_ID_REUSED'});
      await assert.rejects(()=>f.api.withdraw(cluster.id,next.payload.approvalId,options(2)),{code:'RELEASE_APPROVAL_VERSION_CONFLICT'});
      await f.api.transaction(c=>assertReleaseAuthority(c,f.verify(next)));
      await assert.rejects(()=>f.api.transaction(c=>assertReleaseAuthority(c,f.verify(e))),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await f.snapshot(),after);
    }finally{await f.close()}
  });
  dbtest('release authority DB: audit failure rolls back installation, withdrawal, gates, commands and history',async()=>{
    const f=await fixture('release_atomic');
    try{
      const e=f.envelope(),before=await f.snapshot(),install=options(0);
      await f.pool.query('REVOKE INSERT ON roomqc_control.cluster_events FROM roomqc_control_release_writer');
      try{await assert.rejects(()=>f.writer.install(e,f.context,install),{code:'42501'})}
      finally{await f.pool.query('GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_release_writer')}
      assert.deepEqual(await f.snapshot(),before);
      await f.writer.install(e,f.context,install);const active=await f.snapshot(),revoke=options(1);
      await f.pool.query('REVOKE INSERT ON roomqc_control.cluster_events FROM roomqc_control_release_writer');
      try{await assert.rejects(()=>f.api.withdraw(cluster.id,e.payload.approvalId,revoke),{code:'42501'})}
      finally{await f.pool.query('GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_release_writer')}
      assert.deepEqual(await f.snapshot(),active);
      await f.api.withdraw(cluster.id,e.payload.approvalId,revoke);
    }finally{await f.close()}
  });
  dbtest('release authority DB: competing withdrawals actually queue on shared lock and only one version wins',async()=>{
    const f=await fixture('release_concurrent');let blocker;
    try{
      const e=f.envelope();await f.writer.install(e,f.context,options(0));
      blocker=await f.pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(727001)');
      const pending=Promise.allSettled([f.api.withdraw(cluster.id,e.payload.approvalId,options(1)),
        f.writer.withdraw(cluster.id,e.payload.approvalId,options(1))]);
      let overlapped=false;
      try{
        for(let i=0;i<80;i++){
          const waiting=await f.pool.query(`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=727001 AND NOT granted
            AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
          if(Number(waiting.rows[0].count)>=2){overlapped=true;break}
          await new Promise(r=>setTimeout(r,10));
        }
      }finally{await blocker.query('COMMIT');blocker.release();blocker=null}
      const results=await pending;assert.equal(overlapped,true);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'RELEASE_APPROVAL_VERSION_CONFLICT');
      const s=await f.snapshot();assert.equal(s.commands.length,2);assert.equal(s.events.length,2);assert.equal(s.authority[0].epoch,'2');
    }finally{if(blocker){await blocker.query('ROLLBACK');blocker.release()}await f.close()}
  });
  dbtest('release authority DB: database clock rejects future/expired installs and expiry while waiting for lock',async()=>{
    const f=await fixture('release_clock');let blocker;
    try{
      const now=Date.now(),before=await f.snapshot();
      for(const e of [f.envelope(1,{notBefore:now+60000,expiresAt:now+120000}),
        f.envelope(1,{notBefore:now-60000,expiresAt:now-10000})]){
        await assert.rejects(()=>f.writer.install(e,f.context,options(0)),{code:'RELEASE_APPROVAL_INSTALL_INVALID'});
      }
      assert.deepEqual(await f.snapshot(),before);
      const e=f.envelope(1,{expiresAt:Date.now()+700});
      blocker=await f.pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(727001)');
      const pending=f.writer.install(e,f.context,options(0));const settled=Promise.allSettled([pending]);
      await f.pool.query('SELECT pg_sleep(0.9)');await blocker.query('COMMIT');blocker.release();blocker=null;
      const [result]=await settled;assert.equal(result.status,'rejected');assert.equal(result.reason.code,'RELEASE_APPROVAL_INSTALL_INVALID');
      assert.deepEqual(await f.snapshot(),before);
    }finally{if(blocker){await blocker.query('ROLLBACK');blocker.release()}await f.close()}
  });
  dbtest('release authority DB: process with cached proof and restarted old configuration cannot bypass withdrawal',async()=>{
    const f=await fixture('release_process');let child;
    const start=()=>{
      child=fork(new URL('./testing/release-authority-process.mjs',import.meta.url),[],{stdio:['ignore','ignore','ignore','ipc']});
      const pending=[];child.on('message',m=>pending.shift()?.resolve(m));
      const exit=new Promise(resolve=>child.once('exit',code=>{for(const p of pending)p.reject(new Error('Owned authority child exited'));resolve(code)}));
      const ask=message=>new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(new Error('Owned authority child response timeout')),10000);
        pending.push({resolve:m=>{clearTimeout(timer);resolve(m)},reject:e=>{clearTimeout(timer);reject(e)}});child.send(message);
      });
      return {ask,exit};
    };
    try{
      const e=f.envelope();await f.writer.install(e,f.context,options(0));const proof=f.verify(e);
      let p=start();assert.deepEqual(await p.ask({operation:'init',url:f.runtimeUrl,proof}),{ready:true});
      assert.deepEqual(await p.ask({operation:'check'}),{allowed:true});
      await f.api.withdraw(cluster.id,e.payload.approvalId,options(1));const before=await f.snapshot();
      assert.deepEqual(await p.ask({operation:'check'}),{allowed:false,code:'RELEASE_APPROVAL_NOT_CURRENT'});
      await p.ask({operation:'close'});assert.equal(await p.exit,0);child=null;
      p=start();assert.deepEqual(await p.ask({operation:'init',url:f.runtimeUrl,proof}),{ready:true});
      assert.deepEqual(await p.ask({operation:'check'}),{allowed:false,code:'RELEASE_APPROVAL_NOT_CURRENT'});
      await p.ask({operation:'close'});assert.equal(await p.exit,0);child=null;
      assert.deepEqual(await f.snapshot(),before);
    }finally{if(child)child.kill();await f.close()}
  });
  dbtest('release authority DB: live host/inventory binding changes fence cached proof without altering authority',async()=>{
    const f=await fixture('release_live_binding');
    try{
      const e=f.envelope();await f.writer.install(e,f.context,options(0));const proof=f.verify(e),before=await f.snapshot();
      await f.pool.query("UPDATE roomqc_control.clusters SET inventory_ref='different-inventory' WHERE id=$1",[cluster.id]);
      await assert.rejects(()=>f.api.transaction(c=>assertReleaseAuthority(c,proof)),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      await f.pool.query('UPDATE roomqc_control.clusters SET inventory_ref=id WHERE id=$1',[cluster.id]);
      await f.pool.query("UPDATE roomqc_control.hosts SET environment='staging' WHERE id=$1",[cluster.id]);
      await assert.rejects(()=>f.api.transaction(c=>assertReleaseAuthority(c,proof)),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      await f.pool.query("UPDATE roomqc_control.hosts SET environment='local' WHERE id=$1",[cluster.id]);
      await f.api.transaction(c=>assertReleaseAuthority(c,proof));
      assert.deepEqual(await f.snapshot(),before);
    }finally{await f.close()}
  });
  dbtest('release authority DB: expiry fences cached proof but original command receipt remains an effect-free replay',async()=>{
    const f=await fixture('release_expired_replay');
    try{
      const e=f.envelope(1,{expiresAt:Date.now()+1500}),proof=f.verify(e),install=options(0);
      const receipt=await f.writer.install(e,f.context,install);
      await f.api.transaction(c=>assertReleaseAuthority(c,proof));
      const before=await f.snapshot();await f.pool.query('SELECT pg_sleep(1.7)');
      await assert.rejects(()=>f.api.transaction(c=>assertReleaseAuthority(c,proof)),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      assert.deepEqual(await f.writer.install(e,f.context,install),{...receipt,replayed:true});
      await assert.rejects(()=>f.writer.install(e,f.context,options(1)),{code:'RELEASE_APPROVAL_INSTALL_INVALID'});
      assert.deepEqual(await f.snapshot(),before);
    }finally{await f.close()}
  });
}
