// Test-only hooks in the exact-owned disposable business DB. They are created
// BEFORE the fixture release is approved, remain in its fingerprint, and are
// removed before the outer schema comparison. No product debug surface exists.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,lstat} from 'node:fs/promises';
import pg from 'pg';
import {ReleaseApprovalStore} from '../release-authority.mjs';
import {fixtureReleaseApproval,fixtureReleaseTrust} from '../release-test-fixtures.mjs';

export async function installInstallerRollbackFixture(db){
 await db.query(`CREATE TABLE private.installer_native_fault_flags (
  command_key uuid PRIMARY KEY,phase text NOT NULL CHECK(phase IN ('command','audit','statement'))
 );
 REVOKE ALL ON private.installer_native_fault_flags FROM PUBLIC;
 GRANT SELECT ON private.installer_native_fault_flags TO roomqc_setup_credential_owner;
 CREATE SEQUENCE private.installer_native_fault_witness;
 REVOKE ALL ON SEQUENCE private.installer_native_fault_witness FROM PUBLIC;
 GRANT USAGE ON SEQUENCE private.installer_native_fault_witness TO roomqc_setup_credential_owner;
 CREATE FUNCTION private.installer_native_rollback_fault() RETURNS trigger
 LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $fixture$
 DECLARE k uuid;phase_name text;fault_phase text;request_value jsonb;result_value jsonb;
 BEGIN
  IF TG_TABLE_NAME='setup_recovery_commands' THEN
   k:=NEW.key;phase_name:='command';request_value:=NEW.request;result_value:=NEW.result;
  ELSE
   k:=NEW.command_key;phase_name:='audit';
  END IF;
  SELECT f.phase INTO fault_phase FROM private.installer_native_fault_flags f WHERE f.command_key=k;
  IF fault_phase IS NULL OR NOT (fault_phase=phase_name OR fault_phase='statement' AND phase_name='command') THEN RETURN NEW; END IF;
  IF phase_name='audit' THEN
   SELECT request,result INTO STRICT request_value,result_value FROM private.setup_recovery_commands WHERE key=k;
  END IF;
  -- The witness advances ONLY after observing all earlier issue mutations in
  -- this same transaction. A preflight denial cannot satisfy the assertion.
  IF request_value->>'operation'<>'issue' OR request_value->>'predecessorId' IS NULL
   OR NOT EXISTS(SELECT 1 FROM private.setup_recovery_management m
     WHERE m.singleton AND m.version=(result_value->>'version')::bigint
      AND m.head_credential_id=(result_value->>'credentialId')::uuid)
   OR NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials c
     WHERE c.id=(result_value->>'credentialId')::uuid)
   OR NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials c
     WHERE c.id=(request_value->>'predecessorId')::uuid
      AND c.retire_after=(result_value->>'overlapDeadline')::timestamptz) THEN
   RAISE EXCEPTION 'INSTALLER_FIXTURE_MUTATIONS_NOT_REACHED';
  END IF;
  -- PostgreSQL sequences deliberately survive statement rollback. This is a
  -- fixture witness, never an application journal or fabricated audit event.
  PERFORM pg_catalog.nextval('private.installer_native_fault_witness');
  IF fault_phase='statement' THEN
   -- The actual session statement_timeout must cancel this real server sleep.
   -- The nontransactional witness proves prior mutations were reached first.
   PERFORM pg_catalog.pg_sleep(6);
   RAISE EXCEPTION 'INSTALLER_FIXTURE_STATEMENT_TIMEOUT_NOT_ENFORCED';
  END IF;
  RAISE EXCEPTION 'INSTALLER_FIXTURE_ROLLBACK_FAULT';
 END $fixture$;
 REVOKE ALL ON FUNCTION private.installer_native_rollback_fault() FROM PUBLIC;
 CREATE TRIGGER installer_native_command_fault BEFORE INSERT ON private.setup_recovery_commands
  FOR EACH ROW EXECUTE FUNCTION private.installer_native_rollback_fault();
 CREATE TRIGGER installer_native_audit_fault BEFORE INSERT ON private.setup_recovery_credential_audit
  FOR EACH ROW EXECUTE FUNCTION private.installer_native_rollback_fault();`);
 return {async cleanup(){
  await db.query(`DROP TRIGGER installer_native_command_fault ON private.setup_recovery_commands;
   DROP TRIGGER installer_native_audit_fault ON private.setup_recovery_credential_audit;
   DROP FUNCTION private.installer_native_rollback_fault();
   DROP TABLE private.installer_native_fault_flags;
   DROP SEQUENCE private.installer_native_fault_witness;`);
 }};
}

