// Internal installer component, not an HTTP route or a standalone signing CLI.
// The enclosing installer must preflight DB identity, role/catalog, budget and
// signed/live directory release. assertAuthority is mandatory at every fence.
import {createHash,randomUUID} from 'node:crypto';
import {open,lstat,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,basename,isAbsolute,resolve,parse,relative} from 'node:path';
import {assertSetupBackfillAccess,readSetupBackfillFile} from './setup-backfill-files.mjs';
import {summaryCredentialCanonical,summaryIssueReceipt,loadSummaryReceiptSigner} from './tenant-summary-signing.mjs';
import {summaryMaintenanceBinding} from './tenant-summary-maintenance.mjs';
import {readTenantSummary} from './tenant-summary.mjs';
import {boundedHealthFile} from './workers/health-config.mjs';

const fail=code=>{throw Object.assign(new Error(code),{code})};
const sha=value=>createHash('sha256').update(value).digest('hex');
const flags=constants.O_NOFOLLOW??0;
const same=(a,b)=>a.dev===b.dev&&a.ino===b.ino;
const regular=info=>info.isFile()&&info.nlink===1;
async function assertPublicationFile(path,info,code){
  // Preserve the publisher's specific hardlink error before shared access
  // validation rejects the inode. Other access failures stay sanitized.
  if(info.isFile()&&info.nlink!==1)fail(code);
  await assertSetupBackfillAccess(path);if(!regular(info))fail(code);
}
async function optionalStat(path){try{return await lstat(path)}catch(error){if(error.code==='ENOENT')return null;throw error}}
async function guardedDirectory(path){
  await assertSetupBackfillAccess(path,{directory:true});
  // Every ancestor is owner-controlled. A root-owned sticky /tmp is allowed;
  // the private leaf beneath it must still be 0700/current uid or root.
  if(process.platform!=='win32'){
    const root=parse(path).root;let cursor=root;
    for(const part of relative(root,path).split('/')){
      cursor=resolve(cursor,part);const info=await lstat(cursor);
      if(info.isSymbolicLink()||![0,process.getuid()].includes(info.uid)
        ||(info.mode&0o022)!==0&&!(info.uid===0&&(info.mode&0o1000)!==0))fail('SUMMARY_PUBLICATION_DIRECTORY_UNSAFE');
    }
  }
  return lstat(path);
}

/** Publish a committed issue receipt while holding the DB maintenance mutex.
 * Private intent is deterministic; it authorizes only its exact temporary path.
 * Partial intent is repaired only if it is an exact prefix of that intent.
 * Output is replaced only when absent, this credential, or its predecessor.
 * DB and filesystem are explicitly separate durable steps. */
