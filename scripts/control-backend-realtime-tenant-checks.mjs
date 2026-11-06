import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from '/control/node_modules/pg/lib/index.js';
import { createClient } from '@supabase/supabase-js';

// Focused Realtime tenant-isolation probe. It creates only disposable fixtures
// in the private sandbox and never touches the serving 8082 database.
const input = JSON.parse(process.env.ROOMQC_FIXTURE_REALTIME_TENANT_INPUT ?? 'null');
assert.match(input?.run ?? '', /^[a-f0-9]{12}$/);
assert.ok(input.publishableKey && input.serviceKey && input.databasePassword);

const origin = 'http://127.0.0.1:8000';
const db = new pg.Pool({ host: 'db', port: 5432, database: 'postgres', user: 'supabase_admin',
  password: input.databasePassword, max: 3, statement_timeout: 15000, connectionTimeoutMillis: 4000 });
const clients = [];
const fixture = { tenants: [], users: [], rooms: [], channels: [] };
const checks = [];
const events = { ownerA: [], ownerB: [], staffA: [] };
let stage = 'start';
const email = label => `realtime-${input.run}-${label}@roomqc.invalid`;
const password = label => createHash('sha256').update(`${input.databasePassword}:realtime:${input.run}:${label}`).digest('hex');
const record = (label, passed, details = {}) => checks.push({ label: `realtime-tenant-${label}`, passed: !!passed, ...details });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeError = error => error ? { code: error.code ?? null, status: error.status ?? null,
  message: /^[A-Za-z0-9_. -]{1,160}$/.test(error.message ?? '') ? error.message : null } : null;

