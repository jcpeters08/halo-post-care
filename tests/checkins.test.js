import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCheckinPath,
  buildCompleteMarker,
  buildManifest,
  buildSummaryMarkdown,
  hasRequiredPhotoAreas
} from '../js/checkins.js';

describe('check-in contract', () => {
  it('requires face, neck, and hands photos', () => {
    assert.equal(hasRequiredPhotoAreas({ face: {}, neck: {}, hands: {} }), true);
    assert.equal(hasRequiredPhotoAreas({ face: {}, hands: {} }), false);
  });

  it('uses dated time folders to prevent collisions', () => {
    assert.equal(buildCheckinPath('2026-06-27', '20:30'), 'checkins/2026-06-27/2030');
  });

  it('builds manifest, summary, and completion marker', () => {
    const manifest = buildManifest({
      checkinPath: 'checkins/2026-06-27/2030',
      createdAt: '2026-06-27T20:30:00-05:00',
      procedureDate: '2026-06-26',
      recoveryDay: 1,
      stageAuto: 'red_warm_tight',
      symptoms: { redness: 4, swelling: 3, flaking: 1, itch: 2, tightness: 4 },
      adherence: { am: { completed: 5, total: 5 }, pm: { completed: 4, total: 5 }, counters: {} },
      note: 'Hands feel tightest.'
    });
    assert.equal(manifest.photos.face, 'face.jpg');
    assert.match(buildSummaryMarkdown(manifest), /# Check-in - Day 1/);
    assert.equal(buildCompleteMarker(manifest).checkinPath, manifest.checkinPath);
  });
});
