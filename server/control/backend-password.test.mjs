import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../../'+p,import.meta.url),'utf8');

test('config faults run against internal exact-image Auth variants and restore helpers/grants with effect snapshots',async()=>{
  const suite=await read('scripts/control-backend-password-config-checks.mjs');
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  const password=await read('scripts/control-backend-password-checks.mjs');
  for(const name of ['required-current-password-disabled','postgres-audit-disabled',
    'begin_password_change','complete_password_change','completion-invalid-contract'])assert.ok(suite.includes(name),name);
  assert.match(suite,/checks.length===7/);assert.match(suite,/finally\{await restore\(\)\}/);
  assert.match(suite,/encrypted_password/);assert.match(suite,/auth.sessions/);
  assert.match(suite,/auth.audit_log_entries/);assert.match(suite,/password_change_receipts/);
  assert.match(suite,/pg_get_functiondef/);assert.match(suite,/recoveryPositive=await positive/);
  assert.match(suite,/expectedStatus===503/);assert.match(suite,/config failure, not permission-denial evidence/);
  assert.match(runner,/info.Image,state.passwordAuthBuild.imageId/);
  assert.match(runner,/previous.passwordConfigSourceHash,state.passwordConfigSourceHash/);
  assert.match(runner,/passwordConfig:true/);
  assert.match(password,/configuration=await runPasswordConfigChecks/);
  assert.doesNotMatch(suite,/console\.|process\.env/);
});

test('native image build pins epoch/platform and checks uncached config/layer/binary identity without weakening full A/B',async()=>{
  const build=await read('scripts/control-backend-password-auth.mjs');
  const dockerfile=await read('deploy/auth/password-guard/Dockerfile');
  const proof=await read('scripts/test-control-password-auth-build.mjs');
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  assert.match(build,/passwordAuthSourceDateEpoch=1788964129/);
  assert.match(build,/--build-arg/);assert.match(build,/--provenance=false/);
  assert.match(build,/Date.parse\(info.Created\)/);assert.match(build,/binarySha256/);
  assert.match(build,/type=image,rewrite-timestamp=true/);
  assert.match(dockerfile,/ARG SOURCE_DATE_EPOCH/);assert.match(dockerfile,/touch --date=/);
  assert.match(dockerfile,/GOARCH=amd64/);assert.match(proof,/noCache:true/);
  assert.match(proof,/for\(const name of \['A','B'\]\)/);
  assert.match(proof,/assert.deepEqual\(a.rootFsLayers,b.rootFsLayers/);
  assert.match(runner,/previous.passwordAuthBuild\?\.imageId,state.passwordAuthBuild\?\.imageId/);
});

test('application caller build and native recovery context are bound into actual diagnostic and full runs',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  const caller=await read('scripts/control-backend-password-caller-checks.mjs');
  const sql=await read('supabase/migrations/20261021174812_password_change_verified_context.sql');
  assert.match(runner,/src\/lib\/password-change.ts/);assert.match(runner,/compiledHash/);
  assert.match(runner,/previous.passwordCallerBuild,state.passwordCallerBuild/);
  assert.match(runner,/passwordCaller:true/);
  assert.match(caller,/RoomQCPasswordCaller.createPasswordChangeFlow/);
  assert.match(caller,/checks.length===7/);assert.match(caller,/preHeaderNetworkLoss:false/);
  assert.match(sql,/auth.mfa_amr_claims/);assert.match(sql,/'otp','magiclink','recovery'/);
  assert.match(sql,/'session_id',v_session/);assert.match(sql,/SET search_path=''/);
  assert.doesNotMatch(sql,/user_metadata|GRANT ALL/);
});

test('password diagnostic is owned, bounded, records only sanitized effects and cannot be a full reference',async()=>{
  const suite=await read('scripts/control-backend-password-checks.mjs'),runner=await read('scripts/test-control-backend-sandbox.mjs');
  for(const s of ['profile-flag-only','user-metadata-not-authority','wrong-current-password','missing-current-password',
    'valid-current-password','password-login-and-other-session-revocation','admin-reset-not-user-completion',
    'deleted-session','locked','inactive','verified-recovery-password-change','observations.length===33'])assert.ok(suite.includes(s),s);
  assert.match(suite,/passwordHashChanged/);assert.doesNotMatch(suite,/console\.|process\.env\.(DATABASE_URL|SUPABASE_URL)/);
  assert.match(runner,/A diagnostic run cannot compare or supply full-build acceptance/);
  assert.match(runner,/previous\.passwordControls\?\.verified,true/);
  assert.match(runner,/previous\.passwordSourceHash,state\.passwordSourceHash/);
});

test('production email coordinator is bundled into the owned native password candidate with separate coverage',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  const caller=await read('scripts/control-backend-password-caller-checks.mjs');
  const email=await read('scripts/control-backend-email-caller-checks.mjs');
  assert.match(runner,/src\/lib\/email-auth-flow.ts/);assert.match(runner,/emailCompiledHash/);
  assert.match(runner,/globalName:'RoomQCEmailCaller'/);assert.match(runner,/bundle:true/);
  assert.match(caller,/emailCoordinator=await runEmailCallerChecks/);assert.match(caller,/check.equal\(emailCoordinator.verified,true/);
  assert.match(email,/checks.length===6/);assert.match(email,/actualApplicationCoordinator:true/);
  assert.match(email,/invitationEdge:false/);assert.match(email,/preHeaderNetworkLoss:false/);
  assert.match(email,/actual-email-password-free-reconcile/);assert.match(email,/late-otp-disposal-native-revoke/);
  assert.doesNotMatch(email,/console\.|process\.env\.(DATABASE_URL|SUPABASE_URL)/);
});