export async function publishSummaryCredential({client,target,receipt,signer:signerConfig,publishableKeyFile,outputFile,
  assertAuthority,onPhase=async()=>{},allowWindowsLocal=false}){
  let locked=false,directoryHandle;
  try{
    if(!client||typeof client.query!=='function'||typeof assertAuthority!=='function'||typeof onPhase!=='function'
      ||typeof outputFile!=='string'||!isAbsolute(outputFile)||resolve(outputFile)!==outputFile
      ||process.platform==='win32'&&!allowWindowsLocal)fail('SUMMARY_PUBLICATION_CONFIG_INVALID');
    const directory=dirname(outputFile),name=basename(outputFile);
    if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/.test(name))fail('SUMMARY_PUBLICATION_CONFIG_INVALID');
    const binding=summaryMaintenanceBinding(target.cluster,target.expected);
    const committed=summaryIssueReceipt(receipt,binding);
    // No transaction/network RPC is kept open while waiting for a row lock.
    // This is a fail-fast SESSION lock, also acquired by the SQL commands.
    locked=(await client.query('SELECT pg_catalog.pg_try_advisory_lock(727013) AS locked')).rows[0]?.locked===true;
    if(!locked)fail('SUMMARY_PUBLICATION_BUSY');
    const root=await guardedDirectory(directory);
    if(process.platform!=='win32')directoryHandle=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY|flags);
    const checkDirectory=async()=>{
      if(!same(root,await guardedDirectory(directory))||directoryHandle&&!same(root,await directoryHandle.stat()))
        fail('SUMMARY_PUBLICATION_DIRECTORY_CHANGED');
    };
    const fence=async()=>{
      await checkDirectory();await assertAuthority();
      // One statement snapshot, historical receipt separately compared to the
      // immutable one supplied by the issuer; neither is used as the other.
      const row=(await client.query(`SELECT roomqc_summary_admin.receipt($1::uuid) AS receipt,
        roomqc_summary_admin.status() AS status`,[committed.commandId])).rows[0];
      const s=row?.status;
      if(summaryCredentialCanonical(row?.receipt)!==summaryCredentialCanonical(committed)||!s||s.historicalResult!==false||s.ready!==true
        ||s.reasonCode!==null||s.version!==committed.version||s.clusterId!==binding.clusterId||s.bindingSha256!==binding.bindingHash
        ||s.releaseSha256!==binding.releaseFingerprint||s.credential?.id!==committed.credentialId||s.credential.revokedAt!==null
        ||s.credential.retireAfter!==null||Date.parse(s.credential.notBefore)!==committed.iat*1000
        ||Date.parse(s.credential.expiresAt)!==committed.exp*1000||!Number.isFinite(Date.parse(s.observedAt)))
        fail('SUMMARY_PUBLICATION_NOT_CURRENT');
      summaryIssueReceipt(committed,binding,{now:Date.parse(s.observedAt)});
    };
    await fence();
    const signer=await loadSummaryReceiptSigner(signerConfig,committed);
    const publishableKey=(await readSetupBackfillFile(publishableKeyFile,16001)).trim();
    const intentFile=resolve(directory,'.'+name+'.'+committed.commandId+'.intent');
    const stageFile=resolve(directory,'.'+name+'.'+committed.commandId+'.stage');
    const intent=summaryCredentialCanonical({version:1,commandId:committed.commandId,receiptSha256:sha(summaryCredentialCanonical(committed)),
      bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint,outputName:name,
      signerFingerprint:signer.fingerprint,publishableKeySha256:sha(publishableKey)})+'\n';
    const phase=async name=>{await onPhase(name);await fence();await signer.assertUnchanged();
      if((await readSetupBackfillFile(publishableKeyFile,16001)).trim()!==publishableKey)fail('SUMMARY_PUBLICATION_KEY_CHANGED')};
    // A known immutable prefix can result from a killed write. An unrelated
    // file, hardlink or different receipt is never truncated or overwritten.
    let intentHandle;
    try{
      const previous=await optionalStat(intentFile);
      if(previous){
        await assertPublicationFile(intentFile,previous,'SUMMARY_PUBLICATION_INTENT_INVALID');
        // ENOSPC can leave this exclusive, private intent empty. Empty is a
        // valid prefix, but only after the same inode/access checks as other
        // sensitive reads; signer/config readers still reject empty inputs.
        const text=await boundedHealthFile(intentFile,8192,{sensitive:true,allowEmpty:true});
        if(!intent.startsWith(text))fail('SUMMARY_PUBLICATION_INTENT_CONFLICT');
        intentHandle=await open(intentFile,constants.O_RDWR|flags);
        if(!same(previous,await intentHandle.stat()))fail('SUMMARY_PUBLICATION_FILE_CHANGED');
      }else intentHandle=await open(intentFile,constants.O_RDWR|constants.O_CREAT|constants.O_EXCL|flags,0o600);
      await intentHandle.writeFile(intent);await intentHandle.truncate(Buffer.byteLength(intent));await intentHandle.sync();
    }finally{await intentHandle?.close()}
    await directoryHandle?.sync();await phase('intent_synced');
    const inspectOutput=async()=>{
      const info=await optionalStat(outputFile);if(!info)return null;
      await assertPublicationFile(outputFile,info,'SUMMARY_PUBLICATION_OUTPUT_INVALID');
      const value=JSON.parse(await readSetupBackfillFile(outputFile,40000));
      if(value?.version!==1||value.clusterId!==binding.clusterId||value.bindingSha256!==binding.bindingHash||typeof value.token!=='string')
        fail('SUMMARY_PUBLICATION_OUTPUT_CONFLICT');
      let id;try{id=JSON.parse(Buffer.from(value.token.split('.')[1],'base64url')).jti}catch{fail('SUMMARY_PUBLICATION_OUTPUT_INVALID')}
      if(id===committed.credentialId)await signer.verify(value,binding,committed);
      else if(id!==committed.predecessorId||id===null)fail('SUMMARY_PUBLICATION_OUTPUT_CONFLICT');
      if(id===committed.credentialId&&value.publishableKey!==publishableKey)fail('SUMMARY_PUBLICATION_OUTPUT_CONFLICT');
      return {info,id,sha256:sha(summaryCredentialCanonical(value))};
    };
    const previous=await inspectOutput();
    // A stage file can be partially written when killed. The durable exact
    // intent owns this one path, so repair only this regular private file.
    if(previous?.id!==committed.credentialId){
      const stale=await optionalStat(stageFile);
      if(stale){
        await assertPublicationFile(stageFile,stale,'SUMMARY_PUBLICATION_STAGE_INVALID');
        if(!same(stale,await lstat(stageFile)))fail('SUMMARY_PUBLICATION_FILE_CHANGED');
        await unlink(stageFile);
      }
      await phase('before_stage');
      const value=await signer.sign(committed,binding,publishableKey);
      let stageHandle;
      try{
        stageHandle=await open(stageFile,constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|flags,0o600);
        await assertSetupBackfillAccess(stageFile);
        await stageHandle.writeFile(JSON.stringify(value)+'\n');await stageHandle.sync();
      }finally{await stageHandle?.close()}
      await phase('stage_synced');
      const current=await inspectOutput();
      if(!!current!==!!previous||current&&(!same(previous.info,current.info)||previous.sha256!==current.sha256))
        fail('SUMMARY_PUBLICATION_OUTPUT_CHANGED');
      await phase('before_rename');await rename(stageFile,outputFile);await phase('after_rename');
    }
    await directoryHandle?.sync();await phase('directory_synced');
    await signer.verify(JSON.parse(await readSetupBackfillFile(outputFile,40000)),binding,committed);
    const cluster={...target.cluster,ref:target.cluster.credentialRef,publishableKey};
    const config={allowLocal:target.allowLocal===true,inventory:new Map([[cluster.inventoryRef,
      {...cluster,tenantSummaryCredentialFile:outputFile}]])};
    const proof=await readTenantSummary(config,cluster,{id:randomUUID(),tenant_id:randomUUID(),owner_id:randomUUID(),
      hotel_id:randomUUID(),cluster_id:cluster.id,api_url:cluster.url,routing_version:1});
    if(proof.status!=='unavailable'||proof.errorCode!=='TENANT_SUMMARY_MISSING')fail('SUMMARY_PUBLICATION_RPC_INVALID');
    await phase('rpc_verified');
    return Object.freeze({commandId:committed.commandId,credentialId:committed.credentialId,expiresAt:committed.exp*1000,
      filePublished:true,nativeRpcVerified:true,directorySynced:!!directoryHandle,historicalResult:false,
      operationalInstallerVerified:false});
  }catch(error){
    // Never propagate native filesystem/crypto/pg/transport messages or paths.
    const code=/^SUMMARY_PUBLICATION_[A-Z_]{1,64}$/.test(error?.code??'')?error.code:'SUMMARY_PUBLICATION_FAILED';
    throw Object.assign(new Error(code),{code});
  }finally{
    try{await directoryHandle?.close()}
    finally{if(locked){
      try{if((await client.query('SELECT pg_catalog.pg_advisory_unlock(727013) AS unlocked')).rows[0]?.unlocked!==true)
        fail('SUMMARY_PUBLICATION_UNLOCK_FAILED')}
      catch{fail('SUMMARY_PUBLICATION_UNLOCK_FAILED')}
    }}
  }
}
