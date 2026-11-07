// Actual application password engine, compiled from src/lib/password-change.ts.
// Fixed-origin, exact-owned synthetic fixtures only. No password/token/hash output.
export async function runPasswordCallerChecks({db,call,input,actor,row,check}) {
  const checks=[];let complete=false,phase='context',errorCode=null,emailCoordinator=null;
  const original=await row('users',actor.id),originalPassword=actor.password;
  const storageData=new Map(),storage={get length(){return storageData.size},key:i=>[...storageData.keys()][i]??null,
    getItem:k=>storageData.get(k)??null,setItem:(k,v)=>storageData.set(k,v),removeItem:k=>storageData.delete(k)};
  let activeSession=null,puts=0,hideReadback=false;
  const regularFetch=async(url,options)=>{if(String(url).endsWith('/auth/v1/user'))puts++;return fetch(url,options)};
  const interceptedFetch=async(url,options)=>{
    if(hideReadback&&String(url).endsWith('/rpc/password_change_status')&&storageData.size)
      return new Response('{}',{status:503});
    return regularFetch(url,options);
  };
  const make=(transport=regularFetch)=>RoomQCPasswordCaller.createPasswordChangeFlow({
    endpoint:'http://127.0.0.1:8000',publishableKey:input.publishableKey,storage,fetch:transport,
    getSession:async()=>({data:{session:activeSession},error:null}),
  });
  const login=async(password=actor.password)=>{
    const result=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password});
    check.equal(result.status,200);check.equal(result.data?.user?.id,actor.id);
    activeSession={access_token:result.data.access_token,user:{id:actor.id}};
    actor.token=result.data.access_token;actor.refreshToken=result.data.refresh_token;
    return result;
  };
  const record=(label,expected,actual,passed)=>{checks.push({actorFixture:actor.fixture,label,expected,...actual,passed:Boolean(passed)});check.equal(Boolean(passed),true,label)};
  const hash=async()=>(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[actor.id])).rows[0].encrypted_password;
  try {
    await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[actor.id]);
    await login();const flow=make(),context=await flow.context(actor.id);
    const sid=JSON.parse(Buffer.from(activeSession.access_token.split('.')[1],'base64url')).session_id;
    record('native-ordinary-context','live_exact_session_non_recovery',
      {matchingActor:context.actorId===actor.id,matchingSession:context.sessionId===sid,isRecovery:context.isRecovery,flag:context.mustChangePassword},
      context.actorId===actor.id&&context.sessionId===sid&&!context.isRecovery&&context.mustChangePassword);

    phase='wrong-current';const before=await hash();let refusal=null;
    try {await flow.change({actorId:actor.id,currentPassword:'OwnedWrong!'+crypto.randomUUID(),newPassword:'OwnedNotSaved!'+crypto.randomUUID()});}
    catch(error){refusal=error.code;}
    record('actual-vendor-current-password-error','current_password_invalid_no_effect',
      {errorCode:refusal,noHashEffect:before===await hash(),pendingIds:storageData.size},
      refusal==='current_password_invalid'&&before===await hash()&&storageData.size===0);

    phase='ordinary';const previous=actor.password,newPassword='OwnedCaller!'+crypto.randomUUID(),count=puts;
    const saved=await flow.change({actorId:actor.id,currentPassword:previous,newPassword});actor.password=newPassword;
    const receipt=(await db.query('SELECT actor_id::text,session_id::text FROM private.password_change_receipts WHERE id=$1',[saved.changeId])).rows[0];
    const oldLogin=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password:previous});
    record('actual-app-engine-password-and-receipt','one_native_put_matching_receipt_and_completion',
      {puts:puts-count,completion:saved.completion,matchingActor:receipt?.actor_id===actor.id,matchingSession:receipt?.session_id===sid,
        flagAfter:(await row('users',actor.id)).must_change_password,oldLoginStatus:oldLogin.status,pendingIds:storageData.size},
      puts-count===1&&saved.completion==='submitted'&&receipt?.actor_id===actor.id&&receipt?.session_id===sid&&
      (await row('users',actor.id)).must_change_password===false&&oldLogin.status===400&&storageData.size===0);
    await login();

    phase='uncertain-readback';await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[actor.id]);
    const nextPassword='OwnedReadback!'+crypto.randomUUID(),prior=puts;let uncertain=null;
    // Fault only the adapter readback after actual Auth commit. Not a real
    // pre-header network loss, browser storage or arbitrary commit-window proof.
    const uncertainFlow=make(interceptedFetch);hideReadback=true;
    try {await uncertainFlow.change({actorId:actor.id,currentPassword:actor.password,newPassword:nextPassword});}
    catch(error){uncertain=error.code;}
    actor.password=nextPassword;
    record('adapter-readback-fault-after-real-auth','uncertain_no_success_pending_id_no_secrets',
      {errorCode:uncertain,puts:puts-prior,pendingIds:storageData.size,
        noSecrets:[...storageData.values()].every(v=>!v.includes(nextPassword)&&!v.includes(activeSession.access_token))},
      uncertain==='outcome_unknown'&&puts-prior===1&&storageData.size===1&&
        [...storageData.values()].every(v=>!v.includes(nextPassword)&&!v.includes(activeSession.access_token)));
    hideReadback=false;const resumed=await make().reconcile(actor.id);
    record('actual-receipt-reconcile-new-instance','matching_receipt_without_second_native_put',
      {completion:resumed?.completion,puts:puts-prior,pendingIds:storageData.size},
      resumed?.completion==='previous'&&puts-prior===1&&storageData.size===0);
    await login();

    phase='recovery';await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[actor.id]);
    const generated=await call('/auth/v1/admin/generate_link',input.serviceKey,{type:'recovery',email:actor.email});
    check.equal(generated.status,200);
    const verified=await call('/auth/v1/verify',input.publishableKey,{token_hash:generated.data.hashed_token,type:'recovery'});
    check.equal(verified.status,200);activeSession={access_token:verified.data.access_token,user:{id:actor.id}};
    const recoveryFlow=make(),recoveryContext=await recoveryFlow.context(actor.id);
    record('native-recovery-context','native_amr_allows_recovery_prompt_not_user_metadata',
      {isRecovery:recoveryContext.isRecovery,matchingActor:recoveryContext.actorId===actor.id},
      recoveryContext.isRecovery&&recoveryContext.actorId===actor.id);
    const recoveredPassword='OwnedCallerRecovery!'+crypto.randomUUID(),priorRecovery=puts;
    const recovered=await recoveryFlow.change({actorId:actor.id,newPassword:recoveredPassword});actor.password=recoveredPassword;
    record('actual-app-engine-recovery','native_password_change_without_current_password_matching_receipt',
      {completion:recovered.completion,puts:puts-priorRecovery,flagAfter:(await row('users',actor.id)).must_change_password},
      recovered.completion==='submitted'&&puts-priorRecovery===1&&(await row('users',actor.id)).must_change_password===false);
    await login();phase='email-coordinator';
    emailCoordinator=await runEmailCallerChecks({db,call,input,actor,row,check});
    check.equal(emailCoordinator.verified,true,'Actual production email coordinator recovery/receipt/logout');
    phase='complete';complete=true;
  }catch(error){errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_PASSWORD_CALLER_ASSERTION';}
  finally {
    hideReadback=false;
    await db.query('UPDATE public.users SET status=$2,account_locked=$3,must_change_password=$4 WHERE id=$1',
      [actor.id,original.status,original.account_locked,original.must_change_password]);
    const reset=await call('/auth/v1/admin/users/'+actor.id,input.serviceKey,{password:originalPassword},'PUT');
    check.equal(reset.status,200);actor.password=originalPassword;await login();
  }
  return {verified:complete&&checks.length===7&&checks.every(x=>x.passed),complete,phase,errorCode,
    actualApplicationEngine:true,actualAuth:true,actualRest:true,checks,emailCoordinator,
    coverage:{browserAndroid:false,preHeaderNetworkLoss:false,adapterReadbackFault:true,realLocalStorage:false,
      fullRecoveryInvitationMatrix:false,contextUsesNativeAmr:true}};
}
