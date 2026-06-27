export const REQUIRED_AREAS = ['face', 'neck', 'hands'];

function buildPhotoMap() {
  return {
    face: 'face.jpg',
    neck: 'neck.jpg',
    hands: 'hands.jpg'
  };
}

export function hasRequiredPhotoAreas(photos) {
  if (!photos || typeof photos !== 'object') {
    return false;
  }

  return REQUIRED_AREAS.every((area) => {
    return photos[area];
  });
}

function normalizeTimeValue(time) {
  if (typeof time !== 'string') {
    return '';
  }
  return time.replace(/:/g, '');
}

export function buildCheckinPath(date, time) {
  return `checkins/${date}/${normalizeTimeValue(time)}`;
}

function toAscii(value) {
  return typeof value === 'string' ? value : `${value ?? ''}`;
}

export function buildManifest(input) {
  return {
    schemaVersion: 1,
    checkinPath: input.checkinPath,
    createdAt: input.createdAt,
    procedureDate: input.procedureDate,
    recoveryDay: input.recoveryDay,
    stageAuto: input.stageAuto,
    photos: buildPhotoMap(),
    symptoms: input.symptoms ?? {},
    adherence: input.adherence ?? {},
    note: toAscii(input.note)
  };
}

export function buildSummaryMarkdown(manifest) {
  const symptomRows = Object.entries(manifest.symptoms ?? {}).map(
    ([area, score]) => `- ${area}: ${score}`
  );
  const counters = Object.entries(manifest.adherence?.counters ?? {}).map(([counter, count]) => {
    const value = typeof count === 'number' ? count : 0;
    return `- ${counter}: ${value}`;
  });
  const summaryLines = [
    `# Check-in - Day ${manifest.recoveryDay}`,
    '',
    `Date: ${manifest.createdAt}`,
    `Procedure Date: ${manifest.procedureDate}`,
    `Stage: ${manifest.stageAuto}`,
    '',
    '## Symptoms',
    ...symptomRows,
    '',
    '## Adherence',
    `- AM routine: ${manifest.adherence?.am?.completed ?? 0}/${manifest.adherence?.am?.total ?? 0}`,
    `- PM routine: ${manifest.adherence?.pm?.completed ?? 0}/${manifest.adherence?.pm?.total ?? 0}`,
    ...counters,
    '',
    '## Notes',
    toAscii(manifest.note),
    '',
    '## Photos',
    ...REQUIRED_AREAS.map((area) => `- ${manifest.photos?.[area]}`)
  ];

  return summaryLines.join('\n');
}

export function buildCompleteMarker(manifest) {
  return {
    checkinPath: manifest.checkinPath,
    completedAt: manifest.createdAt,
    schemaVersion: 1
  };
}
