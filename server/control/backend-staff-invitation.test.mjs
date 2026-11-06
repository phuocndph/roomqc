import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');

test('backend sandbox scripts parse before an expensive actual replay',()=>{
  for(const file of ['scripts/control-backend-staff-invitation-checks.mjs',
    'scripts/control-backend-invitation-delivery.mjs','scripts/control-backend-invitation-authority.mjs','scripts/test-control-backend-sandbox.mjs']){
    const result=spawnSync(process.execPath,['--check',fileURLToPath(new URL('../../'+file,import.meta.url))],{encoding:'utf8',windowsHide:true});
    assert.equal(result.status,0,'Sandbox source must parse: '+file);
  }
});

test('invitation Edge uses verified actor/session and a versioned transactional result',async()=>{
  const edge=await read('supabase/functions/_shared/email/staff-invitations.ts');
  assert.match(edge,/verifiedStaffInvitationContext\(getBearerToken\(req\), user\)/);
  assert.match(edge,/client.rpc\('staff_invitation_action'/);
  assert.match(edge,/p_actor: context.actorId, p_session: context.sessionId/);
  assert.match(edge,/data.actor_id !== context.actorId \|\| data.session_id !== context.sessionId/);
  assert.doesNotMatch(edge,/client.rpc\('accept_staff_invitation'/);
});

test('invitation boundary is service-only, private and fences exact live session before acceptance effects',async()=>{
  const sql=await read('supabase/migrations/20261021194814_staff_invitation_live_acceptance.sql');
  assert.match(sql,/CREATE FUNCTION private.staff_invitation_action/);
  assert.match(sql,/RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''/);
  assert.match(sql,/current_setting\('role',true\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql,/WHERE user_id=p_actor AND id=p_session/);
  assert.match(sql,/not_after>clock_timestamp\(\)/);
  assert(sql.indexOf('FROM auth.users WHERE id=ANY(v_ids)')<sql.indexOf('WHERE id=v_hint.id AND auth_user_id=p_actor FOR UPDATE'));
  assert(sql.indexOf('INVITATION_SESSION_REQUIRED\' USING ERRCODE=\'42501\'; END IF;')<sql.indexOf('INSERT INTO public.users'));
  assert.match(sql,/FROM private.password_change_receipts WHERE actor_id=p_actor/);
  assert.match(sql,/completed_at>=v_row.created_at AND completed_at>=v_row.password_set_at/);
  assert.match(sql,/REVOKE EXECUTE ON FUNCTION public.accept_staff_invitation\(uuid,uuid\) FROM service_role/);
  assert.doesNotMatch(sql,/GRANT ALL|TO authenticated|TO anon|user_metadata/);
});

test('accepted invitation replay is read-only and requires current profile/role/assignment',async()=>{
  const sql=await read('supabase/migrations/20261021194814_staff_invitation_live_acceptance.sql');
  const replay=sql.slice(sql.indexOf("IF v_row.status='accepted' THEN"),sql.indexOf("IF p_action='status' THEN"));
  assert.match(replay,/INVITATION_MEMBERSHIP_REQUIRED/);
  assert.match(replay,/FROM public.user_roles/);assert.match(replay,/FROM public.user_hotels/);
  assert.match(replay,/'idempotent',true,'accepted_at',v_row.accepted_at/);
  assert.doesNotMatch(replay,/INSERT INTO|UPDATE public|DELETE FROM/);
});

test('invitation diagnostic executes compiled production callers and preserves limited coverage',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  const harness=await read('scripts/control-backend-staff-invitation-checks.mjs');
  assert.match(runner,/invitationCaller\.source\+'\\n'\+deliverySource\+'\\n'\+authoritySource\+'\\n'\+invitationSource/);
  assert.match(runner,/previous.staffInvitationCallerBuild,state.staffInvitationCallerBuild/);
  assert.match(runner,/staffInvitationSchemaAfterAdvisors/);
  assert.match(harness,/RoomQCStaffInvitationCaller.createStaffInvitationClient/);
  assert.match(harness,/RoomQCEmailCaller.createEmailAuthCoordinator/);
  assert.match(harness,/puts===1&&accepts===1/);
  assert.match(harness,/callerChecks.length===callerExpected.length/);
  assert.match(harness,/fullInviterRoleMatrix:false,createResendRevokeEndpoint:deliveryControls\?\.verified===true,externalMail:false,observedLockMatrix:false,browserAndroid:false/);
});

test('actual delivery harness retains disabled-provider controls and has no external SMTP path',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs'),delivery=await read('scripts/control-backend-invitation-delivery.mjs');
  assert.match(runner,/ROOMQC_EMAIL_PROVIDER:'disabled',ROOMQC_EMAIL_ENVIRONMENT:'local'/);
  assert.match(runner,/GOTRUE_SMTP_HOST:'api-gw',GOTRUE_SMTP_PORT:'2525'/);
  assert.match(runner,/create-user\/index.ts/);
  assert.match(runner,/previous.staffInvitationDeliverySourceHash,state.staffInvitationDeliverySourceHash/);
  assert.match(delivery,/refusalTime\+61500-Date.now\(\)/);
  assert.match(delivery,/durableExactlyOnceExternalDelivery:false/);
  assert.doesNotMatch(delivery,/UPDATE .*sent_at|smtp\.resend|resend\.com|writeFile|process\.stdout/);
});

test('management Edge uses one verified RPC workflow and no direct invitation writes',async()=>{
  const edge=await read('supabase/functions/_shared/email/staff-invitations.ts');
  const management=await read('supabase/functions/_shared/email/staff-invitation-management.ts');
  assert.match(edge,/manageStaffInvitation\(action, body, context/);
  assert.match(edge,/client.rpc\('staff_invitation_manage'/);
  assert.doesNotMatch(edge,/client.from\('staff_invitations'\)|client.rpc\('prepare_staff_invitation'|client.rpc\('validate_staff_inviter'/);
  assert.match(management,/\['list', 'create', 'resend', 'revoke'\]/);
  assert.match(management,/call\('finish', \{ id: sending.id, reservedAt: sending.sent_at, authUserId \}/);
});

test('management SQL keeps current authority and exact reservation changes inside the private transaction',async()=>{
  const sql=await read('supabase/migrations/20261021204555_staff_invitation_live_management.sql');
  assert.match(sql,/CREATE FUNCTION private.staff_invitation_manage/);
  assert.match(sql,/RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''/);
  assert.match(sql,/current_setting\('role',true\) IS DISTINCT FROM 'service_role'/);
  assert.match(sql,/WHERE user_id=p_actor AND id=p_session/);
  assert.match(sql,/v_row.sent_at IS DISTINCT FROM v_reserved/);
  assert.match(sql,/REVOKE SELECT ON public.staff_invitations FROM authenticated/);
  assert.match(sql,/REVOKE EXECUTE ON FUNCTION public.prepare_staff_invitation.*FROM service_role/);
  assert(sql.indexOf('INVITATION_SESSION_REQUIRED\' USING ERRCODE=\'42501\'; END IF;')<sql.indexOf('UPDATE public.staff_invitations SET status='));
});

test('native recipient binding resolves one canonical email before ordered locks without granting membership',async()=>{
  const sql=await read('supabase/migrations/20261021213202_staff_invitation_native_recipient_binding.sql');
  assert.match(sql,/array_agg\(id ORDER BY id\).*FROM auth.users WHERE lower\(email\)=v_hint.email/);
  assert.match(sql,/cardinality\(v_recipients\),0\)>1/);
  assert(sql.indexOf('v_target:=v_recipients[1]')<sql.indexOf('FROM auth.users WHERE id=ANY(v_ids)'));
  assert.match(sql,/v_row.auth_user_id IS DISTINCT FROM v_target/);
  assert.match(sql,/aud='authenticated' AND NOT COALESCE\(is_sso_user,false\)/);
  assert.match(sql,/REVOKE ALL.*FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/SET encrypted_password|INSERT INTO public.user_roles|INSERT INTO public.user_hotels|GRANT.*TO authenticated/);
});

test('current management receipts bind tenant and selected hotel before mutation without broad grants',async()=>{
  const sql=await read('supabase/migrations/20261021215113_staff_invitation_management_context_receipts.sql');
  assert.match(sql,/p_payload->>'tenantId'.*IS DISTINCT FROM v_tenant/);
  assert.match(sql,/p_payload->>'hotelId'.*IS DISTINCT FROM v_hotel/);
  assert(sql.indexOf("p_payload ? 'tenantId'")<sql.indexOf("UPDATE public.staff_invitations SET status='revoked'"));
  assert.match(sql,/'tenant_id',v_tenant/);
  assert.match(sql,/i.hotel_id=\(p_payload->>'hotelId'\)::uuid/);
  assert.match(sql,/WHERE user_id=p_actor AND id=p_session/);
  assert.match(sql,/REVOKE ALL.*FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/GRANT.*TO authenticated|SET encrypted_password|INSERT INTO public.user_hotels/);
});

test('current production management caller is compiled into actual backend diagnostic',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  const checks=await read('scripts/control-backend-staff-invitation-checks.mjs');
  assert.match(runner,/globalName:'RoomQCInvitationAdmin'/);
  assert.match(runner,/adminCompiledHash/);
  assert.match(checks,/RoomQCInvitationAdmin.createInvitationAdminClient/);
  assert.match(checks,/adminChecks.length===adminExpected.length/);
  assert.match(checks,/compiled-admin-wrong-hotel-no-effects/);
  assert.match(checks,/compiled-admin-old-session-no-dispatch/);
});

test('keyset pages retain live authority checks, a deterministic cursor and a bounded indexed scan',async()=>{
  const sql=await read('supabase/migrations/20261021221928_staff_invitation_keyset_pages.sql');
  assert.match(sql, /WHERE user_id=p_actor AND id=p_session/);
  assert.match(sql, /\(i.created_at,i.id\)<\(v_cursor_created,v_cursor_id\)/);
  assert.match(sql, /ORDER BY i.created_at DESC,i.id DESC LIMIT v_page_size\+1/);
  assert.match(sql, /'page_cursor',p_payload->'cursor','next_cursor',v_next/);
  assert.match(sql, /ON public.staff_invitations\(tenant_id,created_at DESC,id DESC\) WHERE status='pending'/);
  assert.doesNotMatch(sql, /OFFSET [0-9]|GRANT.*TO authenticated|INSERT INTO public.user_hotels/);
});

test('actual paged diagnostic walks over a hundred invitations and sends through the compiled admin',async()=>{
  const harness=await read('scripts/control-backend-staff-invitation-checks.mjs');
  const delivery=await read('scripts/control-backend-invitation-delivery.mjs');
  assert.match(harness, /generate_series\(1,123\)/);
  assert.match(harness, /JSON.stringify\(walked.ids\)===JSON.stringify\(expectedPageIds\)/);
  assert.match(harness, /compiled-admin-page-capability-revoked/);
  assert.match(delivery, /await admin.create\(adminContext/);
  assert.match(delivery, /await admin.act\(adminContext,sendTarget,'resend'\)/);
  assert.match(delivery, /subsetOfDeliveryChecks:true/);
});

test('owned authority inventory uses real native setup and observed SQL blockers without claiming full coverage',async()=>{
  const source=await read('scripts/control-backend-invitation-authority.mjs'),runner=await read('scripts/test-control-backend-sandbox.mjs');
  assert.match(source,/pg_blocking_pids/);assert.match(source,/observedFirst&&observedSecond/);
  for(const label of ['position-inactive','inviter-capability-removed','report-role-removed',
    'accept-before-revoke','revoke-before-password','password-before-accept'])assert.ok(source.includes(label),label);
  assert.match(source,/denied=await accept\(c.user,c.invitation\)/);
  assert.match(source,/recovery=await accept\(c.user,c.invitation\)/);
  assert.match(source,/roomqc_password_change_id:id/);assert.match(source,/fullAuthorityMatrix:false/);
  assert.match(runner,/previous.staffInvitationAuthoritySourceHash,state.staffInvitationAuthoritySourceHash/);
  assert.doesNotMatch(source,/console\.|process\.env|writeFile|smtp\.resend|resend\.com/);
});

test('default invitation fixtures follow provider queue checks instead of deleting legitimate welcome mail',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  const provider=runner.indexOf("emit('backend_email_provider_verified'");
  const invitation=runner.indexOf('await runInvitationStage();',provider);
  assert(provider>0&&invitation>provider&&invitation<runner.indexOf("state.phase='hotel_delete_checks'"));
  assert.match(runner,/if\(diagnostic==='staff-invitation'\)\{await runInvitationStage\(\);return;\}/);
  const source=await read('scripts/control-backend-email-provider-checks.mjs');
  assert.match(source,/n,0,'Provider stage must precede other fixture queues'/);
});

test('pending acceptance fences active position, approved tenant and live report role/assignment without changing replay',async()=>{
  const sql=await read('supabase/migrations/20261021225012_staff_invitation_acceptance_current_assignment.sql');
  assert.match(sql,/positions WHERE id=v_row.position_id AND tenant_id=v_row.tenant_id AND status='active' FOR SHARE/);
  assert.match(sql,/tenants WHERE id=v_row.tenant_id AND approval_status='approved' FOR UPDATE/);
  const report=sql.slice(sql.indexOf('IF v_row.reports_to IS NOT NULL'),sql.indexOf('PERFORM 1 FROM public.tenants'));
  assert.match(report,/public.user_roles/);assert.match(report,/public.user_hotels/);
  assert.match(report,/u.tenant_id=v_row.tenant_id AND u.hotel_id=v_row.hotel_id/);
  assert(sql.indexOf('INVITATION_POSITION_REQUIRED')<sql.indexOf('INSERT INTO public.users'));
  const replay=sql.slice(sql.indexOf("IF v_row.status='accepted' THEN"),sql.indexOf("IF p_action='status' THEN"));
  assert.doesNotMatch(replay,/INSERT INTO|UPDATE public|DELETE FROM|public.positions/);
  assert.match(sql,/REVOKE ALL.*FROM PUBLIC,anon,authenticated/);
  assert.doesNotMatch(sql,/TO authenticated|TO anon|GRANT ALL|user_metadata/);
});
