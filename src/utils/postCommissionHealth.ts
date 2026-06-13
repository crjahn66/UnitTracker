import { getReadyForMaster, normalizeStageStatus } from '../types';
import type { ComponentStatus, Unit } from '../types';

export interface ReadyForMasterHealth {
  commissioned: boolean;
  status: ComponentStatus;
  openIssueCount: number;
  failCount: number;
  needsAttention: boolean;
  statusText: string;
  statusColor: string;
}

const GOOD = '#3fb950';
const BAD = '#f85149';
const IN_PROGRESS = '#d29922';
const MUTED = '#8b949e';

function statusColor(status: ComponentStatus, needsAttention: boolean): string {
  if (needsAttention || status === 'bad') return BAD;
  if (status === 'good') return GOOD;
  if (status === 'inProgress') return IN_PROGRESS;
  return MUTED;
}

function statusText(status: ComponentStatus, failCount: number, openIssueCount: number): string {
  if (status === 'good') return 'Red Group Tested';
  if (status === 'bad') return `${Math.max(failCount, 1)} Post RGT Fail`;
  if (status === 'inProgress') return 'In Progress';
  if (openIssueCount > 0) return `${openIssueCount} open issue${openIssueCount !== 1 ? 's' : ''}`;
  return 'Not Set';
}

export function getPostCommissionHealth(unit: Unit): ReadyForMasterHealth {
  const commissioned = normalizeStageStatus(unit.stages.commissioning) === 'complete';
  const ready = getReadyForMaster(unit);
  const openIssueCount = 0;
  // The "!" indicator means the unit failed AFTER it was fully tested/commissioned:
  // RED Group Tested (commissioning) is complete and Ready for Master has since gone bad.
  const needsAttention = commissioned && ready.status === 'bad';
  return {
    commissioned,
    status: ready.status,
    openIssueCount,
    failCount: ready.failCount ?? 0,
    needsAttention,
    statusText: commissioned ? statusText(ready.status, ready.failCount ?? 0, openIssueCount) : 'Not Red Group Tested',
    statusColor: statusColor(ready.status, needsAttention),
  };
}

export const getReadyForMasterHealth = getPostCommissionHealth;
