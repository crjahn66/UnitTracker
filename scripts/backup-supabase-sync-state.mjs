import fs from 'node:fs';
import path from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const STAGES = ['wiresLabelsOhming', 'plcCommChecks', 'loopChecks', 'commissioning'];

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function summarize(rows) {
  const row = rows?.[0] ?? {};
  const units = row.units ?? {};
  const stageCounts = Object.fromEntries(STAGES.map((key) => [key, 0]));
  let unitCount = 0;
  let stageComplete = 0;
  let anyStageWork = 0;
  let componentStatusesSet = 0;
  let issues = 0;
  let openIssues = 0;

  for (const unit of Object.values(units)) {
    unitCount++;
    const statuses = STAGES.map((key) => unit.stages?.[key]);
    if (statuses.every((status) => status === 'complete' || status === true)) stageComplete++;
    if (statuses.some((status) => status && status !== 'pending' && status !== false)) anyStageWork++;
    for (const key of STAGES) {
      if (unit.stages?.[key] === 'complete' || unit.stages?.[key] === true) stageCounts[key]++;
    }
    for (const component of Object.values(unit.components ?? {})) {
      if (component?.status && component.status !== 'unchecked') componentStatusesSet++;
      for (const issue of component?.issues ?? []) {
        if (!issue.deleted) issues++;
        if (!issue.deleted && !issue.resolved) openIssues++;
      }
    }
    for (const item of unit.miscEquipment ?? []) {
      if (item?.deleted) continue;
      for (const issue of item.issues ?? []) {
        if (!issue.deleted) issues++;
        if (!issue.deleted && !issue.resolved) openIssues++;
      }
    }
  }

  return {
    backedUpAt: new Date().toISOString(),
    remoteUpdatedAt: row.updated_at,
    rowCount: rows.length,
    unitCount,
    stageComplete,
    anyStageWork,
    stageCounts,
    componentStatusesSet,
    issues,
    openIssues,
  };
}

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_KEY are required');
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/sync_state?select=*`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase backup fetch failed: ${response.status} ${await response.text()}`);
  }

  const rows = await response.json();
  const summary = summarize(rows);
  const outDir = process.env.BACKUP_DIR ?? path.join(process.cwd(), 'supabase-backups');
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = timestamp();
  const backupFile = path.join(outDir, `sync_state-${stamp}.json`);
  const summaryFile = path.join(outDir, `sync_state-${stamp}.summary.json`);

  fs.writeFileSync(backupFile, JSON.stringify({ table: 'sync_state', ...summary, rows }, null, 2));
  fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2));

  console.log(`Backup written: ${backupFile}`);
  console.log(JSON.stringify(summary, null, 2));

  if (summary.unitCount === 0) {
    throw new Error('Backup health check failed: no units found');
  }
  if (summary.anyStageWork === 0 || summary.componentStatusesSet === 0) {
    throw new Error('Backup health check failed: progress appears wiped');
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
