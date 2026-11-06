import test from 'node:test';import assert from 'node:assert/strict';
import {BookingExternalWorker} from './workers/booking-external-worker.mjs';
const target='00000000-0000-4000-8000-000000000001',lease='00000000-0000-4000-8000-000000000002';
function fixture({safe=true,prepared='authorized',prepareError,sendError,journalError,finishError,waitForAbort=false}={}){
  const operations=[],events=[];let config,claimed=false,ended=false,marker=false,sends=0,entered;
  const sending=new Promise(r=>entered=r);
  class Pool{
    constructor(options){config=options}on(){}
    async connect(){return {query:async(sql,args)=>{
      operations.push({side:'transaction',sql,args});
      if(sql.includes('AS safe'))return {rows:[{safe}]};
      if(sql.includes('prepare_booking_external_target'))return {rows:[{result:{status:prepared,target:{},payload:{}}}]};
      if(sql.includes('finish_booking_external_attempt')){if(finishError)throw new Error('postgres://private:secret@db/provider');return {rows:[{result:{state:args[3],attempts:1}}]}}
      return {rows:[]};
    },release:()=>operations.push({side:'transaction',sql:'RELEASE'})}}
    async query(sql,args){
      operations.push({side:'journal',sql,args});
      if(sql.includes('claim_booking_external_target')){if(claimed)return {rows:[{result:null}]};claimed=true;return {rows:[{result:{target_id:target,lease_id:lease}}]}}
      if(sql.includes('begin_booking_external_attempt')){if(journalError)throw new Error('private provider failure');marker=true;return {rows:[{id:args[2]}]}}
      return {rows:[]};
    }
    async end(){ended=true}
  }
  const adapter={channel:'push',configurationId:'a'.repeat(64),async prepare(){
    if(prepareError)throw Object.assign(new Error('private endpoint'),{code:prepareError});
    return {async send(signal){assert.equal(marker,true,'Never contact a provider without a committed marker');sends++;entered();
      if(waitForAbort)await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));
      if(sendError)throw new Error('private provider payload');return {outcome:waitForAbort?'unknown':'accepted',httpStatus:waitForAbort?null:201,messageId:null,retrySeconds:0};
    }};
  }};
  const worker=new BookingExternalWorker({Pool,connection:{host:'owned',password:'private'},adapters:[adapter],onEvent:e=>events.push(e)});
  return {worker,operations,events,config,sending,ended:()=>ended,sends:()=>sends};
}
test('external worker journals before send with exactly two bounded connections',async()=>{
  const f=fixture(),result=await f.worker.tick();await f.worker.shutdown();
  assert.equal(result.accepted,1);assert.equal(f.config.max,2);assert.equal(f.config.query_timeout,15000);assert.equal(f.sends(),1);
  const marker=f.operations.findIndex(o=>o.sql.includes('begin_booking_external_attempt')),finished=f.operations.findIndex(o=>o.sql.includes('finish_booking_external_attempt'));
  assert.ok(marker>=0&&finished>marker);assert.ok(f.ended());
});
test('external worker refuses unsafe role before claiming or preparing targets',async()=>{
  const f=fixture({safe:false});assert.equal((await f.worker.tick()).code,'BOOKING_EXTERNAL_ROLE_UNSAFE');
  assert.equal(f.sends(),0);assert.ok(!f.operations.some(o=>o.sql.includes('claim_booking_external_target')));await f.worker.shutdown();
});
test('blocked live scope commits disposition without journal or network',async()=>{
  const f=fixture({prepared:'blocked'}),result=await f.worker.tick();assert.equal(result.processed,1);assert.equal(result.accepted,0);
  assert.equal(f.sends(),0);assert.ok(!f.operations.some(o=>o.sql.includes('begin_booking_external_attempt')));await f.worker.shutdown();
});
test('journal failure never sends and leaves outcome conservatively unconfirmed',async()=>{
  const f=fixture({journalError:true}),result=await f.worker.tick();assert.equal(result.unconfirmed,1);assert.equal(f.sends(),0);
  assert.ok(f.operations.some(o=>o.sql==='ROLLBACK'));assert.doesNotMatch(JSON.stringify(f.events),/private|secret|postgres:/);await f.worker.shutdown();
});
test('preparation failures distinguish transient pre-I/O retry from permanent invalid target',async()=>{
  for(const code of ['NOTIFICATION_PREPARE_RETRY','NOTIFICATION_TARGET_DENIED']){
    const f=fixture({prepareError:code});await f.worker.tick();assert.equal(f.sends(),0);
    assert.ok(f.operations.some(o=>o.sql.includes(code==='NOTIFICATION_PREPARE_RETRY'?'defer_booking_external_target_before_io':'reject_booking_external_target_before_io')));
    assert.ok(!f.operations.some(o=>o.sql.includes('begin_booking_external_attempt')));await f.worker.shutdown();
  }
});
test('send exception is an unknown outcome; finalization failure never triggers an immediate resend',async()=>{
  const unknown=fixture({sendError:true});assert.equal((await unknown.worker.tick()).unknown,1);assert.equal(unknown.sends(),1);await unknown.worker.shutdown();
  const failed=fixture({finishError:true});assert.equal((await failed.worker.tick()).unconfirmed,1);assert.equal(failed.sends(),1);
  assert.ok(failed.operations.some(o=>o.sql==='ROLLBACK'));await failed.worker.shutdown();
});
test('overlap is suppressed and graceful shutdown aborts bounded HTTP then closes the pool',async()=>{
  const f=fixture({waitForAbort:true}),active=f.worker.tick();await f.sending;
  assert.equal((await f.worker.tick()).reason,'ALREADY_RUNNING');const closing=f.worker.shutdown();
  assert.equal((await f.worker.tick()).reason,'STOPPING');assert.equal((await active).unknown,1);assert.deepEqual(await closing,{stopped:true});assert.ok(f.ended());
});
test('external worker rejects unbounded or duplicate adapter configurations',()=>{
  for(const value of [{adapters:[]},{adapters:[{channel:'email',configurationId:'a'.repeat(64),prepare(){}}]},
    {adapters:[{channel:'push',configurationId:'a',prepare(){}}]},{limit:0},{limit:51},{intervalMs:99},{intervalMs:60001}]){
    assert.throws(()=>new BookingExternalWorker({Pool:class{},connection:{},adapters:[{channel:'push',configurationId:'a'.repeat(64),prepare(){}}],...value}),/INVALID_BOOKING_EXTERNAL_WORKER/);
  }
});
