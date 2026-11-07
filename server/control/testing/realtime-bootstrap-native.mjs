import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{Pool}=require('pg');
const pool=input=>new Pool({host:'db',port:5432,database:'postgres',user:'supabase_admin',password:input.databasePassword,
  application_name:'roomqc-realtime-bootstrap-observer-'+input.run,max:1,connectionTimeoutMillis:5000});

export async function checkRealtimePoolApi(input){
  const admin=pool(input),checks=[];const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
  try{
    const row=(await admin.query("SELECT id,settings FROM _realtime.extensions WHERE tenant_external_id='realtime-dev' AND type='postgres_cdc_rls'")).rows[0];
    const settings={...row.settings,db_host:'db',db_port:'5432',db_name:'postgres',db_user:'supabase_admin',
      db_password:input.databasePassword,db_pool:3,postgres_changes_pool:2,subs_pool_size:99};
    delete settings.subcriber_pool_size;
    const update=async candidate=>fetch('http://realtime:4000/api/tenants/realtime-dev',{method:'PUT',
      headers:{authorization:'Bearer '+input.serviceKey,'content-type':'application/json'},
      body:JSON.stringify({tenant:{extensions:[{id:row.id,type:'postgres_cdc_rls',settings:candidate}]}}),signal:AbortSignal.timeout(20000)});
    const response=await update(settings);check('actual public pool API accepts valid resize',response.status===200);
    const body=await response.json();const actual=body.data?.extensions?.find(e=>e.type==='postgres_cdc_rls')?.settings;
    check('API returned struct has canonical subscriber keys',actual?.subcriber_pool_size===2&&actual?.subs_pool_size===2);
    const stored=(await admin.query('SELECT settings FROM _realtime.extensions WHERE id=$1',[row.id])).rows[0].settings;
    check('database persisted the same canonical keys',stored.db_pool===3&&stored.subcriber_pool_size===2&&stored.subs_pool_size===2);
    const digest=async()=>createHash('sha256').update(JSON.stringify((await admin.query('SELECT to_jsonb(e) AS value FROM _realtime.extensions e WHERE id=$1',[row.id])).rows[0].value)).digest('hex');
    const before=await digest(),invalid=await update({...settings,postgres_changes_pool:0});
    check('invalid public pool API input returns validation error',invalid.status===422);
    check('invalid public pool API input leaves row unchanged',await digest()===before);
    return {verified:true,checks:checks.length,cases:checks,actualHttp:true,returnedStructCanonical:true};
  }finally{await admin.end()}
}
export async function holdRealtimeBootstrapLock(input){
  const admin=pool(input);try{
    if(input.mode==='janitor')await admin.query('BEGIN; LOCK TABLE realtime.messages IN ACCESS EXCLUSIVE MODE;');
    else await admin.query('SELECT pg_advisory_lock(1380733763,1431507009)');
    console.log('ROOMQC_REALTIME_LOCK_HELD');
    await new Promise(r=>setTimeout(r,16000));
    if(input.mode==='janitor')await admin.query('ROLLBACK');
    else await admin.query('SELECT pg_advisory_unlock(1380733763,1431507009)');
    return {verified:true,actualDatabaseSessionLock:true};
  }finally{await admin.end()}
}
