import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProgressEntry,
  getProgressAreaView,
  normalizeProgressEntries,
  PHOTO_AREA_LABELS
} from '../js/progress.js';

describe('progress photo timeline helpers', () => {
  it('normalizes a completed check-in into area photo entries', () => {
    const entry = buildProgressEntry({
      checkinPath: 'checkins/2026-06-28/0840',
      manifest: {
        createdAt: '2026-06-28T08:40:00-05:00',
        recoveryDay: 2,
        stageAuto: 'mends_bronzing',
        photos: {
          face: 'face.jpg',
          neck: 'neck.jpg',
          hands: 'hands.jpg'
        }
      },
      photoBase64ByArea: {
        face: 'ZmFjZQ==',
        neck: 'bmVjaw==',
        hands: 'aGFuZHM='
      }
    });

    assert.equal(entry.checkinPath, 'checkins/2026-06-28/0840');
    assert.equal(entry.date, '2026-06-28');
    assert.equal(entry.time, '0840');
    assert.equal(entry.recoveryDay, 2);
    assert.equal(entry.stageAuto, 'mends_bronzing');
    assert.equal(entry.photos.face.fileName, 'face.jpg');
    assert.equal(entry.photos.face.src, 'data:image/jpeg;base64,ZmFjZQ==');
    assert.equal(entry.photos.neck.src, 'data:image/jpeg;base64,bmVjaw==');
    assert.equal(entry.photos.hands.src, 'data:image/jpeg;base64,aGFuZHM=');
  });

  it('falls back to path metadata and default photo filenames', () => {
    const entry = buildProgressEntry({
      checkinPath: 'checkins/2026-06-27/2030',
      manifest: {},
      photoBase64ByArea: {
        face: 'ZmFjZQ=='
      }
    });

    assert.equal(entry.date, '2026-06-27');
    assert.equal(entry.time, '2030');
    assert.equal(entry.recoveryDay, null);
    assert.equal(entry.photos.face.fileName, 'face.jpg');
    assert.equal(entry.photos.face.src, 'data:image/jpeg;base64,ZmFjZQ==');
    assert.equal(entry.photos.neck, null);
  });

  it('sorts progress entries newest first', () => {
    const older = buildProgressEntry({
      checkinPath: 'checkins/2026-06-27/2030',
      photoBase64ByArea: { face: 'b2xk' }
    });
    const newer = buildProgressEntry({
      checkinPath: 'checkins/2026-06-28/0840',
      photoBase64ByArea: { face: 'bmV3' }
    });

    assert.deepEqual(
      normalizeProgressEntries([older, newer]).map((entry) => entry.checkinPath),
      ['checkins/2026-06-28/0840', 'checkins/2026-06-27/2030']
    );
  });

  it('builds the selected-area timeline and latest baseline pair', () => {
    const entries = normalizeProgressEntries([
      buildProgressEntry({
        checkinPath: 'checkins/2026-06-27/2030',
        manifest: { recoveryDay: 1 },
        photoBase64ByArea: { face: 'ZGF5MQ==', neck: 'bmVjazE=' }
      }),
      buildProgressEntry({
        checkinPath: 'checkins/2026-06-28/0840',
        manifest: { recoveryDay: 2 },
        photoBase64ByArea: { face: 'ZGF5Mg==' }
      })
    ]);

    const faceView = getProgressAreaView(entries, 'face');
    assert.equal(faceView.selectedArea, 'face');
    assert.equal(faceView.label, PHOTO_AREA_LABELS.face);
    assert.equal(faceView.timeline.length, 2);
    assert.equal(faceView.latest.checkinPath, 'checkins/2026-06-28/0840');
    assert.equal(faceView.baseline.checkinPath, 'checkins/2026-06-27/2030');

    const neckView = getProgressAreaView(entries, 'neck');
    assert.equal(neckView.timeline.length, 1);
    assert.equal(neckView.latest.checkinPath, 'checkins/2026-06-27/2030');
    assert.equal(neckView.baseline.checkinPath, 'checkins/2026-06-27/2030');
  });

  it('defaults unknown selected areas to face', () => {
    const view = getProgressAreaView([], 'torso');

    assert.equal(view.selectedArea, 'face');
    assert.equal(view.label, 'Face');
    assert.deepEqual(view.timeline, []);
  });
});
