const PREFIX = '__mockfs_';

function _load() {
  try { return JSON.parse(localStorage.getItem(PREFIX + 'data')) || {}; } catch (e) { return {}; }
}
function _save(all) { localStorage.setItem(PREFIX + 'data', JSON.stringify(all)); }

export function getFirestore(app) {
  return { _tag: 'firestore' };
}

export function collection(db, ...pathSegments) {
  return { _tag: 'collection', path: pathSegments.join('/') };
}

export function doc(db, ...pathSegments) {
  const path    = pathSegments.join('/');
  const id      = pathSegments[pathSegments.length - 1];
  const collPath = pathSegments.slice(0, -1).join('/');
  return { _tag: 'doc', path, collPath, id };
}

export async function getDocs(collRef) {
  const all = _load();
  const collData = all[collRef.path] || {};
  return {
    forEach(cb) {
      Object.entries(collData).forEach(([id, data]) => cb({ id, data: () => data }));
    },
  };
}

export async function setDoc(docRef, value) {
  const all = _load();
  if (!all[docRef.collPath]) all[docRef.collPath] = {};
  all[docRef.collPath][docRef.id] = value;
  _save(all);
}
