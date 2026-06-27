import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPhotoDraftId, draftsByArea, hasAllPhotoDrafts, PHOTO_AREAS } from '../js/photos.js';

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
});
