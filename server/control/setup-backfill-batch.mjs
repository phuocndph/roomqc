import {createHash,createPublicKey,verify} from 'node:crypto';
import {uuidPattern} from './errors.mjs';
import {exact} from './probe-secrets.mjs';
import {SetupBackfillScanner,setupBackfillGroups} from './setup-backfill.mjs';

const fail=()=>{throw Object.assign(new Error('SETUP_BACKFILL_BATCH_INVALID'),{code:'SETUP_BACKFILL_BATCH_INVALID'})};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const ref=v=>typeof v==='string'&&/^[a-z][a-z0-9-]{1,63}$/.test(v);
const uuid=v=>typeof v==='string'&&uuidPattern.test(v)&&v===v.toLowerCase();
const name=v=>typeof v==='string'&&Buffer.byteLength(v)>0&&Buffer.byteLength(v)<=63&&!/[\x00-\x1f\x7f]/.test(v);
const integer=v=>Number.isSafeInteger(v)&&v>0;
const instant=v=>Number.isSafeInteger(v)&&v>=0&&v<=8640000000000000;
const decimal=(v,max)=>typeof v==='string'&&/^[1-9][0-9]{0,19}$/.test(v)&&BigInt(v)<=max;
const canonical=v=>JSON.stringify(v,(_key,item)=>item&&typeof item==='object'&&!Array.isArray(item)
  ?Object.fromEntries(Object.keys(item).sort().map(k=>[k,item[k]])):item);
