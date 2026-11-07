import {ControlError,uuidPattern} from './errors.mjs';
import {migrationManifest,verifyHistory} from './migrate.mjs';

const invalid=()=>new ControlError(400,'INVALID_SETUP_WORKER','Cấu hình đối soát thiết lập không hợp lệ.');
export class SetupWorkerStore{
  constructor(pool,{leaseMs=60000,retryBaseMs=1000,bindings}={}){
    if(!pool||typeof pool.query!=='function'||!Number.isSafeInteger(leaseMs)||leaseMs<100||leaseMs>300000
      ||!Number.isSafeInteger(retryBaseMs)||retryBaseMs<10||retryBaseMs>60000
      ||!Array.isArray(bindings)||!bindings.length||bindings.length>16
      ||bindings.some(b=>!b||!/^([a-z][a-z0-9-]{1,39})$/.test(b.clusterId??'')||!uuidPattern.test(b.approvalId??'')
        ||!Number.isSafeInteger(b.epoch)||b.epoch<1||!/^[a-f0-9]{64}$/.test(b.envelopeDigest??'')
        ||!/^[a-z][a-z0-9-]{1,63}$/.test(b.credentialRef??''))
      ||new Set(bindings.map(b=>b.clusterId)).size!==bindings.length)throw invalid();
    this.pool=pool;this.leaseMs=leaseMs;this.retryBaseMs=retryBaseMs;
    this.bindingsJson=JSON.stringify(bindings.map(({clusterId,approvalId,epoch,envelopeDigest,credentialRef})=>({clusterId,approvalId,epoch,envelopeDigest,credentialRef})));
  }
  async readiness(){
    const manifest=await migrationManifest();
    if(await verifyHistory(this.pool,manifest)!==manifest.length)
      throw new ControlError(503,'CONTROL_SCHEMA_PENDING','Database điều phối chưa nâng cấp đầy đủ.');
    const {rows}=await this.pool.query(`SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
      OR NOT pg_has_role(current_user,'roomqc_control_setup_runtime','USAGE')
      OR has_schema_privilege(current_user,'roomqc_control','CREATE') OR has_schema_privilege(current_user,'public','CREATE')
      OR EXISTS (SELECT 1 FROM pg_roles other WHERE other.rolname NOT IN (current_user,'roomqc_control_setup_runtime')
        AND pg_has_role(current_user,other.oid,'MEMBER'))
      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control'
        AND c.relkind IN ('r','p','v','m','f') AND (CASE WHEN c.relname='schema_migrations'
          THEN has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          ELSE has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END))
      OR EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control'
        AND c.relkind='S' AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))
      OR EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='roomqc_control'
        AND p.oid NOT IN ('roomqc_control.claim_setup_recovery(integer,jsonb)'::regprocedure,
          'roomqc_control.settle_setup_recovery(uuid,uuid,integer,jsonb,integer)'::regprocedure)
        AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS excessive
      FROM pg_roles r WHERE r.rolname=current_user`);
    if(rows[0]?.excessive!==false)
      throw new ControlError(503,'SETUP_RUNTIME_PRIVILEGES','Worker cần tài khoản database đối soát riêng.');
    return {schemaVersion:manifest.at(-1).version};
  }
  async claim(){
    return (await this.pool.query('SELECT roomqc_control.claim_setup_recovery($1,$2::jsonb) AS claim',[this.leaseMs,this.bindingsJson])).rows[0].claim;
  }
  async settle(claim,result){
    if(!uuidPattern.test(claim?.id??'')||!uuidPattern.test(claim?.token??'')
      ||!Number.isSafeInteger(claim.attempt)||claim.attempt<1||claim.attempt>30
      ||!result||typeof result!=='object'||Array.isArray(result))throw invalid();
    return (await this.pool.query('SELECT roomqc_control.settle_setup_recovery($1,$2,$3,$4::jsonb,$5) AS result',
      [claim.id,claim.token,claim.attempt,JSON.stringify(result),this.retryBaseMs])).rows[0].result;
  }
}
