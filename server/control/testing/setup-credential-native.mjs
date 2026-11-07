// Real, disposable business DB logins and PostgREST. No serving secret or role.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash,createHmac} from 'node:crypto';
import {spawn} from 'node:child_process';
import pg from 'pg';
import {recoveryBinding} from '../setup-recovery.mjs';
import {verifyReleaseManifest} from '../release-manifest.mjs';
import {runSetupPublicationNativeChecks} from './setup-publication-native.mjs';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(read,label,timeout=12000){
  const end=Date.now()+timeout;
  while(Date.now()<end){const value=await read();if(value)return value;await sleep(20)}
  throw new Error('CREDENTIAL_NATIVE_TIMEOUT_'+label);
}
const command=(operation,version,target,extra={})=>({version:1,operation,key:randomUUID(),requestId:randomUUID(),
  reason:'Owned credential management diagnostic',expectedVersion:version,...target,...extra});
const fingerprint=value=>createHash('sha256').update(value).digest('hex');

export async function runSetupCredentialNativeChecks({input,db,recoveryCluster,recoveryExpected,snapshot,record,recoveryHeld,account,metadata}){
  const checks=[],kills=[],barriers=[];
  const check=(label,condition=true)=>{assert.ok(condition,'CREDENTIAL_NATIVE_'+label);checks.push({label,passed:true});record('credential-'+label)};
  const names={issuer:'rq_issuer_'+input.run,installer:'rq_installer_'+input.run,other:'rq_other_'+input.run,mixed:'rq_mixed_'+input.run};
  const password=randomBytes(32).toString('hex'),pools=[],created=[];
  // Only the fixture uses the privileged maintenance session to create and
  // grant disposable logins. Actual commands below always use narrow logins.
  const maintenance=new pg.Pool({host:'db',database:'postgres',user:'supabase_admin',password:input.databasePassword,max:1,
    statement_timeout:18000,connectionTimeoutMillis:3000});maintenance.on('error',()=>{});
  const options=user=>({host:'db',database:'postgres',user,password,max:2,statement_timeout:18000,connectionTimeoutMillis:3000,
    application_name:'credential-'+user});
  const pool=user=>{const value=new pg.Pool(options(user));value.on('error',()=>{});pools.push(value);return value};
  const sql=(client,operation,payload)=>client.query('SELECT roomqc_setup_admin.'+operation+'($1::jsonb) AS result',[payload]).then(r=>r.rows[0].result);
  const live=client=>client.query('SELECT roomqc_setup_admin.status() AS result').then(r=>r.rows[0].result);
  const state=async()=>({
    management:(await db.query('SELECT to_jsonb(t) AS value FROM private.setup_recovery_management t')).rows,
    credentials:(await db.query('SELECT to_jsonb(t) AS value FROM private.setup_recovery_credentials t ORDER BY id')).rows,
    commands:(await db.query('SELECT to_jsonb(t) AS value FROM private.setup_recovery_commands t ORDER BY key')).rows,
    audit:(await db.query('SELECT to_jsonb(t) AS value FROM private.setup_recovery_credential_audit t ORDER BY command_key')).rows});
  const denied=async(label,work,pattern)=>{
    const before=await state();let error;
    try{await work()}catch(value){error=value}
    assert.ok(error&&pattern.test(error.message),'CREDENTIAL_EXPECTED_DENIAL_'+label);
    assert.deepEqual(await state(),before);check(label);
  };
  const binding=recoveryBinding(recoveryCluster,recoveryExpected);
  const target={clusterId:binding.clusterId,bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint};
  const mint=result=>{
    const body=[{alg:'HS256',typ:'JWT'},{role:'roomqc_setup_recovery',aud:'authenticated',iss:'roomqc-setup-recovery/v1',
      jti:result.credentialId,cluster_id:result.clusterId,binding_sha256:result.bindingSha256,iat:result.iat,exp:result.exp}]
      .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return body+'.'+createHmac('sha256',input.jwtSecret).update(body).digest('base64url');
  };
  const receipt=async token=>{
    const response=await fetch('http://127.0.0.1:8000/rest/v1/rpc/receipt',{
      method:'POST',signal:AbortSignal.timeout(5000),headers:{apikey:input.publishableKey,authorization:'Bearer '+token,
        'Content-Profile':'roomqc_setup','content-type':'application/json'},body:JSON.stringify({p_workspace_id:randomUUID()})});
    await response.text();return response.status;
  };
  const issueCommand=(version,predecessorId,extra={})=>command('issue',version,target,{predecessorId,ttlSeconds:3600,overlapSeconds:10,
    signerAlgorithm:'HS256',signerFingerprint:fingerprint(input.jwtSecret),...extra});
  const close=metadata(await account('credential-revoke-lock'));
  const beforeBusiness=await snapshot();
  let issuer,installer,other,mixed,primaryFailure=false;
  // The full installer matrix is a separate diagnostic with its own database,
  // roles and filesystem fixture. Do not nest it here: sharing the credential
  // composite's authority/rotation state makes the two fixtures order
  // dependent and can turn a valid standalone result into a false composite
  // failure. The setup-dispatch report links to the standalone artifact.
  const installerCli={verified:false,status:'NOT_RUN',reason:'standalone setup-installer diagnostic is run separately'};
  try{
    for(const [kind,name]of Object.entries(names)){
      assert.match(name,/^rq_(issuer|installer|other|mixed)_[a-f0-9]{12}$/);
      await maintenance.query('CREATE ROLE '+name+' LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD \''+password+'\'');created.push(name);
      await maintenance.query('GRANT '+(kind==='installer'?'roomqc_setup_credential_installer':'roomqc_setup_credential_issuer')+' TO '+name);
    }
    await maintenance.query('GRANT service_role TO '+names.mixed);
    issuer=pool(names.issuer);installer=pool(names.installer);other=pool(names.other);mixed=pool(names.mixed);
    const roleRows=(await db.query(`SELECT rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
      FROM pg_roles WHERE rolname=ANY($1::text[]) ORDER BY rolname`,[['roomqc_setup_credential_owner','roomqc_setup_credential_issuer','roomqc_setup_credential_installer']])).rows;
    check('dedicated-capability-roles-have-no-login-or-elevated-attributes',roleRows.length===3&&roleRows.every(r=>
      !r.rolcanlogin&&!r.rolsuper&&!r.rolcreatedb&&!r.rolcreaterole&&!r.rolreplication&&!r.rolbypassrls));
    const assumable=(await db.query(`SELECT count(*)::int AS count FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
      WHERE r.rolname='roomqc_setup_credential_owner' AND (m.set_option OR m.inherit_option)`)).rows[0].count;
    check('temporary-function-owner-set-and-inherit-grants-are-removed',assumable===0);
    const beforeAuthority=(await db.query('SELECT cluster_id,binding_sha256 FROM private.setup_recovery_authority WHERE singleton')).rows[0];
    const bind=command('bind',0,target,{expectedClusterId:beforeAuthority?.cluster_id??null,expectedBindingSha256:beforeAuthority?.binding_sha256??null});
    await denied('issuer-cannot-change-binding',()=>sql(issuer,'bind',bind),/permission denied/);
    await denied('installer-cannot-issue',()=>sql(installer,'issue',issueCommand(0,null)),/permission denied/);
    await denied('mixed-service-role-login-denied',()=>sql(mixed,'issue',issueCommand(0,null)),/SETUP_CREDENTIAL_OPERATOR_DENIED/);
    await denied('runtime-cannot-call-maintenance-schema',async()=>{
      const connection=await db.connect();
      try{await connection.query('BEGIN');await connection.query('SET LOCAL ROLE service_role');await sql(connection,'bind',bind)}
      finally{await connection.query('ROLLBACK');connection.release()}
    },/permission denied/);
    await denied('issuer-cannot-write-credential-table-directly',()=>issuer.query('UPDATE private.setup_recovery_credentials SET revoked_at=NULL'),/permission denied/);
    const beforeStatus=await state(),initialStatus=await live(issuer);
    check('live-status-reports-unbound-instead-of-trusting-existing-credential-rows',initialStatus.ready===false&&initialStatus.reasonCode==='UNBOUND'
      &&initialStatus.version===0&&initialStatus.historicalResult===false&&initialStatus.credential===null);
    assert.deepEqual(await state(),beforeStatus);check('live-status-keeps-all-management-and-credential-data-unchanged');
    await denied('mixed-service-role-login-cannot-read-maintenance-status',()=>live(mixed),/SETUP_CREDENTIAL_OPERATOR_DENIED/);
    const readOnly=await issuer.connect();
    try{await readOnly.query('BEGIN READ ONLY');check('status-runs-on-read-only-operator-transaction',(await live(readOnly)).reasonCode==='UNBOUND')}
    finally{await readOnly.query('ROLLBACK');readOnly.release()}
    // The actual fingerprint includes both recovery interfaces, their owners,
    // ACLs and the connected capability role graph. A signed expectation is
    // still a fixture here; hash observations never approve themselves.
    const baseline=(await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value;
    const approved={clusterId:recoveryCluster.id,releaseId:'owned-v3-attestation',artifactDigest:'1'.repeat(64),
      frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:baseline};
    const nonce='4'.repeat(64);
    await db.query(`INSERT INTO private.roomqc_release_manifest(cluster_id,release_id,contract_version,schema_fingerprint_version,
      artifact_digest,frontend_artifact_digest,migration_set_hash,expected_schema_hash) VALUES($1,$2,3,3,$3,$4,$5,$6)`,
      [approved.clusterId,approved.releaseId,approved.artifactDigest,approved.frontendArtifactDigest,approved.migrationSetHash,baseline]);
    try{
      const body=[{alg:'HS256',typ:'JWT'},{role:'roomqc_control_probe',exp:Math.floor(Date.now()/1000)+120}]
        .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
      const probe=body+'.'+createHmac('sha256',input.jwtSecret).update(body).digest('base64url');
      const response=await fetch('http://127.0.0.1:8000/rest/v1/rpc/control_cluster_manifest',{method:'POST',signal:AbortSignal.timeout(5000),
        headers:{apikey:input.publishableKey,authorization:'Bearer '+probe,'content-type':'application/json'},body:JSON.stringify({p_challenge:nonce})});
      assert.equal(response.status,200);
      check('actual-postgrest-manifest-and-runtime-verifier-require-v3',verifyReleaseManifest(await response.json(),approved,nonce).schemaFingerprintVersion===3);
      const statusDefinition=(await maintenance.query("SELECT pg_get_functiondef('roomqc_setup_admin.status()'::regprocedure) AS value")).rows[0].value;
      const driftCases=[
        ['recovery-schema-acl-drift-changes-approved-hash','GRANT USAGE ON SCHEMA roomqc_setup TO anon'],
        ['maintenance-schema-acl-drift-changes-approved-hash','GRANT USAGE ON SCHEMA roomqc_setup_admin TO anon'],
        ['recovery-rpc-grant-drift-changes-approved-hash','GRANT EXECUTE ON FUNCTION roomqc_setup.receipt(uuid) TO PUBLIC'],
        ['maintenance-rpc-search-path-drift-changes-approved-hash','ALTER FUNCTION roomqc_setup_admin.status() SET search_path=public'],
        ['maintenance-rpc-owner-drift-changes-approved-hash','ALTER FUNCTION roomqc_setup_admin.status() OWNER TO postgres'],
        ['maintenance-rpc-body-drift-changes-approved-hash',statusDefinition.replace('RETURN v_result;',"RETURN v_result || '{\"drift\":true}'::jsonb;")],
        ['credential-capability-attribute-drift-changes-approved-hash','ALTER ROLE roomqc_setup_credential_issuer INHERIT'],
        ['credential-capability-membership-drift-changes-approved-hash','GRANT authenticated TO roomqc_setup_credential_installer'],
        ['maintenance-default-grant-drift-changes-approved-hash','ALTER DEFAULT PRIVILEGES IN SCHEMA roomqc_setup_admin GRANT EXECUTE ON FUNCTIONS TO anon']
      ];
      for(const [label,mutation]of driftCases){
        const client=await maintenance.connect();
        try{
          await client.query('BEGIN');await client.query(mutation);
          const observed=(await client.query('SELECT public.control_cluster_manifest($1) AS value',[nonce])).rows[0].value;
          assert.notEqual(observed.schemaManifestHash,baseline,label);assert.equal(observed.expectedSchemaManifestHash,baseline);
          assert.throws(()=>verifyReleaseManifest(observed,approved,nonce),error=>error.code==='RELEASE_MANIFEST_MISMATCH');check(label);
        }finally{await client.query('ROLLBACK');client.release()}
        assert.equal((await db.query('SELECT private.roomqc_schema_fingerprint() AS value')).rows[0].value,baseline);
      }
      check('all-nine-recovery-catalog-faults-rollback-to-same-v3-hash');
      for(const version of [1,2]){
        await db.query('UPDATE private.roomqc_release_manifest SET schema_fingerprint_version=$1',[version]);
        await assert.rejects(()=>db.query('SELECT public.control_cluster_manifest($1)',[nonce]),error=>error.code==='55000');
      }
      check('retained-v1-and-v2-release-metadata-fail-closed');
    }finally{await db.query('DELETE FROM private.roomqc_release_manifest WHERE singleton')}
    const bound=await sql(installer,'bind',bind);check('binding-command-revokes-previous-credentials-and-pins-release',bound.version===1&&bound.operation==='bind');
    check('binding-with-no-head-is-not-ready',(await live(installer)).reasonCode==='CREDENTIAL_MISSING');
    const firstCommand=issueCommand(1,null),first=await sql(issuer,'issue',firstCommand),firstToken=mint(first);
    const issued=(await db.query('SELECT * FROM private.setup_recovery_credentials WHERE id=$1',[first.credentialId])).rows[0];
    check('issued-claims-and-durable-row-match-database-clock',first.exp-first.iat===3600&&issued.not_before.getTime()===first.iat*1000
      &&issued.expires_at.getTime()===first.exp*1000&&first.historicalResult===true);
    check('newly-issued-token-is-accepted-by-real-postgrest',await receipt(firstToken)===200);
    const publication=await runSetupPublicationNativeChecks({input,options:options(names.issuer),
      target:{cluster:recoveryCluster,expected:recoveryExpected,allowLocal:true},receipt:first,issuer,
      record:label=>check(label)});
    const liveIssued=await live(issuer);check('live-status-matches-current-head-and-database-observation',liveIssued.ready===true&&liveIssued.reasonCode===null
      &&liveIssued.credential.id===first.credentialId&&liveIssued.version===2&&liveIssued.bindingSha256===target.bindingSha256
      &&Math.abs(Date.parse(liveIssued.observedAt)-Date.now())<5000&&Date.parse(liveIssued.credential.expiresAt)===first.exp*1000);
    const adminResponse=await fetch('http://127.0.0.1:8000/rest/v1/rpc/status',{method:'POST',signal:AbortSignal.timeout(5000),
      headers:{apikey:input.publishableKey,authorization:'Bearer '+firstToken,'content-type':'application/json','Content-Profile':'roomqc_setup_admin'},body:'{}'});
    const adminBody=await adminResponse.json();check('maintenance-status-schema-is-not-exposed-by-actual-postgrest',adminResponse.status===406&&adminBody.code==='PGRST106');
    const parallel=await Promise.all([sql(issuer,'issue',firstCommand),sql(issuer,'issue',firstCommand)]);
    check('parallel-same-key-replays-exact-immutable-result',parallel.every(r=>JSON.stringify(r)===JSON.stringify(first)));
    const safeReceipt=(await issuer.query('SELECT roomqc_setup_admin.receipt($1) AS value',[firstCommand.key])).rows[0].value;
    check('receipt-is-caller-scoped-and-historical',JSON.stringify(safeReceipt)===JSON.stringify(first)
      &&(await other.query('SELECT roomqc_setup_admin.receipt($1) AS value',[firstCommand.key])).rows[0].value===null);
    await denied('another-issuer-cannot-reuse-key',()=>sql(other,'issue',firstCommand),/SETUP_CREDENTIAL_KEY_CONFLICT/);
    await denied('same-key-different-body-is-rejected',()=>sql(issuer,'issue',{...firstCommand,reason:'Changed owned diagnostic reason'}),/SETUP_CREDENTIAL_KEY_CONFLICT/);
    await denied('stale-version-is-rejected',()=>sql(issuer,'issue',issueCommand(1,first.credentialId)),/SETUP_CREDENTIAL_VERSION_CONFLICT/);
    await denied('wrong-release-is-rejected',()=>sql(issuer,'issue',{...issueCommand(2,first.credentialId),releaseSha256:'f'.repeat(64)}),/SETUP_CREDENTIAL_TARGET_CONFLICT/);
    await denied('wrong-predecessor-is-rejected',()=>sql(issuer,'issue',issueCommand(2,randomUUID())),/SETUP_CREDENTIAL_PREDECESSOR_CONFLICT/);
    await denied('lifetime-over-one-hour-is-rejected',()=>sql(issuer,'issue',issueCommand(2,first.credentialId,{ttlSeconds:3601})),/SETUP_CREDENTIAL_COMMAND_INVALID/);
    await denied('overlap-over-sixty-seconds-is-rejected',()=>sql(issuer,'issue',issueCommand(2,first.credentialId,{overlapSeconds:61})),/SETUP_CREDENTIAL_COMMAND_INVALID/);
    await denied('numeric-hash-instead-of-string-is-rejected',()=>sql(issuer,'issue',{...issueCommand(2,first.credentialId),bindingSha256:1e63}),/SETUP_CREDENTIAL_COMMAND_INVALID/);
    const secondCommand=issueCommand(2,first.credentialId),second=await sql(issuer,'issue',secondCommand),secondToken=mint(second);
    const retirement=(await db.query('SELECT retire_after,expires_at FROM private.setup_recovery_credentials WHERE id=$1',[first.credentialId])).rows[0];
    check('rotation-commits-bounded-overlap-in-database',second.version===3&&retirement.retire_after.getTime()===Date.parse(second.overlapDeadline)
      &&retirement.retire_after.getTime()<=second.iat*1000+10000&&retirement.expires_at.getTime()===first.exp*1000);
    check('status-follows-new-head-during-overlap',(await live(issuer)).credential.id===second.credentialId);
    check('both-credentials-work-inside-approved-overlap',await receipt(firstToken)===200&&await receipt(secondToken)===200);
    await denied('third-live-credential-cannot-extend-overlap',()=>sql(issuer,'issue',issueCommand(3,second.credentialId)),/SETUP_CREDENTIAL_OVERLAP_BUSY/);
    await until(async()=>Number((await db.query('SELECT extract(epoch FROM clock_timestamp())*1000 AS now')).rows[0].now)>=retirement.retire_after.getTime(),
      'real_database_overlap_deadline',12000);
    barriers.push({kind:'database-clock-overlap-expiry',observed:true});
    check('old-token-is-denied-after-overlap-without-rotator-running',await receipt(firstToken)===403&&await receipt(secondToken)===200);
    check('historical-issue-replay-does-not-revive-retired-credential',JSON.stringify(await sql(issuer,'issue',firstCommand))===JSON.stringify(first)
      &&await receipt(firstToken)===403);

    // An injected audit failure must roll back the credential, predecessor,
    // management CAS and immutable command together.
    await maintenance.query("CREATE FUNCTION private.owned_credential_audit_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'OWNED_CREDENTIAL_AUDIT_FAULT'; END $$");
    await maintenance.query('CREATE TRIGGER owned_credential_audit_fault BEFORE INSERT ON private.setup_recovery_credential_audit FOR EACH ROW EXECUTE FUNCTION private.owned_credential_audit_fault()');
    try{await denied('audit-fault-rolls-back-entire-issue-command',()=>sql(issuer,'issue',issueCommand(3,second.credentialId)),/OWNED_CREDENTIAL_AUDIT_FAULT/)}
    finally{await maintenance.query('DROP TRIGGER owned_credential_audit_fault ON private.setup_recovery_credential_audit');await maintenance.query('DROP FUNCTION private.owned_credential_audit_fault()')}

    const revoke=command('revoke',3,target,{credentialId:second.credentialId});
    await recoveryHeld(close,secondToken,async({pending,release})=>{
      let settled=false;const revoking=sql(installer,'revoke',revoke).then(result=>{settled=true;return result});
      try{
        await until(async()=>(await db.query("SELECT 1 FROM pg_stat_activity WHERE application_name=$1 AND wait_event_type='Lock'",['credential-'+names.installer])).rowCount,
          'revoker_waiting_for_actual_recovery_rpc');
        assert.equal(settled,false);barriers.push({kind:'revocation-waits-for-live-rpc-share-lock',observed:true});
        await release();assert.equal((await pending).status,200);
        const result=await revoking;assert.equal(result.version,4);
      }finally{await release().catch(()=>{});await revoking.catch(()=>{})}
    });
    check('revoke-serializes-after-in-flight-native-close',await receipt(secondToken)===403);
    const liveRevoked=await live(issuer);check('historical-issue-receipt-does-not-make-revoked-head-ready',liveRevoked.ready===false
      &&liveRevoked.reasonCode==='CREDENTIAL_REVOKED'&&(await sql(issuer,'issue',secondCommand)).credentialId===second.credentialId);
    const revokedAt=(await db.query('SELECT revoked_at FROM private.setup_recovery_credentials WHERE id=$1',[second.credentialId])).rows[0].revoked_at;
    const revocationReplay=await sql(installer,'revoke',revoke);
    const repeat=await sql(installer,'revoke',command('revoke',4,target,{credentialId:second.credentialId}));
    check('revoke-replay-and-distinct-command-never-clear-or-reset-revocation',revocationReplay.version===4&&repeat.version===5
      &&(await db.query('SELECT revoked_at FROM private.setup_recovery_credentials WHERE id=$1',[second.credentialId])).rows[0].revoked_at.getTime()===revokedAt.getTime());

    // Two real SIGKILL boundaries use a dedicated SQL writer process. These are
    // DB protocol controls, not installer/file-publication or mobile E2E proof.
    const writerSource=`import pg from '/control/node_modules/pg/lib/index.js';
      const input=JSON.parse(process.env.ROOMQC_OWNED_CREDENTIAL_WRITER);
      const db=new pg.Client(input.options);db.on('error',()=>{});await db.connect();await db.query('BEGIN');
      await db.query('SELECT roomqc_setup_admin.issue($1::jsonb)',[input.command]);
      if(input.phase==='postcommit')await db.query('COMMIT');
      process.stdout.write(JSON.stringify({event:'owned_writer_barrier',phase:input.phase})+'\\n');
      await new Promise(()=>{});`;
    const killedCommand=issueCommand(5,second.credentialId);
    for(const phase of ['precommit','postcommit']){
      let observed=false,output='';
      const child=spawn(process.execPath,['--input-type=module','-e',writerSource],{stdio:['ignore','pipe','pipe'],
        env:{...process.env,ROOMQC_OWNED_CREDENTIAL_WRITER:JSON.stringify({options:options(names.issuer),command:killedCommand,phase})}});
      const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}))});
      child.stdout.on('data',chunk=>{output+=chunk;if(output.length>4096)child.kill('SIGKILL');
        for(const line of output.split('\n').filter(Boolean))try{const event=JSON.parse(line);if(event.event==='owned_writer_barrier'&&event.phase===phase)observed=true}catch{}});
      child.stderr.on('data',()=>{});
      try{await until(()=>observed,'actual_writer_'+phase);child.kill('SIGKILL');const terminal=await closed;assert.equal(terminal.signal,'SIGKILL');
        kills.push({phase,signal:terminal.signal,observedBarrier:true});
      }finally{child.kill('SIGKILL');await closed.catch(()=>{})}
      if(phase==='precommit'){
        await until(async()=>!(await db.query('SELECT 1 FROM private.setup_recovery_commands WHERE key=$1',[killedCommand.key])).rowCount,'rolled_back_writer');
        check('writer-sigkill-before-commit-leaves-no-command-or-credential',(await state()).management[0].value.version===5);
      }
    }
    const recovered=await sql(issuer,'issue',killedCommand),recoveredToken=mint(recovered);
    check('writer-sigkill-after-commit-recovers-exact-key-with-one-command',recovered.version===6
      &&(await db.query('SELECT count(*)::int AS count FROM private.setup_recovery_commands WHERE key=$1',[killedCommand.key])).rows[0].count===1
      &&await receipt(recoveredToken)===200);
    // Expiry/readiness fixtures use the maintenance session only. Monotonically
    // shorten this disposable row; never clear a revocation or extend validity.
    await maintenance.query("UPDATE private.setup_recovery_credentials SET retire_after=clock_timestamp()-interval '1 second' WHERE id=$1",[recovered.credentialId]);
    check('live-status-rejects-retired-head-before-jwt-expiry',(await live(issuer)).reasonCode==='CREDENTIAL_RETIRED'&&await receipt(recoveredToken)===403);
    await maintenance.query("UPDATE private.setup_recovery_credentials SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1",[recovered.credentialId]);
    await until(async()=>(await live(issuer)).reasonCode==='CREDENTIAL_EXPIRED','actual_database_head_expiry');
    check('live-status-observes-actual-expiry-and-never-replays-ready',(await live(issuer)).ready===false);
    const fresh=await sql(issuer,'issue',issueCommand(6,recovered.credentialId)),freshToken=mint(fresh);
    check('new-command-after-expired-head-produces-live-credential',fresh.version===7&&await receipt(freshToken)===200);
    const rebind=command('bind',7,{...target,bindingSha256:'d'.repeat(64)},{expectedClusterId:target.clusterId,expectedBindingSha256:target.bindingSha256});
    check('binding-change-revokes-even-unexpired-credential',(await sql(installer,'bind',rebind)).version===8&&await receipt(freshToken)===403);
    const rebound=await live(installer);check('live-status-observes-binding-change-without-historical-head',rebound.ready===false
      &&rebound.reasonCode==='CREDENTIAL_MISSING'&&rebound.bindingSha256===rebind.bindingSha256&&rebound.version===8&&rebound.credential===null);
    await denied('old-binding-cannot-issue-after-maintenance-change',()=>sql(issuer,'issue',issueCommand(8,null)),/SETUP_CREDENTIAL_TARGET_CONFLICT/);
    await denied('committed-command-history-cannot-be-edited',()=>maintenance.query('UPDATE private.setup_recovery_commands SET result=result'),/SETUP_CREDENTIAL_HISTORY_IMMUTABLE/);
    const counts=(await db.query(`SELECT (SELECT count(*)::int FROM private.setup_recovery_commands) AS commands,
      (SELECT count(*)::int FROM private.setup_recovery_credential_audit) AS audits,
      (SELECT bool_and(NOT (request ?| ARRAY['token','jwt','password','privateKey','signingSecret'])
        AND NOT (result ?| ARRAY['token','jwt','password','privateKey','signingSecret'])) FROM private.setup_recovery_commands) AS no_secrets`)).rows[0];
    const history=JSON.stringify(await state());
    check('one-audit-per-command-and-no-bearer-or-signing-secret',counts.commands===8&&counts.audits===8&&counts.no_secrets
      &&![password,input.jwtSecret,firstToken,secondToken,recoveredToken,freshToken].some(secret=>history.includes(secret)));
    assert.deepEqual(await snapshot(),beforeBusiness);check('credential-maintenance-keeps-eleven-business-tables-unchanged');
    return {verified:true,actualPostgres:true,actualRest:true,actualSqlWriterProcesses:true,checks,kills,barriers,
      schemaFingerprintVersion:3,actualRecoveryCatalogDriftCases:9,liveStatusVerified:true,maintenanceSchemaNotExposed:true,
      publication,installerCli,fixtureReleaseOnly:true,installerCliVerified:installerCli.verified,filePublicationVerified:true,rotationDaemonVerified:false,productAccepted:false};
  }catch(error){
    primaryFailure=true;
    process.stdout.write(JSON.stringify({event:'native_credential_failed',checks:checks.length,
      code:typeof error.code==='string'&&/^[A-Z0-9_]{1,80}$/.test(error.code)?error.code:null})+'\n');
    throw error;
  }finally{
    await Promise.all(pools.map(p=>p.end()));
    let cleanupError;
    for(const name of created.reverse())try{await maintenance.query('DROP ROLE '+name)}catch(error){cleanupError=error}
    await maintenance.end();if(cleanupError&&!primaryFailure)throw cleanupError;
  }
}
