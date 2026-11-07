import test from 'node:test';import assert from 'node:assert/strict';
import {mkdtemp,writeFile,unlink,rmdir,chmod,symlink,readFile} from 'node:fs/promises';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {notificationConnection,notificationSecretMode,bookingNotificationFile,loadBookingWorkerConfiguration,loadBookingOperatorCommand} from './booking-notification-config.mjs';
import {bookingOperatorArguments,bookingNotificationOperatorMain} from './booking-notification-operator.mjs';
import {bookingWorkerArguments,bookingExternalMain} from './workers/booking-external-runtime.mjs';
const env={NODE_ENV:'test',ROOMQC_BOOKING_ALLOW_LOCAL:'true'},key='00000000-0000-4000-8000-000000000010';
async function files(t){
  const dir=await mkdtemp(join(tmpdir(),'roomqc-booking-unit-')),paths=[];
  const put=async(name,value)=>{const p=join(dir,name);await writeFile(p,typeof value==='string'?value:JSON.stringify(value),{mode:0o600,flag:'wx'});paths.push(p);return p};
  t.after(async()=>{for(const p of paths.reverse())await unlink(p);await rmdir(dir)});
  return {dir,put,paths};
}
async function operatorFixture(t,{safe=true,queryResult,queryError}={}){
  const f=await files(t),dsn=await f.put('dsn','postgres://owned:fake-private-password@localhost/postgres?sslmode=disable');
  const config=await f.put('operator.json',{version:1,databaseUrlFile:dsn});const queries=[],output=[];
  class Pool{
    on(){}async connect(){return {query:async(sql,args)=>{queries.push({sql,args});if(sql.includes('AS safe'))return {rows:[{safe}]};if(queryError)throw queryError;
      return {rows:[{result:queryResult??{channel:'push',enabled:true,replayed:false}}]}},release(){}}}async end(){}
  }
  return {...f,queries,output,run:async command=>{
    const file=await f.put('command-'+queries.length+'-'+Math.random().toString(16).slice(2)+'.json',command);
    const exitCode=await bookingNotificationOperatorMain(['--config-file',config,'--command-file',file],env,{log:v=>output.push(v),error:v=>output.push(v)},{Pool});
    return {exitCode,data:JSON.parse(output.at(-1))};
  }};
}
test('notification CLI arguments only accept explicit files and reject inline credentials or duplicate flags',()=>{
  assert.deepEqual(bookingOperatorArguments(['--help']),{help:true});
  assert.deepEqual(bookingOperatorArguments(['--command-file','command','--config-file','config']),{configFile:'config',commandFile:'command'});
  for(const args of [[],['--database-url','secret'],['--config-file','x','--config-file','y'],['--config-file','x','--command-file','y','extra']])
    assert.throws(()=>bookingOperatorArguments(args));
  assert.deepEqual(bookingWorkerArguments(['--check','--config-file','x']),{check:true,configFile:'x'});
  for(const args of [[],['--check'],['--config-file','x','--check'],['--config-file','x','--bot-token','secret']])assert.throws(()=>bookingWorkerArguments(args));
});
test('notification database configuration requires verified TLS outside explicit local development',()=>{
  assert.throws(()=>notificationConnection('postgres://owned:private@localhost/postgres?sslmode=disable'));
  const secure=notificationConnection('postgres://owned:private@db.roomqc.invalid/postgres?sslmode=verify-full');assert.equal(secure.ssl.rejectUnauthorized,true);
  assert.equal(notificationConnection('postgres://owned:private@db/postgres?sslmode=disable',{allowLocal:true}).ssl,false);
  for(const url of ['postgres://owned:private@db.roomqc.invalid/postgres?sslmode=disable','postgres://owned:private@db/postgres?sslmode=verify-full&options=unsafe',
    'postgres://owned:private@db/postgres?sslmode=verify-full&sslmode=disable','postgres://owned:private@db/postgres#unsafe'])
    assert.throws(()=>notificationConnection(url,{allowLocal:true}));
});

