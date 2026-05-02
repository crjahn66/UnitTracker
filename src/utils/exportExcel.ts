import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { format } from 'date-fns';
import { Unit, STAGES, COMPONENTS, GeneralIssue } from '../types';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const XLSX = require('xlsx-js-style');

// ─── Colour palette ───────────────────────────────────────────────────────────
const HDR_BG  = '1E3A5F'; const HDR_TXT  = 'FFFFFF';
const GRN_BG  = 'C6EFCE'; const GRN_TXT  = '276221';
const RED_BG  = 'FFC7CE'; const RED_TXT  = '9C0006';
const AMB_BG  = 'FFF2CC'; const AMB_TXT  = '7D5A00';
const GRY_BG  = 'F2F2F2'; const GRY_TXT  = '595959';
const WHT_BG  = 'FFFFFF'; const BLK_TXT  = '000000';

// ─── Style builders ───────────────────────────────────────────────────────────
const fill = (rgb: string) => ({ fgColor: { rgb }, patternType: 'solid' });
const fnt  = (rgb: string, bold = false, sz = 10) => ({ color: { rgb }, bold, sz, name: 'Calibri' });
const bdr  = (rgb = 'D0D0D0') => { const s = { style: 'thin', color: { rgb } }; return { top: s, bottom: s, left: s, right: s }; };

function cell(v: string | number, bg: string, fg: string, bold = false, center = false): any {
  return {
    v, t: typeof v === 'number' ? 'n' : 's',
    s: { fill: fill(bg), font: fnt(fg, bold), border: bdr(), alignment: { horizontal: center ? 'center' : 'left', vertical: 'center', wrapText: true } },
  };
}

function hdr(v: string): any {
  return {
    v, t: 's',
    s: { fill: fill(HDR_BG), font: fnt(HDR_TXT, true, 11), border: bdr('888888'), alignment: { horizontal: 'center', vertical: 'center', wrapText: true } },
  };
}

// ─── Worksheet builder ────────────────────────────────────────────────────────
function makeSheet(rows: any[][], colWidths: number[]): any {
  const ws: any = {};
  const range = { s: { c: 0, r: 0 }, e: { c: 0, r: 0 } };
  for (let R = 0; R < rows.length; R++) {
    for (let C = 0; C < rows[R].length; C++) {
      ws[XLSX.utils.encode_cell({ r: R, c: C })] = rows[R][C];
      if (C > range.e.c) range.e.c = C;
    }
    if (R > range.e.r) range.e.r = R;
  }
  ws['!ref']   = XLSX.utils.encode_range(range);
  ws['!cols']  = colWidths.map((wch) => ({ wch }));
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };
  return ws;
}

// ─── Row colour based on unit health ─────────────────────────────────────────
function rowClr(unit: Unit): { bg: string; fg: string } {
  const compIssues = Object.values(unit.components).flatMap((c) => c.issues);
  const miscIssues = (unit.miscEquipment ?? []).flatMap((m) => m.issues);
  const openCount  = [...compIssues, ...miscIssues].filter((i) => !i.resolved).length;
  const doneCount  = STAGES.filter((s) => unit.stages[s.key]).length;
  if (doneCount === STAGES.length && openCount === 0) return { bg: GRN_BG, fg: GRN_TXT };
  if (openCount > 0)  return { bg: RED_BG, fg: RED_TXT };
  if (doneCount > 0)  return { bg: AMB_BG, fg: AMB_TXT };
  return { bg: WHT_BG, fg: BLK_TXT };
}

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  try { return format(new Date(iso), 'MM/dd/yyyy'); } catch { return iso; }
};

