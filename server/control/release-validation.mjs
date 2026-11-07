import {constants,openSync,closeSync,fstatSync,lstatSync,readSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
import {ControlError} from './errors.mjs';
import {releaseExpectation,releaseExpectationFingerprint,releaseProbeCredential} from './release-manifest.mjs';
import {resolveCredential} from './registry.mjs';
import {validateHealthSecretAccess} from './workers/health-config.mjs';
import {ReleaseApprovalTrust,releaseApprovalEndpointFingerprint} from './release-approval.mjs';

const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)
  &&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const unavailable=()=>new ControlError(409,'RELEASE_MANIFEST_REQUIRED','Cần cấu hình bản phát hành và credential canary đã duyệt ngoài runtime.');
const migrationReceiptInvalid=()=>new ControlError(409,'RELEASE_MIGRATION_RECEIPT_REQUIRED','Bằng chứng migration nghiệp vụ chưa hoàn tất hoặc không khớp bản phát hành.');
const validateMigrationReceipt=value=>{
  if(!exact(value,['version','status','migrationSetSha256','totalCount','appliedCount','pending','complete'])
    ||value.version!==1||value.status!=='complete'||typeof value.migrationSetSha256!=='string'
    ||!/^[a-f0-9]{64}$/.test(value.migrationSetSha256)||!Number.isSafeInteger(value.totalCount)||value.totalCount<1
    ||!Number.isSafeInteger(value.appliedCount)||value.appliedCount!==value.totalCount||!Array.isArray(value.pending)
    ||value.pending.length!==0||value.complete!==true)throw migrationReceiptInvalid();
  return Object.freeze({version:1,status:'complete',migrationSetSha256:value.migrationSetSha256,
    totalCount:value.totalCount,appliedCount:value.appliedCount,pending:Object.freeze([]),complete:true});
};

