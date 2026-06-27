import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPhotoDraftId,
  draftsByArea,
  deletePhotoDraft,
  getPhotoDrafts,
  hasAllPhotoDrafts,
  PHOTO_AREAS,
  savePhotoDraft
} from '../js/photos.js';

function installFakeIndexedDb({
  initialDrafts = [],
  storeGetAllThrows = false,
  failSave = false,
  failDelete = false
} = {}) {
  const storedDrafts = new Map(initialDrafts.map((draft) => [draft.id, draft]));
  const closeCount = { value: 0 };
  const previousIndexedDb = globalThis.indexedDB;

  function createRequest() {
    return {
      onsuccess: null,
      onerror: null,
      result: null,
      error: null
    };
  }

  function createTransaction(mode = 'readonly') {
    const transaction = {
      oncomplete: null,
      onerror: null,
      onabort: null
    };

    const completeTransaction = (error) => {
      queueMicrotask(() => {
        const event = { target: { error } };
        if (error) {
          if (transaction.onerror) {
            transaction.onerror(event);
          }
          if (transaction.onabort) {
            transaction.onabort(event);
          }
        } else if (transaction.oncomplete) {
          transaction.oncomplete(event);
        }
      });
    };

    const createPutRequest = (value) => {
      const request = createRequest();
      queueMicrotask(() => {
        if (failSave) {
          request.error = new Error('save failed');
          if (request.onerror) request.onerror({ target: { error: request.error } });
          completeTransaction(request.error);
          return;
        }

        request.result = value;
        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
        storedDrafts.set(value.id, value);
        completeTransaction();
      });
      return request;
    };

    const createDeleteRequest = (id) => {
      const request = createRequest();
      queueMicrotask(() => {
        if (failDelete) {
          request.error = new Error('delete failed');
          if (request.onerror) request.onerror({ target: { error: request.error } });
          completeTransaction(request.error);
          return;
        }

        if (request.onsuccess) {
          request.onsuccess({ target: request });
        }
        storedDrafts.delete(id);
        completeTransaction();
      });
      return request;
    };

    const createStoreGetAllRequest = () => {
      if (storeGetAllThrows) {
        throw new Error('store.getAll was used');
      }

      const request = createRequest();
      queueMicrotask(() => {
        request.result = Array.from(storedDrafts.values());
        if (request.onsuccess) request.onsuccess({ target: request });
        completeTransaction();
      });
      return request;
    };

    const createIndexRequest = (date) => {
      const request = createRequest();
      queueMicrotask(() => {
        request.result = date == null ? Array.from(storedDrafts.values()) : Array.from(storedDrafts.values()).filter((draft) => draft?.date === date);
        if (request.onsuccess) request.onsuccess({ target: request });
        completeTransaction();
      });
      return request;
    };

    transaction.objectStore = () => ({
      put: createPutRequest,
      delete: createDeleteRequest,
      getAll: createStoreGetAllRequest,
      index: () => ({ getAll: createIndexRequest }),
      createIndex: () => {}
    });

    return transaction;
  }

  const fakeDatabase = {
    objectStoreNames: { contains: () => true },
    transaction(storeName, mode) {
      return createTransaction(mode);
    },
    close: () => {
      closeCount.value += 1;
    }
  };

  const indexedDb = {
    open() {
      const request = createRequest();
      queueMicrotask(() => {
        request.result = fakeDatabase;
        if (request.onsuccess) {
          request.onsuccess({ target: { result: fakeDatabase } });
        }
      });
      return request;
    }
  };

  globalThis.indexedDB = indexedDb;

  return {
    storedDrafts,
    closeCount,
    restore() {
      globalThis.indexedDB = previousIndexedDb;
    }
  };
}

describe('photo draft helpers', () => {
  it('declares the required photo areas', () => {
    assert.deepEqual(PHOTO_AREAS, ['face', 'neck', 'hands']);
  });

  it('builds stable draft IDs', () => {
    assert.equal(buildPhotoDraftId('2026-06-27', 'face'), '2026-06-27:face');
  });

  it('maps drafts by area and detects completeness', () => {
    const drafts = [
      { id: '2026-06-27:face', area: 'face' },
      { id: '2026-06-27:neck', area: 'neck' },
      { id: '2026-06-27:hands', area: 'hands' }
    ];
    assert.equal(draftsByArea(drafts).hands.id, '2026-06-27:hands');
    assert.equal(hasAllPhotoDrafts(drafts), true);
    assert.equal(hasAllPhotoDrafts(drafts.slice(0, 2)), false);
  });

  it('gets drafts by date through the byDate index', async () => {
    const fakeIndexedDb = installFakeIndexedDb({
      initialDrafts: [
        { id: '2026-06-27:face', date: '2026-06-27', area: 'face' },
        { id: '2026-06-28:face', date: '2026-06-28', area: 'face' }
      ],
      storeGetAllThrows: true
    });

    try {
      const drafts = await getPhotoDrafts('2026-06-27');
      assert.deepEqual(drafts, [{ id: '2026-06-27:face', date: '2026-06-27', area: 'face' }]);
    } finally {
      fakeIndexedDb.restore();
    }
  });

  it('closes the db after save and delete operations', async () => {
    const draft = { id: '2026-06-27:face', date: '2026-06-27', area: 'face' };

    const fakeForSave = installFakeIndexedDb();
    try {
      await savePhotoDraft(draft);
      assert.equal(fakeForSave.closeCount.value, 1);
    } finally {
      fakeForSave.restore();
    }

    const fakeForDelete = installFakeIndexedDb({ initialDrafts: [draft] });
    try {
      await deletePhotoDraft(draft.id);
      assert.equal(fakeForDelete.closeCount.value, 1);
    } finally {
      fakeForDelete.restore();
    }
  });

  it('closes the db even when a draft write fails', async () => {
    const draft = { id: '2026-06-27:face', date: '2026-06-27', area: 'face' };
    const fakeForSaveFailure = installFakeIndexedDb({ failSave: true });

    try {
      await assert.rejects(() => savePhotoDraft(draft), /save failed/);
      assert.equal(fakeForSaveFailure.closeCount.value, 1);
    } finally {
      fakeForSaveFailure.restore();
    }
  });

  it('closes the db even when a draft delete fails', async () => {
    const draft = { id: '2026-06-27:face', date: '2026-06-27', area: 'face' };
    const fakeForDeleteFailure = installFakeIndexedDb({ initialDrafts: [draft], failDelete: true });

    try {
      await assert.rejects(() => deletePhotoDraft(draft.id), /delete failed/);
      assert.equal(fakeForDeleteFailure.closeCount.value, 1);
    } finally {
      fakeForDeleteFailure.restore();
    }
  });
});
