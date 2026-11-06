// Exact-owned synthetic normal employee edit; no external target/URL accepted.
// Concatenated into the fixed-origin hotel-scope client by the owned runner.
export async function runEmployeeProfileChecks({db,call,input,a,b,manager,department,staff,row,newId,check}) {
  const q=(sql,args=[])=>db.query(sql,args);
  const saved=await row('users',staff.id);
  const position=newId(),otherPosition=newId(),checks=[],races=[];
  const snapshot=async()=> (await q(`SELECT jsonb_build_object(
    'profile',(SELECT to_jsonb(u) FROM public.users u WHERE id=$1),
    'roles',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY role),'[]') FROM public.user_roles r WHERE user_id=$1),
    'memberships',(SELECT COALESCE(jsonb_agg(to_jsonb(h) ORDER BY hotel_id),'[]') FROM public.user_hotels h WHERE user_id=$1),
    'audit',(SELECT COALESCE(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.activity_logs l WHERE entity_id=$1),
    'receipt',(SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY request_id),'[]') FROM private.employee_profile_edit_receipts r WHERE target_id=$1),
    'permissions',(SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM public.user_permissions p WHERE user_id=$1)
    ) AS value`,[staff.id])).rows[0].value;
  const request=async(changes={},actor=manager,key=newId(),expected=undefined)=>{
    const profile=await row('users',staff.id);
    return {actor,key,body:{p_target_id:staff.id,p_changes:{
      full_name:'Owned atomic staff '+input.run,hotel_id:a.hotelId,position_id:position,reports_to:manager.id,...changes},
      p_expected_updated_at:expected===undefined?profile.updated_at:expected,p_request_id:key}};
  };
  const send=r=>call('/rest/v1/rpc/edit_employee_profile',r.actor?.token??input.publishableKey,r.body);
  const authority=s=>JSON.stringify({roles:s.roles,permissions:s.permissions});
  async function positive(label,r) {
    const before=await snapshot(),v=await send(r),after=await snapshot();
    const auditActions=after.audit.filter(log=>!before.audit.some(old=>old.id===log.id)).map(log=>log.action);
    const ok=v.status===200&&v.data?.id===staff.id&&after.profile.full_name===r.body.p_changes.full_name
      &&after.profile.reports_to===r.body.p_changes.reports_to&&authority(before)===authority(after)
      &&after.audit.length===before.audit.length+1&&after.receipt.length===before.receipt.length+1;
    const auditContractValid=auditActions.length===1&&auditActions[0]==='update';
    checks.push({label,expected:'atomic_metadata_success',status:v.status,sqlstate:v.data?.code??null,
      constraint:v.data?.message?.match(/constraint "([A-Za-z0-9_]{1,128})"/)?.[1]??null,
      authorityUnchanged:authority(before)===authority(after),profileSaved:after.profile.full_name===r.body.p_changes.full_name,
      auditDelta:after.audit.length-before.audit.length,receiptDelta:after.receipt.length-before.receipt.length,
      auditActions,passed:ok&&auditContractValid});
    check.equal(ok&&auditContractValid,true,'Owned employee positive '+label);
    return {r,v,after};
  }
  async function negative(label,r,status,code) {
    const before=await snapshot(),v=await send(r),after=await snapshot(),unchanged=JSON.stringify(before)===JSON.stringify(after);
    const ok=v.status===status&&v.data?.code===code&&unchanged;
    checks.push({label,expected:'deny_without_effects',status:v.status,sqlstate:v.data?.code??null,effectsUnchanged:unchanged,passed:ok});
    check.equal(ok,true,'Owned employee negative '+label);
  }
  async function waitBlocked(pid,count=1) {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline) {
      const rows=(await q("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'",[pid])).rows;
      if(rows.length===count)return rows.map(r=>r.pid);
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    check.fail('Owned employee lock barrier not observed');
  }
  try {
    await q("INSERT INTO public.positions(id,tenant_id,code,name,user_level_code,department,status) VALUES($1,$2,$3,'Owned edit position','staff','housekeeping','active'),($4,$5,$6,'Owned other position','staff','housekeeping','active')",
      [position,a.tenantId,'owned-edit-'+input.run,otherPosition,b.tenantId,'owned-other-edit-'+input.run]);
    await q("UPDATE public.users SET created_by=$2,position_id=$3,department='housekeeping',reports_to=$2 WHERE id=$1",[staff.id,manager.id,position]);
    await q("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'users','update',true) ON CONFLICT(user_id,module,action) DO UPDATE SET enabled=true",[manager.id,a.tenantId]);
    await q('UPDATE public.user_hotels SET can_view_reports=true WHERE user_id=$1 AND hotel_id=$2',[staff.id,a.hotelId]);
    check.equal((await q('SELECT public.can_manage_user($1,$2) AS allowed',[manager.id,staff.id])).rows[0].allowed,true);
    check.equal((await q("SELECT public.has_user_permission($1,'users','update') AS allowed",[manager.id])).rows[0].allowed,true);
    const acl=(await q(`SELECT p.prosecdef,has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
      has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
      has_function_privilege('service_role',p.oid,'EXECUTE') AS service
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname='edit_employee_profile'`)).rows[0];
    check.deepEqual(acl,{prosecdef:true,anon:false,authenticated:true,service:false});
    check.equal((await q("SELECT has_table_privilege('authenticated','private.employee_profile_edit_receipts','SELECT') AS allowed")).rows[0].allowed,false);
    const first=await positive('manager-edits-created-staff',await request());
    const firstMembership=JSON.stringify(first.after.memberships);
    const replay=await send(first.r);
    check.equal(replay.status,200);check.deepEqual(replay.data,first.v.data);check.deepEqual(await snapshot(),first.after);
    checks.push({label:'lost-response-replay',expected:'same_receipt_no_effect',status:replay.status,passed:true});
    await positive('owner-edits-tenant-staff',await request({full_name:'Owned owner edit '+input.run},a));
    check.equal(JSON.stringify((await snapshot()).memberships),firstMembership);

    const permissions=(await q("SELECT to_jsonb(p) AS value FROM public.user_permissions p WHERE user_id=$1 AND module='users' AND action IN ('update','edit')",[manager.id])).rows;
    const roleGrants=(await q("SELECT to_jsonb(rp) AS value FROM public.role_permissions rp JOIN public.roles r ON r.id=rp.role_id JOIN public.permissions p ON p.id=rp.permission_id WHERE r.code='hotel_manager' AND (r.tenant_id=$1 OR r.tenant_id='00000000-0000-0000-0000-000000000000'::uuid) AND p.module='users' AND p.action IN ('update','edit')",[a.tenantId])).rows;
    try {
      await q("DELETE FROM public.user_permissions WHERE user_id=$1 AND module='users' AND action IN ('update','edit')",[manager.id]);
      for(const r of roleGrants)await q('DELETE FROM public.role_permissions WHERE role_id=$1 AND permission_id=$2',[r.value.role_id,r.value.permission_id]);
      check.equal((await q("SELECT public.has_user_permission($1,'users','update') AS allowed",[manager.id])).rows[0].allowed,false);
      await negative('manager-without-users-update-capability',await request(),403,'42501');
    } finally {
      for(const p of permissions)await q('INSERT INTO public.user_permissions SELECT (jsonb_populate_record(NULL::public.user_permissions,$1::jsonb)).*',[JSON.stringify(p.value)]);
      for(const r of roleGrants)await q('INSERT INTO public.role_permissions SELECT (jsonb_populate_record(NULL::public.role_permissions,$1::jsonb)).*',[JSON.stringify(r.value)]);
    }

    const tenant=(await q('SELECT is_read_only,subscription_status,trial_ends_at,subscription_end_date FROM public.tenants WHERE id=$1',[a.tenantId])).rows[0];
    try {
      await q('UPDATE public.tenants SET is_read_only=true WHERE id=$1',[a.tenantId]);
      await negative('read-only-tenant',await request(),403,'42501');
      await q("UPDATE public.tenants SET is_read_only=false,subscription_status='suspended' WHERE id=$1",[a.tenantId]);
      await negative('suspended-tenant',await request(),403,'42501');
    } finally {
      await q('UPDATE public.tenants SET is_read_only=$2,subscription_status=$3,trial_ends_at=$4,subscription_end_date=$5 WHERE id=$1',
        [a.tenantId,tenant.is_read_only,tenant.subscription_status,tenant.trial_ends_at,tenant.subscription_end_date]);
    }

    await negative('stale-version',await request({},manager,newId(),first.r.body.p_expected_updated_at),409,'PT409');
    const conflict={...first.r,body:{...first.r.body,p_changes:{...first.r.body.p_changes,full_name:'Owned conflict'}}};
    await negative('same-key-different-payload',conflict,409,'PT409');
    await negative('invalid-position',await request({position_id:otherPosition}),400,'22023');
    await negative('manager-unassigned-hotel',await request({hotel_id:a.secondHotelId}),403,'42501');
    await negative('other-tenant-owner',await request({},b),403,'42501');
    await negative('staff-cannot-edit-managed-profile',await request({},staff),403,'42501');
    const field=await request();field.body.p_changes.role='owner';
    await negative('reject-role-field',field,400,'22023');
    await negative('invalid-self-supervisor',await request({reports_to:staff.id}),400,'22023');
    await negative('invalid-name',await request({full_name:'x'}),400,'22023');

    const lockBefore=(await row('users',manager.id)).account_locked;
    await q('UPDATE public.users SET account_locked=true WHERE id=$1',[manager.id]);
    try { await negative('locked-manager',await request(),403,'42501') }
    finally { await q('UPDATE public.users SET account_locked=$2 WHERE id=$1',[manager.id,lockBefore]) }
    await positive('manager-unlocked-recovery',await request({full_name:'Owned recovered '+input.run}));

    // Exact-owned schema fault; removal in finally restores the frozen schema.
    await q(`CREATE FUNCTION private.roomqc_employee_edit_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fault$
      BEGIN RAISE EXCEPTION 'Owned audit fault' USING ERRCODE='23514'; END; $fault$;
      CREATE TRIGGER roomqc_employee_edit_fault BEFORE INSERT ON public.activity_logs FOR EACH ROW
      WHEN (NEW.entity_id='${staff.id}'::uuid) EXECUTE FUNCTION private.roomqc_employee_edit_fault();`);
    try { await negative('audit-failure-rolls-back-profile-membership-receipt',await request({hotel_id:a.secondHotelId,reports_to:null},a),400,'23514') }
    finally { await q('DROP TRIGGER roomqc_employee_edit_fault ON public.activity_logs; DROP FUNCTION private.roomqc_employee_edit_fault()') }

    const transferred=await positive('owner-primary-hotel-transfer',await request({hotel_id:a.secondHotelId,reports_to:null},a));
    check.equal(transferred.after.memberships.some(h=>h.hotel_id===a.hotelId),false);
    check.equal(transferred.after.memberships.find(h=>h.hotel_id===a.secondHotelId)?.can_view_reports,true);
    await positive('owner-primary-hotel-transfer-back',await request({reports_to:manager.id},a));

    const same=await request({full_name:'Owned concurrent retry '+input.run}),sameBefore=await snapshot();
    const parallel=await Promise.all([send(same),send(same)]),sameAfter=await snapshot();
    check(parallel.every(v=>v.status===200));check.deepEqual(parallel[0].data,parallel[1].data);
    check.equal(sameAfter.audit.length,sameBefore.audit.length+1);check.equal(sameAfter.receipt.length,sameBefore.receipt.length+1);
    checks.push({label:'two-tab-same-request',expected:'one_commit_one_receipt',observed:2,passed:true});

    const current=(await row('users',staff.id)).updated_at;
    const edits=await Promise.all([request({full_name:'Owned race first'},manager,newId(),current),request({full_name:'Owned race second'},manager,newId(),current)]);
    const editBefore=await snapshot(),editResults=await Promise.all(edits.map(send)),editAfter=await snapshot();
    check.deepEqual(editResults.map(v=>v.status).sort(),[200,409]);
    check.equal(editAfter.audit.length,editBefore.audit.length+1);check.equal(editAfter.receipt.length,editBefore.receipt.length+1);
    checks.push({label:'two-edits-same-version',expected:'one_commit_one_conflict',observed:2,passed:true});

    for(const state of ['locked','deleted-session'])for(const order of ['revoke-first','mutation-first']) {
      const r=await request({full_name:'Owned fenced '+state+' '+order}),before=await snapshot();
      const sessionId=JSON.parse(Buffer.from(manager.token.split('.')[1],'base64url').toString()).session_id;
      const savedSession=(await q('SELECT to_jsonb(s) AS value FROM auth.sessions s WHERE id=$1 AND user_id=$2',[sessionId,manager.id])).rows[0].value;
      const blocker=await db.connect(),revoker=await db.connect();let mutation,revokePromise,barrier=false,second=false;
      const revoke=c=>state==='locked'?c.query('UPDATE public.users SET account_locked=true WHERE id=$1',[manager.id]):
        c.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,manager.id]);
      try {
        await blocker.query('BEGIN');const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
        if(order==='revoke-first') {
          await revoke(blocker);mutation=send(r);await waitBlocked(pid);barrier=true;await blocker.query('COMMIT');
        } else {
          await blocker.query('SELECT 1 FROM public.users WHERE id=$1 FOR UPDATE',[staff.id]);
          mutation=send(r);const [mutPid]=await waitBlocked(pid);barrier=true;
          await revoker.query('BEGIN');revokePromise=revoke(revoker);await waitBlocked(mutPid);second=true;
          await blocker.query('COMMIT');
        }
        const v=await mutation;
        if(revokePromise){await revokePromise;await revoker.query('COMMIT')}
        const after=await snapshot(),allowed=order==='mutation-first';
        check.equal(v.status,allowed?200:403);
        if(allowed){check.equal(after.audit.length,before.audit.length+1);check.equal(after.profile.full_name,r.body.p_changes.full_name)}
        else check.deepEqual(after,before);
        await negative('next-request-denied-'+state+'-'+order,await request(),403,'42501');
        races.push({state,order,status:v.status,actorBarrier:barrier,secondBarrier:second,passed:true});
      } finally {
        await blocker.query('ROLLBACK').catch(()=>{});
        if(revokePromise)await revokePromise.catch(()=>{});
        await revoker.query('ROLLBACK').catch(()=>{});blocker.release();revoker.release();
        if(state==='locked')await q('UPDATE public.users SET account_locked=$2 WHERE id=$1',[manager.id,lockBefore]);
        else if((await q('SELECT 1 FROM auth.sessions WHERE id=$1',[sessionId])).rowCount===0)
          await q('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).*',[JSON.stringify(savedSession)]);
      }
      await positive('recovery-'+state+'-'+order,await request({full_name:'Owned recovery '+state+' '+order}));
    }
    const edgeAdapter=await runEmployeeUpdateAdapterChecks({db,call,input,a,b,manager,staff,row,newId,check,position,otherPosition});
    return {contractVersion:2,verified:checks.every(c=>c.passed)&&races.length===4&&races.every(r=>r.passed)&&edgeAdapter.verified,
      actualRest:true,actualAuth:true,fixture:'manager-edits-created-staff',baselinePartialCommitResolved:true,
      checks,races,edgeAdapter,fullEmployeeAuthorityMatrix:false,browserAndroidE2e:false};
  } catch(error) {
    return {contractVersion:2,verified:false,incomplete:true,actualRest:true,actualAuth:true,
      checks,races,setupErrorCode:typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:null,
      fullEmployeeAuthorityMatrix:false,browserAndroidE2e:false};
  } finally {
    await q('UPDATE public.users SET full_name=$2,created_by=$3,position_id=$4,department=$5,reports_to=$6,hotel_id=$7 WHERE id=$1',
      [staff.id,saved.full_name,saved.created_by,saved.position_id,saved.department,saved.reports_to,saved.hotel_id]);
    await q('DELETE FROM public.positions WHERE id=ANY($1::uuid[])',[[position,otherPosition]]);
  }
}

