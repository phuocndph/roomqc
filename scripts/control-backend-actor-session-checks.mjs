import assert from 'node:assert/strict';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// SQL is sent only through the owned sandbox's installer channel. Claims are
// from real GoTrue sessions created by HTTP, not authority for arbitrary users.
export function buildActorSessionChecks({owner,admin}={}){
  for(const actor of [owner,admin])for(const key of ['id','sessionId','tenantId','hotelId'])assert.match(actor?.[key]??'',uuid);
  return `BEGIN;
DO $checks$
DECLARE actor jsonb; root text; bad_state text; denials integer:=0;
BEGIN
  FOR actor IN SELECT value FROM jsonb_array_elements($actors$${JSON.stringify([
    {...owner,roots:[`SELECT private.room_setup_owner('${owner.hotelId}'::uuid)`,`SELECT private.subscription_quote_actor()`]},
    {...admin,roots:['SELECT public.platform_support_actor()','SELECT public.email_admin_actor()']},
  ])}$actors$::jsonb) LOOP
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor->>'id','role','authenticated','session_id',actor->>'sessionId')::text,true);
    IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=(actor->>'sessionId')::uuid AND user_id=(actor->>'id')::uuid) THEN
      RAISE EXCEPTION 'FIXTURE_LIVE_SESSION_REQUIRED'; END IF;
    FOR root IN SELECT jsonb_array_elements_text(actor->'roots') LOOP EXECUTE root; END LOOP;
    FOREACH bad_state IN ARRAY ARRAY['unconfirmed','banned','auth-deleted','profile-deleted','locked','inactive','null-status','expired-session','deleted-session','wrong-session','missing-session'] LOOP
      BEGIN
        CASE bad_state
          WHEN 'unconfirmed' THEN UPDATE auth.users SET email_confirmed_at=NULL WHERE id=(actor->>'id')::uuid;
          WHEN 'banned' THEN UPDATE auth.users SET banned_until=now()+interval '1 hour' WHERE id=(actor->>'id')::uuid;
          WHEN 'auth-deleted' THEN UPDATE auth.users SET deleted_at=now() WHERE id=(actor->>'id')::uuid;
          WHEN 'profile-deleted' THEN UPDATE public.users SET deleted_at=now() WHERE id=(actor->>'id')::uuid;
          WHEN 'locked' THEN UPDATE public.users SET account_locked=true WHERE id=(actor->>'id')::uuid;
          WHEN 'inactive' THEN UPDATE public.users SET status='inactive' WHERE id=(actor->>'id')::uuid;
          WHEN 'null-status' THEN UPDATE public.users SET status=NULL WHERE id=(actor->>'id')::uuid;
          WHEN 'expired-session' THEN UPDATE auth.sessions SET not_after=now()-interval '1 second' WHERE id=(actor->>'sessionId')::uuid;
          WHEN 'deleted-session' THEN DELETE FROM auth.sessions WHERE id=(actor->>'sessionId')::uuid AND user_id=(actor->>'id')::uuid;
          WHEN 'wrong-session' THEN PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor->>'id','role','authenticated','session_id',gen_random_uuid())::text,true);
          WHEN 'missing-session' THEN PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',actor->>'id','role','authenticated')::text,true);
        END CASE;
        FOR root IN SELECT jsonb_array_elements_text(actor->'roots') LOOP
          BEGIN
            EXECUTE root;
            RAISE EXCEPTION 'INVALID_ACTOR_STATE_NOT_DENIED';
          EXCEPTION WHEN insufficient_privilege THEN denials:=denials+1;
          END;
        END LOOP;
        -- Roll back each account/session/claim mutation before the next case.
        RAISE SQLSTATE 'Z0001';
      EXCEPTION WHEN SQLSTATE 'Z0001' THEN NULL;
      END;
      FOR root IN SELECT jsonb_array_elements_text(actor->'roots') LOOP EXECUTE root; END LOOP;
    END LOOP;
  END LOOP;
  IF denials<>44 THEN RAISE EXCEPTION 'ACTOR_DENIAL_COUNT_MISMATCH'; END IF;
END;
$checks$;
ROLLBACK;
SELECT json_build_object('verified',true,'roots',4,'invalidStates',11,'denials',44,'positiveBeforeAfter',true,'mutationsRolledBack',true);`;
}
