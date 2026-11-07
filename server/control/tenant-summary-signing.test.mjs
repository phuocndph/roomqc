import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {summaryIssueReceipt,summaryReceiptClaims,summaryCredentialCanonical,loadSummaryReceiptSigner} from './tenant-summary-signing.mjs';
const binding={clusterId:'summary-a',bindingHash:'1'.repeat(64),releaseFingerprint:'2'.repeat(64)};
const fixture=()=>{const now=Math.floor(Date.now()/1000),id=randomUUID();return {commandId:randomUUID(),operation:'issue',version:2,
 clusterId:binding.clusterId,bindingSha256:binding.bindingHash,releaseSha256:binding.releaseFingerprint,credentialId:id,affectedIds:[id],
 historicalResult:true,predecessorId:null,overlapDeadline:null,iat:now,exp:now+600,signerAlgorithm:'HS256',signerFingerprint:'3'.repeat(64)}};
test('summary signer derives exact capability claims solely from issue receipt',()=>{
 const r=summaryIssueReceipt(fixture(),binding),claims=summaryReceiptClaims(r);
 assert.deepEqual(Object.keys(claims).sort(),['aud','binding_sha256','cluster_id','exp','iat','iss','jti','role']);
 assert.equal(claims.role,'roomqc_tenant_summary');assert.equal(claims.iss,'roomqc-tenant-summary/v1');
 assert.equal(claims.jti,r.credentialId);assert.equal(claims.iat,r.iat);assert.equal(claims.exp,r.exp);
 assert(Object.isFrozen(r));
});
test('summary receipt rejects wrong release target lifetime signer and caller-added claims',()=>{
 for(const delta of [{clusterId:'other'},{bindingSha256:'f'.repeat(64)},{releaseSha256:'f'.repeat(64)},
  {operation:'bind'},{historicalResult:false},{affectedIds:[]},{signerAlgorithm:'none'},{signerFingerprint:'x'},
  {role:'service_role'},{exp:Math.floor(Date.now()/1000)+4000},{iat:Math.floor(Date.now()/1000)+10}]){
  assert.throws(()=>summaryIssueReceipt({...fixture(),...delta},binding),{code:'SUMMARY_PUBLICATION_RECEIPT_INVALID'});
 }
 const r=fixture();assert.throws(()=>summaryIssueReceipt({...r,exp:r.iat+119},binding),{code:'SUMMARY_PUBLICATION_RECEIPT_INVALID'});
 assert.throws(()=>summaryIssueReceipt({...r,exp:r.iat+3601},binding),{code:'SUMMARY_PUBLICATION_RECEIPT_INVALID'});
});
test('receipt expiry is not extended during replay and overlap must be bound to a predecessor',()=>{
 const r=fixture();assert.throws(()=>summaryIssueReceipt(r,binding,{now:r.exp*1000-9000}),{code:'SUMMARY_PUBLICATION_RECEIPT_INVALID'});
 assert.throws(()=>summaryIssueReceipt({...r,overlapDeadline:new Date().toISOString()},binding),{code:'SUMMARY_PUBLICATION_RECEIPT_INVALID'});
 const next={...r,predecessorId:randomUUID(),overlapDeadline:new Date().toISOString()};
 assert.equal(summaryIssueReceipt(next,binding).exp,r.exp);
});
test('malformed signer config fails closed without reading arbitrary paths or leaking native details',async()=>{
 await assert.rejects(loadSummaryReceiptSigner({algorithm:'none',keyFile:'private-secret-path'},fixture()),{code:'SUMMARY_PUBLICATION_SIGNER_INVALID'});
 assert.equal(summaryCredentialCanonical({b:2,a:{z:1,y:2}}),'\u007b"a":{"y":2,"z":1},"b":2}');
});
