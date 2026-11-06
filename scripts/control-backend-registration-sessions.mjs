import assert from 'node:assert/strict';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function buildRegistrationSessionChecks(actor){
  for(const key of ['id','sessionId','workspaceId'])assert.match(actor?.[key]??'',uuid);
  const claims=JSON.stringify({sub:actor.id,role:'authenticated',session_id:actor.sessionId});
  const legacy=`SELECT (public.complete_registration('${actor.id}','Fixture','0901234567','Fixture',
    (SELECT email FROM auth.users WHERE id='${actor.id}'),'Fixture','Fixture','0901234567','fixture@roomqc.invalid',3)->>'success')::boolean`;
  const roots=[
    `SELECT (public.registration_actor()->>'id')='${actor.id}'`,
    legacy,
    `SELECT (public.provision_workspace_registration('${actor.workspaceId}','${actor.id}',
      jsonb_build_object('registrationSessionId','${actor.sessionId}'))->>'success')::boolean`
  ];
  return `BEGIN;
UPDATE private.roomqc_cluster_config SET directory_required=false;
DO $checks$
DECLARE root text; bad text; v_ok boolean; denials integer:=0;
BEGIN
  PERFORM set_config('request.jwt.claims',$claims$${claims}$claims$,true);
  FOREACH root IN ARRAY ARRAY[$root$${roots.join('$root$,$root$')}$root$] LOOP
    EXECUTE root INTO v_ok; IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'REGISTRATION_POSITIVE_REQUIRED'; END IF;
  END LOOP;
  FOREACH bad IN ARRAY ARRAY['unconfirmed','banned','auth-deleted','profile-deleted','locked','inactive','null-status','staff-profile','admin-profile','owner-role-revoked','expired-session','wrong-session','missing-session'] LOOP
    BEGIN
      -- Installer mutation of a synthetic fixture is not an end-user action.
      PERFORM set_config('request.jwt.claims','{}',true);
      CASE bad
        WHEN 'unconfirmed' THEN UPDATE auth.users SET email_confirmed_at=NULL WHERE id='${actor.id}';
        WHEN 'banned' THEN UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id='${actor.id}';
        WHEN 'auth-deleted' THEN UPDATE auth.users SET deleted_at=now() WHERE id='${actor.id}';
        WHEN 'profile-deleted' THEN UPDATE public.users SET deleted_at=now() WHERE id='${actor.id}';
        WHEN 'locked' THEN UPDATE public.users SET account_locked=true WHERE id='${actor.id}';
        WHEN 'inactive' THEN UPDATE public.users SET status='inactive' WHERE id='${actor.id}';
        WHEN 'null-status' THEN UPDATE public.users SET status=NULL WHERE id='${actor.id}';
        WHEN 'staff-profile' THEN UPDATE public.users SET role='staff',user_level_code='staff',is_primary_owner=false,created_by=id WHERE id='${actor.id}';
        WHEN 'admin-profile' THEN UPDATE public.users SET is_super_admin=true,is_primary_owner=false WHERE id='${actor.id}';
        WHEN 'owner-role-revoked' THEN DELETE FROM public.user_roles WHERE user_id='${actor.id}' AND role::text='owner';
        WHEN 'expired-session' THEN UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id='${actor.sessionId}';
        WHEN 'wrong-session' THEN NULL;
        WHEN 'missing-session' THEN DELETE FROM auth.sessions WHERE id='${actor.sessionId}';
      END CASE;
      PERFORM set_config('request.jwt.claims',$claims$${claims}$claims$,true);
      IF bad='wrong-session' THEN
        PERFORM set_config('request.jwt.claims',jsonb_build_object('sub','${actor.id}','role','authenticated','session_id',gen_random_uuid())::text,true);
      END IF;
      FOREACH root IN ARRAY ARRAY[$root$${roots.join('$root$,$root$')}$root$] LOOP
        -- The service branch explicitly carries the real initiating session.
        -- Wrong-session additionally changes that bound ID without creating a session.
        IF bad='wrong-session' AND position('provision_workspace_registration' IN root)>0 THEN
          root:=replace(root,'${actor.sessionId}',gen_random_uuid()::text);
        END IF;
        BEGIN EXECUTE root; RAISE EXCEPTION 'INVALID_REGISTRATION_ACTOR_NOT_DENIED';
        EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1; END;
      END LOOP;
      RAISE SQLSTATE 'Z0001';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL; END;
    FOREACH root IN ARRAY ARRAY[$root$${roots.join('$root$,$root$')}$root$] LOOP
      EXECUTE root INTO v_ok; IF v_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'REGISTRATION_RECOVERY_REQUIRED'; END IF;
    END LOOP;
  END LOOP;
  IF denials<>39 THEN RAISE EXCEPTION 'REGISTRATION_DENIAL_COUNT_MISMATCH'; END IF;
  UPDATE private.roomqc_cluster_config SET directory_required=true;
  IF (public.complete_registration('${actor.id}','Fixture','0901234567','Fixture',
    (SELECT email FROM auth.users WHERE id='${actor.id}'),'Fixture','Fixture','0901234567','fixture@roomqc.invalid',3)->>'success')::boolean IS DISTINCT FROM false
    THEN RAISE EXCEPTION 'DIRECTORY_GATE_REQUIRED'; END IF;
END;
$checks$;
ROLLBACK;
SELECT json_build_object('verified',true,'roots',3,'invalidStates',13,'denials',39,
  'directoryGateVerified',true,'positiveBeforeAfter',true,'mutationsRolledBack',true);`;
}
