import {fixtureAlertAcknowledge,fixtureSupportGateway} from './support-authority-fixtures.mjs';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import pg from 'pg';
import {migrateDirectory,importInitialRegistry,migrationManifest} from './migrate.mjs';
import {fixtureConfig,seedOperationalCluster,fixtureTarget} from './test-fixtures.mjs';
import {ControlStore} from './store.mjs';
import {SyntheticHealthStore} from './health-test-fixtures.mjs';
import {telemetryTargetFingerprint} from './telemetry-source.mjs';
import {alertAcknowledgement} from './alert-commands.mjs';
import {alertTransaction,syncHealthAlerts} from './alerts.mjs';
import {AlertDeliveryStore} from './alert-delivery.mjs';
import {startControl} from './server.mjs';
import {startAlertRuntime} from './workers/alert-runtime.mjs';
import {alertConfiguration} from './workers/alert-config.mjs';

const actor={id:randomUUID(),clusterId:'cluster-a'};
const reason='Handle isolated health incident';
const sample=(at,diskFree=100*1024**3)=>({schemaVersion:2,observedAt:new Date(at).toISOString(),
  targetFingerprint:telemetryTargetFingerprint(fixtureTarget('cluster-a')),measurementScope:'docker-desktop-vm',requiredMountIds:['database'],
  metrics:{cpuUsedPercent:30,memoryAvailableBytes:8*1024**3,memoryTotalBytes:16*1024**3,dataDiskFreeBytes:diskFree,
    dataDiskTotalBytes:200*1024**3,dataDiskInodeFreePercent:80,dbConnectionsUsed:10,dbConnectionBudget:100},
  dataDisks:[{id:'database',freeBytes:diskFree,totalBytes:200*1024**3,inodeFreePercent:80}],
  probes:{auth:true,rest:true,storage:true,realtime:true,functions:true}});
