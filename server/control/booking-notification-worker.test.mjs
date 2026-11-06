import test from 'node:test';
import assert from 'node:assert/strict';
import {BookingNotificationWorker} from './workers/booking-notification-worker.mjs';
function fixture({safe=true,fail=false,wait}={}){
  const sql=[],events=[];let config,ended=false,released=false;
  class Pool {
    constructor(value){config=value}
    on(){}
    async connect(){return {query:async(query,args)=>{
      sql.push({query,args});
      if(query.includes('AS safe'))return {rows:[{safe}]};
      if(query.includes('process_booking_notification_batch')){
        if(wait)await wait;
        if(fail)throw new Error('postgres://private:secret@private/provider');
        return {rows:[{result:{processed:1,delivered:1,retry_pending:0,external_pending:3,external_dispatcher_ready:false}}]};
      }
      return {rows:[]};
    },release:()=>{released=true}}}
    async end(){ended=true}
  }
  const worker=new BookingNotificationWorker({Pool,connection:{host:'owned',password:'private'},onEvent:e=>events.push(e)});
  return {worker,sql,events,config,ended:()=>ended,released:()=>released};
}
test('booking notifier uses finite database limits and preserves partial external status',async()=>{
  const f=fixture();const result=await f.worker.tick();await f.worker.shutdown();
  assert.equal(result.delivered,1);assert.equal(result.external_pending,3);assert.equal(result.external_dispatcher_ready,false);
  assert.equal(f.config.max,1);assert.equal(f.config.connectionTimeoutMillis,3000);assert.equal(f.config.query_timeout,15000);
  assert.ok(f.sql.some(s=>s.query==='COMMIT'));assert.ok(f.released());assert.ok(f.ended());
});
test('booking notifier refuses unsafe role before dispatcher and rolls back',async()=>{
  const f=fixture({safe:false});assert.equal((await f.worker.tick()).code,'BOOKING_NOTIFIER_ROLE_UNSAFE');
  assert.ok(!f.sql.some(s=>s.query.includes('SELECT private.process')));assert.ok(f.sql.some(s=>s.query==='ROLLBACK'));
  await f.worker.shutdown();
});
test('booking notifier suppresses overlapping cycles and waits for active shutdown',async()=>{
  let resume;const wait=new Promise(r=>{resume=r}),f=fixture({wait});const first=f.worker.tick();
  assert.equal((await f.worker.tick()).reason,'ALREADY_RUNNING');const stop=f.worker.shutdown();
  assert.equal((await f.worker.tick()).reason,'STOPPING');assert.equal(f.ended(),false);
  resume();await first;assert.deepEqual(await stop,{stopped:true});assert.ok(f.ended());
});
test('booking notifier exposes only safe failure codes and releases failed transaction',async()=>{
  const f=fixture({fail:true});assert.equal((await f.worker.tick()).code,'BOOKING_NOTIFIER_CYCLE_FAILED');
  assert.ok(f.sql.some(s=>s.query==='ROLLBACK'));assert.ok(f.released());
  assert.doesNotMatch(JSON.stringify(f.events),/secret|postgres:|provider|password/);await f.worker.shutdown();
});
test('booking notifier rejects unbounded batch and cadence configuration',()=>{
  for(const overrides of [{limit:0},{limit:51},{intervalMs:0},{intervalMs:60001}])
    assert.throws(()=>new BookingNotificationWorker({Pool:class{},connection:{},...overrides}),/INVALID_BOOKING_NOTIFIER_CONFIG/);
});
