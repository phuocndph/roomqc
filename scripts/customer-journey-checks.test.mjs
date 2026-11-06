import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import {
  assertAuthDenied, assertDatabaseDenied, assertFunctionDenied, assertStorageDenied,
  boundedFetch, withDeadline, waitUntil, observeFor, RealtimeGuard,
} from './lib/customer-journey-checks.mjs';

test('Auth denials require the exact code and no issued session', () => {
  const error = { status: 400, code: 'email_not_confirmed' };
  assertAuthDenied({ error, data: { session: null } }, 'email_not_confirmed', 'unverified');
  for (const value of [null, { status: 0 }, { status: 500, code: error.code }, { status: 429, code: 'over_request_rate_limit' }]) {
    assert.throws(() => assertAuthDenied({ error: value }, error.code, 'unverified'));
  }
  assert.throws(() => assertAuthDenied({ error, data: { session: {} } }, error.code, 'unverified'));
});

test('RPC/REST denials reject network failures, 5xx, wrong codes and wrong reasons', () => {
  const denied = { status: 403, error: { code: '42501', message: 'owner only' } };
  assertDatabaseDenied(denied, '42501', 'owner only', 'owner only');
  for (const value of [
    { error: { message: 'Failed to fetch' }, status: 0 },
    { ...denied, status: 500 }, { ...denied, error: { code: 'XX000' } }, { error: null, status: 200 },
  ]) assert.throws(() => assertDatabaseDenied(value, '42501', 'owner only'));
  assert.throws(() => assertDatabaseDenied(denied, '42501', 'owner only', 'different guard'));
});

const functionError = (status, body, name = 'FunctionsHttpError') => ({
  error: { name, context: new Response(JSON.stringify(body), { status }) },
});
test('function denials require the expected application response, not a generic failure', async () => {
  const body = { success: false, error: 'wrong workspace' };
  await assertFunctionDenied(functionError(403, body), 403, body.error, 'invite');
  for (const value of [
    functionError(503, body), functionError(403, body, 'FunctionsRelayError'),
    functionError(403, { success: false, error: 'unexpected' }), { error: { name: 'FunctionsFetchError' } },
  ]) await assert.rejects(assertFunctionDenied(value, 403, body.error, 'invite'));
});

test('Storage denials validate both transport status and Storage code including download Responses', async () => {
  await assertStorageDenied({ error: { status: 400, statusCode: '403' } }, 403, 'upload');
  await assertStorageDenied({ error: { originalError: new Response('{"statusCode":"404"}', { status: 400 }) } }, 404, 'download');
  for (const error of [null, { status: 500, statusCode: '403' }, { status: 400, statusCode: '400' }, { message: 'network failed' }]) {
    await assert.rejects(assertStorageDenied({ error }, 403, 'upload'));
  }
});

for (const status of ['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED']) {
  test(`Realtime fails permanently after ${status}, even if it reconnects`, () => {
    const guard = new RealtimeGuard('fixture');
    guard.status('SUBSCRIBED'); guard.assertHealthy();
    guard.status(status); guard.status('SUBSCRIBED');
    assert.throws(() => guard.assertHealthy());
  });
}
test('Realtime requires an initial subscription and an open connection; shutdown is intentional', () => {
  const guard = new RealtimeGuard('fixture');
  assert.throws(() => guard.assertHealthy());
  guard.status('SUBSCRIBED'); assert.throws(() => guard.assertHealthy(false));
  guard.stop(); guard.status('CLOSED'); assert.equal(guard.failed, false);
  assert.throws(() => guard.assertHealthy());
});
test('negative observation fails on a channel loss during the window', async () => {
  const guard = new RealtimeGuard('fixture'); guard.status('SUBSCRIBED');
  let samples = 0;
  await assert.rejects(observeFor(() => {
    if (++samples === 2) guard.status('CLOSED');
    guard.assertHealthy();
  }, 'observe', 50, 5), /Realtime channel failed/);
});

test('waitUntil bounds a stalled predicate instead of waiting forever', async () => {
  await assert.rejects(waitUntil(() => new Promise(() => {}), 'stalled predicate', 25, 1), /Timed out: stalled predicate/);
});
test('deadline aborts cooperative work; a rejected cleanup does not prevent the next action', async () => {
  let aborted = false, next = false;
  await assert.rejects(withDeadline(signal => new Promise(() => {
    signal.addEventListener('abort', () => { aborted = true; }, { once: true });
  }), 'cleanup', 25), /Timed out: cleanup/);
  await withDeadline(async () => { next = true; }, 'next cleanup', 100);
  assert.ok(aborted && next);
});
test('waitUntil succeeds, propagates predicate errors and clears deadlines', async () => {
  let calls = 0;
  await waitUntil(() => ++calls === 2, 'ready', 100, 1);
  assert.equal(calls, 2);
  await assert.rejects(waitUntil(() => { throw new Error('guard failed'); }, 'guard', 100), /guard failed/);
});

test('fetch timeout aborts a stalled request even if an SDK supplies its own signal', async () => {
  const fakeFetch = (_input, options) => new Promise((_, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  });
  // A ref'ed outer timer keeps this synthetic test alive; AbortSignal.timeout
  // uses unref'ed timers, unlike a real network request.
  await withDeadline(async () => {
    await assert.rejects(boundedFetch(fakeFetch, 25)('http://127.0.0.1/', { signal: new AbortController().signal }), { name: 'TimeoutError' });
  }, 'fetch regression', 500);
});
test('fetch preserves caller cancellation and rejects redirects', async () => {
  const upstream = new AbortController(); upstream.abort();
  await boundedFetch(async (_input, options) => {
    assert.equal(options.signal.aborted, true); assert.equal(options.redirect, 'error');
    return new Response('ok');
  })('http://127.0.0.1/', { signal: upstream.signal, redirect: 'follow' });
});

test('outer deadlines propagate through nested waits and SDK fetch signals', async () => {
  let requestSignal;
  const fetcher = boundedFetch((_input, options) => new Promise((_, reject) => {
    requestSignal = options.signal;
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
  }), 1000);
  await assert.rejects(withDeadline(() => waitUntil(async () => {
    await fetcher('http://127.0.0.1/', { signal: new AbortController().signal });
    return false;
  }, 'inner', 1000), 'outer', 25), /Timed out: outer/);
  assert.equal(requestSignal.aborted, true);
});

test('fetch deadline also aborts a response body stalled after HTTP headers', async () => {
  const server = createServer((_req, response) => {
    response.writeHead(200, { 'Content-Type': 'text/plain' });
    response.write('partial'); // deliberately leave the body open
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const response = await boundedFetch(globalThis.fetch, 300)(`http://127.0.0.1:${server.address().port}/`);
    await assert.rejects(response.text(), error => ['AbortError', 'TimeoutError'].includes(error.name));
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
