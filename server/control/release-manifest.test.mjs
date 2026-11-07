import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseExpectation,releaseExpectationFingerprint,verifyReleaseManifest,probeReleaseManifest} from './release-manifest.mjs';

const expected={clusterId:'fixture-a',releaseId:'release-1',artifactDigest:'1'.repeat(64),frontendArtifactDigest:'2'.repeat(64),
  migrationSetHash:'3'.repeat(64),schemaManifestHash:'4'.repeat(64)};
const now=Date.now(),challenge='a'.repeat(64);
const manifest=()=>({...expected,contractVersion:3,schemaFingerprintVersion:3,expectedSchemaManifestHash:expected.schemaManifestHash,
  challenge,checkedAt:new Date(now).toISOString()});
const jwt=(role,exp=Math.floor(now/1000)+120)=>['header',Buffer.from(JSON.stringify({role,exp})).toString('base64url'),'signature'].join('.');

test('release manifest requires approved exact identity, schema, fresh nonce and time; never blesses observed hash',()=>{
  assert.equal(verifyReleaseManifest(manifest(),expected,challenge,{now}).schemaManifestHash,expected.schemaManifestHash);
  for(const field of ['clusterId','releaseId','artifactDigest','frontendArtifactDigest','migrationSetHash','schemaManifestHash','expectedSchemaManifestHash','challenge']){
    assert.throws(()=>verifyReleaseManifest({...manifest(),[field]:'wrong'},expected,challenge,{now}),{code:'RELEASE_MANIFEST_MISMATCH'});
  }
  for(const patch of [{checkedAt:new Date(now-30001).toISOString()},{checkedAt:new Date(now+5001).toISOString()},
    {checkedAt:'not-time'},{contractVersion:2},{schemaFingerprintVersion:1},{schemaFingerprintVersion:2},{extra:true}]){
    assert.throws(()=>verifyReleaseManifest({...manifest(),...patch},expected,challenge,{now}),{code:'RELEASE_MANIFEST_MISMATCH'});
  }
  for(const value of [null,[],{...expected,extra:true},{...expected,clusterId:'bad id'},{...expected,artifactDigest:'x'}])assert.throws(()=>releaseExpectation(value));
  assert.equal(releaseExpectationFingerprint({...expected}),releaseExpectationFingerprint(Object.fromEntries(Object.entries(expected).reverse())));
  assert.notEqual(releaseExpectationFingerprint(expected),releaseExpectationFingerprint({...expected,releaseId:'release-2'}));
  assert.ok(Object.isFrozen(releaseExpectation(expected)));
});
test('manifest transport uses separate probe credential, challenge and bounded abort; denies service-role fallback',async()=>{
  const cluster={id:'fixture-a',url:'https://fixture.invalid'},credential={publishableKey:'test-public',token:jwt('roomqc_control_probe')};
  let calls=0;
  const fetcher=async(url,init,entry)=>{
    calls++;assert.equal(url,cluster.url+'/rest/v1/rpc/control_cluster_manifest');assert.equal(entry,cluster);
    assert.equal(init.headers.authorization,'Bearer '+credential.token);assert.equal(init.headers.apikey,credential.publishableKey);
    assert.equal(init.redirect,'error');assert.ok(init.signal);const body=JSON.parse(init.body);assert.match(body.p_challenge,/^[a-f0-9]{64}$/);
    return {ok:true,json:async()=>({...manifest(),challenge:body.p_challenge})};
  };
  assert.equal((await probeReleaseManifest({},cluster,{expected,credential,fetcher,now})).clusterId,'fixture-a');assert.equal(calls,1);
  for(const auth of [{...credential,token:jwt('service_role')},{...credential,publishableKey:'sb_secret_forbidden'},
    {...credential,publishableKey:jwt('service_role')},{...credential,token:'not-jwt'},
    {...credential,token:['header',Buffer.from(JSON.stringify({role:'roomqc_control_probe'})).toString('base64url'),'signature'].join('.')},
    ...[1,Math.floor(now/1000)+30,'invalid',null,Number.MAX_SAFE_INTEGER,Math.floor(now/1000)+120.5]
      .map(exp=>({...credential,token:jwt('roomqc_control_probe',exp)}))]){
    await assert.rejects(()=>probeReleaseManifest({},cluster,{expected,credential:auth,fetcher,now}),{code:'RELEASE_MANIFEST_MISMATCH'});
  }
  assert.equal(calls,1,'Rejected credentials must never reach transport');
  await assert.rejects(()=>probeReleaseManifest({},cluster,{expected,credential,fetcher:async()=>{throw new Error('network details with private address')}}),
    {code:'RELEASE_MANIFEST_UNAVAILABLE'});
});
