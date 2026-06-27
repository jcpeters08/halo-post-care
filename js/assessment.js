import { GUIDANCE_GROUPS } from './data.js';

export const GUIDANCE_KEYS = ['exercise', 'heatColdExposure', 'actives', 'cosmeticsCoverage'];

const ASSESSMENT_SCHEMA_VERSION = 1;
const OVERALL_STATUSES = new Set(['on_track', 'watch', 'concern', 'call_clinic']);
const OVERALL_CONFIDENCE = new Set(['low', 'medium', 'high']);
const URGENCY_VALUES = new Set(['routine', 'monitor', 'call_clinic', 'urgent']);
const GUIDANCE_STATUSES = new Set(['wait', 'limited', 'ready', 'avoid', 'ask_provider']);
const OBSERVATION_AREAS = new Set(['face', 'neck', 'hands', 'overall']);
const OBSERVATION_SEVERITIES = new Set(['expected', 'watch', 'concern']);
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasString(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasStringOrUndefined(value) {
  return value === undefined || typeof value === 'string';
}

function isIsoDate(value) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  const [year, month, day] = value.split('-').map(Number);
  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function cloneGuidanceGroups(source) {
  const clone = {};

  for (const key of GUIDANCE_KEYS) {
    const value = source[key];

    if (isPlainObject(value)) {
      clone[key] = { ...value };
    }
  }

  return clone;
}

function validateGuidance(value) {
  if (!isPlainObject(value)) {
    return false;
  }

  for (const key of GUIDANCE_KEYS) {
    const entry = value[key];
    if (!isPlainObject(entry)) {
      return false;
    }

    if (!GUIDANCE_STATUSES.has(entry.status) || !hasString(entry.title) || !hasString(entry.details) || !hasString(entry.reviewAfter)) {
      return false;
    }
  }

  return true;
}

function validateObservations(value) {
  if (value === undefined) {
    return true;
  }

  if (!Array.isArray(value)) {
    return false;
  }

  return value.every((entry) => (
    isPlainObject(entry) &&
    OBSERVATION_AREAS.has(entry.area) &&
    OBSERVATION_SEVERITIES.has(entry.severity) &&
    hasStringOrUndefined(entry.note)
  ));
}

function getExpectedCheckinPath(assessmentPath) {
  if (typeof assessmentPath !== 'string' || !assessmentPath.endsWith('/assessment.json')) {
    return '';
  }

  return assessmentPath.slice(0, -'/assessment.json'.length);
}

function isAssessmentCandidateApplicable(entry) {
  if (typeof entry?.assessmentPath !== 'string') {
    return true;
  }

  return isAssessmentApplicable(entry, getExpectedCheckinPath(entry.assessmentPath));
}

export function validateAssessment(value) {
  const errors = [];

  if (!isPlainObject(value)) {
    return { valid: false, errors: ['assessment must be an object'] };
  }

  if (value.schemaVersion !== ASSESSMENT_SCHEMA_VERSION) {
    errors.push('schemaVersion must be 1');
  }

  if (!hasString(value.assessmentDate)) {
    errors.push('assessmentDate must be a non-empty string');
  } else if (!isIsoDate(value.assessmentDate)) {
    errors.push('assessmentDate must be YYYY-MM-DD');
  }

  if (!hasString(value.checkinPath)) {
    errors.push('checkinPath must be a non-empty string');
  }

  if (!isPlainObject(value.overall)) {
    errors.push('overall must be an object');
  } else {
    if (!OVERALL_STATUSES.has(value.overall.status)) {
      errors.push('overall.status is invalid');
    }

    if (!OVERALL_CONFIDENCE.has(value.overall.confidence)) {
      errors.push('overall.confidence is invalid');
    }

    if (!hasStringOrUndefined(value.overall.summary)) {
      errors.push('overall.summary must be a string');
    }
  }

  if (!validateGuidance(value.guidance)) {
    errors.push('guidance must include required groups');
  }

  if (!validateObservations(value.observations)) {
    errors.push('observations are invalid');
  }

  if (!isPlainObject(value.safety) || typeof value.safety.callClinic !== 'boolean') {
    errors.push('safety.callClinic must be boolean');
  } else if (!URGENCY_VALUES.has(value.safety.urgency)) {
    errors.push('safety.urgency is invalid');
  }

  if (!Array.isArray(value.nextActions)) {
    errors.push('nextActions must be an array');
  }

  return { valid: errors.length === 0, errors };
}

export function isAssessmentApplicable(assessment, checkinPath) {
  if (!assessment || typeof assessment !== 'object' || !hasString(checkinPath)) {
    return false;
  }

  return assessment.checkinPath === checkinPath;
}

export function selectLatestValidAssessment(entries) {
  if (!Array.isArray(entries)) {
    return null;
  }

  const validated = entries.filter((entry) => {
    const result = validateAssessment(entry);
    return result.valid && isAssessmentCandidateApplicable(entry);
  });

  if (validated.length === 0) {
    return null;
  }

  return validated.reduce((best, candidate) => {
    if (!best) return candidate;

    const a = candidate.assessmentDate;
    const b = best.assessmentDate;
    if (typeof a === 'string' && typeof b === 'string' && a > b) {
      return candidate;
    }

    return best;
  }, null);
}

export function getDefaultGuidance() {
  return cloneGuidanceGroups(GUIDANCE_GROUPS);
}
