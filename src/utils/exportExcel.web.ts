import { format } from 'date-fns';
import { Unit, STAGES, COMPONENTS, GeneralIssue, Issue, MiscIssue, normalizeStageStatus } from '../types';
import { readResizedBase64 } from './imageStorage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ExcelJS = require('exceljs/dist/exceljs.bare.js');

// ─── Colour palette ───────────────────────────────────────────────────────────
const HDR = { bg: '1E3A5F', fg: 'FFFFFF' };
const GRN = { bg: 'C6EFCE', fg: '276221' };
const RED = { bg: 'FFC7CE', fg: '9C0006' };
const AMB = { bg: 'FFF2CC', fg: '7D5A00' };
const GRY = { bg: 'F2F2F2', fg: '595959' };
const WHT = { bg: 'FFFFFF', fg: '000000' };

type Clr = { bg: string; fg: string };

function applyCell(cell: any, value: string | number, clr: Clr, bold = false, center = false) {
  cell.value = value;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + clr.bg } };
  cell.font = { name: 'Calibri', size: 10, bold, color: { argb: 'FF' + clr.fg } };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
  };
  cell.alignment = { horizontal: center ? 'center' : 'left', vertical: 'middle', wrapText: true };
}

function applyHeader(cell: any, value: string) {
  cell.value = value;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + HDR.bg } };
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF' + HDR.fg } };
  cell.border = {
    top: { style: 'thin', color: { argb: 'FF888888' } },
    bottom: { style: 'thin', color: { argb: 'FF888888' } },
    left: { style: 'thin', color: { argb: 'FF888888' } },
    right: { style: 'thin', color: { argb: 'FF888888' } },
  };
  cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
}

function freezeAndWidth(ws: any, widths: number[]) {
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.columns = widths.map((width) => ({ width }));
}

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  try { return format(new Date(iso), 'MM/dd/yyyy'); } catch { return iso; }
};

function rowClr(unit: Unit): Clr {
  const compIssues = Object.values(unit.components).flatMap((c) => c.issues);
  const miscIssues = (unit.miscEquipment ?? []).flatMap((m) => m.issues);
  const openCount  = [...compIssues, ...miscIssues].filter((i) => !i.resolved).length;
  const doneCount  = STAGES.filter((s) => normalizeStageStatus(unit.stages[s.key]) === 'complete').length;
  if (doneCount === STAGES.length && openCount === 0) return GRN;
  if (openCount > 0)  return RED;
  if (doneCount > 0 || Object.values(unit.components).some((c) => c.status !== 'unchecked'))  return AMB;
  return WHT;
}

