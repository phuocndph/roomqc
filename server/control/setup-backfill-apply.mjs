import {createHash} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {migrationManifest,verifyHistory} from './migrate.mjs';
import {SetupBackfillScanner,setupBackfillFingerprint,setupBackfillGroups} from './setup-backfill.mjs';

const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const invalid=()=>new ControlError(400,'INVALID_SETUP_BACKFILL_APPLY','Lệnh đối soát dữ liệu cũ không hợp lệ.');
const unavailable=()=>new ControlError(503,'SETUP_BACKFILL_APPLY_UNAVAILABLE','Chưa xác nhận được kết quả đối soát. Giữ nguyên mã lệnh để kiểm tra lại.');

/** UUIDv8 binds one reviewed batch to one workspace. Persist the batch ID. */
export function setupBackfillCommandKey(batchId,workspaceId){
  if(!uuidPattern.test(batchId??'')||!uuidPattern.test(workspaceId??''))throw invalid();
  const bytes=createHash('sha256').update('roomqc-setup-backfill-v1\0'+batchId.toLowerCase()+'\0'+workspaceId.toLowerCase()).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|128;bytes[8]=(bytes[8]&63)|128;
  const h=bytes.toString('hex');return [h.slice(0,8),h.slice(8,12),h.slice(12,16),h.slice(16,20),h.slice(20)].join('-');
}

export class SetupBackfillApplier{
  constructor(pool,options={}){
    this.observer=new SetupBackfillScanner(pool,options);
    this.pool=pool;this.expected=this.observer.expected;
    this.bindings=new Map([...this.observer.bindings].map(([id,b])=>[id,Object.freeze(Object.fromEntries(
      ['clusterId','approvalId','epoch','envelopeDigest','credentialRef'].map(k=>[k,b[k]])))]));
  }
  async readiness(){
    try{
      const manifest=await migrationManifest();if(await verifyHistory(this.pool,manifest)!==manifest.length)throw unavailable();
      const observed=(await this.pool.query(`SELECT s.system_identifier::text AS "systemIdentifier",d.oid::text AS "databaseOid",
        current_database() AS "databaseName",current_user::text AS role,session_user::text AS "sessionRole",pg_is_in_recovery() AS recovery
        FROM pg_catalog.pg_control_system() s JOIN pg_catalog.pg_database d ON d.datname=current_database()`)).rows[0];
      if(!observed||Object.keys(this.expected).some(k=>observed[k]!==this.expected[k])
        ||observed.sessionRole!==this.expected.role||observed.recovery)throw unavailable();
      const role=(await this.pool.query(`SELECT r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls
        OR NOT pg_has_role(current_user,'roomqc_control_backfill_runtime','USAGE')
        OR has_schema_privilege(current_user,'roomqc_control','CREATE') OR has_schema_privilege(current_user,'public','CREATE')
        OR EXISTS(SELECT 1 FROM pg_roles x WHERE x.rolname NOT IN(current_user,'roomqc_control_backfill_runtime') AND pg_has_role(current_user,x.oid,'MEMBER'))
        OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control' AND c.relkind IN('r','p','v','m','f')
          AND(CASE WHEN c.relname='schema_migrations' THEN has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES')
          ELSE has_table_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR has_any_column_privilege(current_user,c.oid,'SELECT,INSERT,UPDATE,REFERENCES') END))
        OR EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='roomqc_control' AND c.relkind='S'
          AND has_sequence_privilege(current_user,c.oid,'USAGE,SELECT,UPDATE'))
        OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='roomqc_control'
          AND p.oid NOT IN('roomqc_control.read_setup_backfill_snapshot(uuid,text)'::regprocedure,
            'roomqc_control.apply_setup_backfill(uuid,uuid,text,text,text,text,jsonb,jsonb,jsonb)'::regprocedure)
          AND has_function_privilege(current_user,p.oid,'EXECUTE')) AS excessive
        FROM pg_roles r WHERE r.rolname=current_user`)).rows[0];
      if(role?.excessive!==false)throw new ControlError(503,'SETUP_BACKFILL_APPLY_PRIVILEGES','Đối soát cần tài khoản database ghi riêng với quyền tối thiểu.');
      return {schemaVersion:manifest.at(-1).version};
    }catch(error){if(error instanceof ControlError)throw error;throw unavailable()}
  }
  async snapshot(workspaceId,clusterId){
    if(!uuidPattern.test(workspaceId??'')||!this.bindings.has(clusterId))throw invalid();
    return (await this.pool.query('SELECT roomqc_control.read_setup_backfill_snapshot($1,$2) AS snapshot',[workspaceId,clusterId])).rows[0].snapshot;
  }
  async apply({key,reportSha256,item}={}){
    if(!uuidPattern.test(key??'')||!digest(reportSha256)||!item||!uuidPattern.test(item.workspaceId??'')
      ||!this.bindings.has(item.clusterId)||!digest(item.snapshotSha256)||!setupBackfillGroups.includes(item.group)
      ||!Number.isSafeInteger(item.routingVersion)||item.routingVersion<1)throw invalid();
    try{
      await this.readiness();
      const snapshot=await this.snapshot(item.workspaceId,item.clusterId);
      const same=snapshot&&snapshot.workspace.routing_version===item.routingVersion&&setupBackfillFingerprint(snapshot)===item.snapshotSha256;
      // Release DB connections before remote receipt reads. Neither this adapter
      // nor the SQL RPC can close a remote dispatch or provision business data.
      const observation=same?await this.observer.observe(snapshot):{status:'unavailable'};
      return (await this.pool.query(`SELECT roomqc_control.apply_setup_backfill($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb) AS result`,
        [key,item.workspaceId,item.clusterId,reportSha256,item.snapshotSha256,item.group,JSON.stringify(this.bindings.get(item.clusterId)),
          same?JSON.stringify(snapshot):null,JSON.stringify(observation)])).rows[0].result;
    }catch(error){
      if(error instanceof ControlError)throw error;
      if(error?.code==='P7502')throw new ControlError(409,'SETUP_BACKFILL_KEY_CONFLICT','Mã lệnh đã được dùng với dữ liệu khác.');
      throw unavailable();
    }
  }
}