async function api(path, token, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(origin + path, {
    method,
    signal: AbortSignal.timeout(20000),
    headers: { apikey: input.publishableKey, authorization: `Bearer ${token}`, 'content-type': 'application/json',
      ...(body === undefined ? {} : { prefer: 'return=representation' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let data = null; try { data = await response.json(); } catch {}
  return { status: response.status, data };
}

async function createOwner(label) {
  const address = email(label), secret = password(label);
  const created = await api('/auth/v1/admin/users', input.serviceKey,
    { email: address, password: secret, email_confirm: true });
  assert.equal(created.status, 200, `create owner ${label}`);
  const login = await api('/auth/v1/token?grant_type=password', input.publishableKey,
    { email: address, password: secret });
  assert.equal(login.status, 200, `login owner ${label}`);
  const provision = await api('/rest/v1/rpc/provision_workspace_registration', input.serviceKey, {
    p_workspace_id: randomUUID(), p_owner_id: created.data.id,
    p_fields: { fullName: `Realtime ${label}`, phone: '0901234567', tenantName: `Realtime ${label}`,
      hotelName: `Realtime ${label}`, hotelAddress: '123 Fixture Road', hotelPhone: '0281234567',
      hotelEmail: address, totalRooms: 2 },
  });
  assert.equal(provision.status, 200, `provision owner ${label}`);
  assert.equal(provision.data.success, true);
  const refreshed = await api('/auth/v1/token?grant_type=password', input.publishableKey,
    { email: address, password: secret });
  assert.equal(refreshed.status, 200, `re-login owner ${label}`);
  const token = refreshed.data.access_token;
  const tokenPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
  const sessionState = (await db.query(`SELECT count(*)::int AS sessions,
      count(*) FILTER (WHERE id=$1::uuid)::int AS matching_session
    FROM auth.sessions WHERE user_id=$2::uuid`, [tokenPayload.session_id, created.data.id])).rows[0];
  record(`${label}-post-provision-session`, tokenPayload.role === 'authenticated' &&
    tokenPayload.sub === created.data.id && sessionState.matching_session === 1,
    { tokenClaims: { role: tokenPayload.role, sub: tokenPayload.sub, session_id: tokenPayload.session_id }, sessionState });
  const profile = await api(`/rest/v1/users?id=eq.${created.data.id}&select=id,tenant_id,hotel_id,role,user_level_code,status,account_locked`, token);
  const memberships = await api(`/rest/v1/user_hotels?user_id=eq.${created.data.id}&select=user_id,hotel_id`, token);
  record(`${label}-post-provision-scope-read`, profile.status === 200 && profile.data?.length === 1 && memberships.status === 200 && memberships.data?.length >= 1,
    { profileStatus: profile.status, profileRows: profile.data?.length ?? 0, membershipStatus: memberships.status, membershipRows: memberships.data?.length ?? 0 });
  const actor = { label, id: created.data.id, email: address, password: secret, token,
    tenantId: provision.data.tenant_id, hotelId: provision.data.hotel_id };
  fixture.tenants.push(actor.tenantId); fixture.users.push(actor.id);
  return actor;
}

async function insert(table, value) {
  const result = await api(`/rest/v1/${table}`, input.serviceKey, value);
  assert.equal(result.status, 201, `insert ${table}`);
  return result.data[0];
}

async function createStaff(owner) {
  const label = 'staff-a', address = email(label), secret = password(label);
  const created = await api('/auth/v1/admin/users', input.serviceKey,
    { email: address, password: secret, email_confirm: true });
  assert.equal(created.status, 200, 'create staff auth user');
  fixture.users.push(created.data.id);
  const profile = await insert('users', { id: created.data.id, tenant_id: owner.tenantId, hotel_id: owner.hotelId,
    full_name: 'Realtime staff A', email: address, role: 'staff', user_level_code: 'staff', department: 'housekeeping',
    status: 'active', created_by: owner.id });
  assert.equal(profile.id, created.data.id);
  await insert('user_hotels', { user_id: created.data.id, hotel_id: owner.hotelId, assigned_by: owner.id });
  await insert('user_roles', { user_id: created.data.id, role: 'staff', created_by: owner.id });
  const login = await api('/auth/v1/token?grant_type=password', input.publishableKey,
    { email: address, password: secret });
  assert.equal(login.status, 200, 'login staff auth user');
  return { id: created.data.id, email: address, password: secret, token: login.data.access_token,
    tenantId: owner.tenantId, hotelId: owner.hotelId };
}

function clientFor(actor) {
  const value = createClient(origin, input.publishableKey, {
    // `realtime.setAuth()` only applies to the websocket connection.  REST
    // reads and RPC calls otherwise keep using the publishable/anon token,
    // which makes an authenticated fixture look like a permission failure.
    global: { headers: { Authorization: `Bearer ${actor.token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  clients.push(value);
  return value;
}

async function subscribe(actor, key, ids) {
  const value = clientFor(actor);
  let subscribed = false, postgresReady = false, failed = null;
  await value.realtime.setAuth(actor.token);
  const channel = value.channel(`roomqc-realtime-tenant-${input.run}-${key}`)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms' }, payload => {
      if (!ids.has(payload.new?.id)) failed = 'UNEXPECTED_ROOM_SCOPE';
      events[key].push({ id: payload.new?.id, status: payload.new?.status ?? null, notes: payload.new?.notes ?? null });
    })
    .on('system', {}, payload => {
      if (payload.extension === 'postgres_changes' && payload.status === 'ok') postgresReady = true;
    })
    .subscribe(status => {
      if (status === 'SUBSCRIBED') subscribed = true;
      if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) failed = status;
    });
  fixture.channels.push(channel);
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline && !(subscribed && postgresReady)) {
    if (failed) break;
    await sleep(100);
  }
  record(`${key}-jwt-topic-subscription`, subscribed && postgresReady && !failed,
    { subscribed, postgresReady, failed: failed ?? null });
  assert.ok(subscribed && postgresReady && !failed, `Realtime subscription ${key}`);
  return value;
}

async function updateRoom(value, roomId, marker) {
  const result = await value.rpc('transition_room_status', {
    _room_id: roomId,
    _to_status: 'vacant_dirty',
    _reason: marker,
    _force: false,
    _command_id: randomUUID(),
  });
  return { data: result.data ? [{ id: roomId, status: result.data.status ?? 'vacant_dirty' }] : [], error: result.error ? { code: result.error.code ?? null, status: result.error.status ?? null,
    message: /^[A-Za-z0-9_. -]{1,160}$/.test(result.error.message ?? '') ? result.error.message : null } : null, transport: 'supabase-client' };
}

async function updateRoomFetch(actor, roomId, marker) {
  const response = await fetch(origin + '/rest/v1/rpc/transition_room_status', {
    method: 'POST', signal: AbortSignal.timeout(20000),
    headers: { apikey: input.publishableKey, authorization: `Bearer ${actor.token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ _room_id: roomId, _to_status: 'vacant_dirty', _reason: marker,
      _force: false, _command_id: randomUUID() }),
  });
  let data = null; try { data = await response.json(); } catch {}
  const error = response.ok ? null : { code: data?.code ?? null, status: response.status,
    message: /^[A-Za-z0-9_. -]{1,160}$/.test(data?.message ?? '') ? data.message : null };
  return { data: response.ok && data ? [{ id: roomId, status: data.status ?? 'vacant_dirty' }] : [], error, transport: 'direct-fetch', httpStatus: response.status };
}

async function waitFor(predicate, label) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(100);
  }
  record(label, false, { timeout: true });
  return false;
}

let result;
try {
  stage = 'create-owners';
  const ownerA = await createOwner('owner-a');
  const ownerB = await createOwner('owner-b');
  stage = 'create-staff';
  const staffA = await createStaff(ownerA);
  stage = 'create-rooms';
  const roomA = await insert('rooms', { id: randomUUID(), tenant_id: ownerA.tenantId, hotel_id: ownerA.hotelId,
    room_number: `RT-A-${input.run.slice(0, 4)}`, room_type: 'standard', floor: 1, status: 'vacant_clean', notes: 'initial-a' });
  const roomB = await insert('rooms', { id: randomUUID(), tenant_id: ownerB.tenantId, hotel_id: ownerB.hotelId,
    room_number: `RT-B-${input.run.slice(0, 4)}`, room_type: 'standard', floor: 1, status: 'vacant_clean', notes: 'initial-b' });
  fixture.rooms.push(roomA.id, roomB.id);
  const pub = (await db.query(`SELECT EXISTS(SELECT 1 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='rooms') AS rooms_publication,
    EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') AS publication`)).rows[0];
  const rls = (await db.query(`SELECT c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
    (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname='public' AND p.tablename='rooms') AS policy_count
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='rooms'`)).rows[0];
  record('rooms-publication-and-rls-present', pub.publication === true && pub.rooms_publication === true &&
    rls.rls === true && Number(rls.policy_count) > 0, { publication: pub, rls });
  assert.equal(pub.publication, true); assert.equal(pub.rooms_publication, true); assert.equal(rls.rls, true);
  const ids = new Set([roomA.id, roomB.id]);
  const roomOwnership = (await db.query(`SELECT r.id,r.tenant_id,r.hotel_id,r.status,u.tenant_id AS owner_tenant,
      h.tenant_id AS hotel_tenant,h.status AS hotel_status
    FROM public.rooms r JOIN public.users u ON u.id=$1::uuid JOIN public.hotels h ON h.id=r.hotel_id
    WHERE r.id=$2::uuid`, [ownerA.id, roomA.id])).rows[0];
  record('room-fixture-owner-scope-alignment', !!roomOwnership && roomOwnership.tenant_id === roomOwnership.owner_tenant &&
    roomOwnership.tenant_id === roomOwnership.hotel_tenant && roomOwnership.hotel_status === 'active', { roomOwnership });
  const [clientA, clientB, clientStaff] = await Promise.all([
    subscribe(ownerA, 'ownerA', ids), subscribe(ownerB, 'ownerB', ids), subscribe(staffA, 'staffA', ids),
  ]);
  const grants = (await db.query(`SELECT has_table_privilege('anon','public.rooms','SELECT') AS anon_select,
      has_table_privilege('authenticated','public.rooms','SELECT') AS authenticated_select,
      has_table_privilege('authenticated','public.rooms','UPDATE') AS authenticated_update_table,
      has_column_privilege('authenticated','public.rooms','status','UPDATE') AS authenticated_status_update,
      has_column_privilege('authenticated','public.rooms','notes','UPDATE') AS authenticated_notes_update`)).rows[0];
  record('authenticated-rooms-column-grants', grants.authenticated_select === true &&
    grants.authenticated_update_table === false && grants.authenticated_status_update === false, { grants });
  const ownerRead = await clientA.from('rooms').select('id,notes').eq('id', roomA.id);
  record('owner-readback-before-write', !ownerRead.error && ownerRead.data?.length === 1,
    { error: safeError(ownerRead.error), rows: ownerRead.data?.length ?? 0 });
  stage = 'write-rooms';
  const markerA = `rt-${input.run}-a`, markerB = `rt-${input.run}-b`;
  const writeA = await updateRoomFetch(ownerA, roomA.id, markerA);
  const writeB = await updateRoom(clientB, roomB.id, markerB);
  const writesOk = !writeA.error && !writeB.error && writeA.data.length === 1 && writeA.data[0].status === 'vacant_dirty' &&
    writeB.data.length === 1 && writeB.data[0].status === 'vacant_dirty';
  record('owner-updates-persisted', writesOk, { ownerA: writeA.error ?? { rows: writeA.data.length }, ownerB: writeB.error ?? { rows: writeB.data.length } });
  if (writesOk) {
    stage = 'wait-events';
    const received = await waitFor(() => events.ownerA.some(e => e.id === roomA.id && e.status === 'vacant_dirty') &&
      events.staffA.some(e => e.id === roomA.id && e.status === 'vacant_dirty') &&
      events.ownerB.some(e => e.id === roomB.id && e.status === 'vacant_dirty'), 'authorized-events-received');
    const noCross = !events.ownerA.some(e => e.id === roomB.id) && !events.staffA.some(e => e.id === roomB.id) &&
      !events.ownerB.some(e => e.id === roomA.id);
    record('authorized-events-no-cross-tenant', received && noCross, { received, noCross,
      eventCounts: Object.fromEntries(Object.entries(events).map(([k, v]) => [k, v.length])) });
    await sleep(1500);
    const noCrossWindow = !events.ownerA.some(e => e.id === roomB.id) && !events.staffA.some(e => e.id === roomB.id) &&
      !events.ownerB.some(e => e.id === roomA.id);
    record('isolation-window-no-cross-tenant', noCrossWindow, { noCrossWindow });
  } else {
    record('authorized-events-blocked-by-write-permission', false, { status: 'BLOCKED', reason: 'ROOMS_TABLE_WRITE_DENIED' });
  }
  result = { verified: checks.every(c => c.passed), checks, fixture: { tenantCount: 2, roomCount: 2, actors: 3 },
    publication: pub, rls, events, productAcceptance: false, capacityProven: false, externalProviderCalled: false };
} catch (error) {
  result = { verified: false, checks, errorCode: /^[A-Z0-9_]{3,80}$/.test(error?.code ?? '') ? error.code : 'REALTIME_TENANT_PROBE_FAILED',
    stage, assertion: typeof error?.message === 'string' && /^[A-Za-z0-9_. -]{1,180}$/.test(error.message) ? error.message : undefined };
} finally {
  for (const channel of fixture.channels) { try { await channel.unsubscribe(); } catch {} }
  for (const value of clients) { try { await value.removeAllChannels(); value.realtime.disconnect(); await value.auth.stopAutoRefresh(); } catch {} }
  try {
    if (fixture.users.length) {
      await db.query('DELETE FROM public.user_roles WHERE user_id = ANY($1::uuid[]) OR created_by = ANY($1::uuid[])', [fixture.users]);
      await db.query('DELETE FROM public.user_hotels WHERE user_id = ANY($1::uuid[]) OR assigned_by = ANY($1::uuid[])', [fixture.users]);
    }
    if (fixture.tenants.length) await db.query('DELETE FROM public.tenants WHERE id = ANY($1::uuid[])', [fixture.tenants]);
    if (fixture.users.length) await db.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [fixture.users]);
  } finally { await db.end(); }
}
process.stdout.write(JSON.stringify(result) + '\n');
