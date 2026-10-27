// Tüm veri telefonun içinde (IndexedDB) durur; hiçbir sunucuya gitmez.
const DB_NAME = 'denetim-cebi';
const STORES = ['kv', 'branches', 'audits', 'photos'];
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) {
        if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'k' : 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const wrap = req => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const get = (store, id) => tx(store, 'readonly', s => wrap(s.get(id)));
export const all = (store) => tx(store, 'readonly', s => wrap(s.getAll()));
export const put = (store, obj) => tx(store, 'readwrite', s => { s.put(obj); });
export const del = (store, id) => tx(store, 'readwrite', s => { s.delete(id); });
export const clear = (store) => tx(store, 'readwrite', s => { s.clear(); });
export const putMany = (store, list) => tx(store, 'readwrite', s => { for (const o of list) s.put(o); });
export const delMany = (store, ids) => tx(store, 'readwrite', s => { for (const id of ids) s.delete(id); });

export async function getKV(k, fallback) {
  const row = await get('kv', k);
  return row ? row.v : fallback;
}
export const setKV = (k, v) => put('kv', { k, v });

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
