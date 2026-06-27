export const GUIDANCE_KEYS = ['exercise', 'heatColdExposure', 'actives', 'cosmeticsCoverage'];

const ASSESSMENT_SCHEMA_VERSION = 1;
const OVERALL_STATUSES = new Set(['on_track', 'watch', 'concern', 'call_clinic']);
const OVERALL_CONFIDENCE = new Set(['low', 'medium', 'high']);
const URGENCY_VALUES = new Set(['routine', 'monitor', 'call_clinic', 'urgent']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasString(value) {
  return typeof value === 'string' && value.length > 0;
}

function hasStringOrUndefined(value) {
  return value === undefined || typeof value === 'string';
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

    if (!hasString(entry.status) || !hasString(entry.title) || !hasString(entry.details) || !hasString(entry.reviewAfter)) {
      return false;
    }
  }

  return true;
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
    return result.valid;
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
  return {
    exercise: {
      status: 'follow_plan',
      title: 'Keep activity light',
      details: 'Choose low-intensity activity and stop if skin feels irritated.',
      reviewAfter: 'next_checkin'
    },
    heatColdExposure: {
      status: 'avoid',
      title: 'Limit heat and cold extremes',
      details: 'Avoid saunas, hot showers, and very cold exposure until skin settles.',
      reviewAfter: 'next_checkin'
    },
    actives: {
      status: 'avoid',
      title: 'Hold actives',
      details: 'Do not restart acids, retinoids, benzoyl peroxide, or vitamin C yet.',
      reviewAfter: 'next_checkin'
    },
    cosmeticsCoverage: {
      status: 'limited',
      title: 'Use light coverage only',
      details: 'Tinted SPF and non-occlusive products first, then expand as tolerated.',
      reviewAfter: 'next_checkin'
    }
  };
}
