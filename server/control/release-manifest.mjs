import {createHash,randomBytes} from 'node:crypto';
import {ControlError} from './errors.mjs';
import {createClusterFetch} from './safe-http.mjs';

const hash=/^[a-f0-9]{64}$/;
const expectedFields=['clusterId','releaseId','artifactDigest','frontendArtifactDigest','migrationSetHash','schemaManifestHash'];
const manifestFields=[...expectedFields,'contractVersion','schemaFingerprintVersion','expectedSchemaManifestHash','challenge','checkedAt'];
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));
const invalid=()=>new ControlError(409,'RELEASE_MANIFEST_MISMATCH','Phiên bản hoặc schema thực tế chưa khớp bản phát hành được duyệt.');

// This must be loaded from a trusted release artifact/inventory, never inferred
// by copying the observed database hash or accepted from an HTTP request body.
export function releaseExpectation(input){
  if(!exact(input,expectedFields)||typeof input.clusterId!=='string'||!/^[a-z][a-z0-9-]{1,39}$/.test(input.clusterId)
    ||typeof input.releaseId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(input.releaseId)
    ||!expectedFields.slice(2).every(key=>typeof input[key]==='string'&&hash.test(input[key])))throw invalid();
  return Object.freeze(Object.fromEntries(expectedFields.map(key=>[key,input[key]])));
}
export function releaseExpectationFingerprint(input){
  return createHash('sha256').update(JSON.stringify(releaseExpectation(input))).digest('hex');
}
export function verifyReleaseManifest(value,input,challenge,{now=Date.now()}={}){
  const expected=releaseExpectation(input);
  const time=typeof value?.checkedAt==='string'?Date.parse(value.checkedAt):NaN;
  if(!hash.test(challenge)||!exact(value,manifestFields)||value.contractVersion!==3||value.schemaFingerprintVersion!==3
    ||value.challenge!==challenge||!Number.isFinite(time)||time>now+5000||time<now-30000
    ||!expectedFields.every(key=>value[key]===expected[key])||value.expectedSchemaManifestHash!==expected.schemaManifestHash)throw invalid();
  return Object.freeze({...expected,contractVersion:3,schemaFingerprintVersion:3,checkedAt:value.checkedAt,
    expectationFingerprint:releaseExpectationFingerprint(expected)});
}
export function releaseProbeCredential(credential,{now=Date.now()}={}){
  if(!exact(credential,['publishableKey','token'])||typeof credential.publishableKey!=='string'||!credential.publishableKey||credential.publishableKey.length>16000
    ||/\s/.test(credential.publishableKey)||credential.publishableKey.startsWith('sb_secret_')||typeof credential.token!=='string'
    ||credential.token.length>16000||credential.token.split('.').length!==3||/\s/.test(credential.token))throw invalid();
  let payload,keyRole;
  try{payload=JSON.parse(Buffer.from(credential.token.split('.')[1],'base64url'));}catch{throw invalid()}
  try{keyRole=JSON.parse(Buffer.from(credential.publishableKey.split('.')[1],'base64url')).role}catch{}
  if(payload?.role!=='roomqc_control_probe'||!Number.isSafeInteger(payload.exp)||!Number.isSafeInteger(payload.exp*1000)
    ||payload.exp*1000<=now+30000||keyRole==='service_role'||credential.token===credential.publishableKey)throw invalid();
  // Shape and expiry are not signature verification; the live RPC verifies JWT.
  return Object.freeze({publishableKey:credential.publishableKey,token:credential.token});
}
export async function probeReleaseManifest(config,cluster,{expected,credential,signal,fetcher,now}={}){
  const expectation=releaseExpectation(expected),auth=releaseProbeCredential(credential,{now:now??Date.now()});
  if(expectation.clusterId!==cluster.id)throw invalid();
  const challenge=randomBytes(32).toString('hex'),timeout=AbortSignal.timeout(5000);
  const deadline=signal?AbortSignal.any([signal,timeout]):timeout;
  let response,value;
  try{
    response=await (fetcher??createClusterFetch(config))(`${cluster.internalUrl||cluster.url}/rest/v1/rpc/control_cluster_manifest`,{
      method:'POST',redirect:'error',signal:deadline,headers:{apikey:auth.publishableKey,authorization:'Bearer '+auth.token,
        'content-type':'application/json'},body:JSON.stringify({p_challenge:challenge})},cluster);
    if(!response.ok)throw invalid();value=await response.json();
  }catch(error){
    if(error instanceof ControlError)throw error;
    throw new ControlError(503,'RELEASE_MANIFEST_UNAVAILABLE','Chưa xác minh được manifest tại đúng cụm dữ liệu.');
  }
  return verifyReleaseManifest(value,expectation,challenge,{now:now??Date.now()});
}
