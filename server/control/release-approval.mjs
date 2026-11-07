import {createHash,createPublicKey,verify} from 'node:crypto';
import {ControlError,uuidPattern} from './errors.mjs';
import {releaseExpectation,releaseExpectationFingerprint} from './release-manifest.mjs';
import {normalizeAddress} from './safe-http.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';

export const releaseApprovalDomain='roomqc.release-approval.v1:';
const environments=['local','staging','production'];
const ref=value=>typeof value==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(value);
const digest=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const integer=value=>Number.isSafeInteger(value)&&value>0;
const instant=value=>Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
const invalid=()=>new ControlError(409,'RELEASE_APPROVAL_INVALID','Phê duyệt bản phát hành chưa hợp lệ hoặc đã hết hiệu lực.');
const trustInvalid=()=>new ControlError(503,'RELEASE_APPROVAL_TRUST_INVALID','Nguồn xác minh phê duyệt bản phát hành chưa hợp lệ.');
const hash=value=>createHash('sha256').update(value).digest('hex');
function exact(value,keys){
  if(value===null||typeof value!=='object'||Array.isArray(value)
    ||![Object.prototype,null].includes(Object.getPrototypeOf(value)))return false;
  const own=Reflect.ownKeys(value);
  return own.length===keys.length&&keys.every(key=>{
    const d=Object.getOwnPropertyDescriptor(value,key);
    return d&&d.enumerable&&Object.hasOwn(d,'value');
  });
}
// Only validated, reconstructed data reaches this canonicalizer. All numbers
// are bounded integers; IDs/digests are ASCII and no caller toJSON is evaluated.
const canonical=value=>JSON.stringify(value,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
function base64url(value,size){
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]+$/.test(value)||value.length!==Math.ceil(size*8/6))throw invalid();
  const bytes=Buffer.from(value,'base64url');
  if(bytes.length!==size||bytes.toString('base64url')!==value)throw invalid();
  return bytes;
}
const expectedFields=['clusterId','releaseId','artifactDigest','frontendArtifactDigest','migrationSetHash','schemaManifestHash'];
function expectation(value){
  if(!exact(value,expectedFields))throw invalid();
  return releaseExpectation(value);
}
function binding(value){
  if(!exact(value,['inventoryRef','clusterId','hostId','environment','endpointFingerprint','expected'])
    ||!ref(value.inventoryRef)||!ref(value.clusterId)||value.clusterId.length>40||!ref(value.hostId)
    ||!environments.includes(value.environment)||!digest(value.endpointFingerprint))throw invalid();
  const expected=expectation(value.expected);
  if(expected.clusterId!==value.clusterId)throw invalid();
  return {inventoryRef:value.inventoryRef,clusterId:value.clusterId,hostId:value.hostId,environment:value.environment,
    endpointFingerprint:value.endpointFingerprint,expected};
}
function unsignedEnvelope(value){
  if(!exact(value,['version','algorithm','issuerId','keyId','payload'])||value.version!==1||value.algorithm!=='Ed25519'
    ||!ref(value.issuerId)||!ref(value.keyId))throw invalid();
  const p=value.payload;
  if(!exact(p,['approvalId','epoch','inventoryRef','clusterId','hostId','environment','endpointFingerprint','expected','notBefore','expiresAt'])
    ||typeof p.approvalId!=='string'||!uuidPattern.test(p.approvalId)||p.approvalId!==p.approvalId.toLowerCase()
    ||!integer(p.epoch)||!instant(p.notBefore)||!instant(p.expiresAt)||p.expiresAt<=p.notBefore)throw invalid();
  const target=binding(Object.fromEntries(['inventoryRef','clusterId','hostId','environment','endpointFingerprint','expected'].map(k=>[k,p[k]])));
  return {version:1,algorithm:'Ed25519',issuerId:value.issuerId,keyId:value.keyId,
    payload:{approvalId:p.approvalId,epoch:p.epoch,...target,notBefore:p.notBefore,expiresAt:p.expiresAt}};
}
// Shared bytes contract for an OUTSIDE-runtime signer. This function never
// accepts a private key and does not itself grant authority or create approval.
export function releaseApprovalSigningBytes(input){
  try{return Buffer.from(releaseApprovalDomain+canonical(unsignedEnvelope(input)),'utf8')}catch{throw invalid()}
}
// This binds existing inventory; it does not allow a signed envelope to choose
// a network destination or replace the safe-http origin/address/SSRF checks.
export function releaseApprovalEndpointFingerprint(input){
  try{
    if(!exact(input,['url','internalUrl','approvedAddresses','credentialRef'])||!ref(input.credentialRef)
      ||!Array.isArray(input.approvedAddresses)||input.approvedAddresses.length>64)throw invalid();
    for(const value of [input.url,input.internalUrl??input.url]){
      if(typeof value!=='string'||value.length>2048)throw invalid();
      const u=new URL(value);
      if(!['http:','https:'].includes(u.protocol)||u.origin!==value||u.username||u.password)throw invalid();
    }
    if(input.internalUrl!==null&&typeof input.internalUrl!=='string')throw invalid();
    const addresses=input.approvedAddresses.map(normalizeAddress).sort();
    if(new Set(addresses).size!==addresses.length)throw invalid();
    return hash(canonical({url:input.url,internalUrl:input.internalUrl,approvedAddresses:addresses,credentialRef:input.credentialRef}));
  }catch{throw invalid()}
}

