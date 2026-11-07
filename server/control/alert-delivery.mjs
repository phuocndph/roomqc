import {randomUUID} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {alertTransaction} from './alerts.mjs';
import {migrationManifest,verifyHistory} from './migrate.mjs';

export const deliveryCodes=Object.freeze(['DELIVERY_TIMEOUT','DELIVERY_NETWORK','DELIVERY_RATE_LIMIT','DELIVERY_SERVER_ERROR',
  'DELIVERY_REJECTED','DELIVERY_AUTH_REJECTED','DELIVERY_DESTINATION_DENIED','DELIVERY_RESPONSE_INVALID','DELIVERY_INTERRUPTED','DELIVERY_LEASE_EXPIRED']);
export class AlertDeliveryStore {
  constructor(pool,{leaseMs=60000,retryBaseMs=1000}={}){
    if(!Number.isInteger(leaseMs)||leaseMs<100||leaseMs>300000||!Number.isInteger(retryBaseMs)||retryBaseMs<10||retryBaseMs>60000)
      throw new ControlError(400,'INVALID_ALERT_DELIVERY','Giới hạn gửi cảnh báo không hợp lệ.');
    this.pool=pool;this.leaseMs=leaseMs;this.retryBaseMs=retryBaseMs;
  }
  async readiness(){
    const manifest=await migrationManifest();
    if(await verifyHistory(this.pool,manifest)!==manifest.length)throw new ControlError(503,'CONTROL_SCHEMA_PENDING','Database điều phối chưa nâng cấp đầy đủ.');
    const {rows}=await this.pool.query(`SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR NOT pg_has_role(current_user,'roomqc_control_alerts','USAGE')
      OR has_schema_privilege(current_user,'roomqc_control','CREATE')
      OR has_table_privilege(current_user,'roomqc_control.schema_migrations','INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.workspaces','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.alerts','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.control_commands','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(current_user,'roomqc_control.alert_events','SELECT,INSERT,UPDATE,DELETE')
      OR has_column_privilege(current_user,'roomqc_control.alert_outbox','payload','UPDATE')
      OR has_table_privilege(current_user,'roomqc_control.alert_outbox','INSERT,DELETE') AS excessive
      FROM pg_roles r WHERE r.rolname=current_user`);
    if(rows[0]?.excessive!==false)throw new ControlError(503,'ALERT_RUNTIME_PRIVILEGES','Worker cần tài khoản database gửi cảnh báo riêng.');
    return {schemaVersion:manifest.at(-1).version};
  }
  async claim(){
    return alertTransaction(this.pool,async client=>{
      const row=(await client.query(`SELECT * FROM roomqc_control.alert_outbox
        WHERE (state IN ('queued','retry') AND next_attempt_at<=clock_timestamp()) OR (state='leased' AND lease_until<=clock_timestamp())
        ORDER BY next_attempt_at,id LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
      if(!row)return null;
      if(row.state==='leased')await client.query(`UPDATE roomqc_control.alert_delivery_attempts SET outcome='lease_expired',
        error_code='DELIVERY_LEASE_EXPIRED',finished_at=clock_timestamp() WHERE delivery_id=$1 AND lease_token=$2 AND outcome='sending'`,[row.id,row.lease_token]);
      if(row.attempts>=row.max_attempts){
        await client.query(`UPDATE roomqc_control.alert_outbox SET state='dead_letter',lease_token=NULL,lease_until=NULL,
          last_error_code='DELIVERY_LEASE_EXPIRED' WHERE id=$1`,[row.id]);
        return {id:row.id,exhausted:true};
      }
      const token=randomUUID(),attempt=row.attempts+1;
      await client.query(`UPDATE roomqc_control.alert_outbox SET state='leased',attempts=$2,lease_token=$3,
        lease_until=clock_timestamp()+$4*interval '1 millisecond' WHERE id=$1`,[row.id,attempt,token,this.leaseMs]);
      await client.query(`INSERT INTO roomqc_control.alert_delivery_attempts(id,delivery_id,attempt,lease_token,outcome)
        VALUES($1,$2,$3,$4,'sending')`,[randomUUID(),row.id,attempt,token]);
      return {id:row.id,token,attempt,payload:row.payload};
    });
  }
  async settle(claim,{outcome,code=null}){
    if(typeof claim?.id!=='string'||!uuidPattern.test(claim.id)||typeof claim?.token!=='string'||!uuidPattern.test(claim.token)
      ||!Number.isSafeInteger(claim.attempt)||claim.attempt<1||!['delivered','retry','permanent'].includes(outcome)
      ||(outcome==='delivered'?code!==null:!deliveryCodes.includes(code)))
      throw new ControlError(400,'INVALID_ALERT_DELIVERY','Kết quả gửi cảnh báo không hợp lệ.');
    return alertTransaction(this.pool,async client=>{
      const row=(await client.query(`SELECT * FROM roomqc_control.alert_outbox WHERE id=$1 AND state='leased'
        AND lease_token=$2 AND attempts=$3 AND lease_until>clock_timestamp() FOR UPDATE`,[claim.id,claim.token,claim.attempt])).rows[0];
      if(!row)return {settled:false};
      const state=outcome==='delivered'?'delivered':outcome==='permanent'||row.attempts>=row.max_attempts?'dead_letter':'retry';
      const delay=Math.min(300000,this.retryBaseMs*2**(row.attempts-1));
      const changed=await client.query(`UPDATE roomqc_control.alert_outbox SET state=$3,lease_token=NULL,lease_until=NULL,last_error_code=$4,
        next_attempt_at=clock_timestamp()+$5*interval '1 millisecond',delivered_at=CASE WHEN $3='delivered' THEN clock_timestamp() ELSE NULL END
        WHERE id=$1 AND lease_token=$2 AND lease_until>clock_timestamp() RETURNING id`,[row.id,claim.token,state,code,delay]);
      if(!changed.rowCount)return {settled:false};
      await client.query(`UPDATE roomqc_control.alert_delivery_attempts SET outcome=$3,error_code=$4,finished_at=clock_timestamp()
        WHERE delivery_id=$1 AND lease_token=$2 AND outcome='sending'`,[row.id,claim.token,state,code]);
      return {settled:true,state};
    });
  }
}