export const setupBackfillBatchDomain='roomqc.setup-backfill-approved-batch.v1:';
export const setupBackfillFileSha256=v=>createHash('sha256').update(v).digest('hex');
function target(t){
  if(!exact(t,['systemIdentifier','databaseOid','databaseName','readerRole','writerRole'])
    ||!decimal(t.systemIdentifier,18446744073709551615n)||!decimal(t.databaseOid,4294967295n)
    ||!name(t.databaseName)||!name(t.readerRole)||!name(t.writerRole)||t.readerRole===t.writerRole)fail();
  return structuredClone(t);
}
function row(r){
  if(!exact(r,['workspaceId','clusterId','routingVersion','snapshotSha256','group'])||!uuid(r.workspaceId)
    ||!ref(r.clusterId)||r.clusterId.length>40||!integer(r.routingVersion)||!digest(r.snapshotSha256)||!setupBackfillGroups.includes(r.group))fail();
  return structuredClone(r);
}
const rowValue=r=>row(Object.fromEntries(['workspaceId','clusterId','routingVersion','snapshotSha256','group'].map(k=>[k,r[k]])));
function unsigned(raw){
  if(!exact(raw,['version','algorithm','keyId','payload'])||raw.version!==1||raw.algorithm!=='Ed25519'||!ref(raw.keyId))fail();
  const p=raw.payload;
  if(!exact(p,['batchId','environment','notBefore','expiresAt','reviewerRef','changeRef','source','target','bindings','reportSha256','scopeSha256','resourceBudgetSha256','items'])
    ||!uuid(p.batchId)||!['local','staging','production'].includes(p.environment)||!instant(p.notBefore)||!instant(p.expiresAt)
    ||p.expiresAt<=p.notBefore||p.expiresAt-p.notBefore>86400000||!ref(p.reviewerRef)||!ref(p.changeRef)
    ||!exact(p.source,['backendSha256','backendFiles'])||!digest(p.source.backendSha256)||!integer(p.source.backendFiles)||p.source.backendFiles>2048
    ||!digest(p.reportSha256)||!digest(p.scopeSha256)||!digest(p.resourceBudgetSha256)
    ||!Array.isArray(p.bindings)||!p.bindings.length||p.bindings.length>16||!Array.isArray(p.items)||!p.items.length||p.items.length>100)fail();
  target(p.target);
  for(const b of p.bindings)if(!exact(b,['clusterId','approvalId','epoch','envelopeDigest','credentialRef'])
    ||!ref(b.clusterId)||b.clusterId.length>40||!uuid(b.approvalId)||!integer(b.epoch)||!digest(b.envelopeDigest)||!ref(b.credentialRef))fail();
  if(new Set(p.bindings.map(b=>b.clusterId)).size!==p.bindings.length)fail();
  for(const r of p.items){row(r);if(!p.bindings.some(b=>b.clusterId===r.clusterId))fail()}
  if(new Set(p.items.map(r=>r.workspaceId)).size!==p.items.length)fail();
  return structuredClone(raw);
}
/** Bytes for an external approver. No private key is accepted by the runtime. */
export function setupBackfillBatchSigningBytes(raw){
  return Buffer.from(setupBackfillBatchDomain+canonical(unsigned(raw)),'utf8');
}
export function verifySetupBackfillBatch(envelope,trust,{now=Date.now()}={}){
  try{
    if(!exact(envelope,['version','algorithm','keyId','payload','signature'])
      ||!exact(trust,['version','keys'])||trust.version!==1||!Array.isArray(trust.keys)||!trust.keys.length||trust.keys.length>16)fail();
    const clean=unsigned(Object.fromEntries(['version','algorithm','keyId','payload'].map(k=>[k,envelope[k]]))),p=clean.payload;
    const ids=new Set();let wanted;
    for(const key of trust.keys){
      if(!exact(key,['keyId','publicKey','environment','target'])||!ref(key.keyId)||ids.has(key.keyId)
        ||!['local','staging','production'].includes(key.environment)||!exact(key.publicKey,['kty','crv','x'])
        ||key.publicKey.kty!=='OKP'||key.publicKey.crv!=='Ed25519'||typeof key.publicKey.x!=='string'
        ||!/^[A-Za-z0-9_-]{43}$/.test(key.publicKey.x)||Buffer.from(key.publicKey.x,'base64url').toString('base64url')!==key.publicKey.x)fail();
      target(key.target);ids.add(key.keyId);if(key.keyId===clean.keyId)wanted=key;
    }
    if(!wanted||wanted.environment!==p.environment||canonical(wanted.target)!==canonical(p.target)||!instant(now)
      ||now<p.notBefore||now>=p.expiresAt||typeof envelope.signature!=='string'||!/^[A-Za-z0-9_-]{86}$/.test(envelope.signature))fail();
    const signature=Buffer.from(envelope.signature,'base64url');
    if(signature.length!==64||signature.toString('base64url')!==envelope.signature
      ||!verify(null,setupBackfillBatchSigningBytes(clean),createPublicKey({key:wanted.publicKey,format:'jwk'}),signature))fail();
    return p;
  }catch{fail()}
}
/** The signature binds exact report bytes, the reviewed target and selected rows. */
export function validateSetupBackfillBatchReport(p,reportText,config,source,{now=Date.now(),schemaVersion}={}){
  try{
    const r=JSON.parse(reportText),e=config.directory.expected,t=p.target;
    if(p.environment!==config.environment||['systemIdentifier','databaseOid','databaseName'].some(k=>t[k]!==e[k])||t.writerRole!==e.role
      ||p.source.backendSha256!==source.sha256||p.source.backendFiles!==source.files.length
      ||canonical(r.source)!==canonical(p.source)||setupBackfillFileSha256(reportText)!==p.reportSha256
      ||p.resourceBudgetSha256!==config.resourceContext?.budgetSha256||r.resourceBudgetSha256!==p.resourceBudgetSha256
      ||r.schemaVersion!==1||r.mode!=='dry_run'||r.readOnly!==true||r.directorySchemaVersion!==schemaVersion
      ||r.scopeSha256!==p.scopeSha256||!Array.isArray(r.items)||r.items.length>100||r.items.length!==r.pageCount
      ||!exact(r.counts,setupBackfillGroups)||!Number.isFinite(Date.parse(r.observedAt))
      ||Date.parse(r.observedAt)>now+5000||now-Date.parse(r.observedAt)>86400000)fail();
    const bindings=config.targets.map(t=>t.identity).sort((a,b)=>a.clusterId.localeCompare(b.clusterId));
    if(canonical([...p.bindings].sort((a,b)=>a.clusterId.localeCompare(b.clusterId)))!==canonical(bindings))fail();
    const readerExpected={systemIdentifier:e.systemIdentifier,databaseOid:e.databaseOid,databaseName:e.databaseName,role:t.readerRole};
    const scanner=new SetupBackfillScanner({connect(){}},{expected:readerExpected,bindings,gateways:[]});
    if(scanner.scopeSha256!==r.scopeSha256||new Set(r.items.map(i=>i.workspaceId)).size!==r.items.length)fail();
    r.items.forEach(rowValue);
    for(const g of setupBackfillGroups)if(r.counts[g]!==r.items.filter(i=>i.group===g).length)fail();
    for(const item of p.items){const found=r.items.find(i=>i.workspaceId===item.workspaceId);
      if(!found||canonical(rowValue(found))!==canonical(item))fail()}
    return p;
  }catch{fail()}
}
