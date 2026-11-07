import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {realtimeResourceSnapshotSource,parseRealtimeResourceSnapshot} from '../server/control/resource-realtime-observation.mjs';
import {checkManagedRealtimePlan} from './control-backend-realtime-plan.mjs';

export async function runRealtimeBootstrapDiagnostic({repository,state,bundle,privateRun,runClient,sql,fresh,compose,save,input,captureSchemaChanges,progress}){
  const container=state.projectId+'-realtime',checks=[],seedExecutions=[];
  const check=(name,value)=>{assert.ok(value,name);checks.push(name)};
  const query=source=>sql(state,source,{databaseRole:'supabase_admin'});
  const waitFor=async(fn,label)=>{const deadline=Date.now()+60000;while(Date.now()<deadline){try{const value=await fn();if(value)return value}catch{}
    await new Promise(r=>setTimeout(r,250))}throw Error(label)};
  const rpc=async source=>(await privateRun('docker',['exec','--env','ERL_FLAGS=+S 1:1',container,'/app/bin/realtime','rpc',source],{timeout:60000})).stdout;
  const snapshot=async()=>parseRealtimeResourceSnapshot(await rpc(realtimeResourceSnapshotSource()));
  const guardCatalog=()=>query(`SELECT encode(sha256(convert_to(jsonb_build_object(
    'functions',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_functiondef(p.oid),
      'owner',pg_get_userbyid(p.proowner),'acl',p.proacl) ORDER BY p.oid),'[]'::jsonb)
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='_realtime' AND p.proname='roomqc_pool_guard_v1'),
    'triggers',(SELECT coalesce(jsonb_agg(jsonb_build_object('definition',pg_get_triggerdef(t.oid),
      'enabled',t.tgenabled) ORDER BY t.oid),'[]'::jsonb) FROM pg_trigger t
      WHERE t.tgrelid='_realtime.extensions'::regclass AND t.tgname='roomqc_pool_guard_v1'))::text,'UTF8')),'hex');`);
  const guardCatalogBefore=await guardCatalog();
  const guardPresent=await query("SELECT to_regprocedure('_realtime.roomqc_pool_guard_v1()') IS NOT NULL;");
  check('guard initial installation matches fresh/adoption mode',guardPresent===(fresh?'t':'f'));
  check('fixture broadcast publication absent on entry',await query("SELECT NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime_messages_publication');")==='t');
  const initial=await snapshot();check('one initial project exists',initial.tenantCount===1);
  check('initial subscriber keys reflect selected image',initial.extensions[0].guardSubscriberPool===(fresh?4:1));
  const exercise=async phase=>JSON.parse((await runClient(
    "import {runRealtimeResourceChecks} from '/control/testing/realtime-resource-native.mjs'; console.log(JSON.stringify(await runRealtimeResourceChecks(JSON.parse(process.env.ROOMQC_REALTIME_INPUT))));",
    {ROOMQC_REALTIME_INPUT:JSON.stringify({...input,phase,connectPool:phase==='default'?1:3,subscriberPool:phase==='default'?4:2})},180000,{memory:'256m'})).stdout);
  let freshDataPath;
  if(fresh){freshDataPath=await exercise('default');progress({phase:'fresh-data-path',checks:freshDataPath.checks})}
  // Owned fixture customization, including values the destructive seed loses.
  await query(`UPDATE _realtime.tenants SET max_concurrent_users=137,max_channels_per_client=17,
    feature_flags=feature_flags || '{"roomqc_preserved":false}'::jsonb WHERE external_id='realtime-dev';
    UPDATE _realtime.feature_flags SET enabled=false,rollout_percentage=31 WHERE name='gcm_encryption_backfill';
    UPDATE _realtime.extensions SET settings=settings || '{"db_pool":3,"subcriber_pool_size":2,"subs_pool_size":99,"roomqc_preserved":{"enabled":false}}'::jsonb
      WHERE tenant_external_id='realtime-dev' AND type='postgres_cdc_rls';`);
  const protectedState=()=>query(`SELECT jsonb_build_object(
    'tenant',encode(sha256(convert_to((to_jsonb(t)-'updated_at'-'migrations_ran'-'gcm_migrated_at')::text,'UTF8')),'hex'),
    'extensions',(SELECT jsonb_agg(encode(sha256(convert_to((to_jsonb(e)-'settings'-'updated_at')::text ||
      (e.settings-'db_pool'-'subcriber_pool_size'-'subs_pool_size')::text,'UTF8')),'hex') ORDER BY e.id)
      FROM _realtime.extensions e WHERE e.tenant_external_id=t.external_id),
    'flag',(SELECT jsonb_build_object('id',f.id,'enabled',f.enabled,'rollout',f.rollout_percentage) FROM _realtime.feature_flags f WHERE name='gcm_encryption_backfill'))
    FROM _realtime.tenants t WHERE external_id='realtime-dev';`);
  const before=await protectedState();
  if(!fresh){
    bundle.services.realtime.image=state.realtimeBootstrapBuild.imageId;
    await writeFile(join(state.root,'runtime.compose.json'),JSON.stringify(bundle,null,2),{mode:0o600});
    state.realtimeBootstrapAdoptionImage=state.realtimeBootstrapBuild.imageId;await save();
    await privateRun('docker',[...compose,'up','--detach','--no-deps','--force-recreate','--wait','--wait-timeout','180','realtime'],{timeout:240000});
  }else{
    await privateRun('docker',['restart',container],{timeout:60000});
  }
  const adopted=await waitFor(async()=>{const s=await snapshot();return s.extensions[0].dbPool===3&&s.extensions[0].subscriberPool===2&&s.extensions[0].guardSubscriberPool===2&&s},'Managed bootstrap preserves effective pools');
  check('managed image is the actual running image',JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0].Image===state.realtimeBootstrapBuild.imageId);
  check('bootstrap preserved tenant identity, credentials, limits, unrelated settings and flag',await protectedState()===before);
  check('database guard installed',await query("SELECT to_regprocedure('_realtime.roomqc_pool_guard_v1()') IS NOT NULL;")==='t');
  const upgradedDataPath=await exercise('overrides');progress({phase:'adopted-data-path',checks:upgradedDataPath.checks});
  let sequence=0;
  const oneShot=async(overrides={},expectFailure=false,options={})=>{
    const number=++sequence,name=state.projectId+'-bootstrap-'+number;
    const record=result=>{seedExecutions.push({name,number,exitCode:result.code,elapsedMs:result.elapsedMs,
      expectedFailure:expectFailure,expectedKill:options.killed===true,
      committed:result.stdout?.includes('ROOMQC_REALTIME_BOOTSTRAP_COMMITTED')===true,
      waitingObserved:result.stdout?.includes('ROOMQC_REALTIME_BOOTSTRAP_WAITING')===true,
      ready:result.stdout?.includes('ROOMQC_REALTIME_BOOTSTRAP_READY')===true});progress({phase:'bootstrap-process',number,exitCode:result.code})};
    const args=[...compose,'run','--rm','--no-deps','--name',name,'--entrypoint','/app/bin/realtime',
      ...Object.entries(overrides).flatMap(([key,value])=>['--env',key+'='+value]),'realtime','eval','Realtime.Release.seeds(Realtime.Repo)'];
    try{const result=await privateRun('docker',args,{timeout:120000,onStdout:options.onStdout});
      assert.notEqual(options.killed,true,'A successful exit cannot prove the requested process kill');
      assert.equal(expectFailure,false,'Invalid bootstrap must fail');
      check('one-shot bootstrap '+number+' completed',result.stdout.includes('ROOMQC_REALTIME_BOOTSTRAP_READY'));record(result);return result;
    }catch(error){
      if(options.killed){
        check('bootstrap stopped by actual SIGKILL after commit',error.result?.code===137&&!error.result?.stdout?.includes('ROOMQC_REALTIME_BOOTSTRAP_READY'));
        record(error.result);
        return error.result;
      }
      if(!expectFailure)throw error;
      check('invalid bootstrap '+number+' refused',error.result?.code!==0&&error.result?.stderr?.includes('ROOMQC_REALTIME_BOOTSTRAP_FAILED'));record(error.result);
      return error.result;
    }
  };
  const stable=await protectedState();
  await oneShot({SELF_HOST_TENANT_DB_HOST:'roomqc-wrong-target.invalid'},true);
  check('wrong target cannot mutate preserved configuration',await protectedState()===stable);
  await oneShot({API_JWT_SECRET:'roomqc-wrong-jwt-key-at-least-32-characters'},true);
  check('wrong JWT cannot mutate preserved configuration',await protectedState()===stable);
  await oneShot({ROOMQC_REALTIME_CONNECT_POOL:'0'},true);
  check('invalid environment pool cannot mutate preserved configuration',await protectedState()===stable);
  // Deliberate fixture tamper: do not silently overwrite an unknown guard.
  await query('ALTER TABLE _realtime.extensions DISABLE TRIGGER roomqc_pool_guard_v1;');
  await oneShot({},true);
  check('tampered guard startup leaves tenant configuration unchanged',await protectedState()===stable);
  await query('ALTER TABLE _realtime.extensions ENABLE TRIGGER roomqc_pool_guard_v1;');
  await oneShot();
  // Actual independent seed processes must both wait on a database session
  // lock held by a third process; this is not Promise timing as concurrency proof.
  let releaseHeld;const held=new Promise(resolve=>{releaseHeld=resolve});let seen='';
  const holder=runClient("import {holdRealtimeBootstrapLock} from '/control/testing/realtime-bootstrap-native.mjs'; console.log(JSON.stringify(await holdRealtimeBootstrapLock(JSON.parse(process.env.ROOMQC_REALTIME_INPUT))));",
    {ROOMQC_REALTIME_INPUT:JSON.stringify(input)},45000,{onStdout:chunk=>{seen+=chunk.toString();if(seen.includes('ROOMQC_REALTIME_LOCK_HELD'))releaseHeld()}});
  await Promise.race([held,holder.then(()=>{throw Error('No actual lock barrier observed')})]);
  const concurrent=await Promise.all([oneShot(),oneShot()]);await holder;
  check('two actual bootstrap processes waited behind the held lock',concurrent.every(r=>r.stdout.includes('ROOMQC_REALTIME_BOOTSTRAP_WAITING')));
  check('concurrent bootstrap preserves all protected state',await protectedState()===stable);
  check('concurrent bootstrap did not duplicate projects',await query("SELECT count(*) FROM _realtime.tenants WHERE external_id='realtime-dev';")==='1');
  let janitorHeld,committed;const janitorBarrier=new Promise(resolve=>{janitorHeld=resolve}),commitBarrier=new Promise(resolve=>{committed=resolve});let holderOutput='',seedOutput='';
  const janitorHolder=runClient("import {holdRealtimeBootstrapLock} from '/control/testing/realtime-bootstrap-native.mjs'; console.log(JSON.stringify(await holdRealtimeBootstrapLock(JSON.parse(process.env.ROOMQC_REALTIME_INPUT))));",
    {ROOMQC_REALTIME_INPUT:JSON.stringify({...input,mode:'janitor'})},45000,{onStdout:chunk=>{holderOutput+=chunk.toString();if(holderOutput.includes('ROOMQC_REALTIME_LOCK_HELD'))janitorHeld()}});
  await Promise.race([janitorBarrier,janitorHolder.then(()=>{throw Error('No actual Janitor lock barrier observed')})]);
  const victim=state.projectId+'-bootstrap-'+(sequence+1);
  const interrupted=oneShot({},false,{killed:true,onStdout:chunk=>{seedOutput+=chunk.toString();if(seedOutput.includes('ROOMQC_REALTIME_BOOTSTRAP_COMMITTED'))committed()}});
  await Promise.race([commitBarrier,interrupted.then(()=>{throw Error('No committed bootstrap observed before stop')})]);
  await waitFor(async()=>await query("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='realtime_janitor' AND wait_event_type='Lock');")==='t','Committed seed must actually block in Janitor');
  const victimInfo=JSON.parse((await privateRun('docker',['inspect',victim])).stdout)[0];
  check('SIGKILL target is the running owned bootstrap',victimInfo.State.Running&&victimInfo.Config.Labels?.['roomqc.control-backend-test']===state.run);
  await privateRun('docker',['kill','--signal','KILL',victim]);await interrupted;await janitorHolder;
  check('committed state survives killed seed process',await protectedState()===stable);
  await oneShot();
  check('retry after SIGKILL retains project identity and settings',await protectedState()===stable);
  // SQL callers and the HTTP API must both obey the invariant after startup.
  await query(`UPDATE _realtime.extensions SET settings=jsonb_set(settings,'{subs_pool_size}','99'::jsonb)
    WHERE tenant_external_id='realtime-dev' AND type='postgres_cdc_rls';`);
  check('SQL writes cannot persist mismatched subscriber keys',(await snapshot()).extensions[0].guardSubscriberPool===2);
  check('invalid SQL pool is rejected without leaking settings',await query(`DO $check$ BEGIN
    BEGIN UPDATE _realtime.extensions SET settings=jsonb_set(settings,'{db_pool}','"3"'::jsonb) WHERE tenant_external_id='realtime-dev';
      RAISE EXCEPTION 'INVALID_POOL_ACCEPTED'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    END $check$; SELECT true;`)==='t');
  const api=JSON.parse((await runClient("import {checkRealtimePoolApi} from '/control/testing/realtime-bootstrap-native.mjs'; console.log(JSON.stringify(await checkRealtimePoolApi(JSON.parse(process.env.ROOMQC_REALTIME_INPUT))));",
    {ROOMQC_REALTIME_INPUT:JSON.stringify(input)},60000)).stdout);progress({phase:'actual-public-api',checks:api.checks});
  const cached=await waitFor(async()=>{const result=await rpc('t = Realtime.Tenants.Cache.get_tenant_by_external_id("realtime-dev"); e = Enum.find(t.extensions, &(&1.type == "postgres_cdc_rls")); IO.puts("ROOMQC_POOL_CACHE " <> Jason.encode!(Map.take(e.settings, ["db_pool", "subcriber_pool_size", "subs_pool_size"])))');
    const line=result.split(/\r?\n/).find(l=>l.startsWith('ROOMQC_POOL_CACHE '));if(!line)return false;
    const v=JSON.parse(line.slice('ROOMQC_POOL_CACHE '.length));return v.db_pool===3&&v.subcriber_pool_size===2&&v.subs_pool_size===2&&v},'API cache must reflect canonical pool keys');
  check('actual running API cache agrees with persisted settings',cached.subs_pool_size===2);
  const apiDataPath=await exercise('api-update');progress({phase:'api-data-path-without-manual-cache-reset',checks:apiDataPath.checks});
  const restartBefore=JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0];
  await privateRun('docker',['restart',container],{timeout:60000});
  await waitFor(async()=>{const s=await snapshot();return s.extensions[0].dbPool===3&&s.extensions[0].subscriberPool===2&&s.extensions[0].guardSubscriberPool===2},'Customized pools survive actual container restart');
  check('restart ran the same product image',JSON.parse((await privateRun('docker',['inspect',container])).stdout)[0].Image===restartBefore.Image);
  const restartedDataPath=await exercise('api-update');progress({phase:'restart-data-path',checks:restartedDataPath.checks});
  check('restart preserved tenant identity, credentials, limits and flag',await protectedState()===stable);
  const managedPlan=await checkManagedRealtimePlan({repository,state,bundle,privateRun});
  progress({phase:'managed-image-plan',checks:managedPlan.checks});
  const delta=await captureSchemaChanges();
  // Remove only owned additions proven absent at entry. Full fingerprint
  // comparison remains mandatory after cleanup; never ignore schema objects.
  await privateRun('docker',['stop','--time','20',container],{timeout:60000});
  await query('DROP PUBLICATION supabase_realtime_messages_publication;');
  if(!fresh)await query('DROP TRIGGER roomqc_pool_guard_v1 ON _realtime.extensions; DROP FUNCTION _realtime.roomqc_pool_guard_v1();');
  const guardCatalogAfter=await guardCatalog();check('metadata guard catalog matches entry after owned cleanup',guardCatalogAfter===guardCatalogBefore);
  return {verified:true,freshInstallation:fresh,vendorAdoption:!fresh,checks:checks.length+(freshDataPath?.checks??0)+upgradedDataPath.checks+api.checks+apiDataPath.checks+restartedDataPath.checks+managedPlan.checks,
    cases:checks,initial,adopted,api,cached,seedExecutions,managedPlan,guardCatalogBefore,guardCatalogAfter,actualRestart:true,actualConcurrentSeedProcesses:2,
    actualLockContention:true,actualPostCommitSigkillAndRetry:true,protectedStatePreserved:true,invalidConfigurationDenied:true,
    schemaChangesBeforeFixtureCleanup:delta,fixtureCleanupVerified:true,
    wholeStackCapacityVerified:false,tlsPeerVerificationVerified:false,productAcceptance:false};
}
