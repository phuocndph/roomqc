import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ReleaseApprovalTrust,releaseApprovalSigningBytes,releaseApprovalEndpointFingerprint,loadReleaseApprovalTrust} from './release-approval.mjs';

const now=1793000000000,maximumValidityMs=3600000;
const expected={clusterId:'cluster-a',releaseId:'fixture-1',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
  migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
const endpoint={url:'https://fixture.example.invalid',internalUrl:null,approvedAddresses:['192.0.2.1','192.0.2.2'],credentialRef:'credential-a'};
const context={inventoryRef:'inventory-a',clusterId:'cluster-a',hostId:'host-a',environment:'staging',
  endpointFingerprint:releaseApprovalEndpointFingerprint(endpoint),expected};
const clone=value=>structuredClone(value);
const invalid={code:'RELEASE_APPROVAL_INVALID'},trustInvalid={code:'RELEASE_APPROVAL_TRUST_INVALID'};
function fixture(){
  const pair=generateKeyPairSync('ed25519');
  const key={issuerId:'issuer-a',keyId:'key-a',publicKey:pair.publicKey.export({format:'jwk'}),environments:['staging']};
  const raw={version:1,keys:[key]},trust=new ReleaseApprovalTrust(raw,{maximumValidityMs});
  const unsigned={version:1,algorithm:'Ed25519',issuerId:key.issuerId,keyId:key.keyId,
    payload:{approvalId:randomUUID(),epoch:1,...clone(context),notBefore:now-1000,expiresAt:now+600000}};
  const signed=value=>({...clone(value),signature:sign(null,releaseApprovalSigningBytes(value),pair.privateKey).toString('base64url')});
  return {pair,raw,key,trust,unsigned,signed,envelope:signed(unsigned)};
}
test('signed approval checks real Ed25519 provenance, exact binding and independent approval time',()=>{
  const f=fixture(),v=f.trust.verify(f.envelope,context,{now});
  assert.equal(v.approvalId,f.unsigned.payload.approvalId);assert.equal(v.epoch,1);
  assert.match(v.envelopeDigest,/^[a-f0-9]{64}$/);assert.match(v.keyFingerprint,/^[a-f0-9]{64}$/);
  assert.ok(Object.isFrozen(v));assert.ok(Object.isFrozen(v.expected));
  assert.equal(v.signature,undefined);assert.equal(v.credential,undefined);
  assert.equal(JSON.stringify(f.trust),'{}');assert.ok(Object.isFrozen(f.trust));
  assert.equal(f.trust.verify(f.envelope,context,{now:f.unsigned.payload.notBefore}).approvalId,v.approvalId);
  assert.throws(()=>f.trust.verify(f.envelope,context,{now:f.unsigned.payload.notBefore-1}),invalid);
  assert.throws(()=>f.trust.verify(f.envelope,context,{now:f.unsigned.payload.expiresAt}),invalid);
  assert.throws(()=>f.trust.verify(f.envelope,context,{now:now+maximumValidityMs}),invalid);
});
test('canonical bytes ignore input key order, preserve values and bind issuer, key and domain',()=>{
  const f=fixture(),reverse=v=>v&&typeof v==='object'&&!Array.isArray(v)
    ?Object.fromEntries(Object.entries(v).reverse().map(([k,x])=>[k,reverse(x)])):v;
  assert.deepEqual(releaseApprovalSigningBytes(reverse(f.unsigned)),releaseApprovalSigningBytes(f.unsigned));
  assert.equal(f.trust.verify(reverse(f.envelope),reverse(context),{now}).envelopeDigest,
    f.trust.verify(f.envelope,context,{now}).envelopeDigest);
  const wrongDomain=sign(null,Buffer.concat([Buffer.from('other-domain:'),releaseApprovalSigningBytes(f.unsigned)]),f.pair.privateKey);
  assert.throws(()=>f.trust.verify({...f.envelope,signature:wrongDomain.toString('base64url')},context,{now}),invalid);
  const changed=clone(f.envelope);changed.keyId='key-b';assert.throws(()=>f.trust.verify(changed,context,{now}),invalid);
  const other=generateKeyPairSync('ed25519');
  assert.throws(()=>f.trust.verify({...f.envelope,signature:sign(null,releaseApprovalSigningBytes(f.unsigned),other.privateKey).toString('base64url')},context,{now}),invalid);
});
test('every signed payload field and release digest rejects tampering, even with a still valid canary elsewhere',()=>{
  const f=fixture();
  for(const [field,value]of Object.entries({approvalId:randomUUID(),epoch:2,inventoryRef:'inventory-b',clusterId:'cluster-b',hostId:'host-b',
    environment:'production',endpointFingerprint:'f'.repeat(64),notBefore:now-2000,expiresAt:now+610000})){
    const e=clone(f.envelope);e.payload[field]=value;assert.throws(()=>f.trust.verify(e,context,{now}),invalid,field);
  }
  for(const field of Object.keys(expected)){
    const e=clone(f.envelope);e.payload.expected[field]=field==='clusterId'?'cluster-b':field==='releaseId'?'fixture-2':'e'.repeat(64);
    assert.throws(()=>f.trust.verify(e,context,{now}),invalid,field);
  }
});
test('valid signatures cannot authorize a different inventory, host, cluster, release, endpoint or environment',()=>{
  const f=fixture();
  for(const [field,value]of Object.entries({inventoryRef:'inventory-b',hostId:'host-b',clusterId:'cluster-b',environment:'production',endpointFingerprint:'e'.repeat(64)})){
    const ctx={...clone(context),[field]:value};assert.throws(()=>f.trust.verify(f.envelope,ctx,{now}),invalid,field);
  }
  for(const field of Object.keys(expected)){
    const ctx=clone(context);ctx.expected[field]=field==='clusterId'?'cluster-b':field==='releaseId'?'fixture-2':'e'.repeat(64);
    assert.throws(()=>f.trust.verify(f.envelope,ctx,{now}),invalid,field);
  }
  const prod=clone(f.unsigned);prod.payload.environment='production';
  assert.throws(()=>f.trust.verify(f.signed(prod),{...context,environment:'production'},{now}),invalid);
});
test('untrusted envelopes reject extra fields, coercion, unsafe values, noncanonical signatures and alternate algorithms',()=>{
  const f=fixture(),inputs=[null,[],{}, {...f.envelope,version:2},{...f.envelope,algorithm:'HS256'},
    {...f.envelope,unknown:true},{...f.envelope,signature:f.envelope.signature+'='},
    {...f.envelope,signature:'A'.repeat(86)},{...f.envelope,signature:'A'.repeat(85)},
    {...f.envelope,issuerId:'unknown-issuer'},{...f.envelope,keyId:'unknown-key'}];
  for(const e of inputs)assert.throws(()=>f.trust.verify(e,context,{now}),invalid);
  for(const [field,values]of Object.entries({epoch:[0,-1,'1',1.5,Number.MAX_SAFE_INTEGER+1,NaN,Infinity],
    notBefore:['1793000000000',null,-1,Infinity,8640000000000001],
    expiresAt:[now-2000,now-1000,'later',NaN,Infinity,8640000000000001],
    approvalId:['UPPER-'+randomUUID(),null,'AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA']})){
    for(const value of values){const e=clone(f.envelope);e.payload[field]=value;assert.throws(()=>f.trust.verify(e,context,{now}),invalid)}
  }
  for(const field of ['payload','expected']){
    const e=clone(f.envelope);(field==='payload'?e.payload:e.payload.expected).extra='forbidden';
    assert.throws(()=>f.trust.verify(e,context,{now}),invalid);
  }
  for(const time of [undefined,null,'now',NaN,Infinity,-1,now+0.5]){
    // Omitted time is the only default; explicit undefined follows JS defaults.
    if(time===undefined)continue;
    assert.throws(()=>f.trust.verify(f.envelope,context,{now:time}),invalid);
  }
});
test('trust keyring is public only, bounded, scoped, exact and immutable after construction',()=>{
  const f=fixture(),privateJwk=f.pair.privateKey.export({format:'jwk'});
  const cases=[null,[],{version:2,keys:[f.key]},{version:1,keys:[]},{version:1,keys:Array(101).fill(f.key)},
    {version:1,keys:[f.key,f.key]},{...f.raw,secret:'forbidden'},
    {version:1,keys:[{...f.key,publicKey:privateJwk}]},
    {version:1,keys:[{...f.key,publicKey:{...f.key.publicKey,x:f.key.publicKey.x+'='}}]},
    {version:1,keys:[{...f.key,publicKey:{kty:'RSA',crv:'Ed25519',x:f.key.publicKey.x}}]},
    {version:1,keys:[{...f.key,environments:['production','production']}]},
    {version:1,keys:[{...f.key,environments:['unknown']}]},
    {version:1,keys:[{...f.key,environments:[]}]}];
  for(const raw of cases)assert.throws(()=>new ReleaseApprovalTrust(raw,{maximumValidityMs}),trustInvalid);
  for(const ttl of [undefined,0,-1,'3600000',NaN,Infinity,Number.MAX_SAFE_INTEGER+1]){
    assert.throws(()=>new ReleaseApprovalTrust(f.raw,{maximumValidityMs:ttl}),trustInvalid);
  }
  f.raw.keys[0].publicKey.x='A'.repeat(43);f.raw.keys[0].environments[0]='production';
  assert.equal(f.trust.verify(f.envelope,context,{now}).environment,'staging');
  const tooLong=clone(f.unsigned);tooLong.payload.expiresAt=tooLong.payload.notBefore+maximumValidityMs+1;
  assert.throws(()=>f.trust.verify(f.signed(tooLong),context,{now}),invalid);
});
test('lookalike key IDs require their exact issuer and signature binds both header identities',()=>{
  const f=fixture(),other={...clone(f.key),issuerId:'issuer-b'},trust=new ReleaseApprovalTrust({version:1,keys:[f.key,other]},{maximumValidityMs});
  const changed=clone(f.envelope);changed.issuerId='issuer-b';
  assert.throws(()=>trust.verify(changed,context,{now}),invalid);
  const correct=clone(f.unsigned);correct.issuerId='issuer-b';
  assert.equal(trust.verify(f.signed(correct),context,{now}).issuerId,'issuer-b');
});
test('accessor/prototype/toJSON inputs do not execute while reconstructing canonical signed bytes',()=>{
  const f=fixture();let calls=0;
  const getter={...f.envelope};Object.defineProperty(getter,'payload',{enumerable:true,get(){calls++;throw Error('must not execute')}});
  assert.throws(()=>f.trust.verify(getter,context,{now}),invalid);assert.equal(calls,0);
  const nested=clone(f.envelope);Object.defineProperty(nested.payload,'expected',{enumerable:true,get(){calls++;throw Error('must not execute')}});
  assert.throws(()=>f.trust.verify(nested,context,{now}),invalid);assert.equal(calls,0);
  const toJSON={...clone(f.unsigned),toJSON(){calls++;return {}}};
  assert.throws(()=>releaseApprovalSigningBytes(toJSON),invalid);assert.equal(calls,0);
  const inherited=Object.assign(Object.create({authority:true}),f.envelope);
  assert.throws(()=>f.trust.verify(inherited,context,{now}),invalid);
  const symbol=clone(f.envelope);symbol[Symbol('extra')]=true;assert.throws(()=>f.trust.verify(symbol,context,{now}),invalid);
});
test('endpoint fingerprint binds credential reference and exact origins with normalized sorted addresses',()=>{
  const fp=releaseApprovalEndpointFingerprint(endpoint);
  assert.equal(fp,releaseApprovalEndpointFingerprint({...endpoint,approvedAddresses:[...endpoint.approvedAddresses].reverse()}));
  for(const change of [{url:'https://other.example.invalid'},{internalUrl:'https://private.example.invalid'},{credentialRef:'credential-b'},
    {approvedAddresses:['192.0.2.1']}])assert.notEqual(releaseApprovalEndpointFingerprint({...endpoint,...change}),fp);
  for(const change of [{url:'https://user:pass@fixture.example.invalid'},{url:endpoint.url+'/'},{url:endpoint.url+'/rpc'},
    {url:'file:///etc/passwd'},{internalUrl:undefined},{approvedAddresses:['192.0.2.1','192.0.2.1']},
    {approvedAddresses:['invalid-ip']},{credentialRef:'invalid ref'},{extra:'forbidden'}]){
    assert.throws(()=>releaseApprovalEndpointFingerprint({...endpoint,...change}),invalid);
  }
});
test('trust loader accepts bounded private regular files and fails closed without leaking parse content',async t=>{
  const f=fixture(),dir=await mkdtemp(join(tmpdir(),'roomqc-release-trust-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'public-trust.json');
  await writeFile(file,JSON.stringify(f.raw),{mode:0o600});
  const trust=await loadReleaseApprovalTrust(file,{maximumValidityMs});
  assert.equal(trust.verify(f.envelope,context,{now}).clusterId,'cluster-a');
  for(const name of [undefined,null,'relative.json',dir,join(dir,'missing')]){
    await assert.rejects(()=>loadReleaseApprovalTrust(name,{maximumValidityMs}),trustInvalid);
  }
  const broken=join(dir,'broken');await writeFile(broken,'{"redacted-private-marker":',{mode:0o600});
  await assert.rejects(()=>loadReleaseApprovalTrust(broken,{maximumValidityMs}),e=>e.code===trustInvalid.code&&!e.message.includes('redacted-private-marker'));
  const large=join(dir,'large');await writeFile(large,' '.repeat(64*1024+1),{mode:0o600});
  await assert.rejects(()=>loadReleaseApprovalTrust(large,{maximumValidityMs}),trustInvalid);
  const link=join(dir,'link');await symlink(process.platform==='win32'?dir:file,link,process.platform==='win32'?'junction':'file');
  await assert.rejects(()=>loadReleaseApprovalTrust(link,{maximumValidityMs}),trustInvalid);
});