export function registerAlertCases({dbtest,database,password,cluster}){
  async function fixture(name){
    const {pool,url}=await database(name);await migrateDirectory(pool);await importInitialRegistry(pool,[cluster]);await seedOperationalCluster(pool);
    const clients=[];
    const connect=async(role)=>{
      const user=name+'_'+role;await pool.query(`CREATE ROLE ${user} LOGIN PASSWORD '${password}' IN ROLE roomqc_control_${role}`);
      const target=new URL(url);target.username=user;
      const value=new pg.Pool({connectionString:target.href,max:4,connectionTimeoutMillis:2000,statement_timeout:3000});clients.push(value);return {pool:value,url:target.href};
    };
    const metrics=(await connect('metrics')).pool,delivery=await connect('alerts'),api=await connect('api');
    const store=new ControlStore(fixtureConfig(api.url,[cluster]));clients.push(store.pool);
    const sync=codes=>alertTransaction(metrics,c=>syncHealthAlerts(c,'cluster-a',{reasonCodes:codes,sourceGeneration:1},randomUUID()),{lock:true});
    return {pool,metrics,delivery,store,sync,close:()=>Promise.all(clients.filter(p=>!p.ending).map(p=>p.end()))};
  }
  dbtest('alerts: real health writes dedupe, recovery resolves after window, ack never releases admission, reopen creates a linked episode',async()=>{
    const f=await fixture('alerts_health');
    try{
      await f.pool.query('DELETE FROM roomqc_control.cluster_health_current');const end=Date.now();let at=end-660000;
      const health=new SyntheticHealthStore(f.metrics,{clock:()=>at});
      await health.record('cluster-a',sample(at,1024**3));at+=1000;await health.record('cluster-a',sample(at,1024**3));
      const first=(await f.pool.query("SELECT * FROM roomqc_control.alerts WHERE type='DISK_CRITICAL'")).rows[0];
      assert.equal(Number(first.row_version),1);assert.equal((await f.pool.query('SELECT * FROM roomqc_control.alerts')).rowCount,2);
      assert.equal((await f.pool.query('SELECT * FROM roomqc_control.alert_events')).rowCount,2);
      const command=alertAcknowledgement(first.id,{expectedVersion:1,reason},randomUUID());
      const results=await Promise.all(Array.from({length:12},()=>fixtureAlertAcknowledge(f.store.alerts,actor,command,randomUUID())));
      assert.equal(new Set(results.map(r=>r.commandId)).size,1);assert.equal(results[0].targetVersion,2);
      assert.deepEqual(await f.store.alerts.result(actor,first.id,command.key),results[0]);
      assert.equal((await f.pool.query('SELECT operator_reopen_required FROM roomqc_control.cluster_policies')).rows[0].operator_reopen_required,true);
      assert.equal((await f.pool.query('SELECT resolved_at FROM roomqc_control.alerts WHERE id=$1',[first.id])).rows[0].resolved_at,null);
      for(let i=0;i<=20;i++){at=end-600000+i*30000;await health.record('cluster-a',sample(at))}
      const recovered=(await f.pool.query('SELECT * FROM roomqc_control.alerts WHERE id=$1',[first.id])).rows[0];
      assert.ok(recovered.resolved_at);assert.equal(Number(recovered.row_version),3);
      assert.equal((await f.pool.query('SELECT operator_reopen_required FROM roomqc_control.cluster_policies')).rows[0].operator_reopen_required,true);
      // A past receipt remains stable even after the incident later resolves.
      assert.deepEqual(await f.store.alerts.result(actor,first.id,command.key),results[0]);
      at++;await health.record('cluster-a',sample(at,1024**3));
      const next=(await f.pool.query("SELECT * FROM roomqc_control.alerts WHERE type='DISK_CRITICAL' AND resolved_at IS NULL")).rows[0];
      assert.notEqual(next.id,first.id);assert.equal(next.predecessor_id,first.id);
      assert.deepEqual((await f.pool.query('SELECT transition FROM roomqc_control.alert_events WHERE alert_id=$1 ORDER BY alert_version',[first.id])).rows.map(r=>r.transition),['opened','acknowledged','resolved']);
      assert.equal((await f.pool.query('SELECT * FROM roomqc_control.alert_events')).rowCount,(await f.pool.query('SELECT * FROM roomqc_control.alert_outbox')).rowCount);
    }finally{await f.close()}
  });
  dbtest('alerts: stale health opens once; event/outbox failure rolls back health, latch, ack and durable receipt',async()=>{
    const f=await fixture('alerts_atomic');
    try{
      await f.pool.query("UPDATE roomqc_control.cluster_health_current SET observed_at=now()-interval '3 minutes',valid_until=now()-interval '1 second'");
      const health=new SyntheticHealthStore(f.metrics);
      const before=await f.pool.query('SELECT * FROM roomqc_control.cluster_health_current');
      await f.pool.query(`CREATE FUNCTION roomqc_control.reject_alert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Owned failure'; END $$;
        CREATE TRIGGER reject_alert BEFORE INSERT ON roomqc_control.alert_outbox FOR EACH ROW EXECUTE FUNCTION roomqc_control.reject_alert()`);
      await assert.rejects(()=>health.expireStale(),{code:'P0001'});
      assert.deepEqual((await f.pool.query('SELECT * FROM roomqc_control.cluster_health_current')).rows,before.rows);
      assert.equal((await f.pool.query('SELECT operator_reopen_required FROM roomqc_control.cluster_policies')).rows[0].operator_reopen_required,false);
      assert.equal((await f.pool.query('SELECT * FROM roomqc_control.alerts')).rowCount,0);
      await f.pool.query('DROP TRIGGER reject_alert ON roomqc_control.alert_outbox');
      assert.equal((await health.expireStale()).expiredCount,1);assert.equal((await health.expireStale()).expiredCount,0);
      const alert=(await f.pool.query('SELECT * FROM roomqc_control.alerts')).rows[0],key=randomUUID();
      await f.pool.query('CREATE TRIGGER reject_alert BEFORE INSERT ON roomqc_control.alert_outbox FOR EACH ROW EXECUTE FUNCTION roomqc_control.reject_alert()');
      await assert.rejects(()=>fixtureAlertAcknowledge(f.store.alerts,actor,alertAcknowledgement(alert.id,{expectedVersion:1,reason},key),randomUUID()),{code:'P0001'});
      assert.equal((await f.pool.query('SELECT acknowledged_at FROM roomqc_control.alerts')).rows[0].acknowledged_at,null);
      assert.equal((await f.pool.query('SELECT * FROM roomqc_control.control_commands')).rowCount,0);
      assert.equal((await f.pool.query('SELECT * FROM roomqc_control.alert_events')).rowCount,1);
      await f.pool.query('DROP TRIGGER reject_alert ON roomqc_control.alert_outbox');
      const response=await fixtureAlertAcknowledge(f.store.alerts,actor,alertAcknowledgement(alert.id,{expectedVersion:1,reason},key),randomUUID());
      assert.equal(response.targetVersion,2);
    }finally{await f.close()}
  });
  dbtest('alerts HTTP: strict filters/cursors, canonical authority, origin, version, actor-scoped lost-response recovery and idempotency conflicts',async()=>{
    const f=await fixture('alerts_http');let runtime;
    try{
      await f.sync(['DISK_CRITICAL','INODE_LOW','CPU_HIGH']);
      runtime=await startControl(f.store.config,{store:f.store,gateway:fixtureSupportGateway({supportActor:async token=>token==='valid'?actor:token==='other'?{...actor,id:randomUUID()}:null})});
      const base=`http://127.0.0.1:${runtime.server.address().port}/api/control/admin`,headers={authorization:'Bearer valid'};
      const page=await fetch(base+'/alerts?limit=1',{headers});assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'no-store');
      let data=await page.json();const ids=[data.items[0].id],id=ids[0];
      while(data.nextCursor){data=await(await fetch(base+'/alerts?limit=1&cursor='+data.nextCursor,{headers})).json();ids.push(...data.items.map(r=>r.id))}
      assert.equal(new Set(ids).size,3);
      for(const query of ['state=bad','limit=1&limit=1','severity=critical&severity=warning','owner=x','cursor=nope'])
        assert.equal((await fetch(base+'/alerts?'+query,{headers})).status,400);
      assert.equal((await fetch(base+'/alerts')).status,403);
      const key=randomUUID(),postHeaders={...headers,origin:f.store.config.publicOrigin,'content-type':'application/json','idempotency-key':key.toUpperCase()};
      const body=JSON.stringify({expectedVersion:1,reason});
      const call=()=>fetch(base+'/alerts/'+id.toUpperCase()+'/acknowledge',{method:'POST',headers:postHeaders,body});
      assert.equal((await fetch(base+'/alerts/'+id+'/acknowledge',{method:'POST',headers:{...postHeaders,origin:'https://wrong.invalid'},body})).status,403);
      const accepted=await call();assert.equal(accepted.status,200);const receipt=await accepted.json();
      const recovered=await(await fetch(base+'/alerts/'+id+'/acknowledgement-result',{headers:{...headers,'idempotency-key':key}})).json();
      delete receipt.requestId;delete recovered.requestId;assert.deepEqual(recovered,receipt);
      assert.equal((await call()).status,200);
      assert.equal((await fetch(base+'/alerts/'+id+'/acknowledge',{method:'POST',headers:postHeaders,body:JSON.stringify({expectedVersion:2,reason})})).status,409);
      assert.equal((await fetch(base+'/alerts/'+id+'/acknowledgement-result',{headers:{authorization:'Bearer other','idempotency-key':key}})).status,404);
      assert.equal((await fetch(base+'/alerts/'+id+'/acknowledgement-result?actor=x',{headers:{...headers,'idempotency-key':key}})).status,400);
      assert.equal((await fetch(base+'/alerts/'+id+'/acknowledgement-result',{headers})).status,400);
      assert.equal((await(await fetch(base+'/alerts?state=acknowledged',{headers})).json()).items.length,1);
      assert.equal((await(await fetch(base+'/alerts?state=open',{headers})).json()).items.length,2);
      assert.equal((await f.pool.query("SELECT * FROM roomqc_control.control_commands WHERE operation='acknowledge_alert'")).rowCount,1);
    }finally{if(runtime)await runtime.shutdown();await f.close()}
  });
  dbtest('alert dispatcher: least privilege, concurrent claims, expired lease fencing, bounded retry/dead-letter and append-only attempt history',async()=>{
    const f=await fixture('alerts_lease');
    try{
      const store=new AlertDeliveryStore(f.delivery.pool,{leaseMs:1000,retryBaseMs:10});await store.readiness();
      await f.sync(['DISK_CRITICAL']);
      const claims=await Promise.all(Array.from({length:8},()=>store.claim())),first=claims.find(Boolean);assert.equal(claims.filter(Boolean).length,1);
      await f.pool.query("UPDATE roomqc_control.alert_outbox SET lease_until=now()-interval '1 second',max_attempts=2");
      const next=await new AlertDeliveryStore(f.delivery.pool,{leaseMs:1000,retryBaseMs:10}).claim();
      assert.equal(next.id,first.id);assert.deepEqual(next.payload,first.payload);assert.notEqual(next.token,first.token);assert.equal(next.attempt,2);
      assert.deepEqual(await store.settle(first,{outcome:'delivered'}),{settled:false});
      assert.deepEqual(await store.settle(next,{outcome:'retry',code:'DELIVERY_NETWORK'}),{settled:true,state:'dead_letter'});
      assert.equal(await store.claim(),null);
      assert.deepEqual((await f.pool.query('SELECT outcome FROM roomqc_control.alert_delivery_attempts ORDER BY attempt')).rows.map(r=>r.outcome),['lease_expired','dead_letter']);
      for(const sql of ["UPDATE roomqc_control.alert_outbox SET payload='{}'",'DELETE FROM roomqc_control.alert_delivery_attempts',
        'SELECT * FROM roomqc_control.workspaces','UPDATE roomqc_control.alerts SET resolved_at=now()',
        'UPDATE roomqc_control.schema_migrations SET checksum=checksum','CREATE TABLE roomqc_control.invalid_alert(id int)'])
        await assert.rejects(()=>f.delivery.pool.query(sql),{code:'42501'});
      await assert.rejects(()=>f.metrics.query('UPDATE roomqc_control.alerts SET acknowledged_at=now()'),{code:'42501'});
      await assert.rejects(()=>new AlertDeliveryStore(f.pool).readiness(),{code:'ALERT_RUNTIME_PRIVILEGES'});
    }finally{await f.close()}
  });
  dbtest('alert dispatcher: retry is not claimable before backoff; crash on final lease exhausts without another send',async()=>{
    const f=await fixture('alerts_retry');
    try{
      const store=new AlertDeliveryStore(f.delivery.pool,{leaseMs:1000,retryBaseMs:60000});await f.sync(['DISK_CRITICAL']);
      const first=await store.claim();assert.deepEqual(await store.settle(first,{outcome:'retry',code:'DELIVERY_RATE_LIMIT'}),{settled:true,state:'retry'});
      assert.equal(await store.claim(),null);
      await f.pool.query("UPDATE roomqc_control.alert_outbox SET next_attempt_at=now()-interval '1 second',max_attempts=2");
      const final=await store.claim();await f.pool.query("UPDATE roomqc_control.alert_outbox SET lease_until=now()-interval '1 second'");
      assert.deepEqual(await store.claim(),{id:final.id,exhausted:true});assert.equal(await store.claim(),null);
      const row=(await f.pool.query('SELECT * FROM roomqc_control.alert_outbox')).rows[0];assert.equal(row.attempts,2);assert.equal(row.state,'dead_letter');
      assert.deepEqual(await store.settle(final,{outcome:'delivered'}),{settled:false});
    }finally{await f.close()}
  });
  dbtest('alert runtime: real local HTTP sink, 503/lost-response retry keeps delivery identity, restart delivers and auth rejection dead-letters',async()=>{
    const f=await fixture('alerts_sink'),received=[];let status=503,runtime;
    const sink=createServer(async(req,res)=>{let body='';for await(const part of req)body+=part;received.push({headers:req.headers,body});
      if(status===0){res.destroy();return}res.writeHead(status);res.end('{}')});
    await new Promise(resolve=>sink.listen(0,'127.0.0.1',resolve));
    const config=alertConfiguration({schemaVersion:1,instanceId:'local-alerts',poolMax:2,concurrency:1,intervalMs:100,requestTimeoutMs:1000,
      leaseMs:12000,shutdownTimeoutMs:3000,approvedAddresses:[],connectionBudget:{maxConnections:30,otherAllocatedConnections:20,instances:1,reservedConnections:5}},
    {databaseUrl:f.delivery.url,endpoint:`http://127.0.0.1:${sink.address().port}/operations`,token:'synthetic-operations-token',production:false,allowLocal:true});
    try{
      await f.sync(['DISK_CRITICAL']);
      // A separate pool per process allows real runtime shutdown/restart without closing the fixture observer.
      runtime=await startAlertRuntime(config,{port:0,autoStart:false});await runtime.worker.tick();
      assert.equal(runtime.worker.status().ready,true);
      assert.equal((await f.pool.query('SELECT state FROM roomqc_control.alert_outbox')).rows[0].state,'retry');
      const origin=`http://127.0.0.1:${runtime.server.address().port}`;
      assert.equal((await fetch(origin+'/readyz')).status,200);assert.equal((await fetch(origin+'/missing')).status,404);
      await runtime.shutdown();runtime=null;
      await f.pool.query("UPDATE roomqc_control.alert_outbox SET next_attempt_at=now()-interval '1 second'");status=204;
      runtime=await startAlertRuntime(config,{port:0,autoStart:false});await runtime.worker.tick();
      assert.equal((await f.pool.query('SELECT state FROM roomqc_control.alert_outbox')).rows[0].state,'delivered');
      assert.equal(received.length,2);assert.equal(received[0].body,received[1].body);
      assert.equal(received[0].headers['idempotency-key'],received[1].headers['idempotency-key']);
      assert.equal(received[0].headers['idempotency-key'],JSON.parse(received[0].body).deliveryId);
      assert.equal(received[0].headers.authorization,'Bearer synthetic-operations-token');
      await f.sync(['DISK_CRITICAL','INODE_LOW']);status=401;await runtime.worker.tick();
      assert.equal((await f.pool.query("SELECT count(*)::integer AS n FROM roomqc_control.alert_outbox WHERE state='dead_letter'")).rows[0].n,1);
      await runtime.worker.tick();assert.equal(received.length,3);
      // Receiver has the body, but the client never receives its acknowledgement.
      await f.sync(['DISK_CRITICAL','INODE_LOW','CPU_HIGH']);status=0;await runtime.worker.tick();
      assert.equal((await f.pool.query("SELECT last_error_code FROM roomqc_control.alert_outbox WHERE state='retry'")).rows[0].last_error_code,'DELIVERY_NETWORK');
      await f.pool.query("UPDATE roomqc_control.alert_outbox SET next_attempt_at=now()-interval '1 second' WHERE state='retry'");status=204;
      await runtime.worker.tick();assert.equal(received.length,5);assert.equal(received[3].body,received[4].body);
      assert.equal(received[3].headers['idempotency-key'],received[4].headers['idempotency-key']);
      assert.equal(new Set(received.map(r=>r.headers['idempotency-key'])).size,3);
    }finally{await runtime?.shutdown();sink.closeAllConnections();await new Promise(resolve=>sink.close(resolve));await f.close()}
  });
  dbtest('alerts upgrade: populated 0012 directory retains legacy incidents and commands; migration rerun is stable; noncluster legacy ack is explicit',async()=>{
    const {pool,url}=await database('alerts_upgrade'),temp=await mkdtemp(join(tmpdir(),'roomqc-alert-upgrade-'));let store;
    try{
      const manifest=await migrationManifest();for(const item of manifest.slice(0,-1))await writeFile(join(temp,item.version),item.sql);
      await migrateDirectory(pool,{location:pathToFileURL(temp+'/')});await importInitialRegistry(pool,[cluster]);
      const id=randomUUID();await pool.query("INSERT INTO roomqc_control.alerts(id,fingerprint,resource_id,type,severity) VALUES($1,'legacy-host','host-old','LEGACY','warning')",[id]);
      const before=(await pool.query('SELECT * FROM roomqc_control.alerts')).rows[0];
      await migrateDirectory(pool);await migrateDirectory(pool);
      const after=(await pool.query('SELECT * FROM roomqc_control.alerts')).rows[0];
      for(const key of Object.keys(before))assert.deepEqual(after[key],before[key]);assert.equal(after.origin,'legacy');
      assert.equal((await pool.query('SELECT * FROM roomqc_control.schema_migrations')).rowCount,manifest.length);
      await pool.query(`CREATE ROLE alerts_upgrade_api LOGIN PASSWORD '${password}' IN ROLE roomqc_control_api`);
      const target=new URL(url);target.username='alerts_upgrade_api';store=new ControlStore(fixtureConfig(target.href,[cluster]));
      const result=await fixtureAlertAcknowledge(store.alerts,actor,alertAcknowledgement(id,{expectedVersion:1,reason},randomUUID()),randomUUID());assert.equal(result.result.resourceId,'host-old');
      const event=(await pool.query('SELECT * FROM roomqc_control.alert_events')).rows[0];assert.equal(event.cluster_id,null);assert.equal(event.resource_id,'host-old');
    }finally{await store?.close();await rm(temp,{recursive:true})}
  });
}
