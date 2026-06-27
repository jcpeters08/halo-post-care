import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyTargets } from '../js/day.js';
import {
  createDailyState,
  getCompletionSummary,
  setCounterValue,
  setFlagValue,
  toggleRoutineStep
} from '../js/checklist.js';

describe('checklist state', () => {
  it('creates all routine, counter, and flag keys from targets', () => {
    const targets = buildDailyTargets(1, 2);
    const state = createDailyState(targets);
    assert.equal(Object.keys(state.am).length, targets.am.length);
    assert.equal(state.counters.acyclovir, 0);
    assert.equal(state.flags.elevated, false);
  });

  it('toggles steps and clamps counters at zero', () => {
    const targets = buildDailyTargets(1, 2);
    let state = createDailyState(targets);
    state = toggleRoutineStep(state, 'am', targets.am[0].id);
    state = setCounterValue(state, 'acyclovir', -4);
    state = setFlagValue(state, 'elevated', true);
    assert.equal(state.am[targets.am[0].id], true);
    assert.equal(state.counters.acyclovir, 0);
    assert.equal(state.flags.elevated, true);
  });

  it('computes completion counts with target-bearing counters only', () => {
    const targets = buildDailyTargets(1, 2);
    let state = createDailyState(targets);
    for (const step of targets.am) state = toggleRoutineStep(state, 'am', step.id);
    state = setCounterValue(state, 'acyclovir', 2);
    const summary = getCompletionSummary(state, targets);
    assert.equal(summary.am.completed, targets.am.length);
    assert.equal(summary.counters.acyclovir.completed, 2);
    assert.equal(summary.counters.acyclovir.total, 2);
  });
});
