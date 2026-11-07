import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {summaryCredentialInstallerArguments,summaryCredentialInstallerConfiguration,summaryCredentialInstallerCommand,
  summaryCredentialInstallerApproval,summaryCredentialInstallerFailure,assertSummaryCredentialBudget,
  assertSummaryInstallerIdentity,summaryCredentialBusinessPreflight} from './tenant-summary-installer.mjs';
import {fixtureReleaseContext,fixtureReleaseApproval,fixtureReleaseTrust} from './release-test-fixtures.mjs';
import {summaryMaintenanceBinding} from './tenant-summary-maintenance.mjs';

const expected={clusterId:'owned-installer',releaseId:'owned-release',artifactDigest:'1'.repeat(64),
  frontendArtifactDigest:'2'.repeat(64),migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
const cluster={id:expected.clusterId,hostId:'owned-host',inventoryRef:'owned-inventory',credentialRef:'owned-credential',
  url:'http://127.0.0.1:54321',internalUrl:null,approvedAddresses:[]};
const target=()=>({cluster:structuredClone(cluster),expected:structuredClone(expected),
  approval:fixtureReleaseApproval(fixtureReleaseContext(cluster,expected))});
const fixture=()=>({version:1,environment:'local',business:{dsnFile:join(tmpdir(),'owned-input','business'),
  expected:{systemIdentifier:'123',databaseOid:'16384',databaseName:'owned-business',role:'owned-issuer'}},
  directory:{dsnFile:join(tmpdir(),'owned-input','directory'),
    expected:{systemIdentifier:'123',databaseOid:'16385',databaseName:'owned-directory',role:'owned-observer'}},
  resourceBudgetFile:join(tmpdir(),'owned-input','budget'),resourceBudgetSha256:'5'.repeat(64),businessDatabaseId:'business-main',
  consumerId:'summary-credential-issuer',replicas:1,releaseTrustFile:join(tmpdir(),'owned-input','trust'),target:target(),
  publisher:{signer:{algorithm:'HS256',fingerprint:'6'.repeat(64),keyFile:join(tmpdir(),'owned-input','key'),keyId:null},
    publishableKeyFile:join(tmpdir(),'owned-input','publishable'),outputFile:join(tmpdir(),'owned-output','credential.json')}});
const identity=c=>({...c.business.expected,inRecovery:false,readOnly:true,roleConnectionLimit:1,maxConnections:100,reservedConnections:3});
const context=c=>({budgetSha256:c.resourceBudgetSha256,databaseId:c.businessDatabaseId,budget:{databases:[{
  id:c.businessDatabaseId,kind:'business',maxConnections:100,reservedConnections:5,
  consumers:[{id:c.consumerId,replicas:1,poolMax:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0}]}]}});

test('installer binds separately configured release to signed approval, including every hash and release ID',()=>{
 const t=target();assert.equal(summaryCredentialInstallerApproval(t,fixtureReleaseTrust,'local').expected.releaseId,expected.releaseId);
 for(const key of ['releaseId','artifactDigest','frontendArtifactDigest','migrationSetHash','schemaManifestHash']){
  const bad=structuredClone(t);bad.expected[key]=key==='releaseId'?'different-release':'f'.repeat(64);
  assert.throws(()=>summaryCredentialInstallerApproval(bad,fixtureReleaseTrust,'local'),{code:'SUMMARY_INSTALLER_RELEASE_MISMATCH'});
 }
 // Canonical field order is independent of the JSON property order.
 t.expected=Object.fromEntries(Object.entries(t.expected).reverse());
 assert.equal(summaryCredentialInstallerApproval(t,fixtureReleaseTrust,'local').expected.releaseId,expected.releaseId);
});

test('installer does not bypass signature, expiry, environment or endpoint binding',()=>{
 const t=target();
 for(const mutate of [t=>{t.approval.signature='A'.repeat(86)},t=>{t.cluster.url='http://127.0.0.1:54322'},
  t=>{t.cluster.credentialRef='other-credential'},t=>{t.cluster.hostId='other-host'}]){
  const bad=structuredClone(t);mutate(bad);assert.throws(()=>summaryCredentialInstallerApproval(bad,fixtureReleaseTrust,'local'),{code:'RELEASE_APPROVAL_INVALID'});
 }
 assert.throws(()=>summaryCredentialInstallerApproval(t,fixtureReleaseTrust,'production'),{code:'RELEASE_APPROVAL_INVALID'});
 assert.throws(()=>summaryCredentialInstallerApproval(t,fixtureReleaseTrust,'local',{now:t.approval.payload.expiresAt}),{code:'RELEASE_APPROVAL_INVALID'});
});

test('installer arguments require explicit absolute private files, reject duplicate switches and implicit local',()=>{
 const cfg=join(tmpdir(),'owned-config.json'),cmd=join(tmpdir(),'owned-command.json');
 assert.deepEqual(summaryCredentialInstallerArguments(['--config-file',cfg,'--command-file',cmd]),{configFile:cfg,commandFile:cmd,allowLocal:false});
 for(const args of [[],['--config-file','relative','--command-file',cmd],['--config-file',cfg],
  ['--config-file',cfg,'--command-file',cmd,'--config-file',cfg],['--config-file',cfg,'--command-file',cmd,'--allow-local','--allow-local'],
  ['--config-file',cfg,'--command-file',cmd,'--unknown']])assert.throws(()=>summaryCredentialInstallerArguments(args),{code:'SUMMARY_INSTALLER_ARGUMENTS_INVALID'});
 assert.throws(()=>summaryCredentialInstallerConfiguration(fixture()),{code:'SUMMARY_INSTALLER_CONFIG_INVALID'});
});

test('runtime-visible output cannot contain signing key, DSN, trust or budget and installer receives no signer',()=>{
 const f=fixture();assert.deepEqual(summaryCredentialInstallerConfiguration(f,{allowLocal:true}),f);
 for(const mutate of [f=>{f.publisher.signer.keyFile=join(tmpdir(),'owned-output','key')},
  f=>{f.business.dsnFile=join(tmpdir(),'owned-output','sub','dsn')},f=>{f.directory.dsnFile=f.publisher.outputFile},
  f=>{f.releaseTrustFile=join(tmpdir(),'owned-output','trust')},f=>{f.resourceBudgetFile=join(tmpdir(),'owned-output','budget')}]){
  const bad=fixture();mutate(bad);assert.throws(()=>summaryCredentialInstallerConfiguration(bad,{allowLocal:true}),{code:'SUMMARY_INSTALLER_OUTPUT_ISOLATION'});
 }
 f.consumerId='summary-credential-installer';assert.throws(()=>summaryCredentialInstallerConfiguration(f,{allowLocal:true}),{code:'SUMMARY_INSTALLER_CONFIG_INVALID'});
 f.publisher=null;assert.equal(summaryCredentialInstallerConfiguration(f,{allowLocal:true}).publisher,null);
});

test('resource budget requires explicit single pool, replica count and matching bound budget without borrowing reserve',()=>{
 const c=fixture(),ctx=context(c);assert.equal(assertSummaryCredentialBudget(c,ctx,'business').id,'business-main');
 for(const mutate of [x=>{x.budgetSha256='f'.repeat(64)},x=>{x.databaseId='other'},x=>{x.budget.databases[0].consumers=[]},
  x=>{x.budget.databases[0].consumers[0].replicas=2},x=>{x.budget.databases[0].consumers[0].poolMax=2},
  x=>{x.budget.databases[0].consumers[0].fixedConnectionsPerReplica=1},x=>{x.budget.databases[0].consumers[0].pools.push({id:'extra',max:1})}]){
  const bad=structuredClone(ctx);mutate(bad);assert.throws(()=>assertSummaryCredentialBudget(c,bad,'business'),{code:'SUMMARY_INSTALLER_BUDGET_INVALID'});
 }
});

test('preflight rejects wrong physical database identity, mutable sessions and insufficient observed capacity',()=>{
 const c=fixture(),good=identity(c),budget=context(c).budget.databases[0];assert.doesNotThrow(()=>assertSummaryInstallerIdentity(good,c.business.expected,budget));
 for(const patch of [{systemIdentifier:'456'},{databaseOid:'16386'},{databaseName:'other'}, {role:'other'},
  {inRecovery:true},{readOnly:false},{roleConnectionLimit:-1},{maxConnections:99},{reservedConnections:6}])
  assert.throws(()=>assertSummaryInstallerIdentity({...good,...patch},c.business.expected,budget),{code:'SUMMARY_INSTALLER_DATABASE_MISMATCH'});
});

test('business preflight checks live catalog, manifest and a single issuer capability before commands',async()=>{
 const c=fixture(),loaded={config:c,contexts:{business:context(c)}};
 const good={...identity(c),capability:'issuer',memberships:1,schemaFingerprintVersion:3,schemaManifestHash:expected.schemaManifestHash,
  manifest:{...expected,contractVersion:3,schemaFingerprintVersion:3,expectedSchemaManifestHash:expected.schemaManifestHash}};
 for(const patch of [null,{capability:'installer'},{memberships:2},{schemaFingerprintVersion:2},{schemaManifestHash:'f'.repeat(64)},
  {manifest:{...good.manifest,expectedSchemaManifestHash:'f'.repeat(64)}},{manifest:{...good.manifest,releaseId:'other'}}]){
  let calls=0;const client={async query(sql){calls++;assert.equal(sql,'SELECT roomqc_summary_admin.preflight() AS value');return {rows:[{value:{...good,...patch}}]}}};
  if(patch)await assert.rejects(()=>summaryCredentialBusinessPreflight(client,loaded,'issuer'),{code:'SUMMARY_INSTALLER_RELEASE_MISMATCH'});
  else assert.equal((await summaryCredentialBusinessPreflight(client,loaded,'issuer')).capability,'issuer');assert.equal(calls,1);
 }
});

test('loss after bind, issue, publish or revoke preserves original operation/key and never leaks raw error',()=>{
 const key=randomUUID();
 for(const operation of ['bind','issue','publish','revoke']){
  const err=summaryCredentialInstallerFailure(new Error('private connection details'),{operation,key},true);
  assert.equal(err.code,'SUMMARY_INSTALLER_OUTCOME_UNKNOWN');
  assert.deepEqual(err.recovery,{operation,key,sameCommandRequired:true});
  assert.ok(!JSON.stringify(err).includes('private connection details'));
 }
 const err=summaryCredentialInstallerFailure({code:'SUMMARY_INSTALLER_AUTHORITY_CHANGED'},null,false);
 assert.equal(err.code,'SUMMARY_INSTALLER_AUTHORITY_CHANGED');assert.equal(err.recovery,undefined);
 assert.equal(summaryCredentialInstallerFailure(new Error('private connection details'),{operation:'check'},false).code,'SUMMARY_INSTALLER_UNAVAILABLE');
 for(const code of ['constructor','__proto__','42501']){
  const safe=summaryCredentialInstallerFailure({code,message:'private database details'},null,false);
  assert.equal(safe.code,code==='42501'?'SUMMARY_INSTALLER_DATABASE_PRIVILEGES_DENIED':'SUMMARY_INSTALLER_UNAVAILABLE');
  assert.equal(summaryCredentialInstallerFailure({code},null,true).code,'SUMMARY_INSTALLER_OUTCOME_UNKNOWN');
 }
});

test('exact database caller/key refusal is a conflict, while untrusted or generic SQL text stays unknown',()=>{
 const command={operation:'issue',key:randomUUID()};
 const conflict=summaryCredentialInstallerFailure({code:'P0001',message:'SUMMARY_CREDENTIAL_KEY_CONFLICT'},command,true);
 assert.equal(conflict.code,'SUMMARY_INSTALLER_COMMAND_CONFLICT');assert.deepEqual(conflict.recovery,{...command,sameCommandRequired:true});
 for(const error of [{code:'P0001',message:'SUMMARY_CREDENTIAL_KEY_CONFLICT private detail'},
  {code:'08006',message:'SUMMARY_CREDENTIAL_KEY_CONFLICT'},{code:'P0001',message:'private SQL error'}])
  assert.equal(summaryCredentialInstallerFailure(error,command,true).code,'SUMMARY_INSTALLER_OUTCOME_UNKNOWN');
 assert.equal(summaryCredentialInstallerFailure({code:'P0001',message:'SUMMARY_CREDENTIAL_KEY_CONFLICT'},command,false).code,'SUMMARY_INSTALLER_UNAVAILABLE');
});

test('command capability prevents issuer binding/revoking or installer issuing/publishing',()=>{
 const key=randomUUID(),b=summaryMaintenanceBinding(cluster,expected),base={version:1,key:randomUUID(),requestId:randomUUID(),reason:'Owned installer test',expectedVersion:0,
  clusterId:b.clusterId,bindingSha256:b.bindingHash,releaseSha256:b.releaseFingerprint};
 const bind={...base,operation:'bind',expectedClusterId:null,expectedBindingSha256:null};
 assert.deepEqual(summaryCredentialInstallerCommand(bind,b,'installer'),bind);
 assert.throws(()=>summaryCredentialInstallerCommand(bind,b,'issuer'),{code:'SUMMARY_INSTALLER_COMMAND_INVALID'});
 const issue={...base,operation:'issue',predecessorId:null,ttlSeconds:120,overlapSeconds:10,signerAlgorithm:'HS256',signerFingerprint:'6'.repeat(64)};
 assert.deepEqual(summaryCredentialInstallerCommand(issue,b,'issuer'),issue);
 assert.throws(()=>summaryCredentialInstallerCommand(issue,b,'installer'),{code:'SUMMARY_INSTALLER_COMMAND_INVALID'});
 for(const patch of [{ttlSeconds:119},{ttlSeconds:3601},{overlapSeconds:9},{overlapSeconds:61},{bindingSha256:'f'.repeat(64)},{expectedVersion:-1}])
  assert.throws(()=>summaryCredentialInstallerCommand({...issue,...patch},b,'issuer'),{code:'SUMMARY_INSTALLER_COMMAND_INVALID'});
 assert.throws(()=>summaryCredentialInstallerCommand({version:1,operation:'publish',key},b,'installer'),{code:'SUMMARY_INSTALLER_COMMAND_INVALID'});
});
