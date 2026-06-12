import { COMPONENTS, STAGES, normalizeStageStatus } from '../types';
import type { Unit } from '../types';

// Components that don't matter for the Ready for Master backfill — issues on
// these are ignored when deriving the Ready for Master state.
export const RFM_EXCEPTION_COMPONENTS: readonly string[] = ['upsModbusComms', 'panduit', 'panelIntegrity'];

/**
 * Backfill rule for a unit's Ready for Master status, derived from its stage
 * completion and any issues logged after RED Group Tested.
 *
 * Rule:
 *   1. Any non-deleted, non-exception component issue dated AFTER the RED Group
 *      Tested date -> 'bad' (resolved issues still count because they happened)
 *   2. Else all four stages complete -> 'good'
 *
 * Returns null when the unit should be left unchanged.
 */
export function deriveReadyForMasterBackfill(unit: Unit): { status: 'good' | 'bad'; date: string } | null {
  const commDate = unit.stagesDates?.commissioning;
  const commT = commDate ? new Date(commDate).getTime() : null;
  const exc = new Set(RFM_EXCEPTION_COMPONENTS);

  let latestLate: string | null = null;

  if (commT != null && !Number.isNaN(commT)) {
    for (const c of COMPONENTS) {
      if (exc.has(c.key)) continue;
      const comp = unit.components[c.key];
      if (!comp) continue;
      for (const iss of comp.issues ?? []) {
        if (iss.deleted || !iss.dateFound) continue;
        const t = new Date(iss.dateFound).getTime();
        if (!Number.isNaN(t) && t > commT) {
          if (!latestLate || t > new Date(latestLate).getTime()) latestLate = iss.dateFound;
        }
      }
    }
  }

  if (latestLate) return { status: 'bad', date: latestLate };
  if (!STAGES.every((stage) => normalizeStageStatus(unit.stages[stage.key]) === 'complete')) return null;
  if (!commDate) return null;          // no RED Group Tested date to anchor a 'good' -> skip
  return { status: 'good', date: commDate };
}
