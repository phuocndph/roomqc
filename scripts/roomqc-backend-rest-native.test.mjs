import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,createHmac} from 'node:crypto';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {backendPostMigrationRest} from './roomqc-backend-bundle.mjs';

const enabled=process.env.ROOMQC_BACKEND_REST_NATIVE==='1';
test('real REST exposes scoped RPCs only after migration; resume retains exposure and database identity',
 {skip:!enabled,timeout:120000},async()=>{
 const run=randomBytes(6).toString('hex'),project='roomqc-rest-native-'+run,label='roomqc.rest-native',
  directory=await mkdtemp(join(tmpdir(),project+'-')),password=randomBytes(24).toString('hex'),secret=randomBytes(32).toString('hex');
 const docker=(args,options={})=>execFileSync('docker',args,{encoding:'utf8',windowsHide:true,timeout:30000,stdio:['pipe','pipe','pipe'],...options}).trim();
 const inspect=name=>JSON.parse(docker(['inspect',name]))[0];
 const db=project+'-db-1',rest=project+'-rest-1';
 const compose={services:{
  db:{image:'sha256:b7587f3cb74f4f4b2a4f9d67f052edbf95eb93f4fec7c5ada3792546caaf7383',pull_policy:'never',
   environment:{POSTGRES_PASSWORD:password},labels:{[label]:run},tmpfs:['/var/lib/postgresql/data:rw,nosuid,size=96m']},
  rest:{image:'sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf',pull_policy:'never',
   labels:{[label]:run},environment:{PGRST_DB_URI:'postgres://authenticator:'+password+'@db:5432/postgres',
    PGRST_DB_SCHEMAS:'public,graphql_public',PGRST_DB_ANON_ROLE:'anon',PGRST_DB_POOL:'2',PGRST_SERVER_HOST:'0.0.0.0',
    PGRST_ADMIN_SERVER_PORT:'3001',PGRST_JWT_SECRET:secret},
   ports:[{target:3000,published:'0',host_ip:'127.0.0.1'}],healthcheck:{test:['CMD','postgrest','--ready'],interval:'1s',timeout:'2s',retries:30}}
 },networks:{default:{labels:{[label]:run}}}};
 const base=join(directory,'base.json'),overlay=join(directory,'post-migration-rest.json');
 const dc=(args,after=false)=>docker(['compose','-p',project,'-f',base,...(after?['-f',overlay]:[]),...args]);
 const sql=text=>docker(['exec','-i',db,'psql','-X','-v','ON_ERROR_STOP=1','-A','-t','-U','postgres'],{input:text});
 const wait=async predicate=>{
  const until=Date.now()+30000;while(Date.now()<until){try{if(await predicate())return}catch{}
   await new Promise(resolve=>setTimeout(resolve,200));}
  let detail='';try{
   const state=inspect(rest).State;
   detail=JSON.stringify({running:state.Running,exitCode:state.ExitCode,health:state.Health});
  }catch{}
  for(const value of [password,secret])detail=detail.replaceAll(value,'[redacted]');
  detail=detail.replace(/postgres(?:ql)?:\/\/[^\s"']+/g,'[private connection]');
  assert.fail('NATIVE_REST_READINESS_TIMEOUT '+detail);
 };
 const jwt=role=>{
  const part=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),now=Math.floor(Date.now()/1000),
   body=part({alg:'HS256',typ:'JWT'})+'.'+part({role,iat:now,exp:now+300});
  return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
 };
 let origin;
 const rpc=async(schema,role)=>{
  const response=await fetch(origin+'/rpc/receipt',{method:'POST',signal:AbortSignal.timeout(3000),
   headers:{'content-type':'application/json','Content-Profile':schema,authorization:'Bearer '+jwt(role)},body:'{}'});
  return {status:response.status,body:await response.json()};
 };
 try{
  await writeFile(base,JSON.stringify(compose),{mode:0o600});
  await writeFile(overlay,JSON.stringify(backendPostMigrationRest().compose),{mode:0o600});
  dc(['up','-d','--no-build','--pull','never','db']);
  await wait(()=>sql('SELECT 1;')==='1');
  sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE roomqc_setup_recovery NOLOGIN; CREATE ROLE roomqc_summary_reader NOLOGIN;
   CREATE ROLE authenticator LOGIN NOINHERIT PASSWORD '${password}';
   GRANT anon,roomqc_setup_recovery,roomqc_summary_reader TO authenticator;
   CREATE SCHEMA graphql_public; CREATE TABLE public.sentinel(value integer); INSERT INTO public.sentinel VALUES(42);`);
  dc(['up','-d','--no-build','--pull','never','rest']);
  await wait(()=>inspect(rest).State.Health.Status==='healthy');
  const oldRestId=inspect(rest).Id,dbId=inspect(db).Id;
  origin='http://127.0.0.1:'+inspect(rest).NetworkSettings.Ports['3000/tcp'][0].HostPort;
  const before=await rpc('roomqc_setup','roomqc_setup_recovery');assert.equal(before.status,406);assert.equal(before.body.code,'PGRST106');
  sql(`CREATE SCHEMA roomqc_setup; CREATE SCHEMA roomqc_summary;
   REVOKE ALL ON SCHEMA roomqc_setup,roomqc_summary FROM PUBLIC;
   GRANT USAGE ON SCHEMA roomqc_setup TO roomqc_setup_recovery;
   GRANT USAGE ON SCHEMA roomqc_summary TO roomqc_summary_reader;
   CREATE FUNCTION roomqc_setup.receipt() RETURNS text LANGUAGE sql AS $$SELECT 'setup'::text$$;
   CREATE FUNCTION roomqc_summary.receipt() RETURNS text LANGUAGE sql AS $$SELECT 'summary'::text$$;
   REVOKE ALL ON FUNCTION roomqc_setup.receipt(),roomqc_summary.receipt() FROM PUBLIC;
   GRANT EXECUTE ON FUNCTION roomqc_setup.receipt() TO roomqc_setup_recovery;
   GRANT EXECUTE ON FUNCTION roomqc_summary.receipt() TO roomqc_summary_reader;`);
  dc(['up','-d','--no-deps','--no-build','--pull','never','rest'],true);
  await wait(()=>inspect(rest).State.Health.Status==='healthy');
  assert.notEqual(inspect(rest).Id,oldRestId);assert.equal(inspect(db).Id,dbId);
  origin='http://127.0.0.1:'+inspect(rest).NetworkSettings.Ports['3000/tcp'][0].HostPort;
  assert.deepEqual(await rpc('roomqc_setup','roomqc_setup_recovery'),{status:200,body:'setup'});
  assert.deepEqual(await rpc('roomqc_summary','roomqc_summary_reader'),{status:200,body:'summary'});
  for(const [schema,role]of [['roomqc_setup','anon'],['roomqc_summary','anon'],['roomqc_setup','roomqc_summary_reader'],['roomqc_summary','roomqc_setup_recovery']])
   assert((await rpc(schema,role)).status>=400,'scoped schema must reject unrelated/anonymous roles');
  const publicRead=await fetch(origin+'/sentinel',{headers:{authorization:'Bearer '+jwt('roomqc_setup_recovery')}});
  assert.equal(publicRead.status,403);
  const exposedId=inspect(rest).Id;
  dc(['up','-d','--no-build','--pull','never'],true);
  assert.equal(inspect(rest).Id,exposedId);assert.equal(inspect(db).Id,dbId);assert.equal(sql('SELECT value FROM public.sentinel;'),'42');
  assert.deepEqual(await rpc('roomqc_setup','roomqc_setup_recovery'),{status:200,body:'setup'});
 }finally{
  // Only resources labeled for this fresh test are eligible for removal.
  for(const name of [rest,db]){
   let value;try{value=inspect(name)}catch{continue}
   assert.equal(value.Config.Labels[label],run);docker(['rm','-f','-v',name]);
  }
  for(const id of docker(['network','ls','-q','--filter','label='+label+'='+run]).split(/\s+/).filter(Boolean)){
   const value=JSON.parse(docker(['network','inspect',id]))[0];assert.equal(value.Labels[label],run);docker(['network','rm',id]);
  }
  assert.equal(docker(['ps','-aq','--filter','label='+label+'='+run]),'');
  assert.equal(docker(['network','ls','-q','--filter','label='+label+'='+run]),'');
  await rm(directory,{recursive:true,force:true});
 }
});