// ─── Sheet 1 : Overview ───────────────────────────────────────────────────────
function sheetOverview(sorted: Unit[]): any {
  const rows = [[
    hdr('Unit ID'), hdr('Side'), hdr('Unit #'),
    ...STAGES.map((s) => hdr(s.label)),
    hdr('Stages Done'), hdr('Open Issues'), hdr('Status'),
  ]];
  for (const u of sorted) {
    const { bg, fg } = rowClr(u);
    const issues = Object.values(u.components).flatMap((c) => c.issues);
    const open   = issues.filter((i) => !i.resolved).length;
    const done   = STAGES.filter((s) => u.stages[s.key]).length;
    const status = done === STAGES.length && open === 0 ? 'Complete'
                 : open > 0 ? `${open} Issue${open > 1 ? 's' : ''}`
                 : done > 0 ? 'In Progress' : 'Not Started';
    rows.push([
      cell(u.id, bg, fg, true),
      cell(u.side, bg, fg),
      cell(u.unitNumber, bg, fg, false, true),
      ...STAGES.map((s) => u.stages[s.key] ? cell('✓ Done', GRN_BG, GRN_TXT, true, true) : cell('—', GRY_BG, GRY_TXT, false, true)),
      cell(`${done} / ${STAGES.length}`, bg, fg, true, true),
      cell(open, open > 0 ? RED_BG : bg, open > 0 ? RED_TXT : fg, true, true),
      cell(status, bg, fg, true, true),
    ]);
  }
  return makeSheet(rows, [9, 7, 7, 24, 22, 14, 16, 11, 10, 12]);
}

// ─── Sheet 2 : Component Status ───────────────────────────────────────────────
function sheetComponents(sorted: Unit[]): any {
  const rows = [[
    hdr('Unit ID'), hdr('Side'), hdr('Unit #'),
    ...COMPONENTS.map((c) => hdr(c.label)),
    hdr('Misc Equipment'),
  ]];
  for (const u of sorted) {
    const { bg, fg } = rowClr(u);
    const misc = u.miscEquipment ?? [];
    const miscSummary = misc.length === 0
      ? '—'
      : misc.map((m) => {
          const v = m.status === 'good' ? '✓' : m.status === 'bad' ? '✗' : m.status === 'inProgress' ? '⏳' : '?';
          const note = m.status === 'inProgress' && m.progressNote ? ` (${m.progressNote})`
                     : m.status === 'good' && m.goodNote ? ` (${m.goodNote})`
                     : '';
          return `${v} ${m.label || 'Unnamed'}${note}`;
        }).join(', ');
    const miscBg = misc.some((m) => m.status === 'bad') ? RED_BG : misc.some((m) => m.status === 'inProgress') ? AMB_BG : misc.some((m) => m.status === 'good') ? GRN_BG : GRY_BG;
    const miscFg = misc.some((m) => m.status === 'bad') ? RED_TXT : misc.some((m) => m.status === 'inProgress') ? AMB_TXT : misc.some((m) => m.status === 'good') ? GRN_TXT : GRY_TXT;
    rows.push([
      cell(u.id, bg, fg, true),
      cell(u.side, bg, fg),
      cell(u.unitNumber, bg, fg, false, true),
      ...COMPONENTS.map((comp) => {
        const s = u.components[comp.key].status;
        const progressNote = u.components[comp.key].progressNote;
        const goodNote = u.components[comp.key].goodNote;
        const v = s === 'good'
          ? (goodNote ? `✓ ${goodNote}` : '✓ Good')
          : s === 'bad' ? '✗ Bad'
          : s === 'inProgress' ? `⏳ ${progressNote || 'In Progress'}`
          : '—';
        const cb = s === 'good' ? GRN_BG : s === 'bad' ? RED_BG : s === 'inProgress' ? AMB_BG : GRY_BG;
        const cf = s === 'good' ? GRN_TXT : s === 'bad' ? RED_TXT : s === 'inProgress' ? AMB_TXT : GRY_TXT;
        return cell(v, cb, cf, s !== 'unchecked', true);
      }),
      cell(miscSummary, miscBg, miscFg),
    ]);
  }
  return makeSheet(rows, [9, 7, 7, ...COMPONENTS.map(() => 14), 40]);
}