export async function runInstallerRollbackFaults(c){
 const {db,maintenance,config,issuerConfig,issue,base,json,run,businessState,until,names,check,fingerprint}=c;
 assert.equal((await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value,fingerprint);
 await until(async()=>(await db.query(`SELECT NOT EXISTS(SELECT 1 FROM private.setup_recovery_credentials c
  JOIN private.setup_recovery_management m ON m.singleton WHERE c.id<>m.head_credential_id AND c.revoked_at IS NULL
   AND c.expires_at>clock_timestamp() AND (c.retire_after IS NULL OR c.retire_after>clock_timestamp())) AS ready`)).rows[0].ready,
  'rollback-predecessor-overlap-ended',15000);
 const head=(await db.query('SELECT version,head_credential_id FROM private.setup_recovery_management WHERE singleton')).rows[0];
 const command={...issue,...base('issue',Number(head.version)),predecessorId:head.head_credential_id},file=await json('rollback-issue.json',command);
 const published=await readFile(config.publisher.outputFile,'utf8'),before=await businessState();
 const witness=async()=>{const row=(await maintenance.query('SELECT last_value::text,is_called FROM private.installer_native_fault_witness')).rows[0];
  return row.is_called?Number(row.last_value):0};
 const observations=[];
 for(const phase of ['command','audit']){
  await maintenance.query('INSERT INTO private.installer_native_fault_flags(command_key,phase) VALUES($1,$2) ON CONFLICT(command_key) DO UPDATE SET phase=excluded.phase',[command.key,phase]);
  const count=await witness(),failed=await run(issuerConfig,file);
  assert.equal(failed.exit.code,1);assert.equal(failed.value.code,'SETUP_INSTALLER_OUTCOME_UNKNOWN');
  assert.deepEqual(failed.value.recovery,{operation:'issue',key:command.key,sameCommandRequired:true});
  await until(async()=>(await db.query('SELECT 1 FROM pg_stat_activity WHERE usename=$1',[names.issuer])).rowCount===0,'rollback-'+phase+'-backend-terminal');
  assert.equal(await witness(),count+1,'rollback hook must observe earlier native mutations');
  assert.deepEqual(await businessState(),before);assert.equal(await readFile(config.publisher.outputFile,'utf8'),published);
  observations.push({phase,priorMutationsObserved:true,backendTerminal:true,allManagementStateRolledBack:true,outputUnchanged:true});
  check('actual-cli-'+phase+'-insert-fault-observes-prior-mutations-and-rolls-back-entire-transaction');
 }
 await maintenance.query('DELETE FROM private.installer_native_fault_flags WHERE command_key=$1',[command.key]);
 const recovered=await run(issuerConfig,file);assert.equal(recovered.exit.code,0);assert.equal(recovered.value.nativeRpcVerified,true);
 const after=await businessState(),effects=(await db.query(`SELECT
  (SELECT count(*)::int FROM private.setup_recovery_commands WHERE key=$1) AS commands,
  (SELECT count(*)::int FROM private.setup_recovery_credential_audit WHERE command_key=$1) AS audits`,[command.key])).rows[0];
 assert.deepEqual(effects,{commands:1,audits:1});assert.equal(after.credentials.length,before.credentials.length+1);
 assert.equal(after.management[0].version,Number(head.version)+1);assert.notEqual(after.management[0].head_credential_id,head.head_credential_id);
 assert.equal(after.credentials.find(r=>r.id===head.head_credential_id).retire_after!==before.credentials.find(r=>r.id===head.head_credential_id).retire_after,true);
 check('same-command-after-command-and-audit-rollback-commits-one-credential-command-audit-and-native-rpc');
 const exact=await readFile(config.publisher.outputFile,'utf8'),replay=await run(issuerConfig,file);assert.equal(replay.exit.code,0);
 assert.deepEqual(await businessState(),after);assert.equal(await readFile(config.publisher.outputFile,'utf8'),exact);
 assert.equal(await witness(),2);assert.equal((await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value,fingerprint);
 check('rollback-recovery-replay-preserves-exact-credential-expiry-and-approved-fixture-schema');
 return {verified:true,groups:['IF16'],testOnlySchemaApprovedBeforeCommands:true,nontransactionalWitness:true,
  observations,sameKeyRecovery:true,singleCommandAuditCredential:true,fixtureRemoved:false};
}

export async function runInstallerKeyWithdrawal(c){
 const {directory,config,context,json,run,issueFile,checkFile,businessState,check,names,password,database}=c;
 const authority=(await directory.query('SELECT to_jsonb(a) AS value FROM roomqc_control.release_authority a WHERE cluster_id=$1',[context.clusterId])).rows[0].value;
 // Epoch4 leaves epoch2 for the independent expiry fixture. Baseline key1 is
 // never revoked or revived; the alternate key's revocation remains immutable.
 const approval=fixtureReleaseApproval(context,{epoch:4},'test-rotated-key'),verified=fixtureReleaseTrust.verify(approval,context);
 const writer=new pg.Pool({host:'db',database,user:names.api,password,max:1,statement_timeout:8000});
 const store=new ReleaseApprovalStore(writer,fixtureReleaseTrust),options={expectedVersion:0,key:randomUUID(),requestId:randomUUID(),reason:'Owned native fixture key withdrawal'};
 const snapshot=async()=>(await directory.query(`SELECT jsonb_build_object(
  'authority',(SELECT jsonb_agg(to_jsonb(r)) FROM roomqc_control.release_authority r),
  'policies',(SELECT jsonb_agg(to_jsonb(r)) FROM roomqc_control.cluster_policies r),
  'commands',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM roomqc_control.release_commands r),
  'revocations',(SELECT jsonb_agg(to_jsonb(r) ORDER BY key_fingerprint) FROM roomqc_control.release_key_revocations r),
  'events',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM roomqc_control.cluster_events r)) AS value`)).rows[0].value;
 try{
  await directory.query('INSERT INTO roomqc_control.cluster_policies(cluster_id,tenant_limit) VALUES($1,99) ON CONFLICT(cluster_id) DO NOTHING',[context.clusterId]);
  await directory.query(`INSERT INTO roomqc_control.release_approvals(approval_id,cluster_id,epoch,envelope_digest,issuer_id,key_id,key_fingerprint,
   inventory_ref,host_id,environment,endpoint_fingerprint,expectation_fingerprint,expected,not_before_ms,expires_at_ms)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15)`,
   [verified.approvalId,verified.clusterId,verified.epoch,verified.envelopeDigest,verified.issuerId,verified.keyId,verified.keyFingerprint,
    verified.inventoryRef,verified.hostId,verified.environment,verified.endpointFingerprint,verified.expectationFingerprint,
    JSON.stringify(verified.expected),verified.notBefore,verified.expiresAt]);
  await directory.query("UPDATE roomqc_control.release_authority SET approval_id=$1,epoch=4,state='active' WHERE cluster_id=$2",[verified.approvalId,context.clusterId]);
  const file=await json('alternate-key-config.json',{...config,target:{...config.target,approval}}),before=await businessState(),positive=await run(file,checkFile);
  assert.equal(positive.exit.code,0);assert.equal(positive.value.preflightVerified,true);assert.deepEqual(await businessState(),before);
  check('alternate-fixture-key-passes-actual-cli-before-key-withdrawal');
  const withdrawn=await store.withdrawKey(verified.keyFingerprint,options);assert.equal(withdrawn.replayed,false);assert.equal(withdrawn.affected.length,1);
  const durable=await snapshot();assert.equal(durable.authority[0].state,'withdrawn');assert.equal(durable.revocations.length,1);
  assert.equal(durable.commands.length,1);assert.equal(durable.events.filter(r=>r.type==='release_key_withdrawn').length,1);
  assert.equal(durable.policies[0].manual_closed,true);assert.equal(durable.policies[0].operator_reopen_required,true);
  assert.deepEqual(await businessState(),before);check('actual-api-login-key-withdrawal-closes-admission-and-persists-single-command-event-revocation');
  const deny=async()=>{const failed=await run(file,issueFile);assert.equal(failed.exit.code,1);assert.equal(failed.value.code,'SETUP_INSTALLER_AUTHORITY_CHANGED');
   assert.deepEqual(await businessState(),before);await assert.rejects(()=>lstat(config.publisher.outputFile),{code:'ENOENT'})};
  await deny();assert.deepEqual(await snapshot(),durable);check('withdrawn-key-denies-actual-issue-before-business-effects-or-output');
  const replay=await store.withdrawKey(verified.keyFingerprint,options);assert.equal(replay.replayed,true);assert.equal(replay.commandId,withdrawn.commandId);
  assert.deepEqual(await snapshot(),durable);check('same-key-withdrawal-replay-retains-exact-single-directory-effect');
  // Deliberate superuser fixture bypass, NOT an available legal reactivation.
  // Isolate the revoked-key predicate from withdrawn state/epoch predicates.
  const client=await directory.connect();try{await client.query('BEGIN');await client.query('SET LOCAL session_replication_role=replica');
   await client.query("UPDATE roomqc_control.release_authority SET epoch=4,state='active' WHERE cluster_id=$1",[context.clusterId]);await client.query('COMMIT');
  }catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}
  const adversarial=await snapshot();await deny();assert.deepEqual(await snapshot(),adversarial);
  assert.deepEqual(adversarial.revocations,durable.revocations);check('privileged-fixture-active-pointer-cannot-bypass-immutable-key-revocation');
  return {verified:true,groups:['IF10'],actualApiLoginWithdrawal:true,alternateKeyPositiveControl:true,immutableRevocationRetained:true,
   singleDirectoryEffect:true,businessEffectsUnchanged:true,fixtureBypassLabelled:true,baselineKeyNeverRevoked:true};
 }finally{
  await writer.end();
  // Isolated fixture teardown restores the distinct, never-revoked baseline.
  await directory.query(`UPDATE roomqc_control.release_authority a SET approval_id=r.approval_id,epoch=r.epoch,
   row_version=r.row_version,state=r.state,updated_at=r.updated_at FROM jsonb_populate_record(NULL::roomqc_control.release_authority,$1::jsonb) r
   WHERE a.cluster_id=r.cluster_id`,[authority]);
 }
}