// Executes the actual bundled update-user entrypoint, using only the caller's
// JWT and public API key. The owned Edge service has no admin/DB/signing key.
async function runEmployeeUpdateAdapterChecks({db,call,input,a,b,manager,staff,row,newId,check,position,otherPosition}){
  const q=(sql,args=[])=>db.query(sql,args),checks=[],races=[];let phase='adapter-start';
  const record=(label,details,passed)=>{phase=label;checks.push({label,...details,passed:!!passed});check.equal(!!passed,true,label)};
  const snapshot=async()=> (await q(`SELECT jsonb_build_object(
    'profiles',(SELECT coalesce(jsonb_agg(to_jsonb(u) ORDER BY id),'[]') FROM public.users u WHERE tenant_id=ANY($1::uuid[])),
    'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY user_id,role),'[]') FROM public.user_roles r WHERE user_id IN (SELECT id FROM public.users WHERE tenant_id=ANY($1::uuid[]))),
    'memberships',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY user_id,hotel_id),'[]') FROM public.user_hotels h WHERE user_id IN (SELECT id FROM public.users WHERE tenant_id=ANY($1::uuid[]))),
    'permissions',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY id),'[]') FROM public.user_permissions p WHERE tenant_id=ANY($1::uuid[])),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY id),'[]') FROM public.activity_logs l WHERE tenant_id=ANY($1::uuid[])),
    'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY actor_id,request_id),'[]') FROM private.employee_profile_edit_receipts r WHERE tenant_id=ANY($1::uuid[])),
    'versions',(SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY target_id,kind),'[]') FROM private.employee_authority_versions v WHERE target_id IN (SELECT id FROM public.users WHERE tenant_id=ANY($1::uuid[])))
    ) value`,[[a.tenantId,b.tenantId]])).rows[0].value;
  const request=async(extra={})=>({protocolVersion:1,userId:staff.id,fullName:'Owned Edge staff '+input.run,
    hotelId:a.hotelId,positionId:position,reportsTo:manager.id,expectedUpdatedAt:(await row('users',staff.id)).updated_at,
    requestId:newId(),...extra});
  const edge=async(body,actor=manager,method='POST',raw=false)=>{
    const response=await fetch('http://employee-update-test:9000/functions/v1/update-user',{method,signal:AbortSignal.timeout(20000),
      headers:{'content-type':'application/json',Origin:'http://127.0.0.1:8082',...(actor?{authorization:'Bearer '+actor.token}:{})},
      ...(method==='POST'?{body:raw?body:JSON.stringify(body)}:{})});
    check.equal(response.headers.get('cache-control'),'no-store');
    check.equal(response.headers.get('access-control-allow-origin'),'http://127.0.0.1:8082');
    return {status:response.status,data:await response.json()};
  };
  const deny=async(label,body,actor,status,method='POST',raw=false)=>{
    phase=label;const before=await snapshot(),v=await edge(body,actor,method,raw),after=await snapshot();
    const unchanged=JSON.stringify(before)===JSON.stringify(after);
    record(label,{status:v.status,expectedStatus:status,effectsUnchanged:unchanged},v.status===status&&v.data?.success===false&&unchanged);
    return v;
  };
  const positive=async(label,body,actor=manager)=>{
    phase=label;const before=await snapshot(),v=await edge(body,actor),after=await snapshot();
    record(label,{status:v.status,auditDelta:after.audit.length-before.audit.length,receiptDelta:after.receipts.length-before.receipts.length},
      v.status===200&&v.data?.success===true&&v.data.user?.id===staff.id&&v.data.user.full_name===body.fullName
      &&after.audit.length===before.audit.length+1&&after.receipts.length===before.receipts.length+1
      &&JSON.stringify(before.roles)===JSON.stringify(after.roles)&&JSON.stringify(before.permissions)===JSON.stringify(after.permissions));
    return {v,after};
  };
  const rpc=body=>({p_target_id:body.userId,p_changes:{full_name:body.fullName,hotel_id:body.hotelId,position_id:body.positionId,reports_to:body.reportsTo},
    p_expected_updated_at:body.expectedUpdatedAt,p_request_id:body.requestId});
  const waitBlocked=async(pid)=>{
    const deadline=Date.now()+5000;
    while(Date.now()<deadline){if((await q("SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'",[pid])).rowCount>0)return;
      await new Promise(resolve=>setTimeout(resolve,20));}check.fail('Owned Edge request did not reach the actual DB lock');
  };
  try{
    const firstBody=await request(),first=await positive('edge-manager-atomic-edit',firstBody);
    for(let i=0;i<20;i++){const replay=await edge(firstBody);check.equal(replay.status,200);check.deepEqual(replay.data,first.v.data);}
    record('edge-replay20-and-discarded-response-recovery',{replays:20,effectsUnchanged:JSON.stringify(await snapshot())===JSON.stringify(first.after)},
      JSON.stringify(await snapshot())===JSON.stringify(first.after));
    await deny('edge-key-conflict',{...firstBody,fullName:'Owned different payload'},manager,409);
    await deny('edge-stale-version',{...firstBody,requestId:newId()},manager,409);
    await positive('edge-owner-atomic-edit',await request({fullName:'Owned owner Edge '+input.run}),a);
    for(const field of ['userLevelCode','role','status','phone','departments'])
      await deny('edge-rejects-legacy-'+field,{...await request(),[field]:'owner'},a,409);
    await deny('edge-rejects-unversioned-request',{userId:staff.id,fullName:'Owned legacy',status:'suspended'},a,409);
    const noKey=await request();delete noKey.requestId;await deny('edge-requires-stable-key',noKey,a,400);
    await deny('edge-rejects-client-tenant',{...await request(),tenantId:b.tenantId},a,400);
    await deny('edge-rejects-foreign-position',await request({positionId:otherPosition}),a,400);
    await deny('edge-no-bearer',await request(),null,401);
    await deny('edge-anonymous-token',await request(),{token:input.publishableKey},401);
    await deny('edge-service-token',await request(),{token:input.serviceKey},403);
    await deny('edge-foreign-owner',await request(),b,403);
    await deny('edge-staff',await request(),staff,403);
    await deny('edge-protected-owner-target',await request({userId:a.id}),a,403);
    await deny('edge-manager-unassigned-hotel',await request({hotelId:a.secondHotelId}),manager,403);
    await deny('edge-unsupported-method',null,a,405,'GET');
    await deny('edge-malformed-json','{',a,400,'POST',true);
    await deny('edge-oversized-body',await request({fullName:'x'.repeat(17000)}),a,413);
    const same=await request({fullName:'Owned Edge and REST race '+input.run}),beforeSame=await snapshot();
    const together=await Promise.all([edge(same),call('/rest/v1/rpc/edit_employee_profile',manager.token,rpc(same))]);
    const afterSame=await snapshot();
    check.deepEqual(together[0].data.user,together[1].data);
    record('edge-and-rest-same-key-one-commit',{statuses:together.map(v=>v.status),auditDelta:afterSame.audit.length-beforeSame.audit.length},
      together.every(v=>v.status===200)
      &&afterSame.audit.length===beforeSame.audit.length+1&&afterSame.receipts.length===beforeSame.receipts.length+1);
    const base=await request(),beforeEditors=await snapshot();
    const editors=await Promise.all([edge({...base,fullName:'Owned Edge first'}),edge({...base,requestId:newId(),fullName:'Owned Edge second'})]);
    const afterEditors=await snapshot();record('edge-two-editors-one-version',{statuses:editors.map(v=>v.status).sort()},
      JSON.stringify(editors.map(v=>v.status).sort())==='[200,409]'&&afterEditors.audit.length===beforeEditors.audit.length+1&&afterEditors.receipts.length===beforeEditors.receipts.length+1);
    for(const fault of ['audit','receipt']){
      const body=await request(),table=fault==='audit'?'public.activity_logs':'private.employee_profile_edit_receipts';
      try{
        await q(`CREATE FUNCTION private.owned_edge_edit_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$BEGIN RAISE EXCEPTION 'Owned Edge fault' USING ERRCODE='23514'; END;$$`);
        await q(`CREATE TRIGGER owned_edge_edit_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_edge_edit_fault()`);
        await deny('edge-'+fault+'-failure-atomic-rollback',body,manager,502);
      }finally{
        await q(`DROP TRIGGER IF EXISTS owned_edge_edit_fault ON ${table}`);await q('DROP FUNCTION IF EXISTS private.owned_edge_edit_fault()');
      }
      await positive('edge-'+fault+'-failure-recovery-same-key',body);
    }
    const sessionId=JSON.parse(Buffer.from(manager.token.split('.')[1],'base64url').toString()).session_id;
    const savedSession=(await q('SELECT to_jsonb(s) value FROM auth.sessions s WHERE id=$1 AND user_id=$2',[sessionId,manager.id])).rows[0].value;
    try{
      await q('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,manager.id]);
      await deny('edge-revoked-native-session',await request(),manager,403);
    }finally{await q('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).*',[JSON.stringify(savedSession)])}
    const savedTenant=(await q('SELECT subscription_status,trial_ends_at FROM public.tenants WHERE id=$1',[a.tenantId])).rows[0];
    for(const window of ['key','target','position','replay-key','trial-position']){
      const expiryBody=await request(),completed=window==='replay-key'?await positive('edge-pre-expiry-completed-receipt',expiryBody):null;
      const beforeExpiry=await snapshot(),block=await db.connect();let pending;
      phase='edge-expiry-after-'+window+'-wait';
      try{
        if(window==='trial-position')await q("UPDATE public.tenants SET subscription_status='trial',trial_ends_at=clock_timestamp()+interval '2 seconds' WHERE id=$1",[a.tenantId]);
        else await q("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '2 seconds' WHERE id=$1 AND user_id=$2",[sessionId,manager.id]);
        await block.query('BEGIN');const pid=(await block.query('SELECT pg_backend_pid() pid')).rows[0].pid;
        if(window.includes('key'))await block.query('SELECT pg_advisory_xact_lock(hashtextextended($1,21133739))',[manager.id+':'+expiryBody.requestId]);
        else if(window==='target')await block.query('SELECT 1 FROM public.users WHERE id=$1 FOR UPDATE',[staff.id]);
        else await block.query('SELECT 1 FROM public.positions WHERE id=$1 FOR UPDATE',[position]);
        pending=edge(expiryBody);await waitBlocked(pid);
        let expired=false;const deadline=Date.now()+6000;
        while(Date.now()<deadline){expired=window==='trial-position'
          ?(await q('SELECT trial_ends_at<=clock_timestamp() expired FROM public.tenants WHERE id=$1',[a.tenantId])).rows[0].expired
          :(await q('SELECT not_after<=clock_timestamp() expired FROM auth.sessions WHERE id=$1',[sessionId])).rows[0].expired;
          if(expired)break;await new Promise(resolve=>setTimeout(resolve,20));}
        check.equal(expired,true);await block.query('COMMIT');const v=await pending,after=await snapshot();
        const unchanged=JSON.stringify(beforeExpiry)===JSON.stringify(after);
        races.push({label:phase,status:v.status,actualDbLockBarrier:true,expiryObserved:true,effectsUnchanged:unchanged,passed:v.status===403&&unchanged});
        check.equal(v.status,403,'Expired session/trial must not save or replay after its actual DB lock wait');check.equal(unchanged,true);
      }finally{
        await block.query('ROLLBACK').catch(()=>{});block.release();if(pending)await pending.catch(()=>{});
        if(window==='trial-position')await q('UPDATE public.tenants SET subscription_status=$2,trial_ends_at=$3 WHERE id=$1',[a.tenantId,savedTenant.subscription_status,savedTenant.trial_ends_at]);
        else await q('UPDATE auth.sessions SET not_after=$2 WHERE id=$1',[sessionId,savedSession.not_after]);
      }
      if(completed){
        const recovered=await edge(expiryBody);check.deepEqual(recovered,completed.v);
        record('edge-replay-after-session-restored',{status:recovered.status,effectsUnchanged:JSON.stringify(await snapshot())===JSON.stringify(beforeExpiry)},JSON.stringify(await snapshot())===JSON.stringify(beforeExpiry));
      }else await positive('edge-expiry-recovery-'+window+'-same-key',expiryBody);
    }
    return {verified:checks.every(x=>x.passed)&&races.every(x=>x.passed),phase:'complete',checks,races,
      actualEdge:true,actualAuth:true,actualRest:true,noServiceKeyInAdapter:true,externalDeploymentInventoryComplete:false};
  }catch(error){return {verified:false,phase,checks,races,failedAssertion:{
    actual:typeof error.actual==='number'||typeof error.actual==='boolean'?error.actual:null,
    expected:typeof error.expected==='number'||typeof error.expected==='boolean'?error.expected:null},
    actualEdge:true,actualAuth:true,actualRest:true,externalDeploymentInventoryComplete:false};}
}
