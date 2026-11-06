import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,symlink,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReleaseValidationCatalog,loadReleaseValidationCatalog,releaseValidationContext,assertReleaseValidation} from './release-validation.mjs';
import {releaseExpectationFingerprint} from './release-manifest.mjs';
import {ClusterGateway} from './cluster.mjs';
import {loadConfig} from './config.mjs';
import {fixtureReleaseTrust,fixtureReleaseTrustRaw,fixtureReleaseMaximumValidityMs,fixtureReleaseApproval,fixtureReleaseContext} from './release-test-fixtures.mjs';

const now=Date.now(),expected={clusterId:'fixture-a',releaseId:'release-1',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
  migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
const jwt=(role='roomqc_control_probe',exp=Math.floor(now/1000)+600)=>[
  'header',Buffer.from(JSON.stringify({role,exp})).toString('base64url'),'synthetic-signature'].join('.');
const credential={publishableKey:'fixture-public',token:jwt()};
const contextFor=value=>fixtureReleaseContext({id:'fixture-a',url:'https://fixture.invalid'},value,{hostId:'host-a',environment:'staging'});
const catalog=(value=expected)=>({version:2,entries:[{inventoryRef:'fixture-a',approval:fixtureReleaseApproval(contextFor(value)),credential:{...credential}}]});
const construct=(raw,options={})=>new ReleaseValidationCatalog(raw,{trust:fixtureReleaseTrust,now,...options});
function fixture(){
  const row={id:'fixture-a',api_url:'https://fixture.invalid',host_id:'host-a',inventory_ref:'fixture-a',credential_ref:'fixture-a'};
  const entry={id:'fixture-a',url:row.api_url,hostId:row.host_id,credentialRef:'fixture-a',releaseId:expected.releaseId,
    schemaManifestHash:expected.schemaManifestHash,frontendReady:true,environment:'staging'};
  const config={inventory:new Map([['fixture-a',entry]]),credentials:new Map([['fixture-a',{
    publishableKey:credential.publishableKey,serviceKey:'server-only-never-manifest',vapidPublicKey:'fixture-vapid'}]]),
    releaseValidation:construct(catalog())};
  return {row,entry,config};
}
test('release approval catalog is exact, immutable, bounded and cannot use privileged, expired or unidentified credentials',()=>{
  const raw=catalog(),value=construct(raw);raw.entries[0].approval.payload.expected.releaseId='changed';
  assert.equal(value.get('fixture-a',{now}).expected.releaseId,expected.releaseId);
  assert.ok(Object.isFrozen(value));assert.equal(JSON.stringify(value),'{}','Private credentials must not enumerate');
  assert.throws(()=>value.get('unknown',{now}),{code:'RELEASE_MANIFEST_REQUIRED'});
  assert.throws(()=>value.get('fixture-a',{now:now+600000}),{code:'RELEASE_MANIFEST_MISMATCH'});
  assert.deepEqual(value.expectation('fixture-a'),expected,'Approved identity remains separate from the expiring catalog credential');
  assert.ok(Object.isFrozen(value.expectation('fixture-a')));assert.equal(value.expectation('fixture-a').credential,undefined);
  assert.throws(()=>value.expectation('unknown'),{code:'RELEASE_MANIFEST_REQUIRED'});
  const invalid=[null,[],{...catalog(),unknown:true},{version:2,entries:[]},{version:1,entries:catalog().entries},
    {version:1,entries:[{inventoryRef:'fixture-a',expected,credential}]},
    {version:2,entries:Array.from({length:101},()=>catalog().entries[0])},
    {version:2,entries:[...catalog().entries,...catalog().entries]}];
  for(const input of invalid)assert.throws(()=>construct(input));
  assert.throws(()=>new ReleaseValidationCatalog(catalog(),{now}),{code:'RELEASE_MANIFEST_REQUIRED'});
  const tampered=catalog();tampered.entries[0].approval.payload.expected.artifactDigest='e'.repeat(64);
  assert.throws(()=>construct(tampered),{code:'RELEASE_APPROVAL_INVALID'});
  for(const auth of [{...credential,serviceKey:'forbidden'},{...credential,publishableKey:'sb_secret_forbidden'},
    {...credential,publishableKey:jwt('service_role')},{...credential,token:jwt('service_role')},
    {...credential,token:jwt('roomqc_control_probe',1)},{...credential,token:jwt('roomqc_control_probe',Math.floor(now/1000)+30)},
    {...credential,token:jwt('roomqc_control_probe','invalid')},{...credential,token:'invalid'}]){
    const input=catalog();input.entries[0].credential=auth;assert.throws(()=>construct(input));
  }
});
test('production release catalog requires a complete business migration receipt bound to the approved hash',()=>{
  const receipt={version:1,status:'complete',migrationSetSha256:expected.migrationSetHash,totalCount:591,appliedCount:591,pending:[],complete:true};
  assert.throws(()=>new ReleaseValidationCatalog(catalog(),{trust:fixtureReleaseTrust,now,requireMigrationReceipt:true}),{code:'RELEASE_MANIFEST_REQUIRED'});
  const approved=catalog();approved.version=3;approved.entries[0].migrationReceipt=receipt;
  const value=construct(approved,{requireMigrationReceipt:true});
  assert.deepEqual(value.migrationReceipt('fixture-a'),receipt);
  for(const patch of [{status:'pending'},{migrationSetSha256:'e'.repeat(64)},{appliedCount:590},{pending:['20261001000000_first.sql']},{complete:false}]){
    const invalid=catalog();invalid.version=3;invalid.entries[0].migrationReceipt={...receipt,...patch};
    assert.throws(()=>construct(invalid,{requireMigrationReceipt:true}),{code:/RELEASE_MIGRATION_RECEIPT_REQUIRED|RELEASE_MANIFEST_REQUIRED/});
  }
  const {row,config}=fixture();config.production=true;
  assert.throws(()=>releaseValidationContext(config,row,{now}),{code:'RELEASE_MIGRATION_RECEIPT_REQUIRED'});
  config.releaseValidation=value;
  assert.deepEqual(releaseValidationContext(config,row,{now}).migrationReceipt,receipt);
  const reversed=catalog();reversed.version=3;reversed.entries[0].migrationReceipt=Object.fromEntries(Object.entries(receipt).reverse());
  config.releaseValidation=construct(reversed);
  assert.deepEqual(value.migrationReceipt('fixture-a'),config.releaseValidation.migrationReceipt('fixture-a'));
});
test('release validation loader accepts only bounded absolute private regular files; config absence never enables fallback',async t=>{
  const directory=await mkdtemp(join(tmpdir(),'roomqc-release-validation-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'catalog.json');await writeFile(file,JSON.stringify(catalog()),{mode:0o600});
  const trustFile=join(directory,'trust.json');await writeFile(trustFile,JSON.stringify(fixtureReleaseTrustRaw),{mode:0o600});
  const load=path=>loadReleaseValidationCatalog(path,{trustFile,maximumValidityMs:fixtureReleaseMaximumValidityMs});
  assert.equal(load(file).get('fixture-a').expected.releaseId,expected.releaseId);
  assert.throws(()=>loadReleaseValidationCatalog(file),{code:'RELEASE_MANIFEST_REQUIRED'});
  assert.equal(loadReleaseValidationCatalog(undefined),null);
  for(const path of ['',null,'relative.json',directory,join(directory,'missing')]){
    assert.throws(()=>load(path),{code:'RELEASE_MANIFEST_REQUIRED'});
  }
  const invalid=join(directory,'invalid');await writeFile(invalid,'{"private-marker":',{mode:0o600});
  assert.throws(()=>load(invalid),error=>error.code==='RELEASE_MANIFEST_REQUIRED'&&!error.message.includes('private-marker'));
  const large=join(directory,'large');await writeFile(large,' '.repeat(256*1024+1),{mode:0o600});
  assert.throws(()=>load(large),{code:'RELEASE_MANIFEST_REQUIRED'});
  const child=join(directory,'child');await mkdir(child);
  await symlink(process.platform==='win32'?child:file,join(directory,'link'),process.platform==='win32'?'junction':'file');
  assert.throws(()=>load(join(directory,'link')),{code:'RELEASE_MANIFEST_REQUIRED'});
  const env={ROOMQC_CONTROL_EMAIL_HASH_KEY:'fixture-hash-key-'.repeat(4),ROOMQC_CONTROL_DATABASE_URL:'postgres://fixture:fixture@127.0.0.1/owned',
    ROOMQC_CONTROL_ALLOW_LOCAL:'true',ROOMQC_CONTROL_CLUSTERS:JSON.stringify([{id:'fixture-a',url:'http://127.0.0.1:1',
      publishableKey:'fixture-public',serviceKey:'fixture-server',vapidPublicKey:'fixture-vapid',maxWorkspaces:1}])};
  assert.equal(loadConfig(env).releaseValidation,null);
  assert.equal(loadConfig({...env,ROOMQC_CONTROL_RELEASE_VALIDATION_FILE:file,ROOMQC_CONTROL_RELEASE_TRUST_FILE:trustFile,
    ROOMQC_CONTROL_RELEASE_APPROVAL_MAX_VALIDITY_MS:String(fixtureReleaseMaximumValidityMs)}).releaseValidation.get('fixture-a').expected.releaseId,expected.releaseId);
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_RELEASE_VALIDATION_FILE:file}),{code:'RELEASE_MANIFEST_REQUIRED'});
  assert.throws(()=>loadConfig({...env,ROOMQC_CONTROL_RELEASE_VALIDATION_FILE:invalid}),{code:'RELEASE_MANIFEST_REQUIRED'});
});
test('registry validation calls only the bounded narrow manifest transport; missing approval performs no network request',async()=>{
  const {row,config}=fixture();let calls=0;
  const gateway=new ClusterGateway(config,async(url,init,cluster)=>{
    calls++;assert.equal(url,row.api_url+'/rest/v1/rpc/control_cluster_manifest');assert.equal(cluster.id,row.id);
    assert.equal(init.headers.authorization,'Bearer '+credential.token);assert.equal(init.headers.apikey,credential.publishableKey);
    assert.ok(!JSON.stringify(init).includes('server-only-never-manifest'));assert.equal(init.redirect,'error');
    assert.ok(init.signal);const {p_challenge:challenge}=JSON.parse(init.body);
    return {ok:true,json:async()=>({...expected,contractVersion:3,schemaFingerprintVersion:3,expectedSchemaManifestHash:expected.schemaManifestHash,
      challenge,checkedAt:new Date().toISOString()})};
  },{authorizeRelease:async row=>releaseValidationContext(config,row)});
  const result=await gateway.validateCluster(row);assert.equal(result.manifest.expectationFingerprint,releaseExpectationFingerprint(expected));
  assert.equal(JSON.stringify(result).includes(credential.token),false);assert.equal(calls,1);
  const saved=config.releaseValidation;config.releaseValidation=null;
  await assert.rejects(()=>gateway.validateCluster(row),{code:'RELEASE_MANIFEST_REQUIRED'});assert.equal(calls,1);config.releaseValidation=saved;
  assert.throws(()=>releaseValidationContext(config,{...row,id:'fixture-b'}),{code:'RELEASE_MANIFEST_REQUIRED'});
  assert.throws(()=>releaseValidationContext(config,{...row,host_id:'other-host'}),{code:'RELEASE_MANIFEST_REQUIRED'});
  config.credentials.set('fixture-a',{publishableKey:'other-public'});
  await assert.rejects(()=>gateway.validateCluster(row),{code:'RELEASE_MANIFEST_REQUIRED'});assert.equal(calls,1);
});

