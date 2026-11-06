import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrationManifest,migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {seedOperationalCluster} from './test-fixtures.mjs';
import {ControlStore} from './store.mjs';
import {SetupBackfillScanner} from './setup-backfill.mjs';

export function registerSetupBackfillCases({dbtest,database,config,cluster,pools,run,password}){
  let count=0;
  async function fixture(){
    const {pool,url}=await database('setup_backfill_'+(++count));
    await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
    const api=new ControlStore({...config(url),setupDispatchEnabled:true});pools.push(api.pool);
    const role='setup_backfill_reader_'+run+'_'+count;
    await pool.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_backfill_reader`);
    const readonlyUrl=new URL(url);readonlyUrl.username=role;
    const reader=new pg.Pool({connectionString:readonlyUrl.href,max:2,statement_timeout:8000,lock_timeout:1000});pools.push(reader);
    const expected=(await reader.query(`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",
      current_database() AS "databaseName",current_user::text AS role FROM pg_catalog.pg_control_system() s
      JOIN pg_catalog.pg_database d ON d.datname=current_database()`)).rows[0];
    const binding=(await pool.query(`SELECT a.cluster_id AS "clusterId",a.approval_id AS "approvalId",a.epoch::integer AS epoch,
      a.envelope_digest AS "envelopeDigest",c.credential_ref AS "credentialRef" FROM roomqc_control.release_approvals a
      JOIN roomqc_control.release_authority r ON r.approval_id=a.approval_id JOIN roomqc_control.clusters c ON c.id=r.cluster_id`)).rows[0];
    const receipts=new Map();let closeCalls=0,receiptCalls=0;
    const gateway={binding:{clusterId:cluster.id,url:cluster.url},receipt:async w=>{
      receiptCalls++;const value=receipts.get(w.id);if(value instanceof Error)throw value;return value??null;
    },close:async()=>{closeCalls++;throw new Error('Dry-run must never close')}};
    const scanner=options=>new SetupBackfillScanner(reader,{expected,bindings:[binding],gateways:[[cluster.id,gateway]],...options});
    async function workspace(label){
      const user={id:randomUUID(),session_id:randomUUID(),email:label+'@example.invalid',email_confirmed_at:new Date().toISOString()};
      const w=await api.reserve({slug:'backfill-'+label,email:user.email,displayName:'Private owner input '+label},randomUUID());
      const begun=await api.setup.begin(w,user,{hotelName:'Private hotel '+label,totalRooms:3},randomUUID());
      return {w:begun.workspace,d:begun.dispatch,user};
    }
    const receipt=f=>({workspace_id:f.w.id,owner_id:f.user.id,tenant_id:randomUUID(),hotel_id:randomUUID()});
    const snapshot=async()=>Object.fromEntries(await Promise.all(['workspaces','provisioning_jobs','setup_dispatches','attempts','setup_recovery_attempts']
      .map(async t=>[t,(await pool.query(`SELECT * FROM roomqc_control.${t} ORDER BY ${t==='setup_recovery_attempts'?'job_id,attempt':'id'}`)).rows])));
    return {pool,api,reader,role,expected,binding,gateway,scanner,workspace,receipt,receipts,snapshot,calls:()=>({closeCalls,receiptCalls})};
  }

  dbtest('T12 setup backfill: populated 0014 to 0015 preserves legacy states, leases, attempts and history under concurrent migrators',async()=>{
    const {pool}=await database('setup_upgrade_'+(++count)),manifest=await migrationManifest();
    const temp=await mkdtemp(join(tmpdir(),'roomqc-setup-upgrade-'));
    assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep+'roomqc-setup-upgrade-'));
    const location=pathToFileURL(temp+sep);
    try{
      for(const m of manifest.slice(0,14))await writeFile(join(temp,m.version),m.sql);
      await migrateDirectory(pool,{location});await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
      const specs=[['queued',0,0,false],['retry',2,1,false],['leased',2,0,true],['leased',8,2,false],
        ['queued',10,0,false],['succeeded',1,0,false],['waiting_owner',2,0,false],['needs_review',3,0,false],['cancelled',0,0,false]];
      const ids=[];
      for(let i=0;i<specs.length;i++){
        const [state,attempts,days,held]=specs[i],id=randomUUID(),owner=randomUUID(),dispatch=i%2===0?randomUUID():null;
        ids.push(id);
        await pool.query(`INSERT INTO roomqc_control.workspaces(id,slug,display_name,email_hash,cluster_id,owner_id,status)
          VALUES($1,$2,'Owned upgrade data',$2,$3,$4,'provisioning')`,[id,'upgrade-'+i,cluster.id,owner]);
        if(dispatch)await pool.query(`INSERT INTO roomqc_control.setup_dispatches(id,workspace_id,cluster_id,owner_id,routing_version,payload_sha256)
          VALUES($1,$2,$3,$4,1,$5)`,[dispatch,id,cluster.id,owner,'a'.repeat(64)]);
        await pool.query(`INSERT INTO roomqc_control.provisioning_jobs(id,workspace_id,state,attempts,lease_token,lease_until,
          expected_routing_version,dispatch_id,created_at) VALUES($1,$2,$3,$4,$5,
          CASE WHEN $3='leased' THEN clock_timestamp()+CASE WHEN $6 THEN interval '1 hour' ELSE interval '-1 hour' END ELSE NULL END,
          1,$7,clock_timestamp()-$8*interval '1 day')`,[randomUUID(),id,state,attempts,state==='leased'?randomUUID():null,held,dispatch,days]);
        await pool.query(`INSERT INTO roomqc_control.attempts(request_id,workspace_id,outcome) VALUES($1,$2,'owned_upgrade_history')`,[randomUUID(),id]);
      }
      const snap=async()=>Object.fromEntries(await Promise.all(['workspaces','provisioning_jobs','setup_dispatches','attempts','release_authority']
        .map(async t=>[t,(await pool.query(`SELECT * FROM roomqc_control.${t} ORDER BY ${t==='release_authority'?'cluster_id':'id'}`)).rows])));
      const before=await snap(),oldHistory=(await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version')).rows;
      await writeFile(join(temp,manifest[14].version),manifest[14].sql);
      const results=await Promise.all([migrateDirectory(pool,{location}),migrateDirectory(pool,{location})]);
      assert.equal(results.flatMap(r=>r.applied).length,1);assert.equal(results[0].version,manifest[14].version);
      const after=await snap();
      for(const j of after.provisioning_jobs){
        assert.equal(j.max_attempts,8);assert.equal(j.deadline_at.getTime(),j.created_at.getTime()+86400000);
        delete j.max_attempts;delete j.deadline_at;
      }
      assert.deepEqual(after,before);assert.equal((await pool.query('SELECT count(*)::integer AS n FROM roomqc_control.setup_recovery_attempts')).rows[0].n,0);
      assert.deepEqual((await pool.query('SELECT * FROM roomqc_control.schema_migrations ORDER BY version LIMIT 14')).rows,oldHistory);
      assert.deepEqual((await migrateDirectory(pool,{location})).applied,[]);
      // An old exhausted job is reviewed without fabricating attempts/history.
      const exhausted=ids[4];await pool.query(`UPDATE roomqc_control.provisioning_jobs SET next_attempt_at=clock_timestamp()+interval '1 day' WHERE workspace_id<>$1`,[exhausted]);
      await pool.query(`UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()+interval '1 day' WHERE state='leased' AND workspace_id<>$1`,[exhausted]);
      const bindings=(await pool.query(`SELECT a.cluster_id AS "clusterId",a.approval_id AS "approvalId",a.epoch::integer AS epoch,
        a.envelope_digest AS "envelopeDigest",c.credential_ref AS "credentialRef" FROM roomqc_control.release_approvals a
        JOIN roomqc_control.release_authority r ON r.approval_id=a.approval_id JOIN roomqc_control.clusters c ON c.id=r.cluster_id`)).rows;
      const claim=(await pool.query('SELECT roomqc_control.claim_setup_recovery(60000,$1::jsonb) AS value',[JSON.stringify(bindings)])).rows[0].value;
      assert.equal(claim.code,'SETUP_ATTEMPTS_EXHAUSTED');
      const job=(await pool.query('SELECT * FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1',[exhausted])).rows[0];
      assert.equal(job.attempts,10);assert.equal(job.state,'needs_review');
      // A migrated old lease past its original deadline is not given a fresh
      // 24-hour window or fabricated attempt history by takeover.
      const expired=ids[3];await pool.query(`UPDATE roomqc_control.provisioning_jobs SET lease_until=clock_timestamp()-interval '1 second' WHERE workspace_id=$1`,[expired]);
      const timedOut=(await pool.query('SELECT roomqc_control.claim_setup_recovery(60000,$1::jsonb) AS value',[JSON.stringify(bindings)])).rows[0].value;
      assert.equal(timedOut.code,'SETUP_DEADLINE_EXCEEDED');
      const expiredJob=(await pool.query('SELECT * FROM roomqc_control.provisioning_jobs WHERE workspace_id=$1',[expired])).rows[0];
      assert.equal(expiredJob.state,'needs_review');assert.equal(expiredJob.attempts,8);
      assert.equal((await pool.query('SELECT count(*)::integer AS n FROM roomqc_control.setup_recovery_attempts')).rows[0].n,0);
    }finally{
      assert.ok(resolve(temp).startsWith(resolve(tmpdir())+sep+'roomqc-setup-upgrade-'));
      await rm(temp,{recursive:true,force:true});
    }
  });

  dbtest('T12 setup backfill: dedicated reader cannot read owner input or write, call workers, or use an excessive role',async()=>{
    const f=await fixture();await f.workspace('reader');await f.scanner().scan();
    for(const q of ['SELECT email_hash FROM roomqc_control.workspaces','SELECT display_name FROM roomqc_control.workspaces',
      'SELECT publishable_key FROM roomqc_control.clusters','SELECT * FROM roomqc_control.attempts',
      'DELETE FROM roomqc_control.provisioning_jobs',"UPDATE roomqc_control.workspaces SET status='expired'",
      "SELECT roomqc_control.claim_setup_recovery(60000,'[]'::jsonb)"])
      await assert.rejects(()=>f.reader.query(q),{code:'42501'});
    await f.pool.query(`GRANT SELECT(email_hash) ON roomqc_control.workspaces TO ${f.role}`);
    await assert.rejects(()=>f.scanner().scan(),{code:'SETUP_BACKFILL_READ_FAILED'});
    await f.pool.query(`REVOKE SELECT(email_hash) ON roomqc_control.workspaces FROM ${f.role}`);
    await f.scanner().scan();
    await assert.rejects(()=>new SetupBackfillScanner(f.pool,{expected:{...f.expected,role:'postgres'},bindings:[f.binding],gateways:[]}).scan(),{code:'SETUP_BACKFILL_READ_FAILED'});
    await assert.rejects(()=>f.scanner({expected:{...f.expected,systemIdentifier:'1'}}).scan(),{code:'SETUP_BACKFILL_READ_FAILED'});
  });

  dbtest('T12 setup backfill: mixed seven-state dry run is read-only, scoped, bounded and does not close remote dispatches',async()=>{
    const f=await fixture(),entries={};
    for(const name of ['active','committed','pending','closed','legacy','conflict','unavailable'])entries[name]=await f.workspace(name);
    const active=f.receipt(entries.active);f.receipts.set(entries.active.w.id,active);
    await f.pool.query(`UPDATE roomqc_control.workspaces SET status='active',tenant_id=$2,hotel_id=$3 WHERE id=$1`,[entries.active.w.id,active.tenant_id,active.hotel_id]);
    await f.pool.query(`UPDATE roomqc_control.provisioning_jobs SET state='succeeded' WHERE workspace_id=$1`,[entries.active.w.id]);
    await f.pool.query(`UPDATE roomqc_control.setup_dispatches SET terminal_state='committed',tenant_id=$2,hotel_id=$3,settled_at=clock_timestamp() WHERE id=$1`,
      [entries.active.d.id,active.tenant_id,active.hotel_id]);
    const committed=f.receipt(entries.committed);f.receipts.set(entries.committed.w.id,committed);
    await f.pool.query(`UPDATE roomqc_control.setup_dispatches SET terminal_state='committed',tenant_id=$2,hotel_id=$3,settled_at=clock_timestamp() WHERE id=$1`,
      [entries.committed.d.id,committed.tenant_id,committed.hotel_id]);
    await f.pool.query(`UPDATE roomqc_control.setup_dispatches SET terminal_state='closed',settled_at=clock_timestamp() WHERE id=$1`,[entries.closed.d.id]);
    await f.pool.query('UPDATE roomqc_control.provisioning_jobs SET dispatch_id=NULL WHERE workspace_id=$1',[entries.legacy.w.id]);
    f.receipts.set(entries.conflict.w.id,{...f.receipt(entries.conflict),owner_id:randomUUID()});
    f.receipts.set(entries.unavailable.w.id,new Error('private provider DSN and token must not escape'));
    await f.pool.query(`UPDATE roomqc_control.provisioning_jobs SET state='leased',lease_token=$2,lease_until=clock_timestamp()+interval '1 hour' WHERE workspace_id=$1`,
      [entries.pending.w.id,randomUUID()]);
    const before=await f.snapshot(),report=await f.scanner().scan();
    assert.deepEqual(report.counts,{active_valid:1,committed_pending:1,dispatch_pending:1,closed:1,legacy_unknown:1,conflict:1,unavailable:1});
    assert.equal(report.pageCount,7);assert.equal(report.nextCursor,null);assert.equal(report.items.find(r=>r.workspaceId===entries.pending.w.id).lease,'held');
    assert.deepEqual(await f.snapshot(),before);assert.equal(f.calls().closeCalls,0);
    for(const secret of ['Private owner','Private hotel','example.invalid','private provider','owner_id','lease_token','payload_sha256',f.expected.systemIdentifier])
      assert.ok(!JSON.stringify(report).includes(secret));
    const repeated=await f.scanner().scan();assert.deepEqual(repeated.items,report.items);
  });

  dbtest('T12 setup backfill: stable page cursor rejects changed target scope and reports changed snapshot instead of inferring global consistency',async()=>{
    const f=await fixture();for(const name of ['page-a','page-b','page-c'])await f.workspace(name);
    const scanner=f.scanner({batchSize:1}),first=await scanner.scan();assert.ok(first.nextCursor);
    await assert.rejects(()=>f.scanner({bindings:[{...f.binding,epoch:f.binding.epoch+1}]}).scan({cursor:first.nextCursor}),{code:'INVALID_SETUP_BACKFILL'});
    const results=[...first.items];let cursor=first.nextCursor;
    while(cursor){const next=await scanner.scan({cursor});results.push(...next.items);cursor=next.nextCursor}
    assert.equal(results.length,3);assert.equal(new Set(results.map(r=>r.workspaceId)).size,3);
    const before=first.items[0].snapshotSha256;
    await f.pool.query('UPDATE roomqc_control.workspaces SET updated_at=clock_timestamp() WHERE id=$1',[first.items[0].workspaceId]);
    const rerun=await scanner.scan();assert.notEqual(rerun.items[0].snapshotSha256,before);
  });
}
