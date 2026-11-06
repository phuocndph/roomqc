import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Pool}=require('pg'),WebSocket=require('ws');

// Disposable full-schema harness only. Exercises actual Phoenix channels and
// observes database sessions, without calling Internet providers.
export async function runRealtimeResourceChecks(input){
  const {run,databasePassword,serviceKey,phase,connectPool,subscriberPool}=input;
  assert.match(run,/^[a-f0-9]{12}$/);assert.ok(['default','guard-mismatch','overrides','restart-defaults','api-update'].includes(phase));
  assert.ok([1,3].includes(connectPool)&&[2,4].includes(subscriberPool));
  const admin=new Pool({host:'db',port:5432,database:'postgres',user:'supabase_admin',password:databasePassword,
    application_name:'roomqc-realtime-observer-'+run,max:2,connectionTimeoutMillis:5000});
  const dataNames=['realtime_connect','realtime_subscription_manager','realtime_subscription_manager_pub','realtime_rls','realtime_replication_connection'];
  const names=['supabase_mt_realtime',...dataNames],checks=[];
  const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const waitFor=async(fn,label,timeout=45000)=>{const until=Date.now()+timeout;while(Date.now()<until){const r=await fn();if(r)return r;await sleep(100)}throw new Error(label)};
  const sessions=async()=>{
    const r=await admin.query(`SELECT a.pid,a.application_name,a.backend_type,s.ssl FROM pg_stat_activity a
      LEFT JOIN pg_stat_ssl s ON s.pid=a.pid WHERE a.datname=current_database() AND
      (a.application_name=ANY($1::text[]) OR a.application_name LIKE 'cluster_node_%')`,[names]);
    const counts=Object.fromEntries(names.map(name=>[name,r.rows.filter(x=>x.application_name===name).length]));
    return {counts,rows:r.rows,discovery:r.rows.filter(r=>r.application_name.startsWith('cluster_node_')).length};
  };
  const health=async(path,method='GET')=>fetch('http://realtime:4000'+path,{method,headers:{authorization:'Bearer '+serviceKey},signal:AbortSignal.timeout(15000)});
  let socket;const messages=[];let socketFailure;
  try{
    await waitFor(async()=>{try{return (await health('/api/tenants/realtime-dev/health')).ok}catch{return false}},'Realtime HTTP startup');
    if(['guard-mismatch','overrides'].includes(phase)){
      check('actual reload endpoint accepted',(await health('/api/tenants/realtime-dev/reload','POST')).status===204);
      await waitFor(async()=>{const s=await sessions();return dataNames.every(name=>s.counts[name]===0)},'Old tenant pools must retire before next observed tree');
    }
    socket=new WebSocket('ws://realtime:4000/socket/websocket?apikey='+encodeURIComponent(serviceKey)+'&vsn=1.0.0',
      {headers:{Host:'realtime-dev.localhost'},perMessageDeflate:false,handshakeTimeout:15000});
    socket.on('error',error=>{socketFailure=error});socket.on('message',raw=>{try{messages.push(JSON.parse(raw.toString()))}catch{socketFailure=new Error('Invalid Phoenix message')}});
    await waitFor(()=>{if(socketFailure)throw socketFailure;return socket.readyState===WebSocket.OPEN},'Actual websocket open');
    const topic='realtime:roomqc-resource-'+run;
    socket.send(JSON.stringify({topic,event:'phx_join',ref:'1',payload:{access_token:serviceKey,
      config:{broadcast:{self:true},presence:{key:''},postgres_changes:[{event:'*',schema:'public',table:'hotels'}]}}}));
    const joined=await waitFor(()=>messages.find(m=>m.ref==='1'&&m.event==='phx_reply'),'Phoenix join reply');
    if(phase==='guard-mismatch'){
      check('inconsistent vendor readiness key rejects actual join',joined.payload.status==='error');
      check('actual rejection identifies database capacity guard',typeof joined.payload.response?.reason==='string'
        &&joined.payload.response.reason.includes('DatabaseLackOfConnections'));
      await waitFor(async()=>{const s=await sessions();return s.counts.realtime_connect===0},'Rejected join has no durable Connect pool');
      check('rejected join did not leave a Connect pool',(await sessions()).counts.realtime_connect===0);
      return {verified:true,checks:checks.length,phase,actualJoinDenied:true,expectedVendorReadinessRejection:true,
        fullSchema:true,fixtureAdminPoolMax:2,fixtureAdminExcluded:true,hardSessionCeilingVerified:false};
    }
    check('actual channel joined with Postgres changes',joined.payload.status==='ok'&&joined.payload.response.postgres_changes?.length===1);
    socket.send(JSON.stringify({topic,event:'broadcast',ref:'2',payload:{type:'broadcast',event:'resource-proof',payload:{run}}}));
    check('actual broadcast delivered',Boolean(await waitFor(()=>messages.find(m=>m.event==='broadcast'&&m.payload.event==='resource-proof'&&m.payload.payload.run===run),'Actual broadcast echo')));
    const expected={supabase_mt_realtime:2,realtime_connect:connectPool,realtime_subscription_manager:1,
      realtime_subscription_manager_pub:subscriberPool,realtime_rls:1,realtime_replication_connection:1};
    const steady=await waitFor(async()=>{const s=await sessions();return Object.entries(expected).every(([name,n])=>s.counts[name]===n)&&s},'Actual data-path pool allocation');
    for(const [name,n]of Object.entries(expected))check('observed '+name,steady.counts[name]===n);
    check('database sessions exceed metadata pool setting',steady.rows.length>2);
    check('replication uses separate server backend',steady.rows.some(r=>r.application_name==='realtime_replication_connection'&&r.backend_type==='walsender'));
    check(input.expectTls?'all actual data-path sessions use TLS':'local fixture uses plaintext only inside owned network',
      steady.rows.every(r=>r.ssl===Boolean(input.expectTls)));
    const outcomes=await Promise.allSettled(Array.from({length:12},async()=>{
      const response=await health('/api/tenants/realtime-dev/health');const body=await response.json();return response.ok&&body.data?.healthy===true;
    }));
    check('concurrent actual health calls succeed',outcomes.every(r=>r.status==='fulfilled'&&r.value));
    const afterHealth=await sessions();check('health calls reuse existing data pools',Object.entries(expected).every(([name,n])=>afterHealth.counts[name]===n));
    check('health helper does not create independent sessions',(await admin.query("SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname=current_database() AND application_name='realtime_health_check'")).rows[0].n===0);
    let replicationReconnected=false;
    if(phase==='default'){
      const old=steady.rows.find(r=>r.application_name==='realtime_replication_connection').pid;
      check('owned replication session terminated',(await admin.query('SELECT pg_terminate_backend($1) AS terminated',[old])).rows[0].terminated===true);
      const replaced=await waitFor(async()=>{const s=await sessions();return s.rows.some(r=>r.application_name==='realtime_replication_connection'&&r.pid!==old)
        &&!s.rows.some(r=>r.pid===old)&&s},'Replication replacement identity',60000);
      check('replication reconnects with a new server PID',replaced.counts.realtime_replication_connection===1);replicationReconnected=true;
      check('health recovers after replication reconnect',(await health('/api/tenants/realtime-dev/health')).ok);
    }
    return {verified:true,checks:checks.length,phase,metadataPoolMax:2,observedCounts:steady.counts,
      observedDiscoverySessions:steady.discovery,observedTotalSessions:steady.rows.length,
      replicationReconnected,healthConcurrency:12,fullSchema:true,fixtureAdminPoolMax:2,fixtureAdminExcluded:true,
      hardSessionCeilingVerified:false,wholeStackCapacityVerified:false};
  }finally{
    if(socket){socket.close();await Promise.race([new Promise(r=>socket.once('close',r)),sleep(1000)]);if(socket.readyState!==WebSocket.CLOSED)socket.terminate()}
    await admin.end();
  }
}
