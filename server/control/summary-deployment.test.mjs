import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {summaryCredentialInstallerConfiguration} from './tenant-summary-installer.mjs';
import {summaryRotationConfiguration} from './tenant-summary-rotation.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
test('unbound deployment template cannot authorize a database or release and policy paths fit private mounts',()=>{
 const template=read('deploy/monitoring/summary-installer.template.json');
 assert.throws(()=>summaryCredentialInstallerConfiguration(template),{code:'SUMMARY_INSTALLER_CONFIG_INVALID'});
 const policy=read('deploy/monitoring/summary-rotation.example.json');
 assert.equal(policy.installerConfigFile,'/etc/roomqc/private/summary-installer.json');
 assert.equal(policy.journalDirectory,'/var/lib/roomqc/summary-rotation-journal');
 assert.equal(template.publisher.outputFile,'/run/roomqc/summary/summary.json');
 // The checked-in policy targets Linux containers. Validate timing/shape using
 // native absolute paths on Windows; the Linux native diagnostic uses /etc.
 summaryRotationConfiguration(process.platform==='win32'?{...policy,
  installerConfigFile:join(tmpdir(),'summary-private','installer.json'),journalDirectory:join(tmpdir(),'summary-journal')}:policy);
});

test('native Compose resolves distinct private journal/output mounts and read-only Control consumer without creating resources',
 {skip:process.env.ROOMQC_SUMMARY_COMPOSE_TEST!=='1'},()=>{
 const file='deploy/monitoring/summary-rotation.compose.yml';
 const env={...process.env,COMPOSE_DISABLE_ENV_FILE:'true',ROOMQC_SUMMARY_ROTATION_PROJECT:'roomqc-summary-contract',
  ROOMQC_SUMMARY_IMAGE:'roomqc-control@sha256:'+'1'.repeat(64),ROOMQC_RESOURCE_ENVIRONMENT:'staging',
  ROOMQC_SUMMARY_ROTATION_CONFIG_FILE:join(tmpdir(),'roomqc-contract','policy.json'),
  ROOMQC_SUMMARY_INSTALLER_PRIVATE_DIR:join(tmpdir(),'roomqc-contract','private'),
  ROOMQC_SUMMARY_ROTATION_JOURNAL_DIR:join(tmpdir(),'roomqc-contract','journal'),
  ROOMQC_SUMMARY_CREDENTIALS_DIR:join(tmpdir(),'roomqc-contract','output'),
  ROOMQC_SUMMARY_DIRECTORY_NETWORK:'roomqc-contract-directory',ROOMQC_SUMMARY_EGRESS_NETWORK:'roomqc-contract-egress'};
 const result=spawnSync('docker',['compose','-f',join(root,file),'--profile','summary-rotation','config','--format','json'],
  {encoding:'utf8',env,timeout:15000,windowsHide:true});
 assert.equal(result.status,0,'Compose must render the reviewed summary profile');
 const rendered=JSON.parse(result.stdout),s=rendered.services['summary-credential-rotation'];
 assert.equal(s.user,'1000:1000');assert.equal(s.read_only,true);assert.deepEqual(s.cap_drop,['ALL']);
 assert(s.security_opt.includes('no-new-privileges:true'));assert.equal(s.privileged,undefined);
 assert.equal(s.ports,undefined);assert.equal(s.network_mode,undefined);
 const mounts=new Map(s.volumes.map(v=>[v.target,v]));
 for(const target of ['/etc/roomqc/rotation.json','/etc/roomqc/private'])assert.equal(mounts.get(target).read_only,true);
 for(const target of ['/var/lib/roomqc/summary-rotation-journal','/run/roomqc/summary'])assert.notEqual(mounts.get(target).read_only,true);
 assert.equal(new Set(s.volumes.map(v=>v.source)).size,4);
 assert(s.volumes.every(v=>v.bind.create_host_path===false));
 assert.equal(rendered.networks.directory.external,true);assert.equal(rendered.networks.egress.external,true);
 // Supply only the base image required to render this overlay in isolation.
 // This is config validation; no container/network/volume is created.
 const base=JSON.stringify({services:{'roomqc-control':{image:env.ROOMQC_SUMMARY_IMAGE}}});
 const reader=spawnSync('docker',['compose','-f','-','-f',join(root,'deploy/monitoring/summary-consumer.compose.yml'),'config','--format','json'],
  {input:base,encoding:'utf8',env,timeout:15000,windowsHide:true});
 assert.equal(reader.status,0);const consumer=JSON.parse(reader.stdout).services['roomqc-control'];
 assert.equal(consumer.user,'1000:1000');assert.equal(consumer.volumes.length,1);
 assert.equal(consumer.volumes[0].target,'/run/roomqc/summary');assert.equal(consumer.volumes[0].read_only,true);
 assert.equal(consumer.volumes[0].source,mounts.get('/run/roomqc/summary').source);
 const missing={...env};delete missing.ROOMQC_SUMMARY_CREDENTIALS_DIR;
 const refused=spawnSync('docker',['compose','-f',join(root,file),'--profile','summary-rotation','config','--format','json'],
  {encoding:'utf8',env:missing,timeout:15000,windowsHide:true});
 assert.notEqual(refused.status,0,'Missing reviewed output path must not create an implicit host directory');
});
