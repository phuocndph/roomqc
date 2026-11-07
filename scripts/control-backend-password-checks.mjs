// Concatenated only into the exact-owned, fixed-origin synthetic backend client.
// Credentials/hashes/action payloads never leave this function; output is labels,
// status codes, booleans and counts. No external URL/recipient is configurable.
export async function runPasswordChecks({db,call,input,a,manager,staff,row,check}) {
  const observations=[],actors=[a,manager,staff];let phase='fixtures',complete=false,setupErrorCode=null,adversarial=null,caller=null,configuration=null;
  const authState=async actor=>{
    const r=(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[actor.id])).rows[0];
    check.ok(r);return r.encrypted_password;
  };
  const auditCount=async actor=>Number((await db.query("SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'actor_id'=$1",[actor.id])).rows[0].count);
  const auditActions=async(actor,offset)=>(await db.query("SELECT payload->>'action' AS action FROM auth.audit_log_entries WHERE payload->>'actor_id'=$1 ORDER BY created_at,id OFFSET $2",
    [actor.id,offset])).rows.map(x=>x.action).filter(x=>typeof x==='string'&&/^[a-z_]{1,64}$/.test(x));
  async function login(actor,password=actor.password) {
    return call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password});
  }
  async function refresh(actor) {
    const v=await login(actor);check.equal(v.status,200,'Owned password fixture login');
    check.equal(v.data?.user?.id,actor.id);actor.token=v.data.access_token;actor.refreshToken=v.data.refresh_token;return v;
  }
  async function setFlag(actor) {await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[actor.id]);}
  function record(actor,label,expected,actual,passed) {
    observations.push({actorFixture:actor.fixture,label,expected,...actual,passed:Boolean(passed)});
  }
  async function update(actor,label,body,{allowed,clearFlag=allowed,token=actor.token,refreshToken=actor.refreshToken}={}) {
    const before=await authState(actor),profile=await row('users',actor.id),offset=await auditCount(actor);
    let v;
    if(input.passwordSdk===true) {
      const {createClient}=await import('/node_modules/@supabase/supabase-js/dist/main/index.js');
      const sdk=createClient('http://127.0.0.1:8000',input.publishableKey,
        {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
      const session=await sdk.auth.setSession({access_token:token,refresh_token:refreshToken});
      if(session.error)v={status:session.error.status??0,data:{error_code:session.error.code}};
      else {
        check.equal(session.data.user?.id,actor.id);
        const changed=await sdk.auth.updateUser(body);
        v=changed.error?{status:changed.error.status??0,data:{error_code:changed.error.code}}:{status:200,data:changed.data.user};
      }
      sdk.auth.stopAutoRefresh();
    } else v=await call('/auth/v1/user',token,body,'PUT');
    const after=await authState(actor),saved=await row('users',actor.id);
    const changed=before!==after,actions=await auditActions(actor,offset);
    if(v.status===200&&changed)actor.password=body.password;
    const accepted=v.status===200&&v.data?.id===actor.id;
    const denied=[400,401,403,422].includes(v.status)&&!changed;
    const pass=allowed?accepted&&changed&&(!clearFlag||saved.must_change_password===false):
      denied&&saved.must_change_password===profile.must_change_password;
    record(actor,label,allowed?'auth_password_and_server_completion':'deny_without_password_or_completion_effects',
      {status:v.status,errorCode:typeof v.data?.error_code==='string'?v.data.error_code:null,passwordHashChanged:changed,
        flagBefore:profile.must_change_password,flagAfter:saved.must_change_password,auditActions:actions},pass);
    return {response:v,accepted,changed,saved};
  }
  try {
    for(const actor of actors) {
      phase='profile-acknowledgement';const original=await row('users',actor.id),originalPassword=actor.password;
      try {
        await setFlag(actor);const hash=await authState(actor);
        const patch=await call('/rest/v1/users?id=eq.'+actor.id+'&select=id,must_change_password',actor.token,
          {must_change_password:false},'PATCH'),patched=await row('users',actor.id);
        record(actor,'profile-flag-only','deny_without_auth_password_change',
          {status:patch.status,passwordHashChanged:hash!==await authState(actor),flagAfter:patched.must_change_password},
          [401,403].includes(patch.status)&&patched.must_change_password===true&&hash===await authState(actor));
        await setFlag(actor);
        const meta=await call('/auth/v1/user',actor.token,{data:{must_change_password:false}},'PUT');
        const metaProfile=await row('users',actor.id);
        record(actor,'user-metadata-not-authority','metadata_does_not_complete_required_password_change',
          {status:meta.status,passwordHashChanged:hash!==await authState(actor),flagAfter:metaProfile.must_change_password},
          meta.status===200&&metaProfile.must_change_password===true&&hash===await authState(actor));

        phase='current-password';await refresh(actor);
        await update(actor,'wrong-current-password',{password:'OwnedWrong!'+crypto.randomUUID(),current_password:'OwnedIncorrect!'+crypto.randomUUID()},{allowed:false});
        await refresh(actor);await setFlag(actor);
        await update(actor,'missing-current-password',{password:'OwnedMissing!'+crypto.randomUUID()},{allowed:false});
        await refresh(actor);await setFlag(actor);
        const other=await login(actor);check.equal(other.status,200);
        const sid=JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url').toString()).session_id;
        const otherSid=JSON.parse(Buffer.from(other.data.access_token.split('.')[1],'base64url').toString()).session_id;
        const oldPassword=actor.password;
        const valid=await update(actor,'valid-current-password',{password:'OwnedNew!'+crypto.randomUUID(),current_password:oldPassword},{allowed:true});
        const sessions=(await db.query('SELECT id::text FROM auth.sessions WHERE user_id=$1',[actor.id])).rows.map(x=>x.id);
        const oldLogin=await login(actor,oldPassword),newLogin=await login(actor);
        record(actor,'password-login-and-other-session-revocation','new_password_only_current_session_retained_other_session_revoked',
          {passwordUpdateStatus:valid.response.status,oldLoginStatus:oldLogin.status,newLoginStatus:newLogin.status,
            currentSessionRetained:sessions.includes(sid),otherSessionRevoked:!sessions.includes(otherSid)},
          valid.accepted&&[400,401].includes(oldLogin.status)&&newLogin.status===200&&sessions.includes(sid)&&!sessions.includes(otherSid));
        await refresh(actor);await setFlag(actor);

        phase='admin-reset';const beforeAdmin=await auditCount(actor),adminPassword='OwnedAdmin!'+crypto.randomUUID();
        const admin=await call('/auth/v1/admin/users/'+actor.id,input.serviceKey,{password:adminPassword},'PUT');
        check.equal(admin.status,200);actor.password=adminPassword;
        record(actor,'admin-reset-not-user-completion','admin_reset_retains_required_password_change',
          {status:admin.status,flagAfter:(await row('users',actor.id)).must_change_password,auditActions:await auditActions(actor,beforeAdmin)},
          (await row('users',actor.id)).must_change_password===true);
        await refresh(actor);

        phase='live-state';
        for(const state of ['deleted-session','locked','inactive']) {
          await setFlag(actor);await refresh(actor);const prior=await row('users',actor.id);
          if(state==='deleted-session') {
            const sessionId=JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url').toString()).session_id;
            await db.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[sessionId,actor.id]);
          } else if(state==='locked')await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[actor.id]);
          else await db.query("UPDATE public.users SET status='inactive' WHERE id=$1",[actor.id]);
          try {await update(actor,state+'-password-change',{password:'OwnedState!'+crypto.randomUUID(),current_password:actor.password},{allowed:false});}
          finally {await db.query('UPDATE public.users SET status=$2,account_locked=$3 WHERE id=$1',[actor.id,prior.status,prior.account_locked]);}
          await refresh(actor);
        }

        phase='recovery';await setFlag(actor);
        const link=await call('/auth/v1/admin/generate_link',input.serviceKey,{type:'recovery',email:actor.email});
        check.equal(link.status,200);check.ok(link.data?.hashed_token);
        const verify=await call('/auth/v1/verify',input.publishableKey,{token_hash:link.data.hashed_token,type:'recovery'});
        check.equal(verify.status,200);check.equal(verify.data?.user?.id,actor.id);
        await update(actor,'verified-recovery-password-change',{password:'OwnedRecovery!'+crypto.randomUUID()},
          {allowed:true,token:verify.data.access_token,refreshToken:verify.data.refresh_token});
        const recoveryLogin=await login(actor);check.equal(recoveryLogin.status,200);
      } finally {
        await db.query('UPDATE public.users SET status=$2,account_locked=$3,must_change_password=$4 WHERE id=$1',
          [actor.id,original.status,original.account_locked,original.must_change_password]);
        const reset=await call('/auth/v1/admin/users/'+actor.id,input.serviceKey,{password:originalPassword},'PUT');
        check.equal(reset.status,200);actor.password=originalPassword;await refresh(actor);
      }
    }
    if(input.passwordGuard===true){
      phase='adversarial';
      adversarial=await runPasswordAdversarialChecks({db,call,input:{...input,passwordOtherActorToken:a.token},actor:staff,row,check});
      check.equal(adversarial.verified,true,'Password faults, receipts, stale snapshot and exact-session races');
    }
    if(input.passwordCaller===true){
      phase='caller';caller=await runPasswordCallerChecks({db,call,input,actor:staff,row,check});
      check.equal(caller.verified,true,'Actual application password engine and server context/readback');
    }
    if(input.passwordConfig===true){
      phase='configuration';configuration=await runPasswordConfigChecks({db,call,input,actor:staff,row,check});
      check.equal(configuration.verified,true,'Actual config/helper/grant failure must roll back and recover');
    }
    phase='complete';complete=true;
  } catch(error) {setupErrorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_PASSWORD_ASSERTION';}
  return {contractVersion:1,verified:complete&&observations.length===33&&observations.every(x=>x.passed),complete,phase,setupErrorCode,
    actualAuth:true,actualRest:true,providerEnabled:false,observations,findings:observations.filter(x=>!x.passed),adversarial,caller,configuration,
    coverage:{actors:actors.map(x=>x.fixture),expected:33,currentPassword:true,forcedChange:true,recovery:true,
      actualSdk:input.passwordSdk===true,sdkVersion:input.passwordSdk===true?'2.80.0':null,
      browserAndroidE2e:false,concurrency:adversarial?.verified===true&&adversarial.races.length===4,
      responseLoss:false,responseBodyAbort:adversarial?.coverage?.actualResponseBodyAbort===true,fullRecoveryInvitationMatrix:false}};
}
