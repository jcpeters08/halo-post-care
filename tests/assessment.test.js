import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getDefaultGuidance,
  isAssessmentApplicable,
  selectLatestValidAssessment,
  validateAssessment
} from '../js/assessment.js';
import { GUIDANCE_GROUPS } from '../js/data.js';

const validAssessment = {
  schemaVersion: 1,
  assessmentDate: '2026-06-27',
  checkinPath: 'checkins/2026-06-27/2030',
  overall: { status: 'on_track', summary: 'Looks consistent.', confidence: 'medium' },
  observations: [{ area: 'face', severity: 'expected', note: 'Diffuse redness.' }],
  guidance: {
    exercise: { status: 'wait', title: 'Keep activity light', details: 'Walk only.', reviewAfter: 'next_checkin' },
    heatColdExposure: { status: 'wait', title: 'Avoid sauna', details: 'No heat stress.', reviewAfter: 'next_checkin' },
    actives: { status: 'wait', title: 'Do not restart actives', details: 'Barrier is reactive.', reviewAfter: 'next_checkin' },
    cosmeticsCoverage: { status: 'limited', title: 'Tinted SPF only', details: 'Avoid makeup.', reviewAfter: 'next_checkin' }
  },
  safety: { callClinic: false, reasons: [], urgency: 'routine' },
  nextActions: ['Continue routine.']
};

describe('assessment contract', () => {
  it('accepts valid assessment JSON', () => {
    assert.equal(validateAssessment(validAssessment).valid, true);
  });

  it('rejects missing guidance groups', () => {
    const invalid = structuredClone(validAssessment);
    delete invalid.guidance.actives;
    assert.equal(validateAssessment(invalid).valid, false);
  });

  it('checks path applicability', () => {
    assert.equal(isAssessmentApplicable(validAssessment, 'checkins/2026-06-27/2030'), true);
    assert.equal(isAssessmentApplicable(validAssessment, 'checkins/2026-06-28/2030'), false);
  });

  it('selects the newest valid assessment by assessmentDate', () => {
    const older = { ...validAssessment, assessmentDate: '2026-06-26' };
    const newer = { ...validAssessment, assessmentDate: '2026-06-28' };
    assert.equal(selectLatestValidAssessment([older, newer]).assessmentDate, '2026-06-28');
  });

  it('provides all default guidance groups', () => {
    const default1 = getDefaultGuidance();
    const default2 = getDefaultGuidance();

    assert.deepEqual(Object.keys(default1), Object.keys(GUIDANCE_GROUPS));
    assert.deepEqual(default1, GUIDANCE_GROUPS);
    assert.notStrictEqual(default1, default2);
    assert.notStrictEqual(default1.exercise, default2.exercise);
    assert.notStrictEqual(default1.heatColdExposure, default2.heatColdExposure);
    assert.notStrictEqual(default1.actives, default2.actives);
    assert.notStrictEqual(default1.cosmeticsCoverage, default2.cosmeticsCoverage);

    default1.exercise.title = 'Modified for test';
    assert.notStrictEqual(getDefaultGuidance().exercise.title, default1.exercise.title);
  });

  it('rejects malformed assessmentDate', () => {
    const invalidDate = { ...validAssessment, assessmentDate: 'June 27' };
    assert.equal(validateAssessment(invalidDate).valid, false);
  });

  it('rejects invalid safety urgency values', () => {
    const invalid = structuredClone(validAssessment);
    invalid.safety.urgency = 'soon';
    assert.equal(validateAssessment(invalid).valid, false);
  });
});