test('registry validation without primary-directory authority fails before any network request',async()=>{
  const {row,config}=fixture();let calls=0;
  const gateway=new ClusterGateway(config,async()=>{calls++;throw Error('Unexpected network')});
  await assert.rejects(()=>gateway.validateCluster(row),{code:'RELEASE_AUTHORITY_REQUIRED'});assert.equal(calls,0);
});

test('v3 migration receipt remains bound from HTTP validation through commit recheck',async()=>{
  const {row,config}=fixture(),raw=catalog();raw.version=3;
  raw.entries[0].migrationReceipt={version:1,status:'complete',migrationSetSha256:expected.migrationSetHash,totalCount:591,appliedCount:591,pending:[],complete:true};
  config.production=true;config.releaseValidation=construct(raw);
  const gateway=new ClusterGateway(config,async(url,init)=>({ok:true,json:async()=>({...expected,
    contractVersion:3,schemaFingerprintVersion:3,expectedSchemaManifestHash:expected.schemaManifestHash,
    challenge:JSON.parse(init.body).p_challenge,checkedAt:new Date().toISOString()})}),
    {authorizeRelease:async row=>releaseValidationContext(config,row)});
  const validation=await gateway.validateCluster(row);
  assert.doesNotThrow(()=>assertReleaseValidation(config,row,validation));
  assert.throws(()=>assertReleaseValidation(config,row,{...validation,migrationReceiptFingerprint:'e'.repeat(64)}),{code:'VALIDATION_REQUIRED'});
  raw.entries[0].migrationReceipt.totalCount=raw.entries[0].migrationReceipt.appliedCount=590;
  config.releaseValidation=construct(raw);
  assert.throws(()=>assertReleaseValidation(config,row,validation),{code:'VALIDATION_REQUIRED'});
});
test('commit-side release validation fences changed endpoint, approval, credential and stale verification without trusting a runtime hash',()=>{
  const {row,config,entry}=fixture(),context=releaseValidationContext(config,row,{now});
  const result={inventoryRef:entry.id,validationFingerprint:context.fingerprint,releaseId:expected.releaseId,
    schemaManifestHash:expected.schemaManifestHash,frontendReady:true,publishableKey:credential.publishableKey,vapidPublicKey:'fixture-vapid',
    manifest:{...expected,contractVersion:3,schemaFingerprintVersion:3,checkedAt:new Date(now).toISOString(),expectationFingerprint:releaseExpectationFingerprint(expected)}};
  assertReleaseValidation(config,row,result,{now});
  for(const patch of [{validationFingerprint:'invalid'},{inventoryRef:'other'}, {schemaManifestHash:'e'.repeat(64)},
    {manifest:{...result.manifest,checkedAt:new Date(now-30001).toISOString()}},
    {manifest:{...result.manifest,checkedAt:new Date(now+5001).toISOString()}},
    {manifest:{...result.manifest,artifactDigest:'e'.repeat(64)}}]){
    assert.throws(()=>assertReleaseValidation(config,row,{...result,...patch},{now}),{code:'VALIDATION_REQUIRED'});
  }
  for(const field of ['artifactDigest','frontendArtifactDigest','migrationSetHash']){
    const next=catalog({...expected,[field]:'e'.repeat(64)});config.releaseValidation=construct(next);
    assert.throws(()=>assertReleaseValidation(config,row,result,{now}),{code:'VALIDATION_REQUIRED'});
  }
  const next=catalog();next.entries[0].credential.token=credential.token+'changed';
  config.releaseValidation=construct(next);
  assert.throws(()=>assertReleaseValidation(config,row,result,{now}),{code:'VALIDATION_REQUIRED'});
  config.releaseValidation=construct(catalog());
  config.inventory.set(entry.id,{...entry,internalUrl:'https://new-private.invalid'});
  assert.throws(()=>assertReleaseValidation(config,row,result,{now}),{code:'RELEASE_APPROVAL_INVALID'});
});
