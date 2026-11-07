// Synthetic fixtures only, injected by the exact-owned internal backend runner.
// The API origin is fixed. No existing user, project URL or business DB input.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHmac} from 'node:crypto';

export const hotelScopeTables=Object.freeze(['rooms','items','inventory_transactions','laundry_batches','maintenance_requests']);
export const businessActorStates=Object.freeze(['unconfirmed','banned','auth-deleted','profile-deleted','locked','inactive',
  'null-status','expired-session','deleted-session','wrong-session','missing-session','logged-out']);
// Existing proven direct-action positives only. This is not the unresolved
// department/task/workflow permission contract and grants no additional action.
export function businessActorActions(actor){
  assert.ok(['owner-a','manager','department','staff'].includes(actor));
  const actions=hotelScopeTables.map(table=>({table,method:'GET'}));
  for(const table of hotelScopeTables){
    if(['owner-a','manager'].includes(actor)){
      actions.push({table,method:'POST'});
      if(table!=='maintenance_requests')actions.push({table,method:'PATCH'});
      if(['rooms','items','laundry_batches'].includes(table))actions.push({table,method:'DELETE'});
    }else if(['laundry_batches','maintenance_requests'].includes(table)||(actor==='staff'&&table==='inventory_transactions'))
      actions.push({table,method:'POST'});
  }
  return actions;
}
export function businessActorExpectedKeys(){
  const keys=[];
  for(const actor of ['owner-a','manager','department','staff'])for(const state of businessActorStates)
    for(const stage of ['before','invalid','restored'])for(const {table,method}of businessActorActions(actor))
      keys.push([actor,state,stage,table,method].join('|'));
  return keys;
}
export function businessActorCompleteness(observations){
  const expected=businessActorExpectedKeys(),wanted=new Set(expected),seen=new Set(),duplicates=[],contractMismatches=[];
  for(const o of observations){const key=[o.actorFixture,o.actorState,o.stage,o.table,o.method].join('|');
    if(seen.has(key))duplicates.push(key);seen.add(key);
    if(o.expected!==(o.stage==='invalid'?'deny_without_effects':'allow_exact_fixture'))contractMismatches.push(key);
  }
  const missing=expected.filter(k=>!seen.has(k)),unexpected=[...seen].filter(k=>!wanted.has(k));
  return {complete:missing.length===0&&unexpected.length===0&&duplicates.length===0&&contractMismatches.length===0,
    expected:expected.length,observed:observations.length,missing,unexpected,duplicates,contractMismatches};
}
const contextLabels=['a-assigned','a-unassigned','b-first','b-second'];
export function hotelScopeExpectedKeys(){
  const keys=[],add=(cohort,actorFixture,label,table,scope,method)=>keys.push([cohort,actorFixture,label,table,scope,method].join('|'));
  for(const actor of ['owner-a','owner-b','manager','department','staff','unassigned','anon'])
    for(const scope of contextLabels)for(const table of hotelScopeTables)add('baseline',actor,'read-scope',table,scope,'GET');
  for(const table of hotelScopeTables){
    for(const scope of contextLabels.slice(0,3))add('baseline','manager','create-scope',table,scope,'POST');
    if(table==='maintenance_requests')continue;
    for(const scope of contextLabels.slice(0,3))add('baseline','manager','update-existing-scope',table,scope,'PATCH');
    add('baseline','manager','update-check-unassigned-hotel',table,'a-assigned','PATCH');
    if(['rooms','items','laundry_batches'].includes(table))for(const scope of contextLabels.slice(0,3))
      add('baseline','manager','delete-existing-scope',table,scope,'DELETE');
  }
  for(const table of hotelScopeTables){
    for(const scope of contextLabels.slice(0,3))add('owner-writes','owner-a','owner-create',table,scope,'POST');
    if(table==='maintenance_requests')continue;
    for(const scope of contextLabels.slice(0,3))add('owner-writes','owner-a','owner-update',table,scope,'PATCH');
    if(['rooms','items','laundry_batches'].includes(table))for(const scope of contextLabels.slice(0,3))
      add('owner-writes','owner-a','owner-delete',table,scope,'DELETE');
    for(const label of ['owner-reassign-own-hotel','owner-reassign-other-tenant','owner-mismatched-hotel'])
      add('owner-writes','owner-a',label,table,'a-assigned','PATCH');
    add('owner-writes','manager','manager-reassign-other-tenant',table,'a-assigned','PATCH');
  }
  for(const [actor,table]of [['staff','rooms'],['staff','items'],['department','rooms'],
    ['staff','inventory_transactions'],['staff','laundry_batches'],['staff','maintenance_requests']])
    add('action-regression',actor,'assigned-action',table,'a-assigned','POST');
  for(const table of hotelScopeTables){
    add('assignment-revocation','manager','assignment-removed-read',table,'a-assigned','GET');
    add('assignment-revocation','manager','assignment-removed-create',table,'a-assigned','POST');
    if(table!=='maintenance_requests')add('assignment-revocation','manager','assignment-removed-update',table,'a-assigned','PATCH');
    if(['rooms','items','laundry_batches'].includes(table))add('assignment-revocation','manager','assignment-removed-delete',table,'a-assigned','DELETE');
    add('assignment-revocation','manager','assignment-restored-read',table,'a-assigned','GET');
  }
  for(const scope of contextLabels)for(const table of hotelScopeTables)
    add('platform-policy-parity','platform','existing-platform-read',table,scope,'GET');
  return keys;
}
export function hotelScopeCompleteness(observations){
  const expected=hotelScopeExpectedKeys(),seen=new Set(),duplicates=[];
  for(const o of observations){const key=[o.cohort,o.actorFixture,o.label,o.table,o.scope,o.method].join('|');
    if(seen.has(key))duplicates.push(key);seen.add(key);}
  const wanted=new Set(expected),missing=expected.filter(k=>!seen.has(k)),unexpected=[...seen].filter(k=>!wanted.has(k));
  const baseline=observations.filter(o=>o.cohort==='baseline'),positive=baseline.filter(o=>o.expected==='allow_exact_fixture');
  return {complete:missing.length===0&&unexpected.length===0&&duplicates.length===0&&baseline.length===180&&positive.length===47,
    expected:expected.length,observed:observations.length,missing,unexpected,duplicates,
    baseline:{expected:180,observed:baseline.length,positive:positive.length,negative:baseline.length-positive.length}};
}
export function hotelScopeProfileLevel(role){
  assert.ok(['hotel_manager','department_manager','staff'].includes(role));
  return role==='hotel_manager'?'manager':role;
}
export function expectedHotelScope(actor,row){
  assert.ok(row?.tenantId&&row.hotelId,'Only populated hotel-bound fixtures are covered');
  if(actor===null)return false;
  assert.ok(['owner','hotel_manager','department_manager','staff'].includes(actor.role),'Explicit business actor required');
  assert.ok(actor.tenantId&&Array.isArray(actor.hotelIds));
  return actor.tenantId===row.tenantId&&(actor.role==='owner'||actor.hotelIds.includes(row.hotelId));
}
export function evaluateHotelScopeObservation({allowed,method,status,sqlstate=null,returnedRows,returnedTargetMatches,effectsUnchanged,targetEffectMatches,
  denialContract='authorization',guardCode=null}){
  assert.equal(typeof allowed,'boolean');assert.ok(['GET','POST','PATCH','DELETE'].includes(method));
  assert.ok(Number.isInteger(status)&&status>=100&&status<=599);
  assert.ok(returnedRows===null||(Number.isInteger(returnedRows)&&returnedRows>=0));
  assert.equal(typeof effectsUnchanged,'boolean');assert.equal(typeof returnedTargetMatches,'boolean');
  assert.equal(typeof targetEffectMatches,'boolean');
  assert.ok(['authorization','room_hotel_tenant_integrity'].includes(denialContract));
  const permissionError=[401,403].includes(status)&&sqlstate==='42501';
  const emptyHidden=method!=='POST'&&status===200&&returnedRows===0;
  const integrityGuardDenied=denialContract==='room_hotel_tenant_integrity'&&method==='PATCH'&&status===400
    &&sqlstate==='23514'&&guardCode==='ROOM_HOTEL_TENANT_MISMATCH';
  const allowedResult=status===(method==='POST'?201:200)&&returnedRows===1&&returnedTargetMatches&&targetEffectMatches;
  const denied=denialContract==='authorization'?(permissionError||emptyHidden):integrityGuardDenied;
  const passed=allowed?allowedResult&&(method!=='GET'||effectsUnchanged):denied&&effectsUnchanged;
  return {passed,permissionError,emptyHidden,integrityGuardDenied,denialContract,guardCode,expected:allowed?'allow_exact_fixture':'deny_without_effects',
    failure:passed?null:allowed?'positive_control_mismatch':!effectsUnchanged?'unexpected_mutation':'authorization_boundary_mismatch'};
}

