// Compiled production coordinator against real native Auth/RPC in the exact-owned
// sandbox. Recovery only: invitation Edge and browser/Android are not proved here.
export async function runEmailCallerChecks({db,call,input,actor,row,check}) {
  const checks=[];let complete=false,phase='otp',errorCode=null,isolated=null,puts=0,hideReceipt=false,putBarrier=null,verifyBarrier=null;
  const originalPassword=actor.password,original=await row('users',actor.id),memory=new Map();
  const storage={get length(){return memory.size},key:i=>[...memory.keys()][i]??null,
    getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const record=(label,expected,actual,passed)=>{checks.push({actorFixture:actor.fixture,label,expected,...actual,passed:Boolean(passed)});check.equal(Boolean(passed),true,label)};
  const sid=token=>JSON.parse(Buffer.from(token.split('.')[1],'base64url')).session_id;
  const nativeFetch=async(url,options)=>{
    check.equal(new URL(url).origin,'http://127.0.0.1:8000');
    if(String(url).endsWith('/rpc/password_change_status')&&hideReceipt&&memory.size)return new Response('{}',{status:503});
    const response=await fetch(url,options);
    if(String(url).endsWith('/auth/v1/user')){puts++;if(putBarrier){putBarrier.enter();await putBarrier.wait;}}
    return response;
  };
  const deps={
    endpoint:'http://127.0.0.1:8000',publishableKey:input.publishableKey,tenantId:original.tenant_id,storage,fetch:nativeFetch,
    send:async()=>{throw new Error('OWNED_EMAIL_SEND_DISABLED')},
    getSession:async()=>({data:{session:isolated},error:null}),
    clearSession:async()=>{
      if(isolated){const result=await call('/auth/v1/logout?scope=local',isolated.access_token,{},'POST');
        check.ok([200,204,401,403].includes(result.status));}
      isolated=null;return {error:null};
    },
    verifyOtp:async params=>{
      const result=await call('/auth/v1/verify',input.publishableKey,params);
      if(result.status!==200)return {data:{},error:new Error('OWNED_OTP_REFUSED')};
      isolated={access_token:result.data.access_token,user:{id:result.data.user.id,email:result.data.user.email}};
      if(verifyBarrier){verifyBarrier.enter(sid(isolated.access_token));await verifyBarrier.wait;}
      return {data:{session:isolated,user:result.data.user},error:null};
    },
  };
  const make=()=>RoomQCEmailCaller.createEmailAuthCoordinator(deps);
  const code=async()=>{
    const generated=await call('/auth/v1/admin/generate_link',input.serviceKey,{type:'recovery',email:actor.email});
    check.equal(generated.status,200);check.match(generated.data.email_otp,/^\d{6}$/);return generated.data.email_otp;
  };
  const open=async()=>{const flow=make();await flow.verify('recovery',actor.email,await code());return flow};
  const hash=async()=>(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[actor.id])).rows[0].encrypted_password;
  const sessionExists=async id=>(await db.query('SELECT count(*)::int n FROM auth.sessions WHERE id=$1',[id])).rows[0].n!==0;
  const barrier=()=>{let enter,release;const entered=new Promise(r=>enter=r),wait=new Promise(r=>release=r);return {enter,release,entered,wait}};
  try {
    await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[actor.id]);
    let flow=await open(),sessionId=sid(isolated.access_token);
    record('native-email-otp-context','real_otp_exact_live_session_before_password',
      {sessionExists:await sessionExists(sessionId),puts,actorMatches:isolated.user.id===actor.id},
      await sessionExists(sessionId)&&puts===0&&isolated.user.id===actor.id);

    phase='recovery';const first='OwnedEmailFirst!'+crypto.randomUUID(),before=await hash(),prior=puts;
    const saved=await flow.finish('recovery',first);actor.password=first;
    const receipt=(await db.query('SELECT actor_id::text,session_id::text FROM private.password_change_receipts WHERE id=$1',[saved.changeId])).rows[0];
    const rejectedOld=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password:originalPassword});
    const acceptedNew=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password:first});
    record('actual-email-recovery-and-global-logout','one_native_password_receipt_and_revoked_otp_session',
      {puts:puts-prior,completion:saved.completion,matchingActor:receipt?.actor_id===actor.id,
        matchingSession:receipt?.session_id===sessionId,passwordChanged:before!==await hash(),oldLoginStatus:rejectedOld.status,
        newLoginStatus:acceptedNew.status,otpSessionRevoked:!await sessionExists(sessionId),pendingIds:memory.size},
      puts-prior===1&&saved.completion==='submitted'&&receipt?.actor_id===actor.id&&receipt?.session_id===sessionId&&
        before!==await hash()&&rejectedOld.status===400&&acceptedNew.status===200&&!await sessionExists(sessionId)&&memory.size===0);
    await flow.dispose();

    phase='uncertain';flow=await open();const next='OwnedEmailReadback!'+crypto.randomUUID(),count=puts;
    hideReceipt=true;let unknown=null;
    try{await flow.finish('recovery',next)}catch(error){unknown=error.code}
    actor.password=next;
    record('actual-email-readback-fault','adapter_readback_fault_after_native_commit_retains_id_only',
      {errorCode:unknown,puts:puts-count,pendingIds:memory.size,noSecrets:[...memory.values()].every(v=>!v.includes(next)&&!v.includes(isolated.access_token))},
      unknown==='outcome_unknown'&&puts-count===1&&memory.size===1&&[...memory.values()].every(v=>!v.includes(next)&&!v.includes(isolated.access_token)));
    hideReceipt=false;const recovered=await flow.check('recovery');
    record('actual-email-password-free-reconcile','exact_native_receipt_then_logout_without_another_put',
      {completion:recovered.completion,puts:puts-count,pendingIds:memory.size},
      recovered.completion==='previous'&&puts-count===1&&memory.size===0);
    await flow.dispose();

    phase='late-otp';flow=make();verifyBarrier=barrier();
    const verifying=flow.verify('recovery',actor.email,await code());verifying.catch(()=>{});
    const lateSession=await verifyBarrier.entered;
    const disposal=flow.dispose();verifyBarrier.release();
    let lateError=null;try{await verifying}catch(error){lateError=error.code}
    await disposal;verifyBarrier=null;
    record('late-otp-disposal-native-revoke','late_verified_session_cleared_no_password_dispatch',
      {errorCode:lateError,sessionRevoked:!await sessionExists(lateSession),noExtraPut:puts===count+1},
      lateError==='identity_changed'&&!await sessionExists(lateSession)&&puts===count+1);

    phase='duplicate';flow=await open();putBarrier=barrier();const finalPassword='OwnedEmailConcurrent!'+crypto.randomUUID(),last=puts;
    const finishing=flow.finish('recovery',finalPassword);finishing.catch(()=>{});
    await putBarrier.entered;let busy=null;
    try{await flow.finish('recovery','OwnedNeverSent!'+crypto.randomUUID())}catch(error){busy=error.code}
    putBarrier.release();const finished=await finishing;putBarrier=null;actor.password=finalPassword;
    record('actual-email-duplicate-finish','single_flight_one_native_put',
      {errorCode:busy,puts:puts-last,completion:finished.completion},
      busy==='flow_busy'&&puts-last===1&&finished.completion==='submitted');
    await flow.dispose();phase='complete';complete=true;
  }catch(error){errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_EMAIL_CALLER_ASSERTION';}
  finally{
    hideReceipt=false;putBarrier?.release();verifyBarrier?.release();
    if(isolated)await deps.clearSession();
    await db.query('UPDATE public.users SET status=$2,account_locked=$3,must_change_password=$4 WHERE id=$1',
      [actor.id,original.status,original.account_locked,original.must_change_password]);
    const reset=await call('/auth/v1/admin/users/'+actor.id,input.serviceKey,{password:originalPassword},'PUT');
    check.equal(reset.status,200);actor.password=originalPassword;
    const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password:originalPassword});
    check.equal(login.status,200);actor.token=login.data.access_token;actor.refreshToken=login.data.refresh_token;
  }
  return {verified:complete&&checks.length===6&&checks.every(x=>x.passed),complete,phase,errorCode,checks,
    actualApplicationCoordinator:true,actualAuth:true,actualRest:true,
    coverage:{invitationEdge:false,fullInvitationOffboardingMatrix:false,browserAndroid:false,
      preHeaderNetworkLoss:false,adapterReadbackFault:true,realLocalStorage:false,realNativeOtp:true,realNativeLogout:true}};
}

