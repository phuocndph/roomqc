import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { AsyncLocalStorage } from 'node:async_hooks';
const deadlines = new AsyncLocalStorage();

// These helpers never print response bodies, JWTs, credentials or raw errors.
export function assertAuthDenied(result, code, label) {
  assert.ok(result.error && result.error.status >= 400 && result.error.status < 500, `${label}: expected an Auth 4xx`);
  assert.ok(result.error.code === code, `${label}: expected Auth code ${code}`);
  assert.ok(!result.data?.session, `${label}: no session may be issued`);
}

export function assertDatabaseDenied(result, code, label, message) {
  assert.ok(result.error && result.status >= 400 && result.status < 500, `${label}: expected a database 4xx`);
  assert.ok(result.error.code === code, `${label}: expected SQLSTATE ${code}`);
  if (message) assert.ok(result.error.message === message, `${label}: unexpected rejection reason`);
}

export async function assertFunctionDenied(result, status, message, label) {
  const response = result.error?.context;
  assert.ok(result.error?.name === 'FunctionsHttpError' && response?.status === status,
    `${label}: expected function HTTP ${status}, not a network/relay/server error`);
  const body = await response.clone().json();
  assert.ok(body.success === false && body.error === message, `${label}: unexpected function rejection reason`);
}

export async function assertStorageDenied(result, apiStatus, label) {
  const error = result.error;
  const response = error?.originalError;
  const status = response?.status || error?.status;
  assert.ok(error && status >= 400 && status < 500, `${label}: expected Storage 4xx, not a network/server error`);
  const body = response instanceof Response ? await response.clone().json() : null;
  assert.ok(Number(error.statusCode || body?.statusCode) === apiStatus, `${label}: unexpected Storage rejection code`);
}

// Every request gets a finite deadline, even if the SDK supplies its own signal.
// The timeout also covers response-body consumption through the fetch signal.
export function boundedFetch(fetcher = globalThis.fetch, timeout = 15000) {
  return (input, options = {}) => {
    const upstream = options.signal || (input instanceof Request ? input.signal : undefined);
    const signals = [upstream, deadlines.getStore(), AbortSignal.timeout(timeout)].filter(Boolean);
    const signal = AbortSignal.any(signals);
    return fetcher(input, { ...options, signal, redirect: 'error' });
  };
}

// Race bounds even a buggy predicate; cooperative I/O must use the passed signal
// (or its own bounded fetch / DB statement timeout) so late work cannot linger.
export async function withDeadline(action, label, timeout = 15000) {
  const controller = new AbortController();
  const parent = deadlines.getStore();
  const signal = parent ? AbortSignal.any([parent, controller.signal]) : controller.signal;
  let timer, onAbort;
  const expired = new Promise((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    timer = setTimeout(() => controller.abort(new Error(`Timed out: ${label}`)), timeout);
  });
  try {
    const operation = deadlines.run(signal, () => Promise.resolve().then(() => {
      signal.throwIfAborted();
      return action(signal);
    }));
    return await Promise.race([operation, expired]);
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', onAbort);
    controller.abort();
  }
}

export function waitUntil(predicate, label, timeout = 15000, interval = 100) {
  return withDeadline(async signal => {
    while (!signal.aborted) {
      if (await predicate(signal)) return;
      await delay(interval, undefined, { signal });
    }
  }, label, timeout);
}

export async function observeFor(inspect, label, duration = 2000, interval = 100) {
  await withDeadline(async signal => {
    const end = Date.now() + duration;
    do {
      inspect();
      await delay(Math.min(interval, Math.max(1, end - Date.now())), undefined, { signal });
    } while (Date.now() < end);
    inspect();
  }, label, duration + 1000);
}

export class RealtimeGuard {
  constructor(label) { this.label = label; this.subscribed = false; this.failed = false; this.stopped = false; }
  status(status) {
    if (this.stopped) return;
    if (status === 'SUBSCRIBED') this.subscribed = true;
    else if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) this.failed = true;
  }
  assertNotFailed() { assert.ok(!this.failed, `Realtime channel failed: ${this.label}`); }
  assertHealthy(connected = true) {
    this.assertNotFailed();
    assert.ok(this.subscribed && connected && !this.stopped, `Realtime channel is not live: ${this.label}`);
  }
  stop() { this.stopped = true; }
}
