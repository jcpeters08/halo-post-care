export function createDailyState(targets) {
  const routineAm = Object.fromEntries(targets.am.map((item) => [item.id, false]));
  const routinePm = Object.fromEntries(targets.pm.map((item) => [item.id, false]));
  const counters = Object.fromEntries(
    Object.keys(targets.counters).map((counterId) => [counterId, 0])
  );
  const flags = Object.fromEntries(Object.keys(targets.flags).map((flagId) => [flagId, false]));

  return {
    am: routineAm,
    pm: routinePm,
    counters,
    flags
  };
}

export function toggleRoutineStep(state, period, stepId) {
  if (period !== 'am' && period !== 'pm') {
    return state;
  }

  if (!(stepId in state[period])) {
    return state;
  }

  return {
    ...state,
    [period]: {
      ...state[period],
      [stepId]: !state[period][stepId]
    }
  };
}

export function setCounterValue(state, counterId, value) {
  if (!(counterId in state.counters)) {
    return state;
  }

  const parsed = Number(value);
  const nextValue = Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : state.counters[counterId];

  return {
    ...state,
    counters: {
      ...state.counters,
      [counterId]: nextValue
    }
  };
}

export function setFlagValue(state, flagId, value) {
  if (!(flagId in state.flags)) {
    return state;
  }

  return {
    ...state,
    flags: {
      ...state.flags,
      [flagId]: Boolean(value)
    }
  };
}

export function getCompletionSummary(state, targets) {
  return {
    am: {
      completed: Object.keys(state.am).filter((id) => state.am[id]).length,
      total: targets.am.length
    },
    pm: {
      completed: Object.keys(state.pm).filter((id) => state.pm[id]).length,
      total: targets.pm.length
    },
    counters: Object.fromEntries(
      Object.entries(targets.counters)
        .filter(([, targetSpec]) => targetSpec.target > 0)
        .map(([counterId, targetSpec]) => [
          counterId,
          {
            completed: Math.min(state.counters[counterId] ?? 0, targetSpec.target),
            total: targetSpec.target
          }
        ])
    )
  };
}