test('booking runtime reports safe resource configuration failures before opening providers or database',async t=>{
  const f=await files(t),invalidBudget=await f.put('invalid-budget.json','private-invalid-budget-canary');
  const rawBudget=JSON.parse(await readFile(new URL('../../deploy/control-resource-budget.example.json',import.meta.url),'utf8'));
  rawBudget.environment='production';rawBudget.databases[1].maxConnections=10;
  const overBudget=await f.put('over-budget.json',rawBudget);
  for(const [variables,expected]of [
    [{NODE_ENV:'production'},'RESOURCE_BUDGET_REQUIRED'],
    [{NODE_ENV:'production',ROOMQC_RESOURCE_ENVIRONMENT:'local'},'RESOURCE_RUNTIME_MISMATCH'],
    [{NODE_ENV:'production',ROOMQC_RESOURCE_BUDGET_FILE:invalidBudget},'INVALID_RESOURCE_BUDGET'],
    [{NODE_ENV:'production',ROOMQC_RESOURCE_BUDGET_FILE:overBudget},'RESOURCE_CONNECTION_BUDGET']
  ]){
    const output=[],result=await bookingExternalMain(['--check','--config-file',join(f.dir,'absent-provider.json')],variables,
      {log:v=>output.push(v),error:v=>output.push(v)});
    assert.equal(result.exitCode,1);assert.deepEqual(output.map(v=>JSON.parse(v)),[{ok:false,code:expected}]);
    assert.doesNotMatch(output.join(''),/private-invalid|absent-provider|postgres:/);
  }
});
test('Linux notification secret modes permit dedicated owner or group and reject public or writable secrets',()=>{
  notificationSecretMode({uid:1000,gid:1000,mode:0o100600},{uid:1000,gid:1000});
  notificationSecretMode({uid:0,gid:1000,mode:0o100440},{uid:1000,gid:1000});
  for(const info of [{uid:1000,gid:1000,mode:0o100644},{uid:1000,gid:1000,mode:0o100620},{uid:2000,gid:1000,mode:0o100440},{uid:0,gid:2000,mode:0o100440}])
    assert.throws(()=>notificationSecretMode(info,{uid:1000,gid:1000}));
});
test('notification file reads are bounded and reject symlinks and insecure Linux secret permissions',async t=>{
  const f=await files(t),p=await f.put('secret','fake-private-data');assert.equal(await bookingNotificationFile(p,100,{allowLocal:true}),'fake-private-data');
  await assert.rejects(()=>bookingNotificationFile(p,4,{allowLocal:true}));await assert.rejects(()=>bookingNotificationFile('relative',100,{allowLocal:true}));
  if(process.platform!=='win32'){
    await chmod(p,0o644);await assert.rejects(()=>bookingNotificationFile(p,100,{allowLocal:true}));await chmod(p,0o600);
    const link=join(f.dir,'link');await symlink(p,link);f.paths.push(link);await assert.rejects(()=>bookingNotificationFile(link,100,{allowLocal:true}));
  }
});
test('worker configuration enforces total connection budget and keeps provider keys in private files',async t=>{
  const f=await files(t),dsn=await f.put('dsn','postgres://owned:private@db/postgres?sslmode=disable'),pub=await f.put('public','public-placeholder'),secret=await f.put('private','private-placeholder');
  const raw={version:1,instanceId:'owned-worker',databaseUrlFile:dsn,channels:['push'],push:{publicKeyFile:pub,privateKeyFile:secret,subject:'mailto:ops@roomqc.invalid'},
    connectionBudget:{maxConnections:20,reservedConnections:2,otherConnections:10,workerInstances:1,workerPoolMax:2},developmentOrigins:[]};
  const valid=await f.put('valid.json',raw),loaded=await loadBookingWorkerConfiguration(valid,env);assert.equal(loaded.connectionBudget.workerPoolMax,2);assert.equal(loaded.providers.push.privateKey,'private-placeholder');
  for(const [name,change]of [['over-budget',{connectionBudget:{...raw.connectionBudget,maxConnections:10}}],['pool-change',{connectionBudget:{...raw.connectionBudget,workerPoolMax:3}}],
    ['inline-secret',{push:{...raw.push,privateKey:'private-placeholder'}}],['unused-channel',{telegram:{botToken:'private'}}]]){
    const p=await f.put(name+'.json',{...raw,...change});await assert.rejects(()=>loadBookingWorkerConfiguration(p,env));
  }
  await assert.rejects(()=>loadBookingWorkerConfiguration(valid,{NODE_ENV:'production',ROOMQC_BOOKING_ALLOW_LOCAL:'true'}));
});
test('operator commands require stable keys, explicit booleans and bounded status pages',async t=>{
  const f=await files(t);
  const valid={version:1,operation:'resolve',commandId:key,targetId:key,resolution:'retry',reason:'Owned resolution',acceptDuplicateRisk:false};
  assert.deepEqual(await loadBookingOperatorCommand(await f.put('valid.json',valid),env),valid);
  for(const [n,command]of [[1,{...valid,acceptDuplicateRisk:'true'}],[2,{...valid,commandId:null}],[3,{...valid,reason:'  x  '}],[4,{...valid,token:'private'}],
    [5,{version:1,operation:'list',state:null,eventId:null,after:null,limit:51}]]){
    const p=await f.put('invalid-'+n+'.json',command);await assert.rejects(()=>loadBookingOperatorCommand(p,env));
  }
});

