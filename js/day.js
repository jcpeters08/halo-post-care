import { RECOVERY_CONTENT } from './data.js';

export function parseLocalIsoDate(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeRecoveryDay(todayIso, procedureDateIso) {
  const [todayYear, todayMonth, todayDay] = todayIso.split('-').map(Number);
  const [procedureYear, procedureMonth, procedureDay] = procedureDateIso
    .split('-')
    .map(Number);
  const todayUtcMidnight = Date.UTC(todayYear, todayMonth - 1, todayDay);
  const procedureUtcMidnight = Date.UTC(procedureYear, procedureMonth - 1, procedureDay);
  return Math.floor((todayUtcMidnight - procedureUtcMidnight) / 86400000);
}

export function getStageForDay(recoveryDay) {
  if (recoveryDay <= 0) return RECOVERY_CONTENT.stages.heat_swelling;
  if (recoveryDay === 1) return RECOVERY_CONTENT.stages.red_warm_tight;
  if (recoveryDay <= 3) return RECOVERY_CONTENT.stages.mends_bronzing;
  if (recoveryDay <= 7) return RECOVERY_CONTENT.stages.flaking_peeling;
  return RECOVERY_CONTENT.stages.peeled_calm_reintroduction;
}

export function getTimelineForDay(recoveryDay) {
  return (
    RECOVERY_CONTENT.timeline.find(
      (entry) => recoveryDay >= entry.fromDay && recoveryDay <= entry.toDay
    ) ?? RECOVERY_CONTENT.timeline.at(-1)
  );
}

export function buildDailyTargets(recoveryDay, acyclovirPerDay = 2) {
  return {
    am: RECOVERY_CONTENT.routine.am,
    pm: RECOVERY_CONTENT.routine.pm,
    counters: {
      hocl: { label: 'HOCl spray', target: recoveryDay >= 1 && recoveryDay <= 3 ? 3 : 0 },
      cicalfate: { label: 'Cicalfate+', target: recoveryDay >= 1 ? 4 : 1 },
      spf: { label: 'SPF reapply', target: recoveryDay >= 1 ? 1 : 0 },
      acyclovir: { label: 'Acyclovir', target: acyclovirPerDay },
      heliocare: { label: 'Oral Heliocare', target: recoveryDay >= 1 ? 1 : 0 }
    },
    flags: {
      elevated: { label: 'Slept head-elevated', default: recoveryDay <= 3 },
      coldCompress: { label: 'Cold compress', default: recoveryDay === 1 }
    }
  };
}
