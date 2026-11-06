// Bounded authority/race inventory, executed only inside the owned backend.
// Installer-created invitations are explicit fixtures; native password setup
// and all operations under test use the actual fixed internal HTTP endpoints.
export async function runInvitationAuthorityChecks({db,input,call,account,edge}) {
  const checks=[],races=[];let phase='fixtures',complete=false,failedLabel=null,errorCode=null;
  const levels=['manager','department_manager','staff'];
  const roleCases=['tenant_owner','manager','department_manager','staff'].flatMap(role=>levels.map(level=>role+'-to-'+level));
  const faultCases=['position-inactive','inviter-inactive','inviter-locked','inviter-deleted',
    'inviter-unconfirmed','inviter-banned','inviter-role-removed','inviter-assignment-removed','inviter-capability-removed',
    'department-changed','report-inactive','report-locked','report-deleted','report-unconfirmed','report-banned',
    'report-role-removed','report-assignment-removed','tenant-unapproved','hotel-inactive'];
  const expected=[...roleCases,...faultCases,'accept-manager','accept-department_manager','accept-staff'];
  const expectedRaces=['accept-before-revoke','revoke-before-accept','password-before-revoke',
    'revoke-before-password','accept-before-password','password-before-accept'];
  const record=(label,details,passed)=>{failedLabel=label;checks.push({label,...details,passed:Boolean(passed)});
    if(!passed)throw Object.assign(new Error('Owned authority assertion'),{code:'OWNED_INVITATION_AUTHORITY_ASSERTION'});};
  const session=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
  let tenant,hotel,position,managerPosition,owner,manager,department,staff,template;
  const ids=[];
  const manage=(user,action,payload)=>call('/rest/v1/rpc/staff_invitation_manage',input.serviceKey,{
    p_actor:user.id,p_session:user.sessionId,p_action:action,p_payload:payload});
  const snapshot=async()=>JSON.stringify((await db.query(`SELECT jsonb_build_object(
    'invitations',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.staff_invitations i WHERE tenant_id=$1),
    'profiles',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u WHERE tenant_id=$1),
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY user_id,role) FROM public.user_roles r WHERE user_id=ANY($2::uuid[])),
    'memberships',(SELECT jsonb_agg(to_jsonb(h) ORDER BY user_id,hotel_id) FROM public.user_hotels h WHERE user_id=ANY($2::uuid[])),
    'usage',(SELECT to_jsonb(u) FROM public.tenant_usage u WHERE tenant_id=$1),
    'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.activity_logs a WHERE tenant_id=$1),
    'passwordReceipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM private.password_change_receipts r WHERE actor_id=ANY($2::uuid[])),
    'auth',(SELECT jsonb_agg(jsonb_build_object('id',id,'password',encrypted_password) ORDER BY id) FROM auth.users WHERE id=ANY($2::uuid[])),
    'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM auth.sessions s WHERE user_id=ANY($2::uuid[]))) value`,[tenant,ids])).rows[0].value);
  const take=async label=>{const u=await account('authority-'+label);ids.push(u.id);return u;};
  const accept=(u,i)=>edge(u,{action:'accept',invitationId:i.id,tenantId:tenant});
  const pending=async(u,i)=>{const r=await edge(u,{action:'status',invitationId:i.id,tenantId:tenant});
    if(r.status!==200||r.data?.status!=='pending')throw Object.assign(new Error('Owned pending control'),{code:'OWNED_INVITATION_PENDING_CONTROL'});};
  async function nativePassword(u) {
    const generated=await call('/auth/v1/admin/generate_link',input.serviceKey,{type:'recovery',email:u.email});
    if(generated.status!==200)throw new Error('Owned link');
    const verified=await call('/auth/v1/verify',input.publishableKey,{token_hash:generated.data.hashed_token,type:'recovery'});
    if(verified.status!==200)throw new Error('Owned verify');
    u.token=verified.data.access_token;u.sessionId=session(u.token);
    const next='OwnedAuthority!'+crypto.randomUUID(),id=crypto.randomUUID();
    const r=await call('/auth/v1/user',u.token,{password:next,roomqc_password_change_id:id},'PUT');
    if(r.status!==200)throw Object.assign(new Error('Owned password setup'),{code:'OWNED_INVITATION_PASSWORD_SETUP'});
    u.password=next;
    if((await db.query('SELECT count(*)::int n FROM private.password_change_receipts WHERE id=$1 AND actor_id=$2 AND session_id=$3',
      [id,u.id,u.sessionId])).rows[0].n!==1)throw new Error('Owned native receipt');
  }
  async function candidate(label,{level='staff',inviter=owner,report=null}={}) {
    const user=await take(label),id=crypto.randomUUID();
    // The invitation volume is installer-owned, not email or a bypass of the
    // production create-rate limiter. Each test has a separate native identity.
    const i=(await db.query(`INSERT INTO public.staff_invitations
      SELECT (jsonb_populate_record(NULL::public.staff_invitations,to_jsonb(i)||jsonb_build_object(
        'id',$2::uuid,'email',$3::text,'auth_user_id',$4::uuid,'invited_by',$5::uuid,'reports_to',$6::uuid,
        'user_level_code',$7::text,'position_id',$8::uuid,'sent_at',NULL,'password_set_at',NULL,
        'status','pending','accepted_at',NULL,'created_at',now()-interval '1 day','expires_at',now()+interval '1 day'))).*
      FROM public.staff_invitations i WHERE id=$1 RETURNING *`,
      [template.id,id,user.email,user.id,inviter.id,report?.id??null,level,level==='staff'?position:managerPosition])).rows[0];
    if(!i)throw new Error('Owned fixture');await nativePassword(user);await pending(user,i);return {user,invitation:i};
  }
  async function waitBlocked(pid,count=1) {
    for(let n=0;n<160;n++){
      const rows=(await db.query(`WITH RECURSIVE blocked(pid,path) AS (
        SELECT pid,ARRAY[$1::int,pid] FROM pg_stat_activity WHERE $1::int=ANY(pg_blocking_pids(pid))
        UNION ALL SELECT a.pid,b.path||a.pid FROM pg_stat_activity a JOIN blocked b
          ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE NOT a.pid=ANY(b.path))
        SELECT DISTINCT pid FROM blocked ORDER BY pid`,[pid])).rows;
      if(rows.length>=count)return rows.map(x=>x.pid);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw Object.assign(new Error('Owned invitation barrier not observed'),{code:'OWNED_INVITATION_BARRIER'});
  }
  const effects=async(u,i)=>(await db.query(`SELECT
    (SELECT count(*)::int FROM public.users WHERE id=$1) profiles,
    (SELECT count(*)::int FROM public.user_roles WHERE user_id=$1) roles,
    (SELECT count(*)::int FROM public.user_hotels WHERE user_id=$1) memberships,
    (SELECT count(*)::int FROM private.password_change_receipts WHERE actor_id=$1) receipts,
    (SELECT count(*)::int FROM public.activity_logs WHERE entity_id IN ($1,$2)) audit,
    (SELECT encrypted_password FROM auth.users WHERE id=$1) hash,
    (SELECT status FROM public.staff_invitations WHERE id=$2) status`,[u.id,i.id])).rows[0];
  const barrierCleanup=()=>db.query(`DROP TRIGGER IF EXISTS roomqc_invitation_authority_barrier ON public.staff_invitations;
    DROP TRIGGER IF EXISTS roomqc_invitation_password_barrier ON auth.users;
    DROP FUNCTION IF EXISTS private.roomqc_invitation_authority_barrier();
    DROP FUNCTION IF EXISTS private.roomqc_invitation_password_barrier();`);
  try {
    owner=await take('owner');
    const provision=await call('/rest/v1/rpc/provision_workspace_registration',input.serviceKey,{p_workspace_id:crypto.randomUUID(),p_owner_id:owner.id,
      p_fields:{fullName:'Owned authority owner',phone:'0901234567',tenantName:'Owned authority fixture',hotelName:'Owned authority hotel',
        hotelAddress:'123 Fixture Road',hotelPhone:'0281234567',hotelEmail:owner.email,totalRooms:3}});
    if(provision.status!==200||provision.data?.success!==true)throw new Error('Owned provision');
    tenant=provision.data.tenant_id;hotel=provision.data.hotel_id;position=crypto.randomUUID();managerPosition=crypto.randomUUID();
    const plan=(await db.query(`INSERT INTO public.subscription_plans
      SELECT (jsonb_populate_record(NULL::public.subscription_plans,to_jsonb(sp)||jsonb_build_object(
        'id',gen_random_uuid(),'code',$2::text,'name','Owned authority plan','max_users',128))).*
      FROM public.tenants t JOIN public.subscription_plans sp ON sp.id=t.subscription_plan_id WHERE t.id=$1 RETURNING id`,
      [tenant,'owned-authority-'+input.run])).rows[0];
    await db.query("UPDATE public.tenants SET approval_status='approved',subscription_plan_id=$2 WHERE id=$1",[tenant,plan.id]);
    await db.query(`INSERT INTO public.positions(id,tenant_id,code,name,user_level_code,department,status) VALUES
      ($1,$3,$4,'Owned authority staff','staff','housekeeping','active'),
      ($2,$3,$5,'Owned authority manager','manager','housekeeping','active')`,
      [position,managerPosition,tenant,'owned-as-'+input.run,'owned-am-'+input.run]);
    async function actor(level,role) {
      const u=await take(level);
      await db.query(`INSERT INTO public.users(id,tenant_id,hotel_id,full_name,email,role,user_level_code,department,status,created_by,
        position_id,must_change_password,is_super_admin,is_primary_owner,account_locked)
        VALUES($1,$2,$3,'Owned authority actor',$4,$5,$6,'housekeeping','active',$7,$8,false,false,false,false)`,
        [u.id,tenant,hotel,u.email,role,level,owner.id,level==='staff'?position:managerPosition]);
      await db.query('INSERT INTO public.user_roles(user_id,role,created_by) VALUES($1,$2,$3)',[u.id,role,owner.id]);
      await db.query(`INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by,can_create_managers,can_create_staff)
        VALUES($1,$2,$3,$4,$5)`,[u.id,hotel,owner.id,level==='manager',level!=='staff']);return u;
    }
    manager=await actor('manager','hotel_manager');department=await actor('department_manager','department_manager');staff=await actor('staff','staff');
    phase='role-level-matrix';
    for(const [role,user] of [['tenant_owner',owner],['manager',manager],['department_manager',department],['staff',staff]])for(const level of levels){
      const label=role+'-to-'+level,allowed=role==='tenant_owner'||role==='manager'&&level!=='manager'||role==='department_manager'&&level==='staff';
      const payload={tenantId:tenant,hotelId:hotel,positionId:level==='staff'?position:managerPosition,
        email:'authority-'+input.run+'-'+label+'@roomqc.invalid',fullName:'Owned matrix recipient',userLevelCode:level};
      const before=await snapshot(),result=await manage(user,'create',payload),unchanged=before===await snapshot();
      record(label,{status:result.status,allowed,effectsUnchanged:unchanged},allowed?
        result.status===200&&result.data?.invitation?.user_level_code===level&&!unchanged:result.status===403&&unchanged);
      if(role==='tenant_owner'&&level==='staff')template=result.data.invitation;
    }
    phase='acceptance-authority';
    const mutation={
      'position-inactive':["UPDATE public.positions SET status='inactive' WHERE id=$1","UPDATE public.positions SET status='active' WHERE id=$1",()=>[position]],
      'inviter-inactive':["UPDATE public.users SET status='inactive' WHERE id=$1","UPDATE public.users SET status='active' WHERE id=$1",()=>[owner.id]],
      'inviter-locked':['UPDATE public.users SET account_locked=true WHERE id=$1','UPDATE public.users SET account_locked=false WHERE id=$1',()=>[owner.id]],
      'inviter-deleted':['UPDATE public.users SET deleted_at=now() WHERE id=$1','UPDATE public.users SET deleted_at=NULL WHERE id=$1',()=>[owner.id]],
      'inviter-unconfirmed':['UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1','UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',()=>[owner.id]],
      'inviter-banned':["UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1",'UPDATE auth.users SET banned_until=NULL WHERE id=$1',()=>[owner.id]],
      'inviter-capability-removed':['UPDATE public.user_hotels SET can_create_staff=false WHERE user_id=$1 AND hotel_id=$2','UPDATE public.user_hotels SET can_create_staff=true WHERE user_id=$1 AND hotel_id=$2',()=>[manager.id,hotel]],
      'department-changed':["UPDATE public.positions SET department='maintenance' WHERE id=$1","UPDATE public.positions SET department='housekeeping' WHERE id=$1",()=>[position]],
      'report-inactive':["UPDATE public.users SET status='inactive' WHERE id=$1","UPDATE public.users SET status='active' WHERE id=$1",()=>[manager.id]],
      'report-locked':['UPDATE public.users SET account_locked=true WHERE id=$1','UPDATE public.users SET account_locked=false WHERE id=$1',()=>[manager.id]],
      'report-deleted':['UPDATE public.users SET deleted_at=now() WHERE id=$1','UPDATE public.users SET deleted_at=NULL WHERE id=$1',()=>[manager.id]],
      'report-unconfirmed':['UPDATE auth.users SET email_confirmed_at=NULL WHERE id=$1','UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1',()=>[manager.id]],
      'report-banned':["UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=$1",'UPDATE auth.users SET banned_until=NULL WHERE id=$1',()=>[manager.id]],
      'tenant-unapproved':["UPDATE public.tenants SET approval_status='pending' WHERE id=$1","UPDATE public.tenants SET approval_status='approved' WHERE id=$1",()=>[tenant]],
      'hotel-inactive':["UPDATE public.hotels SET status='inactive' WHERE id=$1","UPDATE public.hotels SET status='active' WHERE id=$1",()=>[hotel]],
    };
    for(const label of faultCases){
      failedLabel=label;
      const isManager=['inviter-assignment-removed','inviter-capability-removed'].includes(label),isDepartment=label==='department-changed';
      const c=await candidate(label,{inviter:isManager?manager:isDepartment?department:owner,report:label.startsWith('report-')?manager:null});
      let restore;
      if(label.endsWith('role-removed')||label.endsWith('assignment-removed')){
        const u=label.startsWith('report-')||isManager?manager:owner,table=label.endsWith('role-removed')?'user_roles':'user_hotels';
        const rows=(await db.query('SELECT to_jsonb(r) value FROM public.'+table+' r WHERE user_id=$1',[u.id])).rows;
        await db.query('DELETE FROM public.'+table+' WHERE user_id=$1',[u.id]);
        restore=async()=>{for(const row of rows)await db.query('INSERT INTO public.'+table+' SELECT (jsonb_populate_record(NULL::public.'+table+',$1::jsonb)).*',[JSON.stringify(row.value)]);};
      }else{
        const [apply,undo,params]=mutation[label];await db.query(apply,params());restore=()=>db.query(undo,params());
      }
      let denied,unchanged;
      try{const before=await snapshot();denied=await accept(c.user,c.invitation);unchanged=before===await snapshot();}
      finally{await restore();}
      const recovery=await accept(c.user,c.invitation),after=await effects(c.user,c.invitation);
      record(label,{status:denied.status,effectsUnchanged:unchanged,recoveryStatus:recovery.status,
        recoveryProfile:after.profiles,recoveryRole:after.roles,recoveryMembership:after.memberships},
        [403,409].includes(denied.status)&&unchanged&&recovery.status===200&&recovery.data?.idempotent===false
          &&after.status==='accepted'&&after.profiles===1&&after.roles===1&&after.memberships===1);
    }
    for(const level of levels){
      const c=await candidate('level-'+level,{level}),result=await accept(c.user,c.invitation),after=await effects(c.user,c.invitation);
      record('accept-'+level,{status:result.status,profiles:after.profiles,roles:after.roles,memberships:after.memberships},
        result.status===200&&result.data?.idempotent===false&&after.profiles===1&&after.roles===1&&after.memberships===1);
    }
    phase='observed-cross-operation-races';
    await db.query(`CREATE FUNCTION private.roomqc_invitation_authority_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $b$
      BEGIN IF NEW.tenant_id='${tenant}'::uuid AND NEW.status IS DISTINCT FROM OLD.status THEN
        PERFORM pg_advisory_xact_lock(21221929); END IF; RETURN NEW; END; $b$;
      CREATE TRIGGER roomqc_invitation_authority_barrier AFTER UPDATE OF status ON public.staff_invitations
        FOR EACH ROW EXECUTE FUNCTION private.roomqc_invitation_authority_barrier();
      CREATE FUNCTION private.roomqc_invitation_password_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $b$
      BEGIN IF session_user='supabase_auth_admin'
        AND NEW.email LIKE 'invitation-${input.run}-authority-race-%@roomqc.invalid' THEN
        PERFORM pg_advisory_xact_lock(21221929); END IF; RETURN NEW; END; $b$;
      CREATE TRIGGER roomqc_invitation_password_barrier AFTER UPDATE OF encrypted_password ON auth.users
        FOR EACH ROW EXECUTE FUNCTION private.roomqc_invitation_password_barrier();`);
    try{
      for(const label of expectedRaces){
        failedLabel=label;const c=await candidate('race-'+label),before=await effects(c.user,c.invitation);
        const [first,second]=label.split('-before-'),next='OwnedAuthorityRace!'+crypto.randomUUID();
        const send=operation=>operation==='accept'?accept(c.user,c.invitation):operation==='revoke'?edge(owner,{action:'revoke',id:c.invitation.id}):
          call('/auth/v1/user',c.user.token,{password:next,current_password:c.user.password,roomqc_password_change_id:crypto.randomUUID()},'PUT');
        const block=await db.connect();let a,b,observedFirst=false,observedSecond=false;
        try{
          await block.query('BEGIN');const pid=(await block.query('SELECT pg_backend_pid() pid')).rows[0].pid;
          await block.query('SELECT pg_advisory_xact_lock(21221929)');a=send(first);const [operationPid]=await waitBlocked(pid);observedFirst=true;
          b=send(second);await waitBlocked(operationPid);observedSecond=true;await block.query('COMMIT');
          const [one,two]=await Promise.all([a,b]),after=await effects(c.user,c.invitation);
          const accepted=first==='accept'||second==='accept'&&first!=='revoke';
          const changed=first==='password'||second==='password'&&first!=='revoke';
          const expectedOne=200,expectedTwo=first==='revoke'?(second==='password'?403:409):first==='accept'&&second==='revoke'?409:200;
          const matches=after.status===(accepted?'accepted':'revoked')&&after.profiles===(accepted?1:0)&&after.roles===(accepted?1:0)
            &&after.memberships===(accepted?1:0)&&after.receipts===before.receipts+(changed?1:0)&&(after.hash!==before.hash)===changed
            &&after.audit===before.audit+1;
          const nextBefore=await snapshot(),readback=await edge(c.user,{action:'status',invitationId:c.invitation.id,tenantId:tenant});
          const readOnly=nextBefore===await snapshot(),passed=observedFirst&&observedSecond&&one.status===expectedOne&&two.status===expectedTwo
            &&matches&&readback.status===200&&readback.data?.status===after.status&&readOnly;
          races.push({label,firstStatus:one.status,secondStatus:two.status,observedFirst,observedSecond,effectMatches:matches,
            readbackStatus:readback.status,readOnly,passed});if(!passed)throw Object.assign(new Error('Owned race assertion'),{code:'OWNED_INVITATION_RACE_ASSERTION'});
        }finally{
          await block.query('ROLLBACK').catch(()=>{});if(a)await a.catch(()=>{});if(b)await b.catch(()=>{});block.release();
        }
      }
    }finally{await barrierCleanup();}
    if(JSON.stringify(checks.map(x=>x.label))!==JSON.stringify(expected)||JSON.stringify(races.map(x=>x.label))!==JSON.stringify(expectedRaces))throw new Error('Owned inventory');
    phase='complete';complete=true;failedLabel=null;
  }catch(error){errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_INVITATION_AUTHORITY_ASSERTION';}
  finally{await barrierCleanup();}
  return {verified:complete&&checks.length===expected.length&&checks.every(x=>x.passed)&&races.length===expectedRaces.length&&races.every(x=>x.passed),
    complete,phase,failedLabel,errorCode,expectedChecks:expected.length,expectedRaces:expectedRaces.length,checks,races,
    inventory:{roles:roleCases,acceptanceFaults:faultCases,crossOperations:expectedRaces},
    coverage:{actualNativePassword:true,actualAcceptanceEdge:true,actualManagementRpc:true,installerInvitationFixtures:true,
      observedCrossOperationLocks:races.length===expectedRaces.length&&races.every(x=>x.passed),fullAuthorityMatrix:false,browserAndroid:false,externalMail:false}};
}
