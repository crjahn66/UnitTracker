import { format } from 'date-fns';
import { Unit, STAGES, COMPONENTS, GeneralIssue, Issue, MiscIssue, normalizeStageStatus, isUnitComplete } from '../types';
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

function addSectionHeader(ws: any, label: string, totalCols: number) {
  const r = ws.addRow([label]);
  ws.mergeCells(r.number, 1, r.number, totalCols);
  const cell = r.getCell(1);
  cell.value = label;
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
  r.height = 22;
}

function autoRowHeight(row: any, colWidths: number[]): number {
  let maxLines = 1;
  row.eachCell({ includeEmpty: false }, (cell: any, colNum: number) => {
    const val = cell.value;
    if (val == null || typeof val === 'number') return;
    const text = String(val);
    const w = colWidths[colNum - 1] ?? 10;
    const charsPerLine = Math.max(1, Math.floor(w * 1.1));
    const lines = text.split('\n').reduce((s: number, seg: string) =>
      s + Math.max(1, Math.ceil(seg.length / charsPerLine)), 0);
    if (lines > maxLines) maxLines = lines;
  });
  return Math.max(18, Math.min(120, maxLines * 15 + 4));
}

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  try { return format(new Date(iso), 'MM/dd/yyyy'); } catch { return iso; }
};

function notesWithUpdates(issue: { notes: string; updates?: Array<{ date: string; updatedBy: string; note: string }> }): string {
  if (!issue.updates?.length) return issue.notes;
  const log = [...issue.updates]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((u) => `[${fmtDate(u.date)} · ${u.updatedBy}]\n${u.note}`)
    .join('\n\n');
  return `${issue.notes}\n\n--- Updates ---\n${log}`;
}

function rowClr(unit: Unit): Clr {
  const compIssues = Object.values(unit.components).flatMap((c) => c.issues);
  const miscIssues = (unit.miscEquipment ?? []).filter((m) => !m.deleted).flatMap((m) => m.issues);
  const openCount  = [...compIssues, ...miscIssues].filter((i) => !i.resolved && !i.deleted).length;
  const doneCount  = STAGES.filter((s) => normalizeStageStatus(unit.stages[s.key]) === 'complete').length;
  if (isUnitComplete(unit)) return openCount > 0 ? RED : GRN;
  if (openCount > 0)  return RED;
  if (doneCount > 0 || Object.values(unit.components).some((c) => c.status !== 'unchecked'))  return AMB;
  return WHT;
}

