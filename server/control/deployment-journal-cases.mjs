import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {migrateDirectory,importInitialRegistry} from './migrate.mjs';
import {DeploymentJournal} from './deployment-journal.mjs';
import {adminRead} from './admin-read.mjs';
import {ControlStore} from './store.mjs';
import {fixtureConfig} from './test-fixtures.mjs';
import {fixtureSupportGateway} from './support-authority-fixtures.mjs';
import {startControl} from './server.mjs';
import {ControlError} from './errors.mjs';
import {reconciliationEvidence,evidenceHash} from './deployment-reconciliation.mjs';

export function registerDeploymentJournalCases({dbtest,database,cluster}){
  async function emptyProof(pool,row){
    const observedAt=(await pool.query('SELECT clock_timestamp()::text AS at')).rows[0].at;
    return reconciliationEvidence({journalRunId:row.id,clusterId:row.cluster_id,hostId:row.host_id,environment:row.environment,
      releaseId:row.release_id,compose:{sha256:row.compose_sha256}},{currentRelease:null,candidate:null,current:null,containers:[],observedAt});
  }
  async function fixture(name){
    const {pool,url}=await database(name);await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);
    await pool.query("INSERT INTO roomqc_control.hosts(id,name,environment) VALUES($1,$1,'local')",[cluster.id]);
    await pool.query('UPDATE roomqc_control.clusters SET host_id=$1 WHERE id=$1',[cluster.id]);
    const host=(await pool.query('SELECT h.* FROM roomqc_control.hosts h JOIN roomqc_control.clusters c ON c.host_id=h.id WHERE c.id=$1',[cluster.id])).rows[0];
    const plan={kind:'roomqc-vps-release-plan',clusterId:cluster.id,hostId:host.id,environment:host.environment,
      releaseId:'release-test',compose:{sha256:'a'.repeat(64)}};
    return {pool,url,plan,journal:new DeploymentJournal(pool),store:{pool}};
  }
  dbtest('deployment journal DB: concurrent reservation, unknown commit and final receipts cannot be overwritten',async()=>{
    const {pool,journal,plan}=await fixture('deployment_fence');
    const results=await Promise.allSettled([journal.begin(plan),journal.begin(plan)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.equal(results.find(r=>r.status==='rejected').reason.code,'DEPLOYMENT_CLUSTER_UNRESOLVED');
    const id=results.find(r=>r.status==='fulfilled').value;
    await assert.rejects(()=>journal.phase(id,'commit_release'),{code:'DEPLOYMENT_JOURNAL_CONFLICT'});
    await journal.phase(id,'stage_release');await journal.finish(id,{status:'outcome_unknown',errorCode:'VPS_DEPLOY_COMMIT_RESULT_UNKNOWN'});
    await assert.rejects(()=>journal.begin(plan),{code:'DEPLOYMENT_CLUSTER_UNRESOLVED'});
    await assert.rejects(()=>journal.finish(id,{status:'deployed'}),{code:'DEPLOYMENT_JOURNAL_CONFLICT'});
    await assert.rejects(()=>pool.query("UPDATE roomqc_control.deployment_runs SET state='running',finished_at=null WHERE id=$1",[id]),{code:'42501'});
    await assert.rejects(()=>pool.query('DELETE FROM roomqc_control.deployment_runs WHERE id=$1',[id]),{code:'42501'});
    await assert.rejects(()=>journal.begin({...plan,hostId:'wrong-host'}),{code:'DEPLOYMENT_TARGET_UNREGISTERED'});
  });
  dbtest('deployment journal DB: runtime API is read only, deployer has bounded writes, history uses tied keyset pages',async()=>{
    const {pool,journal,plan,store}=await fixture('deployment_grants');
    const client=await pool.connect();
    try{
      await client.query('SET ROLE roomqc_control_deployer');
      const writer=new DeploymentJournal(client),id=await writer.begin(plan);
      await assert.rejects(()=>client.query("UPDATE roomqc_control.deployment_runs SET release_id='tamper' WHERE id=$1",[id]),{code:'42501'});
      await assert.rejects(()=>client.query("UPDATE roomqc_control.clusters SET status='offline'"),{code:'42501'});
      await assert.rejects(()=>writer.finish(id,{status:'deployed'}),{code:'42501'});
      for(const phase of ['stage_release','validate_compose','start_release','health_gate','commit_release'])await writer.phase(id,phase);
      await writer.finish(id,{status:'deployed'});
      await client.query('SET ROLE roomqc_control_api');
      await client.query('SELECT id FROM roomqc_control.deployment_runs');
      await assert.rejects(()=>new DeploymentJournal(client).begin(plan),{code:'42501'});
    }finally{await client.query('RESET ROLE');client.release()}
    for(let i=0;i<2;i++)await pool.query(`INSERT INTO roomqc_control.deployment_runs
      (id,cluster_id,host_id,environment,release_id,compose_sha256,state,created_at,finished_at)
      VALUES($1,$2,$3,$4,$5,$6,'not_started','2026-10-01T00:00:00Z',clock_timestamp())`,
    [randomUUID(),plan.clusterId,plan.hostId,plan.environment,'release-'+i,plan.compose.sha256]);
    const page=await adminRead(store,'/deployments',new URLSearchParams('limit=1&state=not_started'));
    assert.equal(page.items.length,1);assert.ok(page.nextCursor);
    const next=await adminRead(store,'/deployments',new URLSearchParams({limit:'1',state:'not_started',cursor:page.nextCursor}));
    assert.notEqual(page.items[0].id,next.items[0].id);assert.equal(next.nextCursor,null);
    await assert.rejects(()=>adminRead(store,'/deployments',new URLSearchParams({state:'deployed',cursor:page.nextCursor})),{code:'INVALID_PAGE'});
    for(const query of ['clusterId=../wrong','state=wrong','host=x','state=running&state=running'])
      await assert.rejects(()=>adminRead(store,'/deployments',new URLSearchParams(query)),{code:'INVALID_PAGE'});
  });
  dbtest('deployment journal HTTP: read checks live authority again and cannot start SSH',async()=>{
    const {pool,url,journal,plan}=await fixture('deployment_http');
    await journal.begin(plan);
    const actor={id:randomUUID(),clusterId:cluster.id};let authorized=true;
    const gateway=fixtureSupportGateway({supportActor:async token=>{
      if(!token)throw new ControlError(401,'LOGIN_REQUIRED','Required');
      if(!authorized)throw new ControlError(403,'SUPPORT_ADMIN_REQUIRED','Denied');return actor;
    }});
    const config=fixtureConfig(url,[cluster]),store=new ControlStore(config),runtime=await startControl(config,{store,gateway});
    const base=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin/deployments`;
    const read=()=>fetch(base,{headers:{Authorization:'Bearer fixture'}});
    try{
      assert.equal((await fetch(base)).status,401);
      const response=await read();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
      const data=await response.json();assert.equal(data.items[0].clusterId,cluster.id);assert.equal(Object.hasOwn(data.items[0],'host'),false);
      const original=store.pool.query.bind(store.pool);store.pool.query=async(...args)=>{
        const result=await original(...args);if(String(args[0]).includes('FROM roomqc_control.deployment_runs'))authorized=false;return result;
      };
      const denied=await read();assert.equal(denied.status,403);assert.equal(Object.hasOwn(await denied.json(),'items'),false);
      authorized=true;
      assert.equal((await fetch(base,{method:'POST',headers:{Authorization:'Bearer fixture',Origin:config.publicOrigin,'Content-Type':'application/json'},body:'{}'})).status,404);
      assert.equal(Number((await pool.query('SELECT count(*) FROM roomqc_control.deployment_runs')).rows[0].count),1);
    }finally{await runtime.shutdown()}
  });
  dbtest('deployment reconciliation DB: operator resolution unblocks new runs, retains original receipt and immutable evidence',async()=>{
    const {pool,journal,plan,store}=await fixture('deployment_resolve');
    const id=await journal.begin(plan);await journal.finish(id,{status:'outcome_unknown'});
    const row=await journal.read(id),proof=await emptyProof(pool,row),client=await pool.connect();
    try{
      await client.query('SET ROLE roomqc_control_deployer');
      const result=await new DeploymentJournal(client).resolve(row,proof);assert.equal(result.outcome,'empty');
      await assert.rejects(()=>client.query('UPDATE roomqc_control.deployment_runs SET reconciliation_id=null WHERE id=$1',[id]),{code:'42501'});
      await assert.rejects(()=>client.query('DELETE FROM roomqc_control.deployment_resolutions WHERE id=$1',[result.id]),{code:'42501'});
      await client.query('SET ROLE roomqc_control_api');
      await assert.rejects(()=>new DeploymentJournal(client).resolve(row,proof),{code:'42501'});
    }finally{await client.query('RESET ROLE');client.release()}
    const saved=await journal.read(id);assert.equal(saved.state,'outcome_unknown');assert.equal(saved.version,row.version);assert.equal(saved.resolution.outcome,'empty');
    await assert.rejects(()=>journal.finish(id,{status:'deployed'}),{code:'DEPLOYMENT_JOURNAL_CONFLICT'});
    await journal.begin({...plan,releaseId:'release-next'});
    const response=await adminRead(store,'/deployments',new URLSearchParams('state=outcome_unknown'));
    assert.equal(response.items[0].resolution.outcome,'empty');assert.equal(Object.hasOwn(response.items[0].resolution,'evidence'),false);
    const raw=(await pool.query('SELECT * FROM roomqc_control.deployment_resolutions WHERE run_id=$1',[id])).rows[0];
    assert.equal(evidenceHash(raw.evidence),raw.evidence_sha256);
    await assert.rejects(()=>pool.query('UPDATE roomqc_control.deployment_resolutions SET outcome=outcome WHERE id=$1',[raw.id]),{code:'42501'});
  });
  dbtest('deployment reconciliation DB: stale observations and concurrent duplicate resolutions cannot clear a changed run',async()=>{
    const {pool,journal,plan}=await fixture('deployment_resolution_race');
    const id=await journal.begin(plan),old=await journal.read(id),proof=await emptyProof(pool,old);
    await journal.phase(id,'stage_release');
    await assert.rejects(()=>journal.resolve(old,proof),{code:'DEPLOYMENT_RESOLUTION_CONFLICT'});
    await assert.rejects(()=>journal.begin(plan),{code:'DEPLOYMENT_CLUSTER_UNRESOLVED'});
    const row=await journal.read(id),fresh=await emptyProof(pool,row);
    const attempts=await Promise.allSettled([journal.resolve(row,fresh),journal.resolve(row,fresh)]);
    assert.equal(attempts.filter(v=>v.status==='fulfilled').length,1);
    assert.equal(attempts.find(v=>v.status==='rejected').reason.code,'DEPLOYMENT_RESOLUTION_CONFLICT');
    await assert.rejects(()=>journal.phase(id,'validate_compose'),{code:'DEPLOYMENT_JOURNAL_CONFLICT'});
    await journal.begin({...plan,releaseId:'release-after-resolution'});
  });
}
