import { requestPersistentStorage } from './storage.js';

export const PHOTO_AREAS = ['face', 'neck', 'hands'];

const PHOTO_DB_NAME = 'halo-post-care-db';
const PHOTO_DB_VERSION = 1;
const PHOTO_DRAFT_STORE = 'photoDrafts';
let persistentStorageRequested = false;

function ensureIndexedDbAvailable() {
  if (typeof indexedDB === 'undefined' || indexedDB === null) {
    throw new Error('IndexedDB is not available');
  }
}

function wrapRequest(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function closeDbConnection(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

async function ensurePersistentPhotoStorage() {
  if (persistentStorageRequested) {
    return;
  }

  persistentStorageRequested = true;
  await requestPersistentStorage();
}

function withPhotoDb(action) {
  return openPhotoDb().then((db) => {
    try {
      return Promise.resolve(action(db)).finally(() => {
        closeDbConnection(db);
      });
    } catch (error) {
      closeDbConnection(db);
      return Promise.reject(error);
    }
  });
}

export function buildPhotoDraftId(date, area) {
  return `${date}:${area}`;
}

export function draftsByArea(drafts) {
  const result = {};

  if (!Array.isArray(drafts)) {
    return result;
  }

  for (const draft of drafts) {
    if (draft && draft.area) {
      result[draft.area] = draft;
    }
  }

  return result;
}

export function hasAllPhotoDrafts(drafts) {
  const byArea = draftsByArea(drafts);
  return PHOTO_AREAS.every((area) => !!byArea[area]);
}

export function openPhotoDb() {
  ensureIndexedDbAvailable();

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(PHOTO_DRAFT_STORE)) {
        const store = db.createObjectStore(PHOTO_DRAFT_STORE, {
          keyPath: 'id'
        });
        store.createIndex('byDate', 'date', { unique: false });
      } else {
        const store = event.target.transaction.objectStore(PHOTO_DRAFT_STORE);
        if (!store.indexNames.contains('byDate')) {
          store.createIndex('byDate', 'date', { unique: false });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(request.error || new Error('IndexedDB open blocked'));
  });
}

export async function savePhotoDraft(draft) {
  await ensurePersistentPhotoStorage();
  ensureIndexedDbAvailable();
  return withPhotoDb((db) => new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(PHOTO_DRAFT_STORE, 'readwrite');
      const store = transaction.objectStore(PHOTO_DRAFT_STORE);
      const request = store.put(draft);

      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  }));
}

export function getPhotoDrafts(date) {
  ensureIndexedDbAvailable();
  return withPhotoDb((db) => {
    const transaction = db.transaction(PHOTO_DRAFT_STORE);
    const store = transaction.objectStore(PHOTO_DRAFT_STORE);
    const index = store.index('byDate');
    const request = index.getAll(date);
    return wrapRequest(request);
  });
}

export function deletePhotoDraft(id) {
  ensureIndexedDbAvailable();
  return withPhotoDb((db) => new Promise((resolve, reject) => {
    try {
      const transaction = db.transaction(PHOTO_DRAFT_STORE, 'readwrite');
      const request = transaction.objectStore(PHOTO_DRAFT_STORE).delete(id);

      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  }));
}

export function compressImageFile(file, options = {}) {
  const maxEdge = options.maxEdge ?? 1280;
  const quality = options.quality ?? 0.7;

  return new Promise((resolve, reject) => {
    const safeMaxEdge = Number.isFinite(maxEdge) && maxEdge > 0 ? maxEdge : 1280;
    const safeQuality = Number.isFinite(quality) ? Math.min(1, Math.max(0, quality)) : 0.7;
    let objectUrl = null;

    const fail = (error) => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      reject(new Error('Photo compression failed'));
    };

    try {
      if (typeof document === 'undefined'
        || typeof document.createElement !== 'function'
        || typeof Image === 'undefined'
        || typeof URL === 'undefined'
        || typeof URL.createObjectURL !== 'function'
      ) {
        fail(new Error('Photo compression failed'));
        return;
      }

      const image = new Image();

      image.onload = () => {
        try {
          const scale = Math.min(1, safeMaxEdge / Math.max(image.width, image.height || 1));
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const context = canvas.getContext('2d');
          if (!context) {
            fail(new Error('Photo compression failed'));
            return;
          }

          context.drawImage(image, 0, 0, width, height);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                fail(new Error('Photo compression failed'));
                return;
              }

              URL.revokeObjectURL(objectUrl);
              resolve(blob);
            },
            'image/jpeg',
            safeQuality
          );
        } catch (error) {
          fail(error);
        }
      };

      image.onerror = () => fail(new Error('Photo compression failed'));
      objectUrl = URL.createObjectURL(file);
      image.src = objectUrl;
    } catch (error) {
      fail(error);
    }
  });
}
