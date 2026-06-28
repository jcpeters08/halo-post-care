import { PHOTO_AREAS } from './photos.js';

export const PHOTO_AREA_LABELS = {
  face: 'Face',
  neck: 'Neck',
  hands: 'Hands'
};

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function getPathPart(checkinPath, index) {
  return `${checkinPath ?? ''}`.split('/')[index] || '';
}

function getCreatedDate(manifest, checkinPath) {
  if (typeof manifest?.createdAt === 'string' && manifest.createdAt.length >= 10) {
    return manifest.createdAt.slice(0, 10);
  }

  return getPathPart(checkinPath, 1);
}

function normalizeRecoveryDay(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function buildPhoto(area, manifest, photoBase64ByArea) {
  const base64 = typeof photoBase64ByArea?.[area] === 'string'
    ? photoBase64ByArea[area].replace(/\s+/g, '')
    : '';

  if (!base64) {
    return null;
  }

  const fileName = typeof manifest?.photos?.[area] === 'string' && manifest.photos[area]
    ? manifest.photos[area]
    : `${area}.jpg`;

  return {
    fileName,
    src: `data:image/jpeg;base64,${base64}`
  };
}

export function buildProgressEntry({ checkinPath, manifest = {}, photoBase64ByArea = {} }) {
  const safeManifest = isPlainObject(manifest) ? manifest : {};

  return {
    checkinPath: `${checkinPath ?? ''}`,
    date: getCreatedDate(safeManifest, checkinPath),
    time: getPathPart(checkinPath, 2),
    recoveryDay: normalizeRecoveryDay(safeManifest.recoveryDay),
    stageAuto: typeof safeManifest.stageAuto === 'string' ? safeManifest.stageAuto : '',
    photos: Object.fromEntries(
      PHOTO_AREAS.map((area) => [area, buildPhoto(area, safeManifest, photoBase64ByArea)])
    )
  };
}

export function normalizeProgressEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && typeof entry.checkinPath === 'string' && entry.checkinPath)
    .slice()
    .sort((a, b) => `${b.checkinPath}`.localeCompare(`${a.checkinPath}`));
}

function normalizeSelectedArea(selectedArea) {
  return PHOTO_AREAS.includes(selectedArea) ? selectedArea : 'face';
}

export function getProgressAreaView(entries, selectedArea) {
  const normalizedArea = normalizeSelectedArea(selectedArea);
  const timeline = normalizeProgressEntries(entries)
    .filter((entry) => Boolean(entry.photos?.[normalizedArea]?.src));

  return {
    selectedArea: normalizedArea,
    label: PHOTO_AREA_LABELS[normalizedArea],
    timeline,
    latest: timeline[0] ?? null,
    baseline: timeline.at(-1) ?? null
  };
}