// ─── Sheet 3 : Issues Log ─────────────────────────────────────────────────────
function sheetIssues(sorted: Unit[]): any {
  const rows = [[
    hdr('Unit ID'), hdr('Side'), hdr('Unit #'), hdr('Component'),
    hdr('Date Found'), hdr('Found By'), hdr('Notes'),
    hdr('Status'), hdr('Date Fixed'), hdr('Fixed By'), hdr('How Fixed'),
  ]];
  for (const u of sorted) {
    for (const comp of COMPONENTS) {
      const compLabel = (u.customComponentLabels?.[comp.key]) ?? comp.label;
      for (const issue of u.components[comp.key].issues) {
        const bg = issue.resolved ? GRN_BG : RED_BG;
        const fg = issue.resolved ? GRN_TXT : RED_TXT;
        rows.push([
          cell(u.id, bg, fg, true),
          cell(u.side, bg, fg),
          cell(u.unitNumber, bg, fg, false, true),
          cell(compLabel, bg, fg),
          cell(fmtDate(issue.dateFound), bg, fg, false, true),
          cell(issue.foundBy, bg, fg),
          cell(issue.notes, bg, fg),
          cell(issue.resolved ? 'Resolved' : 'Open', bg, fg, true, true),
          cell(fmtDate(issue.dateFixed), bg, fg, false, true),
          cell(issue.fixedBy ?? '', bg, fg),
          cell(issue.howFixed ?? '', bg, fg),
        ]);
      }
    }
    for (const item of (u.miscEquipment ?? [])) {
      const compLabel = item.label || 'Misc Equipment';
      for (const issue of item.issues) {
        const bg = issue.resolved ? GRN_BG : RED_BG;
        const fg = issue.resolved ? GRN_TXT : RED_TXT;
        rows.push([
          cell(u.id, bg, fg, true),
          cell(u.side, bg, fg),
          cell(u.unitNumber, bg, fg, false, true),
          cell(compLabel, bg, fg),
          cell(fmtDate(issue.dateFound), bg, fg, false, true),
          cell(issue.foundBy, bg, fg),
          cell(issue.notes, bg, fg),
          cell(issue.resolved ? 'Resolved' : 'Open', bg, fg, true, true),
          cell(fmtDate(issue.dateFixed), bg, fg, false, true),
          cell(issue.fixedBy ?? '', bg, fg),
          cell(issue.howFixed ?? '', bg, fg),
        ]);
      }
    }
  }
  if (rows.length === 1) rows.push([cell('No issues logged', WHT_BG, GRY_TXT)]);
  return makeSheet(rows, [9, 7, 7, 18, 12, 14, 40, 10, 12, 14, 40]);
}

// ─── Sheet 4 : Completed Units ────────────────────────────────────────────────
function sheetCompleted(sorted: Unit[]): any {
  const done = sorted.filter((u) => {
    const compOpen = Object.values(u.components).flatMap((c) => c.issues).filter((i) => !i.resolved).length;
    const miscOpen = (u.miscEquipment ?? []).flatMap((m) => m.issues).filter((i) => !i.resolved).length;
    return STAGES.every((s) => u.stages[s.key]) && compOpen === 0 && miscOpen === 0;
  });
  const rows = [[
    hdr('Unit ID'), hdr('Side'), hdr('Unit #'),
    ...STAGES.map((s) => hdr(s.label)),
    hdr('Components Good'), hdr('Total Issues'),
  ]];
  for (const u of done) {
    const comps = Object.values(u.components);
    rows.push([
      cell(u.id, GRN_BG, GRN_TXT, true),
      cell(u.side, GRN_BG, GRN_TXT),
      cell(u.unitNumber, GRN_BG, GRN_TXT, false, true),
      ...STAGES.map(() => cell('✓ Done', GRN_BG, GRN_TXT, true, true)),
      cell(comps.filter((c) => c.status === 'good').length, GRN_BG, GRN_TXT, true, true),
      cell(comps.flatMap((c) => c.issues).length, GRN_BG, GRN_TXT, true, true),
    ]);
  }
  if (done.length === 0) rows.push([cell('No fully completed units yet', WHT_BG, GRY_TXT)]);
  return makeSheet(rows, [9, 7, 7, 24, 22, 14, 16, 16, 12]);
}

