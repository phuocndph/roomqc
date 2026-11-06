// Actual Auth/REST checks, executed only inside the exact-owned backend fixture.
// No runtime URL, credential or production target is accepted here.
export async function runEmployeeAuthorityChecks({db,call,input,a,b,manager,staff,newId,check}) {
  const q=(sql,args=[])=>db.query(sql,args),checks=[],races=[];
  let phase='configuration',complete=false,fixtureError=null,failedAssertion=null;
  let savedCreatedBy;
  const add=(label,details={})=>checks.push({label,...details,passed:true});
  const read=async(actor=a,target=staff.id)=>call('/rest/v1/rpc/get_employee_authority_configuration',actor.token,{p_target_id:target});
  const send=(r,actor=a)=>call('/rest/v1/rpc/replace_employee_authority',actor?.token??input.publishableKey,r);
  const result=(r,actor=a)=>call('/rest/v1/rpc/get_employee_authority_command_result',actor.token,
    {p_target_id:r.p_target_id,p_request_id:r.p_request_id});
  const flags=(hotel,extra={})=>({hotel_id:hotel,can_create_managers:false,can_create_staff:false,
    can_view_reports:false,can_export_data:false,can_approve_requests:false,...extra});
  async function request(kind='grants',entries=[{module:'users',action:'view',enabled:true}],actor=a) {
    phase='prepare-'+kind+'-'+actor.fixture;
    const v=await read(actor);check.equal(v.status,200);
    return {p_target_id:staff.id,p_kind:kind,p_entries:entries,p_expected_version:v.data.versions[kind],p_request_id:newId()};
  }
  const snapshot=async()=> (await q(`SELECT jsonb_build_object(
    'profile',(SELECT to_jsonb(u) FROM public.users u WHERE id=$1),
    'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY role),'[]') FROM public.user_roles r WHERE user_id=$1),
    'grants',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM public.user_permissions p WHERE user_id=$1),
    'hotels',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY hotel_id),'[]') FROM public.user_hotels h WHERE user_id=$1),
    'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY kind),'[]') FROM private.employee_authority_versions v WHERE target_id=$1),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.activity_logs l WHERE entity_id=$1),
    'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY request_id),'[]') FROM private.employee_authority_receipts r WHERE target_id=$1),
    'cancellations',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY request_id),'[]') FROM private.employee_authority_cancellations r WHERE target_id=$1)
    ) AS value`,[staff.id])).rows[0].value;
  async function deny(label,r,actor,status,code) {
    phase=label;const before=await snapshot(),v=await send(r,actor),after=await snapshot();
    check.equal(v.status,status,label+' HTTP');check.equal(v.data?.code,code,label+' SQLSTATE');check.deepEqual(after,before,label+' effects');
    add(label,{status:v.status,sqlstate:code,effectsUnchanged:true});return v;
  }
  async function positive(label,r,actor=a) {
    phase=label;const before=await snapshot(),v=await send(r,actor),after=await snapshot();
    check.equal(v.status,200,label+' HTTP');check.equal(v.data?.state,'completed');
    check.equal(v.data.target_id,staff.id);check.equal(v.data.request_id,r.p_request_id);
    check.ok(BigInt(v.data.version)>BigInt(r.p_expected_version));
    check.equal(after.audit.length,before.audit.length+1);check.equal(after.receipts.length,before.receipts.length+1);
    check.deepEqual(after.profile,before.profile);check.deepEqual(after.roles,before.roles);
    check.deepEqual(after.cancellations,before.cancellations);
    check.deepEqual(after[r.p_kind==='grants'?'hotels':'grants'],before[r.p_kind==='grants'?'hotels':'grants']);
    add(label,{status:200,auditDelta:1,receiptDelta:1,versionAdvanced:true});return {v,after};
  }
  async function waitBlocked(client) {
    const pid=(await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid,deadline=Date.now()+5000;
    while(Date.now()<deadline){
      const blocked=(await q("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'",[pid])).rows;
      if(blocked.length===1)return;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    check.fail('Owned authority command lock barrier missing');
  }
  try {
    check.match(input.run,/^[a-f0-9]{12}$/);
    check.equal(a.fixture,'owner-a');check.equal(b.fixture,'owner-b');check.notEqual(a.tenantId,b.tenantId);
    savedCreatedBy=(await q('SELECT created_by FROM public.users WHERE id=$1',[staff.id])).rows[0].created_by;
    await q('UPDATE public.users SET created_by=$2 WHERE id=$1',[staff.id,manager.id]);
    check.equal((await q('SELECT public.can_manage_user($1,$2) AS allowed',[manager.id,staff.id])).rows[0].allowed,true);
    const initial=await read();check.equal(initial.status,200);check.equal(initial.data.semantics,'additive');
    check.match(initial.data.versions.grants,/^\d+$/);check.match(initial.data.versions.hotels,/^\d+$/);
    add('private-configuration-read',{status:200});
    phase='owner-editor-catalog';const catalogBefore=await snapshot(),ownerCatalog=await read();
    check.equal(ownerCatalog.status,200);check.deepEqual(await snapshot(),catalogBefore);
    check(ownerCatalog.data.hotel_catalog.some(h=>h.id===a.hotelId&&h.assignable));
    check(ownerCatalog.data.hotel_catalog.some(h=>h.id===a.secondHotelId&&h.assignable));
    check.equal(ownerCatalog.data.hotel_catalog.some(h=>h.id===b.hotelId),false);
    for(const h of ownerCatalog.data.hotel_catalog){check.equal(Object.keys(h.allowed).length,5);check(Object.values(h.allowed).every(v=>v===true));}
    check(ownerCatalog.data.actions.every(v=>typeof v.delegatable==='boolean'&&v.action!=='edit'));
    add('owner-catalog-same-tenant-all-five-flags-no-effects',{status:200,effectsUnchanged:true,foreignHotelAbsent:true});
    phase='manager-editor-catalog';const managerCatalog=await read(manager);check.equal(managerCatalog.status,200);
    const managedHotel=managerCatalog.data.hotel_catalog.find(h=>h.id===a.hotelId);check.ok(managedHotel);check.equal(managedHotel.assignable,true);
    check.equal(managedHotel.allowed.can_create_managers,false);
    check.equal(managerCatalog.data.hotel_catalog.some(h=>h.id===b.hotelId),false);
    add('manager-catalog-delegation-metadata',{status:200,unheldManagerFlag:false,foreignHotelAbsent:true});
    const acl=(await q(`SELECT p.proname,p.prosecdef,
      has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('replace_employee_authority','get_employee_authority_configuration','get_employee_authority_command_result')
      ORDER BY p.proname`)).rows;
    check.equal(acl.length,3);check(acl.every(v=>!v.prosecdef&&!v.anon&&v.authenticated&&!v.service));
    check.equal((await q("SELECT has_table_privilege('authenticated','private.employee_authority_receipts','SELECT') AS allowed")).rows[0].allowed,false);
    check.equal((await q("SELECT has_table_privilege('authenticated','private.employee_authority_versions','UPDATE') AS allowed")).rows[0].allowed,false);
    add('invoker-wrapper-private-store-acl');
    const first=await request();const committed=await positive('custom-replacement-atomic',first);
    check.deepEqual(committed.v.data.entries,[{module:'users',action:'view',enabled:true}]);
    const receipt=await result(first);check.equal(receipt.status,200);check.deepEqual(receipt.data,committed.v.data);
    add('committed-response-discard-lookup',{status:200,actualHttpRequests:true,transportFaultInjected:false});
    phase='replay20';for(let i=0;i<20;i++){
      const replay=await send(first);check.equal(replay.status,200);check.deepEqual(replay.data,committed.v.data);
    }
    check.deepEqual(await snapshot(),committed.after);add('same-key-replay20',{replays:20,effectsUnchanged:true});
    await deny('same-key-different-payload',{...first,p_entries:[]},a,409,'PT409');
    await deny('stale-editor',{...first,p_request_id:newId()},a,409,'PT409');
    const unknown=await result({...first,p_request_id:newId()});check.equal(unknown.status,200);check.deepEqual(unknown.data,{state:'not_found'});
    add('unknown-request-lookup');
    const valid=await request();
    for(const [label,actor] of [['foreign-owner',b],['staff-self',staff]]){
      await deny(label,valid,actor,403,'42501');
      const deniedRead=await read(actor);check.equal(deniedRead.status,403);
      const deniedResult=await result(first,actor);check.equal(deniedResult.status,403);add(label+'-read-result-denied',{status:403});
    }
    await deny('protected-target',{...valid,p_target_id:a.id},a,403,'42501');
    await deny('anonymous-command',valid,null,401,'42501');
    for(const [label,entries] of [
      ['unknown-module',[{module:'__invalid',action:'view',enabled:true}]],
      ['invalid-action',[{module:'users',action:'__invalid',enabled:true}]],
      ['nonboolean-enabled',[{module:'users',action:'view',enabled:'true'}]],
      ['supplied-tenant',[{module:'users',action:'view',enabled:true,tenant_id:b.tenantId}]],
      ['duplicate-alias',[{module:'users',action:'update',enabled:true},{module:'users',action:'edit',enabled:false}]]
    ])await deny(label,{...valid,p_entries:entries},a,400,'22023');
    const beforeLegacy=await read();
    await q("UPDATE public.user_permissions SET enabled=false WHERE user_id=$1 AND module='users' AND action='view'",[staff.id]);
    const afterLegacy=await read();check(BigInt(afterLegacy.data.versions.grants)>BigInt(beforeLegacy.data.versions.grants));
    await deny('legacy-write-invalidates-old-editor',valid,a,409,'PT409');add('legacy-writer-advances-version');
    const simultaneous=await request();const beforeTwo=await snapshot();
    const two=await Promise.all([send(simultaneous),send({...simultaneous,p_request_id:newId(),p_entries:[]})]);
    check.deepEqual(two.map(v=>v.status).sort(),[200,409]);const afterTwo=await snapshot();
    check.equal(afterTwo.receipts.length,beforeTwo.receipts.length+1);check.equal(afterTwo.audit.length,beforeTwo.audit.length+1);
    add('two-editors-one-version-one-winner',{statuses:[200,409],auditDelta:1,receiptDelta:1});
    const same=await request();const beforeSame=await snapshot();
    const sameResults=await Promise.all([send(same),send(same)]);check(sameResults.every(v=>v.status===200));
    check.deepEqual(sameResults[0].data,sameResults[1].data);const afterSame=await snapshot();
    check.equal(afterSame.receipts.length,beforeSame.receipts.length+1);check.equal(afterSame.audit.length,beforeSame.audit.length+1);
    add('two-tabs-one-key-one-commit',{requests:2,auditDelta:1,receiptDelta:1});

    const hotelEntries=[flags(a.hotelId,{can_view_reports:true}),flags(a.secondHotelId,{can_export_data:true,can_create_staff:true})];
    const hotels=await request('hotels',hotelEntries);const savedHotels=await positive('memberships-all-five-flags-atomic',hotels);
    check.equal(savedHotels.v.data.entries.length,2);
    for(const entry of hotelEntries)check.deepEqual(savedHotels.v.data.entries.find(v=>v.hotel_id===entry.hotel_id),entry);
    phase='existing-out-of-scope-catalog';const scoped=await read(manager);check.equal(scoped.status,200);
    const outside=scoped.data.hotel_catalog.find(h=>h.id===a.secondHotelId);check.ok(outside);
    check.equal(outside.assignable,false);check(Object.values(outside.allowed).every(v=>v===false));
    check.deepEqual(scoped.data.hotels.find(h=>h.hotel_id===a.secondHotelId),hotelEntries[1]);
    add('existing-out-of-scope-membership-visible-for-review',{status:200,existingFlagsPreserved:true,assignable:false});
    const reversed=await send({...hotels,p_entries:[...hotelEntries].reverse()});check.equal(reversed.status,200);
    check.deepEqual(reversed.data,savedHotels.v.data);check.deepEqual(await snapshot(),savedHotels.after);add('canonical-membership-replay');
    const hotelRequest=await request('hotels',hotelEntries);
    await deny('membership-foreign-hotel',{...hotelRequest,p_entries:[flags(a.hotelId),flags(b.hotelId)]},a,403,'42501');
    await deny('membership-missing-primary',{...hotelRequest,p_entries:[flags(a.secondHotelId)]},a,400,'22023');
    await deny('membership-missing-flag',{...hotelRequest,p_entries:[{hotel_id:a.hotelId}]},a,400,'22023');
    await positive('membership-remove-and-flags-one-commit',await request('hotels',[flags(a.hotelId,{can_approve_requests:true})]));
    const managerRequest=await request('hotels',[flags(a.hotelId,{can_create_managers:true})],manager);
    await deny('manager-cannot-delegate-unheld-flags',managerRequest,manager,403,'42501');
    const unheldModule='owned_authority_'+input.run;
    await q("INSERT INTO public.permissions(code,name,module,action) VALUES($1,'Owned unheld capability',$2,'view')",[unheldModule+'.view',unheldModule]);
    const grantedPermission=await request('grants',[{module:unheldModule,action:'view',enabled:true}],manager);
    const canManage=(await q("SELECT public.has_user_permission($1,$2,'view') AS allowed",[manager.id,unheldModule])).rows[0].allowed;
    check.equal(canManage,false);
    phase='unheld-grant-catalog';const unheldCatalog=await read(manager);check.equal(unheldCatalog.status,200);
    check.deepEqual(unheldCatalog.data.actions.find(v=>v.module===unheldModule),
      {module:unheldModule,action:'view',custom:false,inherited:false,effective:false,delegatable:false});
    add('unheld-grant-catalog-disables-delegation',{status:200,delegatable:false});
    await deny('manager-cannot-delegate-unheld-grant',grantedPermission,manager,403,'42501');
    const managerValid=await request('grants',[{module:'users',action:'update',enabled:true}],manager);
    await positive('manager-valid-grant',managerValid,manager);
    const ownerCannotReadManagersReceipt=await result(managerValid,a);check.deepEqual(ownerCannotReadManagersReceipt.data,{state:'not_found'});
    add('receipt-bound-to-original-actor');

    for(const table of ['public.activity_logs','private.employee_authority_receipts']){
      const r=await request('grants',[{module:'users',action:'update',enabled:false}]);
      await q(`CREATE FUNCTION private.roomqc_authority_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
        BEGIN RAISE EXCEPTION 'Owned authority fault' USING ERRCODE='23514'; END; $f$;
        CREATE TRIGGER roomqc_authority_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.roomqc_authority_fault()`);
      try {await deny(table==='public.activity_logs'?'audit-fault-rolls-back-all':'receipt-fault-rolls-back-all',r,a,400,'23514')}
      finally {await q(`DROP TRIGGER roomqc_authority_fault ON ${table}; DROP FUNCTION private.roomqc_authority_fault()`)}
      await positive(table==='public.activity_logs'?'audit-fault-recovery-same-key':'receipt-fault-recovery-same-key',r);
    }
    const tenant=(await q('SELECT is_read_only FROM public.tenants WHERE id=$1',[a.tenantId])).rows[0];
    const restricted=await request();await q('UPDATE public.tenants SET is_read_only=true WHERE id=$1',[a.tenantId]);
    try {await deny('read-only-tenant',restricted,a,403,'42501')}
    finally {await q('UPDATE public.tenants SET is_read_only=$2 WHERE id=$1',[a.tenantId,tenant.is_read_only])}
    await positive('tenant-unlocked-recovery',restricted);

    // Actual PostgreSQL barriers, not timed guesses about an HTTP request.
    const sessionId=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url')).session_id;
    const session=(await q('SELECT to_jsonb(s) AS value FROM auth.sessions s WHERE id=$1',[sessionId])).rows[0].value;
    const revokeRequest=await request(),revokeBefore=await snapshot(),blocker=await db.connect();
    let pending;
    try{
      await blocker.query('BEGIN');await blocker.query('DELETE FROM auth.sessions WHERE id=$1',[sessionId]);
      pending=send(revokeRequest);await waitBlocked(blocker);await blocker.query('COMMIT');
      const denied=await pending;check.equal(denied.status,403);check.equal(denied.data?.code,'42501');
      check.deepEqual(await snapshot(),revokeBefore);races.push({label:'session-revoked-before-command-lock',actualLockBarrier:true,status:403,effectsUnchanged:true,passed:true});
    }finally{
      await blocker.query('ROLLBACK').catch(()=>{});blocker.release();
      await q('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).* ON CONFLICT(id) DO NOTHING',[JSON.stringify(session)]);
      if(pending)await pending;
    }
    await positive('revoked-session-restored-valid-recovery',revokeRequest);
    const expiryRequest=await request(),expiryBefore=await snapshot(),revision=await db.connect();
    try{
      await q("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 seconds' WHERE id=$1",[sessionId]);
      await revision.query('BEGIN');await revision.query("SELECT 1 FROM private.employee_authority_versions WHERE target_id=$1 AND kind='grants' FOR UPDATE",[staff.id]);
      pending=send(expiryRequest);await waitBlocked(revision);
      const deadline=Date.now()+5000;let expired=false;
      while(Date.now()<deadline){expired=(await q('SELECT not_after<=clock_timestamp() AS expired FROM auth.sessions WHERE id=$1',[sessionId])).rows[0].expired;
        if(expired)break;await new Promise(resolve=>setTimeout(resolve,20));}
      check.equal(expired,true);await revision.query('COMMIT');const denied=await pending;
      check.equal(denied.status,403);check.equal(denied.data?.code,'42501');check.deepEqual(await snapshot(),expiryBefore);
      races.push({label:'session-expiry-after-revision-wait',actualLockBarrier:true,expiryObservedAfterBarrier:true,status:403,effectsUnchanged:true,passed:true});
    }finally{
      await revision.query('ROLLBACK').catch(()=>{});revision.release();if(pending)await pending;
      await q('UPDATE auth.sessions SET not_after=$2 WHERE id=$1',[sessionId,session.not_after]);
    }
    await positive('revision-wait-expiry-recovery',expiryRequest);
    phase='trusted-writer-revision-busy';
    const legacyBefore=await snapshot(),legacyBlock=await db.connect();
    try{
      await legacyBlock.query('BEGIN');await legacyBlock.query("SELECT 1 FROM private.employee_authority_versions WHERE target_id=$1 AND kind='grants' FOR UPDATE",[staff.id]);
      const existing=(await q('SELECT id,enabled FROM public.user_permissions WHERE user_id=$1 LIMIT 1',[staff.id])).rows[0];check.ok(existing);
      const browser=await call('/rest/v1/user_permissions?id=eq.'+existing.id+'&select=id',a.token,{enabled:!existing.enabled},'PATCH');
      check.equal(browser.status,403);check.equal(browser.data?.code,'42501');check.deepEqual(await snapshot(),legacyBefore);
      add('browser-write-denied-before-revision-lock',{status:403,effectsUnchanged:true});
      const patch=await call('/rest/v1/user_permissions?id=eq.'+existing.id+'&select=id',input.serviceKey,{enabled:!existing.enabled},'PATCH');
      check.equal(patch.status,409);check.equal(patch.data?.code,'PT409');check.deepEqual(await snapshot(),legacyBefore);
      races.push({label:'trusted-row-writer-revision-busy-no-deadlock',status:409,actualHttp:true,effectsUnchanged:true,passed:true});
    }finally{await legacyBlock.query('ROLLBACK');legacyBlock.release()}
    const role=(await q(`INSERT INTO public.roles(tenant_id,code,name,is_system,hierarchy_level)
      VALUES($1,'staff','Owned authority readback',false,5) ON CONFLICT(tenant_id,code) DO UPDATE SET code=excluded.code RETURNING id`,[a.tenantId])).rows[0];
    const permission=(await q("SELECT id FROM public.permissions WHERE module='users' AND action='update' ORDER BY id LIMIT 1")).rows[0];
    check.ok(permission);await q('INSERT INTO public.role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[role.id,permission.id]);
    await positive('custom-false-preserves-role-effective',await request('grants',[{module:'users',action:'update',enabled:false}]));
    const inherited=await read();const action=inherited.data.actions.find(v=>v.module==='users'&&v.action==='update');
    check.deepEqual(action,{module:'users',action:'update',custom:false,inherited:true,effective:true,delegatable:true});
    const effective=await call('/rest/v1/rpc/has_user_permission',staff.token,{p_user_id:staff.id,p_module:'users',p_action:'update'});
    check.equal(effective.data,true);add('effective-custom-inherited-additive-readback',{status:200,effective:true,custom:false,inherited:true});

    // Legacy DTOs must agree with enforcement and the new editor, while self
    // read remains available to staff without employee-management capability.
    phase='legacy-readback-catalog';
    const module='readback_'+input.run;
    const detailRead=(actor=staff,target=staff.id)=>call('/rest/v1/rpc/get_user_permissions',actor?.token??input.publishableKey,{_user_id:target});
    const summaryRead=(actor=staff,target=staff.id)=>call('/rest/v1/rpc/get_user_permissions_summary',actor?.token??input.publishableKey,{p_user_id:target});
    const permissions={};
    for(const action of ['view','edit','update','export']){
      permissions[action]=(await q(`INSERT INTO public.permissions(code,name,module,action)
        VALUES($1,$2,$3,$4) RETURNING id`,[module+'.'+action,'Owned readback '+action,module,action])).rows[0].id;
    }
    const systemRole=(await q(`INSERT INTO public.roles(tenant_id,code,name,is_system,hierarchy_level)
      VALUES('00000000-0000-0000-0000-000000000000','staff','Owned readback system role',true,5)
      ON CONFLICT(tenant_id,code) DO UPDATE SET code=excluded.code RETURNING id`)).rows[0].id;
    for(const action of ['view','edit'])await q('INSERT INTO public.role_permissions(role_id,permission_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[systemRole,permissions[action]]);
    for(const [action,enabled] of [['view',false],['update',false],['export',true]]){
      await q('INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,$3,$4,$5)',[staff.id,a.tenantId,module,action,enabled]);
    }
    const legacyReadBefore=await snapshot(),detail=await detailRead(),summary=await summaryRead(),editor=await read();
    check.equal(detail.status,200);check.equal(summary.status,200);check.equal(editor.status,200);
    check.deepEqual(await snapshot(),legacyReadBefore);
    const ownRows=detail.data.filter(v=>v.module===module),summaryRow=summary.data.find(v=>v.module===module);
    check.deepEqual(ownRows.map(v=>v.action).sort(),['export','update','view']);
    check.equal(ownRows.find(v=>v.action==='view').source,'role');
    check.equal(ownRows.find(v=>v.action==='update').source,'role');
    check.equal(ownRows.find(v=>v.action==='export').source,'user');
    check.equal(ownRows.find(v=>v.action==='update').code,module+'.update');
    add('legacy-self-detail-system-role-custom-false-additive',{status:200,effectsUnchanged:true});
    add('legacy-alias-canonical-single-update',{status:200,duplicateAliasRows:0});
    add('legacy-custom-source-and-role-source-retained',{status:200});
    for(const action of ['view','update','export','delete']){
      const actual=await call('/rest/v1/rpc/has_user_permission',staff.token,{p_user_id:staff.id,p_module:module,p_action:action});
      check.equal(actual.status,200);const expected=action!=='delete';check.equal(actual.data,expected);
      check.equal(summaryRow['can_'+action],expected);
      check.equal(ownRows.some(v=>v.action===action),expected);
      if(action!=='delete')check.equal(editor.data.actions.find(v=>v.module===module&&v.action===action).effective,expected);
      add('legacy-summary-detail-editor-enforcement-'+action,{status:200,effective:expected});
    }
    await q('DELETE FROM public.role_permissions WHERE role_id=$1 AND permission_id=$2',[systemRole,permissions.edit]);
    await q('INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,$3,$4,true)',[staff.id,a.tenantId,module,'edit']);
    const customAlias=await detailRead();check.equal(customAlias.status,200);
    check.equal(customAlias.data.filter(v=>v.module===module&&v.action==='update').length,1);
    check.equal(customAlias.data.find(v=>v.module===module&&v.action==='update').source,'user');
    check.equal((await summaryRead()).data.find(v=>v.module===module).can_update,true);
    add('legacy-custom-edit-true-update-false-alias-remains-additive',{status:200});
    for(const actor of [a,b]){
      const ownerDetail=await detailRead(actor,actor.id),ownerSummary=await summaryRead(actor,actor.id);
      check.equal(ownerDetail.status,200);check.equal(ownerSummary.status,200);
      check.deepEqual(ownerDetail.data.filter(v=>v.module===module).map(v=>v.action).sort(),['export','update','view']);
      check(Object.entries(ownerSummary.data.find(v=>v.module===module)).filter(([k])=>k!=='module').every(([,v])=>v===true));
      add('legacy-owner-self-bypass-'+actor.fixture,{status:200});
    }
    for(const actor of [a,manager]){
      const d=await detailRead(actor),s=await summaryRead(actor);check.equal(d.status,200);check.equal(s.status,200);
      check.deepEqual(d.data,customAlias.data);add('legacy-authorized-foreign-read-'+actor.fixture,{status:200});
    }
    const legacyDeniedBefore=await snapshot();
    for(const [label,actor,target,status] of [['foreign-tenant',b,staff.id,403],['staff-other-user',staff,manager.id,403],
      ['anonymous',null,staff.id,401],['missing-target',a,newId(),403]]){
      for(const readFn of [detailRead,summaryRead]){
        const denied=await readFn(actor,target);check.equal(denied.status,status);check.equal(denied.data?.code,'42501');
      }
      check.deepEqual(await snapshot(),legacyDeniedBefore);add('legacy-read-denied-'+label,{status,effectsUnchanged:true});
    }
    const legacyAcl=(await q(`SELECT p.proname,p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,has_function_privilege('service_role',p.oid,'EXECUTE') AS service
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
        AND p.proname IN ('get_user_permissions','get_user_permissions_summary') ORDER BY p.proname`)).rows;
    check.equal(legacyAcl.length,2);check(legacyAcl.every(v=>!v.prosecdef&&!v.anon&&v.authenticated&&!v.service));
    add('legacy-read-invoker-wrapper-private-implementation-acl');
    const staffProfile=(await q('SELECT status,account_locked FROM public.users WHERE id=$1',[staff.id])).rows[0];
    for(const [label,changes] of [['inactive',{status:'inactive'}],['locked',{account_locked:true}]]){
      try{
        await q('UPDATE public.users SET status=$2,account_locked=$3 WHERE id=$1',[staff.id,changes.status??staffProfile.status,changes.account_locked??staffProfile.account_locked]);
        for(const readFn of [detailRead,summaryRead]){const denied=await readFn();check.equal(denied.status,403);check.equal(denied.data?.code,'42501');}
        add('legacy-self-read-live-'+label,{status:403});
      }finally{await q('UPDATE public.users SET status=$2,account_locked=$3 WHERE id=$1',[staff.id,staffProfile.status,staffProfile.account_locked])}
    }
    const staffSessionId=JSON.parse(Buffer.from(staff.token.split('.')[1],'base64url')).session_id;
    const staffSession=(await q('SELECT to_jsonb(s) AS value FROM auth.sessions s WHERE id=$1',[staffSessionId])).rows[0].value;
    const readBlock=await db.connect();let pendingRead;
    try{
      await readBlock.query('BEGIN');await readBlock.query('DELETE FROM auth.sessions WHERE id=$1',[staffSessionId]);
      pendingRead=detailRead();await waitBlocked(readBlock);await readBlock.query('COMMIT');
      const denied=await pendingRead;check.equal(denied.status,403);check.equal(denied.data?.code,'42501');
      check.equal((await summaryRead()).status,403);
      races.push({label:'legacy-read-session-revoked-before-lock',actualLockBarrier:true,status:403,passed:true});
    }finally{
      await readBlock.query('ROLLBACK').catch(()=>{});readBlock.release();if(pendingRead)await pendingRead;
      await q('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).* ON CONFLICT(id) DO NOTHING',[JSON.stringify(staffSession)]);
    }
    check.equal((await detailRead()).status,200);check.equal((await summaryRead()).status,200);
    add('legacy-live-session-restored-read-recovery',{status:200});
    phase='command-only-table-acl';
    const relationAcl=(await q(`SELECT c.relname,r.rolname,
      has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS writable,
      has_any_column_privilege(r.oid,c.oid,'INSERT') OR has_any_column_privilege(r.oid,c.oid,'UPDATE')
        OR has_any_column_privilege(r.oid,c.oid,'REFERENCES') AS column_writable
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      CROSS JOIN pg_roles r WHERE n.nspname='public' AND c.relname IN ('user_permissions','user_hotels')
        AND r.rolname IN ('anon','authenticated') ORDER BY c.relname,r.rolname`)).rows;
    check.equal(relationAcl.length,4);check(relationAcl.every(v=>!v.writable&&!v.column_writable));
    add('authority-relations-no-browser-table-or-column-write');
    const serviceAcl=(await q(`SELECT c.relname,
      has_table_privilege('service_role',c.oid,'INSERT') AND has_table_privilege('service_role',c.oid,'UPDATE')
        AND has_table_privilege('service_role',c.oid,'DELETE') AS retained
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relname IN ('user_permissions','user_hotels')`)).rows;
    check.equal(serviceAcl.length,2);check(serviceAcl.every(v=>v.retained));
    add('trusted-service-table-acl-retained');
    for(const table of ['user_permissions','user_hotels']){
      const isGrant=table==='user_permissions',filter='?user_id=eq.'+staff.id;
      const insert=isGrant?{user_id:staff.id,tenant_id:a.tenantId,module:'users',action:'view',enabled:true}
        :{user_id:staff.id,hotel_id:a.hotelId,assigned_by:a.id,...Object.fromEntries(Object.entries(flags(a.hotelId)).filter(([k])=>k!=='hotel_id'))};
      const update=isGrant?{enabled:false}:{can_export_data:true};
      for(const [actorName,actor] of [['owner',a],['manager',manager],['staff',staff],['anon',null]]){
        for(const [operation,method,body] of [['insert','POST',insert],['update','PATCH',update],['delete','DELETE',undefined]]){
          phase='direct-'+table+'-'+actorName+'-'+operation;
          const before=await snapshot();
          const denied=await call('/rest/v1/'+table+(method==='POST'?'':filter),actor?.token??input.publishableKey,body,method);
          check.equal(denied.status,actor?403:401);check.equal(denied.data?.code,'42501');
          check.deepEqual(await snapshot(),before);
          add(phase,{status:denied.status,effectsUnchanged:true});
        }
      }
      const before=await snapshot(),retainedRead=await call('/rest/v1/'+table+filter,a.token);
      check.equal(retainedRead.status,200);check(Array.isArray(retainedRead.data));check.deepEqual(await snapshot(),before);
      add('retained-scoped-read-'+table,{status:200,effectsUnchanged:true});
    }
    // A real new verified owner must still register through the trusted first-
    // owner path after the browser's relation DML has been removed.
    phase='registration-compatibility';
    const email='authority-registration-'+input.run+'@roomqc.invalid',password=newId()+newId();
    const native=await call('/auth/v1/admin/users',input.serviceKey,{email,password,email_confirm:true});
    check.equal(native.status,200);check.ok(native.data?.id);
    const registrationSession=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email,password});
    check.equal(registrationSession.status,200);check.ok(registrationSession.data?.access_token);
    const registration={p_user_id:native.data.id,p_full_name:'Owned authority registration',p_phone:'0901234567',
      p_tenant_name:'Owned authority registration',p_email:email,p_hotel_name:'Owned authority registration',
      p_hotel_address:'123 Fixture Road',p_hotel_phone:'0281234567',p_hotel_email:email,p_total_rooms:3};
    const registered=await call('/rest/v1/rpc/complete_registration',registrationSession.data.access_token,registration);
    check.equal(registered.status,200);check.equal(registered.data?.success,true);
    const registrationSnapshot=async()=> (await q(`SELECT jsonb_build_object(
      'profile',(SELECT to_jsonb(u) FROM public.users u WHERE id=$1),
      'tenant',(SELECT to_jsonb(t) FROM public.tenants t WHERE id=$2),
      'hotels',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY id),'[]') FROM public.hotels h WHERE tenant_id=$2),
      'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY hotel_id),'[]') FROM public.user_hotels h WHERE user_id=$1),
      'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY role),'[]') FROM public.user_roles r WHERE user_id=$1)) AS value`,
      [native.data.id,registered.data.tenant_id])).rows[0].value;
    const beforeRegistrationReplay=await registrationSnapshot();
    check.equal(beforeRegistrationReplay.profile.role,'owner');check.equal(beforeRegistrationReplay.profile.is_primary_owner,true);
    check.equal(beforeRegistrationReplay.hotels.length,1);check.equal(beforeRegistrationReplay.memberships.length,1);
    check.equal(beforeRegistrationReplay.memberships[0].hotel_id,registered.data.hotel_id);
    check(beforeRegistrationReplay.roles.some(r=>r.role==='owner'));
    add('first-owner-registration-retains-membership-role',{status:200,hotels:1,memberships:1});
    const registrationReplay=await call('/rest/v1/rpc/complete_registration',registrationSession.data.access_token,registration);
    check.equal(registrationReplay.status,200);check.equal(registrationReplay.data?.idempotent,true);
    check.equal(registrationReplay.data.tenant_id,registered.data.tenant_id);
    check.deepEqual(await registrationSnapshot(),beforeRegistrationReplay);
    add('first-owner-registration-replay-preserves-trial-and-membership',{status:200,effectsUnchanged:true});
    const postClosure=await request();await positive('aggregate-command-after-direct-write-denial',postClosure);
    phase='terminal-outcome-acl';
    const cancel=(r,actor=a)=>call('/rest/v1/rpc/cancel_employee_authority_command',actor?.token??input.publishableKey,r);
    const business=s=>({profile:s.profile,roles:s.roles,grants:s.grants,hotels:s.hotels,versions:s.versions,receipts:s.receipts});
    const cancellationAcl=(await q(`SELECT p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname='cancel_employee_authority_command'`)).rows;
    check.equal(cancellationAcl.length,1);check.deepEqual(cancellationAcl[0],{prosecdef:false,anon:false,authenticated:true,service:false});
    for(const name of ['apply_employee_authority_command','employee_authority_command_identity']){
      check.equal((await q(`SELECT has_function_privilege('authenticated',p.oid,'EXECUTE') AS allowed
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='private' AND p.proname=$1`,[name])).rows[0].allowed,false);
    }
    for(const roleName of ['anon','authenticated','service_role'])check.equal((await q(
      "SELECT has_table_privilege($1,'private.employee_authority_cancellations','SELECT,INSERT,UPDATE,DELETE') AS allowed",[roleName])).rows[0].allowed,false);
    add('terminal-outcome-invoker-private-acl-no-inner-bypass');
    async function cancelled(label,r){
      phase=label;const before=await snapshot(),v=await cancel(r),after=await snapshot();
      check.equal(v.status,200);check.equal(v.data?.state,'cancelled');check.equal(v.data.reason,'not_applied');
      check.equal(v.data.target_id,r.p_target_id);check.equal(v.data.kind,r.p_kind);check.equal(v.data.request_id,r.p_request_id);
      check.equal(v.data.expected_version,r.p_expected_version);check.deepEqual(business(after),business(before));
      check.equal(after.audit.length,before.audit.length+1);check.equal(after.cancellations.length,before.cancellations.length+1);
      add(label,{status:200,businessUnchanged:true,auditDelta:1,cancellationDelta:1});return {v,after};
    }
    const rejected=await request('grants',[{module:'removed_catalog_'+input.run,action:'view',enabled:true}]);
    await deny('validation-before-terminal-settlement',rejected,a,400,'22023');
    const terminal=await cancelled('validation-settled-with-durable-no-commit-outcome',rejected);
    const terminalLookup=await result(rejected);check.equal(terminalLookup.status,200);check.deepEqual(terminalLookup.data,terminal.v.data);
    add('terminal-outcome-lookup-after-discarded-response',{status:200});
    for(let i=0;i<20;i++){
      const retry=await cancel(rejected);check.equal(retry.status,200);check.deepEqual(retry.data,terminal.v.data);
      const lateSave=await send(rejected);check.equal(lateSave.status,200);check.deepEqual(lateSave.data,terminal.v.data);
    }
    check.deepEqual(await snapshot(),terminal.after);add('terminal-replay20-and-late-save20-no-effects',{effectsUnchanged:true});
    phase='terminal-key-payload-conflict';
    const conflicted=await cancel({...rejected,p_entries:[]});check.equal(conflicted.status,409);check.equal(conflicted.data?.code,'PT409');
    check.deepEqual(await snapshot(),terminal.after);add('terminal-key-different-payload-conflict',{status:409,effectsUnchanged:true});
    for(const [label,actor,expectedStatus] of [['foreign-owner',b,403],['staff',staff,403],['anon',null,401],['service',{token:input.serviceKey},403]]){
      phase='cancel-denied-'+label;const before=await snapshot(),denied=await cancel(rejected,actor);
      check.equal(denied.status,expectedStatus);check.equal(denied.data?.code,'42501');check.deepEqual(await snapshot(),before);
      add(phase,{status:expectedStatus,effectsUnchanged:true});
    }
    const otherActor=await result(rejected,manager);check.equal(otherActor.status,200);check.deepEqual(otherActor.data,{state:'not_found'});
    add('terminal-outcome-bound-to-original-actor',{status:200});
    const malformedBefore=await snapshot(),malformed=await cancel({...rejected,p_request_id:newId(),p_entries:[{module:'users',action:'view',enabled:true,tenant_id:b.tenantId}]});
    check.equal(malformed.status,400);check.equal(malformed.data?.code,'22023');check.deepEqual(await snapshot(),malformedBefore);
    add('terminal-outcome-rejects-malformed-identity',{status:400,effectsUnchanged:true});
    const validCancelled=await request();await cancelled('valid-command-can-be-abandoned-before-dispatch',validCancelled);
    const cancelledBefore=await snapshot(),cancelledSave=await send(validCancelled);
    check.equal(cancelledSave.status,200);check.equal(cancelledSave.data?.state,'cancelled');check.deepEqual(await snapshot(),cancelledBefore);
    add('abandoned-valid-command-cannot-commit-late',{status:200,effectsUnchanged:true});
    await positive('new-key-after-confirmed-cancellation-can-save',{...validCancelled,p_request_id:newId()});
    const successful=await request(),successfulResult=await positive('success-before-cancellation',successful);
    const settledSuccess=await cancel(successful);check.equal(settledSuccess.status,200);check.deepEqual(settledSuccess.data,successfulResult.v.data);
    check.deepEqual(await snapshot(),successfulResult.after);add('cancellation-preserves-existing-success',{status:200,effectsUnchanged:true});
    const aliasCancel=await request('grants',[{module:'users',action:'edit',enabled:false},{module:'rooms',action:'view',enabled:true}]);
    const aliasResult=await cancelled('terminal-canonical-alias-and-order',aliasCancel);
    const aliasReplay=await cancel({...aliasCancel,p_entries:[{module:'rooms',action:'view',enabled:true},{module:'users',action:'update',enabled:false}]});
    check.equal(aliasReplay.status,200);check.deepEqual(aliasReplay.data,aliasResult.v.data);check.deepEqual(await snapshot(),aliasResult.after);
    add('terminal-canonical-alias-replay-no-effects',{status:200,effectsUnchanged:true});
    const hotelCancel=await request('hotels',[flags(a.hotelId.toUpperCase())]);
    const hotelTerminal=await cancelled('terminal-hotel-all-flags-identity',hotelCancel);
    const hotelReplay=await send({...hotelCancel,p_entries:[flags(a.hotelId)]});
    check.equal(hotelReplay.status,200);check.deepEqual(hotelReplay.data,hotelTerminal.v.data);check.deepEqual(await snapshot(),hotelTerminal.after);
    add('terminal-hotel-normalized-uuid-replay',{status:200,effectsUnchanged:true});
    async function waitKey(r,count){
      const until=Date.now()+5000;
      while(Date.now()<until){
        const n=(await q(`SELECT count(*)::int AS n FROM pg_locks WHERE locktype='advisory' AND NOT granted
          AND classid=((hashtextextended($1,26145640)>>32)&4294967295)::oid
          AND objid=(hashtextextended($1,26145640)&4294967295)::oid AND objsubid=1`,[a.id+':'+r.p_request_id])).rows[0].n;
        if(n===count)return;await new Promise(resolve=>setTimeout(resolve,20));
      }
      check.fail('Owned terminal-outcome advisory waiters not observed');
    }
    for(const order of ['cancel-first','save-first']){
      phase='terminal-key-race-'+order;const r=await request(),before=await snapshot(),keyBlock=await db.connect();
      let firstOperation,secondOperation;
      try{
        await keyBlock.query('BEGIN');await keyBlock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,26145640))',[a.id+':'+r.p_request_id]);
        firstOperation=order==='cancel-first'?cancel(r):send(r);await waitKey(r,1);
        secondOperation=order==='cancel-first'?send(r):cancel(r);await waitKey(r,2);
        await keyBlock.query('COMMIT');const replies=await Promise.all([firstOperation,secondOperation]),after=await snapshot();
        check(replies.every(v=>v.status===200));check.deepEqual(replies[0].data,replies[1].data);
        check.equal(replies[0].data.state,order==='cancel-first'?'cancelled':'completed');
        check.equal(after.audit.length,before.audit.length+1);
        check.equal(after.cancellations.length,before.cancellations.length+(order==='cancel-first'?1:0));
        check.equal(after.receipts.length,before.receipts.length+(order==='save-first'?1:0));
        if(order==='cancel-first')check.deepEqual(business(after),business(before));
        races.push({label:phase,actualKeyLockBarrier:true,observedWaiters:2,outcome:replies[0].data.state,passed:true});
      }finally{
        await keyBlock.query('ROLLBACK').catch(()=>{});keyBlock.release();
        await Promise.allSettled([firstOperation,secondOperation].filter(Boolean));
      }
    }
    phase='terminal-audit-rollback';
    const auditFault=await request(),auditBefore=await snapshot();
    try{
      await q(`CREATE FUNCTION private.owned_cancel_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        RAISE EXCEPTION 'OWNED_CANCEL_AUDIT_FAILURE' USING ERRCODE='22023'; END$$`);
      await q('CREATE TRIGGER owned_cancel_audit_failure BEFORE INSERT ON public.activity_logs FOR EACH ROW EXECUTE FUNCTION private.owned_cancel_audit_failure()');
      const denied=await cancel(auditFault);check.equal(denied.status,400);check.deepEqual(await snapshot(),auditBefore);
      add('terminal-audit-failure-rolls-back-cancellation',{status:400,effectsUnchanged:true});
    }finally{
      await q('DROP TRIGGER IF EXISTS owned_cancel_audit_failure ON public.activity_logs');await q('DROP FUNCTION IF EXISTS private.owned_cancel_audit_failure()');
    }
    await cancelled('terminal-audit-recovery-same-key',auditFault);
    phase='terminal-store-rollback';
    const storeFault=await request(),storeBefore=await snapshot();
    try{
      await q(`CREATE FUNCTION private.owned_cancel_store_failure() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
        RAISE EXCEPTION 'OWNED_CANCEL_STORE_FAILURE' USING ERRCODE='22023'; END$$`);
      await q('CREATE TRIGGER owned_cancel_store_failure BEFORE INSERT ON private.employee_authority_cancellations FOR EACH ROW EXECUTE FUNCTION private.owned_cancel_store_failure()');
      const denied=await cancel(storeFault);check.equal(denied.status,400);check.deepEqual(await snapshot(),storeBefore);
      add('terminal-store-failure-rolls-back-audit',{status:400,effectsUnchanged:true});
    }finally{
      await q('DROP TRIGGER IF EXISTS owned_cancel_store_failure ON private.employee_authority_cancellations');await q('DROP FUNCTION IF EXISTS private.owned_cancel_store_failure()');
    }
    await cancelled('terminal-store-recovery-same-key',storeFault);
    phase='terminal-session-expiry-after-key-wait';
    const expiryCancel=await request(),cancelBefore=await snapshot(),cancelKeyBlock=await db.connect();let pendingCancel;
    try{
      await q("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 seconds' WHERE id=$1",[sessionId]);
      await cancelKeyBlock.query('BEGIN');await cancelKeyBlock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,26145640))',[a.id+':'+expiryCancel.p_request_id]);
      pendingCancel=cancel(expiryCancel);await waitKey(expiryCancel,1);
      const until=Date.now()+5000;let expired=false;
      while(Date.now()<until){expired=(await q('SELECT not_after<=clock_timestamp() AS value FROM auth.sessions WHERE id=$1',[sessionId])).rows[0].value;
        if(expired)break;await new Promise(resolve=>setTimeout(resolve,20));}
      check.equal(expired,true);await cancelKeyBlock.query('COMMIT');const denied=await pendingCancel;
      check.equal(denied.status,403);check.equal(denied.data?.code,'42501');check.deepEqual(await snapshot(),cancelBefore);
      races.push({label:'terminal-session-expiry-after-key-wait',actualKeyLockBarrier:true,status:403,effectsUnchanged:true,passed:true});
    }finally{
      await cancelKeyBlock.query('ROLLBACK').catch(()=>{});cancelKeyBlock.release();if(pendingCancel)await pendingCancel;
      await q('UPDATE auth.sessions SET not_after=$2 WHERE id=$1',[sessionId,session.not_after]);
    }
    await cancelled('terminal-session-expiry-recovery',expiryCancel);
    complete=true;phase='complete';
  }catch(error){
    fixtureError=/^[A-Z0-9_]{2,64}$/.test(error.code??'')?error.code:'OWNED_AUTHORITY_COMMAND_CHECK_FAILED';
    failedAssertion={code:fixtureError,phase,actual:typeof error.actual==='number'||typeof error.actual==='boolean'?error.actual:null,
      expected:typeof error.expected==='number'||typeof error.expected==='boolean'?error.expected:null};
  }finally{
    if(savedCreatedBy!==undefined)await q('UPDATE public.users SET created_by=$2 WHERE id=$1',[staff.id,savedCreatedBy]);
  }
  return {contract:'roomqc.employee-authority.command-checks.v1',verified:complete,executionComplete:complete,phase,fixtureError,failedAssertion,
    checks,races,actualAuth:true,actualRest:true,syntheticAccountsOnly:true,providerEnabled:false,fullIntegratedRun:false,
    acceptance:false,legacyDirectWritesStillAvailable:complete?false:null,privilegedWriterClosureComplete:false,
    activeUiVerification:'not_exercised_by_this_api_fixture',transportResponseLossInjected:false};
}