// ─── Sheet 1: Overview ────────────────────────────────────────────────────────
function buildOverview(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Overview');
  const headers = ['Unit ID', 'Side', 'Unit #', ...STAGES.map((s) => s.label), 'Stages Done', 'Open Issues', 'Status', 'Commissioned On'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 30;

  for (const u of sorted) {
    const clr = rowClr(u);
    const allIssues = [
      ...Object.values(u.components).flatMap((c) => c.issues),
      ...(u.miscEquipment ?? []).flatMap((m) => m.issues),
    ];
    const open = allIssues.filter((i) => !i.resolved).length;
    const done = STAGES.filter((s) => normalizeStageStatus(u.stages[s.key]) === 'complete').length;
    const status = done === STAGES.length && open === 0 ? 'Complete'
                 : open > 0 ? `${open} Issue${open > 1 ? 's' : ''}`
                 : done > 0 ? 'In Progress' : 'Not Started';
    const stageLabel = (s: typeof STAGES[number]) => {
      const st = normalizeStageStatus(u.stages[s.key]);
      const note = u.stagesNotes?.[s.key];
      const base = st === 'complete' ? '✓ Done' : st === 'inProgress' ? '⏳ In Progress' : st === 'stuck' ? '⚠ Stuck' : '—';
      return note ? `${base}\n${note}` : base;
    };
    const commDate = u.stagesDates?.commissioning ? fmtDate(u.stagesDates.commissioning) : '';
    const rowData = [u.id, u.side, u.unitNumber, ...STAGES.map((s) => stageLabel(s)), `${done} / ${STAGES.length}`, open, status, commDate];
    const r = ws.addRow(rowData);
    const hasNote = STAGES.some((s) => !!u.stagesNotes?.[s.key]);
    r.eachCell((cell: any, col: number) => {
      const isStageCol = col >= 4 && col <= 3 + STAGES.length;
      const rawVal = typeof cell.value === 'string' ? cell.value.split('\n')[0] : cell.value;
      const stageClr = isStageCol ? (rawVal === '✓ Done' ? GRN : rawVal?.startsWith?.('⚠') ? RED : rawVal?.startsWith?.('⏳') ? AMB : GRY) : null;
      const c = isStageCol ? stageClr! : (col === 3 + STAGES.length + 2 && open > 0 ? RED : clr);
      applyCell(cell, cell.value, c, col === 1 || isStageCol, col >= 3);
    });
    r.height = hasNote ? 32 : 18;
  }
  freezeAndWidth(ws, [9, 7, 7, 24, 22, 14, 16, 11, 10, 12, 14]);
}

// ─── Sheet 2: Component Status ────────────────────────────────────────────────
function buildComponents(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Component Status');
  const headers = ['Unit ID', 'Side', 'Unit #', ...COMPONENTS.map((c) => c.label), 'Misc Equipment'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 30;

  for (const u of sorted) {
    const clr = rowClr(u);
    const misc = u.miscEquipment ?? [];
    const miscSummary = misc.length === 0 ? '—' : misc.map((m) => {
      const v = m.status === 'good' ? '✓' : m.status === 'bad' ? '✗' : m.status === 'inProgress' ? '⏳' : '?';
      const note = m.status === 'inProgress' && m.progressNote ? ` (${m.progressNote})`
                 : m.status === 'good' && m.goodNote ? ` (${m.goodNote})` : '';
      return `${v} ${m.label || 'Unnamed'}${note}`;
    }).join(', ');
    const miscClr = misc.some((m) => m.status === 'bad') ? RED : misc.some((m) => m.status === 'inProgress') ? AMB : misc.some((m) => m.status === 'good') ? GRN : GRY;

    const rowData: (string | number)[] = [u.id, u.side, u.unitNumber];
    const compClrs: Clr[] = [];
    let anyDate = false;
    for (const comp of COMPONENTS) {
      const s = u.components[comp.key].status;
      const pn = u.components[comp.key].progressNote;
      const gn = u.components[comp.key].goodNote;
      const cd = u.components[comp.key];
      const statusDate = s === 'good' ? cd.goodDate : s === 'inProgress' ? cd.inProgressDate : s === 'bad' ? cd.badDate : undefined;
      if (statusDate) anyDate = true;
      const dateSuffix = statusDate ? `\n${fmtDate(statusDate)}` : '';
      const v = s === 'good' ? (gn ? `✓ ${gn}` : '✓ Good')
              : s === 'bad' ? '✗ Bad'
              : s === 'inProgress' ? `⏳ ${pn || 'In Progress'}` : '—';
      rowData.push(v + dateSuffix);
      compClrs.push(s === 'good' ? GRN : s === 'bad' ? RED : s === 'inProgress' ? AMB : GRY);
    }
    rowData.push(miscSummary);

    const r = ws.addRow(rowData);
    r.eachCell((cell: any, col: number) => {
      const c = col === 1 ? clr : col === 2 || col === 3 ? clr : col <= 3 + COMPONENTS.length ? compClrs[col - 4] : miscClr;
      applyCell(cell, cell.value, c, col === 1, col >= 3);
    });
    r.height = anyDate ? 32 : 18;
  }
  freezeAndWidth(ws, [9, 7, 7, ...COMPONENTS.map(() => 14), 40]);
}

// ─── Sheet 3: Issues Log (with embedded images) ───────────────────────────────
async function buildIssues(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Issues Log');
  const headers = ['Unit ID', 'Side', 'Unit #', 'Component', 'Date Found', 'Last Updated', 'Found By', 'Responsible Party', 'Notes', 'Status', 'Date Fixed', 'Fixed By', 'How Fixed', 'Photos'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 30;

  const IMG_COL = 14; // 1-indexed column for photos
  const IMG_H   = 80; // pixel height for thumbnail rows
  const IMG_W   = 80; // pixel width per thumbnail

  interface IssueRow { issue: Issue | MiscIssue; unitId: string; side: string; unitNum: number; label: string; }
  const rows: IssueRow[] = [];

  for (const u of sorted) {
    for (const comp of COMPONENTS) {
      const label = u.customComponentLabels?.[comp.key] ?? comp.label;
      for (const issue of u.components[comp.key].issues.filter((i) => !i.deleted)) {
        rows.push({ issue, unitId: u.id, side: u.side, unitNum: u.unitNumber, label });
      }
    }
    for (const item of (u.miscEquipment ?? [])) {
      for (const issue of (item.issues ?? []).filter((i: any) => !i.deleted)) {
        rows.push({ issue, unitId: u.id, side: u.side, unitNum: u.unitNumber, label: item.label || 'Misc Equipment' });
      }
    }
  }

  rows.sort((a, b) => {
    if (a.side !== b.side) return a.side === 'North' ? -1 : 1;
    if (a.unitNum !== b.unitNum) return a.unitNum - b.unitNum;
    return a.issue.dateFound.localeCompare(b.issue.dateFound);
  });

  for (let idx = 0; idx < rows.length; idx++) {
    const { issue, unitId, side, unitNum, label } = rows[idx];
    const clr = issue.resolved ? GRN : RED;
    const excelRow = idx + 2; // 1-indexed, row 1 is header

    const r = ws.addRow([
      unitId, side, unitNum, label,
      fmtDate(issue.dateFound), fmtDate(issue.dateUpdated), issue.foundBy, (issue as any).responsibleParty ?? '', issue.notes,
      issue.resolved ? 'Resolved' : 'Open',
      fmtDate(issue.dateFixed), issue.fixedBy ?? '', issue.howFixed ?? '',
      '',
    ]);
    r.eachCell((cell: any, col: number) => {
      if (col === IMG_COL) return;
      applyCell(cell, cell.value, clr, col === 1, col >= 3);
    });

    const images = issue.images ?? [];
    if (images.length > 0) {
      r.height = IMG_H * 0.75 + 4; // points ~= pixels * 0.75

      // Style the photo cell background only
      const photoCell = r.getCell(IMG_COL);
      applyCell(photoCell, '', clr, false, true);

      for (let i = 0; i < images.length; i++) {
        const base64 = await readResizedBase64(images[i]);
        if (!base64) continue;
        const imgId = wb.addImage({ base64, extension: 'jpeg' });
        const colOffset = i * (IMG_W + 4);
        ws.addImage(imgId, {
          tl: { col: IMG_COL - 1 + colOffset / 64, row: excelRow - 1 },
          ext: { width: IMG_W, height: IMG_H },
          editAs: 'oneCell',
        });
      }
    } else {
      const noteLen = issue.notes?.length ?? 0;
      r.height = Math.max(32, Math.min(90, Math.ceil(noteLen / 38) * 15 + 4));
    }
  }

  if (rows.length === 0) {
    const r = ws.addRow(['No issues logged']);
    applyCell(r.getCell(1), 'No issues logged', WHT, false);
  }

  freezeAndWidth(ws, [9, 7, 7, 18, 12, 12, 14, 18, 40, 10, 12, 14, 40, 60]);
}

// ─── Sheet 4: Completed Units ─────────────────────────────────────────────────
function buildCompleted(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Completed Units');
  const headers = ['Unit ID', 'Side', 'Unit #', ...STAGES.map((s) => s.label), 'Components Good', 'Total Issues', 'Commissioned On', 'Commissioned By'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 30;

  const done = sorted.filter((u) => {
    const open = [
      ...Object.values(u.components).flatMap((c) => c.issues),
      ...(u.miscEquipment ?? []).flatMap((m) => m.issues),
    ].filter((i) => !i.resolved).length;
    return STAGES.every((s) => normalizeStageStatus(u.stages[s.key]) === 'complete') && open === 0;
  });

  for (const u of done) {
    const comps = Object.values(u.components);
    const r = ws.addRow([
      u.id, u.side, u.unitNumber,
      ...STAGES.map(() => '✓ Done'),
      comps.filter((c) => c.status === 'good').length,
      comps.flatMap((c) => c.issues).length,
      u.stagesDates?.commissioning ? fmtDate(u.stagesDates.commissioning) : '',
      'Red Group',
    ]);
    r.eachCell((cell: any, col: number) => applyCell(cell, cell.value, GRN, col === 1, col >= 3));
    r.height = 18;
  }
  if (done.length === 0) {
    const r = ws.addRow(['No fully completed units yet']);
    applyCell(r.getCell(1), 'No fully completed units yet', WHT);
  }

  const totalCols = headers.length;
  const noteText = '⚠  NOTE: Certain equipment in these units is at high risk of failure. All commissioned units will require retesting once the affected equipment has been replaced.';
  const noteRow = ws.addRow([noteText]);
  noteRow.height = 40;
  ws.mergeCells(noteRow.number, 1, noteRow.number, totalCols);
  const noteCell = noteRow.getCell(1);
  noteCell.value = noteText;
  noteCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };
  noteCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF7D5A00' } };
  noteCell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  noteCell.border = {
    top: { style: 'medium', color: { argb: 'FFD29922' } },
    bottom: { style: 'medium', color: { argb: 'FFD29922' } },
    left: { style: 'medium', color: { argb: 'FFD29922' } },
    right: { style: 'medium', color: { argb: 'FFD29922' } },
  };

  freezeAndWidth(ws, [9, 7, 7, 24, 22, 14, 16, 16, 12, 14, 14]);
}

// ─── Sheet 5: Units with Issues ───────────────────────────────────────────────
function buildWithIssues(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Units with Issues');
  const headers = ['Unit ID', 'Side', 'Unit #', 'Open Issues', 'Total Issues', 'Components Affected', 'Responsible Party', 'Stages Done', 'Status'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 30;

  const affected = sorted.filter((u) => {
    const compOpen = Object.values(u.components).flatMap((c) => c.issues).some((i) => !i.resolved && !i.deleted);
    const miscOpen = (u.miscEquipment ?? []).flatMap((m) => m.issues).some((i) => !i.resolved && !(i as any).deleted);
    return compOpen || miscOpen;
  });

  for (const u of affected) {
    const all = [
      ...Object.values(u.components).flatMap((c) => c.issues),
      ...(u.miscEquipment ?? []).flatMap((m) => m.issues),
    ].filter((i) => !(i as any).deleted);
    const open = all.filter((i) => !i.resolved).length;
    const done = STAGES.filter((s) => normalizeStageStatus(u.stages[s.key]) === 'complete').length;
    const names = [
      ...COMPONENTS.filter((comp) => u.components[comp.key].issues.some((i) => !i.resolved && !i.deleted)).map((comp) => u.customComponentLabels?.[comp.key] ?? comp.label),
      ...(u.miscEquipment ?? []).filter((m) => m.issues.some((i) => !i.resolved && !(i as any).deleted)).map((m) => m.label || 'Misc Equipment'),
    ].join(', ');
    const parties = [...new Set(
      all.filter((i) => !i.resolved).map((i) => (i as any).responsibleParty).filter(Boolean)
    )].join(', ');
    const r = ws.addRow([u.id, u.side, u.unitNumber, open, all.length, names, parties, `${done} / ${STAGES.length}`, done === STAGES.length ? 'Complete (Issues)' : 'In Progress']);
    r.eachCell((cell: any, col: number) => applyCell(cell, cell.value, RED, col === 1, col >= 3));
    r.height = 18;
  }
  if (affected.length === 0) {
    const r = ws.addRow(['No units with open issues']);
    applyCell(r.getCell(1), 'No units with open issues', WHT);
  }
  freezeAndWidth(ws, [9, 7, 7, 12, 12, 40, 20, 12, 20]);
}

// ─── Sheet 6: General Issues ──────────────────────────────────────────────────
function buildGeneralIssues(wb: any, issues: GeneralIssue[]) {
  const ws = wb.addWorksheet('General Issues');
  const headers = ['Date Found', 'Last Updated', 'Found By', 'Responsible Party', 'Notes', 'Status', 'Date Fixed', 'Fixed By', 'How Fixed'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 30;

  const sorted = [...issues].sort((a, b) => b.dateFound.localeCompare(a.dateFound));
  for (const issue of sorted) {
    const clr = issue.resolved ? GRN : RED;
    const r = ws.addRow([fmtDate(issue.dateFound), fmtDate(issue.dateUpdated), issue.foundBy, issue.responsibleParty ?? '', issue.notes, issue.resolved ? 'Resolved' : 'Open', fmtDate(issue.dateFixed), issue.fixedBy ?? '', issue.howFixed ?? '']);
    r.eachCell((cell: any, col: number) => applyCell(cell, cell.value, clr, col === 6, col === 1 || col >= 6));
    r.height = 18;
  }
  if (issues.length === 0) {
    const r = ws.addRow(['No general issues logged']);
    applyCell(r.getCell(1), 'No general issues logged', WHT);
  }
  freezeAndWidth(ws, [12, 12, 14, 18, 40, 10, 12, 14, 40]);
}

// ─── Export entry point ───────────────────────────────────────────────────────
export const exportToExcel = async (units: Record<string, Unit>, generalIssues: GeneralIssue[]): Promise<void> => {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'UnitTracker';
  wb.created = new Date();

  const sorted = Object.values(units).sort((a, b) =>
    a.side !== b.side ? (a.side === 'North' ? -1 : 1) : a.unitNumber - b.unitNumber
  );

  buildOverview(wb, sorted);
  buildComponents(wb, sorted);
  await buildIssues(wb, sorted);
  buildCompleted(wb, sorted);
  buildWithIssues(wb, sorted);
  buildGeneralIssues(wb, generalIssues);

  const filename = `UnitTracker_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
  const buffer: ArrayBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