test('Telegram loopback API override requires explicit local mode and matching allowed origin',async t=>{
  const f=await files(t),dsn=await f.put('dsn','postgres://owned:private@db/postgres?sslmode=disable'),token=await f.put('bot','123456789:fake-private-token');
  const raw={version:1,instanceId:'owned-worker',databaseUrlFile:dsn,channels:['telegram'],
    telegram:{botTokenFile:token,appOrigin:'https://roomqc.invalid',apiOrigin:'http://127.0.0.1:19090'},
    connectionBudget:{maxConnections:20,reservedConnections:2,otherConnections:10,workerInstances:1,workerPoolMax:2},developmentOrigins:['http://127.0.0.1:19090']};
  const valid=await f.put('valid.json',raw);assert.equal((await loadBookingWorkerConfiguration(valid,env)).providers.telegram.apiOrigin,'http://127.0.0.1:19090');
  await assert.rejects(()=>loadBookingWorkerConfiguration(valid,{NODE_ENV:'production',ROOMQC_BOOKING_ALLOW_LOCAL:'true'}));
  for(const [name,change]of [['unapproved',{developmentOrigins:[]}],['internet',{telegram:{...raw.telegram,apiOrigin:'https://api.telegram.org'}}],
    ['private-ip',{telegram:{...raw.telegram,apiOrigin:'http://192.168.1.10:19090'},developmentOrigins:['http://192.168.1.10:19090']}]]){
    const file=await f.put(name+'.json',{...raw,...change});await assert.rejects(()=>loadBookingWorkerConfiguration(file,env));
  }
});
test('operator refuses unsafe roles before issuing the requested mutation',async t=>{
  const f=await operatorFixture(t,{safe:false}),result=await f.run({version:1,operation:'configure',commandId:key,channel:'push',configurationId:'a'.repeat(64),enabled:true,reason:'Owned safe configuration'});
  assert.equal(result.exitCode,1);assert.equal(result.data.code,'BOOKING_NOTIFICATION_ROLE_UNSAFE');assert.equal(f.queries.length,1);
});
test('operator output strips unapproved fields from trusted database results',async t=>{
  const f=await operatorFixture(t,{queryResult:{channel:'push',enabled:true,replayed:false,providerBody:'private-provider-secret'}});
  const result=await f.run({version:1,operation:'configure',commandId:key,channel:'push',configurationId:'a'.repeat(64),enabled:true,reason:'Owned safe configuration'});
  assert.equal(result.exitCode,0);assert.doesNotMatch(JSON.stringify(result),/private-provider-secret/);assert.deepEqual(result.data.result,{channel:'push',enabled:true,replayed:false});
});
test('uncertain operator mutations report receipt recovery with the same command id and no private diagnostics',async t=>{
  const f=await operatorFixture(t,{queryError:new Error('postgres://owned:private@db/private-provider-secret')}),result=await f.run({version:1,operation:'configure',
    commandId:key,channel:'push',configurationId:'a'.repeat(64),enabled:true,reason:'Owned safe configuration'});
  assert.equal(result.exitCode,1);assert.equal(result.data.code,'BOOKING_OPERATOR_OUTCOME_UNCONFIRMED');assert.deepEqual(result.data.recovery,{operation:'receipt',commandId:key});
  assert.doesNotMatch(JSON.stringify(result),/private-provider-secret|postgres:/);
});
test('operator maps definitive database denials without treating them as successful mutations',async t=>{
  for(const [code,expected]of [['23505','BOOKING_OPERATOR_COMMAND_CONFLICT'],['42501','BOOKING_OPERATOR_NOT_ALLOWED'],['22023','BOOKING_OPERATOR_COMMAND_INVALID']]){
    const f=await operatorFixture(t,{queryError:Object.assign(new Error('private-detail'),{code})});
    const result=await f.run({version:1,operation:'configure',commandId:key,channel:'push',configurationId:'a'.repeat(64),enabled:true,reason:'Owned safe configuration'});
    assert.equal(result.exitCode,1);assert.equal(result.data.code,expected);assert.equal(result.data.recovery,undefined);
  }
});
test('read-only operator channels and missing receipts return safe distinct results',async t=>{
  const channels=await operatorFixture(t,{queryResult:{schema_version:1,channels:['push','telegram'].map(channel=>({channel,enabled:false,configuration_id:null,updated_at:new Date().toISOString(),token:'private'}))}});
  const result=await channels.run({version:1,operation:'channels'});assert.equal(result.exitCode,0);assert.equal(result.data.channels.length,2);assert.doesNotMatch(JSON.stringify(result),/"token"/);
  const f=await files(t),dsn=await f.put('dsn','postgres://owned:private@localhost/postgres?sslmode=disable'),config=await f.put('config',{version:1,databaseUrlFile:dsn}),cmd=await f.put('command',{version:1,operation:'receipt',commandId:key});
  class Pool{on(){}async connect(){return {query:async sql=>({rows:[sql.includes('AS safe')?{safe:true}:{result:null}]}),release(){}}}async end(){}}
  const output=[];assert.equal(await bookingNotificationOperatorMain(['--config-file',config,'--command-file',cmd],env,{log:v=>output.push(v),error:v=>output.push(v)},{Pool}),0);
  assert.equal(JSON.parse(output[0]).state,'missing');
});
test('notification compose separates provider secret overlays and exposes no host ports',async()=>{
  const base=JSON.parse(await readFile(new URL('../../deploy/booking-notifications/compose.yml',import.meta.url),'utf8'));
  const push=JSON.parse(await readFile(new URL('../../deploy/booking-notifications/push.compose.yml',import.meta.url),'utf8'));
  const telegram=JSON.parse(await readFile(new URL('../../deploy/booking-notifications/telegram.compose.yml',import.meta.url),'utf8'));
  const service=base.services['booking-external-worker'];assert.equal(service.read_only,true);assert.equal(service.user,'1000:1000');assert.equal(service.ports,undefined);
  assert.deepEqual(Object.keys(base.secrets),['booking-dsn']);assert.equal(Object.keys(push.secrets).length,2);assert.equal(Object.keys(telegram.secrets).length,1);
  assert.deepEqual(service.cap_drop,['ALL']);assert.match(service.command.join(' '),/booking-external-runtime/);assert.ok(service.stop_grace_period==='25s');
});
