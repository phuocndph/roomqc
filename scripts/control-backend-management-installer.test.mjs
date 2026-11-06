import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {managementJourneyInstallInput,managementJourneyApprovalContext} from './control-backend-management-installer.mjs';
import {managementInstallPlan} from '../server/control/management-install-plan.mjs';
import {ReleaseApprovalTrust} from '../server/control/release-approval.mjs';

const repository=fileURLToPath(new URL('..',import.meta.url));
const fixture=()=>({repository,backend:{diagnosticOnly:true,run:'012345abcdef',publishableKey:'public-fixture',serviceKey:'private-fixture-only'},
 control:'roomqc/control@sha256:'+'a'.repeat(64),frontend:'roomqc/web@sha256:'+'b'.repeat(64),binding:{sha256:'c'.repeat(64)}});

test('management journey rejects external or invalid targets before reading configuration',async()=>{
 for(const backend of [{diagnosticOnly:false,run:'012345abcdef'},{diagnosticOnly:true,run:'production'}]){
  await assert.rejects(()=>managementJourneyInstallInput({...fixture(),repository:'nonexistent',backend}),{code:'ERR_ASSERTION'});
 }
});

test('management journey hands immutable inputs to the real installer without generated credentials or public service keys',async()=>{
 const input=await managementJourneyInstallInput(fixture()),root='/opt/RoomQC/management/mi-012345abcdef';
 assert.equal(input.descriptor.deploymentId,'mi-012345abcdef');assert.equal(input.descriptor.environment,'local');
 assert(input.files.every(f=>f.path.startsWith(root+'/private/')||f.path.startsWith(root+'/metadata/')));
 assert(!input.files.some(f=>f.path.startsWith(root+'/private/runtime/')||f.path.startsWith(root+'/operator/')||f.path.startsWith(root+'/private/tls/')));
 const registry=JSON.parse(input.registryText);assert(!input.registryText.includes('private-fixture-only'));assert(!('serviceKey' in registry[0]));
 for(const path of [input.descriptor.apiRelease.catalogFile,input.descriptor.apiRelease.trustFile])assert(input.files.some(f=>f.path===path));
 const catalog=JSON.parse(input.files.find(f=>f.path===input.descriptor.apiRelease.catalogFile).content);
 const trust=new ReleaseApprovalTrust(JSON.parse(input.files.find(f=>f.path===input.descriptor.apiRelease.trustFile).content),{maximumValidityMs:input.descriptor.apiRelease.maximumValidityMs});
 const approval=catalog.entries[0].approval,verified=trust.verify(approval,managementJourneyApprovalContext(approval));
 assert.equal(verified.approvalId,approval.payload.approvalId);
 const plan=managementInstallPlan({...input,budgetText:input.files.find(f=>f.path===input.descriptor.files.budget).content,targetHost:'11.253.2.2'});
 assert(!JSON.stringify(plan).includes('private-fixture-only'));assert.equal(plan.externalConsumers.length,2);
 const changed=structuredClone(input);changed.files.find(f=>f.path===changed.descriptor.files.apiEnvironment).content+='ROOMQC_PUBLIC_URL=http://changed.invalid\n';
 assert.notEqual(managementInstallPlan({...changed,budgetText:changed.files.find(f=>f.path===changed.descriptor.files.budget).content,targetHost:'11.253.2.2'}).specSha256,plan.specSha256);
});