async function runHotelScopeDrill(input){
  assert.match(input?.run??'',/^[a-f0-9]{12}$/);assert.ok(input.publishableKey&&input.serviceKey&&input.databasePassword);
  const {default:pg}=await import('/control/node_modules/pg/lib/index.js');
  const db=new pg.Pool({host:'db',port:5432,user:'postgres',database:'postgres',password:input.databasePassword,
    max:4,statement_timeout:12000,connectionTimeoutMillis:5000,application_name:'owned-hotel-scope-'+input.run});
  const origin='http://127.0.0.1:8000',observations=[],businessObservations=[],businessRaces=[],setupChecks=[];
  let phase='fixtures',serial=0,fixturesReady=false,scopeMetadata=null,businessPhase='not_started',employeeProfileControls=null,selfProfileControls=null,passwordControls=null;
  const snapshotTables=[...hotelScopeTables.map(t=>'public.'+t),'public.hotels','public.tenants','public.users',
    'public.user_roles','public.user_hotels','public.tenant_usage','public.room_types','public.audit_log',
    'private.workspace_provisioning','private.hotel_room_setup'];
  const result=()=>({verified:fixturesReady&&phase==='complete'&&hotelScopeCompleteness(observations).complete&&observations.every(o=>o.passed),contractVersion:2,
    actualRest:true,actualAuth:true,providerEnabled:false,setupChecks,observations,employeeProfileControls,selfProfileControls,passwordControls,
    findings:observations.filter(o=>!o.passed),snapshotTables,scopeMetadata,completeness:hotelScopeCompleteness(observations),
    accountSessionControls:{contractVersion:1,verified:businessPhase==='complete'&&businessActorCompleteness(businessObservations).complete
      &&businessObservations.every(o=>o.passed)&&businessRaces.length===20&&businessRaces.every(o=>o.passed),
      phase:businessPhase,actualRest:true,actualAuthLogin:true,
      signedClaimVariants:['wrong-session','missing-session'],
      actualLogout:businessObservations.filter(o=>o.actorState==='logged-out'&&o.stage==='invalid').length===49,providerEnabled:false,
      observations:businessObservations,completeness:businessActorCompleteness(businessObservations),
      findings:businessObservations.filter(o=>!o.passed),raceControls:{expected:20,observed:businessRaces.length,
        verified:businessRaces.length===20&&businessRaces.every(o=>o.passed),observations:businessRaces},
      coverage:{states:businessActorStates,roles:['owner','hotel_manager','department_manager','staff'],
        knownDirectActionsOnly:true,concurrentRevocationFencing:businessRaces.length===20&&businessRaces.every(o=>o.passed),
        raceScope:'owner POST on five tables; profile lock/session deletion, both commit orders; not all role/workflow paths',
        taskWorkflowMatrix:false,fullPermissionMatrix:false}},
    coverage:{hotelBoundTables:hotelScopeTables,
      ownerWrites:observations.filter(o=>o.cohort==='owner-writes').length===52,
      assignmentRemovalAndRestore:observations.filter(o=>o.cohort==='assignment-revocation').length===22,
      platformExistingReadPolicyParity:observations.filter(o=>o.cohort==='platform-policy-parity').length===20,
      platformCrossTenantContract:false,taskLevelCapabilities:false,nullHotelSharedRows:false,
      concurrentRevocationFencing:false,fullPermissionMatrix:false}});
  async function call(path,token,body,method=body===undefined?'GET':'POST',extraHeaders={}){
    const response=await fetch(origin+path,{method,signal:AbortSignal.timeout(15000),headers:{apikey:input.publishableKey,
      authorization:'Bearer '+token,'content-type':'application/json',prefer:'return=representation',...extraHeaders},
      ...(body===undefined?{}:{body:JSON.stringify(body)})});
    let data;try{data=await response.json()}catch{data=null}return {status:response.status,data};
  }
  async function insert(table,body){const v=await call('/rest/v1/'+table,input.serviceKey,body);
    if(v.status!==201)process.stderr.write(JSON.stringify({event:'hotel_scope_fixture_rejected',table,status:v.status,code:v.data?.code??null,
      constraint:v.data?.message?.match(/constraint "([A-Za-z0-9_]+)"/)?.[1]??null})+'\n');
    assert.equal(v.status,201,'Synthetic fixture '+table);assert.ok(Array.isArray(v.data)&&v.data.length===1);return v.data[0];}
  async function account(label){const email='hotel-scope-'+input.run+'-'+label+'@roomqc.invalid',password=randomBytes(32).toString('hex');
    const a=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});assert.equal(a.status,200);
    const s=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});assert.equal(s.status,200);
    assert.equal(s.data.user.id,a.data.id);return {id:a.data.id,email,password,token:s.data.access_token};}
  async function owner(label){const u=await account(label);
    const p=await call('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{p_workspace_id:randomUUID(),p_owner_id:u.id,
      p_fields:{fullName:'Owned scope fixture',phone:'0901234567',tenantName:'Owned scope '+label,hotelName:'Owned scope '+label,
        hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:u.email,totalRooms:3}});
    assert.equal(p.status,200);assert.equal(p.data.success,true);
    const v={...u,fixture:'owner-'+label,role:'owner',tenantId:p.data.tenant_id,hotelId:p.data.hotel_id,hotelIds:[p.data.hotel_id]};
    // A NEW bounded fixture plan, attached only to this owned tenant. Product
    // quota triggers stay enabled; no shared plan or running tenant is changed.
    const plan=(await db.query(`INSERT INTO public.subscription_plans
      SELECT (jsonb_populate_record(NULL::public.subscription_plans,to_jsonb(sp)||jsonb_build_object(
        'id',gen_random_uuid(),'code',$2::text,'name','Owned scope fixture','max_hotels',2,
        'max_rooms',200,'max_items',200,'max_users',16))).*
      FROM public.tenants t JOIN public.subscription_plans sp ON sp.id=t.subscription_plan_id
      WHERE t.id=$1 RETURNING id`,[v.tenantId,'fixture-hotel-scope-'+input.run+'-'+label])).rows[0];
    assert.ok(plan?.id);await db.query('UPDATE public.tenants SET subscription_plan_id=$2,registered_rooms=200 WHERE id=$1',[v.tenantId,plan.id]);
    const second=await insert('hotels',{id:randomUUID(),tenant_id:v.tenantId,name:'Owned scope second '+label,address:'Fixture road',status:'active'});
    v.secondHotelId=second.id;setupChecks.push('owner-'+label+'-provisioned-two-hotels');return v;
  }
  async function employee(label,parent,role,assigned){const u=await account(label);
    await insert('users',{id:u.id,email:u.email,full_name:'Owned scope '+label,tenant_id:parent.tenantId,
      hotel_id:assigned?parent.hotelId:null,role,user_level_code:hotelScopeProfileLevel(role),status:'active',created_by:parent.id,
      must_change_password:false,account_locked:false});
    await insert('user_roles',{user_id:u.id,role});
    if(assigned)await insert('user_hotels',{user_id:u.id,hotel_id:parent.hotelId,assigned_by:parent.id});
    const profile=(await db.query('SELECT user_level_code,tenant_id,hotel_id,status FROM public.users WHERE id=$1',[u.id])).rows[0];
    assert.equal(profile.user_level_code,hotelScopeProfileLevel(role));assert.equal(profile.tenant_id,parent.tenantId);
    assert.equal(profile.hotel_id,assigned?parent.hotelId:null);assert.equal(profile.status,'active');
    setupChecks.push('employee-'+label+'-profile-role-assignment-verified');
    return {...u,fixture:label,role,tenantId:parent.tenantId,hotelIds:assigned?[parent.hotelId]:[]};
  }
  function body(table,context,actor=context.owner){const tag='HS-'+input.run+'-'+(++serial),common={id:randomUUID(),tenant_id:context.tenantId,hotel_id:context.hotelId};
    if(table==='rooms')return {...common,room_number:tag,floor:1,room_type:'standard',status:'vacant_clean',base_price:100000,max_guests:2};
    if(table==='items')return {...common,code:tag,name:'Owned scope item',unit:'piece',quantity_total:20,quantity_in_stock:20};
    if(table==='inventory_transactions')return {...common,item_id:context.itemId,transaction_code:tag,transaction_type:'in',
      transaction_category:'purchase',quantity:1,quantity_before:20,quantity_after:21,created_by:actor.id,notes:'Owned scope fixture'};
    if(table==='laundry_batches')return {...common,batch_code:tag,total_items:1,total_weight_kg:1,delivery_date:new Date().toISOString(),notes:'Owned scope fixture'};
    return {...common,request_code:tag,location:'Owned fixture',issue_type:'repair',title:'Owned scope fixture',
      description:'Synthetic maintenance boundary fixture',reported_by:actor.id};
  }
  async function snapshot(){return (await db.query('SELECT jsonb_build_object('+snapshotTables.map(t=>"'"+t+"',(SELECT encode(sha256(convert_to(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb)::text,'UTF8')),'hex') FROM "+t+' r)').join(',')+') AS value')).rows[0].value;}
  const row=async(table,id)=>(await db.query('SELECT to_jsonb(r) AS value FROM public.'+table+' r WHERE id=$1',[id])).rows[0]?.value??null;
  async function observe(label,table,actor,context,{method='GET',id,change,allowed,cohort='baseline',denialContract='authorization',
    sink=observations,details={}}={}){
    const payload=method==='POST'?body(table,context,actor):change;
    if(method==='POST')id=payload.id;
    const before=await snapshot(),targetBefore=await row(table,id);
    const v=await call('/rest/v1/'+table+(method==='POST'?'':'?id=eq.'+id)+(method==='POST'?'?':'&')+'select=id',
      actor?.token??input.publishableKey,payload,method);
    const after=await snapshot(),targetAfter=await row(table,id),effectsUnchanged=JSON.stringify(before)===JSON.stringify(after);
    const returnedRows=Array.isArray(v.data)?v.data.length:null,returnedTargetMatches=returnedRows===1&&v.data[0].id===id;
    const guardCode=v.data?.message==='Phòng và khách sạn phải thuộc cùng doanh nghiệp.'?'ROOM_HOTEL_TENANT_MISMATCH':null;
    const targetEffectMatches=method==='GET'?JSON.stringify(targetBefore)===JSON.stringify(targetAfter):
      method==='DELETE'?targetAfter===null:targetAfter!==null&&Object.entries(payload).every(([k,value])=>
        k==='delivery_date'?Date.parse(targetAfter[k])===Date.parse(value):JSON.stringify(targetAfter[k])===JSON.stringify(value));
    sink.push({...details,cohort,actorFixture:actor?.fixture??'anon',label,table,actor:actor?.role??'anon',scope:context.label,method,status:v.status,sqlstate:v.data?.code??null,
      returnedRows,returnedTargetMatches,effectsUnchanged,targetEffectMatches,
      ...evaluateHotelScopeObservation({allowed,method,status:v.status,sqlstate:v.data?.code??null,returnedRows,returnedTargetMatches,effectsUnchanged,targetEffectMatches,denialContract,guardCode})});
  }
  try{
    const policyMetadata=(await db.query(`SELECT c.relname AS table,a.attnotnull AS hotel_not_null,
      p.polpermissive,p.polcmd,pg_get_expr(p.polqual,p.polrelid) AS using_scope,
      pg_get_expr(p.polwithcheck,p.polrelid) AS check_scope
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='hotel_id' AND NOT a.attisdropped
      JOIN pg_policy p ON p.polrelid=c.oid AND p.polname='business_hotel_scope'
      WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`,[hotelScopeTables])).rows;
    assert.equal(policyMetadata.length,5);
    for(const m of policyMetadata){assert.equal(m.hotel_not_null,true);assert.equal(m.polpermissive,false);
      assert.equal(m.polcmd,'*');assert.equal(m.using_scope,m.check_scope);}
    const helper=(await db.query(`SELECT p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute
      FROM pg_proc p WHERE p.oid='private.business_hotel_scope(uuid,uuid)'::regprocedure`)).rows[0];
    assert.equal(helper.prosecdef,false);assert.deepEqual(helper.proconfig,['search_path=""']);
    assert.equal(helper.anon_execute,false);assert.equal(helper.authenticated_execute,true);assert.equal(helper.service_execute,false);
    const actorGuard=(await db.query(`SELECT p.proname,p.prosecdef,p.proconfig,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
      has_function_privilege('roomqc_control_probe',p.oid,'EXECUTE') AS probe_execute
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname IN ('business_actor_is_live','enforce_live_business_actor') ORDER BY p.proname`)).rows;
    assert.equal(actorGuard.length,2);
    for(const m of actorGuard){assert.equal(m.prosecdef,true);assert.deepEqual(m.proconfig,['search_path=""']);
      assert.equal(m.anon_execute,false);assert.equal(m.service_execute,false);assert.equal(m.probe_execute,false);
      assert.equal(m.authenticated_execute,m.proname==='business_actor_is_live');}
    const actorPolicies=(await db.query(`SELECT c.relname,p.polpermissive,p.polcmd,
      pg_get_expr(p.polqual,p.polrelid) AS using_scope,pg_get_expr(p.polwithcheck,p.polrelid) AS check_scope
      FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND p.polname='business_actor_live' ORDER BY c.relname`)).rows;
    assert.deepEqual(actorPolicies.map(p=>p.relname).sort(),[...hotelScopeTables].sort());
    for(const p of actorPolicies){assert.equal(p.polpermissive,false);assert.equal(p.polcmd,'*');assert.equal(p.using_scope,p.check_scope);}
    const actorTriggers=(await db.query(`SELECT c.relname,t.tgtype,t.tgenabled FROM pg_trigger t
      JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND t.tgname='enforce_live_business_actor' ORDER BY c.relname`)).rows;
    assert.deepEqual(actorTriggers.map(t=>t.relname).sort(),[...hotelScopeTables].sort());
    for(const t of actorTriggers){assert.equal(t.tgtype,30);assert.equal(t.tgenabled,'O');}
    const authorityTriggers=(await db.query(`SELECT c.relname,t.tgtype,t.tgenabled,p.proname
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_proc p ON p.oid=t.tgfoid
      WHERE n.nspname='public' AND t.tgname='enforce_live_employee_actor' ORDER BY c.relname`)).rows;
    assert.deepEqual(authorityTriggers.map(t=>t.relname),['user_hotels','user_permissions']);
    for(const t of authorityTriggers){assert.equal(t.tgtype,30);assert.equal(t.tgenabled,'O');
      assert.equal(t.proname,'enforce_live_employee_actor');}
    scopeMetadata={policies:policyMetadata,helper,actorGuard,actorPolicies,actorTriggers,authorityTriggers,
      nullHotelDisposition:'not_applicable_all_five_hotel_ids_not_null'};
    setupChecks.push('five-restrictive-all-using-with-check-hotel-not-null','scope-helper-invoker-empty-search-path-narrow-grants');
    const a=await owner('a'),b=await owner('b'),manager=await employee('manager',a,'hotel_manager',true),
      department=await employee('department',a,'department_manager',true),staff=await employee('staff',a,'staff',true),
      unassigned=await employee('unassigned',a,'staff',false);
    if(input.diagnosticOnly===true){
      if(['password','password-policy','password-guard'].includes(input.diagnostic)){
        const passwordControls=await runPasswordChecks({db,call,input,a,manager,staff,row,check:assert});
        console.log(JSON.stringify({diagnosticOnly:true,fullIntegratedRun:false,verified:passwordControls.verified,passwordControls}));return;
      }
      if(input.diagnostic==='self-profile'){
        const selfProfileControls=await runSelfProfileChecks({db,call,input,a,manager,staff,row,check:assert});
        console.log(JSON.stringify({diagnosticOnly:true,fullIntegratedRun:false,verified:selfProfileControls.verified,selfProfileControls}));return;
      }
      const employeeProfileControls=await runEmployeeProfileChecks({db,call,input,a,b,manager,department,staff,row,newId:randomUUID,check:assert});
      console.log(JSON.stringify({diagnosticOnly:true,fullIntegratedRun:false,verified:employeeProfileControls.verified,employeeProfileControls}));return;
    }
    const contexts=[{label:'a-assigned',owner:a,tenantId:a.tenantId,hotelId:a.hotelId},
      {label:'a-unassigned',owner:a,tenantId:a.tenantId,hotelId:a.secondHotelId},
      {label:'b-first',owner:b,tenantId:b.tenantId,hotelId:b.hotelId},
      {label:'b-second',owner:b,tenantId:b.tenantId,hotelId:b.secondHotelId}];
    for(const c of contexts){c.rows={};c.itemId=(await insert('items',body('items',c))).id;c.rows.items=c.itemId;
      for(const table of hotelScopeTables.filter(t=>t!=='items'))c.rows[table]=(await insert(table,body(table,c))).id;}
    for(const c of contexts)for(const table of hotelScopeTables){const actual=await row(table,c.rows[table]);
      assert.equal(actual.tenant_id,c.tenantId);assert.equal(actual.hotel_id,c.hotelId);}
    setupChecks.push('two-tenants-four-hotels-five-tables-populated','bounded-owned-plans-quota-triggers-enabled');
    fixturesReady=true;phase='hotel-scoped-select';
    for(const actor of [a,b,manager,department,staff,unassigned,null])for(const c of contexts)for(const table of hotelScopeTables)
      await observe('read-scope',table,actor,c,{id:c.rows[table],allowed:expectedHotelScope(actor,c)});
    phase='manager-write-scope';
    // Narrow scope contract, not a claim about every role/action. These direct
    // operations already have source policies and business manager positives.
    for(const table of hotelScopeTables){
      for(const c of contexts.slice(0,3))await observe('create-scope',table,manager,c,{method:'POST',allowed:expectedHotelScope(manager,c)});
      if(table==='maintenance_requests')continue; // No direct UPDATE policy; workflow RPC review remains separate.
      for(const c of contexts.slice(0,3)){
        const id=(await insert(table,body(table,c))).id,change=table==='rooms'?{room_number:'HS-PATCH-'+(++serial)}:
          table==='items'?{name:'Owned scope updated'}:{notes:'Owned scope updated'};
        await observe('update-existing-scope',table,manager,c,{method:'PATCH',id,change,allowed:expectedHotelScope(manager,c)});
      }
      const source=contexts[0],target=contexts[1],id=(await insert(table,body(table,source))).id;
      await observe('update-check-unassigned-hotel',table,manager,source,{method:'PATCH',id,
        change:{hotel_id:target.hotelId,...(table==='inventory_transactions'?{item_id:target.itemId}:{})},allowed:false});
      if(['rooms','items','laundry_batches'].includes(table))for(const c of contexts.slice(0,3)){
        const targetId=(await insert(table,body(table,c))).id;
        await observe('delete-existing-scope',table,manager,c,{method:'DELETE',id:targetId,allowed:expectedHotelScope(manager,c)});
      }
    }
    phase='owner-write-and-reassignment';
    for(const table of hotelScopeTables){
      for(const c of contexts.slice(0,3))await observe('owner-create',table,a,c,
        {cohort:'owner-writes',method:'POST',allowed:expectedHotelScope(a,c)});
      if(table==='maintenance_requests')continue;
      const change=table==='rooms'?{room_number:'HS-OWNER-'+(++serial)}:
        table==='items'?{name:'Owned owner update'}:{notes:'Owned owner update'};
      for(const c of contexts.slice(0,3)){
        const id=(await insert(table,body(table,c))).id;
        await observe('owner-update',table,a,c,{cohort:'owner-writes',method:'PATCH',id,change,allowed:expectedHotelScope(a,c)});
      }
      if(['rooms','items','laundry_batches'].includes(table))for(const c of contexts.slice(0,3)){
        const id=(await insert(table,body(table,c))).id;
        await observe('owner-delete',table,a,c,{cohort:'owner-writes',method:'DELETE',id,allowed:expectedHotelScope(a,c)});
      }
      const source=contexts[0];
      for(const [label,actor,target,moveTenant,allowed]of [
        ['owner-reassign-own-hotel',a,contexts[1],false,true],
        ['owner-reassign-other-tenant',a,contexts[2],true,false],
        ['owner-mismatched-hotel',a,contexts[2],false,false],
        ['manager-reassign-other-tenant',manager,contexts[2],true,false]]){
        const id=(await insert(table,body(table,source))).id;
        await observe(label,table,actor,source,{cohort:'owner-writes',method:'PATCH',id,allowed,
          // A pre-existing BEFORE trigger rejects this incoherent rooms pair
          // before RLS WITH CHECK. Require its exact error, not any 23514/FK.
          denialContract:label==='owner-mismatched-hotel'&&table==='rooms'?'room_hotel_tenant_integrity':'authorization',
          change:{hotel_id:target.hotelId,...(moveTenant?{tenant_id:target.tenantId}:{}),
            ...(table==='inventory_transactions'?{item_id:target.itemId}:{})}});
      }
    }
    phase='assigned-action-regression';
    for(const [actor,table,allowed]of [[staff,'rooms',false],[staff,'items',false],[department,'rooms',false],
      [staff,'inventory_transactions',true],[staff,'laundry_batches',true],[staff,'maintenance_requests',true]])
      await observe('assigned-action',table,actor,contexts[0],{cohort:'action-regression',method:'POST',allowed});
    phase='assignment-removal-and-restore';
    const assignment=(await db.query('DELETE FROM public.user_hotels uh WHERE user_id=$1 AND hotel_id=$2 RETURNING to_jsonb(uh) AS value',
      [manager.id,a.hotelId])).rows;
    assert.equal(assignment.length,1);
    for(const table of hotelScopeTables){
      const c=contexts[0];
      await observe('assignment-removed-read',table,manager,c,{cohort:'assignment-revocation',id:c.rows[table],allowed:false});
      await observe('assignment-removed-create',table,manager,c,{cohort:'assignment-revocation',method:'POST',allowed:false});
      if(table!=='maintenance_requests'){
        const id=(await insert(table,body(table,c))).id,change=table==='rooms'?{room_number:'HS-REVOKED-'+(++serial)}:
          table==='items'?{name:'Owned revoked update'}:{notes:'Owned revoked update'};
        await observe('assignment-removed-update',table,manager,c,{cohort:'assignment-revocation',method:'PATCH',id,change,allowed:false});
      }
      if(['rooms','items','laundry_batches'].includes(table)){
        const id=(await insert(table,body(table,c))).id;
        await observe('assignment-removed-delete',table,manager,c,{cohort:'assignment-revocation',method:'DELETE',id,allowed:false});
      }
    }
    await db.query('INSERT INTO public.user_hotels SELECT (jsonb_populate_record(NULL::public.user_hotels,$1::jsonb)).*',
      [JSON.stringify(assignment[0].value)]);
    for(const table of hotelScopeTables)await observe('assignment-restored-read',table,manager,contexts[0],
      {cohort:'assignment-revocation',id:contexts[0].rows[table],allowed:true});
    phase='existing-platform-policy-parity';
    const platform={...await employee('platform',a,'staff',false),role:'super_admin'};
    assert.equal((await db.query("UPDATE public.user_roles SET role='super_admin' WHERE user_id=$1 RETURNING user_id",[platform.id])).rowCount,1);
    // Preserve, do not expand, pre-existing table action policies. Only the
    // legacy items SELECT currently permits this platform role across tenants.
    // This parity check does not settle the broader platform product contract.
    for(const c of contexts)for(const table of hotelScopeTables)await observe('existing-platform-read',table,platform,c,
      {cohort:'platform-policy-parity',id:c.rows[table],allowed:c.tenantId===a.tenantId||table==='items'});
    phase='business-account-session';businessPhase='running';
    assert.ok(input.fixtureJwtSecret,'Owned issuer key required only for missing/wrong session claim variants');
    const claims=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
    function claimVariant(token,state,otherSession){
      const v=claims(token);if(state==='missing-session')delete v.session_id;else v.session_id=otherSession;
      const text=token.split('.')[0]+'.'+Buffer.from(JSON.stringify(v)).toString('base64url');
      return text+'.'+createHmac('sha256',input.fixtureJwtSecret).update(text).digest('base64url');
    }
    async function runActorStage(actor,state,stage){
      for(const {table,method}of businessActorActions(actor.fixture)){
        let id=contexts[0].rows[table],change;
        if(['PATCH','DELETE'].includes(method))id=(await insert(table,body(table,contexts[0]))).id;
        if(method==='PATCH')change=table==='rooms'?{room_number:'HS-ACTOR-'+(++serial)}:
          table==='items'?{name:'Owned actor update '+(++serial)}:{notes:'Owned actor update '+(++serial)};
        await observe('account-session',table,actor,contexts[0],{method,id,change,allowed:stage!=='invalid',
          cohort:'business-account-session',sink:businessObservations,details:{actorState:state,stage,
            tokenOrigin:['wrong-session','missing-session'].includes(state)&&stage==='invalid'?'owned_issuer_claim_variant':'actual_auth_login'}});
      }
    }
    async function changeActorState(actor,state){
      const originalToken=actor.token,sessionId=claims(actor.token).session_id;
      const old=(await db.query(`SELECT a.email_confirmed_at,a.banned_until,a.deleted_at AS auth_deleted,
        u.deleted_at AS profile_deleted,u.account_locked,u.status,s.not_after
        FROM auth.users a JOIN public.users u ON u.id=a.id JOIN auth.sessions s ON s.user_id=a.id AND s.id=$2
        WHERE a.id=$1`,[actor.id,sessionId])).rows[0];assert.ok(old,'Live synthetic actor fixture');
      if(['wrong-session','missing-session'].includes(state)){
        const other=claims(b.token).session_id;assert.notEqual(other,sessionId);
        actor.token=claimVariant(actor.token,state,other);
        return async()=>{actor.token=originalToken};
      }
      if(state==='logged-out'){
        const response=await call('/auth/v1/logout?scope=local',actor.token,{},'POST');
        assert.equal(response.status,204,'Actual Auth logout must succeed');
        assert.equal((await db.query('SELECT 1 FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,actor.id])).rowCount,0);
        return async()=>{const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password:actor.password});
          assert.equal(login.status,200);assert.equal(login.data.user.id,actor.id);actor.token=login.data.access_token;
          assert.notEqual(claims(actor.token).session_id,sessionId)};
      }
      let savedSession;
      if(state==='deleted-session')savedSession=(await db.query('DELETE FROM auth.sessions s WHERE id=$1 AND user_id=$2 RETURNING to_jsonb(s) AS value',[sessionId,actor.id])).rows[0]?.value;
      else if(state==='expired-session')assert.equal((await db.query("UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=$1 AND user_id=$2 RETURNING id",[sessionId,actor.id])).rowCount,1);
      else if(state==='unconfirmed')assert.equal((await db.query('UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1 RETURNING id',[actor.id])).rowCount,1);
      else if(state==='banned')assert.equal((await db.query("UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1 RETURNING id",[actor.id])).rowCount,1);
      else if(state==='auth-deleted')assert.equal((await db.query('UPDATE auth.users SET deleted_at=now() WHERE id=$1 RETURNING id',[actor.id])).rowCount,1);
      else if(state==='profile-deleted')assert.equal((await db.query('UPDATE public.users SET deleted_at=now() WHERE id=$1 RETURNING id',[actor.id])).rowCount,1);
      else if(state==='locked')assert.equal((await db.query('UPDATE public.users SET account_locked=true WHERE id=$1 RETURNING id',[actor.id])).rowCount,1);
      else if(state==='inactive')assert.equal((await db.query("UPDATE public.users SET status='inactive' WHERE id=$1 RETURNING id",[actor.id])).rowCount,1);
      else if(state==='null-status')assert.equal((await db.query('UPDATE public.users SET status=NULL WHERE id=$1 RETURNING id',[actor.id])).rowCount,1);
      else assert.fail('Unrecognized owned actor state');
      if(state==='deleted-session')assert.ok(savedSession);
      const confirmed=(await db.query(`SELECT CASE $3
        WHEN 'unconfirmed' THEN a.email_confirmed_at IS NULL
        WHEN 'banned' THEN a.banned_until>now()
        WHEN 'auth-deleted' THEN a.deleted_at IS NOT NULL
        WHEN 'profile-deleted' THEN u.deleted_at IS NOT NULL
        WHEN 'locked' THEN u.account_locked IS TRUE
        WHEN 'inactive' THEN u.status='inactive'
        WHEN 'null-status' THEN u.status IS NULL
        WHEN 'expired-session' THEN s.not_after<now()
        WHEN 'deleted-session' THEN s.id IS NULL ELSE false END AS confirmed
        FROM auth.users a JOIN public.users u ON u.id=a.id LEFT JOIN auth.sessions s ON s.id=$2 AND s.user_id=a.id
        WHERE a.id=$1`,[actor.id,sessionId,state])).rows[0]?.confirmed;
      assert.equal(confirmed,true,'Synthetic invalid state must be confirmed before API measurement');
      return async()=>{
        await db.query('UPDATE auth.users SET email_confirmed_at=$2,banned_until=$3,deleted_at=$4 WHERE id=$1',
          [actor.id,old.email_confirmed_at,old.banned_until,old.auth_deleted]);
        await db.query('UPDATE public.users SET deleted_at=$2,account_locked=$3,status=$4 WHERE id=$1',
          [actor.id,old.profile_deleted,old.account_locked,old.status]);
        if(savedSession)await db.query('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).*',[JSON.stringify(savedSession)]);
        else await db.query('UPDATE auth.sessions SET not_after=$2 WHERE id=$1',[sessionId,old.not_after]);
      };
    }
    for(const actor of [a,manager,department,staff])for(const state of businessActorStates){
      businessPhase=actor.fixture+':'+state;
      await runActorStage(actor,state,'before');
      const restore=await changeActorState(actor,state);
      try{await runActorStage(actor,state,'invalid')}finally{await restore()}
      await runActorStage(actor,state,'restored');
    }
    businessPhase='concurrent-revocation';
    async function waitBlocked(blockerPid){
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){
        const rows=(await db.query(`SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))
          AND pid<>pg_backend_pid() AND wait_event_type='Lock'`,[blockerPid])).rows;
        if(rows.length===1)return rows[0].pid;
        await new Promise(resolve=>setTimeout(resolve,20));
      }
      assert.fail('Expected owned database lock barrier was not observed');
    }
    async function raceSnapshot(){const v=await snapshot();delete v['public.users'];return v}
    for(const table of hotelScopeTables)for(const state of ['locked','deleted-session'])for(const order of ['revoke-first','mutation-first']){
      const actor=a,c=contexts[0],payload=body(table,c,actor),sessionId=claims(actor.token).session_id;
      const savedSession=(await db.query('SELECT to_jsonb(s) AS value FROM auth.sessions s WHERE id=$1 AND user_id=$2',[sessionId,actor.id])).rows[0]?.value;
      assert.ok(savedSession);const priorLock=(await db.query('SELECT account_locked FROM public.users WHERE id=$1',[actor.id])).rows[0].account_locked;
      const before=await raceSnapshot(),blocker=await db.connect(),revoker=await db.connect();
      let pending,revokePending,actorBarrier=false,secondBarrier=false,v,entry;
      const startMutation=()=>call('/rest/v1/'+table+'?select=id',actor.token,payload,'POST').then(value=>({value}),error=>({error}));
      const revoke=client=>state==='locked'?client.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]):
        client.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,actor.id]);
      try{
        await blocker.query('BEGIN');const blockerPid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        if(order==='revoke-first'){
          await revoke(blocker);pending=startMutation();await waitBlocked(blockerPid);actorBarrier=true;
          await blocker.query('COMMIT');
        }else{
          // Parent FK/quota lock holds the POST after its statement-level actor
          // locks. A row trigger cannot satisfy this ordering on every table.
          await blocker.query('SELECT 1 FROM public.tenants WHERE id=$1 FOR UPDATE',[c.tenantId]);
          pending=startMutation();const mutationPid=await waitBlocked(blockerPid);actorBarrier=true;
          await revoker.query('BEGIN');revokePending=revoke(revoker).then(value=>({value}),error=>({error}));
          await waitBlocked(mutationPid);secondBarrier=true;
          await blocker.query('COMMIT');
        }
        const outcome=await pending;if(outcome.error)throw outcome.error;v=outcome.value;
        if(revokePending){const r=await revokePending;if(r.error)throw r.error;await revoker.query('COMMIT');}
        const after=await raceSnapshot(),targetAfter=await row(table,payload.id),returnedRows=Array.isArray(v.data)?v.data.length:null;
        const evaluated=evaluateHotelScopeObservation({allowed:order==='mutation-first',method:'POST',status:v.status,
          sqlstate:v.data?.code??null,returnedRows,returnedTargetMatches:returnedRows===1&&v.data[0].id===payload.id,
          effectsUnchanged:JSON.stringify(before)===JSON.stringify(after),targetEffectMatches:targetAfter!==null&&
            Object.entries(payload).every(([k,value])=>k==='delivery_date'?Date.parse(targetAfter[k])===Date.parse(value):JSON.stringify(targetAfter[k])===JSON.stringify(value))});
        const next=await call('/rest/v1/'+table+'?id=eq.'+c.rows[table]+'&select=id',actor.token);
        const nextDenied=next.status===200&&Array.isArray(next.data)&&next.data.length===0;
        entry={table,actorFixture:actor.fixture,actorState:state,order,actualRest:true,actorBarrier,secondBarrier,
          status:v.status,sqlstate:v.data?.code??null,returnedRows,allowed:order==='mutation-first',
          effectsUnchanged:JSON.stringify(before)===JSON.stringify(after),nextRequestDenied:nextDenied,passed:false};
        businessRaces.push(entry);assert.equal(evaluated.passed,true,'Concurrent business mutation outcome');assert.equal(nextDenied,true);
      }finally{
        await blocker.query('ROLLBACK').catch(()=>{});
        if(revokePending)await revokePending.catch(()=>{});
        await revoker.query('ROLLBACK').catch(()=>{});blocker.release();revoker.release();
        if(state==='locked')await db.query('UPDATE public.users SET account_locked=$2 WHERE id=$1',[actor.id,priorLock]);
        else if((await db.query('SELECT 1 FROM auth.sessions WHERE id=$1',[sessionId])).rowCount===0)
          await db.query('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).*',[JSON.stringify(savedSession)]);
      }
      const recovered=await call('/rest/v1/'+table+'?id=eq.'+c.rows[table]+'&select=id',actor.token);
      entry.recoveryPositive=recovered.status===200&&Array.isArray(recovered.data)&&recovered.data.length===1&&recovered.data[0].id===c.rows[table];
      entry.passed=entry.actorBarrier&&(order==='revoke-first'||entry.secondBarrier)&&entry.nextRequestDenied&&entry.recoveryPositive;
      assert.equal(entry.passed,true,'Concurrent revocation recovery');
    }
    businessPhase='complete';phase='employee-profile-workflow';
    employeeProfileControls=await runEmployeeProfileChecks({db,call,input,a,b,manager,department,staff,row,newId:randomUUID,check:assert});
    phase='self-profile-workflow';
    selfProfileControls=await runSelfProfileChecks({db,call,input,a,manager,staff,row,check:assert});
    phase='password-workflow';
    passwordControls=await runPasswordChecks({db,call,input,a,manager,staff,row,check:assert});
    phase='complete';console.log(JSON.stringify(result()));
  }catch(error){console.log(JSON.stringify({...result(),verified:false,incomplete:true,failedPhase:phase,
    setupErrorCode:typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:null}));throw error;
  }finally{await db.end()}
}
if(process.env.ROOMQC_FIXTURE_HOTEL_SCOPE_INPUT)await runHotelScopeDrill(JSON.parse(process.env.ROOMQC_FIXTURE_HOTEL_SCOPE_INPUT));
