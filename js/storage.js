export const DEFAULT_SETTINGS = {
  procedureDate: '2026-06-26',
  acyclovirPerDay: 2,
  githubOwner: 'jcpeters08',
  dataRepo: 'halo-post-care-data',
  token: '',
  lastAssessmentPath: ''
};

const SETTINGS_KEY = 'halo_settings_v1';
const APP_PREFIX = 'halo_';

export function loadJson(storage, key, fallback) {
  const raw = storage.getItem(key);
  if (raw === null) {
    return fallback;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function saveJson(storage, key, value) {
  storage.setItem(key, JSON.stringify(value));
}

export function loadSettings(storage) {
  const loaded = loadJson(storage, SETTINGS_KEY, null);
  if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded)) {
    return { ...DEFAULT_SETTINGS };
  }

  return {
    ...DEFAULT_SETTINGS,
    ...loaded
  };
}

export function saveSettings(storage, settings) {
  saveJson(storage, SETTINGS_KEY, { ...DEFAULT_SETTINGS, ...settings });
}

export function exportAll(storage) {
  const result = {};
  const appItemCount = storage.length;

  for (let index = 0; index < appItemCount; index += 1) {
    const key = storage.key(index);
    if (!key || !key.startsWith(APP_PREFIX)) {
      continue;
    }

    result[key] = loadJson(storage, key, null);
  }

  return result;
}

export function resetAll(storage) {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && key.startsWith(APP_PREFIX)) {
      storage.removeItem(key);
    }
  }
}

export async function requestPersistentStorage() {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) {
    return false;
  }

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
