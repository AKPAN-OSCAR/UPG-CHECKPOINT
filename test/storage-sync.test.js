'use strict';
const assert = require('assert');

// Minimal localStorage shim so storage.js (a browser-only file) can be
// required directly in Node for testing.
function installLocalStorageShim() {
  const data = {};
  global.localStorage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => { data[k] = String(v); },
    removeItem: (k) => { delete data[k]; },
    get length() { return Object.keys(data).length; },
    key: (i) => Object.keys(data)[i],
  };
  // Object.keys(localStorage) is used by exportAll()/migrate() in storage.js —
  // make the shim's own enumerable keys mirror the data keys so that works.
  Object.defineProperty(global.localStorage, '__data', { value: data, enumerable: false });
  return {
    reset: () => { for (const k of Object.keys(data)) delete data[k]; },
    raw: data,
  };
}

const shim = installLocalStorageShim();
// storage.js does `Object.keys(localStorage)` in a couple of places —
// patch that by proxying so those calls see the real data keys.
global.localStorage = new Proxy(global.localStorage, {
  ownKeys(target) { return Reflect.ownKeys(shim.raw); },
  getOwnPropertyDescriptor(target, prop) {
    if (prop in shim.raw) return { enumerable: true, configurable: true, value: shim.raw[prop] };
    return Reflect.getOwnPropertyDescriptor(target, prop);
  },
});

delete require.cache[require.resolve('../js/core/storage.js')];
// storage.js declares `const Storage = ...` as a classic global, not a
// CommonJS export — eval it in this scope to get the binding, matching
// how the browser environment would provide it as a global.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '../js/core/storage.js'), 'utf8');
const Storage = (function () { return eval(src + '\nStorage;'); })();

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

test('uSet writes to localStorage under the correct per-user key', () => {
  shim.reset();
  Storage.uSet('uid_1', 'tables', [{ id: 1 }]);
  assert.deepStrictEqual(Storage.uGet('uid_1', 'tables'), [{ id: 1 }]);
});

test('uSet fires the registered sync hook with (uid, key, val)', () => {
  shim.reset();
  let captured = null;
  Storage.setSyncHook((uid, key, val) => { captured = { uid, key, val }; });
  Storage.uSet('uid_2', 'goals', ['g1']);
  assert.deepStrictEqual(captured, { uid: 'uid_2', key: 'goals', val: ['g1'] });
  Storage.clearSyncHook();
});

test('uSetLocal does NOT fire the sync hook (used for seeding from a pull)', () => {
  shim.reset();
  let called = false;
  Storage.setSyncHook(() => { called = true; });
  Storage.uSetLocal('uid_3', 'badges', ['b1']);
  assert.strictEqual(called, false);
  assert.deepStrictEqual(Storage.uGet('uid_3', 'badges'), ['b1']);
  Storage.clearSyncHook();
});

test('clearSyncHook actually removes the hook', () => {
  shim.reset();
  let calls = 0;
  Storage.setSyncHook(() => { calls++; });
  Storage.uSet('uid_4', 'notes', {});
  Storage.clearSyncHook();
  Storage.uSet('uid_4', 'notes', { a: 1 });
  assert.strictEqual(calls, 1);
});

test('a throwing sync hook does not break the local write', () => {
  shim.reset();
  Storage.setSyncHook(() => { throw new Error('simulated sync failure'); });
  const ok = Storage.uSet('uid_5', 'tables', ['still saved locally']);
  assert.strictEqual(ok, true);
  assert.deepStrictEqual(Storage.uGet('uid_5', 'tables'), ['still saved locally']);
  Storage.clearSyncHook();
});

test('different uids stay isolated under uSet/uGet', () => {
  shim.reset();
  Storage.uSet('uid_a', 'tables', ['a']);
  Storage.uSet('uid_b', 'tables', ['b']);
  assert.deepStrictEqual(Storage.uGet('uid_a', 'tables'), ['a']);
  assert.deepStrictEqual(Storage.uGet('uid_b', 'tables'), ['b']);
});

test('uSet records a timestamp readable via getTimestamp', () => {
  shim.reset();
  const before = Date.now();
  Storage.uSet('uid_6', 'tables', ['x']);
  const ts = Storage.getTimestamp('uid_6', 'tables');
  assert.ok(ts >= before && ts <= Date.now(), 'timestamp should be roughly "now"');
});

test('uSet fires the sync hook WITH the timestamp as a 4th argument', () => {
  shim.reset();
  let capturedTs = null;
  Storage.setSyncHook((uid, key, val, ts) => { capturedTs = ts; });
  Storage.uSet('uid_7', 'goals', ['g']);
  assert.strictEqual(typeof capturedTs, 'number');
  Storage.clearSyncHook();
});

test('getTimestamp returns 0 for a key that was never set', () => {
  shim.reset();
  assert.strictEqual(Storage.getTimestamp('uid_8', 'never_set'), 0);
});

test('uSetLocal(uid, key, val, remoteTs) stores that exact remote timestamp', () => {
  shim.reset();
  Storage.uSetLocal('uid_9', 'badges', ['b1'], 12345);
  assert.strictEqual(Storage.getTimestamp('uid_9', 'badges'), 12345);
});

test('uSetLocal with NO timestamp arg does not overwrite an existing timestamp', () => {
  shim.reset();
  Storage.uSet('uid_10', 'tables', ['a']); // sets a real "now" timestamp
  const original = Storage.getTimestamp('uid_10', 'tables');
  Storage.uSetLocal('uid_10', 'tables', ['a-seeded-again']); // no remoteTs passed
  assert.strictEqual(Storage.getTimestamp('uid_10', 'tables'), original);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