// ─── Sheet 1: Overview ────────────────────────────────────────────────────────
function buildOverview(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Overview');
  const colWidths = [9, 7, 7, 12, 24, 18, 24, 18, 14, 18, 10, 20];
  const headers = ['Unit ID', 'Side', 'Unit #', 'Optimo Mode', ...STAGES.map((s) => s.label), 'Stages Done', 'Open Constraints', 'Status', 'RED Group Tested On'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 45;

  let currentSide = '';
  for (const u of sorted) {
    if (u.side !== currentSide) {
      currentSide = u.side;
      addSectionHeader(ws, u.side.toUpperCase(), headers.length);
    }
    const clr = rowClr(u);
    const allIssues = [
      ...Object.values(u.components).flatMap((c) => c.issues),
      ...(u.miscEquipment ?? []).filter((m) => !m.deleted).flatMap((m) => m.issues),
    ];
    const open = allIssues.filter((i) => !i.resolved && !i.deleted).length;
    const done = STAGES.filter((s) => normalizeStageStatus(u.stages[s.key]) === 'complete').length;
    const stuck = STAGES.filter((s) => normalizeStageStatus(u.stages[s.key]) === 'stuck').length;
    const status = done === STAGES.length ? (open > 0 ? 'Complete with Constraints' : 'Complete')
                 : stuck > 0 ? `${stuck} Stuck`
                 : open > 0 ? `${open} Constraint${open > 1 ? 's' : ''}`
                 : done > 0 ? 'In Progress' : 'Not Started';
    const stageLabel = (s: typeof STAGES[number]) => {
      const st = normalizeStageStatus(u.stages[s.key]);
      const note = u.stagesNotes?.[s.key];
      const stuckReason = st === 'stuck' ? u.stagesStuckReasons?.[s.key] : null;
      const date = st !== 'pending' && u.stagesDates?.[s.key] ? fmtDate(u.stagesDates[s.key]) : null;
      const base = st === 'complete' ? '✓ Done' : st === 'inProgress' ? '⏳ In Progress' : st === 'stuck' ? '⚠ Stuck' : '—';
      return [base, date, stuckReason, note].filter(Boolean).join('\n');
    };
    const commDate = u.stagesDates?.commissioning ? fmtDate(u.stagesDates.commissioning) : '';
    const rowData = [u.id, u.side, u.unitNumber, u.optimoMode ?? '', ...STAGES.map(stageLabel), `${done} / ${STAGES.length}`, open, status, commDate];
    const r = ws.addRow(rowData);
    const hasNote = STAGES.some((s) => !!u.stagesNotes?.[s.key]);
    r.eachCell((cell: any, col: number) => {
      const isStageCol = col >= 5 && col <= 4 + STAGES.length;
      const rawVal = typeof cell.value === 'string' ? cell.value.split('\n')[0] : cell.value;
      const stageClr = isStageCol ? (rawVal === '✓ Done' ? GRN : rawVal?.startsWith?.('⚠') ? RED : rawVal?.startsWith?.('⏳') ? AMB : GRY) : null;
      const c = isStageCol ? stageClr! : (col === 4 + STAGES.length + 2 && open > 0 ? RED : clr);
      applyCell(cell, cell.value, c, col === 1 || isStageCol, col >= 3);
    });
    r.height = autoRowHeight(r, colWidths);
  }
  freezeAndWidth(ws, colWidths);
}

// ─── Sheet 2: Component Status ────────────────────────────────────────────────
function buildComponents(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Component Status');
  const colWidths = [9, 7, 7, 12, ...COMPONENTS.map(() => 20), 40];
  const headers = ['Unit ID', 'Side', 'Unit #', 'Optimo Mode', ...COMPONENTS.map((c) => c.label), 'Misc Equipment'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = autoRowHeight(row1, colWidths);

  let currentSide = '';
  for (const u of sorted) {
    const clr = rowClr(u);
    const misc = (u.miscEquipment ?? []).filter((m) => !m.deleted);
    const miscSummary = misc.some((m) => m.status === 'bad') ? '✗ Bad'
                     : misc.some((m) => m.status === 'inProgress') ? '⏳ In Progress'
                     : '✓ Good';
    const miscClr = misc.some((m) => m.status === 'bad') ? RED : misc.some((m) => m.status === 'inProgress') ? AMB : GRN;

    if (u.side !== currentSide) {
      currentSide = u.side;
      addSectionHeader(ws, u.side.toUpperCase(), headers.length);
    }
    const rowData: (string | number)[] = [u.id, u.side, u.unitNumber, u.optimoMode ?? ''];
    const compClrs: Clr[] = [];
    for (const comp of COMPONENTS) {
      const cd = u.components[comp.key];
      const s = cd.status;
      const v = s === 'good' ? (cd.goodNote ? `✓ ${cd.goodNote}` : '✓ Good')
              : s === 'bad' ? '✗ Bad'
              : s === 'inProgress' ? `⏳ ${cd.progressNote || 'In Progress'}` : '—';
      rowData.push(v);
      compClrs.push(s === 'good' ? GRN : s === 'bad' ? RED : s === 'inProgress' ? AMB : GRY);
    }
    rowData.push(miscSummary);

    const r = ws.addRow(rowData);
    r.eachCell((cell: any, col: number) => {
      const c = col <= 4 ? clr : col <= 4 + COMPONENTS.length ? compClrs[col - 5] : miscClr;
      applyCell(cell, cell.value, c, col === 1, col >= 3);
    });
    r.height = autoRowHeight(r, colWidths);
  }
  freezeAndWidth(ws, colWidths);
}

// ─── Sheet 3: Constraints Log (with embedded images) ─────────────────────────
async function buildConstraints(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Constraints Log');
  const colWidths = [9, 7, 7, 18, 12, 12, 14, 18, 40, 30, 10, 12, 14, 40, 60];
  const headers = ['Unit ID', 'Side', 'Unit #', 'Component', 'Date Found', 'Last Updated', 'Found By', 'Responsible Party', 'Notes', 'Suggested Resolution', 'Status', 'Date Fixed', 'Fixed By', 'How Fixed', 'Photos'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 45;

  const IMG_COL = 15; // 1-indexed column for photos
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
    for (const item of (u.miscEquipment ?? []).filter((m) => !m.deleted)) {
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

  let currentSide = '';
  for (let idx = 0; idx < rows.length; idx++) {
    const { issue, unitId, side, unitNum, label } = rows[idx];
    const clr = issue.resolved ? GRN : RED;
    if (side !== currentSide) {
      currentSide = side;
      addSectionHeader(ws, side.toUpperCase(), IMG_COL);
    }

    const r = ws.addRow([
      unitId, side, unitNum, label,
      fmtDate(issue.dateFound), fmtDate(issue.dateUpdated), issue.foundBy, (issue as any).responsibleParty ?? '', notesWithUpdates(issue),
      (issue as any).suggestedResolution ?? '',
      issue.resolved ? 'Resolved' : 'Open',
      fmtDate(issue.dateFixed), issue.fixedBy ?? '', issue.howFixed ?? '',
      '',
    ]);
    const excelRow = r.number;
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
      r.height = autoRowHeight(r, colWidths);
    }
  }

  if (rows.length === 0) {
    const r = ws.addRow(['No constraints logged']);
    applyCell(r.getCell(1), 'No constraints logged', WHT, false);
  }

  freezeAndWidth(ws, colWidths);
}

// ─── Sheet 4: Completed Units ─────────────────────────────────────────────────
function buildCompleted(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Completed Units');
  const colWidths = [9, 7, 7, 24, 18, 24, 18, 16, 16, 16, 18, 14];
  const headers = ['Unit ID', 'Side', 'Unit #', ...STAGES.map((s) => s.label), 'Functional Components', 'Total Constraints', 'Active Constraints', 'RED Group Tested On', 'Tested By'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 45;

  const done = sorted.filter(isUnitComplete);

  let currentSide = '';
  for (const u of done) {
    if (u.side !== currentSide) {
      currentSide = u.side;
      addSectionHeader(ws, u.side.toUpperCase(), headers.length);
    }
    const comps = Object.values(u.components);
    const miscItems = (u.miscEquipment ?? []).filter((m) => !m.deleted);
    const allIssues = [
      ...comps.flatMap((c) => c.issues),
      ...miscItems.flatMap((m) => m.issues),
    ].filter((i) => !i.deleted);
    const r = ws.addRow([
      u.id, u.side, u.unitNumber,
      ...STAGES.map(() => '✓ Done'),
      comps.filter((c) => c.status === 'good').length,
      allIssues.length,
      allIssues.filter((i) => !i.resolved).length,
      u.stagesDates?.commissioning ? fmtDate(u.stagesDates.commissioning) : '',
      'Red Group',
    ]);
    r.eachCell((cell: any, col: number) => applyCell(cell, cell.value, GRN, col === 1, col >= 3));
    r.height = autoRowHeight(r, colWidths);
  }
  if (done.length === 0) {
    const r = ws.addRow(['No fully completed units yet']);
    applyCell(r.getCell(1), 'No fully completed units yet', WHT);
  }

  const totalCols = headers.length;
  const noteText = '⚠  NOTE: Certain equipment in these units is at risk of failure. RED Group Tested units will require retesting once the affected equipment has been replaced.';
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

  freezeAndWidth(ws, colWidths);
}

// ─── Sheet 5: Units with Constraints ─────────────────────────────────────────
async function buildWithConstraints(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Units with Constraints');
  const colWidths = [9, 7, 7, 18, 12, 12, 14, 20, 40, 30, 10, 60];
  const headers = ['Unit ID', 'Side', 'Unit #', 'Component', 'Date Found', 'Last Updated', 'Found By', 'Responsible Party', 'Notes', 'Suggested Resolution', 'Status', 'Photos'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 45;

  const IMG_COL = 12;
  const IMG_H   = 80;
  const IMG_W   = 80;

  const rows: { issue: Issue | MiscIssue; unitId: string; side: string; unitNum: number; label: string }[] = [];
  for (const u of sorted) {
    for (const comp of COMPONENTS) {
      const label = u.customComponentLabels?.[comp.key] ?? comp.label;
      for (const issue of u.components[comp.key].issues.filter((i) => !i.deleted && !i.resolved)) {
        rows.push({ issue, unitId: u.id, side: u.side, unitNum: u.unitNumber, label });
      }
    }
    for (const item of (u.miscEquipment ?? []).filter((m) => !m.deleted)) {
      for (const issue of (item.issues ?? []).filter((i: any) => !i.deleted && !i.resolved)) {
        rows.push({ issue, unitId: u.id, side: u.side, unitNum: u.unitNumber, label: item.label || 'Misc Equipment' });
      }
    }
  }
  rows.sort((a, b) => {
    if (a.side !== b.side) return a.side === 'North' ? -1 : 1;
    if (a.unitNum !== b.unitNum) return a.unitNum - b.unitNum;
    return a.issue.dateFound.localeCompare(b.issue.dateFound);
  });

  let currentSide = '';
  for (const { issue, unitId, side, unitNum, label } of rows) {
    if (side !== currentSide) {
      currentSide = side;
      addSectionHeader(ws, side.toUpperCase(), IMG_COL);
    }
    const r = ws.addRow([
      unitId, side, unitNum, label,
      fmtDate(issue.dateFound), fmtDate(issue.dateUpdated),
      issue.foundBy, (issue as any).responsibleParty ?? '',
      notesWithUpdates(issue), (issue as any).suggestedResolution ?? '',
      issue.resolved ? 'Resolved' : 'Open',
      '',
    ]);
    const excelRow = r.number;
    r.eachCell((cell: any, col: number) => {
      if (col === IMG_COL) return;
      applyCell(cell, cell.value, RED, col === 1, col >= 3);
    });

    const images = issue.images ?? [];
    if (images.length > 0) {
      r.height = IMG_H * 0.75 + 4;
      const photoCell = r.getCell(IMG_COL);
      applyCell(photoCell, '', RED, false, true);
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
      r.height = autoRowHeight(r, colWidths);
    }
  }
  if (rows.length === 0) {
    const r = ws.addRow(['No open constraints']);
    applyCell(r.getCell(1), 'No open constraints', WHT);
  }
  freezeAndWidth(ws, colWidths);
}

// ─── Sheet 6: General Issues ──────────────────────────────────────────────────
function buildGeneralIssues(wb: any, issues: GeneralIssue[]) {
  const ws = wb.addWorksheet('General Constraints');
  const colWidths = [12, 12, 14, 18, 40, 10, 12, 14, 40];
  const headers = ['Date Found', 'Last Updated', 'Found By', 'Responsible Party', 'Notes', 'Status', 'Date Fixed', 'Fixed By', 'How Fixed'];
  const row1 = ws.addRow(headers);
  row1.eachCell((cell: any) => applyHeader(cell, cell.value));
  row1.height = 45;

  const sorted = [...issues].sort((a, b) => b.dateFound.localeCompare(a.dateFound));
  for (const issue of sorted) {
    const clr = issue.resolved ? GRN : RED;
    const r = ws.addRow([fmtDate(issue.dateFound), fmtDate(issue.dateUpdated), issue.foundBy, issue.responsibleParty ?? '', notesWithUpdates(issue), issue.resolved ? 'Resolved' : 'Open', fmtDate(issue.dateFixed), issue.fixedBy ?? '', issue.howFixed ?? '']);
    r.eachCell((cell: any, col: number) => applyCell(cell, cell.value, clr, col === 6, col === 1 || col >= 6));
    r.height = autoRowHeight(r, colWidths);
  }
  if (issues.length === 0) {
    const r = ws.addRow(['No general issues logged']);
    applyCell(r.getCell(1), 'No general issues logged', WHT);
  }
  freezeAndWidth(ws, colWidths);
}

// ─── Sheet 7: Testing Readiness ───────────────────────────────────────────────

function buildReadiness(wb: any, sorted: Unit[]) {
  const ws = wb.addWorksheet('Testing Readiness');
  const colWidths = [9, 7, 7, 16, 58];
  const totalCols = colWidths.length;

  const banners: { text: string; isTitle: boolean }[] = [
    { text: 'RED GROUP TESTING READINESS', isTitle: true },
    { text: '⚠  Units marked NOT READY have not been signed off by Integra for RED Group to complete testing.', isTitle: false },
    { text: '⚠  DATA HALL 2 units (North & South) are unavailable pending equipment availability.', isTitle: false },
  ];
  for (const { text, isTitle } of banners) {
    const r = ws.addRow([text]);
    ws.mergeCells(r.number, 1, r.number, totalCols);
    const cell = r.getCell(1);
    cell.value = text;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isTitle ? 'FF1E3A5F' : 'FFFCE4D6' } };
    cell.font = { name: 'Calibri', size: isTitle ? 12 : 10, bold: true, color: { argb: isTitle ? 'FFFFFFFF' : 'FF833C00' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFD0D0D0' } }, bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      left: { style: 'thin', color: { argb: 'FFD0D0D0' } }, right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
    };
    r.height = isTitle ? 26 : 20;
  }

  const headers = ['Unit ID', 'Side', 'Unit #', 'Status', 'Notes / Reason'];
  const hdrRow = ws.addRow(headers);
  hdrRow.eachCell((cell: any) => applyHeader(cell, cell.value));
  hdrRow.height = 28;

  let currentSide = '';
  for (const u of sorted) {
    if (u.side !== currentSide) {
      currentSide = u.side;
      addSectionHeader(ws, u.side.toUpperCase(), totalCols);
    }
    const ready = u.chillerAvailable === true;
    const status = ready ? 'READY' : 'NOT READY';
    const reason = ready
      ? 'Chiller available — ready for RED Group testing'
      : 'Chiller not available for testing';
    const clr = ready ? GRN : RED;
    const r = ws.addRow([u.id, u.side, u.unitNumber, status, reason]);
    r.eachCell((cell: any, col: number) => applyCell(cell, cell.value, clr, col === 4, col >= 2));
    r.height = autoRowHeight(r, colWidths);
  }

  ws.views = [{ state: 'frozen', ySplit: 4 }];
  ws.columns = colWidths.map((width) => ({ width }));
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
  buildCompleted(wb, sorted);
  buildComponents(wb, sorted);
  buildReadiness(wb, sorted);
  await buildWithConstraints(wb, sorted);
  await buildConstraints(wb, sorted);
  buildGeneralIssues(wb, generalIssues);

  const filename = `Optimo Statuses_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
  const buffer: ArrayBuffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
