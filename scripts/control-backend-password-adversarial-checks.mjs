// Actual fixed-origin Auth/REST tests on exact-owned synthetic actors only.
export async function runPasswordAdversarialChecks({db,call,input,actor,row,check}) {
  const checks=[],races=[];let phase='fixtures',complete=false,errorCode=null;
  const id=actor.id,original=await row('users',id),originalPassword=actor.password;
  const hash=async()=>(await db.query('SELECT encrypted_password FROM auth.users WHERE id=$1',[id])).rows[0].encrypted_password;
  const snapshot=async()=>({hash:await hash(),flag:(await row('users',id)).must_change_password,
    sessions:(await db.query('SELECT id::text FROM auth.sessions WHERE user_id=$1 ORDER BY id',[id])).rows.map(x=>x.id),
    receipts:Number((await db.query('SELECT count(*) FROM private.password_change_receipts WHERE actor_id=$1',[id])).rows[0].count),
    audit:Number((await db.query("SELECT count(*) FROM auth.audit_log_entries WHERE payload->>'actor_id'=$1",[id])).rows[0].count)});
  const noEffect=(a,b)=>a.hash===b.hash&&a.flag===b.flag&&a.receipts===b.receipts&&a.audit===b.audit&&JSON.stringify(a.sessions)===JSON.stringify(b.sessions);
  const sessionId=()=>JSON.parse(Buffer.from(actor.token.split('.')[1],'base64url').toString()).session_id;
  const login=async()=>{const v=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:actor.email,password:actor.password});
    check.equal(v.status,200);actor.token=v.data.access_token;return v};
  const send=(password,changeId=crypto.randomUUID())=>call('/auth/v1/user',actor.token,
    {password,current_password:actor.password,roomqc_password_change_id:changeId},'PUT');
  const record=(label,expected,value,passed)=>{checks.push({actorFixture:actor.fixture,label,expected,...value,passed:Boolean(passed)});check.equal(Boolean(passed),true,label)};
  async function waitBlocked(pid,count=1) {
    for(let i=0;i<120;i++){
      // PostgreSQL also reports a queued waiter as a soft blocker of the next
      // waiter. Requiring both to directly name the lock holder loses that
      // real chain; count the observed transitive graph, never a timer alone.
      const v=(await db.query(`WITH RECURSIVE blocked(pid,path) AS (
        SELECT pid,ARRAY[$1::integer,pid] FROM pg_stat_activity WHERE $1::integer=ANY(pg_blocking_pids(pid))
        UNION ALL SELECT a.pid,b.path||a.pid FROM pg_stat_activity a JOIN blocked b
          ON b.pid=ANY(pg_blocking_pids(a.pid)) WHERE NOT a.pid=ANY(b.path)
      ) SELECT DISTINCT pid FROM blocked ORDER BY pid`,[pid])).rows;
      if(v.length>=count)return v.map(x=>x.pid);
      await new Promise(resolve=>setTimeout(resolve,25));
    }
    throw Object.assign(new Error('Owned password barrier not reached'),{code:'OWNED_PASSWORD_BARRIER'});
  }
  const dropFault=()=>db.query('DROP TRIGGER IF EXISTS roomqc_password_fault ON private.password_change_receipts; DROP TRIGGER IF EXISTS roomqc_password_fault ON auth.audit_log_entries; DROP FUNCTION IF EXISTS private.roomqc_password_fault()');
  try {
    await login();
    phase='private-acl';
    const privileges=(await db.query(`SELECT
      has_function_privilege('authenticated','private.begin_password_change(uuid,uuid,text,uuid)','EXECUTE') AS browser_begin,
      has_function_privilege('service_role','private.complete_password_change(uuid,uuid,text,uuid)','EXECUTE') AS service_complete,
      has_table_privilege('authenticated','private.password_change_receipts','SELECT') AS browser_table,
      has_function_privilege('supabase_auth_admin','private.begin_password_change(uuid,uuid,text,uuid)','EXECUTE') AS auth_begin`)).rows[0];
    record('private-guard-acl','only_native_auth_role_executes_guard',{browserBegin:privileges.browser_begin,serviceComplete:privileges.service_complete,
      browserTable:privileges.browser_table,authBegin:privileges.auth_begin},!privileges.browser_begin&&!privileges.service_complete&&!privileges.browser_table&&privileges.auth_begin);
    for(const target of ['completion','audit']) {
      phase=target+'-fault';await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[id]);
      const before=await snapshot();
      await db.query(`CREATE FUNCTION private.roomqc_password_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fault$
        BEGIN IF ${target==='completion'?"NEW.actor_id='"+id+"'::uuid":"NEW.payload->>'actor_id'='"+id+"' AND NEW.payload->>'action'='user_updated_password'"} THEN
          RAISE EXCEPTION 'OWNED_PASSWORD_FAULT' USING ERRCODE='23514'; END IF; RETURN NEW; END; $fault$;
        CREATE TRIGGER roomqc_password_fault BEFORE INSERT ON ${target==='completion'?'private.password_change_receipts':'auth.audit_log_entries'}
          FOR EACH ROW EXECUTE FUNCTION private.roomqc_password_fault();`);
      let v;try {v=await send('OwnedFault!'+crypto.randomUUID())} finally {await dropFault()}
      const after=await snapshot();
      record(target+'-fault-atomic-rollback','injected_5xx_rolls_back_hash_sessions_audit_flag_receipt',
        {status:v.status,noEffects:noEffect(before,after)},v.status>=500&&v.status<600&&noEffect(before,after));
      await login();
    }
    phase='response-body-loss';await db.query('UPDATE public.users SET must_change_password=true WHERE id=$1',[id]);
    const changeId=crypto.randomUUID(),password='OwnedResponse!'+crypto.randomUUID(),before=await snapshot(),controller=new AbortController();
    const response=await fetch('http://127.0.0.1:8000/auth/v1/user',{method:'PUT',signal:controller.signal,
      headers:{apikey:input.publishableKey,authorization:'Bearer '+actor.token,'content-type':'application/json'},
      body:JSON.stringify({password,current_password:actor.password,roomqc_password_change_id:changeId})});
    controller.abort();let bodyAborted=false;try{await response.json()}catch{bodyAborted=true}
    const after=await snapshot(),receipt=await call('/rest/v1/rpc/password_change_status',actor.token,{p_change_id:changeId});
    const committed=after.hash!==before.hash&&after.flag===false&&after.receipts===before.receipts+1;
    if(committed)actor.password=password;
    record('aborted-response-body-readback','actual_abort_after_headers_and_receipt_readback_no_repeat_password_update',
      {headersStatus:response.status,bodyAborted,committed,readbackStatus:receipt.status,matchingReceipt:receipt.data?.change_id===changeId,
        matchingActor:receipt.data?.actor_id===id,serverFlag:receipt.data?.must_change_password},
      response.status===200&&bodyAborted&&committed&&receipt.status===200&&receipt.data?.change_id===changeId&&receipt.data?.actor_id===id&&receipt.data?.must_change_password===false);
    const other=await call('/rest/v1/rpc/password_change_status',input.passwordOtherActorToken,{p_change_id:changeId});
    record('receipt-cross-actor-hidden','another_actor_cannot_read_the_receipt',{status:other.status,receiptHidden:other.data?.change_id===null},
      other.status===200&&other.data?.change_id===null&&other.data?.actor_id!==id);
    const beforeReplay=await snapshot(),replay=await send('OwnedReplay!'+crypto.randomUUID(),changeId),afterReplay=await snapshot();
    record('completed-id-reuse-refused','409_no_new_password_or_receipt',{status:replay.status,noEffects:noEffect(beforeReplay,afterReplay)},
      replay.status===409&&noEffect(beforeReplay,afterReplay));
    await login();

    phase='same-old-password-concurrency';
    const blocker=await db.connect();let sends;
    try{
      await blocker.query('BEGIN');const pid=(await blocker.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await blocker.query('SELECT id FROM auth.users WHERE id=$1 FOR UPDATE',[id]);
      const before=await snapshot(),passwords=['OwnedConcurrentA!'+crypto.randomUUID(),'OwnedConcurrentB!'+crypto.randomUUID()];
      sends=passwords.map(p=>send(p));await waitBlocked(pid,2);await blocker.query('COMMIT');
      const result=await Promise.all(sends),winner=result.findIndex(v=>v.status===200),after=await snapshot();
      if(winner>=0)actor.password=passwords[winner];
      record('stale-current-password-snapshot','one_success_one_conflict_no_lost_update',
        {statuses:result.map(v=>v.status).sort(),realBarrier:true,receiptDelta:after.receipts-before.receipts,hashChanged:after.hash!==before.hash},
        result.filter(v=>v.status===200).length===1&&result.filter(v=>v.status===409).length===1&&after.receipts===before.receipts+1&&after.hash!==before.hash);
    }finally{await blocker.query('ROLLBACK').catch(()=>{});if(sends)await Promise.allSettled(sends);blocker.release()}
    await login();

    phase='revocation-races';
    await db.query(`CREATE FUNCTION private.roomqc_password_barrier() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $barrier$
      BEGIN IF NEW.id='${id}'::uuid AND session_user='supabase_auth_admin' THEN
        PERFORM pg_advisory_xact_lock(21170824); END IF; RETURN NEW; END; $barrier$;
      CREATE TRIGGER roomqc_password_barrier AFTER UPDATE OF encrypted_password ON auth.users FOR EACH ROW
        EXECUTE FUNCTION private.roomqc_password_barrier();`);
    try{
      for(const state of ['locked','deleted-session'])for(const order of ['revoke-first','mutation-first']){
        await db.query('UPDATE public.users SET account_locked=false,status=\'active\',must_change_password=true WHERE id=$1',[id]);await login();
        const sid=sessionId(),before=await snapshot(),block=await db.connect(),revoker=await db.connect(),nextPassword='OwnedRace!'+crypto.randomUUID();
        let pending,revokePending,actorBarrier=false,secondBarrier=false;
        const revoke=c=>state==='locked'?c.query('UPDATE public.users SET account_locked=true WHERE id=$1',[id]):
          c.query('DELETE FROM auth.sessions WHERE id=$1 AND user_id=$2',[sid,id]);
        try{
          await block.query('BEGIN');const pid=(await block.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
          if(order==='revoke-first'){
            await revoke(block);pending=send(nextPassword);await waitBlocked(pid);actorBarrier=true;await block.query('COMMIT');
          }else{
            await block.query('SELECT pg_advisory_xact_lock(21170824)');pending=send(nextPassword);
            const [mutationPid]=await waitBlocked(pid);actorBarrier=true;await revoker.query('BEGIN');
            revokePending=revoke(revoker);await waitBlocked(mutationPid);secondBarrier=true;await block.query('COMMIT');
          }
          const result=await pending;if(revokePending){await revokePending;await revoker.query('COMMIT')}
          const after=await snapshot(),allowed=order==='mutation-first',changed=after.hash!==before.hash;
          if(result.status===200&&changed)actor.password=nextPassword;
          const expectedSessions=allowed?(state==='locked'?[sid]:[]):before.sessions.filter(s=>state!=='deleted-session'||s!==sid);
          const sessionEffects=JSON.stringify(after.sessions)===JSON.stringify(expectedSessions.sort()),auditEffects=after.audit===before.audit+(allowed?2:0);
          const matches=(allowed?changed&&after.flag===false&&after.receipts===before.receipts+1:!changed&&after.flag===true&&after.receipts===before.receipts)&&sessionEffects&&auditEffects;
          const nextBefore=await snapshot(),next=await send('OwnedDeniedNext!'+crypto.randomUUID()),nextUnchanged=noEffect(nextBefore,await snapshot());
          const race={state,order,status:result.status,actorBarrier,secondBarrier,effectMatches:matches,sessionEffects,auditEffects,nextStatus:next.status,nextNoEffects:nextUnchanged,
            passed:actorBarrier&&(!allowed||secondBarrier)&&matches&&(allowed?result.status===200:[400,401,403].includes(result.status))&&[400,401,403].includes(next.status)&&nextUnchanged};
          races.push(race);check.equal(race.passed,true);
        }finally{
          await block.query('ROLLBACK').catch(()=>{});if(pending)await pending.catch(()=>{});if(revokePending)await revokePending.catch(()=>{});
          await revoker.query('ROLLBACK').catch(()=>{});block.release();revoker.release();
          await db.query('UPDATE public.users SET account_locked=false,status=\'active\' WHERE id=$1',[id]);
        }
        await login();const recoveryPassword='OwnedRecovered!'+crypto.randomUUID(),recovered=await send(recoveryPassword);
        check.equal(recovered.status,200);check.equal(recovered.data?.id,id);actor.password=recoveryPassword;
        await login();races.at(-1).recoveryPositive=true;
      }
    }finally{await db.query('DROP TRIGGER roomqc_password_barrier ON auth.users; DROP FUNCTION private.roomqc_password_barrier()')}
    phase='complete';complete=true;
  }catch(error){errorCode=typeof error?.code==='string'&&/^[A-Z0-9_]{2,64}$/.test(error.code)?error.code:'OWNED_PASSWORD_ADVERSARIAL_ASSERTION'}
  finally{
    await dropFault().catch(()=>{});
    await db.query('UPDATE public.users SET status=$2,account_locked=$3,must_change_password=$4 WHERE id=$1',[id,original.status,original.account_locked,original.must_change_password]);
    const reset=await call('/auth/v1/admin/users/'+id,input.serviceKey,{password:originalPassword},'PUT');
    check.equal(reset.status,200);actor.password=originalPassword;await login();
  }
  const passed=label=>checks.some(x=>x.label===label&&x.passed);
  return {verified:complete&&checks.length===7&&checks.every(x=>x.passed)&&races.length===4&&races.every(x=>x.passed&&x.recoveryPositive),complete,phase,errorCode,checks,races,
    coverage:{atomicCompletionFault:passed('completion-fault-atomic-rollback'),atomicAuditFault:passed('audit-fault-atomic-rollback'),
      actualResponseBodyAbort:passed('aborted-response-body-readback'),lossBeforeHeaders:false,receiptPrivacy:passed('receipt-cross-actor-hidden'),
      idReuseRefusal:passed('completed-id-reuse-refused'),stalePasswordSnapshot:passed('stale-current-password-snapshot'),
      revocationRaces:races.length===4&&races.every(x=>x.passed&&x.recoveryPositive),browserAndroid:false,fullRecoveryInvitationMatrix:false}};
}
