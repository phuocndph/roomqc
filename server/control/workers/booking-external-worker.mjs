import {randomUUID} from 'node:crypto';
import {assertBookingNotificationRole} from '../booking-notification-access.mjs';

export class BookingExternalWorker {
  constructor({Pool,connection,adapters,limit=20,intervalMs=5000,onEvent=()=>{}}){
    if(typeof Pool!=='function'||!connection||!Array.isArray(adapters)||adapters.length<1||adapters.length>2
      ||new Set(adapters.map(a=>a.channel)).size!==adapters.length||adapters.some(a=>!['push','telegram'].includes(a.channel)
        ||!/^[a-f0-9]{64}$/.test(a.configurationId)||typeof a.prepare!=='function')
      ||!Number.isInteger(limit)||limit<1||limit>50||!Number.isInteger(intervalMs)||intervalMs<100||intervalMs>60000)throw new Error('INVALID_BOOKING_EXTERNAL_WORKER');
    this.pool=new Pool({...connection,max:2,connectionTimeoutMillis:3000,idleTimeoutMillis:5000,statement_timeout:12000,
      lock_timeout:3000,query_timeout:15000,idle_in_transaction_session_timeout:20000,application_name:'roomqc-booking-external-notifier'});
    this.pool.on('error',()=>this.report({event:'booking_external_error',code:'BOOKING_EXTERNAL_CONNECTION_FAILED'}));
    Object.assign(this,{adapters,limit,intervalMs,onEvent,active:null,stopping:false,timer:null,controller:new AbortController()});
  }
  report(value){try{this.onEvent(value)}catch{}}
  async safe(client){
    try{await assertBookingNotificationRole(client,'worker')}catch(error){
      if(error.code==='BOOKING_NOTIFICATION_ROLE_UNSAFE')throw new Error('BOOKING_EXTERNAL_ROLE_UNSAFE');throw error;
    }
  }
  tick(){
    if(this.stopping)return Promise.resolve({skipped:true,reason:'STOPPING'});
    if(this.active)return Promise.resolve({skipped:true,reason:'ALREADY_RUNNING'});
    this.active=this.run().finally(()=>{this.active=null});return this.active;
  }
  async dispatch(adapter,claim){
    const client=await this.pool.connect();
    try{
      await client.query('BEGIN');await client.query("SET LOCAL statement_timeout='12s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='20s'");
      await this.safe(client);
      const prepared=(await client.query('SELECT private.prepare_booking_external_target($1,$2,$3) AS result',
        [claim.target_id,claim.lease_id,adapter.configurationId])).rows[0]?.result;
      if(prepared?.status!=='authorized'){await client.query('COMMIT');return {state:prepared?.status??'stale'}}
      let request;
      try{request=await adapter.prepare(prepared.target,prepared.payload)}catch(error){
        const fn=error?.code==='NOTIFICATION_PREPARE_RETRY'?'defer_booking_external_target_before_io':'reject_booking_external_target_before_io';
        await client.query('SELECT private.'+fn+'($1,$2)',[claim.target_id,claim.lease_id]);await client.query('COMMIT');return {state:'not_sent'};
      }
      this.controller.signal.throwIfAborted();
      const attempt=randomUUID();
      // A second connection commits this marker while the first retains the
      // live scope/config locks. No network send precedes this durable marker.
      const begun=await this.pool.query('SELECT private.begin_booking_external_attempt($1,$2,$3) AS id',[claim.target_id,claim.lease_id,attempt]);
      if(begun.rows[0]?.id!==attempt)throw new Error('BOOKING_EXTERNAL_JOURNAL_FAILED');
      let result;try{result=await request.send(this.controller.signal)}catch{result={outcome:'unknown',httpStatus:null,messageId:null,retrySeconds:0}}
      const completed=(await client.query('SELECT private.finish_booking_external_attempt($1,$2,$3,$4,$5,$6,$7) AS result',
        [claim.target_id,claim.lease_id,attempt,result.outcome,result.httpStatus,result.messageId,result.retrySeconds])).rows[0]?.result;
      await client.query('COMMIT');return completed;
    }catch{try{await client.query('ROLLBACK')}catch{};return {state:'unconfirmed'}}finally{client.release()}
  }
  async run(){
    const counts={processed:0,accepted:0,unknown:0,rejected:0,deferred:0,unconfirmed:0};
    try{
      const client=await this.pool.connect();try{await this.safe(client)}finally{client.release()}
      for(let n=0;n<this.limit&&!this.stopping;n++){
        let any=false;
        for(const adapter of this.adapters){
          if(this.stopping||counts.processed>=this.limit)break;
          const claim=(await this.pool.query('SELECT private.claim_booking_external_target($1) AS result',[adapter.channel])).rows[0]?.result;
          if(!claim)continue;any=true;const result=await this.dispatch(adapter,claim);counts.processed++;
          if(['accepted','unknown','rejected','unconfirmed'].includes(result.state))counts[result.state]++;else counts.deferred++;
        }
        if(!any)break;
      }
      this.report({event:'booking_external_cycle',...counts});return counts;
    }catch(error){const code=error?.message==='BOOKING_EXTERNAL_ROLE_UNSAFE'?'BOOKING_EXTERNAL_ROLE_UNSAFE':'BOOKING_EXTERNAL_CYCLE_FAILED';
      this.report({event:'booking_external_error',code});return {...counts,failed:true,code}}
  }
  start(){
    if(this.loop||this.stopping)return;this.loop=true;
    const cycle=async()=>{try{await this.tick()}finally{if(!this.stopping)this.timer=setTimeout(cycle,this.intervalMs)}};void cycle();
  }
  shutdown(){
    if(this.shutdownPromise)return this.shutdownPromise;this.stopping=true;clearTimeout(this.timer);this.controller.abort();
    this.shutdownPromise=(async()=>{await this.active;await this.pool.end();return {stopped:true}})();return this.shutdownPromise;
  }
}
