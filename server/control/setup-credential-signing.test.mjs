import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID,generateKeyPairSync} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {credentialIssueReceipt,loadCredentialReceiptSigner} from './setup-credential-signing.mjs';
import {publishSetupCredential} from './setup-credential-publication.mjs';

const sha=value=>createHash('sha256').update(value).digest('hex');
const binding={clusterId:'owned-cluster',bindingHash:'a'.repeat(64),releaseFingerprint:'b'.repeat(64)};
const receipt=()=>({commandId:randomUUID(),operation:'issue',version:2,...{clusterId:binding.clusterId,bindingSha256:binding.bindingHash,
  releaseSha256:binding.releaseFingerprint},credentialId:randomUUID(),affectedIds:[],historicalResult:true,predecessorId:null,
  overlapDeadline:null,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,
  signerAlgorithm:'HS256',signerFingerprint:'c'.repeat(64)});
const good=()=>{const r=receipt();r.affectedIds=[r.credentialId];return r};

test('credential receipt rejects target substitution, extended lifetime, extra claims and expired historical replay',()=>{
  const r=good();assert.equal(credentialIssueReceipt(r,binding).credentialId,r.credentialId);
  for(const patch of [{releaseSha256:'d'.repeat(64)},{bindingSha256:'d'.repeat(64)},{clusterId:'other'},
    {exp:r.iat+3601},{exp:r.iat+119},{iat:r.iat+100},{iat:r.iat-3700,exp:r.iat-100},
    {historicalResult:false},{affectedIds:[randomUUID()]},{token:'never-a-receipt'},{signerAlgorithm:'none'}])
    assert.throws(()=>credentialIssueReceipt({...r,...patch},binding),{code:'SETUP_PUBLICATION_RECEIPT_INVALID'});
});

for(const algorithm of ['HS256','RS256','ES256'])test('credential signing '+algorithm+' pins key and exact receipt claims; tamper and file rotation fail',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'roomqc-signing-'));
  try{
    if(process.platform==='win32'){
      const account=(process.env.USERDOMAIN?process.env.USERDOMAIN+'\\':'')+process.env.USERNAME;
      execFileSync('icacls',[directory,'/inheritance:r','/grant:r',account+':(OI)(CI)F','SYSTEM:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
    }
    let material,fingerprint;
    if(algorithm==='HS256'){material='owned-unit-signing-key-32-byte-minimum';fingerprint=sha(material)}
    else{
      const pair=generateKeyPairSync(algorithm==='RS256'?'rsa':'ec',algorithm==='RS256'?{modulusLength:2048}:{namedCurve:'prime256v1'});
      material=pair.privateKey.export({type:'pkcs8',format:'pem'});fingerprint=sha(pair.publicKey.export({type:'spki',format:'der'}));
    }
    const keyFile=join(directory,'signer');await writeFile(keyFile,material,{flag:'wx',mode:0o600});
    const r={...good(),signerAlgorithm:algorithm,signerFingerprint:fingerprint};
    const config={algorithm,fingerprint,keyFile,keyId:algorithm==='HS256'?null:'owned-key'};
    const signer=await loadCredentialReceiptSigner(config,r),value=await signer.sign(r,binding,'sb_publishable_owned_fixture');
    assert.equal((await signer.verify(value,binding,r)).token,value.token);
    const parts=value.token.split('.');parts[1]=Buffer.from(JSON.stringify({...JSON.parse(Buffer.from(parts[1],'base64url')),role:'service_role'})).toString('base64url');
    await assert.rejects(()=>signer.verify({...value,token:parts.join('.')},binding,r),{code:'SETUP_PUBLICATION_TOKEN_INVALID'});
    await assert.rejects(()=>signer.verify(value,binding,{...r,credentialId:randomUUID()}),{code:'SETUP_PUBLICATION_TOKEN_INVALID'});
    await assert.rejects(()=>loadCredentialReceiptSigner({...config,fingerprint:'f'.repeat(64)},r),{code:'SETUP_PUBLICATION_SIGNER_INVALID'});
    await writeFile(keyFile,material+'changed');
    await assert.rejects(()=>signer.sign(r,binding,'sb_publishable_owned_fixture'),{code:'SETUP_PUBLICATION_SIGNER_CHANGED'});
  }finally{await rm(directory,{recursive:true,force:true})}
});

test('publisher has no path for an unsigned receipt or absent external authority fence',async()=>{
  let queries=0;const client={query(){queries++;throw new Error('not allowed')}};
  await assert.rejects(()=>publishSetupCredential({client,outputFile:join(tmpdir(),'owned.json')}),{code:'SETUP_PUBLICATION_CONFIG_INVALID'});
  assert.equal(queries,0);
});
