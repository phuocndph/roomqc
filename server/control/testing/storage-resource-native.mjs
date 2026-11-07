import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {Pool}=createRequire(import.meta.url)('pg');

// Runs only inside the owned full-schema harness, against the actual pinned
// Storage HTTP server. No mocked vendor server, provider or minimal schema.
export async function runStorageResourceChecks(input){
  const {run,databasePassword,serviceKey,phase}=input;assert.match(run,/^[a-f0-9]{12}$/);
  assert.ok(['exercise','verify-restart'].includes(phase));
  const admin=new Pool({host:'db',port:5432,database:'postgres',user:'supabase_admin',password:databasePassword,max:2,connectionTimeoutMillis:5000});
  const bucket='resource-'+run,mainName='roomqc-storage-owned-'+run,payload='RoomQC owned storage '+run,checks=[];
  const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));
  const request=async(path,{method='GET',body,headers={},authenticated=true}={})=>{
    const response=await fetch('http://storage:5000'+path,{method,body,headers:{...(authenticated?{authorization:'Bearer '+serviceKey}:{}),...headers},signal:AbortSignal.timeout(30000)});
    return {status:response.status,body:await response.text()};
  };
  const sessions=async()=>{
    const result=await admin.query(`SELECT pid,application_name,state,wait_event_type FROM pg_stat_activity WHERE datname=current_database() AND usename='supabase_storage_admin'`);
    return {main:result.rows.filter(r=>r.application_name===mainName).length,
      blocked:result.rows.filter(r=>r.application_name===mainName&&r.wait_event_type==='Lock').length,
      auxiliary:result.rows.filter(r=>r.application_name!==mainName).length,total:result.rowCount,
      auxiliaryPids:result.rows.filter(r=>r.application_name!==mainName).map(r=>r.pid)};
  };
  let locker,peak={main:0,auxiliary:0,total:0},reconnected=false;
  const observe=async()=>{const s=await sessions();for(const k of Object.keys(peak))peak[k]=Math.max(peak[k],s[k]);return s};
  const waitFor=async(fn,label)=>{const until=Date.now()+20000;while(Date.now()<until){const v=await fn();if(v)return v;await sleep(80)}throw new Error(label)};
  try{
    await waitFor(async()=>{try{return (await request('/status')).status===200}catch{return false}},'Storage startup deadline');
    if(phase==='exercise'){
      check('bucket created through actual HTTP',(await request('/bucket',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:bucket,name:bucket,public:false})})).status===200);
      check('file uploaded through actual file backend',(await request('/object/'+bucket+'/proof.txt',{method:'POST',headers:{'content-type':'text/plain'},body:payload})).status===200);
    }
    const file=await request('/object/'+bucket+'/proof.txt');check('private file content preserved',file.status===200&&file.body===payload);
    const denied=await request('/bucket',{authenticated:false});check('unsigned bucket request denied',[400,401,403].includes(denied.status));
    const before=await observe();check('actual pubsub session present',before.auxiliary===1);check('initial allocation respected',before.main<=2&&before.total<=3);
    if(phase==='exercise'){
      locker=await admin.connect();await locker.query('BEGIN');await locker.query('LOCK TABLE storage.buckets IN ACCESS EXCLUSIVE MODE');
      let settled=0;
      const requests=Array.from({length:12},(_,i)=>request('/bucket',{headers:{'x-forwarded-host':'untrusted-'+i+'.example.invalid','x-tenant-id':'untrusted-'+i}})
        .then(r=>{settled++;return r},e=>{settled++;throw e}));
      // Retain every outcome even if the observation fails; never leave fetch
      // rejections detached from the fixture's cleanup/error path.
      const outcomes=Promise.allSettled(requests);
      try{
        await waitFor(async()=>{const s=await observe();return s.main===2&&s.blocked===2},'Expected two blocked Storage pool sessions');
        for(let i=0;i<8;i++){const s=await observe();check('bounded sample '+i,s.main===2&&s.auxiliary===1&&s.total===3);await sleep(60)}
        check('requests queue behind finite pool',settled===0);
      }finally{await locker.query('ROLLBACK');locker.release();locker=undefined}
      const results=await outcomes;check('all queued requests recover without tenant pool churn',results.every(r=>r.status==='fulfilled'&&r.value.status===200&&JSON.parse(r.value.body).some(b=>b.id===bucket)));
      const result=await admin.query(`SELECT pid,pg_terminate_backend(pid) AS terminated FROM pg_stat_activity WHERE datname=current_database() AND usename='supabase_storage_admin' AND application_name<>$1`,[mainName]);
      check('actual listener termination requested',result.rowCount===1&&result.rows[0].terminated===true);
      const oldPids=result.rows.map(r=>r.pid);
      const replaced=await waitFor(async()=>{const s=await observe();return s.auxiliary===1&&s.auxiliaryPids.every(pid=>!oldPids.includes(pid))},'Storage listener identity replacement deadline');
      check('new listener identity replaces terminated session',replaced===true);reconnected=true;
      check('HTTP recovers after listener reconnect',(await request('/bucket')).status===200);
      const after=await observe();check('steady allocation restored after reconnect',after.main<=2&&after.auxiliary===1&&after.total<=3);
    }else{
      check('bucket remains after actual container restart',(await request('/bucket')).body.includes(bucket));
      check('file deleted through actual HTTP',(await request('/object/'+bucket,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({prefixes:['proof.txt']})})).status===200);
      check('owned bucket deleted through actual HTTP',(await request('/bucket/'+bucket,{method:'DELETE'})).status===200);
    }
    return {verified:true,checks:checks.length,phase,peak,mainPoolMaxObserved:peak.main,listenerReconnectVerified:reconnected,
      httpStorage:true,fullSchema:true,providerCalls:false,fixtureAdminPoolMax:2,fixtureAdminExcludedFromStorageAllocation:true,
      limitations:['Finite configured allocation, sampled saturation and one forced listener reconnect only; not a universal network-fault/session-retirement bound or whole-stack capacity acceptance.']};
  }finally{if(locker){await locker.query('ROLLBACK').catch(()=>{});locker.release()}await admin.end()}
}
