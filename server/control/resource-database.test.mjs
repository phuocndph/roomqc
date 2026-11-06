import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import pg from 'pg';
import {resourceDatabaseManifest,resourceDatabaseConnection,attestResourceDatabases} from './resource-database.mjs';
import {resourceDatabaseMain} from '../../scripts/control-backend-resource-database-check.mjs';

const example=JSON.parse(readFileSync(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
const sha=v=>createHash('sha256').update(v).digest('hex');
function fixture(){
  // Deliberately retained; no filesystem deletion is required to test the checker.
  const root=mkdtempSync(join(tmpdir(),'roomqc-db-resource-test-')),raw=structuredClone(example);
  raw.environment='local';
  for(const d of raw.databases)d.consumers.push({id:'resource-attestor',replicas:1,pools:[{id:'main',max:1}],fixedConnectionsPerReplica:0});
  const budgetFile=join(root,'budget.json'),save=()=>writeFileSync(budgetFile,JSON.stringify(raw));save();
  const manifest={schemaVersion:1,environment:'local',budgetFile,budgetSha256:sha(readFileSync(budgetFile)),
    databases:raw.databases.map((d,i)=>({databaseId:d.id,dsnFile:join(root,d.id+'.dsn'),
      expected:{systemIdentifier:'123456789',databaseOid:String(100+i),databaseName:'fixture_'+i,role:'attestor'}}))};
  const secret=e=>`postgresql://attestor:private-password@127.0.0.1:5432/${e.expected.databaseName}?sslmode=disable`;
  const readSecret=async file=>secret(manifest.databases.find(e=>e.dsnFile===file));
  const observation=entry=>({...entry.expected,sessionRole:'attestor',maxConnections:100,reservedConnections:3,
    inRecovery:false,postmasterStartedAt:'2026-10-28 01:00:00+00',readOnly:true,
    superuser:false,createDatabase:false,createRole:false,replication:false,bypassRls:false,canLogin:true,roleConnectionLimit:1,memberships:0});
  const readTarget=async c=>observation(manifest.databases.find(e=>e.expected.databaseName===c.database));
  const rebind=()=>{save();manifest.budgetSha256=sha(readFileSync(budgetFile))};
  return {root,raw,manifest,readSecret,readTarget,observation,rebind,secret};
}
async function run(f,changes={}){return attestResourceDatabases(f.manifest,{readSecret:f.readSecret,readTarget:f.readTarget,...changes})}

test('attestation combines distinct databases on the same PostgreSQL server and accounts for its own sessions',async()=>{
  const f=fixture(),result=await run(f);
  assert.equal(result.databaseTargetsVerified,true);assert.equal(result.observedServerBudgetsVerified,true);
  assert.equal(result.servers.length,1);assert.equal(result.servers[0].allocatedConnections,46);
  assert.equal(result.servers[0].reservedConnections,10);assert.equal(result.servers[0].committedConnections,56);
  assert.equal(result.servers[0].remainingConnections,44);assert.equal(result.servers[0].lineageSha256,sha('123456789'));
  for(const key of ['databaseIdentityVerified','runtimeVerified','capacityProven','deploymentReady'])assert.equal(result[key],false);
  assert.deepEqual(result.acceptance,{productAccepted:false,reviewer:null,signoff:null,gatesChanged:false});
  for(const secret of ['private-password','postgresql://','"attestor"','fixture_0','123456789','postmasterStartedAt'])assert.ok(!JSON.stringify(result).includes(secret));
});
test('individually valid logical budgets may exceed the shared PostgreSQL server limit',async()=>{
  const f=fixture();for(const d of f.raw.databases)d.maxConnections=50;f.rebind();
  await assert.rejects(()=>run(f),{code:'RESOURCE_DATABASE_SERVER_OVERCOMMITTED'});
});
test('the most restrictive declared server cap and largest shared reserve apply once',async()=>{
  const f=fixture();f.raw.databases[0].maxConnections=56;f.raw.databases[1].maxConnections=80;f.rebind();
  const report=await run(f);assert.equal(report.servers[0].remainingConnections,0);
  f.raw.databases[0].maxConnections=55;f.rebind();await assert.rejects(()=>run(f),{code:'RESOURCE_DATABASE_SERVER_OVERCOMMITTED'});
});
test('independent server lineages keep distinct budgets and observations remain sequential',async()=>{
  const f=fixture();f.manifest.databases[1].expected.systemIdentifier='987654321';let active=0,peak=0,calls=0;
  const result=await run(f,{readTarget:async c=>{active++;peak=Math.max(peak,active);await new Promise(r=>setImmediate(r));calls++;
    const o=await f.readTarget(c);active--;return o}});
  assert.equal(result.servers.length,2);assert.equal(calls,4);assert.equal(peak,1);
});
test('two logical IDs cannot count the same physical database twice',async()=>{
  const f=fixture();f.manifest.databases[1].expected.databaseOid=f.manifest.databases[0].expected.databaseOid;
  await assert.rejects(()=>run(f),{code:'RESOURCE_DATABASE_DUPLICATE_TARGET'});
});
test('matching lineages with inconsistent server settings/start time remain ambiguous',async()=>{
  for(const change of [{maxConnections:101},{reservedConnections:4},{postmasterStartedAt:'2026-10-28 02:00:00+00'}]){
    const f=fixture();await assert.rejects(()=>run(f,{readTarget:async c=>({...await f.readTarget(c),...(c.database==='fixture_1'?change:{})})}),{code:'RESOURCE_DATABASE_LINEAGE_AMBIGUOUS'});
  }
});
test('manifest schema is closed and bounded with canonical physical identity values',()=>{
  const f=fixture();assert.deepEqual(resourceDatabaseManifest(f.manifest),f.manifest);
  for(const mutate of [r=>r.extra=true,r=>r.schemaVersion=2,r=>r.environment='example',r=>r.budgetFile='relative',r=>r.budgetSha256='bad',
    r=>r.databases=[],r=>r.databases[1].databaseId=r.databases[0].databaseId,r=>r.databases[1].dsnFile=r.databases[0].dsnFile,
    r=>r.databases[0].expected.extra='bad',r=>r.databases[0].expected.systemIdentifier='0123',
    r=>r.databases[0].expected.systemIdentifier='18446744073709551616',r=>r.databases[0].expected.databaseOid='4294967296',
    r=>r.databases[0].expected.databaseName='x'.repeat(64),r=>r.databases[0].expected.role='bad\nrole']){
    const raw=structuredClone(f.manifest);mutate(raw);assert.throws(()=>resourceDatabaseManifest(raw),{code:'RESOURCE_DATABASE_MANIFEST_INVALID'});
  }
});
test('all mappings, attestor allocations and metadata are validated before any connection',async()=>{
  for(const [mutate,code]of [
    [f=>f.manifest.databases.pop(),'RESOURCE_DATABASE_MANIFEST_INVALID'],
    [f=>f.manifest.databases[1].databaseId='unknown','RESOURCE_DATABASE_MAPPING_MISMATCH'],
    [f=>f.manifest.budgetSha256='0'.repeat(64),'RESOURCE_DATABASE_PROFILE_MISMATCH'],
    [f=>f.manifest.environment='staging','RESOURCE_DATABASE_ENVIRONMENT_MISMATCH'],
    [f=>{f.raw.databases[1].consumers.pop();f.rebind()},'RESOURCE_DATABASE_ATTESTOR_UNACCOUNTED'],
    [f=>{f.raw.databases[0].consumers.at(-1).replicas=2;f.rebind()},'RESOURCE_DATABASE_ATTESTOR_UNACCOUNTED']]){
    const f=fixture();mutate(f);let calls=0;
    await assert.rejects(()=>run(f,{readTarget:async()=>{calls++;throw new Error()}}),{code});assert.equal(calls,0);
  }
});
test('secret read errors and DSN options cannot produce connections or leak credentials',async()=>{
  const f=fixture();let calls=0;
  for(const readSecret of [async()=>{throw new Error('private-password')},async file=>{const s=await f.readSecret(file);return file===f.manifest.databases[1].dsnFile?s+'&options=evil':s}]){
    await assert.rejects(()=>run(f,{readSecret,readTarget:async()=>{calls++;throw new Error('private-password')}}),e=>!e.message.includes('private-password'));
  }
  assert.equal(calls,0);
});
test('DSN parsing fixes target, TLS and session configuration without inherited PG settings',()=>{
  const f=fixture(),e=f.manifest.databases[0];
  const c=resourceDatabaseConnection(f.secret(e),e,'local');assert.equal(c.ssl,false);assert.equal(c.database,'fixture_0');
  for(const bad of [f.secret(e)+'&sslmode=disable',f.secret(e)+'&options=-c%20role=postgres',f.secret(e)+'#fragment',
    f.secret(e).replace('127.0.0.1','db.example'),f.secret(e).replace('attestor:','other:'),f.secret(e).replace('fixture_0','other'),
    f.secret(e).replace('disable','require'),f.secret(e).replace('private-password',''),f.secret(e).replace('?sslmode=disable','')])
    assert.throws(()=>resourceDatabaseConnection(bad,e,'local'),{code:'RESOURCE_DATABASE_DSN_INVALID'});
  assert.throws(()=>resourceDatabaseConnection(f.secret(e),e,'production'),{code:'RESOURCE_DATABASE_DSN_INVALID'});
  const tls=resourceDatabaseConnection(f.secret(e).replace('127.0.0.1','db.example').replace('disable','verify-full'),e,'production');
  assert.equal(tls.ssl.rejectUnauthorized,true);assert.equal(tls.ssl.servername,'db.example');assert.equal(tls.sslnegotiation,'postgres');
  assert.ok(tls.ssl.checkServerIdentity('wrong',{subject:{CN:'wrong'}}) instanceof Error);
  const keys=['PGHOST','PGDATABASE','PGUSER','PGPASSWORD','PGOPTIONS','PGSSLMODE','PGSSLNEGOTIATION','PGCLIENT_ENCODING','PGREPLICATION'];
  const prior=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
  try{for(const k of keys)process.env[k]='untrusted';const client=new pg.Client(c),p=client.connectionParameters;
    assert.equal(p.host,c.host);assert.equal(p.database,c.database);assert.equal(p.user,c.user);assert.equal(p.password,c.password);
    assert.equal(p.options,c.options);assert.equal(p.ssl,false);assert.equal(p.replication,'false');assert.equal(p.client_encoding,'UTF8');
  }finally{for(const k of keys)if(prior[k]===undefined)delete process.env[k];else process.env[k]=prior[k]}
});
test('identity, read-only, least privilege role and reserved/max settings mismatch fail closed',async()=>{
  const cases=[
    [{systemIdentifier:'99'},'RESOURCE_DATABASE_IDENTITY_MISMATCH'],[{databaseOid:'99'},'RESOURCE_DATABASE_IDENTITY_MISMATCH'],
    [{databaseName:'wrong'},'RESOURCE_DATABASE_IDENTITY_MISMATCH'],[{sessionRole:'wrong'},'RESOURCE_DATABASE_IDENTITY_MISMATCH'],
    [{inRecovery:true},'RESOURCE_DATABASE_IDENTITY_MISMATCH'],[{readOnly:false},'RESOURCE_DATABASE_ROLE_MISMATCH'],
    ...['superuser','createDatabase','createRole','replication','bypassRls'].map(k=>[{[k]:true},'RESOURCE_DATABASE_ROLE_MISMATCH']),
    [{memberships:1},'RESOURCE_DATABASE_ROLE_MISMATCH'],[{roleConnectionLimit:-1},'RESOURCE_DATABASE_ROLE_MISMATCH'],
    [{canLogin:false},'RESOURCE_DATABASE_ROLE_MISMATCH'],[{maxConnections:99},'RESOURCE_DATABASE_SETTINGS_MISMATCH'],
    [{reservedConnections:6},'RESOURCE_DATABASE_SETTINGS_MISMATCH'],[{maxConnections:'100'},'RESOURCE_DATABASE_OBSERVATION_INVALID'],
    [{extra:'private-password'},'RESOURCE_DATABASE_OBSERVATION_INVALID'],[{postmasterStartedAt:'nonsense'},'RESOURCE_DATABASE_OBSERVATION_INVALID']];
  for(const [change,code]of cases){const f=fixture();await assert.rejects(()=>run(f,{readTarget:async c=>({...await f.readTarget(c),...change})}),{code})}
});
test('a server restart or target/settings drift between observations cannot pass',async()=>{
  const f=fixture();let calls=0;
  await assert.rejects(()=>run(f,{readTarget:async c=>({...await f.readTarget(c),...(++calls>2?{postmasterStartedAt:'2026-10-28 02:00:00+00'}:{})})}),{code:'RESOURCE_DATABASE_OBSERVATION_DRIFT'});
});
test('budget and DSN changes during the run require a new attestation',async()=>{
  for(const change of ['budget','secret']){
    const f=fixture();let calls=0;
    await assert.rejects(()=>run(f,{readTarget:async c=>{const o=await f.readTarget(c);if(++calls===4&&change==='budget')writeFileSync(f.manifest.budgetFile,JSON.stringify(f.raw)+'\n');return o},
      readSecret:async file=>{const s=await f.readSecret(file);return change==='secret'&&calls===4?s+'\n':s}}),
      {code:change==='budget'?'RESOURCE_DATABASE_PROFILE_MISMATCH':'RESOURCE_DATABASE_SECRET_DRIFT'});
  }
});
test('CLI reports only safe allowlisted error codes and does not accept relative or ambiguous arguments',async()=>{
  const f=fixture(),manifestFile=join(f.root,'manifest.json');writeFileSync(manifestFile,JSON.stringify(f.manifest));
  for(const args of [[],['--manifest','relative'],['--manifest',manifestFile,'--extra']]){
    let text='';assert.equal(await resourceDatabaseMain(args,{output:{write:s=>text+=s}}),1);assert.equal(JSON.parse(text).code,'RESOURCE_DATABASE_ARGUMENTS_INVALID');
  }
  let text='';assert.equal(await resourceDatabaseMain(['--manifest',manifestFile],{output:{write:s=>text+=s},attest:async()=>{throw Object.assign(new Error('private-password'),{code:'private-password'})}}),1);
  assert.equal(JSON.parse(text).code,'RESOURCE_DATABASE_CHECK_FAILED');assert.ok(!text.includes('private-password'));
  text='';assert.equal(await resourceDatabaseMain(['--manifest',resolve(manifestFile)],{output:{write:s=>text+=s},attest:raw=>attestResourceDatabases(raw,{readSecret:f.readSecret,readTarget:f.readTarget})}),0);
  assert.equal(JSON.parse(text).databaseTargetsVerified,true);
});
