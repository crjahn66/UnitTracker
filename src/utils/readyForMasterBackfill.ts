import { COMPONENTS, normalizeStageStatus } from '../types';
import type { Unit } from '../types';

// Components that don't matter for the Ready for Master backfill — issues/bad
// status on these are ignored when deriving the initial Ready for Master state.
export const RFM_EXCEPTION_COMPONENTS: readonly string[] = ['upsModbusComms', 'panduit', 'panelIntegrity'];

/**
 * One-time backfill rule for a unit's Ready for Master status, derived from its
 * RED Group Tested (commissioning) state. Mirrors the data migration applied to
 * Supabase so every device converges on the same value.
 *
 * For a unit whose RED Group Tested stage is complete (ignoring misc equipment
 * and the exception components above):
 *   1. Any OPEN non-exception component issue dated AFTER the RGT date -> 'bad'
 *   2. Else any non-exception component in 'bad' status               -> null (leave unchecked)
 *   3. Else                                                           -> 'good'
 *
 * Returns null when the unit should be left unchecked / is not RGT-complete.
 */
export function deriveReadyForMasterBackfill(unit: Unit): { status: 'good' | 'bad'; date: string } | null {
  if (normalizeStageStatus(unit.stages.commissioning) !== 'complete') return null;
  const commDate = unit.stagesDates?.commissioning;
  const commT = commDate ? new Date(commDate).getTime() : null;
  const exc = new Set(RFM_EXCEPTION_COMPONENTS);

  let badComponent = false;
  let latestLate: string | null = null;

  for (const c of COMPONENTS) {
    if (exc.has(c.key)) continue;
    const comp = unit.components[c.key];
    if (!comp) continue;
    if (comp.status === 'bad') badComponent = true;
    for (const iss of comp.issues ?? []) {
      if (iss.resolved || iss.deleted) continue;
      if (commT == null || !iss.dateFound) continue;
      const t = new Date(iss.dateFound).getTime();
      if (!Number.isNaN(t) && t > commT) {
        if (!latestLate || t > new Date(latestLate).getTime()) latestLate = iss.dateFound;
      }
    }
  }

  if (latestLate) return { status: 'bad', date: latestLate };
  if (badComponent) return null;       // bad component, no post-test failure -> leave unchecked
  if (!commDate) return null;          // no RGT date to anchor a 'good' -> skip
  return { status: 'good', date: commDate };
}