// Installer-owned approval and a narrow, short-lived manifest credential. No
// user HTTP body or runtime-observed hash may populate this catalog.
export class ReleaseValidationCatalog {
  #entries;
  #trust;
  constructor(raw,{trust,now=Date.now(),requireMigrationReceipt=false}={}){
    if(!(trust instanceof ReleaseApprovalTrust)||!exact(raw,['version','entries'])||![2,3].includes(raw.version)
      ||requireMigrationReceipt&&raw.version!==3||!Array.isArray(raw.entries)||raw.entries.length<1||raw.entries.length>100)throw unavailable();
    this.#trust=trust;
    this.#entries=new Map();
    for(const value of raw.entries){
      const entryFields=raw.version===3?['inventoryRef','approval','credential','migrationReceipt']:['inventoryRef','approval','credential'];
      if(!exact(value,entryFields)||typeof value.inventoryRef!=='string'
        ||!/^[a-z][a-z0-9-]{1,63}$/.test(value.inventoryRef)||this.#entries.has(value.inventoryRef))throw unavailable();
      const approval=structuredClone(value.approval),p=approval?.payload;
      const context=Object.fromEntries(['inventoryRef','clusterId','hostId','environment','endpointFingerprint','expected'].map(k=>[k,p?.[k]]));
      const verified=trust.verify(approval,context,{now});
      if(verified.inventoryRef!==value.inventoryRef)throw unavailable();
      const expected=verified.expected,credential=releaseProbeCredential(value.credential,{now});
      const migrationReceipt=raw.version===3?validateMigrationReceipt(value.migrationReceipt):null;
      if(migrationReceipt&&migrationReceipt.migrationSetSha256!==expected.migrationSetHash)throw migrationReceiptInvalid();
      this.#entries.set(value.inventoryRef,{approval,context,expected,credential,migrationReceipt});
    }
    Object.freeze(this);
  }
  get(inventoryRef,{now=Date.now()}={}){
    const value=this.#entries.get(inventoryRef);if(!value)throw unavailable();
    const approval=this.#trust.verify(value.approval,value.context,{now});
    releaseProbeCredential(value.credential,{now});return Object.freeze({expected:value.expected,credential:value.credential,approval});
  }
  authorization(inventoryRef,context,{now=Date.now()}={}){
    const value=this.#entries.get(inventoryRef);if(!value)throw unavailable();
    return this.#trust.verify(value.approval,context,{now});
  }
  expectation(inventoryRef){
    const value=this.#entries.get(inventoryRef);if(!value)throw unavailable();
    // Immutable approval identity only. The session manager independently
    // rotates live canary credentials; an old catalog token is never returned.
    return value.expected;
  }
  migrationReceipt(inventoryRef){
    const value=this.#entries.get(inventoryRef);if(!value)throw unavailable();
    return value.migrationReceipt;
  }
}
function readReleaseFile(path,max){
  let fd;
  try{
    if(typeof path!=='string'||!isAbsolute(path))throw unavailable();
    const entry=lstatSync(path);if(!entry.isFile()||entry.isSymbolicLink())throw unavailable();
    fd=openSync(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0));const stat=fstatSync(fd);
    if(!stat.isFile()||stat.dev!==entry.dev||stat.ino!==entry.ino||stat.size<1||stat.size>max)throw unavailable();
    if(process.platform!=='win32')validateHealthSecretAccess(stat,{runtimeUid:process.getuid(),runtimeGid:process.getgid()});
    const bytes=Buffer.alloc(max+1);let count=0;
    try{
      while(count<bytes.length){const n=readSync(fd,bytes,count,bytes.length-count,null);if(!n)break;count+=n}
      if(count>max)throw unavailable();
      return JSON.parse(bytes.subarray(0,count).toString('utf8'));
    }finally{bytes.fill(0)}
  }catch{throw unavailable()}finally{if(fd!==undefined)closeSync(fd)}
}
export function loadReleaseValidationCatalog(path,{trustFile,maximumValidityMs,requireMigrationReceipt=false}={}){
  if(path===undefined&&trustFile===undefined&&maximumValidityMs===undefined)return null;
  try{
    const trust=new ReleaseApprovalTrust(readReleaseFile(trustFile,64*1024),{maximumValidityMs});
    return new ReleaseValidationCatalog(readReleaseFile(path,256*1024),{trust,requireMigrationReceipt});
  }catch{throw unavailable()}
}
export function releaseAuthorizationContext(config,row,{now=Date.now()}={}){
  const entry=config.inventory?.get(row.inventory_ref);
  if(!entry?.releaseId||!entry.schemaManifestHash||entry.frontendReady!==true||!config.releaseValidation)throw unavailable();
  const expected=releaseExpectation(config.releaseValidation.expectation(entry.id)),
    migrationReceipt=config.releaseValidation.migrationReceipt?.(entry.id)??null,cluster=resolveCredential(config,row);
  if(expected.clusterId!==row.id||entry.hostId!==row.host_id||expected.releaseId!==entry.releaseId
    ||expected.schemaManifestHash!==entry.schemaManifestHash)throw unavailable();
  if(config.production&&!migrationReceipt||migrationReceipt&&validateMigrationReceipt(migrationReceipt).migrationSetSha256!==expected.migrationSetHash)throw migrationReceiptInvalid();
  const approval=config.releaseValidation.authorization(entry.id,{inventoryRef:entry.id,clusterId:row.id,hostId:entry.hostId,
    environment:entry.environment,expected,endpointFingerprint:releaseApprovalEndpointFingerprint({url:cluster.url,
      internalUrl:cluster.internalUrl??null,approvedAddresses:cluster.approvedAddresses??[],credentialRef:row.credential_ref})},{now});
  return {entry,cluster,expected,migrationReceipt,approval};
}
export function releaseValidationContext(config,row,{now=Date.now()}={}){
  const {entry,cluster,expected,migrationReceipt,approval}=releaseAuthorizationContext(config,row,{now});
  const {credential:auth}=config.releaseValidation.get(entry.id,{now}),credential=releaseProbeCredential(auth,{now});
  if(credential.publishableKey!==cluster.publishableKey)throw unavailable();
  // Include secret fingerprints but never the secret itself in the returned
  // validation receipt. A reload/rotation or endpoint/release change fences it.
  const fingerprint=hash({inventoryRef:entry.id,clusterId:row.id,hostId:row.host_id,url:cluster.url,
    internalUrl:cluster.internalUrl??null,approvedAddresses:[...(cluster.approvedAddresses??[])].sort(),
    credentialRef:row.credential_ref,expectationFingerprint:releaseExpectationFingerprint(expected),migrationReceiptFingerprint:hash(migrationReceipt),credentialFingerprint:hash(credential),
    approvalId:approval.approvalId,envelopeDigest:approval.envelopeDigest,approvalEpoch:approval.epoch});
  return {entry,cluster,expected,migrationReceipt,credential,fingerprint,approval};
}
export function assertReleaseValidation(config,row,validation,{now=Date.now()}={}){
  const current=releaseValidationContext(config,row,{now}),manifest=validation?.manifest;
  const checkedAt=typeof manifest?.checkedAt==='string'?Date.parse(manifest.checkedAt):NaN;
  if(!validation||validation.inventoryRef!==current.entry.id||validation.validationFingerprint!==current.fingerprint
    ||(current.migrationReceipt&&validation.migrationReceiptFingerprint!==hash(current.migrationReceipt))
    ||validation.releaseId!==current.expected.releaseId||validation.schemaManifestHash!==current.expected.schemaManifestHash
    ||validation.frontendReady!==true||validation.publishableKey!==current.cluster.publishableKey
    ||validation.vapidPublicKey!==current.cluster.vapidPublicKey||!Number.isFinite(checkedAt)||checkedAt<now-30000||checkedAt>now+5000
    ||manifest.contractVersion!==3||manifest.schemaFingerprintVersion!==3
    ||manifest.expectationFingerprint!==releaseExpectationFingerprint(current.expected)
    ||!Object.entries(current.expected).every(([key,value])=>manifest[key]===value)){
    throw new ControlError(409,'VALIDATION_REQUIRED','Cấu hình hoặc bằng chứng xác minh cụm đã thay đổi. Hãy xác minh lại.');
  }
  return current;
}
