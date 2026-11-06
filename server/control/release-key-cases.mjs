import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';
import {ReleaseApprovalTrust,releaseApprovalSigningBytes} from './release-approval.mjs';
import {ReleaseApprovalStore,assertReleaseAuthority} from './release-authority.mjs';
import {fixtureReleaseContext} from './release-test-fixtures.mjs';

const options=(expectedVersion,more={})=>({expectedVersion,key:randomUUID(),requestId:randomUUID(),reason:'Owned key withdrawal fixture',...more});
export function registerReleaseKeyCases({dbtest,database,password,cluster}){
  let serial=0;
  async function fixture(label,{clusters=[cluster],through}={}){
    const {pool,url}=await database(label);
    if(through){
      const manifest=await migrationManifest(),temp=await mkdtemp(join(tmpdir(),'roomqc-key-upgrade-'));
      try{
        for(const item of manifest.slice(0,through))await writeFile(join(temp,item.version),item.sql);
        await migrateDirectory(pool,{location:pathToFileURL(temp+'/')});
      }finally{await rm(temp,{recursive:true})}
    }else await migrateDirectory(pool);
    await importInitialRegistry(pool,clusters);
    for(const c of clusters)await seedOperationalCluster(pool,c.id,{approvalSeed:false});
    const name='release_key_fixture_'+(++serial),installer=name+'_installer';
    await pool.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api;
      CREATE ROLE ${installer} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_release_installer`);
    const runtimeUrl=new URL(url),installerUrl=new URL(url);runtimeUrl.username=name;installerUrl.username=installer;
    const runtime=new pg.Pool({connectionString:runtimeUrl.href,max:3,application_name:name});
    const installPool=new pg.Pool({connectionString:installerUrl.href,max:2,application_name:installer});
    const pair=generateKeyPairSync('ed25519'),rotated=generateKeyPairSync('ed25519');
    const identities=[['key-issuer','initial-key',pair],['alias-issuer','alias-key',pair],['key-issuer','rotated-key',rotated]];
    const trust=new ReleaseApprovalTrust({version:1,keys:identities.map(([issuerId,keyId,key])=>({issuerId,keyId,
      publicKey:key.publicKey.export({format:'jwk'}),environments:['local']}))},{maximumValidityMs:3600000});
    const contextFor=c=>fixtureReleaseContext(c,{...syntheticRelease,clusterId:c.id});
    const envelope=(c=clusters[0],epoch=1,identity=0)=>{
      const [issuerId,keyId,key]=identities[identity],unsigned={version:1,algorithm:'Ed25519',issuerId,keyId,
        payload:{approvalId:randomUUID(),epoch,...contextFor(c),notBefore:Date.now()-10000,expiresAt:Date.now()+600000}};
      return {...unsigned,signature:sign(null,releaseApprovalSigningBytes(unsigned),key.privateKey).toString('base64url')};
    };
    const verify=e=>trust.verify(e,contextFor(clusters.find(c=>c.id===e.payload.clusterId)));
    const writer=new ReleaseApprovalStore(installPool,trust),api=new ReleaseApprovalStore(runtime,trust);
    const snapshot=async()=>{
      const out={};
      for(const [table,order]of [['release_approvals','approval_id'],['release_authority','cluster_id'],['release_commands','id'],
        ['cluster_events','id'],['cluster_policies','cluster_id'],['cluster_health_current','cluster_id'],['workspaces','id']]){
        out[table]=(await pool.query(`SELECT * FROM roomqc_control.${table} ORDER BY ${order}`)).rows;
      }
      const exists=(await pool.query("SELECT to_regclass('roomqc_control.release_key_revocations') IS NOT NULL AS present")).rows[0].present;
      out.release_key_revocations=exists?(await pool.query('SELECT * FROM roomqc_control.release_key_revocations ORDER BY key_fingerprint')).rows:[];
      return out;
    };
    return {pool,runtime,installPool,writer,api,trust,contextFor,contextForId:id=>contextFor(clusters.find(c=>c.id===id)),envelope,verify,snapshot,
      close:()=>Promise.all([runtime.end(),installPool.end()])};
  }
  const install=(f,e,command=options(0))=>f.writer.install(e,f.contextForId(e.payload.clusterId),command);
  const waiters=async(pool,count)=>{
    for(let i=0;i<100;i++){
      const found=await pool.query(`SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND objid=727001 AND NOT granted
        AND database=(SELECT oid FROM pg_database WHERE datname=current_database())`);
      if(Number(found.rows[0].count)>=count)return;
      await new Promise(resolve=>setTimeout(resolve,10));
    }
    assert.fail('Owned commands did not actually overlap on the shared effect lock');
  };

  dbtest('release authority DB: key withdrawal migration upgrades v10 without rewriting history, approvals or receipts',async()=>{
    const f=await fixture('key_upgrade',{through:10});
    try{
      const e=f.envelope(),command=options(0),receipt=await install(f,e,command),before=await f.snapshot();
      const history=(await f.pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version')).rows;
      assert.deepEqual((await migrateDirectory(f.pool)).applied,(await migrationManifest()).slice(10).map(m=>m.version));
      assert.deepEqual(await f.snapshot(),before);
      assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version LIMIT 10')).rows,history);
      assert.deepEqual(await install(f,e,command),{...receipt,replayed:true});
      assert.deepEqual((await migrateDirectory(f.pool)).applied,[]);
      await f.api.transaction(client=>assertReleaseAuthority(client,f.verify(e)));
    }finally{await f.close()}
  });
  dbtest('release authority DB: key withdrawal covers physical key aliases and multiple clusters, preserves other keys and permits fresh-key recovery',async()=>{
    const b={...cluster,id:'cluster-b'},c={...cluster,id:'cluster-c'},f=await fixture('key_aliases',{clusters:[cluster,b,c]});
    try{
      const aEnvelope=f.envelope(),bEnvelope=f.envelope(b,1,1),cEnvelope=f.envelope(c,1,2);
      const aCommand=options(0),original=await install(f,aEnvelope,aCommand);
      await install(f,bEnvelope);await install(f,cEnvelope);
      const fingerprint=f.verify(aEnvelope).keyFingerprint;
      assert.equal(f.verify(bEnvelope).keyFingerprint,fingerprint);assert.notEqual(f.verify(cEnvelope).keyFingerprint,fingerprint);
      await f.pool.query('UPDATE roomqc_control.cluster_policies SET manual_closed=false,operator_reopen_required=false');
      const command=options(0),result=await f.api.withdrawKey(fingerprint,command);
      assert.equal(result.replayed,false);assert.equal(result.version,1);
      assert.deepEqual(result.affected.map(x=>[x.clusterId,x.epoch,x.version,x.state]),[
        ['cluster-a',2,2,'withdrawn'],['cluster-b',2,2,'withdrawn']]);
      const after=await f.snapshot();
      assert.deepEqual(after.cluster_policies.map(x=>[x.cluster_id,x.manual_closed,x.operator_reopen_required]),[
        ['cluster-a',true,true],['cluster-b',true,true],['cluster-c',false,false]]);
      for(const e of [aEnvelope,bEnvelope])await assert.rejects(()=>f.api.transaction(client=>assertReleaseAuthority(client,f.verify(e))),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      await f.api.transaction(client=>assertReleaseAuthority(client,f.verify(cEnvelope)));
      await assert.rejects(()=>install(f,f.envelope(cluster,3,1),options(2)),{code:'RELEASE_KEY_WITHDRAWN'});
      assert.deepEqual(await f.api.withdrawKey(fingerprint,{...command,requestId:randomUUID()}),{...result,replayed:true});
      assert.deepEqual(await install(f,aEnvelope,aCommand),{...original,replayed:true});
      assert.deepEqual(await f.snapshot(),after);
      assert.equal((await f.api.receipt(command.key)).commandId,result.commandId);
      await assert.rejects(()=>f.writer.receipt(command.key),{code:'RELEASE_APPROVAL_RESULT_UNKNOWN'});
      await assert.rejects(()=>f.api.withdrawKey(fingerprint,{...command,reason:'Changed withdrawal command'}),{code:'RELEASE_APPROVAL_IDEMPOTENCY_CONFLICT'});
      await assert.rejects(()=>f.api.withdrawKey(f.verify(cEnvelope).keyFingerprint,command),{code:'RELEASE_APPROVAL_IDEMPOTENCY_CONFLICT'});
      assert.deepEqual(await f.snapshot(),after);
      const fresh=f.envelope(cluster,3,2);await install(f,fresh,options(2));
      await f.api.transaction(client=>assertReleaseAuthority(client,f.verify(fresh)));
      const recovered=await f.snapshot();assert.equal(recovered.release_key_revocations.length,1);
      assert.equal(recovered.cluster_policies[0].manual_closed,true);assert.equal(recovered.cluster_policies[0].operator_reopen_required,true);
    }finally{await f.close()}
  });
  dbtest('release authority DB: withdrawing an unused key permanently blocks future aliases and redundant commands have no effects',async()=>{
    const f=await fixture('key_future');
    try{
      const e=f.envelope(),fingerprint=f.verify(e).keyFingerprint,command=options(0);
      const result=await f.writer.withdrawKey(fingerprint,command);assert.deepEqual(result.affected,[]);
      const before=await f.snapshot();
      for(const alias of [0,1])await assert.rejects(()=>install(f,f.envelope(cluster,1,alias)),{code:'RELEASE_KEY_WITHDRAWN'});
      await assert.rejects(()=>f.writer.withdrawKey(fingerprint,options(0)),{code:'RELEASE_KEY_VERSION_CONFLICT'});
      await assert.rejects(()=>f.writer.withdrawKey(fingerprint,options(1)),{code:'RELEASE_KEY_ALREADY_WITHDRAWN'});
      for(const bad of [null,'a'.repeat(63),'G'.repeat(64)])await assert.rejects(()=>f.writer.withdrawKey(bad,options(0)),{code:'RELEASE_APPROVAL_COMMAND_INVALID',status:400});
      await assert.rejects(()=>f.writer.withdrawKey(fingerprint,options(2)),{code:'RELEASE_APPROVAL_COMMAND_INVALID',status:400});
      assert.deepEqual(await f.snapshot(),before);
      const fresh=f.envelope(cluster,1,2);await install(f,fresh);
      await f.api.transaction(client=>assertReleaseAuthority(client,f.verify(fresh)));
    }finally{await f.close()}
  });
  dbtest('release authority DB: key-wide audit failure rolls back all clusters and tombstone; runtime cannot mutate, forge or reactivate it',async()=>{
    const b={...cluster,id:'cluster-b'},f=await fixture('key_atomic',{clusters:[cluster,b]});
    try{
      const e=f.envelope();await install(f,e);await install(f,f.envelope(b));
      const fingerprint=f.verify(e).keyFingerprint,command=options(0),before=await f.snapshot();
      await f.pool.query('REVOKE INSERT ON roomqc_control.cluster_events FROM roomqc_control_release_writer');
      try{await assert.rejects(()=>f.api.withdrawKey(fingerprint,command),{code:'42501'})}
      finally{await f.pool.query('GRANT INSERT ON roomqc_control.cluster_events TO roomqc_control_release_writer')}
      assert.deepEqual(await f.snapshot(),before);
      // Fail after earlier cluster updates/audit, then after all cluster work at
      // the receipt boundary. Both must roll back the entire key-wide command.
      for(const boundary of ['cluster_events','release_commands']){
        await f.pool.query(`CREATE FUNCTION roomqc_control.owned_fail_key_command() RETURNS trigger
          LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$ BEGIN
          IF ${boundary==='cluster_events'?"NEW.type='release_key_withdrawn' AND NEW.cluster_id='cluster-b'":"NEW.operation='withdraw_key'"} THEN
            RAISE EXCEPTION USING MESSAGE='OWNED_KEY_COMMAND_INTERRUPTED'; END IF; RETURN NEW; END $$;
          REVOKE ALL ON FUNCTION roomqc_control.owned_fail_key_command() FROM PUBLIC;
          CREATE TRIGGER owned_fail_key_command BEFORE INSERT ON roomqc_control.${boundary}
            FOR EACH ROW EXECUTE FUNCTION roomqc_control.owned_fail_key_command()`);
        try{await assert.rejects(()=>f.api.withdrawKey(fingerprint,command),{message:'OWNED_KEY_COMMAND_INTERRUPTED'})}
        finally{await f.pool.query(`DROP TRIGGER owned_fail_key_command ON roomqc_control.${boundary};
          DROP FUNCTION roomqc_control.owned_fail_key_command()`)}
        assert.deepEqual(await f.snapshot(),before);
      }
      const boundary=(await f.pool.query(`SELECT p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) AS owner,
        EXISTS(SELECT 1 FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
          WHERE a.grantee=0 AND a.privilege_type='EXECUTE') AS public_execute,
        has_schema_privilege('roomqc_control_release_writer','roomqc_control','CREATE') AS writer_create,
        pg_has_role('roomqc_control_api','roomqc_control_release_writer','MEMBER') AS writer_member
        FROM pg_proc p WHERE p.oid='roomqc_control.release_key_withdrawal_command(text,bigint,uuid,text,uuid)'::regprocedure`)).rows[0];
      assert.deepEqual(boundary,{prosecdef:true,proconfig:['search_path=pg_catalog'],owner:'roomqc_control_release_writer',
        public_execute:false,writer_create:false,writer_member:false});
      for(const role of ['roomqc_control_worker','roomqc_control_metrics','roomqc_control_probe_runtime','roomqc_control_probe_installer']){
        const p=(await f.pool.query(`SELECT has_function_privilege($1,
          'roomqc_control.release_key_withdrawal_command(text,bigint,uuid,text,uuid)','EXECUTE') AS execute,
          has_table_privilege($1,'roomqc_control.release_key_revocations','INSERT,UPDATE,DELETE,TRUNCATE') AS write`,[role])).rows[0];
        assert.deepEqual(p,{execute:false,write:false});
      }
      for(const sql of ['UPDATE roomqc_control.release_key_revocations SET revoked_at=clock_timestamp()',
        'DELETE FROM roomqc_control.release_key_revocations','TRUNCATE roomqc_control.release_key_revocations',
        "INSERT INTO roomqc_control.cluster_events(cluster_id,type,source) VALUES('cluster-a','release_key_withdrawn','forged')"]){
        await assert.rejects(()=>f.runtime.query(sql),{code:'42501'});
      }
      const result=await f.api.withdrawKey(fingerprint,command);assert.equal(result.affected.length,2);
      const after=await f.snapshot();
      for(const sql of ['UPDATE roomqc_control.release_key_revocations SET revoked_at=clock_timestamp()',
        'DELETE FROM roomqc_control.release_key_revocations','TRUNCATE roomqc_control.release_key_revocations']){
        await assert.rejects(()=>f.pool.query(sql),{code:'42501',message:'RELEASE_KEY_REVOCATION_IMMUTABLE'});
      }
      // Even a damaged active-state projection must fail against the tombstone.
      await f.pool.query("UPDATE roomqc_control.release_authority SET state='active',epoch=1 WHERE cluster_id='cluster-a'");
      await assert.rejects(()=>f.api.transaction(client=>assertReleaseAuthority(client,f.verify(e))),{code:'RELEASE_APPROVAL_NOT_CURRENT'});
      await f.pool.query("UPDATE roomqc_control.release_authority SET state='withdrawn',epoch=2 WHERE cluster_id='cluster-a'");
      assert.deepEqual((await f.snapshot()).release_key_revocations,after.release_key_revocations);
    }finally{await f.close()}
  });
  dbtest('release authority DB: install and key-wide withdrawal overlap on the primary lock with no active revoked approval left behind',async()=>{
    const b={...cluster,id:'cluster-b'},f=await fixture('key_install_race',{clusters:[cluster,b]});let blocker;
    try{
      const e=f.envelope();await install(f,e);
      blocker=await f.pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(727001)');
      const commands=Promise.allSettled([install(f,f.envelope(b)),f.api.withdrawKey(f.verify(e).keyFingerprint,options(0))]);
      try{await waiters(f.pool,2)}finally{await blocker.query('COMMIT');blocker.release();blocker=null}
      const [installation,withdrawal]=await commands;assert.equal(withdrawal.status,'fulfilled');
      if(installation.status==='rejected')assert.equal(installation.reason.code,'RELEASE_KEY_WITHDRAWN');
      const after=await f.snapshot();assert.equal(after.release_key_revocations.length,1);
      assert.ok(after.release_authority.every(row=>row.state==='withdrawn'));
      assert.equal(after.release_commands.length,installation.status==='fulfilled'?3:2);
      assert.equal(withdrawal.value.affected.length,installation.status==='fulfilled'?2:1);
    }finally{if(blocker){await blocker.query('ROLLBACK');blocker.release()}await f.close()}
  });
  dbtest('release authority DB: competing key withdrawals have one winner and share the existing caller-scoped command-key namespace',async()=>{
    const f=await fixture('key_revoke_race');let blocker;
    try{
      const e=f.envelope(),installCommand=options(0);await install(f,e,installCommand);const fingerprint=f.verify(e).keyFingerprint;
      await assert.rejects(()=>f.writer.withdrawKey(fingerprint,installCommand),{code:'RELEASE_APPROVAL_IDEMPOTENCY_CONFLICT'});
      blocker=await f.pool.connect();await blocker.query('BEGIN');await blocker.query('SELECT pg_advisory_xact_lock(727001)');
      const commands=Promise.allSettled([f.api.withdrawKey(fingerprint,options(0)),f.writer.withdrawKey(fingerprint,options(0))]);
      try{await waiters(f.pool,2)}finally{await blocker.query('COMMIT');blocker.release();blocker=null}
      const results=await commands;assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.equal(results.find(r=>r.status==='rejected').reason.code,'RELEASE_KEY_VERSION_CONFLICT');
      const after=await f.snapshot();assert.equal(after.release_key_revocations.length,1);assert.equal(after.release_commands.length,2);
      assert.equal(after.release_authority[0].epoch,'2');
    }finally{if(blocker){await blocker.query('ROLLBACK');blocker.release()}await f.close()}
  });
}
