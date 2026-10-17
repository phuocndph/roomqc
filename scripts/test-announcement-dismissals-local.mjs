// Verify authenticated dismissal writes on the loopback stack, without
// changing announcements, hotel data, or any existing user's dismissals.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const output = process.platform === 'win32'
  ? execFileSync('cmd.exe', ['/d', '/s', '/c', 'npx supabase status --output json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
  : execFileSync('npx', ['supabase', 'status', '--output', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const config = JSON.parse(output.slice(output.indexOf('{')));
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(config.API_URL).hostname), 'Local backend required');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
const ownedUsers = [];
let checks = 0;
function check(value, label) { assert.ok(value, label); checks++; console.log(`PASS ${label}`) }
async function account() {
  const email = `announcement-test-${randomUUID()}@example.invalid`;
  const password = `QC!${randomUUID()}a9`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  ownedUsers.push(data.user.id);
  const client = createClient(config.API_URL, config.ANON_KEY, options);
  assert.ifError((await client.auth.signInWithPassword({ email, password })).error);
  return { client, id: data.user.id };
}
try {
  const a = await account(), b = await account();
  const announcements = await a.client.from('announcements').select('id').eq('kind', 'promo_popup').limit(1);
  assert.ifError(announcements.error);
  const id = announcements.data[0]?.id;
  assert.ok(id, 'An active promo must exist for this local integration test');
  assert.ifError((await a.client.from('announcement_dismissals').insert({ announcement_id: id, user_id: a.id })).error);
  check(true, 'Authenticated user can acknowledge the existing promo');
  const duplicate = await a.client.from('announcement_dismissals').insert({ announcement_id: id, user_id: a.id });
  check(duplicate.error?.code === '23505', 'Duplicate acknowledgement returns SQLSTATE 23505');
  const read = await a.client.from('announcement_dismissals').select('announcement_id').eq('user_id', a.id);
  assert.ifError(read.error);
  check(read.data.some(row => row.announcement_id === id), 'Same account can reload the saved acknowledgement');
  const fresh = createClient(config.API_URL, config.ANON_KEY, options);
  const session = await a.client.auth.getSession();
  assert.ifError((await fresh.auth.setSession(session.data.session)).error);
  const otherDevice = await fresh.from('announcement_dismissals').select('announcement_id').eq('user_id', a.id);
  assert.ifError(otherDevice.error);
  check(otherDevice.data.some(row => row.announcement_id === id), 'Fresh client for the same account sees the saved acknowledgement');
  const hidden = await b.client.from('announcement_dismissals').select('announcement_id').eq('user_id', a.id);
  assert.ifError(hidden.error);
  check(hidden.data.length === 0, 'Another account cannot read this user acknowledgement');
  const forged = await b.client.from('announcement_dismissals').insert({ announcement_id: id, user_id: a.id });
  check(forged.error?.code === '42501', 'Another account cannot write a forged acknowledgement');
  assert.ifError((await b.client.from('announcement_dismissals').insert({ announcement_id: id, user_id: b.id })).error);
  check(true, 'Another account has an independent acknowledgement');
  console.log(`${checks} local acknowledgement/RLS checks passed.`);
} finally {
  // Remove only records owned by the two accounts created by this test.
  const failures = [];
  for (const id of ownedUsers) {
    const removed = await admin.from('announcement_dismissals').delete().eq('user_id', id);
    if (removed.error) failures.push('dismissal cleanup');
    const deleted = await admin.auth.admin.deleteUser(id);
    if (deleted.error) failures.push('account cleanup');
  }
  assert.deepEqual(failures, [], 'Temporary test data cleanup');
  console.log('Temporary test accounts and acknowledgements removed.');
}
