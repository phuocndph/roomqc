// Q02: real native Auth/REST and final-schema writer inventory, disposable only.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
const input = JSON.parse(process.env.ROOMQC_FIXTURE_WORKFLOW_INPUT ?? 'null');
assert.match(input?.run ?? '', /^[a-f0-9]{12}$/);
const db = new pg.Pool({ host: 'db', port: 5432, user: 'postgres', database: 'postgres', password: input.databasePassword,
  max: 5, statement_timeout: 15000, connectionTimeoutMillis: 5000, application_name: 'owned-room-writers-' + input.run });
const checks = [], races = []; let serial = 0;
const record = (label, passed, details = {}) => checks.push({ label, passed, ...details });
async function call(path, token, body) {
  const res = await fetch('http://127.0.0.1:8000' + path, { method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { apikey: input.publishableKey, authorization: 'Bearer ' + token, 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify(body) });
  let data; try { data = await res.json(); } catch { data = null; } return { status: res.status, data };
}
const rpc = (name, actor, body = {}) => call('/rest/v1/rpc/' + name, actor.token ?? actor, body);
async function insert(table, value) {
  const res = await call('/rest/v1/' + table, input.serviceKey, value);
  assert.equal(res.status, 201, 'Owned writer fixture insert: ' + table + ' code=' + String(res.data?.code) + ' serial=' + serial); return res.data[0];
}
async function account(label) {
  const actor = { email: 'writers-' + input.run + '-' + label + '@roomqc.invalid', password: randomBytes(32).toString('hex') };
  const created = await call('/auth/v1/admin/users', input.serviceKey, { email: actor.email, password: actor.password, email_confirm: true });
  assert.equal(created.status, 200); actor.id = created.data.id;
  const login = await call('/auth/v1/token?grant_type=password', input.publishableKey, { email: actor.email, password: actor.password });
  assert.equal(login.status, 200); actor.token = login.data.access_token;
  actor.sessionId = JSON.parse(Buffer.from(actor.token.split('.')[1], 'base64url')).session_id; return actor;
}
async function owner(label) {
  const actor = await account(label);
  const res = await rpc('provision_workspace_registration', input.serviceKey, { p_workspace_id: randomUUID(), p_owner_id: actor.id,
    p_fields: { fullName: 'Owned writer fixture', phone: '0901234567', tenantName: 'Owned writer fixture', hotelName: 'Owned writer fixture',
      hotelAddress: '123 Fixture Road', hotelPhone: '0281234567', hotelEmail: actor.email, totalRooms: 3 } });
  assert.equal(res.status, 200); assert.equal(res.data.success, true);
  // Expanded fault/race inventory needs more than the seeded 50-room trial.
  // Clone the plan for this disposable tenant; never loosen the quota trigger
  // or change the production/default subscription policy to fit a test.
  const plan = (await db.query(`INSERT INTO public.subscription_plans SELECT * FROM jsonb_populate_record(NULL::public.subscription_plans,
    (SELECT to_jsonb(p) FROM public.subscription_plans p JOIN public.tenants t ON t.subscription_plan_id=p.id WHERE t.id=$1)
    ||jsonb_build_object('id',gen_random_uuid(),'code',$2::text,'name','Owned 500-room writer fixture','max_rooms',500)) RETURNING id`,
    [res.data.tenant_id, 'owned_writer_' + input.run + '_' + label])).rows[0];
  await db.query('UPDATE public.tenants SET subscription_plan_id=$2,registered_rooms=500 WHERE id=$1', [res.data.tenant_id, plan.id]);
  return { ...actor, tenantId: res.data.tenant_id, hotelId: res.data.hotel_id };
}
async function configureHotel(id, minutes = 0, photoMode = 'none', enabled = true) {
  await db.query(`UPDATE public.hotels SET photo_evidence_mode=$2::public.photo_evidence_mode,
    settings=jsonb_set(COALESCE(settings,'{}'::jsonb),'{room_check}',jsonb_build_object('quick_path_enabled',$3::boolean,'quick_path_rate_limit_minutes',$4::int)) WHERE id=$1`, [id, photoMode, enabled, minutes]);
}
const room = (a, hotelId = a.hotelId, status = 'vacant_clean') => insert('rooms', { id: randomUUID(), tenant_id: a.tenantId, hotel_id: hotelId,
  room_number: 'W' + (++serial), room_type: 'standard', floor: 1, status });
async function booking(a, r, status = 'confirmed', extra = {}) {
  return insert('room_bookings', { id: randomUUID(), tenant_id: a.tenantId, hotel_id: r.hotel_id, room_id: r.id,
    guest_name: 'Owned synthetic guest', check_in_date: new Date().toISOString().slice(0, 10), check_out_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    status, created_by: a.id, booking_type: 'daily', ...extra });
}
const quick = (a, r, extra = {}) => rpc('perform_quick_room_check', a, { _room_id: r.id, _check_type: 'daily', _notes: 'Owned quick check', _photos: [], ...extra });
const undo = (a, id, extra = {}) => rpc('undo_quick_room_check', a, { _check_id: id, _reason: 'Owned undo', ...extra });
const lookup = (a, id) => rpc('get_room_check_command_result', a, { p_command_id: id });
const transfer = (a, b, r, extra = {}) => rpc('transfer_booking_room', a, { p_booking_id: b.id, p_new_room_id: r.id, p_reason: 'Owned transfer', ...extra });
const checkin = (a, b, r, extra = {}) => rpc('perform_checkin', a, { p_booking_id: b.id, p_room_id: r.id, ...extra });
const checkout = (a, b, r, extra = {}) => rpc('perform_checkout', a, { p_booking_id: b.id, p_room_id: r.id, ...extra });
const bookingLookup = (a, id) => rpc('get_booking_room_command_result', a, { p_command_id: id });
async function snapshot() {
  return (await db.query(`SELECT jsonb_build_object(
    'rooms',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.rooms r),
    'bookings',(SELECT jsonb_agg(to_jsonb(b) ORDER BY id) FROM public.room_bookings b),
    'checks',(SELECT jsonb_agg(to_jsonb(c) ORDER BY id) FROM public.room_checks c),
    'check_sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM public.room_check_sessions s),
    'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM public.audit_log a),
    'check_commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.workflow_room_check_commands c),
    'booking_commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.booking_room_commands c),
    'no_show_resolutions',(SELECT jsonb_agg(to_jsonb(c) ORDER BY booking_id) FROM private.booking_no_show_resolutions c),
    'invoices',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.guest_invoices i),
    'notification_events',(SELECT jsonb_agg(to_jsonb(e) ORDER BY id) FROM private.booking_notification_events e),
    'notification_outbox',(SELECT jsonb_agg(to_jsonb(j) ORDER BY event_id,channel) FROM private.booking_notification_outbox j),
    'notification_receipts',(SELECT jsonb_agg(to_jsonb(r) ORDER BY event_id,user_id) FROM private.booking_notification_receipts r),
    'notifications',(SELECT jsonb_agg(to_jsonb(n) ORDER BY id) FROM public.in_app_notifications n),
    'external_targets',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.booking_notification_targets t),
    'external_attempts',(SELECT jsonb_agg(to_jsonb(t) ORDER BY id) FROM private.booking_notification_attempts t),
    'external_config',(SELECT jsonb_agg(to_jsonb(t) ORDER BY channel) FROM private.booking_notification_channel_config t),
    'external_operator_commands',(SELECT jsonb_agg(to_jsonb(t) ORDER BY command_id) FROM private.booking_notification_operator_commands t),
    'inspections',(SELECT jsonb_agg(to_jsonb(i) ORDER BY id) FROM public.checkout_inspection_requests i),
    'commands',(SELECT jsonb_agg(to_jsonb(c) ORDER BY actor_id,command_id) FROM private.workflow_room_transition_commands c))::text AS value`)).rows[0].value;
}
async function roomState(id) {
  return (await db.query(`SELECT r.status,(SELECT count(*)::int FROM public.room_checks c WHERE c.room_id=r.id) AS checks,
    (SELECT count(*)::int FROM private.workflow_room_transition_commands c WHERE c.room_id=r.id AND c.event_id IS NOT NULL) AS events,
    (SELECT count(*)::int FROM public.audit_log a WHERE a.record_id=r.id AND a.table_name='rooms' AND a.action='state_change') AS audit
    FROM public.rooms r WHERE r.id=$1`, [id])).rows[0];
}
async function denied(label, action, statuses = [401, 403]) {
  const before = await snapshot(), res = await action(), effectsUnchanged = before === await snapshot();
  record(label, statuses.includes(res.status) && effectsUnchanged, { status: res.status, effectsUnchanged,
    serverCode: /^[A-Z0-9]{5}$/.test(res.data?.code??'')?res.data.code:null,
    serverReason: /^[A-Z][A-Z_0-9]{2,80}$/.test(res.data?.message??'')?res.data.message:null }); return res;
}
async function lockBarrier(name, expected = 1) {
  const deadline = Date.now() + 6000;
  while (Date.now() < deadline) {
    const q = await db.query(`SELECT count(*)::int AS n FROM pg_stat_activity WHERE pid<>pg_backend_pid() AND state='active'
      AND wait_event_type='Lock' AND query LIKE $1`, ['%' + name + '%']);
    if (q.rows[0].n >= expected) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('ROOM_WRITER_LOCK_BARRIER_NOT_OBSERVED');
}
async function quickExpiry(a, r) {
  const lock = await db.connect(); const label = 'quick-expiry-during-real-room-lock-denied';
  try {
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1", [a.sessionId]);
    const before = await snapshot(); await lock.query('BEGIN'); await lock.query('SELECT id FROM public.rooms WHERE id=$1 FOR UPDATE', [r.id]);
    const pending = quick(a, r); await lockBarrier('perform_quick_room_check'); await db.query('SELECT pg_sleep(1.6)');
    await lock.query('COMMIT'); const res = await pending, effectsUnchanged = before === await snapshot();
    const passed = res.status === 403 && effectsUnchanged;
    record(label, passed, { status: res.status, effectsUnchanged, realLockBarrier: true }); races.push({ label, passed, realLockBarrier: true });
  } finally { await lock.query('ROLLBACK'); lock.release(); await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [a.sessionId]); }
}
async function quickAuditFault(a, r) {
  const before = await snapshot();
  await db.query(`CREATE FUNCTION private.owned_writer_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.table_name='room_checks' AND NEW.action='quick_submit' THEN RAISE EXCEPTION 'OWNED_WRITER_FAULT'; END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_writer_fault BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION private.owned_writer_fault()`);
  let res; try { res = await quick(a, r); }
  finally { await db.query('DROP TRIGGER owned_writer_fault ON public.audit_log;DROP FUNCTION private.owned_writer_fault()'); }
  const effectsUnchanged = before === await snapshot(); record('quick-audit-fault-rolls-back-compound-effects', res.status >= 400 && effectsUnchanged, { status: res.status, effectsUnchanged });
  const recovered = await quick(a, r); record('quick-audit-fault-recovery-positive', recovered.status === 200, { status: recovered.status });
}
async function commandFault(a, r, target, expire = false) {
  const table = target === 'source_audit' ? 'public.audit_log' : 'private.workflow_room_check_commands';
  const commandId = randomUUID(), before = await snapshot();
  const condition = target === 'source_audit' ? `NEW.table_name='rooms' AND NEW.record_id='${r.id}'::uuid` : `NEW.command_id='${commandId}'::uuid`;
  await db.query(`CREATE FUNCTION private.owned_check_command_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF ${condition} THEN ${expire ? 'PERFORM pg_sleep(1.6);' : "RAISE EXCEPTION 'OWNED_CHECK_COMMAND_FAULT';"} END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_check_command_fault ${expire ? 'AFTER' : 'BEFORE'} INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_check_command_fault()`);
  let res;
  try {
    if (expire) await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1", [a.sessionId]);
    res = await quick(a, r, { _command_id: commandId });
  } finally {
    await db.query(`DROP TRIGGER owned_check_command_fault ON ${table};DROP FUNCTION private.owned_check_command_fault()`);
    if (expire) await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [a.sessionId]);
  }
  const effectsUnchanged = before === await snapshot();
  record('quick-' + target + (expire ? '-expiry' : '-fault') + '-rolls-back-all-effects', (expire ? res.status === 403 : res.status >= 400) && effectsUnchanged,
    { status: res.status, effectsUnchanged });
  const recovered = await quick(a, r, { _command_id: commandId }), rs = await roomState(r.id);
  record('quick-' + target + (expire ? '-expiry' : '-fault') + '-same-key-recovery-positive', recovered.status === 200 && rs.checks === 1 && rs.events === 1,
    { status: recovered.status, checkCount: rs.checks, canonicalEvents: rs.events });
}
async function commandChecks(a, b, manager) {
  const r = await room(a, a.hotelId, 'vacant_dirty'), id = randomUUID();
  const twenty = await Promise.all(Array.from({ length: 20 }, () => quick(a, r, { _command_id: id }))), state = await roomState(r.id);
  record('quick-twenty-same-key-replays-one-check-and-source-event', twenty.every(x => x.status === 200 && x.data?.command_id === id && x.data?.check_id === twenty[0].data?.check_id)
    && state.checks === 1 && state.events === 1 && state.audit === 1, { requests: 20, checkCount: state.checks, canonicalEvents: state.events, roomAudit: state.audit });
  await denied('quick-same-key-different-payload-conflict', () => quick(a, r, { _command_id: id, _notes: 'Different intent' }), [409]);
  const recovered = await lookup(a, id); record('quick-lost-response-result-lookup-positive', recovered.status === 200 && recovered.data?.check_id === twenty[0].data?.check_id && recovered.data?.replayed === true, { status: recovered.status });
  const foreign = await lookup(b, id); record('quick-foreign-actor-result-is-hidden', foreign.status === 200 && foreign.data === null, { status: foreign.status });
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1', [a.id]);
  await denied('quick-locked-owner-result-lookup-denied', () => lookup(a, id));
  await db.query('UPDATE public.users SET account_locked=false WHERE id=$1', [a.id]);
  const occupied = await room(a, a.hotelId, 'occupied_dirty'), cleaned = await quick(a, occupied);
  record('quick-occupied-dirty-positive-preserves-occupancy', cleaned.status === 200 && (await roomState(occupied.id)).status === 'occupied_clean', { status: cleaned.status });
  const undoId = randomUUID(), checkId = twenty[0].data?.check_id;
  if (checkId) {
    const twentyUndo = await Promise.all(Array.from({ length: 20 }, () => undo(a, checkId, { _command_id: undoId })));
    const n = (await db.query("SELECT count(*)::int AS n FROM public.audit_log WHERE record_id=$1 AND table_name='room_checks' AND action='undo_quick'", [checkId])).rows[0].n;
    record('quick-undo-twenty-same-key-replays-one-audit', twentyUndo.every(x => x.status === 200 && x.data?.command_id === undoId) && n === 1, { requests: 20, undoAudit: n });
    const looked = await lookup(a, undoId); record('quick-undo-result-lookup-positive', looked.status === 200 && looked.data?.status === 'undone', { status: looked.status });
    await denied('quick-operation-key-cannot-be-reused-for-undo', () => undo(a, checkId, { _command_id: id }), [409]);
  }
  const mr = await room(a), mid = randomUUID(), mres = await quick(manager, mr, { _command_id: mid }); assert.equal(mres.status, 200);
  await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2', [manager.id, a.hotelId]);
  await denied('quick-removed-assignment-replay-denied', () => quick(manager, mr, { _command_id: mid }));
  await denied('quick-removed-assignment-result-lookup-denied', () => lookup(manager, mid));
  await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)', [manager.id, a.hotelId, a.id]);
  await denied('quick-anonymous-execution-denied', () => quick(input.publishableKey, mr));
  await denied('quick-service-key-execution-denied', () => quick(input.serviceKey, mr));
  await commandFault(a, await room(a, a.hotelId, 'vacant_dirty'), 'source_audit');
  await commandFault(a, await room(a, a.hotelId, 'vacant_dirty'), 'command_result');
  await commandFault(a, await room(a, a.hotelId, 'vacant_dirty'), 'command_result', true);
}
async function inventory() {
  const rows = (await db.query(`SELECT n.nspname AS schema,p.oid::regprocedure::text AS signature,p.proname AS name,p.prosecdef AS security_definer,
    pg_get_userbyid(p.proowner) AS owner,has_function_privilege('anon',p.oid,'EXECUTE') AS anon_execute,
    has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_execute,has_function_privilege('service_role',p.oid,'EXECUTE') AS service_execute,
    pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.prokind='f'
    AND (p.proname = ANY($1::text[]) OR pg_get_functiondef(p.oid) ~* '(UPDATE|INSERT INTO|DELETE FROM)[[:space:]]+(public\\.)?(rooms|room_checks|room_bookings)\\M')
    ORDER BY n.nspname,p.proname,p.oid::regprocedure::text`, [[ 'perform_quick_room_check', 'undo_quick_room_check', 'transfer_booking_room', 'perform_checkin', 'perform_checkout',
    'transition_booking_status', 'update_room_status_safe', 'submit_room_check_lean', 'reopen_room_check', 'lift_expired_dnd_oos' ]])).rows;
  const triggers = (await db.query(`SELECT n.nspname AS schema,c.relname AS table_name,t.tgname AS trigger,p.oid::regprocedure::text AS function
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=t.tgfoid
    WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relname IN('rooms','room_checks','room_bookings') ORDER BY c.relname,t.tgname`)).rows;
  return { functions: rows.map(({ definition, ...row }) => ({ ...row, definitionSha256: createHash('sha256').update(definition).digest('hex'),
    lexicalRoomWrite: /(?:UPDATE|INSERT INTO|DELETE FROM)\s+(?:public\.)?rooms\b/i.test(definition) })), triggers,
    limitation: 'Final catalog inventory and lexical candidates only; dynamic calls, deployed consumers and all indirect paths remain to be dispositioned.' };
}
async function bookingFault(a, b, r, operation, target = 'booking_result', expire = false) {
  const commandId = randomUUID(), before = await snapshot();
  const table = target === 'room_source' ? 'private.workflow_room_transition_commands' : target === 'booking_audit' ? 'public.audit_log' : 'private.booking_room_commands';
  const condition = target === 'room_source' ? `NEW.room_id='${r.id}'::uuid` : target === 'booking_audit'
    ? `NEW.table_name='room_bookings' AND NEW.record_id='${b.id}'::uuid` : `NEW.command_id='${commandId}'::uuid`;
  await db.query(`CREATE SEQUENCE private.owned_booking_fault_hits;
    CREATE FUNCTION private.owned_booking_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF ${condition} THEN PERFORM nextval('private.owned_booking_fault_hits'); ${expire ? 'PERFORM pg_sleep(1.6);' : "RAISE EXCEPTION 'OWNED_BOOKING_FAULT';"} END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_booking_fault ${expire ? 'AFTER' : 'BEFORE'} INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_booking_fault()`);
  const perform = () => operation === 'transfer' ? transfer(a, b, r, { p_command_id: commandId })
    : operation === 'checkin' ? checkin(a, b, r, { p_command_id: commandId }) : checkout(a, b, r, { p_command_id: commandId });
  let res, faultReached;
  try {
    if (expire) await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1", [a.sessionId]);
    res = await perform();
  } finally {
    faultReached = (await db.query('SELECT is_called FROM private.owned_booking_fault_hits')).rows[0].is_called;
    await db.query(`DROP TRIGGER owned_booking_fault ON ${table};DROP FUNCTION private.owned_booking_fault();DROP SEQUENCE private.owned_booking_fault_hits`);
    if (expire) await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [a.sessionId]);
  }
  const effectsUnchanged = before === await snapshot(), label = operation + '-' + target + (expire ? '-expiry' : '-fault');
  record(label + '-rolls-back-all-effects', (expire ? res.status === 403 : res.status >= 400) && effectsUnchanged && faultReached, { status: res.status, effectsUnchanged, faultReached });
  const recovered = await perform(), result = await bookingLookup(a, commandId);
  record(label + '-same-key-recovery-positive', recovered.status === 200 && result.status === 200 && result.data?.command_id === commandId,
    { status: recovered.status, lookupStatus: result.status });
}
async function bookingExpiry(a, b, r, operation) {
  const lock = await db.connect(), before = await snapshot(), label = operation + '-expiry-during-real-room-lock-denied';
  try {
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1", [a.sessionId]);
    await lock.query('BEGIN'); await lock.query('SELECT id FROM public.rooms WHERE id=$1 FOR UPDATE', [r.id]);
    const pending = operation === 'transfer' ? transfer(a, b, r) : operation === 'checkin' ? checkin(a, b, r) : checkout(a, b, r);
    await lockBarrier(operation === 'transfer' ? 'transfer_booking_room' : 'perform_' + operation);
    await db.query('SELECT pg_sleep(1.6)'); await lock.query('COMMIT'); const res = await pending, effectsUnchanged = before === await snapshot();
    const passed = res.status === 403 && effectsUnchanged;
    record(label, passed, { status: res.status, effectsUnchanged, realLockBarrier: true }); races.push({ label, passed, realLockBarrier: true });
  } finally { await lock.query('ROLLBACK'); lock.release(); await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [a.sessionId]); }
}
async function bookingOperationChecks(a, b, manager, otherHotel) {
  const hk = await account('housekeeping'), front = await account('front-office');
  // Explicit fixture answer: both are coherent assigned staff, only reception
  // has bookings.update. A role label alone must not authorize booking writes.
  await db.query(`DELETE FROM public.role_permissions rp USING public.roles r,public.permissions p
    WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.code='staff' AND p.module='bookings' AND p.action IN('update','edit','manage')`);
  for (const actor of [hk, front]) {
    await insert('users', { id: actor.id, email: actor.email, full_name: 'Owned booking staff', tenant_id: a.tenantId, hotel_id: a.hotelId,
      role: 'staff', user_level_code: 'staff', status: 'active', created_by: a.id, must_change_password: false, account_locked: false });
    await insert('user_roles', { user_id: actor.id, role: 'staff' });
    await insert('user_hotels', { user_id: actor.id, hotel_id: a.hotelId, assigned_by: a.id });
  }
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'bookings','update',true)", [front.id, a.tenantId]);
  const caps = (await db.query("SELECT public.has_user_permission($1,'bookings','update') AS reception, public.has_user_permission($2,'bookings','update') AS housekeeping", [front.id, hk.id])).rows[0];
  assert.equal(caps.reception, true); assert.equal(caps.housekeeping, false);
  const cr = await room(a), cb = await booking(a, cr), id = randomUUID();
  await denied('housekeeping-without-booking-capability-cannot-checkin', () => checkin(hk, cb, cr));
  const twentyIn = await Promise.all(Array.from({ length: 20 }, () => checkin(front, cb, cr, { p_command_id: id }))), ins = await roomState(cr.id);
  record('reception-twenty-same-key-checkins-one-event-audit-and-result', twentyIn.every(x => x.status === 200 && x.data?.command_id === id)
    && ins.status === 'occupied_clean' && ins.events === 1 && ins.audit === 1, { requests: 20, canonicalEvents: ins.events, roomAudit: ins.audit });
  const recovered = await bookingLookup(front, id), foreign = await bookingLookup(b, id);
  record('booking-result-lookup-and-foreign-actor-isolation', recovered.status === 200 && recovered.data?.booking_id === cb.id && foreign.status === 200 && foreign.data === null,
    { lookupStatus: recovered.status, foreignLookupStatus: foreign.status });
  await denied('checkin-same-key-different-payload-conflict', () => checkin(front, cb, cr, { p_command_id: id, p_early_checkin_charge: 100 }), [409]);
  await denied('booking-same-key-different-operation-conflict', () => checkout(front, cb, cr, { p_command_id: id }), [409]);
  await denied('housekeeping-without-booking-capability-cannot-checkout', () => checkout(hk, cb, cr));
  const paidId = randomUUID(), quote = { p_command_id: paidId, p_subtotal: 1500, p_damage_charges: 500, p_service_charges: 100 };
  await db.query('UPDATE public.room_bookings SET vat_rate=8,service_fee_rate=5,amount_paid=200,deposit_amount=100 WHERE id=$1', [cb.id]);
  const twentyOut = await Promise.all(Array.from({ length: 20 }, () => checkout(front, cb, cr, quote))), outs = await roomState(cr.id);
  const money = (await db.query('SELECT subtotal,vat_amount,service_fee_amount,total_amount,payment_status,amount_paid,deposit_amount FROM public.room_bookings WHERE id=$1', [cb.id])).rows[0];
  record('reception-twenty-same-key-checkouts-one-event-and-persisted-quote', twentyOut.every(x => x.status === 200 && x.data?.command_id === paidId)
    && outs.events === 2 && outs.audit === 2 && Number(money.vat_amount) === 80 && Number(money.service_fee_amount) === 50
    && Number(money.total_amount) === 1630 && money.payment_status === 'partial' && Number(money.amount_paid) === 200
    && Number(twentyOut[0].data?.total_amount) === Number(money.total_amount), { requests: 20, canonicalEvents: outs.events, roomAudit: outs.audit,
    persistedVat: Number(money.vat_amount), persistedFee: Number(money.service_fee_amount), persistedTotal: Number(money.total_amount),
    paymentStatus: money.payment_status, persistedQuoteMatches: Number(twentyOut[0].data?.total_amount) === Number(money.total_amount) });
  await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2', [front.id, a.hotelId]);
  await denied('booking-replay-requires-current-hotel-assignment', () => checkout(front, cb, cr, quote));
  await denied('booking-lookup-requires-current-hotel-assignment', () => bookingLookup(front, paidId));
  await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)', [front.id, a.hotelId, a.id]);
  await db.query("DELETE FROM public.user_permissions WHERE user_id=$1 AND module='bookings'", [front.id]);
  await denied('booking-replay-requires-current-capability', () => checkout(front, cb, cr, quote));
  await denied('booking-lookup-requires-current-capability', () => bookingLookup(front, paidId));
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'bookings','update',true)", [front.id, a.tenantId]);
  const trOld = await room(a, a.hotelId, 'occupied_clean'), trNew = await room(a), trBooking = await booking(a, trOld, 'checked_in'), trId = randomUUID();
  await denied('housekeeping-without-booking-capability-cannot-transfer', () => transfer(hk, trBooking, trNew));
  const twentyTransfer = await Promise.all(Array.from({ length: 20 }, () => transfer(front, trBooking, trNew, { p_command_id: trId })));
  const oldState = await roomState(trOld.id), newState = await roomState(trNew.id);
  record('reception-twenty-same-key-transfers-two-canonical-events', twentyTransfer.every(x => x.status === 200 && x.data?.command_id === trId)
    && oldState.status === 'vacant_dirty' && newState.status === 'occupied_clean' && oldState.events === 1 && newState.events === 1
    && oldState.audit === 1 && newState.audit === 1, { requests: 20, oldRoomEvents: oldState.events, newRoomEvents: newState.events });
  const unassigned = await room(a, otherHotel.id), ub = await booking(a, unassigned);
  await denied('checkin-unassigned-hotel-denied', () => checkin(manager, ub, unassigned));
  await db.query("UPDATE public.room_bookings SET status='checked_in' WHERE id=$1", [ub.id]);
  await db.query("UPDATE public.rooms SET status='occupied_clean' WHERE id=$1", [unassigned.id]);
  await denied('checkout-unassigned-hotel-denied', () => checkout(manager, ub, unassigned));
  const foreignRoom = await room(a), foreignBooking = await booking(a, foreignRoom);
  await denied('checkin-foreign-owner-denied', () => checkin(b, foreignBooking, foreignRoom));
  await denied('transfer-foreign-owner-denied', () => transfer(b, foreignBooking, trOld));
  await denied('checkin-mismatched-booking-room-denied', () => checkin(a, foreignBooking, trOld));
  const dirty = await room(a, a.hotelId, 'vacant_dirty'), dirtyBooking = await booking(a, dirty);
  await denied('checkin-dirty-room-denied', () => checkin(a, dirtyBooking, dirty), [409]);
  const blocked = await room(a, a.hotelId, 'out_of_service'), blockedBooking = await booking(a, blocked);
  await denied('checkin-out-of-service-room-denied', () => checkin(a, blockedBooking, blocked), [409]);
  await denied('checkin-negative-charge-denied', () => checkin(a, foreignBooking, foreignRoom, { p_early_checkin_charge: -1 }), [400]);
  const zr = await room(a, a.hotelId, 'occupied_clean'), zb = await booking(a, zr, 'checked_in');
  await denied('checkout-foreign-owner-denied', () => checkout(b, zb, zr));
  await denied('checkout-mismatched-booking-room-denied', () => checkout(a, zb, foreignRoom));
  await denied('checkout-direct-paid-amount-update-denied', () => checkout(a, zb, zr, { p_new_amount_paid: 100 }));
  await denied('checkout-nan-amount-denied', () => checkout(a, zb, zr, { p_subtotal: 'NaN' }), [400]);
  await denied('checkout-damage-exceeds-subtotal-denied', () => checkout(a, zb, zr, { p_subtotal: 100, p_damage_charges: 200 }), [400]);
  await db.query('UPDATE public.room_bookings SET room_price=1000,vat_rate=8,service_fee_rate=5 WHERE id=$1', [zb.id]);
  const zero = await checkout(a, zb, zr), persisted = (await db.query('SELECT subtotal,total_amount,payment_status FROM public.room_bookings WHERE id=$1', [zb.id])).rows[0];
  record('checkout-zero-subtotal-returns-trigger-derived-persisted-values', zero.status === 200 && Number(persisted.subtotal) === 1000
    && Number(zero.data?.subtotal) === 1000 && Number(zero.data?.total_amount) === Number(persisted.total_amount)
    && zero.data?.payment_status === persisted.payment_status, { status: zero.status, persistedSubtotal: Number(persisted.subtotal),
    persistedQuoteMatches: Number(zero.data?.total_amount) === Number(persisted.total_amount) });
  const earlyRoom = await room(a), earlyBooking = await booking(a, earlyRoom, 'confirmed', { room_price: 1000, early_checkin_charge: 100, vat_rate: 8, service_fee_rate: 5 });
  const earlyBefore = (await db.query('SELECT subtotal FROM public.room_bookings WHERE id=$1', [earlyBooking.id])).rows[0];
  assert.equal(Number(earlyBefore.subtotal), 1100, 'Owned priced checkin fixture includes its existing early charge');
  const earlyId = randomUUID(), earlyInput = { p_early_checkin_charge: 200, p_command_id: earlyId };
  const early = await checkin(front, earlyBooking, earlyRoom, earlyInput), earlyAfter = (await db.query('SELECT subtotal,total_amount,early_checkin_charge FROM public.room_bookings WHERE id=$1', [earlyBooking.id])).rows[0];
  const earlySnapshot = await snapshot(), earlyReplay = await checkin(front, earlyBooking, earlyRoom, earlyInput);
  record('checkin-replaces-early-charge-in-existing-quote-without-double-charge-on-replay', early.status === 200
    && Number(earlyAfter.subtotal) === 1200 && Number(earlyAfter.total_amount) === 1356 && Number(earlyAfter.early_checkin_charge) === 200
    && earlyReplay.status === 200 && earlyReplay.data?.replayed === true && earlySnapshot === await snapshot(),
    { status: early.status, persistedSubtotal: Number(earlyAfter.subtotal), persistedTotal: Number(earlyAfter.total_amount), effectsUnchangedOnReplay: earlySnapshot === await snapshot() });
  const confirmedOld = await room(a), confirmedNew = await room(a), confirmed = await booking(a, confirmedOld);
  const confirmedMove = await transfer(front, confirmed, confirmedNew);
  record('reception-confirmed-transfer-does-not-change-physical-room-state', confirmedMove.status === 200
    && (await roomState(confirmedOld.id)).status === 'vacant_clean' && (await roomState(confirmedNew.id)).events === 0, { status: confirmedMove.status });
  const hourlyOld = await room(a), dailyTarget = await room(a);
  const overlapDate = new Date(Date.now()+86400000).toISOString().slice(0,10), overlapEnd = new Date(Date.now()+172800000).toISOString().slice(0,10);
  const overlapFields = { check_in_date:overlapDate,check_out_date:overlapEnd };
  const hourlyFields = { ...overlapFields,booking_type:'hourly',hourly_start_time:overlapDate+'T10:00:00Z',hourly_end_time:overlapDate+'T11:00:00Z' };
  const hourlyBooking = await booking(a, hourlyOld, 'confirmed', hourlyFields);
  await booking(a, dailyTarget, 'confirmed', overlapFields);
  await denied('transfer-hourly-booking-cannot-overlap-daily-booking', () => transfer(a, hourlyBooking, dailyTarget), [409]);
  const dailyOld = await room(a), hourlyTarget = await room(a), dailyBooking = await booking(a, dailyOld, 'confirmed', overlapFields);
  await booking(a, hourlyTarget, 'confirmed', hourlyFields);
  await denied('transfer-daily-booking-cannot-overlap-hourly-booking', () => transfer(a, dailyBooking, hourlyTarget), [409]);
  const revokeRoom = await room(a), revokeBooking = await booking(a, revokeRoom), revokeLock = await db.connect(), revokeBefore = await snapshot();
  try {
    await revokeLock.query('BEGIN'); await revokeLock.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE', [front.id]);
    const pending = checkin(front, revokeBooking, revokeRoom); await lockBarrier('perform_checkin');
    await revokeLock.query("DELETE FROM public.user_permissions WHERE user_id=$1 AND module='bookings'", [front.id]);
    await revokeLock.query('COMMIT'); const res = await pending, effectsUnchanged = revokeBefore === await snapshot(), passed = res.status === 403 && effectsUnchanged;
    record('booking-capability-revoked-while-waiting-for-profile-lock-denied', passed, { status: res.status, effectsUnchanged, realLockBarrier: true });
    races.push({ label: 'booking-capability-revoked-at-profile-lock', passed, realLockBarrier: true });
  } finally { await revokeLock.query('ROLLBACK'); revokeLock.release(); }
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'bookings','update',true)", [front.id, a.tenantId]);
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1', [a.id]);
  await denied('booking-locked-owner-cannot-checkin', () => checkin(a, revokeBooking, revokeRoom));
  await denied('booking-locked-owner-cannot-read-result', () => bookingLookup(a, randomUUID()));
  await db.query('UPDATE public.users SET account_locked=false WHERE id=$1', [a.id]);
  for (const op of ['checkin', 'checkout', 'transfer']) {
    const rr = await room(a, a.hotelId, op === 'checkin' ? 'vacant_clean' : 'occupied_clean'), bb = await booking(a, rr, op === 'checkin' ? 'confirmed' : 'checked_in');
    const target = op === 'transfer' ? await room(a) : rr;
    await bookingExpiry(a, bb, target, op);
    await bookingFault(a, bb, target, op);
    const ar = await room(a, a.hotelId, op === 'checkin' ? 'vacant_clean' : 'occupied_clean'), ab = await booking(a, ar, op === 'checkin' ? 'confirmed' : 'checked_in');
    await bookingFault(a, ab, op === 'transfer' ? await room(a) : ar, op, 'booking_audit');
    const sr = await room(a, a.hotelId, op === 'checkin' ? 'vacant_clean' : 'occupied_clean'), sb = await booking(a, sr, op === 'checkin' ? 'confirmed' : 'checked_in');
    await bookingFault(a, sb, op === 'transfer' ? await room(a) : sr, op, 'room_source');
    const er = await room(a, a.hotelId, op === 'checkin' ? 'vacant_clean' : 'occupied_clean'), eb = await booking(a, er, op === 'checkin' ? 'confirmed' : 'checked_in');
    await bookingFault(a, eb, op === 'transfer' ? await room(a) : er, op, 'booking_result', true);
  }
  const old1 = await room(a, a.hotelId, 'occupied_clean'), old2 = await room(a, a.hotelId, 'occupied_clean'), last = await room(a);
  const bk1 = await booking(a, old1, 'checked_in'), bk2 = await booking(a, old2, 'checked_in');
  const lastLock = await db.connect(); let race;
  try {
    await lastLock.query('BEGIN'); await lastLock.query('SELECT id FROM public.rooms WHERE id=$1 FOR UPDATE', [last.id]);
    const pending = Promise.all([transfer(a, bk1, last), transfer(manager, bk2, last)]);
    await lockBarrier('transfer_booking_room', 2); await lastLock.query('COMMIT'); race = await pending;
  } finally { await lastLock.query('ROLLBACK'); lastLock.release(); }
  const racePassed = race.filter(x => x.status === 200).length === 1 && race.filter(x => x.status === 409).length === 1;
  const lastState = await roomState(last.id);
  record('two-actors-transfer-to-last-room-exactly-one-commits', racePassed && lastState.events === 1, { statuses: race.map(x => x.status), canonicalEvents: lastState.events });
  races.push({ label: 'two-actors-transfer-to-last-room', passed: racePassed, actualConcurrentRest: true, realLockBarrier: true, waitingRequests: 2 });
  const groupRooms = [await room(a, a.hotelId, 'occupied_clean'), await room(a, a.hotelId, 'occupied_clean')];
  const groupBookings = [await booking(a, groupRooms[0], 'checked_in'), await booking(a, groupRooms[1], 'checked_in')];
  const items = groupBookings.map((bk, i) => ({ booking_id: bk.id, room_id: groupRooms[i].id, subtotal: 1000, damage_charges: 0 })), groupId = randomUUID();
  const sorted = [...groupBookings].sort((x, y) => x.id.localeCompare(y.id)), secondRoom = sorted[1].room_id;
  await db.query(`CREATE FUNCTION private.owned_group_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.room_id='${secondRoom}'::uuid THEN RAISE EXCEPTION 'OWNED_GROUP_FAULT'; END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_group_fault BEFORE INSERT ON private.workflow_room_transition_commands FOR EACH ROW EXECUTE FUNCTION private.owned_group_fault()`);
  const groupBefore = await snapshot(); let failed;
  try { failed = await rpc('perform_group_checkout', a, { p_checkouts: items, p_command_id: groupId }); }
  finally { await db.query('DROP TRIGGER owned_group_fault ON private.workflow_room_transition_commands;DROP FUNCTION private.owned_group_fault()'); }
  record('group-second-room-source-fault-rolls-back-both-bookings-money-and-events', failed.status >= 400 && groupBefore === await snapshot(), { status: failed.status, effectsUnchanged: groupBefore === await snapshot() });
  const group = await rpc('perform_group_checkout', a, { p_checkouts: items, p_command_id: groupId });
  const groupAfter = await snapshot(), groupReplay = await rpc('perform_group_checkout', a, { p_checkouts: [...items].reverse(), p_command_id: groupId });
  record('group-checkout-recovery-and-reordered-replay-are-atomic', group.status === 200 && group.data?.booking_count === 2
    && groupReplay.status === 200 && groupReplay.data?.replayed === true && groupAfter === await snapshot(), { status: group.status, replayStatus: groupReplay.status, effectsUnchanged: groupAfter === await snapshot() });
  await denied('booking-anonymous-execution-denied', () => checkin(input.publishableKey, foreignBooking, foreignRoom));
  await denied('booking-service-key-execution-denied', () => checkin(input.serviceKey, foreignBooking, foreignRoom));
  await denied('checkout-service-key-execution-denied', () => checkout(input.serviceKey, cb, cr));
  await denied('transfer-service-key-execution-denied', () => transfer(input.serviceKey, foreignBooking, trOld));
  await denied('booking-lookup-service-key-execution-denied', () => bookingLookup(input.serviceKey, id));
}
// Cancellation is a durable terminal outcome, not a frontend storage reset.
async function businessSnapshot() {
  const value = JSON.parse(await snapshot()); delete value.check_commands; delete value.booking_commands;
  return JSON.stringify(value);
}
async function cancellationFixture(a, operation, hotelId = a.hotelId) {
  const id = randomUUID(); let request, invoke;
  if (operation === 'quick_check') {
    const r = await room(a, hotelId, 'vacant_dirty');
    request = { room_id: r.id, check_type: 'daily', notes: 'Owned quick check', photos: [] };
    invoke = actor => quick(actor, r, { _command_id: id });
  } else if (operation === 'undo_quick_check') {
    const r = await room(a, hotelId), check = await quick(a, r); assert.equal(check.status, 200);
    request = { check_id: check.data.check_id, reason: 'Owned undo' };
    invoke = actor => undo(actor, check.data.check_id, { _command_id: id });
  } else if (operation === 'group_checkout') {
    const rs = [await room(a, hotelId, 'occupied_clean'), await room(a, hotelId, 'occupied_clean')];
    const bs = [await booking(a, rs[0], 'checked_in'), await booking(a, rs[1], 'checked_in')];
    const items = bs.map((bk, i) => ({ booking_id: bk.id, room_id: rs[i].id, subtotal: 1000, damage_charges: 0 }));
    request = { checkouts: items };
    invoke = actor => rpc('perform_group_checkout', actor, { p_checkouts: items, p_command_id: id });
  } else {
    const r = await room(a, hotelId, operation === 'checkin' ? 'vacant_clean' : 'occupied_clean');
    const bk = await booking(a, r, operation === 'checkin' ? 'confirmed' : 'checked_in');
    if (operation === 'transfer') {
      const target = await room(a, hotelId);
      request = { booking_id: bk.id, new_room_id: target.id, reason: 'Owned transfer' };
      invoke = actor => transfer(actor, bk, target, { p_command_id: id });
    } else if (operation === 'checkin') {
      request = { booking_id: bk.id, room_id: r.id, early_checkin_charge: 0 };
      invoke = actor => checkin(actor, bk, r, { p_command_id: id });
    } else {
      request = { booking_id: bk.id, room_id: r.id, late_checkout_charge: 0, service_charges: 0, subtotal: 0,
        damage_charges: 0, damage_notes: null, damage_items: [], check_out_date: null };
      invoke = actor => checkout(actor, bk, r, { p_command_id: id });
    }
  }
  const isCheck = operation === 'quick_check' || operation === 'undo_quick_check';
  const cancelRpc = isCheck ? 'cancel_room_check_command' : 'cancel_booking_room_command';
  const writerRpc = { quick_check: 'perform_quick_room_check', undo_quick_check: 'undo_quick_room_check',
    transfer: 'transfer_booking_room', checkin: 'perform_checkin', checkout: 'perform_checkout', group_checkout: 'perform_group_checkout' }[operation];
  const body = { p_command_id: id, p_operation: operation, p_request: request };
  return { id, operation, request, invoke, cancelRpc, writerRpc, isCheck,
    cancel: (actor, override = {}) => rpc(cancelRpc, actor, { ...body, ...override }),
    lookup: actor => isCheck ? lookup(actor, id) : bookingLookup(actor, id) };
}
function operationTabStorage(){
  const rows=new Map();return {get length(){return rows.size},key:i=>[...rows.keys()][i]??null,
    getItem:key=>rows.get(key)??null,setItem:(key,value)=>rows.set(key,value),removeItem:key=>rows.delete(key)};
}
function operationAppClient(a,f,storage,mode){
  const requests=[];
  const client=RoomQCOperationCaller.createRoomOperationClient({endpoint:'http://127.0.0.1:8000',publishableKey:input.publishableKey,
    storage:()=>storage,newId:()=>f.id,getSession:async()=>({data:{session:{access_token:a.token,user:{id:a.id}}},error:null}),
    fetch:async(url,options)=>{
      const rpcName=String(url).split('/').at(-1);requests.push({rpc:rpcName,body:options.body});
      if(rpcName===f.writerRpc&&mode.value==='before')throw new Error('Owned operation request loss');
      const response=await fetch(url,options);
      if(rpcName===f.writerRpc&&mode.value==='after'){await response.arrayBuffer();throw new Error('Owned operation response loss');}
      return response;
    }});
  return {client,requests,context:()=>({actorId:a.id,sessionId:a.sessionId,tenantId:a.tenantId,runtime:'owned-operation-'+input.run}),
    args:Object.fromEntries(Object.entries(f.request).map(([key,value])=>[(f.isCheck?'_':'p_')+key,value]))};
}
async function operationErrorCode(fn){try{await fn();return null}catch(error){return error.code??'unexpected_error'}}
async function actualOperationClientChecks(a){
  for(const operation of ['quick_check','undo_quick_check','transfer','checkin','checkout','group_checkout']){
    const f=await cancellationFixture(a,operation),storage=operationTabStorage(),mode={value:'after'},first=operationAppClient(a,f,storage,mode);
    const failed=await operationErrorCode(()=>first.client.save(first.context(),f.writerRpc,first.args));
    const pending=first.client.pending(first.context())[0],after=await snapshot();
    record('application-operation-'+operation+'-lost-response-keeps-key',failed==='outcome_unknown'&&pending?.id===f.id&&storage.length===1);
    const login=await call('/auth/v1/token?grant_type=password',input.publishableKey,{email:a.email,password:a.password});assert.equal(login.status,200);
    a.token=login.data.access_token;a.sessionId=JSON.parse(Buffer.from(a.token.split('.')[1],'base64url')).session_id;
    mode.value='';const fresh=operationAppClient(a,f,storage,mode),result=await fresh.client.recover(fresh.context(),f.id);
    record('application-operation-'+operation+'-reload-relogin-reads-receipt-without-effects',result.command_id===f.id&&result.replayed===true
      &&storage.length===0&&fresh.requests.length===1&&fresh.requests[0].rpc===(f.isCheck?'get_room_check_command_result':'get_booking_room_command_result')&&after===await snapshot(),
      {effectsUnchanged:after===await snapshot()});
    const beforeFixture=await cancellationFixture(a,operation),beforeStorage=operationTabStorage(),beforeMode={value:'before'},beforeClient=operationAppClient(a,beforeFixture,beforeStorage,beforeMode);
    const missing=await operationErrorCode(()=>beforeClient.client.save(beforeClient.context(),beforeFixture.writerRpc,beforeClient.args));
    beforeMode.value='';const retried=await beforeClient.client.recover(beforeClient.context(),beforeFixture.id);
    record('application-operation-'+operation+'-missing-receipt-resends-same-body',missing==='outcome_unknown'&&retried.command_id===beforeFixture.id&&beforeStorage.length===0
      &&beforeClient.requests.length===3&&beforeClient.requests[0].body===beforeClient.requests[2].body);
    const cancelFixture=await cancellationFixture(a,operation),cancelStorage=operationTabStorage(),cancelMode={value:'before'},cancelClient=operationAppClient(a,cancelFixture,cancelStorage,cancelMode);
    await operationErrorCode(()=>cancelClient.client.save(cancelClient.context(),cancelFixture.writerRpc,cancelClient.args));cancelMode.value='';
    const code=await operationErrorCode(()=>cancelClient.client.cancel(cancelClient.context(),cancelFixture.id)),beforeLate=await snapshot();
    const late=await call('/rest/v1/rpc/'+cancelFixture.writerRpc,a.token,JSON.parse(cancelClient.requests[0].body));
    record('application-operation-'+operation+'-confirmed-cancel-prevents-late-effects',code==='command_cancelled'&&cancelStorage.length===0
      &&late.status===200&&late.data?.state==='cancelled'&&beforeLate===await snapshot(),{status:late.status,effectsUnchanged:beforeLate===await snapshot()});
    if(operation==='group_checkout') {
      const different=await cancelFixture.invoke(a);
      record('application-operation-group_checkout-different-raw-body-conflicts-without-effects',different.status===409&&beforeLate===await snapshot(),
        {status:different.status,effectsUnchanged:beforeLate===await snapshot()});
    }
    const committed=await cancellationFixture(a,operation),committedStorage=operationTabStorage(),committedMode={value:'after'},committedClient=operationAppClient(a,committed,committedStorage,committedMode);
    await operationErrorCode(()=>committedClient.client.save(committedClient.context(),committed.writerRpc,committedClient.args));committedMode.value='';
    const committedBefore=await snapshot(),found=await committedClient.client.cancel(committedClient.context(),committed.id);
    record('application-operation-'+operation+'-cancel-reads-committed-success',found.command_id===committed.id&&found.replayed===true
      &&found.state!== 'cancelled'&&committedStorage.length===0&&committedBefore===await snapshot(),{effectsUnchanged:committedBefore===await snapshot()});
  }
}
async function bookingNotificationChecks(a,b,manager,otherHotel) {
  let ready=true;const committed=[];
  for(const operation of ['checkin','checkout','group_checkout']){
    const f=await cancellationFixture(a,operation),res=await f.invoke(a);
    const members=operation==='group_checkout'?res.data?.results:[res.data];
    const valid=res.status===200&&Array.isArray(members)&&members.length>0&&members.every(r=>
      /^[a-f0-9-]{36}$/.test(r?.notification_event_id??'')&&r.notification_state==='queued');
    record('notification-'+operation+'-durably-enqueued-before-core-response',valid,{status:res.status});
    ready=ready&&valid;
    committed.push({f,res,members});
  }
  // Red baseline records all missing sources, without querying absent tables.
  if(!ready)return;
  const eventState=async id=>(await db.query(`SELECT e.*,j.state,j.attempts,j.last_error_code,j.recipient_count
    FROM private.booking_notification_events e LEFT JOIN private.booking_notification_outbox j ON j.event_id=e.id AND j.channel='in_app'
    WHERE e.id=$1`,[id])).rows[0];
  const deliveries=async id=>(await db.query(`SELECT user_id FROM public.in_app_notifications
    WHERE metadata->>'bookingNotificationEventId'=$1 ORDER BY user_id`,[id])).rows.map(r=>r.user_id);
  for(const {f,res,members} of committed){
    const before=await snapshot(),replies=await Promise.all(Array.from({length:20},()=>f.invoke(a))),found=await f.lookup(a);
    record('notification-'+f.operation+'-replay-and-lost-response-keep-same-events',replies.every(r=>r.status===200&&r.data.replayed===true)
      &&JSON.stringify(found.data?.results??found.data?.notification_event_id)===JSON.stringify(res.data?.results??res.data?.notification_event_id)
      &&before===await snapshot(),{requests:20,effectsUnchanged:before===await snapshot()});
    const ids=members.map(r=>r.notification_event_id),jobs=(await db.query(`SELECT channel,count(*)::int AS n FROM private.booking_notification_outbox
      WHERE event_id=ANY($1::uuid[]) GROUP BY channel ORDER BY channel`,[ids])).rows;
    record('notification-'+f.operation+'-exact-channel-jobs-without-group-parent-duplicate',
      JSON.stringify(jobs)===JSON.stringify(f.operation==='checkin'?[{channel:'telegram',n:1}]:[{channel:'in_app',n:ids.length},{channel:'push',n:ids.length},{channel:'telegram',n:ids.length}]));
  }
  const primary=committed[1],primaryId=primary.members[0].notification_event_id;
  const candidates=await eventState(primaryId);
  record('notification-recipient-candidates-bound-to-source-tenant-and-hotel',candidates.tenant_id===a.tenantId&&candidates.hotel_id===a.hotelId
    &&candidates.recipient_ids.includes(a.id)&&candidates.recipient_ids.includes(manager.id)&&!candidates.recipient_ids.includes(b.id));
  for(const operation of ['checkin','checkout','group_checkout'])for(const target of ['source','outbox']){
    const f=await cancellationFixture(a,operation),bookingId=operation==='group_checkout'?f.request.checkouts[1].booking_id:f.request.booking_id;
    const table=target==='source'?'private.booking_notification_events':'private.booking_notification_outbox';
    const condition=target==='source'?`NEW.booking_id='${bookingId}'::uuid`:
      `EXISTS(SELECT 1 FROM private.booking_notification_events WHERE id=NEW.event_id AND booking_id='${bookingId}'::uuid)`;
    const before=await snapshot();
    await db.query(`CREATE FUNCTION private.owned_notification_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
      BEGIN IF ${condition} THEN RAISE EXCEPTION 'OWNED_NOTIFICATION_FAULT'; END IF;RETURN NEW;END;$f$;
      CREATE TRIGGER owned_notification_fault BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_notification_fault()`);
    let failed;try{failed=await f.invoke(a)}finally{await db.query(`DROP TRIGGER owned_notification_fault ON ${table};DROP FUNCTION private.owned_notification_fault()`)}
    record('notification-'+operation+'-'+target+'-fault-rolls-back-entire-core',failed.status>=400&&before===await snapshot(),
      {status:failed.status,effectsUnchanged:before===await snapshot()});
    record('notification-'+operation+'-'+target+'-same-key-recovers-after-fault',(await f.invoke(a)).status===200);
  }
  for(const operation of ['checkin','checkout','group_checkout']){
    const f=await cancellationFixture(a,operation),before=await businessSnapshot(),cancelled=await f.cancel(a),after=await snapshot(),late=await f.invoke(a);
    record('notification-'+operation+'-cancelled-command-never-enqueues',cancelled.status===200&&late.data?.state==='cancelled'
      &&before===await businessSnapshot()&&after===await snapshot(),{effectsUnchanged:after===await snapshot()});
    const lost=await cancellationFixture(a,operation),storage=operationTabStorage(),mode={value:'after'},first=operationAppClient(a,lost,storage,mode);
    const error=await operationErrorCode(()=>first.client.save(first.context(),lost.writerRpc,first.args));
    mode.value='normal';const recovered=await operationAppClient(a,lost,storage,mode).client.recover(first.context(),lost.id);
    const members=operation==='group_checkout'?recovered.results:[recovered];
    record('notification-'+operation+'-actual-client-recovers-durable-event-after-response-loss',error==='outcome_unknown'&&storage.length===0
      &&members.every(r=>/^[a-f0-9-]{36}$/.test(r.notification_event_id)&&r.notification_state==='queued'),{actualApplicationClient:true});
  }
  const status=()=>rpc('get_booking_notification_status',a,{p_command_id:primary.f.id});
  const queued=await status();
  record('notification-status-queued-never-claims-delivered',queued.status===200&&queued.data?.events.length===1
    &&queued.data.events[0].channels.every(j=>j.state==='pending'&&j.attempts===0)
    &&!JSON.stringify(queued.data).includes('recipient_ids'));
  const hidden=await rpc('get_booking_notification_status',b,{p_command_id:primary.f.id});
  record('notification-status-cross-tenant-command-hidden',hidden.status===200&&hidden.data===null);
  await denied('notification-status-anonymous-denied',()=>rpc('get_booking_notification_status',input.publishableKey,{p_command_id:primary.f.id}));
  await denied('notification-status-service-key-denied',()=>rpc('get_booking_notification_status',input.serviceKey,{p_command_id:primary.f.id}));
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1',[a.id]);
  await denied('notification-status-locked-owner-denied',status);await db.query('UPDATE public.users SET account_locked=false WHERE id=$1',[a.id]);
  for(const role of ['anon','authenticated','service_role']){
    const client=await db.connect();let deniedCount=0;
    try{
      await client.query('BEGIN');await client.query('SET LOCAL ROLE '+role);
      for(const fn of [`private.enqueue_booking_notification('${randomUUID()}', '${a.id}', '${primary.f.id}')`,
        `private.deliver_booking_inapp_notification('${primaryId}')`,`private.process_booking_notification_batch(20)`]){
        await client.query('SAVEPOINT denied');try{await client.query('SELECT '+fn)}catch(error){if(error.code==='42501')deniedCount++}
        await client.query('ROLLBACK TO SAVEPOINT denied');
      }
    }finally{await client.query('ROLLBACK');client.release()}
    record('notification-'+role+'-cannot-invoke-private-producer-or-dispatcher',deniedCount===3,{denials:deniedCount});
  }
  const {BookingNotificationWorker}=await import('/control/workers/booking-notification-worker.mjs');
  const name='owned_booking_notifier_'+input.run,password=randomBytes(32).toString('hex');
  await db.query(`CREATE ROLE ${name} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
    GRANT roomqc_booking_notifier TO ${name}`);
  const events=[],makeWorker=()=>new BookingNotificationWorker({Pool:pg.Pool,connection:{host:'db',port:5432,user:name,password,database:'postgres'},limit:50,onEvent:e=>events.push(e)});
  let worker=makeWorker(),second=makeWorker();
  const drain=async()=>{let last;for(let i=0;i<8;i++){last=await worker.tick();if(last.failed||last.processed===0)break}return last};
  const fresh=async()=>{const f=await cancellationFixture(a,'checkout'),res=await f.invoke(a);assert.equal(res.status,200);return {f,id:res.data.notification_event_id}};
  try{
    const initial=await drain();
    record('notification-actual-restricted-worker-drains-inapp-and-reports-external-pending',!initial.failed&&initial.processed===0
      &&initial.external_pending>0&&initial.external_dispatcher_ready===false);
    const delivered=await deliveries(primaryId),state=await eventState(primaryId);
    record('notification-inapp-delivery-and-receipts-match-exact-candidates',state.state==='delivered'
      &&JSON.stringify(delivered)===JSON.stringify([...candidates.recipient_ids].sort())
      &&Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_receipts WHERE event_id=$1',[primaryId])).rows[0].n)===delivered.length);
    const stable=await snapshot();await worker.tick();await worker.shutdown();worker=makeWorker();await worker.tick();
    record('notification-worker-restart-and-repeat-never-duplicate-inapp',stable===await snapshot(),{effectsUnchanged:stable===await snapshot()});
    const revoked=await fresh();await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[manager.id,a.hotelId]);
    await drain();record('notification-live-offboarding-excludes-removed-hotel-member',!(await deliveries(revoked.id)).includes(manager.id)
      &&(await deliveries(revoked.id)).includes(a.id));
    await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[manager.id,a.hotelId,a.id]);
    const locked=await fresh(),lockedRecipients=(await eventState(locked.id)).recipient_ids;
    await db.query('UPDATE public.users SET account_locked=true WHERE id=ANY($1::uuid[])',[lockedRecipients]);
    await drain();const lockedDeliveries=await deliveries(locked.id),lockedState=await eventState(locked.id);
    record('notification-locked-recipients-produce-no-recipients-terminal-state',lockedDeliveries.length===0&&lockedState.state==='no_recipients',
      {snapshotCandidates:lockedRecipients.length,delivered:lockedDeliveries.length,finalState:lockedState.state});
    await db.query('UPDATE public.users SET account_locked=false WHERE id=ANY($1::uuid[])',[lockedRecipients]);
    const obsolete=await fresh();await db.query("UPDATE public.hotels SET status='inactive' WHERE id=$1",[a.hotelId]);
    await drain();record('notification-inactive-hotel-obsoletes-without-delivery',(await eventState(obsolete.id)).state==='obsolete'&&(await deliveries(obsolete.id)).length===0);
    await db.query("UPDATE public.hotels SET status='active' WHERE id=$1",[a.hotelId]);
    const failed=await fresh(),target=(await eventState(failed.id)).recipient_ids.sort().at(-1);
    await db.query(`CREATE FUNCTION private.owned_inapp_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
      BEGIN IF NEW.metadata->>'bookingNotificationEventId'='${failed.id}' AND NEW.user_id='${target}'::uuid THEN
        RAISE EXCEPTION 'OWNED_INAPP_FAULT';END IF;RETURN NEW;END;$f$;
      CREATE TRIGGER owned_inapp_fault BEFORE INSERT ON public.in_app_notifications FOR EACH ROW EXECUTE FUNCTION private.owned_inapp_fault()`);
    try{await drain()}finally{await db.query('DROP TRIGGER owned_inapp_fault ON public.in_app_notifications;DROP FUNCTION private.owned_inapp_fault()')}
    const faultState=await eventState(failed.id);
    record('notification-second-recipient-fault-rolls-back-entire-delivery-batch',faultState.state==='pending'&&faultState.last_error_code==='DELIVERY_FAILED'
      &&faultState.attempts===1&&(await deliveries(failed.id)).length===0
      &&Number((await db.query('SELECT count(*) AS n FROM private.booking_notification_receipts WHERE event_id=$1',[failed.id])).rows[0].n)===0);
    await worker.tick();record('notification-backoff-prevents-immediate-retry',(await eventState(failed.id)).attempts===1);
    await db.query("UPDATE private.booking_notification_outbox SET available_at=clock_timestamp() WHERE event_id=$1 AND channel='in_app'",[failed.id]);
    await drain();record('notification-retry-recovers-without-losing-source',(await eventState(failed.id)).state==='delivered'&&(await eventState(failed.id)).attempts===2
      &&(await deliveries(failed.id)).length===candidates.recipient_ids.length);
    const concurrent=await fresh(),lock=await db.connect();let runs;
    try{
      await lock.query('BEGIN');await lock.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[manager.id]);
      const pending=Promise.all([worker.tick(),second.tick()]);await lockBarrier('private.process_booking_notification_batch',2);
      await lock.query('COMMIT');runs=await pending;
    }finally{await lock.query('ROLLBACK');lock.release()}
    const racePassed=runs.every(r=>!r.failed)&&runs.reduce((n,r)=>n+r.delivered,0)===1
      &&(await eventState(concurrent.id)).attempts===1&&(await deliveries(concurrent.id)).length===candidates.recipient_ids.length;
    const raceLabel='notification-two-actual-workers-after-real-recipient-lock-deliver-once';
    record(raceLabel,racePassed,{realLockBarrier:true});races.push({label:raceLabel,passed:racePassed,realLockBarrier:true});
    const revokedRace=await fresh(),lock2=await db.connect();
    try{
      await lock2.query('BEGIN');await lock2.query('SELECT id FROM public.users WHERE id=$1 FOR UPDATE',[manager.id]);
      const pending=worker.tick();await lockBarrier('private.process_booking_notification_batch');
      await lock2.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2',[manager.id,a.hotelId]);
      await lock2.query('COMMIT');await pending;
    }finally{await lock2.query('ROLLBACK');lock2.release()}
    const revokedPassed=!(await deliveries(revokedRace.id)).includes(manager.id)&&(await deliveries(revokedRace.id)).includes(a.id);
    const revokedLabel='notification-membership-revocation-wins-real-recipient-lock-race';
    record(revokedLabel,revokedPassed,{realLockBarrier:true});races.push({label:revokedLabel,passed:revokedPassed,realLockBarrier:true});
    await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)',[manager.id,a.hotelId,a.id]);
    const finalStatus=await status(),channels=finalStatus.data?.events[0]?.channels;
    record('notification-status-separates-inapp-delivered-from-push-telegram-pending',finalStatus.status===200
      &&channels.find(j=>j.channel==='in_app')?.state==='delivered'&&channels.filter(j=>j.channel!=='in_app').every(j=>j.state==='pending'));
    const unsafe=new BookingNotificationWorker({Pool:pg.Pool,connection:{host:'db',port:5432,user:'postgres',password:input.databasePassword,database:'postgres'}});
    const unsafeBefore=await snapshot();try{record('notification-worker-rejects-superuser-without-effects',(await unsafe.tick()).code==='BOOKING_NOTIFIER_ROLE_UNSAFE'
      &&unsafeBefore===await snapshot())}finally{await unsafe.shutdown()}
    const serialized=JSON.stringify(events);
    record('notification-worker-events-contain-no-credentials-or-recipient-identities',!serialized.includes(password)&&!serialized.includes(a.id)&&!serialized.includes(primaryId));
    await db.query(`GRANT SELECT ON public.rooms TO ${name}`);
    const grantedBefore=await snapshot();
    try{record('notification-worker-rejects-direct-business-table-grant',(await worker.tick()).code==='BOOKING_NOTIFIER_ROLE_UNSAFE'
      &&grantedBefore===await snapshot())}finally{await db.query(`REVOKE SELECT ON public.rooms FROM ${name}`)}
    const unreviewed='owned_notifier_extra_'+input.run;
    await db.query(`CREATE ROLE ${unreviewed} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;GRANT ${unreviewed} TO ${name}`);
    try{record('notification-worker-rejects-unreviewed-inherited-role',(await worker.tick()).code==='BOOKING_NOTIFIER_ROLE_UNSAFE')}
    finally{await db.query(`REVOKE ${unreviewed} FROM ${name};DROP ROLE ${unreviewed}`)}
  }finally{await worker.shutdown();await second.shutdown();await db.query(`DROP ROLE ${name}`)}
}
async function bookingAdjustmentChecks(a, b, manager, otherHotel) {
  const make=async (actor,operation='checkout',hotelId=actor.hotelId)=>{
    const r=await room(actor,hotelId,operation==='checkin'?'vacant_clean':'occupied_clean');
    const bk=await booking(actor,r,operation==='checkin'?'confirmed':'checked_in',{notes:'Owned existing note',subtotal:180000,room_price:180000});
    return {r,b:bk};
  };
  const read=async id=>(await db.query('SELECT notes FROM public.room_bookings WHERE id=$1',[id])).rows[0].notes;
  const ci=await make(a,'checkin'),co=await make(a),group=[await make(a),await make(a)];
  const ciKey=randomUUID(),coKey=randomUUID(),groupKey=randomUUID(),note='[Owned adjustment reason]';
  const ciArgs={p_command_id:ciKey,p_adjustment_notes:note},coArgs={p_command_id:coKey,p_adjustment_notes:note,p_subtotal:180000};
  const groupItems=group.map(f=>({booking_id:f.b.id,room_id:f.r.id,subtotal:180000,damage_charges:0,adjustment_notes:note}));
  const ciResult=await checkin(a,ci.b,ci.r,ciArgs),coResult=await checkout(a,co.b,co.r,coArgs);
  const groupResult=await rpc('perform_group_checkout',a,{p_command_id:groupKey,p_checkouts:groupItems});
  record('adjustment-checkin-commits-notes-with-core-without-browser',ciResult.status===200&&await read(ci.b.id)==='Owned existing note\n'+note
    &&ciResult.data.adjustment_notes_applied===true,{status:ciResult.status});
  record('adjustment-checkout-commits-notes-with-core-without-browser',coResult.status===200&&await read(co.b.id)==='Owned existing note\n'+note
    &&coResult.data.adjustment_notes_applied===true,{status:coResult.status,
      serverCode:/^[A-Z0-9]{5}$/.test(coResult.data?.code??'')?coResult.data.code:null,
      serverReason:/^[A-Z][A-Z_0-9]{2,80}$/.test(coResult.data?.message??'')?coResult.data.message:null});
  record('adjustment-group-commits-every-member-note-without-browser',groupResult.status===200
    &&(await Promise.all(group.map(f=>read(f.b.id)))).every(n=>n==='Owned existing note\n'+note)
    &&groupResult.data.results.every(r=>r.adjustment_notes_applied===true),{status:groupResult.status});
  // Red baseline returns only after recording all three missing contracts.
  if(ciResult.status!==200||coResult.status!==200||groupResult.status!==200) return;
  const replayCases=[['checkin',()=>checkin(a,ci.b,ci.r,ciArgs),ciKey],['checkout',()=>checkout(a,co.b,co.r,coArgs),coKey],
    ['group_checkout',()=>rpc('perform_group_checkout',a,{p_command_id:groupKey,p_checkouts:groupItems}),groupKey]];
  for(const [operation,invoke,key] of replayCases){
    const before=await snapshot(),results=await Promise.all(Array.from({length:20},invoke)),found=await bookingLookup(a,key);
    record('adjustment-'+operation+'-twenty-replays-and-lookup-never-append-twice',results.every(r=>r.status===200&&r.data.replayed===true)
      &&found.status===200&&before===await snapshot(),{effectsUnchanged:before===await snapshot()});
  }
  await denied('adjustment-checkin-same-key-different-note-conflicts',()=>checkin(a,ci.b,ci.r,{...ciArgs,p_adjustment_notes:note+' changed'}),[409]);
  await denied('adjustment-checkout-same-key-different-note-conflicts',()=>checkout(a,co.b,co.r,{...coArgs,p_adjustment_notes:note+' changed'}),[409]);
  await denied('adjustment-group-same-key-different-note-conflicts',()=>rpc('perform_group_checkout',a,{p_command_id:groupKey,
    p_checkouts:groupItems.map((item,i)=>i===0?{...item,adjustment_notes:note+' changed'}:item)}),[409]);
  const receipts=(await db.query('SELECT operation,request,result FROM private.booking_room_commands WHERE actor_id=$1 AND command_id=ANY($2::uuid[])',
    [a.id,[ciKey,coKey]])).rows;
  record('adjustment-durable-receipts-bind-exact-notes-and-confirm-applied',receipts.length===2
    &&receipts.every(r=>r.request.adjustment_notes===note&&r.result.adjustment_notes_applied===true));
  const create=async(operation,actor=a,hotelId=actor.hotelId)=>{
    const members=await Promise.all(Array.from({length:operation==='group_checkout'?2:1},()=>make(actor,operation,hotelId)));
    const item=f=>({booking_id:f.b.id,room_id:f.r.id,late_checkout_charge:0,service_charges:0,subtotal:180000,
      damage_charges:0,damage_notes:null,damage_items:[],check_out_date:null,adjustment_notes:note});
    const request=operation==='group_checkout'?{checkouts:members.map(item)}:operation==='checkin'
      ?{booking_id:members[0].b.id,room_id:members[0].r.id,early_checkin_charge:0,adjustment_notes:note}:item(members[0]);
    const id=randomUUID(),writerRpc='perform_'+operation;
    const f={id,request,members,writerRpc,isCheck:false,cancelRpc:'cancel_booking_room_command'};
    f.invoke=who=>rpc(writerRpc,who,{...Object.fromEntries(Object.entries(request).map(([k,v])=>['p_'+k,v])),p_command_id:id});
    f.cancel=who=>rpc(f.cancelRpc,who,{p_command_id:id,p_operation:operation,p_request:request});
    f.lookup=who=>bookingLookup(who,id);return f;
  };
  for(const operation of ['checkin','checkout','group_checkout']){
    const f=await create(operation),args=Object.fromEntries(Object.entries(f.request).map(([k,v])=>['p_'+k,v]));
    for(const bad of ['x'.repeat(10001),'   ','\t\n']){
      const override=operation==='group_checkout'?{p_checkouts:f.request.checkouts.map(item=>({...item,adjustment_notes:bad}))}:{p_adjustment_notes:bad};
      await denied('adjustment-'+operation+'-'+(bad.length>10000?'oversize':bad==='   '?'blank':'line-whitespace')+'-denied-without-effects',()=>rpc(f.writerRpc,a,{...args,...override,p_command_id:f.id}),[400]);
    }
    await denied('adjustment-'+operation+'-foreign-tenant-denied-without-effects',()=>f.invoke(b));
    const foreignHotel=await create(operation,a,otherHotel);
    await denied('adjustment-'+operation+'-unassigned-manager-denied-without-effects',()=>foreignHotel.invoke(manager));
    const allowed=await f.invoke(manager);
    record('adjustment-'+operation+'-assigned-manager-preserves-notes',allowed.status===200
      &&(await Promise.all(f.members.map(m=>read(m.b.id)))).every(n=>n==='Owned existing note\n'+note),{status:allowed.status});
    const cancelled=await create(operation),before=await businessSnapshot(),stopped=await cancelled.cancel(a),late=await cancelled.invoke(a);
    record('adjustment-'+operation+'-cancelled-intent-cannot-append-notes-later',stopped.status===200&&late.status===200
      &&stopped.data.state==='cancelled'&&late.data.state==='cancelled'&&before===await businessSnapshot(),{effectsUnchanged:before===await businessSnapshot()});
    const lost=await create(operation),storage=operationTabStorage(),mode={value:'after'},first=operationAppClient(a,lost,storage,mode);
    const code=await operationErrorCode(()=>first.client.save(first.context(),lost.writerRpc,first.args)),after=await snapshot();
    mode.value='';const fresh=operationAppClient(a,lost,storage,mode),found=await fresh.client.recover(fresh.context(),lost.id);
    record('adjustment-'+operation+'-actual-client-recovers-notes-after-response-loss',code==='outcome_unknown'&&found.replayed===true&&storage.length===0
      &&fresh.requests.length===1&&fresh.requests[0].rpc==='get_booking_room_command_result'&&after===await snapshot()
      &&(await Promise.all(lost.members.map(m=>read(m.b.id)))).every(n=>n==='Owned existing note\n'+note),{effectsUnchanged:after===await snapshot(),actualApplicationClient:true});
    const fault=await create(operation),faultId=fault.members.at(-1).b.id,faultBefore=await snapshot();let failed,reached;
    await db.query(`CREATE SEQUENCE private.owned_adjustment_seen;
      CREATE FUNCTION private.owned_adjustment_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
      BEGIN IF NEW.id='${faultId}'::uuid THEN PERFORM nextval('private.owned_adjustment_seen'); RAISE EXCEPTION 'OWNED_ADJUSTMENT_FAULT'; END IF; RETURN NEW; END;$f$;
      CREATE TRIGGER owned_adjustment_fault BEFORE UPDATE OF notes ON public.room_bookings FOR EACH ROW EXECUTE FUNCTION private.owned_adjustment_fault()`);
    try{failed=await fault.invoke(a);reached=(await db.query('SELECT is_called FROM private.owned_adjustment_seen')).rows[0].is_called;}
    finally{await db.query('DROP TRIGGER owned_adjustment_fault ON public.room_bookings;DROP FUNCTION private.owned_adjustment_fault();DROP SEQUENCE private.owned_adjustment_seen');}
    record('adjustment-'+operation+'-note-write-fault-rolls-back-entire-core',reached&&failed.status>=400&&faultBefore===await snapshot(),
      {status:failed.status,faultReached:reached,effectsUnchanged:faultBefore===await snapshot()});
    const recovered=await fault.invoke(a);
    record('adjustment-'+operation+'-note-fault-same-key-recovery-appends-once',recovered.status===200
      &&(await Promise.all(fault.members.map(m=>read(m.b.id)))).every(n=>n==='Owned existing note\n'+note),{status:recovered.status});
  }
  const current=await create('checkin'),lock=await db.connect();let currentResult;
  try{
    await lock.query('BEGIN');await lock.query('SELECT id FROM public.room_bookings WHERE id=$1 FOR UPDATE',[current.members[0].b.id]);
    const pending=current.invoke(a);await lockBarrier('perform_checkin');
    await lock.query("UPDATE public.room_bookings SET notes=notes||E'\\nOwned concurrent shift note' WHERE id=$1",[current.members[0].b.id]);
    await lock.query('COMMIT');currentResult=await pending;
  }finally{await lock.query('ROLLBACK');lock.release();}
  const currentPassed=currentResult.status===200&&await read(current.members[0].b.id)==='Owned existing note\nOwned concurrent shift note\n'+note;
  record('adjustment-current-locked-notes-preserve-concurrent-shift-edit',currentPassed,{status:currentResult.status,realLockBarrier:true});
  races.push({label:'adjustment-preserve-concurrent-notes',passed:currentPassed,realLockBarrier:true,actualConcurrentRest:true});
  for(const first of ['cancel','writer']){
    const f=await create('checkout');await cancellationRace(a,'checkout',first,f,'adjustment-');
    record('adjustment-'+first+'-wins-notes-match-terminal-result',await read(f.members[0].b.id)===(first==='cancel'?'Owned existing note':'Owned existing note\n'+note));
  }
  const signatures=(await db.query(`SELECT n.nspname AS schema,p.proname,has_function_privilege('authenticated',p.oid,'EXECUTE') AS client,
    has_function_privilege('anon',p.oid,'EXECUTE') AS anon,has_function_privilege('service_role',p.oid,'EXECUTE') AS service
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname IN
      ('perform_checkin','perform_checkout','perform_checkin_without_notes_v1','perform_checkout_without_notes_v1','booking_adjustment_request','validate_booking_adjustment_item')`)).rows;
  record('adjustment-single-public-signature-and-private-helpers-revoked',signatures.filter(r=>r.schema==='public').length===2
    &&signatures.every(r=>r.schema==='public'?r.client&&!r.anon&&!r.service:!r.client&&!r.anon&&!r.service));
}
async function checkoutInvoiceChecks(a, b, manager) {
  const make = async actor => { const r=await room(actor,actor.hotelId,'occupied_clean');return {r,b:await booking(actor,r,'checked_in',
    {subtotal:180000,room_price:150000,damage_charges:30000,vat_rate:8,service_fee_rate:5,amount_paid:50000,deposit_amount:20000})}; };
  const one=await make(a),key=randomUUID(),res=await checkout(a,one.b,one.r,{p_command_id:key,p_subtotal:180000,p_damage_charges:30000});
  assert.equal(res.status,200);
  const invoices=async (id=one.b.id)=>(await db.query('SELECT * FROM public.guest_invoices WHERE booking_id=$1 ORDER BY created_at,id',[id])).rows;
  let rows=await invoices();
  record('invoice-core-commit-already-has-receipt-without-browser',rows.length===1&&rows[0].checkout_command_id===key
    &&res.data.invoice_id===rows[0].id&&res.data.invoice_state==='issued',{invoices:rows.length});
  record('invoice-financial-snapshot-equals-authoritative-checkout',rows.length===1&&Number(rows[0].subtotal)===180000
    &&Number(rows[0].vat_amount)===12000&&Number(rows[0].service_fee_amount)===7500&&Number(rows[0].total_amount)===199500
    &&Number(rows[0].amount_paid)===50000&&Number(rows[0].deposit_amount)===20000
    &&rows[0].line_items.reduce((n,x)=>n+Number(x.amount),0)===180000,{invoices:rows.length});
  const twenty=await Promise.all(Array.from({length:20},()=>checkout(a,one.b,one.r,{p_command_id:key,p_subtotal:180000,p_damage_charges:30000})));
  record('invoice-twenty-core-replays-keep-one-stable-invoice',twenty.every(x=>x.status===200&&x.data.invoice_id===res.data.invoice_id)
    &&(await invoices()).length===1,{requests:20,invoices:(await invoices()).length});
  const foreign=await make(b),other=await checkout(b,foreign.b,foreign.r,{p_subtotal:180000,p_damage_charges:30000});
  const otherRows=await invoices(foreign.b.id);
  record('invoice-two-tenants-get-distinct-global-numbers',other.status===200&&rows.length===1&&otherRows.length===1
    &&rows[0].invoice_number!==otherRows[0].invoice_number,{invoices:rows.length+otherRows.length});
  // The same fixture is a red baseline before the forward migration. Do not
  // pretend tests requiring the new receipt fields have run in that baseline.
  if(!rows[0]?.checkout_command_id)return;
  const inv=rows[0];
  const direct=async(actor,method,id,body)=>{
    const response=await fetch('http://127.0.0.1:8000/rest/v1/guest_invoices'+(id?'?id=eq.'+id:''),{
      method,signal:AbortSignal.timeout(25000),headers:{apikey:input.publishableKey,authorization:'Bearer '+(actor.token??actor),
        'content-type':'application/json',prefer:'return=representation'},...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json()}catch{data=null}return {status:response.status,data};
  };
  await denied('invoice-issued-financial-snapshot-cannot-be-edited',()=>direct(a,'PATCH',inv.id,{subtotal:1,total_amount:1}));
  await denied('invoice-issued-receipt-cannot-be-deleted',()=>direct(a,'DELETE',inv.id));
  await denied('invoice-service-key-cannot-rewrite-issued-financial-snapshot',()=>direct(input.serviceKey,'PATCH',inv.id,{total_amount:1}));
  const metadata=await direct(input.serviceKey,'PATCH',inv.id,{guest_email:'owned-receipt@roomqc.invalid',email_sent_at:new Date().toISOString()});
  record('invoice-delivery-metadata-keeps-email-flow-without-changing-money',metadata.status===200
    &&Number((await invoices())[0].total_amount)===199500,{status:metadata.status,notInternetEmail:true});
  const vat=await rpc('ensure_vat_claim_token',a,{p_invoice_id:inv.id});
  const vatCount=(await db.query('SELECT count(*)::int AS n FROM public.invoice_vat_claims WHERE invoice_id=$1',[inv.id])).rows[0].n;
  record('invoice-existing-vat-claim-flow-can-update-nonfinancial-metadata',vat.status===200&&vatCount===1
    &&Number((await invoices())[0].total_amount)===199500,{status:vat.status,claims:vatCount});
  const submitted=await rpc('submit_vat_claim_public',a,{p_token:vat.data?.[0]?.token,p_company_name:'Owned fixture company',
    p_tax_code:'0101234567',p_company_address:'123 Fixture Road',p_email:'owned-receipt@roomqc.invalid'});
  const afterVat=(await invoices())[0];
  record('invoice-vat-recipient-submission-preserves-core-financial-snapshot',submitted.status===200
    &&afterVat.company_name==='Owned fixture company'&&Number(afterVat.total_amount)===199500&&Number(afterVat.vat_amount)===12000,
    {status:submitted.status,notFiscalProviderProof:true});
  const forged={...inv,id:randomUUID(),invoice_number:'FORGED-'+randomUUID()};delete forged.created_at;delete forged.updated_at;
  await denied('invoice-browser-cannot-forge-checkout-provenance',()=>direct(a,'POST',null,forged));
  await denied('invoice-service-key-cannot-forge-checkout-provenance',()=>direct(input.serviceKey,'POST',null,{...forged,id:randomUUID()}));
  const manual={tenant_id:a.tenantId,hotel_id:a.hotelId,booking_id:foreign.b.id,invoice_number:'WRONG-'+randomUUID(),guest_name:'Owned synthetic guest'};
  await denied('invoice-cross-tenant-booking-link-denied-without-effects',()=>direct(a,'POST',null,manual));
  await denied('invoice-second-manual-receipt-cannot-duplicate-core-invoice',()=>direct(a,'POST',null,{...manual,booking_id:one.b.id} ),[409]);
  const pending=await make(a),before=await snapshot();
  await db.query(`CREATE FUNCTION private.owned_invoice_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.booking_id='${pending.b.id}'::uuid THEN RAISE EXCEPTION 'OWNED_INVOICE_FAULT';END IF;RETURN NEW;END;$f$;
    CREATE TRIGGER owned_invoice_fault BEFORE INSERT ON public.guest_invoices FOR EACH ROW EXECUTE FUNCTION private.owned_invoice_fault()`);
  let failed;try{failed=await checkout(a,pending.b,pending.r,{p_subtotal:180000,p_damage_charges:30000})}
  finally{await db.query('DROP TRIGGER owned_invoice_fault ON public.guest_invoices;DROP FUNCTION private.owned_invoice_fault()')}
  record('invoice-insert-fault-rolls-back-booking-money-room-event-audit-receipt',failed.status>=400&&before===await snapshot(),
    {status:failed.status,effectsUnchanged:before===await snapshot()});
  const recovered=await checkout(a,pending.b,pending.r,{p_subtotal:180000,p_damage_charges:30000});
  record('invoice-insert-fault-recovery-creates-exactly-one-invoice',recovered.status===200&&(await invoices(pending.b.id)).length===1,{status:recovered.status});
  const pair=await Promise.all([make(a),make(a)]),concurrent=await Promise.all(pair.map(x=>checkout(a,x.b,x.r,{p_subtotal:180000,p_damage_charges:30000})));
  const pairRows=(await Promise.all(pair.map(x=>invoices(x.b.id)))).flat();
  record('invoice-independent-concurrent-checkouts-have-unique-numbers',concurrent.every(x=>x.status===200)&&pairRows.length===2
    &&new Set(pairRows.map(x=>x.invoice_number)).size===2,{invoices:pairRows.length,actualConcurrentRest:true});
  const managed=await make(a),managedResult=await checkout(manager,managed.b,managed.r,{p_subtotal:180000,p_damage_charges:30000});
  record('invoice-assigned-manager-checkout-materializes-receipt',managedResult.status===200&&(await invoices(managed.b.id)).length===1,{status:managedResult.status});
  const group=await Promise.all([make(a),make(a)]),groupKey=randomUUID();
  const groupArgs={p_checkouts:group.map(x=>({booking_id:x.b.id,room_id:x.r.id,subtotal:180000,damage_charges:30000})),p_command_id:groupKey};
  const gr=await rpc('perform_group_checkout',a,groupArgs),groupRows=(await Promise.all(group.map(x=>invoices(x.b.id)))).flat();
  record('invoice-group-checkout-commits-one-invoice-for-each-member',gr.status===200&&groupRows.length===2
    &&gr.data.results.every(x=>groupRows.some(i=>i.id===x.invoice_id&&i.checkout_command_id===x.command_id&&i.booking_id===x.booking_id)),
    {status:gr.status,invoices:groupRows.length});
  const groupBefore=await snapshot(),grReplay=await rpc('perform_group_checkout',a,groupArgs);
  record('invoice-group-replay-keeps-members-and-all-effects-unchanged',grReplay.status===200&&grReplay.data.replayed===true
    &&JSON.stringify(grReplay.data.results)===JSON.stringify(gr.data.results)&&groupBefore===await snapshot(),{effectsUnchanged:groupBefore===await snapshot()});
  const brokenGroup=await Promise.all([make(a),make(a)]),brokenBefore=await snapshot();
  const sorted=[...brokenGroup].sort((x,y)=>x.b.id.localeCompare(y.b.id));
  await db.query(`CREATE FUNCTION private.owned_group_invoice_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.booking_id='${sorted[1].b.id}'::uuid THEN RAISE EXCEPTION 'OWNED_GROUP_INVOICE_FAULT';END IF;RETURN NEW;END;$f$;
    CREATE TRIGGER owned_group_invoice_fault BEFORE INSERT ON public.guest_invoices FOR EACH ROW EXECUTE FUNCTION private.owned_group_invoice_fault()`);
  let broken;try{broken=await rpc('perform_group_checkout',a,{p_checkouts:brokenGroup.map(x=>({booking_id:x.b.id,room_id:x.r.id,subtotal:180000,damage_charges:30000}))})}
  finally{await db.query('DROP TRIGGER owned_group_invoice_fault ON public.guest_invoices;DROP FUNCTION private.owned_group_invoice_fault()')}
  record('invoice-second-group-member-fault-rolls-back-entire-group',broken.status>=400&&brokenBefore===await snapshot(),
    {status:broken.status,effectsUnchanged:brokenBefore===await snapshot()});
  const expiring=await make(a),expiryBefore=await snapshot();
  await db.query(`CREATE FUNCTION private.owned_invoice_expiry() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.booking_id='${expiring.b.id}'::uuid THEN PERFORM pg_sleep(1.6);END IF;RETURN NEW;END;$f$;
    CREATE TRIGGER owned_invoice_expiry AFTER INSERT ON public.guest_invoices FOR EACH ROW EXECUTE FUNCTION private.owned_invoice_expiry()`);
  let expired;try{
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1",[a.sessionId]);
    expired=await checkout(a,expiring.b,expiring.r,{p_subtotal:180000,p_damage_charges:30000});
  }finally{
    await db.query('DROP TRIGGER owned_invoice_expiry ON public.guest_invoices;DROP FUNCTION private.owned_invoice_expiry()');
    await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1',[a.sessionId]);
  }
  record('invoice-post-insert-session-expiry-rolls-back-every-effect',expired.status===403&&expiryBefore===await snapshot(),
    {status:expired.status,effectsUnchanged:expiryBefore===await snapshot()});
  const high=await make(a);await db.query("SELECT setval('private.checkout_invoice_numbers',1000000000000)");
  const highResult=await checkout(a,high.b,high.r,{p_subtotal:180000,p_damage_charges:30000}),highRows=await invoices(high.b.id);
  record('invoice-number-never-truncates-a-long-sequence-value',highResult.status===200&&highRows[0]?.invoice_number.endsWith('-1000000000001'),
    {status:highResult.status});
}

async function cancellationRace(a, operation, first, fixtureOverride = null, labelPrefix = '') {
  const f = fixtureOverride ?? await cancellationFixture(a, operation), before = await businessSnapshot(), lock = await db.connect();
  let writer, cancelled;
  try {
    await lock.query('BEGIN');
    await lock.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [a.id + ':' + f.id]);
    // Observe queue order at the exact command lock, then enqueue the second
    // real REST request. Both paths also recheck live scope after this wait.
    const firstCall = first === 'cancel' ? f.cancel(a) : f.invoke(a);
    await lockBarrier(first === 'cancel' ? f.cancelRpc : f.writerRpc);
    const secondCall = first === 'cancel' ? f.invoke(a) : f.cancel(a);
    await lockBarrier(first === 'cancel' ? f.writerRpc : f.cancelRpc);
    await lock.query('COMMIT');
    const result = await Promise.all([firstCall, secondCall]);
    [cancelled, writer] = first === 'cancel' ? result : [...result].reverse();
  } finally { await lock.query('ROLLBACK'); lock.release(); }
  const state = await snapshot(), found = await f.lookup(a), replay = await f.invoke(a);
  const noLateEffects = state === await snapshot();
  const passed = cancelled.status === 200 && writer.status === 200 && found.status === 200 && replay.status === 200
    && [cancelled, writer, found, replay].every(r => r.data?.command_id === f.id)
    && (first === 'cancel'
      ? [cancelled, writer, found, replay].every(r => r.data?.state === 'cancelled') && before === await businessSnapshot()
      : [cancelled, writer, found, replay].every(r => r.data?.state !== 'cancelled') && before !== await businessSnapshot())
    && noLateEffects;
  const label = labelPrefix + operation + '-' + first + '-wins-real-command-lock-race';
  record(label, passed, { statuses: [cancelled.status, writer.status, found.status, replay.status], realLockBarrier: true, noLateEffects });
  races.push({ label, passed, realLockBarrier: true, actualConcurrentRest: true, waitingRequests: 2 });
}
async function cancellationFault(a, operation, expire) {
  const f = await cancellationFixture(a, operation), table = f.isCheck ? 'private.workflow_room_check_commands' : 'private.booking_room_commands';
  const before = await snapshot(); let result;
  await db.query(`CREATE SEQUENCE private.owned_cancel_fault_seen;
    CREATE FUNCTION private.owned_cancel_fault() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $f$
    BEGIN IF NEW.command_id='${f.id}'::uuid AND NEW.result->>'state'='cancelled' THEN
      PERFORM nextval('private.owned_cancel_fault_seen');
      ${expire ? 'PERFORM pg_sleep(1.6);' : "RAISE EXCEPTION 'OWNED_CANCEL_FAULT';"}
    END IF; RETURN NEW; END;$f$;
    CREATE TRIGGER owned_cancel_fault ${expire ? 'AFTER' : 'BEFORE'} INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION private.owned_cancel_fault()`);
  let reached = false;
  try {
    if (expire) await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1", [a.sessionId]);
    result = await f.cancel(a);
    reached = (await db.query('SELECT is_called FROM private.owned_cancel_fault_seen')).rows[0].is_called;
  } finally {
    await db.query(`DROP TRIGGER owned_cancel_fault ON ${table};DROP FUNCTION private.owned_cancel_fault();DROP SEQUENCE private.owned_cancel_fault_seen`);
    if (expire) await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [a.sessionId]);
  }
  const effectsUnchanged = before === await snapshot(), label = operation + '-cancel-' + (expire ? 'post-insert-expiry' : 'receipt-fault');
  record(label + '-rolls-back-terminal-outcome', reached && (expire ? result.status === 403 : result.status >= 400) && effectsUnchanged,
    { status: result.status, faultReached: reached, effectsUnchanged });
  const recovery = await f.cancel(a), state = await snapshot(), late = await f.invoke(a);
  record(label + '-same-key-cancel-recovery-and-late-writer', recovery.status === 200 && recovery.data?.state === 'cancelled'
    && late.status === 200 && late.data?.state === 'cancelled' && state === await snapshot(), { status: recovery.status, lateStatus: late.status });
}
async function cancellationExpiry(a, operation) {
  const f = await cancellationFixture(a, operation), lock = await db.connect(), before = await snapshot(); let result;
  const roomId = f.request.room_id;
  try {
    await lock.query('BEGIN'); await lock.query('SELECT id FROM public.rooms WHERE id=$1 FOR UPDATE', [roomId]);
    await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()+interval '1.5 seconds' WHERE id=$1", [a.sessionId]);
    const pending = f.cancel(a); await lockBarrier(f.cancelRpc); await db.query('SELECT pg_sleep(1.6)');
    await lock.query('COMMIT'); result = await pending;
  } finally { await lock.query('ROLLBACK'); lock.release(); await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [a.sessionId]); }
  const passed = result.status === 403 && before === await snapshot(), label = operation + '-cancel-expiry-after-real-room-lock-denied';
  record(label, passed, { status: result.status, effectsUnchanged: before === await snapshot(), realLockBarrier: true });
  races.push({ label, passed, realLockBarrier: true });
  const recovered = await f.cancel(a); record(label + '-recovery-positive', recovered.status === 200 && recovered.data?.state === 'cancelled', { status: recovered.status });
}
async function cancellationChecks(a, b, manager, otherHotel) {
  const operations = ['quick_check', 'undo_quick_check', 'transfer', 'checkin', 'checkout', 'group_checkout'];
  for (const operation of operations) {
    const f = await cancellationFixture(a, operation), before = await businessSnapshot();
    const twenty = await Promise.all(Array.from({ length: 20 }, () => f.cancel(a)));
    const receipts = (await db.query(`SELECT count(*)::int AS n FROM ${f.isCheck ? 'private.workflow_room_check_commands' : 'private.booking_room_commands'}
      WHERE actor_id=$1 AND command_id=$2`, [a.id, f.id])).rows[0].n;
    record(operation + '-twenty-cancellations-one-terminal-receipt-no-business-effects', twenty.every(r => r.status === 200 && r.data?.state === 'cancelled'
      && r.data?.operation === operation && r.data?.command_id === f.id) && receipts === 1 && before === await businessSnapshot(),
      { statuses: [...new Set(twenty.map(r => r.status))], requests: 20, receipts, businessUnchanged: before === await businessSnapshot() });
    const state = await snapshot(), late = await Promise.all(Array.from({ length: 20 }, () => f.invoke(a))), recovered = await f.lookup(a);
    record(operation + '-twenty-late-writers-and-lookup-return-cancelled-without-effects', late.every(r => r.status === 200 && r.data?.state === 'cancelled')
      && recovered.status === 200 && recovered.data?.state === 'cancelled' && state === await snapshot(), { requests: 20, lookupStatus: recovered.status, effectsUnchanged: state === await snapshot() });
    await denied(operation + '-foreign-owner-cancellation-denied', () => f.cancel(b));
    const changedRequest = operation === 'quick_check' ? { ...f.request, notes: 'Different intent' }
      : operation === 'undo_quick_check' || operation === 'transfer' ? { ...f.request, reason: 'Different intent' }
      : operation === 'checkin' ? { ...f.request, early_checkin_charge: 10 }
      : operation === 'checkout' ? { ...f.request, subtotal: 10 }
      : { checkouts: f.request.checkouts.map((item, i) => i ? item : { ...item, subtotal: 2000 }) };
    await denied(operation + '-cancellation-same-key-different-payload-conflict', () => f.cancel(a, { p_request: changedRequest }), [409]);
    if (operation === 'group_checkout') {
      const reordered = await f.cancel(a, { p_request: { checkouts: [...f.request.checkouts].reverse() } });
      record('group-cancellation-reordered-payload-replays-same-terminal', reordered.status === 200 && reordered.data?.state === 'cancelled'
        && reordered.data?.replayed === true && state === await snapshot(), { status: reordered.status });
    }
    const committed = await cancellationFixture(a, operation), performed = await committed.invoke(a), after = await snapshot(), cancelled = await committed.cancel(a);
    record(operation + '-cancel-after-commit-returns-completed-result', performed.status === 200 && cancelled.status === 200
      && cancelled.data?.state !== 'cancelled' && cancelled.data?.command_id === committed.id && cancelled.data?.replayed === true
      && JSON.stringify({ ...cancelled.data, replayed: false }) === JSON.stringify({ ...performed.data, replayed: false }) && after === await snapshot(),
      { writerStatus: performed.status, cancelStatus: cancelled.status, effectsUnchanged: after === await snapshot() });
    await cancellationRace(a, operation, 'cancel'); await cancellationRace(a, operation, 'writer');
  }
  for (const operation of ['quick_check', 'checkin']) {
    const f = await cancellationFixture(a, operation);
    await denied(operation + '-anonymous-cancel-denied', () => f.cancel(input.publishableKey));
    await denied(operation + '-service-key-cancel-denied', () => f.cancel(input.serviceKey));
    await denied(operation + '-invalid-operation-cancel-denied', () => f.cancel(a, { p_operation: 'not_an_operation' }), [400]);
    await denied(operation + '-malformed-request-cancel-denied', () => f.cancel(a, { p_request: {} }), [400]);
    await db.query('UPDATE public.users SET account_locked=true WHERE id=$1', [a.id]);
    await denied(operation + '-locked-owner-cancel-denied', () => f.cancel(a));
    await db.query('UPDATE public.users SET account_locked=false WHERE id=$1', [a.id]);
    const unassigned = await cancellationFixture(a, operation, otherHotel.id);
    await denied(operation + '-unassigned-hotel-cancel-denied', () => unassigned.cancel(manager));
    await cancellationExpiry(a, operation);
    await cancellationFault(a, operation, false); await cancellationFault(a, operation, true);
  }
  const sameCheck = await cancellationFixture(a, 'quick_check'), terminal = await sameCheck.cancel(a);
  assert.equal(terminal.status, 200);
  const otherCheck = await cancellationFixture(a, 'undo_quick_check');
  await denied('room-check-cancellation-same-key-different-operation-conflict', () => otherCheck.cancel(a, { p_command_id: sameCheck.id }), [409]);
  const sameBooking = await cancellationFixture(a, 'checkin'); assert.equal((await sameBooking.cancel(a)).status, 200);
  const otherBooking = await cancellationFixture(a, 'checkout');
  await denied('booking-cancellation-same-key-different-operation-conflict', () => otherBooking.cancel(a, { p_command_id: sameBooking.id }), [409]);
}
try {
  const catalog = await inventory(), a = await owner('a'), b = await owner('b'), manager = await account('manager');
  await insert('users', { id: manager.id, email: manager.email, full_name: 'Owned assigned manager', tenant_id: a.tenantId, hotel_id: a.hotelId,
    role: 'hotel_manager', user_level_code: 'manager', status: 'active', created_by: a.id, must_change_password: false, account_locked: false });
  await insert('user_roles', { user_id: manager.id, role: 'hotel_manager' });
  await insert('user_hotels', { user_id: manager.id, hotel_id: a.hotelId, assigned_by: a.id });
  await db.query("INSERT INTO public.user_permissions(user_id,tenant_id,module,action,enabled) VALUES($1,$2,'bookings','update',true)", [manager.id, a.tenantId]);
  assert.equal((await db.query("SELECT role='hotel_manager' AND user_level_code='manager' AND EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=$1 AND role='hotel_manager') AS valid FROM public.users WHERE id=$1", [manager.id])).rows[0].valid, true, 'Owned manager fixture role must be coherent');
  const other = await insert('hotels', { id: randomUUID(), tenant_id: a.tenantId, name: 'Owned unassigned hotel', address: '123 Fixture Road', status: 'active' });
  for (const id of [a.hotelId, b.hotelId, other.id]) await configureHotel(id);
  const deadline = Date.now() + 10000;
  while (true) {
    const res = await quick(a, { id: randomUUID() }); if (res.data?.code !== 'PGRST202') break;
    assert.ok(Date.now() < deadline, 'Room writer schema cache readiness'); await new Promise(resolve => setTimeout(resolve, 25));
  }
  const dirty = await room(a, a.hotelId, 'vacant_dirty'), qr = await quick(a, dirty), qs = await roomState(dirty.id);
  record('quick-v2-dirty-room-becomes-clean', qr.status === 200 && qr.data?.new_status === 'vacant_clean' && qs.status === 'vacant_clean' && qs.checks === 1,
    { status: qr.status, roomStatus: qs.status, checkCount: qs.checks });
  record('quick-room-transition-has-one-canonical-source-event', qr.status === 200 && qs.events === 1 && qs.audit === 1, { canonicalEvents: qs.events, roomAudit: qs.audit });
  const clean = await room(a), cleanQuick = await quick(a, clean), cleanState = await roomState(clean.id);
  record('quick-clean-room-check-positive', cleanQuick.status === 200 && cleanState.checks === 1 && cleanState.status === 'vacant_clean', { status: cleanQuick.status });
  const assigned = await room(a), managerQuick = await quick(manager, assigned);
  record('assigned-manager-quick-check-positive', managerQuick.status === 200, { status: managerQuick.status });
  const unassignedRoom = await room(a, other.id);
  await denied('quick-unassigned-hotel-denied-without-effects', () => quick(manager, unassignedRoom));
  await denied('quick-foreign-tenant-denied-without-effects', () => quick(b, clean), [401, 403]);
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1', [a.id]);
  const lockedRoom = await room(a); await denied('quick-locked-owner-denied-without-effects', () => quick(a, lockedRoom));
  await db.query('UPDATE public.users SET account_locked=false WHERE id=$1', [a.id]);
  await db.query("UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=$1", [a.sessionId]);
  const expiredRoom = await room(a); await denied('quick-expired-session-denied-without-effects', () => quick(a, expiredRoom));
  await db.query('UPDATE auth.sessions SET not_after=NULL WHERE id=$1', [a.sessionId]);
  await quickExpiry(a, await room(a));
  await configureHotel(a.hotelId, 0, 'always');
  const photoRoom = await room(a); await denied('quick-required-photo-denied-without-effects', () => quick(a, photoRoom), [400]);
  const photoRes = await quick(a, photoRoom, { _photos: ['owned-fixture/photo.jpg'] }); record('quick-required-photo-positive', photoRes.status === 200, { status: photoRes.status });
  await configureHotel(a.hotelId, 0, 'none', false);
  const disabledRoom = await room(a); await denied('quick-disabled-policy-denied-without-effects', () => quick(a, disabledRoom), [400]);
  await configureHotel(a.hotelId, 30);
  const rateRoom = await room(a), rateFirst = await quick(a, rateRoom); record('quick-rate-limit-first-positive', rateFirst.status === 200, { status: rateFirst.status });
  await denied('quick-rate-limit-second-denied-without-effects', () => quick(a, rateRoom), [400]); await configureHotel(a.hotelId);
  await quickAuditFault(a, await room(a));
  const undoRoom = await room(a), undoCheck = await quick(a, undoRoom); assert.equal(undoCheck.status, 200);
  const undoRes = await undo(a, undoCheck.data.check_id); record('quick-undo-owner-positive', undoRes.status === 200, { status: undoRes.status });
  const afterUndo = await snapshot(), undoReplay = await undo(a, undoCheck.data.check_id);
  record('quick-undo-repeat-does-not-append-audit-or-notes', [200, 409].includes(undoReplay.status) && afterUndo === await snapshot(), { status: undoReplay.status, effectsUnchanged: afterUndo === await snapshot() });
  const managerUndoRoom = await room(a), managerUndoCheck = await quick(manager, managerUndoRoom); assert.equal(managerUndoCheck.status, 200);
  await db.query('DELETE FROM public.user_hotels WHERE user_id=$1 AND hotel_id=$2', [manager.id, a.hotelId]);
  await denied('quick-undo-removed-hotel-assignment-denied', () => undo(manager, managerUndoCheck.data.check_id));
  await db.query('INSERT INTO public.user_hotels(user_id,hotel_id,assigned_by) VALUES($1,$2,$3)', [manager.id, a.hotelId, a.id]);
  const lockedUndoRoom = await room(a), lockedUndoCheck = await quick(a, lockedUndoRoom); assert.equal(lockedUndoCheck.status, 200);
  await db.query('UPDATE public.users SET account_locked=true WHERE id=$1', [a.id]);
  await denied('quick-undo-locked-owner-denied', () => undo(a, lockedUndoCheck.data.check_id));
  await db.query('UPDATE public.users SET account_locked=false WHERE id=$1', [a.id]);
  await commandChecks(a, b, manager);
  const old = await room(a, a.hotelId, 'occupied_clean'), target = await room(a), checkedIn = await booking(a, old, 'checked_in');
  const moved = await transfer(a, checkedIn, target), movedRoom = await roomState(target.id), oldRoom = await roomState(old.id);
  record('owner-checked-in-transfer-positive', moved.status === 200 && movedRoom.status === 'occupied_clean' && oldRoom.status === 'vacant_dirty', { status: moved.status });
  const bookingAudit = (await db.query("SELECT count(*)::int AS n FROM public.audit_log WHERE record_id=$1 AND table_name IN('room_bookings','bookings','booking')", [checkedIn.id])).rows[0].n;
  record('transfer-committed-booking-has-audit', moved.status === 200 && bookingAudit > 0, { status: moved.status, bookingAudit });
  const staffOld = await room(a, a.hotelId, 'occupied_clean'), staffTarget = await room(a), staffBooking = await booking(a, staffOld, 'checked_in');
  const staffMove = await transfer(manager, staffBooking, staffTarget);
  record('assigned-manager-checked-in-transfer-positive', staffMove.status === 200 && (await roomState(staffTarget.id)).status === 'occupied_clean',
    { status: staffMove.status, forceRequiresOwner: staffMove.data?.message === 'FORCE_REQUIRES_OWNER', validManagerProfile: true });
  const unassignedOld = await room(a, other.id), unassignedTarget = await room(a, other.id), unassignedBooking = await booking(a, unassignedOld);
  await denied('transfer-unassigned-hotel-denied-without-effects', () => transfer(manager, unassignedBooking, unassignedTarget));
  const blockedOld = await room(a), blockedTarget = await room(a, a.hotelId, 'out_of_service'), blockedBooking = await booking(a, blockedOld);
  await denied('transfer-out-of-service-target-denied-without-effects', () => transfer(a, blockedBooking, blockedTarget), [400, 409]);
  const overlapOld = await room(a), overlapTarget = await room(a), overlapBooking = await booking(a, overlapOld); await booking(a, overlapTarget);
  await denied('transfer-overlapping-target-denied-without-effects', () => transfer(a, overlapBooking, overlapTarget), [400, 409]);
  const checkinRoom = await room(a), checkinBooking = await booking(a, checkinRoom);
  const ci = await rpc('perform_checkin', a, { p_booking_id: checkinBooking.id, p_room_id: checkinRoom.id, p_early_checkin_charge: 0 }), cis = await roomState(checkinRoom.id);
  record('owner-checkin-positive', ci.status === 200 && cis.status === 'occupied_clean', { status: ci.status });
  record('checkin-canonical-room-source-event', ci.status === 200 && cis.events === 1, { status: ci.status, canonicalEvents: cis.events });
  if (ci.status === 200) {
    const co = await rpc('perform_checkout', a, { p_booking_id: checkinBooking.id, p_room_id: checkinRoom.id }), cos = await roomState(checkinRoom.id);
    record('owner-checkout-positive', co.status === 200 && cos.status === 'vacant_dirty', { status: co.status });
    record('checkout-canonical-room-source-event', co.status === 200 && cos.events === 2, { status: co.status, canonicalEvents: cos.events });
  }
  await bookingOperationChecks(a, b, manager, other);
  await cancellationChecks(a, b, manager, other);
  await actualOperationClientChecks(a);
  await checkoutInvoiceChecks(a,b,manager);
  await bookingAdjustmentChecks(a,b,manager,other.id);
  await bookingNotificationChecks(a,b,manager,other.id);
  await bookingExternalNotificationChecks({a,b,manager,db,record,races,rpc,room,booking,checkout,checkin,snapshot,lockBarrier,input});
  await bookingFlagBaselineChecks({a,b,manager,other,db,record,races,rpc,room,booking,checkout,checkin,snapshot,lockBarrier,account,insert});
  const timerRoom = await room(b, b.hotelId, 'dnd'); await db.query("UPDATE public.rooms SET dnd_until=clock_timestamp()-interval '1 minute' WHERE id=$1", [timerRoom.id]);
  await denied('browser-cannot-run-cross-tenant-room-timer', () => rpc('lift_expired_dnd_oos', a), [401, 403]);
  console.log(JSON.stringify({ verified: checks.every(c => c.passed), checks, races, inventory: catalog, actualAuth: true, actualRest: true,
    actualApplicationOperationClient:true,applicationClientOperations:6,applicationClientChecks:checks.filter(c=>c.label.startsWith('application-operation-')).length,
    actualConfiguredEngine: false, allWriterPathsClosed: false, diagnosticScope: 'Q02-initial-room-writers', aclFixture: { id: a.id, sessionId: a.sessionId }, productAcceptance: false }));
} finally { await db.end(); }
