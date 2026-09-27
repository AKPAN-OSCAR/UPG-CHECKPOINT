'use strict';
const assert = require('assert');
const DataSync = require('../js/core/data-sync.js');

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}`);
    console.error(`    ${e.message}`);
  }
}

// ── Mock Firestore: a simple in-memory map keyed by uid -> { key: value } ──
function mockFirestoreAdapter({ failGetDocs = false, failSetDoc = false } = {}) {
  const backend = new Map(); // uid -> Map(key -> value)

  return {
    async getFirestore(app) { return { _tag: 'db', appName: app?.name || 'default' }; },
    collectionRef(db, uid) { return { _tag: 'collection', uid }; },
    docRef(db, uid, key) { return { _tag: 'doc', uid, key }; },
    async getDocs(collRef) {
      if (failGetDocs) throw new Error('simulated network failure');
      const userMap = backend.get(collRef.uid) || new Map();
      return [...userMap.entries()].map(([id, data]) => ({ id, data }));
    },
    async setDoc(ref, value) {
      if (failSetDoc) throw new Error('simulated write failure');
      if (!backend.has(ref.uid)) backend.set(ref.uid, new Map());
      backend.get(ref.uid).set(ref.key, value);
    },
    _debug: { backend },
  };
}

async function main() {
  console.log('push() / pullAll()');

  await test('push writes a key, pullAll reads it back', async () => {
    const adapter = mockFirestoreAdapter();
    const ds = DataSync.createDataSync({ firestoreAdapter: adapter });
    const app = { name: 'default' };

    const r = await ds.push(app, 'uid_1', 'tables', [{ id: 1, name: 'Morning routine' }]);
    assert.strictEqual(r.ok, true);

    const pulled = await ds.pullAll(app, 'uid_1');
    assert.deepStrictEqual(pulled.tables, [{ id: 1, name: 'Morning routine' }]);
  });

  await test('pullAll returns empty object for a brand new user (nothing synced yet)', async () => {
    const adapter = mockFirestoreAdapter();
    const ds = DataSync.createDataSync({ firestoreAdapter: adapter });
    const pulled = await ds.pullAll({ name: 'default' }, 'never_synced_uid');
    assert.deepStrictEqual(pulled, {});
  });

  await test('pullAll picks up MULTIPLE keys without any of them being hand-enumerated', async () => {
    const adapter = mockFirestoreAdapter();
    const ds = DataSync.createDataSync({ firestoreAdapter: adapter });
    const app = { name: 'default' };
    await ds.push(app, 'uid_2', 'tables', ['t1']);
    await ds.push(app, 'uid_2', 'goals', ['g1']);
    await ds.push(app, 'uid_2', 'someFutureKeyThatDoesntExistYet', { anything: true });

    const pulled = await ds.pullAll(app, 'uid_2');
    assert.deepStrictEqual(pulled.tables, ['t1']);
    assert.deepStrictEqual(pulled.goals, ['g1']);
    assert.deepStrictEqual(pulled.someFutureKeyThatDoesntExistYet, { anything: true });
  });

  await test('different uids are fully isolated from each other', async () => {
    const adapter = mockFirestoreAdapter();
    const ds = DataSync.createDataSync({ firestoreAdapter: adapter });
    const app = { name: 'default' };
    await ds.push(app, 'uid_a', 'tables', ['a-table']);
    await ds.push(app, 'uid_b', 'tables', ['b-table']);

    const pulledA = await ds.pullAll(app, 'uid_a');
    const pulledB = await ds.pullAll(app, 'uid_b');
    assert.deepStrictEqual(pulledA.tables, ['a-table']);
    assert.deepStrictEqual(pulledB.tables, ['b-table']);
  });

  await test('push failure returns ok:false instead of throwing', async () => {
    const adapter = mockFirestoreAdapter({ failSetDoc: true });
    const ds = DataSync.createDataSync({ firestoreAdapter: adapter });
    const r = await ds.push({ name: 'default' }, 'uid_x', 'tables', []);
    assert.strictEqual(r.ok, false);
  });

  await test('pullAll failure fails soft — returns {} instead of throwing (never blocks login)', async () => {
    const adapter = mockFirestoreAdapter({ failGetDocs: true });
    const ds = DataSync.createDataSync({ firestoreAdapter: adapter });
    const pulled = await ds.pullAll({ name: 'default' }, 'uid_y');
    assert.deepStrictEqual(pulled, {});
  });

  await test('guest uids sync exactly the same way as email uids (no special-casing)', async () => {
    const adapter = mockFirestoreAdapter();
    const ds = DataSync.createDataSync({ firestoreAdapter: adapter });
    const guestApp = { name: 'lp_guest_12345' }; // a named app, as guests use
    await ds.push(guestApp, 'anon_uid_1', 'badges', ['first-week']);
    const pulled = await ds.pullAll(guestApp, 'anon_uid_1');
    assert.deepStrictEqual(pulled.badges, ['first-week']);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
