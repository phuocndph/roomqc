import test from 'node:test';
import assert from 'node:assert/strict';
import {supportTargetCheckDefinitions} from './roomqc-backup-catalog.mjs';
import {recoverySchemaExpectation,assertRecoverySchemaParts,recoverySchemaDigestSQL,parseRecoverySchemaJSON,recoverySchemaStringify,recoverySequenceAclSQL} from './roomqc-recovery-schema-review.mjs';
function fixture(){
 const frozenParts=Array.from({length:101},(_,i)=>['table','public.table'+i,{owner:'postgres',rls:true}]);
 frozenParts.push(['constraint','private.platform_support_acceptances.platform_support_acceptances_target_check',
  {validated:true,definition:supportTargetCheckDefinitions[0]}]);
 frozenParts.push(['defaultAcl','postgres.public.r',[]]);
 for(const name of ['checkout_invoice_numbers','subscription_lifecycle_commands_ordinal_seq'])
  frozenParts.push(['relation','private.'+name,{kind:'S',owner:'postgres',acl:['postgres=rwU/postgres']}]);
 const approvedSetupDelta=[];
 for(const suffix of ['issuer','installer']){
  const name='rq_contabo_setup_'+suffix;
  approvedSetupDelta.push(['apiRole',name,{inherit:true,superuser:false,bypassRls:false,createRole:false,createDb:false,replication:false,login:true,config:null}],
   ['apiRoleGrant','roomqc_setup_credential_'+suffix+'.'+name+'.supabase_admin',{admin:false,inherit:true,set:true}]);
 }
 return {frozenParts,approvedSetupDelta};
}
test('target expectation comes only from frozen source plus four exact role parts and one reviewed CHECK delta',()=>{
 const f=fixture(),saved=structuredClone(f),p=recoverySchemaExpectation(f);assert.deepEqual(f,saved);
 assert.equal(p.reviewedDeltas.length,1);assertRecoverySchemaParts(p.target,[...p.target].reverse());
 assert.equal(p.source.find(r=>r[0]==='constraint')[2].definition,supportTargetCheckDefinitions[0]);
 assert.equal(p.target.find(r=>r[0]==='constraint')[2].definition,supportTargetCheckDefinitions[1]);
 assert(recoverySchemaDigestSQL(p.target).includes('supabase_migrations.schema_migrations'));
});
test('unknown grant, role elevation, duplicate identity or changed CHECK cannot be approved',()=>{
 for(const mutate of [f=>f.approvedSetupDelta[0][2].superuser=true,f=>f.approvedSetupDelta[1][2].admin=true,
  f=>f.approvedSetupDelta.push(['apiRole','unknown',{}]),f=>f.frozenParts.push(structuredClone(f.frozenParts[0])),
  f=>f.frozenParts.find(r=>r[0]==='constraint')[2].validated=false,
  f=>f.frozenParts.find(r=>r[0]==='constraint')[2].definition=supportTargetCheckDefinitions[1]]){
  const f=fixture();mutate(f);assert.throws(()=>recoverySchemaExpectation(f));
 }
});
test('observed target cannot supply an unexpected object, permission, data definition or missing part',()=>{
 const p=recoverySchemaExpectation(fixture());
 for(const mutate of [x=>x[0][2].rls=false,x=>x.pop(),x=>x.push(['table','unexpected',{rls:true}]),
  x=>x.find(r=>r[0]==='constraint')[2].definition=supportTargetCheckDefinitions[0]]){
  const x=structuredClone(p.target);mutate(x);assert.throws(()=>assertRecoverySchemaParts(p.target,x));
 }
});
test('PostgreSQL int64 sequence limits keep every digit and changes beyond Number precision still fail',()=>{
 const text='{"seqmax":9223372036854775807,"seqmin":-9223372036854775808,"increment":1}';
 const limits=parseRecoverySchemaJSON(text);
 assert.equal(limits.seqmax,9223372036854775807n);assert.equal(limits.seqmin,-9223372036854775808n);
 assert(recoverySchemaStringify(limits).includes('9223372036854775807'));
 const f=fixture();f.frozenParts.push(['sequence','public.test_seq',limits]);const p=recoverySchemaExpectation(f);
 assert(recoverySchemaDigestSQL(p.target).includes('9223372036854775807'));
 const changed=structuredClone(p.target);
 changed.find(r=>r[0]==='sequence')[2].seqmax=9223372036854775806n;
 assert.throws(()=>assertRecoverySchemaParts(p.target,changed));
 assert.throws(()=>parseRecoverySchemaJSON('{"bound":1.1}'),/RECOVERY_NONINTEGER_SCHEMA_NUMBER/);
 const lossy=fixture();lossy.frozenParts.push(['sequence','public.test_seq',JSON.parse(text)]);
 assert.throws(()=>recoverySchemaExpectation(lossy),/RECOVERY_LOSSLESS_NUMBER_REQUIRED/);
});
test('only the exact reviewed source column holes compact; column order, type and unknown holes still fail',()=>{
 const f=fixture(),table='auth.oauth_clients',at=[1,...Array.from({length:12},(_,i)=>i+3)];
 f.frozenParts.push(['relation',table,{kind:'r'}]);
 at.forEach((position,i)=>f.frozenParts.push(['column',table+'.c'+i,{position,type:'text',nullable:true}]));
 const p=recoverySchemaExpectation(f),delta=p.reviewedDeltas.find(r=>r.kind==='physicalColumnOrdinals');
 assert.equal(delta.changedColumns,12);assert.deepEqual(delta.sourcePositions,at);
 assert.deepEqual(delta.targetPositions,Array.from({length:13},(_,i)=>i+1));
 for(const change of [x=>x.filter(r=>r[0]==='column')[1][2].position=99,x=>x.filter(r=>r[0]==='column')[1][2].type='integer']){
  const x=structuredClone(p.target);change(x);assert.throws(()=>assertRecoverySchemaParts(p.target,x));
 }
 const unknown=fixture();unknown.frozenParts.push(['column','public.unknown.c',{position:2}]);
 assert.throws(()=>recoverySchemaExpectation(unknown),/RECOVERY_COLUMN_GAP_NOT_REVIEWED/);
 const changed=structuredClone(f);changed.frozenParts.find(r=>r[0]==='column'&&r[2].position===3)[2].position=2;
 assert.throws(()=>recoverySchemaExpectation(changed),/RECOVERY_COLUMN_GAP_NOT_REVIEWED/);
});
test('ACL repair restores only the two exact owner grants and rejects an unexpected source privilege',()=>{
 const p=recoverySchemaExpectation(fixture()),sql=recoverySequenceAclSQL(p.source);
 assert(sql.includes('GRANT SELECT, UPDATE ON SEQUENCE private.%I TO postgres'));
 assert(sql.includes('RECOVERY_SEQUENCE_ACL_SOURCE_CHANGED'));assert(!sql.includes('TO PUBLIC'));
 const changed=structuredClone(p.source);changed.find(r=>r[0]==='relation')[2].acl=['postgres=U/postgres'];
 assert.throws(()=>recoverySequenceAclSQL(changed),/RECOVERY_SOURCE_SEQUENCE_ACL_NOT_REVIEWED/);
});
