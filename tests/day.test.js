import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDailyTargets,
  computeRecoveryDay,
  getStageForDay,
  getTimelineForDay
} from '../js/day.js';

describe('recovery day math', () => {
  it('treats procedure date as day 0', () => {
    assert.equal(computeRecoveryDay('2026-06-26', '2026-06-26'), 0);
    assert.equal(computeRecoveryDay('2026-06-27', '2026-06-26'), 1);
    assert.equal(computeRecoveryDay('2026-07-04', '2026-06-26'), 8);
  });

  it('maps day ranges to stages', () => {
    assert.equal(getStageForDay(0).id, 'heat_swelling');
    assert.equal(getStageForDay(1).id, 'red_warm_tight');
    assert.equal(getStageForDay(2).id, 'mends_bronzing');
    assert.equal(getStageForDay(3).id, 'mends_bronzing');
    assert.equal(getStageForDay(4).id, 'flaking_peeling');
    assert.equal(getStageForDay(7).id, 'flaking_peeling');
    assert.equal(getStageForDay(8).id, 'peeled_calm_reintroduction');
  });

  it('returns the correct timeline bucket', () => {
    assert.equal(getTimelineForDay(0).title, 'Day 0');
    assert.equal(getTimelineForDay(1).title, 'Day 1');
    assert.equal(getTimelineForDay(3).title, 'Days 2-3');
    assert.equal(getTimelineForDay(6).title, 'Days 4-7');
    assert.equal(getTimelineForDay(14).title, 'Week 2+');
  });

  it('builds daily targets from the active recovery day', () => {
    assert.deepEqual(buildDailyTargets(1, 2).counters.acyclovir, { target: 2, label: 'Acyclovir' });
    assert.equal(buildDailyTargets(1, 2).counters.hocl.target, 3);
    assert.equal(buildDailyTargets(4, 2).counters.hocl.target, 0);
    assert.equal(buildDailyTargets(4, 2).flags.coldCompress.default, false);
  });
});
