// Restricted database dispatcher. External adapters are a separate, unready lane.
export class BookingNotificationWorker {
  constructor({Pool,connection,limit=20,intervalMs=5000,onEvent=()=>{}}) {
    if(typeof Pool!=='function'||!connection||!Number.isInteger(limit)||limit<1||limit>50
      ||!Number.isInteger(intervalMs)||intervalMs<100||intervalMs>60000)throw new Error('INVALID_BOOKING_NOTIFIER_CONFIG');
    this.pool=new Pool({...connection,max:1,connectionTimeoutMillis:3000,idleTimeoutMillis:5000,
      statement_timeout:12000,lock_timeout:3000,query_timeout:15000,idle_in_transaction_session_timeout:15000,
      application_name:'roomqc-booking-notifier'});
    this.pool.on('error',()=>this.report({event:'booking_notifier_error',code:'BOOKING_NOTIFIER_CONNECTION_FAILED'}));
    Object.assign(this,{limit,intervalMs,onEvent,active:null,stopping:false,timer:null,loop:false});
  }
  report(value){try{this.onEvent(value)}catch{}}
  tick(){
    if(this.stopping)return Promise.resolve({skipped:true,reason:'STOPPING'});
    if(this.active)return Promise.resolve({skipped:true,reason:'ALREADY_RUNNING'});
    this.active=this.run().finally(()=>{this.active=null});return this.active;
  }
  async run(){
    let client;
    try{
      client=await this.pool.connect();await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout='12s';SET LOCAL lock_timeout='3s';SET LOCAL idle_in_transaction_session_timeout='15s'");
      const role=(await client.query(`SELECT current_user=session_user AND NOT(r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
        AND pg_has_role(current_user,'roomqc_booking_notifier','USAGE')
        AND NOT EXISTS(SELECT 1 FROM pg_roles p WHERE p.rolname<>current_user AND pg_has_role(current_user,p.oid,'MEMBER')
          AND p.rolname<>'roomqc_booking_notifier')
        AND NOT EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN('public','private') AND c.relkind IN('r','p')
            AND has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS safe
        FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
      if(role?.safe!==true)throw new Error('BOOKING_NOTIFIER_ROLE_UNSAFE');
      const value=(await client.query('SELECT private.process_booking_notification_batch($1) AS result',[this.limit])).rows[0]?.result;
      if(!value||!['processed','delivered','retry_pending','external_pending'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0)
        ||value.external_dispatcher_ready!==false)throw new Error('INVALID_BOOKING_NOTIFIER_RESULT');
      await client.query('COMMIT');
      const result={...value,external_dispatcher_ready:false};this.report({event:'booking_notifier_cycle',...result});return result;
    }catch(error){
      if(client)try{await client.query('ROLLBACK')}catch{}
      const code=error?.message==='BOOKING_NOTIFIER_ROLE_UNSAFE'?'BOOKING_NOTIFIER_ROLE_UNSAFE':'BOOKING_NOTIFIER_CYCLE_FAILED';
      this.report({event:'booking_notifier_error',code});return {failed:true,code,external_dispatcher_ready:false};
    }finally{client?.release()}
  }
  start(){
    if(this.loop||this.stopping)return;this.loop=true;
    const cycle=async()=>{try{await this.tick()}finally{if(!this.stopping)this.timer=setTimeout(cycle,this.intervalMs)}};
    void cycle();
  }
  shutdown(){
    if(this.shutdownPromise)return this.shutdownPromise;
    this.stopping=true;clearTimeout(this.timer);
    this.shutdownPromise=(async()=>{await this.active;await this.pool.end();return {stopped:true}})();return this.shutdownPromise;
  }
}
