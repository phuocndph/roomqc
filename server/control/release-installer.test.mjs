import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,symlink,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,dirname,basename} from 'node:path';
import {randomUUID} from 'node:crypto';
import {releaseInstallerArguments,releaseInstallerCommand,runReleaseInstaller} from './release-installer.mjs';
import {releaseInstallerMain} from './release-installer-cli.mjs';
import {fixtureReleaseTrust,fixtureReleaseApproval,fixtureReleaseContext} from './release-test-fixtures.mjs';
import {fixtureCluster} from './test-fixtures.mjs';
import {syntheticRelease} from './probe-test-fixtures.mjs';

const local={ROOMQC_RELEASE_INSTALLER_ALLOW_LOCAL:'true'};
const command={version:1,operation:'withdraw_key',keyFingerprint:'a'.repeat(64),expectedVersion:0,key:randomUUID(),requestId:randomUUID(),reason:'Owned installer unit fixture'};
async function ownedFiles(run){
  const root=await mkdtemp(join(tmpdir(),'roomqc-installer-unit-'));
  const configFile=join(root,'config.json'),commandFile=join(root,'command.json'),databaseUrlFile=join(root,'database-url');
  const config={version:1,databaseUrlFile,expectedDatabase:'fixture',trustFile:join(root,'trust.json'),inventoryFile:join(root,'inventory.json'),maximumValidityMs:3600000};
  await writeFile(configFile,JSON.stringify(config),{mode:0o600});await writeFile(commandFile,JSON.stringify(command),{mode:0o600});
  await writeFile(databaseUrlFile,'postgresql://fixture:private_marker@192.0.2.1/fixture?sslmode=disable',{mode:0o600});
  try{await run({root,config,configFile,commandFile,databaseUrlFile,args:['--config-file',configFile,'--command-file',commandFile]})}
  finally{
    assert.equal(dirname(await realpath(root)),await realpath(tmpdir()));assert.ok(basename(root).startsWith('roomqc-installer-unit-'));
    await rm(root,{recursive:true});
  }
}
test('release installer accepts only absolute config/command file arguments; help and errors never echo raw arguments',async()=>{
  const messages=[],output={log:v=>messages.push(v),error:v=>messages.push(v)};
  assert.equal(await releaseInstallerMain(['--help'],{},output),0);
  for(const args of [[],['--database-url','postgresql://user:private_marker@localhost/db'],['--config-file','relative','--command-file','relative'],
    ['--config-file',join(tmpdir(),'a'),'--config-file',join(tmpdir(),'b')]]){
    assert.throws(()=>releaseInstallerArguments(args),{code:'RELEASE_INSTALLER_ARGUMENTS_INVALID'});
    assert.equal(await releaseInstallerMain(args,local,output),1);
  }
  assert.ok(!messages.join('\n').includes('private_marker'));
});
test('release installer command requires a stable caller key and rejects extra fields, raw secrets or ambiguous operations',()=>{
  assert.deepEqual(releaseInstallerCommand(command),command);
  assert.deepEqual(releaseInstallerCommand({version:1,operation:'receipt',key:command.key}),{version:1,operation:'receipt',key:command.key});
  for(const raw of [{...command,key:undefined},{...command,expectedVersion:2},{...command,keyFingerprint:'A'.repeat(64)},
    {...command,reason:' x '},{...command,serviceKey:'private_marker'},{...command,operation:'execute'},
    {version:1,operation:'check',key:command.key},{version:1,operation:'install',approvalFile:'relative'}]){
    assert.throws(()=>releaseInstallerCommand(raw),{code:'RELEASE_INSTALLER_COMMAND_INVALID'});
  }
});
test('release installer rejects unsafe DSN, relative secret references and malformed private config before connecting',async()=>{
  await ownedFiles(async f=>{
    await assert.rejects(()=>runReleaseInstaller(f.args,local),{code:'INVALID_HEALTH_CONFIG'});
    for(const extra of [{databaseUrlFile:'relative'},{apiKey:'private_marker'},{maximumValidityMs:0},{expectedDatabase:'other;unsafe'}]){
      await writeFile(f.configFile,JSON.stringify({...f.config,...extra}));
      await assert.rejects(()=>runReleaseInstaller(f.args,local),{code:'RELEASE_INSTALLER_CONFIG_INVALID'});
    }
    await writeFile(f.configFile,'{"private_marker":');
    const errors=[];assert.equal(await releaseInstallerMain(f.args,local,{log:v=>errors.push(v),error:v=>errors.push(v)}),1);
    assert.ok(!errors.join('').includes('private_marker'));
  });
});
test('release installer rejects oversized, directory, leaf symlink and parent symlink files',async()=>{
  await ownedFiles(async f=>{
    const oversize=join(f.root,'oversize'),leaf=join(f.root,'leaf'),folder=join(f.root,'folder'),alias=join(f.root,'alias');
    await writeFile(oversize,'x'.repeat(8193),{mode:0o600});await mkdir(folder);
    await writeFile(join(folder,'config.json'),JSON.stringify(f.config),{mode:0o600});
    await symlink(folder,alias,process.platform==='win32'?'junction':'dir');
    // A directory junction also exercises the parent path case on Windows.
    await symlink(folder,leaf,process.platform==='win32'?'junction':'dir');
    for(const file of [oversize,folder,leaf,join(alias,'config.json')]){
      await assert.rejects(()=>runReleaseInstaller(['--config-file',file,'--command-file',f.commandFile],local),{code:'RELEASE_INSTALLER_FILE_INVALID'});
    }
  });
});
test('public trust readiness identities compare the physical key and environment without granting approval',()=>{
  const context=fixtureReleaseContext(fixtureCluster,syntheticRelease),proof=fixtureReleaseTrust.verify(fixtureReleaseApproval(context),context);
  const identity={issuerId:proof.issuerId,keyId:proof.keyId,keyFingerprint:proof.keyFingerprint,environment:proof.environment};
  assert.equal(fixtureReleaseTrust.acceptsIdentity(identity),true);
  for(const v of [{...identity,keyFingerprint:'0'.repeat(64)},{...identity,keyId:'different-key'},
    {...identity,environment:'invalid'},{...identity,issuerId:{toString:()=>assert.fail('must not coerce')}},
    {...identity,signature:'extra'}])assert.equal(fixtureReleaseTrust.acceptsIdentity(v),false);
});
