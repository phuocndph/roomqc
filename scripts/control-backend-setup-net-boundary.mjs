// Metadata-only matrix for the owned setup-dispatch sandbox. Never use a live DB.
import assert from 'node:assert/strict';

export const setupNetBoundaryCatalogSql=`WITH objects AS (
 SELECT 'schema'::text AS kind,n.oid,0::smallint AS subid,n.nspname::text AS identity,
   n.nspacl::text AS acl,ARRAY['USAGE','CREATE']::text[] AS privileges
   FROM pg_namespace n WHERE n.nspname='net'
 UNION ALL
 SELECT 'routine',p.oid,0::smallint,p.oid::regprocedure::text,p.proacl::text,ARRAY['EXECUTE']
   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='net'
 UNION ALL
 SELECT CASE WHEN c.relkind='S' THEN 'sequence' ELSE 'table' END,c.oid,0::smallint,
   c.oid::regclass::text,c.relacl::text,CASE WHEN c.relkind='S' THEN ARRAY['USAGE','SELECT','UPDATE']
   ELSE ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'] END
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='net' AND c.relkind IN ('r','p','v','m','f','S')
 UNION ALL
 SELECT 'column',c.oid,a.attnum,c.oid::regclass::text||'.'||quote_ident(a.attname),a.attacl::text,
   ARRAY['SELECT','INSERT','UPDATE','REFERENCES'] FROM pg_class c
   JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid
   WHERE n.nspname='net' AND c.relkind IN ('r','p','v','m','f') AND a.attnum>0 AND NOT a.attisdropped
), bits AS (
 SELECT o.kind,o.identity,r.rolname,privilege,CASE o.kind
   WHEN 'schema' THEN has_schema_privilege(r.oid,o.oid,privilege)
   WHEN 'routine' THEN has_function_privilege(r.oid,o.oid,privilege)
   WHEN 'table' THEN has_table_privilege(r.oid,o.oid,privilege)
   WHEN 'sequence' THEN has_sequence_privilege(r.oid,o.oid,privilege)
   WHEN 'column' THEN has_column_privilege(r.oid,o.oid,o.subid,privilege) END AS allowed
   FROM objects o CROSS JOIN pg_roles r CROSS JOIN LATERAL unnest(o.privileges) AS privilege
) SELECT json_build_object('objects',(SELECT count(*) FROM objects),'roles',(SELECT count(*) FROM pg_roles),
 'recoveryBits',(SELECT count(*) FROM bits WHERE rolname='roomqc_setup_recovery' AND allowed),
 'nonRecoveryBits',(SELECT count(*) FROM bits WHERE rolname<>'roomqc_setup_recovery'),
 'nonRecoveryEffectiveSha256',(SELECT encode(sha256(convert_to(jsonb_agg(to_jsonb(b)
   ORDER BY kind COLLATE "C",identity COLLATE "C",rolname COLLATE "C",privilege COLLATE "C")::text,'UTF8')),'hex')
   FROM bits b WHERE rolname<>'roomqc_setup_recovery'),
 'aclSha256',(SELECT encode(sha256(convert_to(jsonb_agg(jsonb_build_array(kind,identity,acl)
   ORDER BY kind COLLATE "C",identity COLLATE "C")::text,'UTF8')),'hex') FROM objects));`;

export async function rehearseSetupNetBoundary({sql,migration}){
 const before=JSON.parse(await sql(setupNetBoundaryCatalogSql));
 const queueBefore=await sql('SELECT count(*) FROM net.http_request_queue;');
 assert.ok(before.objects>10&&before.recoveryBits>0,'The native pre-upgrade fixture must reproduce inherited pg_net access');
 let injectedFaultReached=false;
 try{
  await sql(`BEGIN;
   CREATE ROLE "roomqc owned net noinherit" NOLOGIN NOINHERIT;
   CREATE TABLE net.roomqc_owned_column_fixture(a text,b text);
   REVOKE ALL ON net.roomqc_owned_column_fixture FROM PUBLIC;
   GRANT SELECT(a),UPDATE(b) ON net.roomqc_owned_column_fixture TO PUBLIC;
   GRANT USAGE ON SCHEMA net TO roomqc_setup_recovery;
   GRANT SELECT ON net.roomqc_owned_column_fixture TO roomqc_setup_recovery;
   ${migration}
   DO $check$ BEGIN
    IF NOT has_column_privilege('roomqc owned net noinherit','net.roomqc_owned_column_fixture','a','SELECT')
      OR NOT has_column_privilege('roomqc owned net noinherit','net.roomqc_owned_column_fixture','b','UPDATE')
      OR has_column_privilege('roomqc owned net noinherit','net.roomqc_owned_column_fixture','b','SELECT')
      OR has_any_column_privilege('roomqc_setup_recovery','net.roomqc_owned_column_fixture','SELECT,INSERT,UPDATE,REFERENCES')
      OR has_schema_privilege('roomqc_setup_recovery','net','USAGE,CREATE') THEN
      RAISE EXCEPTION 'NET_BOUNDARY_COLUMN_OR_NOINHERIT_FAILURE';
    END IF;
   END $check$;
   SET LOCAL ROLE "roomqc owned net noinherit";
   SELECT a FROM net.roomqc_owned_column_fixture;
   UPDATE net.roomqc_owned_column_fixture SET b='owned rollback only';
   SELECT net.http_get('http://127.0.0.1:9/owned-uncommitted-noinherit');
   RESET ROLE;
   SELECT 1/0;
   COMMIT;`);
 }catch(error){
  injectedFaultReached=/\b22012\b/.test(error.result?.stderr??'');
  if(!injectedFaultReached)throw error;
 }
 assert.equal(injectedFaultReached,true,'All assertions must run before the deliberate transaction rollback');
 const after=JSON.parse(await sql(setupNetBoundaryCatalogSql));
 assert.deepEqual(after,before,'Fault must roll back ACLs, column grants, objects and roles');
 assert.equal(await sql('SELECT count(*) FROM net.http_request_queue;'),queueBefore,'Rolled-back HTTP requests cannot reach the worker');
 return {verified:true,injectedFaultSqlstate:'22012',noinheritAndColumnOnlyPreserved:true,
   directRecoveryGrantRemoved:true,uncommittedHttpQueueRolledBack:true,sequenceMayAdvanceOnRollback:true,rollbackVerified:true,before};
}
