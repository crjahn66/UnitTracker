import { COMPONENTS, normalizeStageStatus } from '../types';
import type { ComponentStatus, Issue, MiscIssue, Unit } from '../types';

export interface PostCommissionHealth {
  commissioned: boolean;
  badCount: number;
  uncheckedCount: number;
  inProgressCount: number;
  postCommissionIssueCount: number;
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

function dateTime(iso?: string): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : null;
}

function isAfterCommissioning(issue: Issue | MiscIssue, commissionedAt: number | null): boolean {
  if (issue.deleted || issue.resolved || commissionedAt === null) return false;
  const foundAt = dateTime(issue.dateFound);
  return foundAt !== null && foundAt > commissionedAt;
}

export function getPostCommissionHealth(unit: Unit): PostCommissionHealth {
  const commissioned = normalizeStageStatus(unit.stages.commissioning) === 'complete';
  const commissionedAt = dateTime(unit.stagesDates?.commissioning);
  let badCount = 0;
  let uncheckedCount = 0;
  let inProgressCount = 0;
  let postCommissionIssueCount = 0;

  const segmentColors: string[] = [];
  const addStatus = (status: ComponentStatus, hasPostCommissionIssue: boolean) => {
    if (status === 'bad') badCount++;
    else if (status === 'inProgress') inProgressCount++;
    else if (status === 'unchecked') uncheckedCount++;

    if (hasPostCommissionIssue || status === 'bad') return BAD;
    if (status === 'inProgress') return IN_PROGRESS;
    if (status === 'good') return GOOD;
    return UNCHECKED;
  };

  for (const comp of COMPONENTS) {
    const data = unit.components[comp.key];
    const postIssues = data.issues.filter((issue) => isAfterCommissioning(issue, commissionedAt)).length;
    postCommissionIssueCount += postIssues;
    segmentColors.push(addStatus(data.status, postIssues > 0));
  }

  for (const item of (unit.miscEquipment ?? []).filter((m) => !m.deleted)) {
    const postIssues = item.issues.filter((issue) => isAfterCommissioning(issue, commissionedAt)).length;
    postCommissionIssueCount += postIssues;
    segmentColors.push(addStatus(item.status, postIssues > 0));
  }

  if (!commissioned) {
    return {
      commissioned,
      badCount,
      uncheckedCount,
      inProgressCount,
      postCommissionIssueCount,
      needsAttention: false,
      statusText: 'Not Commissioned',
      statusColor: MUTED,
      segmentColors,
    };
  }

  const parts = [
    postCommissionIssueCount > 0 ? `${postCommissionIssueCount} post-C issue${postCommissionIssueCount > 1 ? 's' : ''}` : null,
    badCount > 0 ? `${badCount} bad` : null,
    inProgressCount > 0 ? `${inProgressCount} in progress` : null,
    uncheckedCount > 0 ? `${uncheckedCount} unchecked` : null,
  ].filter(Boolean);
  const needsAttention = postCommissionIssueCount > 0 || badCount > 0 || inProgressCount > 0;

  return {
    commissioned,
    badCount,
    uncheckedCount,
    inProgressCount,
    postCommissionIssueCount,
    needsAttention,
    statusText: parts.length > 0 ? parts.join(' · ') : 'Healthy',
    statusColor: postCommissionIssueCount > 0 || badCount > 0 ? BAD : needsAttention ? IN_PROGRESS : GOOD,
    segmentColors,
  };
}