export class ReleaseApprovalTrust {
  #keys;
  #maximumValidityMs;
  constructor(raw,{maximumValidityMs}={}){
    try{
      if(!integer(maximumValidityMs)||!exact(raw,['version','keys'])||raw.version!==1||!Array.isArray(raw.keys)
        ||raw.keys.length<1||raw.keys.length>100)throw trustInvalid();
      this.#maximumValidityMs=maximumValidityMs;this.#keys=new Map();
      for(const value of raw.keys){
        if(!exact(value,['issuerId','keyId','publicKey','environments'])||!ref(value.issuerId)||!ref(value.keyId)
          ||!exact(value.publicKey,['kty','crv','x'])||value.publicKey.kty!=='OKP'||value.publicKey.crv!=='Ed25519'
          ||!Array.isArray(value.environments)||value.environments.length<1||value.environments.length>3
          ||new Set(value.environments).size!==value.environments.length||value.environments.some(e=>!environments.includes(e)))throw trustInvalid();
        base64url(value.publicKey.x,32);
        const id=value.issuerId+'\0'+value.keyId;if(this.#keys.has(id))throw trustInvalid();
        const jwk={kty:'OKP',crv:'Ed25519',x:value.publicKey.x},publicKey=createPublicKey({key:jwk,format:'jwk'});
        if(publicKey.asymmetricKeyType!=='ed25519')throw trustInvalid();
        this.#keys.set(id,Object.freeze({publicKey,fingerprint:hash(publicKey.export({format:'der',type:'spki'})),
          environments:Object.freeze([...value.environments])}));
      }
      Object.freeze(this);
    }catch{throw trustInvalid()}
  }
  verify(envelope,context,{now=Date.now()}={}){
    try{
      if(!instant(now)||!exact(envelope,['version','algorithm','issuerId','keyId','payload','signature']))throw invalid();
      const raw=Object.fromEntries(['version','algorithm','issuerId','keyId','payload'].map(k=>[k,envelope[k]]));
      const clean=unsignedEnvelope(raw),bytes=releaseApprovalSigningBytes(clean),signature=base64url(envelope.signature,64);
      const key=this.#keys.get(clean.issuerId+'\0'+clean.keyId),p=clean.payload,wanted=binding(context);
      if(!key||!key.environments.includes(p.environment)||!verify(null,bytes,key.publicKey,signature)
        ||p.notBefore>now||p.expiresAt<=now||p.expiresAt-p.notBefore>this.#maximumValidityMs
        ||!['inventoryRef','clusterId','hostId','environment','endpointFingerprint'].every(k=>p[k]===wanted[k])
        ||releaseExpectationFingerprint(p.expected)!==releaseExpectationFingerprint(wanted.expected))throw invalid();
      return Object.freeze({...p,issuerId:clean.issuerId,keyId:clean.keyId,keyFingerprint:key.fingerprint,
        envelopeDigest:hash(canonical({...clean,signature:envelope.signature})),
        expectationFingerprint:releaseExpectationFingerprint(p.expected)});
    }catch{throw invalid()}
  }
  // Readiness may compare an already installer-verified durable identity with
  // the current public trust file. This is not signature verification or a
  // substitute for verify() or primary authority checks before any write.
  acceptsIdentity(value){
    if(!exact(value,['issuerId','keyId','keyFingerprint','environment'])||!ref(value.issuerId)||!ref(value.keyId)
      ||!digest(value.keyFingerprint)||!environments.includes(value.environment))return false;
    const key=this.#keys.get(value.issuerId+'\0'+value.keyId);
    return !!key&&key.fingerprint===value.keyFingerprint&&key.environments.includes(value.environment);
  }
}
export async function loadReleaseApprovalTrust(file,options){
  // Unlike a missing optional legacy catalog, missing trust material is an error.
  try{return new ReleaseApprovalTrust(JSON.parse(await boundedHealthFile(file,64*1024,{sensitive:true})),options)}
  catch{throw trustInvalid()}
}
