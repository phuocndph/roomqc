// Only concatenated into the exact-owned, fixed-origin synthetic backend client.
// No URL/account/credential supplied by a caller outside that runner is accepted.
export async function runSelfProfileChecks({db,call,input,a,manager,staff,row,check}) {
  const observations=[],actors=[a,manager,staff],races=[];
  let phase='metadata',complete=false,setupErrorCode=null,storageControls=null,parallelControls=null;
  const snapshot=async()=> (await db.query(`SELECT jsonb_build_object(
    'users',(SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM public.users u),
    'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY user_id,role) FROM public.user_roles r),
    'hotels',(SELECT jsonb_agg(to_jsonb(h) ORDER BY user_id,hotel_id) FROM public.user_hotels h),
    'permissions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM public.user_permissions p)
  ) AS value`)).rows[0].value;
  const withoutMetadata=profile=>Object.fromEntries(Object.entries(profile)
    .filter(([key])=>!['full_name','phone','avatar_url','updated_at'].includes(key)));
  async function restoreProfile(actor,saved) {
    await db.query(`UPDATE public.users SET full_name=$2,phone=$3,avatar_url=$4,
      status=$5,account_locked=$6,hotel_id=$7,must_change_password=$8,deleted_at=$9,role=$10 WHERE id=$1`,
    [actor.id,saved.full_name,saved.phone,saved.avatar_url,saved.status,saved.account_locked,
      saved.hotel_id,saved.must_change_password,saved.deleted_at,saved.role]);
  }
  async function observe(actor,label,changes,allowed,target=actor.id) {
    const before=await snapshot(),v=await call('/rest/v1/users?id=eq.'+target+'&select=id,full_name,phone,avatar_url',
      actor.token,changes,'PATCH'),after=await snapshot();
    const beforeTarget=before.users.find(u=>u.id===target),afterTarget=after.users.find(u=>u.id===target);
    const returnedRows=Array.isArray(v.data)?v.data.length:null;
    const effectsUnchanged=JSON.stringify(before)===JSON.stringify(after);
    const authorityUnchanged=JSON.stringify({...before,users:before.users.map(withoutMetadata)})===
      JSON.stringify({...after,users:after.users.map(withoutMetadata)});
    const otherProfilesUnchanged=JSON.stringify(before.users.filter(u=>u.id!==target))===
      JSON.stringify(after.users.filter(u=>u.id!==target));
    const saved=afterTarget&&Object.entries(changes).every(([key,value])=>afterTarget[key]===value);
    const denial=(v.status===403&&v.data?.code==='42501')||(v.status===200&&returnedRows===0);
    const passed=allowed?v.status===200&&returnedRows===1&&v.data[0].id===target&&saved&&authorityUnchanged&&otherProfilesUnchanged:
      denial&&effectsUnchanged;
    observations.push({actorFixture:actor.fixture,label,method:'PATCH',table:'users',
      expected:allowed?'save_exact_self_metadata':'deny_without_effects',status:v.status,
      sqlstate:v.data?.code??null,returnedRows,effectsUnchanged,authorityUnchanged,
      otherProfilesUnchanged,profileChanged:JSON.stringify(beforeTarget)!==JSON.stringify(afterTarget),
      metadataSaved:Boolean(saved),passed});
    return passed;
  }
  async function waitBlocked(pid) {
    const deadline=Date.now()+5000;
    while(Date.now()<deadline) {
      const rows=(await db.query("SELECT pid FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND wait_event_type='Lock'",[pid])).rows;
      if(rows.length===1)return rows[0].pid;
      await new Promise(resolve=>setTimeout(resolve,20));
    }
    check.fail('Owned self-profile lock barrier not observed');
  }
  try {
    for(const actor of actors) {
      const original=await row('users',actor.id);
      try {
        const base={full_name:'Owned self profile '+actor.fixture,phone:'0901234567',
          avatar_url:'https://avatar.roomqc.invalid/'+input.run+'/'+actor.fixture+'.png'};
        check.equal(await observe(actor,'metadata-positive',base,true),true,'Self metadata positive must work before denials');
        check.equal(await observe(actor,'clear-optional-fields',{phone:'',avatar_url:''},true),true);
        check.equal(await observe(actor,'missing-target-no-row',{full_name:'Owned nonexistent'},false,
          '00000000-0000-4000-8000-000000000001'),true);

        phase='live-state';
        for(const state of ['locked','inactive','deleted-session']) {
          check.equal(await observe(actor,state+'-before',{full_name:'Owned before '+state},true),true);
          const prior=await row('users',actor.id);
          const sessionId=JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url').toString()).session_id;
          const session=state==='deleted-session'?(await db.query('SELECT to_jsonb(s) AS value FROM auth.sessions s WHERE id=$1 AND user_id=$2',
            [sessionId,actor.id])).rows[0]?.value:null;
          if(state==='deleted-session')check.ok(session,'A real login session is required for revocation control');
          try {
            if(state==='locked')await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]);
            else if(state==='inactive')await db.query("UPDATE public.users SET status='inactive' WHERE id=$1",[actor.id]);
            else await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,actor.id]);
            await observe(actor,state+'-invalid',{full_name:'Owned invalid '+state},false);
          } finally {
            await restoreProfile(actor,prior);
            if(session)await db.query('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).*',
              [JSON.stringify(session)]);
          }
          check.equal(await observe(actor,state+'-recovered',{full_name:'Owned recovered '+state},true),true);
        }
        phase='self-column-boundary';
        for(const [label,changes]of [
          ['self-account-lock',{account_locked:true}],['self-status',{status:'inactive'}],
          ['self-primary-hotel',{hotel_id:a.secondHotelId}],['self-role',{role:'owner'}],
        ]) {
          // Owner already has owner role; that no-op cannot prove denial.
          if(label==='self-role'&&actor===a)continue;
          const prior=await row('users',actor.id);
          try { await observe(actor,label,changes,false) }
          finally { await restoreProfile(actor,prior) }
          check.equal(await observe(actor,label+'-recovered',{full_name:'Owned column recovery '+label},true),true);
        }
      } finally { await restoreProfile(actor,original) }
    }
    phase='avatar-storage';
    const origin='http://127.0.0.1:8000',objectPath=staff.id+'/owned-self-'+input.run+'.png';
    const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCfoAAAAASUVORK5CYII=','base64');
    const upload=await fetch(origin+'/storage/v1/object/avatars/'+objectPath,{method:'POST',
      signal:AbortSignal.timeout(15000),headers:{apikey:input.publishableKey,authorization:'Bearer '+staff.token,
        'content-type':'image/png','x-upsert':'false'},body:bytes});
    const avatarUrl=origin+'/storage/v1/object/public/avatars/'+objectPath;
    const saved=await call('/rest/v1/users?id=eq.'+staff.id+'&select=id,avatar_url',staff.token,{avatar_url:avatarUrl},'PATCH');
    const publicRead=await fetch(avatarUrl,{signal:AbortSignal.timeout(15000)});
    const readBytes=Buffer.from(await publicRead.arrayBuffer());
    const object=(await db.query("SELECT owner_id FROM storage.objects WHERE bucket_id='avatars' AND name=$1",[objectPath])).rows[0];
    storageControls={actualUpload:true,uploadStatus:upload.status,publicReadStatus:publicRead.status,
      bytesMatch:readBytes.equals(bytes),byteLength:readBytes.length,objectOwned:object?.owner_id===staff.id,
      profileSaved:saved.status===200&&saved.data?.length===1&&saved.data[0].id===staff.id&&saved.data[0].avatar_url===avatarUrl};
    storageControls.verified=upload.status===200&&publicRead.status===200&&storageControls.bytesMatch&&
      storageControls.objectOwned&&storageControls.profileSaved;
    check.equal(storageControls.verified,true,'Avatar upload, readable bytes and profile are separate required effects');

    phase='parallel-self-updates';
    const parallel=await Promise.all(['first','second'].map(suffix=>call('/rest/v1/users?id=eq.'+staff.id+'&select=id,full_name',
      staff.token,{full_name:'Owned parallel self '+suffix},'PATCH')));
    const current=await row('users',staff.id);
    parallelControls={statuses:parallel.map(v=>v.status),returnedExactRows:parallel.every(v=>v.data?.length===1&&v.data[0].id===staff.id),
      finalMatchesAcceptedWrite:parallel.some(v=>v.data?.[0]?.full_name===current.full_name),contract:'serialized_last_committed_write_no_version_contract'};
    parallelControls.verified=parallelControls.statuses.every(s=>s===200)&&parallelControls.returnedExactRows&&parallelControls.finalMatchesAcceptedWrite;
    check.equal(parallelControls.verified,true,'Concurrent self updates must not deadlock on profile lock upgrades');

    phase='self-revocation-races';
    // A test-only AFTER UPDATE barrier proves the mutation owns its row before
    // revocation starts; sleeping/snapshot-only checks cannot establish that.
    await db.query(`CREATE FUNCTION private.roomqc_self_profile_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $barrier$
      BEGIN IF NEW.id='${staff.id}'::uuid AND current_setting('role',true)='authenticated' THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(21153825); END IF; RETURN NEW; END; $barrier$;
      CREATE TRIGGER roomqc_self_profile_barrier AFTER UPDATE ON public.users FOR EACH ROW
        EXECUTE FUNCTION private.roomqc_self_profile_barrier();`);
    try {
      for(const state of ['locked','deleted-session'])for(const order of ['revoke-first','mutation-first']) {
        const prior=await row('users',staff.id),sessionId=JSON.parse(Buffer.from(staff.token.split('.')[1],'base64url').toString()).session_id;
        const savedSession=(await db.query('SELECT to_jsonb(s) AS value FROM auth.sessions s WHERE id=$1 AND user_id=$2',[sessionId,staff.id])).rows[0]?.value;
        check.ok(savedSession);const blocker=await db.connect(),revoker=await db.connect();
        let mutation,revokePending,actorBarrier=false,secondBarrier=false,entry;
        const revoke=c=>state==='locked'?c.query('UPDATE public.users SET account_locked=true WHERE id=$1',[staff.id]):
          c.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,staff.id]);
        try {
          await blocker.query('BEGIN');const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          const send=()=>call('/rest/v1/users?id=eq.'+staff.id+'&select=id,full_name',staff.token,
            {full_name:'Owned self fenced '+state+' '+order},'PATCH');
          if(order==='revoke-first') {
            await revoke(blocker);mutation=send();await waitBlocked(pid);actorBarrier=true;await blocker.query('COMMIT');
          } else {
            await blocker.query('SELECT pg_advisory_xact_lock(21153825)');mutation=send();
            const mutationPid=await waitBlocked(pid);actorBarrier=true;
            await revoker.query('BEGIN');revokePending=revoke(revoker);await waitBlocked(mutationPid);secondBarrier=true;
            await blocker.query('COMMIT');
          }
          const v=await mutation;if(revokePending){await revokePending;await revoker.query('COMMIT')}
          const after=await row('users',staff.id),allowed=order==='mutation-first';
          const effectMatches=allowed?after.full_name==='Owned self fenced '+state+' '+order:after.full_name===prior.full_name;
          entry={state,order,status:v.status,sqlstate:v.data?.code??null,actorBarrier,secondBarrier,
            effectMatches,passed:false};races.push(entry);
          check.equal(v.status,allowed?200:403);check.equal(effectMatches,true);
          check.equal(await observe(staff,'next-request-denied-'+state+'-'+order,{full_name:'Owned denied next self'},false),true);
        } finally {
          await blocker.query('ROLLBACK').catch(()=>{});if(revokePending)await revokePending.catch(()=>{});
          await revoker.query('ROLLBACK').catch(()=>{});blocker.release();revoker.release();
          await restoreProfile(staff,prior);
          if((await db.query('SELECT 1 FROM auth.sessions WHERE id=$1',[sessionId])).rowCount===0)
            await db.query('INSERT INTO auth.sessions SELECT (jsonb_populate_record(NULL::auth.sessions,$1::jsonb)).*',[JSON.stringify(savedSession)]);
        }
        check.equal(await observe(staff,'race-recovered-'+state+'-'+order,{full_name:'Owned self race recovery'},true),true);
        entry.recoveryPositive=true;entry.passed=actorBarrier&&(order==='revoke-first'||secondBarrier)&&entry.effectMatches;
      }
    } finally {
      await db.query('DROP TRIGGER roomqc_self_profile_barrier ON public.users; DROP FUNCTION private.roomqc_self_profile_barrier()');
    }
    phase='complete';complete=true;
  } catch(error) {
    setupErrorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_CONTROL_ASSERTION';
  } finally {
    const result={contractVersion:2,verified:complete&&observations.every(o=>o.passed)&&races.length===4&&races.every(r=>r.passed)
      &&storageControls?.verified===true&&parallelControls?.verified===true,complete,phase,setupErrorCode,
      actualRest:true,actualAuth:true,providerEnabled:false,
      observations,findings:observations.filter(o=>!o.passed),races,storageControls,parallelControls,
      coverage:{actors:actors.map(v=>v.fixture),selfMetadata:true,optionalFieldClearing:true,
        liveStates:['locked','inactive','deleted-session'],selfProtectedFields:true,
        storageUpload:storageControls?.verified===true,revocationRaces:races.length===4&&races.every(r=>r.passed),
        passwordAcknowledgement:false,browserAndroidE2e:false,fullCallerMatrix:false}};
    // An interrupted/setup-failed run returns partial proof, never acceptance.
    return result;
  }
}
