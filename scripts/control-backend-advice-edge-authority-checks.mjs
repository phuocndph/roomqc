// Included by the exact-owned Deno/Auth/REST/sink harness. Dependencies are
// lexical fixture helpers; no external imports, target URLs or production keys.
async function exerciseAdviceEdgeAuthority(){
 const cases=[],observations=[];let currentStage='authority-setup';
 const check=(label,passed,details={})=>record('authority-'+label,passed,details);
 const fullRow=(a,id)=>db.query('SELECT to_jsonb(c) AS value FROM private.operations_advice_commands c WHERE actor_id=$1 AND command_id=$2',[a.id,id]).then(r=>r.rows[0]?.value);
 const logs=id=>db.query("SELECT to_jsonb(l) AS value FROM public.activity_logs l WHERE entity_type='operations_advice' AND entity_id=$1 ORDER BY id",[id]).then(r=>r.rows);
 async function mutation(table,id,changes){assert.ok(['auth.users','auth.sessions','public.users','public.user_permissions','public.hotels','public.tenants'].includes(table));
  const keys=Object.keys(changes);assert.ok(keys.every(k=>/^[a-z_]+$/.test(k)));const before=(await db.query('SELECT * FROM '+table+' WHERE id=$1',[id])).rows[0];assert.ok(before);
  const write=values=>db.query('UPDATE '+table+' SET '+keys.map((k,i)=>k+'=$'+(i+2)).join(',')+' WHERE id=$1',[id,...values]);
  await write(keys.map(k=>changes[k]));return()=>write(keys.map(k=>before[k]));}
 async function remove(table,where,args){assert.ok(['auth.sessions','public.user_roles','public.user_hotels','public.hotels'].includes(table));
  const saved=(await db.query('DELETE FROM '+table+' WHERE '+where+' RETURNING *',args)).rows;assert.ok(saved.length);
  return async()=>{for(const row of saved)await db.query('INSERT INTO '+table+' SELECT * FROM json_populate_record(NULL::'+table+',$1::json)',[JSON.stringify(row)])};}
 const ownerAccount=await owner('authority-owner'),staff=await account('authority-staff');await seed(ownerAccount);assert.equal((await policy(ownerAccount)).status,200);
 const hotel=await insert('hotels',{id:randomUUID(),tenant_id:ownerAccount.tenantId,name:'Owned authority secondary',address:'Owned fixture',status:'active'});
 await insert('users',{id:staff.id,email:credentials('authority-staff').email,full_name:'Owned report-only staff',tenant_id:ownerAccount.tenantId,hotel_id:ownerAccount.hotelId,
  role:'staff',user_level_code:'staff',status:'active',created_by:ownerAccount.id,must_change_password:false,account_locked:false});
 await insert('user_roles',{user_id:staff.id,role:'staff'});await insert('user_hotels',{user_id:staff.id,hotel_id:hotel.id,assigned_by:ownerAccount.id});
 await db.query("DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='staff' AND p.module='reports'");
 const perm=(await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'reports','view',true) RETURNING id",[staff.id,ownerAccount.tenantId])).rows[0].id;
 const a={...staff,tenantId:ownerAccount.tenantId,hotelId:hotel.id};
 const financialSnapshot=async()=>{const snapshot={};for(const table of ['room_bookings','booking_payments','guest_invoices','financial_targets','rooms']){
  snapshot[table]=(await db.query('SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),\'[]\'::jsonb) AS value FROM public.'+table+' t WHERE tenant_id=$1',[ownerAccount.tenantId])).rows[0].value;
 }return JSON.stringify(snapshot)};
 const originalMoney=await financialSnapshot(),positive=command(),initial=await edge(a,positive);
 check('assigned-report-only-staff-positive',initial.status===200&&initial.data.state==='completed'&&count(positive)===1);
 const noPermission=command(),restorePermission=await mutation('public.user_permissions',perm,{enabled:false});
 try{const denied=await edge(a,noPermission);check('report-only-permission-is-required',denied.status===403&&!await fullRow(a,noPermission)&&count(noPermission)===0)}finally{await restorePermission()}
 cases.push(
  ['auth-softdelete',()=>mutation('auth.users',a.id,{deleted_at:new Date()})],
  ['auth-email-unconfirmed',()=>mutation('auth.users',a.id,{email_confirmed_at:null})],
  ['auth-banned',()=>mutation('auth.users',a.id,{banned_until:new Date(Date.now()+3600000)})],
  ['profile-inactive',()=>mutation('public.users',a.id,{status:'inactive'})],
  ['profile-softdelete',()=>mutation('public.users',a.id,{deleted_at:new Date()})],
  ['profile-locked',()=>mutation('public.users',a.id,{account_locked:true})],
  ['profile-super-admin',()=>mutation('public.users',a.id,{is_super_admin:true})],
  ['role-missing',()=>remove('public.user_roles','user_id=$1',[a.id])],
  ['role-level-mismatch',()=>mutation('public.users',a.id,{user_level_code:'department_manager'})],
  ['session-expired',()=>mutation('auth.sessions',a.sessionId,{not_after:new Date(Date.now()-1000)})],
  ['session-deleted',()=>remove('auth.sessions','id=$1',[a.sessionId])],
  ['reports-view-revoked',()=>mutation('public.user_permissions',perm,{enabled:false})],
  ['hotel-assignment-removed',()=>remove('public.user_hotels','user_id=$1 AND hotel_id=$2',[a.id,a.hotelId])],
  ['hotel-inactive',()=>mutation('public.hotels',a.hotelId,{status:'inactive'})],
  ['tenant-read-only',()=>mutation('public.tenants',a.tenantId,{is_read_only:true})],
  ['tenant-trial-expired',()=>mutation('public.tenants',a.tenantId,{subscription_status:'trial',trial_ends_at:new Date(Date.now()-1000)})],
  ['tenant-active-expired',async()=>{const date=(await db.query("SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-1)::text AS value")).rows[0].value;
   return mutation('public.tenants',a.tenantId,{subscription_status:'active',subscription_end_date:date})}]);
 const hardDelete=async()=>{const assignments=(await db.query('SELECT * FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[a.id,a.hotelId])).rows;
  const restore=await remove('public.hotels','id=$1',[a.hotelId]);return async()=>{
   await db.query('SELECT public.update_tenant_usage($1)',[a.tenantId]);await restore();
   for(const row of assignments)await db.query('INSERT INTO public.user_hotels SELECT * FROM json_populate_record(NULL::public.user_hotels,$1::json)',[JSON.stringify(row)]);
  }};
 const all=[...cases,['hotel-harddelete',hardDelete]];
 try{for(const window of ['before-provider','provider-io','final-receipt'])for(const[label,revoke]of all){
   currentStage=window+'-'+label;const id=command();let restore,observed=false,before,auditBefore,gate,pending;
   const hit=async()=>{before=await fullRow(a,id);auditBefore=await logs(id);assert.ok(before);restore=await revoke();observed=true};
   try{
    if(window==='before-provider')dispatchHook={id,run:hit};
    if(window==='final-receipt')releaseHook={id,committed:false,run:hit};
    if(window==='provider-io'){gate=barrier(id);pending=edge(a,id);await bounded(gate.hit);await hit();gate.release()}
    const response=await(pending??edge(a,id)),stored=await fullRow(a,id),auditAfter=await logs(id),expectedCalls=window==='before-provider'?0:1;
    check(currentStage+'-observed-denial-no-output',observed&&[401,403].includes(response.status)&&!response.data?.advice,
     {status:response.status,window,revocation:label,observedBarrier:observed});
    const expected=window==='final-receipt'?before:{...before,state:'unknown'};
    check(currentStage+'-retains-exact-journal-charge-and-audit',isDeepStrictEqual(stored,expected)&&isDeepStrictEqual(auditAfter,auditBefore));
    check(currentStage+'-provider-count-exact',count(id)===expectedCalls,{providerCalls:count(id),expectedProviderCalls:expectedCalls});
    observations.push({window,revocation:label,status:response.status,observedBarrier:observed,committedResultBeforeRevoke:window==='final-receipt',
     providerCalls:count(id),adviceReleased:false,journalAndAuditExpected:true,actualEdge:true});
   }finally{gate?.release();if(pending)await pending.catch(()=>{});dispatchHook=null;releaseHook=null;if(restore)await restore()}
   const stable=await fullRow(a,id),stableLogs=await logs(id),recovered=await edge(a,id,{service:'operations-advice-second-test'});
   check(currentStage+'-restored-second-edge-recovers-without-resend',recovered.data.state===(window==='final-receipt'?'completed':'unknown')
    &&count(id)===(window==='before-provider'?0:1)&&isDeepStrictEqual(await fullRow(a,id),stable)&&isDeepStrictEqual(await logs(id),stableLogs));
   check(currentStage+'-financial-data-preserved',await financialSnapshot()===originalMoney);
  }
  check('all-commands-dispatched-at-most-once',[...calls.values()].every(n=>n===1));
  check('relay-uses-separated-user-service-keys',!relayFailure&&keyKinds.userAuth>0&&keyKinds.userRpc>0&&keyKinds.serviceRpc>0);
  return{verified:true,matrix:{reversibleCases:cases.length,windows:3,hardDeleteCases:3,observations:observations.length},observations,
   externalProviderCalls:0,internalSinkCalls:[...calls.values()].reduce((x,y)=>x+y,0),allCommandsDispatchedAtMostOnce:true,
   actualEdge:true,browser:false,android:false,aclFixture:{id:ownerAccount.id,sessionId:ownerAccount.sessionId}};
 }catch(error){throw Object.assign(error,{authorityStage:currentStage,authorityObservations:observations})}
}