// ─── Sheet 5 : Units with Issues ─────────────────────────────────────────────
function sheetWithIssues(sorted: Unit[]): any {
  const rows = [[
    hdr('Unit ID'), hdr('Side'), hdr('Unit #'),
    hdr('Open Issues'), hdr('Total Issues'), hdr('Components Affected'),
    hdr('Stages Done'), hdr('Status'),
  ]];
  const affected = sorted.filter((u) => {
    const compOpen = Object.values(u.components).flatMap((c) => c.issues).some((i) => !i.resolved);
    const miscOpen = (u.miscEquipment ?? []).flatMap((m) => m.issues).some((i) => !i.resolved);
    return compOpen || miscOpen;
  });
  for (const u of affected) {
    const allIssues  = [
      ...Object.values(u.components).flatMap((c) => c.issues),
      ...(u.miscEquipment ?? []).flatMap((m) => m.issues),
    ];
    const open       = allIssues.filter((i) => !i.resolved).length;
    const stagesDone = STAGES.filter((s) => u.stages[s.key]).length;
    const compNames  = [
      ...COMPONENTS
        .filter((comp) => u.components[comp.key].issues.some((i) => !i.resolved))
        .map((comp) => (u.customComponentLabels?.[comp.key]) ?? comp.label),
      ...(u.miscEquipment ?? [])
        .filter((m) => m.issues.some((i) => !i.resolved))
        .map((m) => m.label || 'Misc Equipment'),
    ].join(', ');
    rows.push([
      cell(u.id, RED_BG, RED_TXT, true),
      cell(u.side, RED_BG, RED_TXT),
      cell(u.unitNumber, RED_BG, RED_TXT, false, true),
      cell(open, RED_BG, RED_TXT, true, true),
      cell(allIssues.length, RED_BG, RED_TXT, true, true),
      cell(compNames, RED_BG, RED_TXT),
      cell(`${stagesDone} / ${STAGES.length}`, RED_BG, RED_TXT, false, true),
      cell(stagesDone === STAGES.length ? 'Complete (Issues)' : 'In Progress', RED_BG, RED_TXT, true, true),
    ]);
  }
  if (affected.length === 0) rows.push([cell('No units with open issues', WHT_BG, GRY_TXT)]);
  return makeSheet(rows, [9, 7, 7, 12, 12, 40, 12, 20]);
}

// ─── Sheet 6 : General Issues ─────────────────────────────────────────────────
function sheetGeneralIssues(issues: GeneralIssue[]): any {
  const rows = [[
    hdr('Date Found'), hdr('Found By'), hdr('Notes'),
    hdr('Status'), hdr('Date Fixed'), hdr('Fixed By'), hdr('How Fixed'),
  ]];
  const sorted = [...issues].sort((a, b) => b.dateFound.localeCompare(a.dateFound));
  for (const issue of sorted) {
    const bg = issue.resolved ? GRN_BG : RED_BG;
    const fg = issue.resolved ? GRN_TXT : RED_TXT;
    rows.push([
      cell(fmtDate(issue.dateFound), bg, fg, false, true),
      cell(issue.foundBy, bg, fg),
      cell(issue.notes, bg, fg),
      cell(issue.resolved ? 'Resolved' : 'Open', bg, fg, true, true),
      cell(fmtDate(issue.dateFixed), bg, fg, false, true),
      cell(issue.fixedBy ?? '', bg, fg),
      cell(issue.howFixed ?? '', bg, fg),
    ]);
  }
  if (rows.length === 1) rows.push([cell('No general issues logged', WHT_BG, GRY_TXT)]);
  return makeSheet(rows, [12, 14, 40, 10, 12, 14, 40]);
}

// ─── Export entry point ───────────────────────────────────────────────────────
export const exportToExcel = async (units: Record<string, Unit>, generalIssues: GeneralIssue[]): Promise<void> => {
  const wb = XLSX.utils.book_new();
  const sorted = Object.values(units).sort((a, b) =>
    a.side !== b.side ? (a.side === 'North' ? -1 : 1) : a.unitNumber - b.unitNumber
  );

  XLSX.utils.book_append_sheet(wb, sheetOverview(sorted),          'Overview');
  XLSX.utils.book_append_sheet(wb, sheetComponents(sorted),        'Component Status');
  XLSX.utils.book_append_sheet(wb, sheetIssues(sorted),            'Issues Log');
  XLSX.utils.book_append_sheet(wb, sheetCompleted(sorted),         'Completed Units');
  XLSX.utils.book_append_sheet(wb, sheetWithIssues(sorted),        'Units with Issues');
  XLSX.utils.book_append_sheet(wb, sheetGeneralIssues(generalIssues), 'General Issues');

  const base64  = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const filename = `UnitTracker_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
  const uri      = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '') + filename;

  await FileSystem.writeAsStringAsync(uri, base64, { encoding: 'base64' as any });
  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export Unit Tracker Report',
    UTI: 'com.microsoft.excel.xlsx',
  });
};
