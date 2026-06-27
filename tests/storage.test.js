import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, exportAll, loadSettings, resetAll, saveSettings } from '../js/storage.js';

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    }
  };
}

describe('storage helpers', () => {
  it('loads default settings', () => {
    assert.deepEqual(loadSettings(fakeStorage()), DEFAULT_SETTINGS);
  });

  it('round-trips settings JSON', () => {
    const storage = fakeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, githubOwner: 'jcpeters08', token: 'secret' });
    assert.equal(loadSettings(storage).githubOwner, 'jcpeters08');
    assert.equal(loadSettings(storage).token, 'secret');
  });

  it('exports and resets app-owned keys', () => {
    const storage = fakeStorage();
    saveSettings(storage, { ...DEFAULT_SETTINGS, token: 'secret' });
    assert.equal(exportAll(storage).halo_settings_v1.token, 'secret');
    resetAll(storage);
    assert.equal(loadSettings(storage).token, '');
  });
});
