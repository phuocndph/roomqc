// Only concatenated into the exact-owned backend fixture client. Fault origins
// are fixed internal service names; no arbitrary URL/config/actor is accepted.
export async function runPasswordConfigChecks({db,call,input,actor,row,check}) {
  const checks=[];let phase='fixtures',complete=false,errorCode=null;
  const id=actor.id,original=await row('users',id),originalPassword=actor.password;
  const signature=name=>'private.'+name+'(uuid,uuid,text,uuid)';
  const snapshot=async()=>({
    hash:(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[id])).rows[0].encrypted_password,
    flag:(await row('users',id)).must_change_password,
    sessions:(await db.query('SELECT id::text FROM auth.sessions WHERE user_id=$1 ORDER BY id',[id])).rows.map(x=>x.id),
    receipts:Number((await db.query('SELECT count(*) FROM private.password_change_receipts WHERE actor_id=$1',[id])).rows[0].count),
    audit:Number((await db.query("SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'actor_id'=$1",[id])).rows[0].count)
  });
  const noEffects=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const login=async()=>{
    const v=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password:actor.password});
    check.equal(v.status,200);check.equal(v.data?.user?.id,id);actor.token=v.data.access_token;
  };
  const positive=async()=>{
    await login();await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[id]);
    const before=await snapshot(),changeId=crypto.randomUUID(),password='OwnedConfigRecovered!'+crypto.randomUUID();
    const sid=JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url').toString()).session_id;
    const changed=await call('/auth/v1/user',actor.token,{password,current_password:actor.password,roomqc_password_change_id:changeId},'PUT');
    const after=await snapshot();
    if(changed.status===200&&after.hash!==before.hash)actor.password=password;
    const receipt=await call('/rest/v1/rpc/password_change_status',actor.token,{p_change_id:changeId});
    const passed=changed.status===200&&changed.data?.id===id&&after.hash!==before.hash&&after.flag===false
      &&after.receipts===before.receipts+1&&after.audit===before.audit+2
      &&JSON.stringify(after.sessions)===JSON.stringify([sid])
      &&receipt.status===200&&receipt.data?.actor_id===id&&receipt.data?.session_id===sid
      &&receipt.data?.change_id===changeId&&receipt.data?.must_change_password===false;
    check.equal(passed,true,'Restored native Auth password change and exact receipt');
    await login();return passed;
  };
  const send=async origin=>{
    const response=await fetch(origin+'/user',{method:'PUT',signal:AbortSignal.timeout(15000),
      headers:{apikey:input.publishableKey,authorization:'Bearer '+actor.token,'content-type':'application/json'},
      body:JSON.stringify({password:'OwnedConfigDenied!'+crypto.randomUUID(),current_password:actor.password,
        roomqc_password_change_id:crypto.randomUUID()})});
    const data=await response.json();
    return {status:response.status,guardUnavailable:data?.error_code==='password_change_guard_unavailable'};
  };
  async function fault(label,expectedStatus,origin,apply=async()=>{},restore=async()=>{}) {
    phase=label;await login();
    await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[id]);
    const before=await snapshot();let response;
    try{await apply();response=await send(origin)}finally{await restore()}
    const unchanged=noEffects(before,await snapshot());
    const entry={label,expectedStatus,status:response.status,noEffects:unchanged,
      guardUnavailable:response.guardUnavailable,recoveryPositive:false,passed:false};
    checks.push(entry);
    check.equal(response.status,expectedStatus,label+' is config failure, not permission-denial evidence');
    check.equal(unchanged,true,label+' must not mutate hash/session/audit/flag/receipt');
    if(expectedStatus===503)check.equal(response.guardUnavailable,true);
    entry.recoveryPositive=await positive();entry.passed=true;
  }
  try {
    await fault('required-current-password-disabled',503,'http://password-policy-disabled-test:9999');
    await fault('postgres-audit-disabled',503,'http://password-audit-disabled-test:9999');
    for(const name of ['begin_password_change','complete_password_change']) {
      const renamed='roomqc_owned_missing_'+name;
      check.equal((await db.query('SELECT to_regprocedure($1) AS fn',[signature(renamed)])).rows[0].fn,null);
      await fault(name+'-missing',500,'http://auth:9999',
        ()=>db.query('ALTER FUNCTION '+signature(name)+' RENAME TO '+renamed),
        ()=>db.query('ALTER FUNCTION '+signature(renamed)+' RENAME TO '+name));
      const privilege=(await db.query("SELECT has_function_privilege('supabase_auth_admin',$1,'EXECUTE') AS allowed",[signature(name)])).rows[0].allowed;
      check.equal(privilege,true,'Native grants must match reviewed starting contract');
      await fault(name+'-grant-revoked',500,'http://auth:9999',
        ()=>db.query('REVOKE EXECUTE ON FUNCTION '+signature(name)+' FROM supabase_auth_admin'),
        ()=>db.query('GRANT EXECUTE ON FUNCTION '+signature(name)+' TO supabase_auth_admin'));
    }
    const definition=(await db.query('SELECT pg_get_functiondef($1::regprocedure) AS definition',[signature('complete_password_change')])).rows[0].definition;
    await fault('completion-invalid-contract',500,'http://auth:9999',
      ()=>db.query(`CREATE OR REPLACE FUNCTION private.complete_password_change(
        p_actor uuid,p_session uuid,p_previous_hash text,p_change uuid
      ) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $owned$
      BEGIN RETURN '{"allowed":false,"status":418,"code":"owned_invalid_contract"}'::jsonb; END; $owned$`),
      ()=>db.query(definition));
    phase='complete';complete=true;
  }catch(error){errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_PASSWORD_CONFIG_ASSERTION'}
  finally{
    await db.query('UPDATE public.users SET status=$2,account_locked=$3,must_change_password=$4 WHERE id=$1',
      [id,original.status,original.account_locked,original.must_change_password]);
    const reset=await call('/auth/v1/admin/users/'+id,input.serviceKey,{password:originalPassword},'PUT');
    check.equal(reset.status,200);actor.password=originalPassword;await login();
  }
  return {verified:complete&&checks.length===7&&checks.every(x=>x.passed&&x.recoveryPositive),
    complete,phase,errorCode,checks,actualAuth:true,
    coverage:{configurationDisabled:true,missingHelpers:true,nativeGrantRevocation:true,
      malformedCompletionContract:true,hashSessionAuditFlagReceiptSnapshots:true,restorationPositives:true,
      wrongImageDeploymentPreflight:false,browserAndroid:false,notFullIntegratedProof:true}};
}
