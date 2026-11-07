// Derive the target schema from independently frozen source parts and exactly
// reviewed deltas. Observed target parts are only a comparison, never input.
import assert from 'node:assert/strict';
import {supportTargetCheckDefinitions} from './roomqc-backup-catalog.mjs';
// PostgreSQL bigint bounds exceed JavaScript's exact Number range. Preserve
// their original integer lexemes in both canonical text and comparisons.
export const recoverySchemaStringify=x=>JSON.stringify(x,(_k,v)=>typeof v==='bigint'?JSON.rawJSON(v.toString())
 :v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export function parseRecoverySchemaJSON(text){
 return JSON.parse(text,(_k,v,context)=>{
  if(typeof v!=='number')return v;
  assert(Number.isInteger(v),'RECOVERY_NONINTEGER_SCHEMA_NUMBER');
  if(Number.isSafeInteger(v))return v;
  assert(typeof context?.source==='string'&&/^-?(0|[1-9][0-9]*)$/.test(context.source),'RECOVERY_LOSSLESS_NUMBER_REQUIRED');
  return BigInt(context.source);
 });
}
const canonical=recoverySchemaStringify;
const normalized=rows=>rows.map(canonical).sort();
const constraint='private.platform_support_acceptances.platform_support_acceptances_target_check';
const positions={
 'auth.oauth_clients':[1,...Array.from({length:12},(_,i)=>i+3)],
 'auth.saml_relay_states':[1,2,3,4,5,7,8,9],
 'public.items':[...Array.from({length:24},(_,i)=>i+1),...Array.from({length:19},(_,i)=>i+26)],
 'public.maintenance_requests':[...Array.from({length:12},(_,i)=>i+1),...Array.from({length:20},(_,i)=>i+15)],
};
const sequences=['private.checkout_invoice_numbers','private.subscription_lifecycle_commands_ordinal_seq'];
const setupParts=[];
for(const suffix of ['issuer','installer']){
 const role='rq_contabo_setup_'+suffix;
 setupParts.push(['apiRole',role,{inherit:true,superuser:false,bypassRls:false,createRole:false,createDb:false,replication:false,login:true,config:null}],
  ['apiRoleGrant','roomqc_setup_credential_'+suffix+'.'+role+'.supabase_admin',{admin:false,inherit:true,set:true}]);
}
function parts(rows){
 assert(Array.isArray(rows)&&rows.length>100&&rows.length<100000,'RECOVERY_FROZEN_PARTS_INVALID');
 assert(rows.every(r=>Array.isArray(r)&&r.length===3&&typeof r[0]==='string'&&typeof r[1]==='string'
  &&r[2]&&typeof r[2]==='object'&&(Array.isArray(r[2])?r[0]==='defaultAcl':true)),'RECOVERY_FROZEN_PARTS_INVALID');
 const pending=[rows];
 while(pending.length){const value=pending.pop();
  if(typeof value==='number')assert(Number.isSafeInteger(value),'RECOVERY_LOSSLESS_NUMBER_REQUIRED');
  else if(value&&typeof value==='object')pending.push(...Object.values(value));
 }
 const keys=rows.map(r=>JSON.stringify(r.slice(0,2)));
 assert.equal(new Set(keys).size,keys.length,'RECOVERY_DUPLICATE_PART_IDENTITY');
}
export function recoverySchemaExpectation({frozenParts,approvedSetupDelta}){
 parts(frozenParts);
 assert.deepEqual(normalized(approvedSetupDelta),normalized(setupParts),'RECOVERY_SETUP_DELTA_NOT_REVIEWED');
 const source=structuredClone([...frozenParts,...setupParts]);parts(source);
 const target=structuredClone(source),matches=target.filter(r=>r[0]==='constraint'&&r[1]===constraint);
 assert.equal(matches.length,1,'RECOVERY_REVIEWED_CONSTRAINT_MISSING');
 assert.deepEqual(matches[0][2],{validated:true,definition:supportTargetCheckDefinitions[0]},'RECOVERY_SOURCE_CHECK_NOT_REVIEWED');
 matches[0][2].definition=supportTargetCheckDefinitions[1];
 const reviewedDeltas=[{kind:'constraint',identity:constraint,
  sourceDefinition:supportTargetCheckDefinitions[0],targetDefinition:supportTargetCheckDefinitions[1]}];
 const groups=new Map();
 for(const row of target.filter(r=>r[0]==='column')){
  const table=row[1].slice(0,row[1].lastIndexOf('.'));assert(Number.isSafeInteger(row[2].position)&&row[2].position>0);
  if(!groups.has(table))groups.set(table,[]);groups.get(table).push(row);
 }
 for(const [table,columns] of groups){
  columns.sort((a,b)=>a[2].position-b[2].position);
  if(columns.every((r,i)=>r[2].position===i+1))continue;
  assert(Object.hasOwn(positions,table),'RECOVERY_COLUMN_GAP_NOT_REVIEWED');
  assert.equal(source.find(r=>r[0]==='relation'&&r[1]===table)?.[2].kind,'r','RECOVERY_COLUMN_RELATION_NOT_REVIEWED');
  const sourcePositions=columns.map(r=>r[2].position);
  assert.deepEqual(sourcePositions,positions[table],'RECOVERY_COLUMN_GAP_NOT_REVIEWED');
  const changedColumns=columns.filter((r,i)=>r[2].position!==i+1).length;
  columns.forEach((r,i)=>{r[2].position=i+1});
  reviewedDeltas.push({kind:'physicalColumnOrdinals',identity:table,sourcePositions,targetPositions:columns.map(r=>r[2].position),changedColumns});
 }
 return {before:structuredClone(frozenParts),source,target,reviewedDeltas};
}
// pg_dump omits explicit owner ACLs equal to the actual sequence default.
// Fingerprint v3 uses acldefault('S') (server) instead of 's' (sequence), so
// a NULL ACL is represented as U. Materialize the exact source rwU ACL without
// changing the signed fingerprint function or ignoring permission differences.
export function recoverySequenceAclSQL(sourceParts){
 parts(sourceParts);
 for(const identity of sequences){const row=sourceParts.find(r=>r[0]==='relation'&&r[1]===identity);
  assert(row&&row[2].kind==='S'&&row[2].owner==='postgres','RECOVERY_SEQUENCE_NOT_REVIEWED');
  assert.deepEqual(row[2].acl,['postgres=rwU/postgres'],'RECOVERY_SOURCE_SEQUENCE_ACL_NOT_REVIEWED');
 }
 return `BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='15s';
 SELECT pg_advisory_xact_lock(1380733763,1431507010);
 DO $recovery$ DECLARE name text; rights text[]; BEGIN
 FOREACH name IN ARRAY ARRAY['checkout_invoice_numbers','subscription_lifecycle_commands_ordinal_seq'] LOOP
  SELECT ARRAY(SELECT a::text FROM unnest(coalesce(c.relacl,acldefault('S',c.relowner))) a ORDER BY a::text COLLATE "C") INTO rights
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='private' AND c.relname=name AND c.relkind='S' AND pg_get_userbyid(c.relowner)='postgres';
  IF rights=ARRAY['postgres=rwU/postgres'] THEN CONTINUE; END IF;
  IF rights IS DISTINCT FROM ARRAY['postgres=U/postgres'] THEN RAISE EXCEPTION 'RECOVERY_SEQUENCE_ACL_SOURCE_CHANGED'; END IF;
  EXECUTE format('GRANT SELECT, UPDATE ON SEQUENCE private.%I TO postgres',name);
 END LOOP; END $recovery$; COMMIT;`;
}
export function assertRecoverySchemaParts(expected,observed){
 parts(expected);parts(observed);
 assert.deepEqual(normalized(observed),normalized(expected),'RECOVERY_TARGET_SCHEMA_NOT_REVIEWED');return true;
}
export function recoverySchemaDigestSQL(rows){
 parts(rows);const literal=recoverySchemaStringify(rows).replaceAll("'","''");
 return `SET search_path=pg_catalog;
 SELECT jsonb_build_object('version',3,'managedRealtimePartitionSpec',1,'setupRecoverySpec',1,'postgresMajor',17,
 'migrations',(SELECT coalesce(jsonb_agg(version ORDER BY version COLLATE "C"),'[]'::jsonb) FROM supabase_migrations.schema_migrations),
 'parts',(SELECT jsonb_agg(v ORDER BY (v->>0) COLLATE "C",(v->>1) COLLATE "C",(v->2)::text COLLATE "C")
 FROM jsonb_array_elements('${literal}'::jsonb) v))::text;`;
}
