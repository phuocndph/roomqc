import assert from 'node:assert/strict';
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {isAbsolute,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import pg from '../server/control/node_modules/pg/lib/index.js';
import {loadHostMonitorTargets,recordHostObservation,validateHostMonitorTargets} from '../server/control/host-monitor.mjs';
import {healthDatabaseUrl,boundedHealthFile} from '../server/control/workers/health-config.mjs';
import {remoteScript,parsePreflightOutput} from './roomqc-vps-preflight.mjs';
import {hostObserverRuntimeConfiguration,publishHostObserverStatus} from '../server/control/workers/host-observer-status.mjs';
const execute=promisify(execFile),root=dirname(dirname(fileURLToPath(import.meta.url)));
const invalid=code=>Object.assign(new Error(code),{code});
const cpuScript=`
cpu_sample() { awk '/^cpu / { total=0; for(i=2;i<=9;i++)total+=$i; print total, $5+$6; exit }' /proc/stat; }
set -- $(cpu_sample); total1="$1"; idle1="$2"
sleep 1
set -- $(cpu_sample)
awk -v t1="$total1" -v i1="$idle1" -v t2="$1" -v i2="$2" 'BEGIN {dt=t2-t1; di=i2-i1; if(dt<=0 || di<0 || di>dt)exit 1; printf "HOST_CPU_USAGE=%.2f\\n",100*(1-di/dt)}'
`;
export async function collectHostFacts(target,{executor=execute,now=()=>new Date(),signal,allowLocal=false}={}){
  validateHostMonitorTargets({version:1,hosts:[target]},{allowLocal});
  const args=['-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=10'];
  if(target.ssh.identityFile)args.push('-i',target.ssh.identityFile);
  args.push(target.ssh.user+'@'+target.ssh.host,remoteScript+cpuScript);
  const result=await executor('ssh',args,{encoding:'utf8',timeout:30000,maxBuffer:65536,windowsHide:true,...(signal?{signal}:{})});
  const facts=parsePreflightOutput(result.stdout),matches=[...result.stdout.matchAll(/^HOST_CPU_USAGE=(\d+(?:\.\d+)?)$/gm)];
  if(matches.length!==1)throw invalid('HOST_MONITOR_CPU_SAMPLE_INVALID');
  return {...facts,host:target.ssh.host,capturedAt:now().toISOString(),cpuUsagePercent:Number(matches[0][1])};
}
export function observerArguments(args){
  const values=new Map();let watch=false,local=false,allowLocalTargets=false;
  for(let i=0;i<args.length;i++){
    const key=args[i];
    if(key==='--watch'&&!watch){watch=true;continue}
    if(key==='--local-directory'&&!local){local=true;continue}
    if(key==='--allow-local-targets'&&!allowLocalTargets){allowLocalTargets=true;continue}
    if(!['--targets-file','--database-url-file','--interval-seconds','--status-file'].includes(key)||values.has(key)||!args[i+1])throw invalid('HOST_OBSERVER_ARGUMENTS_INVALID');
    values.set(key,args[++i]);
  }
  const targetsFile=values.get('--targets-file'),databaseFile=values.get('--database-url-file'),statusFile=values.get('--status-file');
  const interval=Number(values.get('--interval-seconds')??60);
  if(!targetsFile||!isAbsolute(targetsFile)||!Number.isInteger(interval)||interval<30||interval>3600
    ||statusFile&&!isAbsolute(statusFile)||local&&databaseFile||!local&&(!databaseFile||!isAbsolute(databaseFile)))throw invalid('HOST_OBSERVER_ARGUMENTS_INVALID');
  return {targetsFile,databaseFile,local,allowLocalTargets,watch,interval,statusFile};
}
async function localRecorder(env){
  if(env.ROOMQC_HOST_OBSERVER_ALLOW_LOCAL!=='true'||env.NODE_ENV==='production')throw invalid('HOST_OBSERVER_LOCAL_FORBIDDEN');
  const name='roomqc-control-local-roomqc-control-1';
  const docker=(args,input)=>execFileSync('docker',args,{input,encoding:'utf8',timeout:20000,windowsHide:true,maxBuffer:1024*1024,stdio:['pipe','pipe','pipe']});
  const info=JSON.parse(docker(['inspect',name]))[0];
  assert.equal(info.Config.Labels['roomqc.control-local'],'v3');assert.equal(info.Config.Labels['com.docker.compose.project'],'roomqc-control-local');
  assert(info.Config.Env.includes('ROOMQC_CONTROL_SIGNUP_ENABLED=false'));
  const login=JSON.parse(await readFile(join(root,'.local/control/host-observer.local'),'utf8'));
  assert.equal(login.user,'roomqc_local_host_observer');assert.match(login.password,/^[a-f0-9]{64}$/);
  const program=`import pg from 'pg';import {recordHostObservation} from './host-monitor.mjs';
    let s='';for await(const c of process.stdin)s+=c;const input=JSON.parse(s);
    const pool=new pg.Pool({connectionString:input.databaseUrl,max:1,statement_timeout:5000});
    try{console.log(JSON.stringify(await recordHostObservation(pool,input.target,input.facts)))}finally{await pool.end()}`;
  return async(target,facts)=>{
    try{return JSON.parse(docker(['exec','-i',name,'node','--input-type=module','-e',program],JSON.stringify({
      databaseUrl:'postgresql://'+login.user+':'+login.password+'@directory:5432/roomqc_control',target,facts})).trim())}
    catch{throw invalid('HOST_OBSERVER_LOCAL_WRITE_FAILED')}
  };
}
export async function hostObserverMain(args=process.argv.slice(2),env=process.env){
  if(args.length===1&&args[0]==='--help'){
    console.log('Usage: node scripts/roomqc-host-observer.mjs --targets-file ABSOLUTE_JSON --database-url-file ABSOLUTE_SECRET [--watch] [--interval-seconds 60] [--status-file ABSOLUTE_JSON]. Production requires watch, interval <=60, status file and a declared host-observer resource budget. Isolated local targets require --allow-local-targets and ROOMQC_HOST_OBSERVER_ALLOW_LOCAL_TARGETS=true in local mode; directory TLS and public-address SSH guards still apply. Development-only bridge: --local-directory with ROOMQC_HOST_OBSERVER_ALLOW_LOCAL=true. SSH is read-only; no cluster enrollment, deployment, provider change or signup activation.');return 0;
  }
  let pool,stop=false,timer,options;const controller=new AbortController();
  const abort=()=>{stop=true;controller.abort();if(timer)clearTimeout(timer.id);timer?.resolve()};
  try{
    options=observerArguments(args);let record;
    const runtime=hostObserverRuntimeConfiguration(env,options);
    // Validate the complete target set before SSH or database access.
    const targetOptions={allowLocal:runtime.allowLocalTargets};
    const initialTargets=await loadHostMonitorTargets(options.targetsFile,targetOptions);
    if(runtime.production&&initialTargets.some(target=>!target.ssh.identityFile))throw invalid('HOST_OBSERVER_IDENTITY_REQUIRED');
    await publishHostObserverStatus(options.statusFile,{ok:false,targets:0,failed:0});
    if(options.local)record=await localRecorder(env);
    else{
      const connectionString=(await boundedHealthFile(options.databaseFile,8192,{sensitive:true})).trim();
      healthDatabaseUrl(connectionString,{production:true,allowLocal:false});
      pool=new pg.Pool({connectionString,max:runtime.poolMax,connectionTimeoutMillis:5000,query_timeout:10000,
        statement_timeout:5000,lock_timeout:3000,idle_in_transaction_session_timeout:10000,application_name:'roomqc-host-observer'});
      pool.on('error',()=>{});
      const role=await pool.query(`SELECT pg_has_role(current_user,'roomqc_control_host_observer','MEMBER') AS allowed,
        rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls,
        EXISTS(SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
          WHERE m.member=pg_roles.oid AND r.rolname<>'roomqc_control_host_observer') AS other_membership
        FROM pg_roles WHERE rolname=current_user`);
      const privileges=role.rows[0];
      if(!privileges?.allowed||['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls','other_membership'].some(key=>privileges[key]))throw invalid('HOST_OBSERVER_ROLE_REQUIRED');
      record=(target,facts)=>recordHostObservation(pool,target,facts,targetOptions);
    }
    process.once('SIGTERM',abort);process.once('SIGINT',abort);
    do{
      let failures=0,cursor=0;const targets=await loadHostMonitorTargets(options.targetsFile,targetOptions);
      if(runtime.production&&targets.some(target=>!target.ssh.identityFile))throw invalid('HOST_OBSERVER_IDENTITY_REQUIRED');
      await Promise.all(Array.from({length:Math.min(4,targets.length)},async()=>{
        while(cursor<targets.length&&!stop){
          const target=targets[cursor++];
          try{
            const facts=await collectHostFacts(target,{signal:controller.signal,...targetOptions});const result=await record(target,facts);
            console.log(JSON.stringify({event:'host_observed',...result}));
          }catch{failures++;console.error(JSON.stringify({event:'host_observation_failed',hostId:target.id,code:'HOST_OBSERVATION_FAILED'}))}
        }
      }));
      await publishHostObserverStatus(options.statusFile,{ok:failures===0&&!stop,targets:targets.length,failed:failures});
      if(!options.watch)return failures?1:0;
      if(!stop)await new Promise(resolve=>{timer={resolve,id:setTimeout(resolve,options.interval*1000)}});
    }while(!stop);
    return 0;
  }catch(error){console.error(JSON.stringify({event:'host_observer_failed',code:error.code??'HOST_OBSERVER_FAILED'}));return 1}
  finally{process.removeListener('SIGTERM',abort);process.removeListener('SIGINT',abort);
    await publishHostObserverStatus(options?.statusFile,{ok:false,targets:0,failed:0}).catch(()=>{});if(pool)await pool.end()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)process.exitCode=await hostObserverMain();
