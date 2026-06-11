import { COMPONENTS, normalizeStageStatus } from '../types';
import type { Unit } from '../types';

export interface PostCommissionHealth {
  commissioned: boolean;
  badCount: number;
  uncheckedCount: number;
  inProgressCount: number;
  needsAttention: boolean;
  statusText: string;
  statusColor: string;
  segmentColors: string[];
}

const GOOD = '#3fb950';
const BAD = '#f85149';
const IN_PROGRESS = '#d29922';
const UNCHECKED = '#30363d';
const MUTED = '#8b949e';

export function getPostCommissionHealth(unit: Unit): PostCommissionHealth {
  const commissioned = normalizeStageStatus(unit.stages.commissioning) === 'complete';
  let badCount = 0;
  let uncheckedCount = 0;
  let inProgressCount = 0;

  const segmentColors: string[] = [];
  const addStatus = (status: 'good' | 'bad' | 'inProgress' | 'unchecked') => {
    if (status === 'bad') { badCount++; return BAD; }
    if (status === 'inProgress') { inProgressCount++; return IN_PROGRESS; }
    if (status === 'good') return GOOD;
    uncheckedCount++;
    return UNCHECKED;
  };

  for (const comp of COMPONENTS) {
    segmentColors.push(addStatus(unit.components[comp.key].status));
  }

  for (const item of (unit.miscEquipment ?? []).filter((m) => !m.deleted)) {
    segmentColors.push(addStatus(item.status));
  }

  if (!commissioned) {
    return {
      commissioned,
      badCount,
      uncheckedCount,
      inProgressCount,
      needsAttention: false,
      statusText: 'Not Commissioned',
      statusColor: MUTED,
      segmentColors,
    };
  }

  const parts = [
    badCount > 0 ? `${badCount} bad` : null,
    inProgressCount > 0 ? `${inProgressCount} in progress` : null,
    uncheckedCount > 0 ? `${uncheckedCount} unchecked` : null,
  ].filter(Boolean);
  const needsAttention = parts.length > 0;

  return {
    commissioned,
    badCount,
    uncheckedCount,
    inProgressCount,
    needsAttention,
    statusText: needsAttention ? parts.join(' · ') : 'Healthy',
    statusColor: badCount > 0 ? BAD : needsAttention ? IN_PROGRESS : GOOD,
    segmentColors,
  };
}
