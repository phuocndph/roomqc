import test from 'node:test';
import assert from 'node:assert/strict';
import {deploymentEnvironment,deploymentEnvironmentFiles} from './deployment-environment.mjs';
import {deploymentCompose} from './vps-deploy.mjs';
import {verifyDeploymentEnvironments,installDeploymentEnvironment} from '../../scripts/lib/deployment-environment-remote.mjs';

const clusterId='environment-fixture',image='roomqc/control@sha256:'+'b'.repeat(64);
test('private vendor configuration binds literal values through a digest, without putting credentials in Compose',()=>{
  const secret='test-only-${PASSWORD} # quote\' " $(touch /tmp/unwanted)';
  const file=deploymentEnvironment({DATABASE_URL:secret,ROOMQC_CONTROL_SIGNUP_ENABLED:'false'},clusterId);
  const result=deploymentCompose({services:{auth:{image,env_file:[file.envFile],healthcheck:{test:['CMD','true']}}}},
    {clusterId,releaseId:'release-one',image});
  assert(!result.source.includes(secret));assert(!result.source.includes('DATABASE_URL'));
  assert.equal(result.environmentFiles[0].sha256,file.sha256);assert(file.source.includes('DATABASE_URL='+secret+'\n'));
  assert.equal(deploymentEnvironment({ROOMQC_CONTROL_SIGNUP_ENABLED:'false',DATABASE_URL:secret},clusterId).sha256,file.sha256);
  const changed=deploymentEnvironment({DATABASE_URL:secret+'changed'},clusterId);
  assert.notEqual(file.path,changed.path);
});
test('private configuration rejects multiline injection, invalid variables, oversized input and enabling signup',()=>{
  for(const value of [{A:'one\nADMIN=true'},{A:'one\rADMIN=true'},{A:'a\0b'},{'A-B':'value'},
    {A:1},{},{ROOMQC_CONTROL_SIGNUP_ENABLED:'true'},{A:'x'.repeat(65536)}])
    assert.throws(()=>deploymentEnvironment(value,clusterId));
});
test('env files cannot be optional, interpolated, shared across clusters or outside the content-addressed directory',()=>{
  const file=deploymentEnvironment({A:'test'},clusterId);
  for(const entry of [file.path,{...file.envFile,format:'dotenv'},{...file.envFile,required:false},
    {...file.envFile,path:file.path.replace(clusterId,'another-cluster')},
    {...file.envFile,path:file.path.replace('/env/','/../env/')},{...file.envFile,extra:'value'}]){
    assert.throws(()=>deploymentEnvironmentFiles({services:{auth:{env_file:[entry]}}},clusterId));
  }
  assert.throws(()=>deploymentEnvironmentFiles({services:{auth:{env_file:[]}}},clusterId));
  assert.throws(()=>deploymentEnvironmentFiles({services:{auth:{env_file:[file.envFile,file.envFile]}}},clusterId));
});
test('environment installation sends values only on stdin and verifies immutable private ownership',async()=>{
  const calls=[],environment={PASSWORD:'synthetic-$-not-shell-code'};
  const file=await installDeploymentEnvironment(async(...args)=>{calls.push(args);return {stdout:''}}, {clusterId,environment});
  assert.equal(calls.length,1);assert(!calls[0][0].includes(environment.PASSWORD));assert(calls[0][1].includes(environment.PASSWORD));
  assert(!JSON.stringify(file).includes(environment.PASSWORD));
  const script=verifyDeploymentEnvironments([file],clusterId);
  assert(script.includes('0:600:1'));assert(script.includes('test ! -L'));assert(script.includes(file.sha256));
});