test('password fault/race matrix is separate from33 controls and preserves real barriers and allowed effects',async()=>{
  const extra=await read('scripts/control-backend-password-adversarial-checks.mjs'),suite=await read('scripts/control-backend-password-checks.mjs'),runner=await read('scripts/test-control-backend-sandbox.mjs');
  for(const label of ['private-guard-acl','completion','audit','aborted-response-body-readback','receipt-cross-actor-hidden','completed-id-reuse-refused','stale-current-password-snapshot'])assert.ok(extra.includes(label),label);
  assert.match(extra,/pg_blocking_pids/);assert.match(extra,/await waitBlocked\(pid,2\)/);
  assert.match(extra,/revoke-first/);assert.match(extra,/mutation-first/);
  assert.match(extra,/DROP TRIGGER roomqc_password_barrier/);assert.match(extra,/nextNoEffects/);
  assert.match(suite,/observations.length===33/);assert.match(suite,/check.equal\(adversarial.verified,true/);
  assert.match(runner,/Password fault\/race source changed during run/);
  assert.doesNotMatch(extra,/console\.|process\.env\.(DATABASE_URL|SUPABASE_URL)/);
});

test('default full candidate runs password checks after the retained self-profile suite',async()=>{
  const scope=await read('scripts/control-backend-hotel-scope-checks.mjs'),runner=await read('scripts/test-control-backend-sandbox.mjs');
  assert(scope.indexOf('selfProfileControls=await runSelfProfileChecks')<scope.indexOf('passwordControls=await runPasswordChecks',scope.indexOf("phase='self-profile-workflow'")));
  assert.match(runner,/assert\.equal\(state\.passwordControls\?\.verified,true/);
  assert.match(runner,/Password source changed during run/);
  assert.match(runner,/fixtureJwtSecret:secrets\.JWT_SECRET,passwordSdk:true/);
});

test('server policy and database audit are explicit in candidates, baseline preserves old defaults',async()=>{
  const runner=await read('scripts/test-control-backend-sandbox.mjs');
  assert.match(runner,/if\(diagnostic!=='password'\)/);
  assert.match(runner,/GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD='true'/);
  assert.match(runner,/GOTRUE_AUDIT_LOG_DISABLE_POSTGRES='false'/);
  assert.match(runner,/previous\.authPasswordPolicy,state\.authPasswordPolicy/);
});

test('controlled policy proof uses the installed SDK against the fixed owned gateway without persistent sessions',async()=>{
  const suite=await read('scripts/control-backend-password-checks.mjs');
  assert.match(suite,/createClient\('http:\/\/127\.0\.0\.1:8000'/);
  assert.match(suite,/persistSession:false,autoRefreshToken:false,detectSessionInUrl:false/);
  assert.match(suite,/sdk\.auth\.updateUser\(body\)/);
  assert.match(suite,/refreshToken:verify\.data\.refresh_token/);
});

test('native password extension is pinned and fences both sides of password storage inside UserUpdate transaction',async()=>{
  const build=await read('scripts/control-backend-password-auth.mjs'),go=await read('deploy/auth/password-guard/roomqc_password.go');
  assert.match(build,/4eee58f296d9698a1c2c0ae14d7a0b379c7622d3/);
  assert.match(build,/Exact pinned GoTrue patch point/);
  assert.match(build,/roomQCPreviousPassword = \*user\.EncryptedPassword/);
  assert.match(build,/roomQCPasswordGuard\(tx, false/);
  assert.match(build,/roomQCPasswordGuard\(tx, true/);
  assert.match(go,/private\.begin_password_change/);assert.match(go,/private\.complete_password_change/);
  assert.match(go,/expected\[result.Code\] == result.Status/);
  assert.doesNotMatch(go,/user_metadata|admin\/users|signInWithPassword/);
});

test('private native authorization locks exact Auth actor/profile/session and removes browser flag authority',async()=>{
  const sql=await read('supabase/migrations/20261021170824_auth_password_change_transaction_boundary.sql');
  const a=sql.indexOf('SELECT * INTO v_auth'),p=sql.indexOf('SELECT * INTO v_profile'),s=sql.indexOf('PERFORM 1 FROM auth.sessions');
  assert.ok(a<p&&p<s);
  assert.match(sql,/session_user IS DISTINCT FROM 'supabase_auth_admin'/);
  assert.match(sql,/id=p_session/);assert.match(sql,/p_previous_hash/);
  assert.match(sql,/PASSWORD_REQUIREMENT_SERVER_MANAGED/);
  assert.match(sql,/INSERT INTO private.password_change_receipts/);
  assert.match(sql,/actor_id=v_actor AND session_id::text=v_session/);
  assert.match(sql,/GRANT EXECUTE ON FUNCTION private.begin_password_change[\s\S]*TO supabase_auth_admin/);
  const privateGrants=[...sql.matchAll(/GRANT EXECUTE[^;]+;/g)].map(x=>x[0]).filter(x=>x.includes('private.begin_password_change'));
  assert.equal(privateGrants.length,1);
  assert.match(privateGrants[0],/TO supabase_auth_admin;/);
  assert.doesNotMatch(sql,/GRANT ALL/);
});
