import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import { format } from 'date-fns';
import { Unit, STAGES, COMPONENTS } from '../types';

const fmtDate = (iso?: string) => {
  if (!iso) return '';
  try {
    return format(new Date(iso), 'MM/dd/yyyy');
  } catch {
    return iso;
  }
};

export const exportToExcel = async (units: Record<string, Unit>): Promise<void> => {
  const wb = XLSX.utils.book_new();

  const sorted = Object.values(units).sort((a, b) => {
    if (a.side !== b.side) return a.side === 'North' ? -1 : 1;
    return a.unitNumber - b.unitNumber;
  });

  // ── Sheet 1: Overview ─────────────────────────────────────────────────────
  const overviewRows: string[][] = [
    [
      'Unit ID', 'Side', 'Unit #',
      ...STAGES.map((s) => s.label),
      'Stages Complete', 'Components Good', 'Components Bad',
      'Components Unchecked', 'Total Issues', 'Open Issues',
    ],
  ];

  for (const unit of sorted) {
    const compList = Object.values(unit.components);
    const allIssues = compList.flatMap((c) => c.issues);
    const stagesComplete = STAGES.filter((s) => unit.stages[s.key]).length;

    overviewRows.push([
      unit.id,
      unit.side,
      unit.unitNumber.toString(),
      ...STAGES.map((s) => (unit.stages[s.key] ? '✓ Complete' : '— Pending')),
      `${stagesComplete} / ${STAGES.length}`,
      compList.filter((c) => c.status === 'good').length.toString(),
      compList.filter((c) => c.status === 'bad').length.toString(),
      compList.filter((c) => c.status === 'unchecked').length.toString(),
      allIssues.length.toString(),
      allIssues.filter((i) => !i.resolved).length.toString(),
    ]);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(overviewRows), 'Overview');

  // ── Sheet 2: Component Status ─────────────────────────────────────────────
  const compRows: string[][] = [
    ['Unit ID', 'Side', 'Unit #', ...COMPONENTS.map((c) => c.label)],
  ];

  for (const unit of sorted) {
    compRows.push([
      unit.id,
      unit.side,
      unit.unitNumber.toString(),
      ...COMPONENTS.map((c) => {
        const s = unit.components[c.key].status;
        return s === 'good' ? 'Good' : s === 'bad' ? 'Bad' : 'Unchecked';
      }),
    ]);
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compRows), 'Component Status');

  // ── Sheet 3: Issues Log ───────────────────────────────────────────────────
  const issueRows: string[][] = [
    [
      'Unit ID', 'Side', 'Unit #', 'Component',
      'Date Found', 'Found By', 'Notes',
      'Status', 'Date Fixed', 'Fixed By', 'How Fixed',
    ],
  ];

  for (const unit of sorted) {
    for (const comp of COMPONENTS) {
      for (const issue of unit.components[comp.key].issues) {
        issueRows.push([
          unit.id,
          unit.side,
          unit.unitNumber.toString(),
          comp.label,
          fmtDate(issue.dateFound),
          issue.foundBy,
          issue.notes,
          issue.resolved ? 'Resolved' : 'Open',
          fmtDate(issue.dateFixed),
          issue.fixedBy ?? '',
          issue.howFixed ?? '',
        ]);
      }
    }
  }

  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(issueRows), 'Issues Log');

  // ── Write & Share ─────────────────────────────────────────────────────────
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
  const filename = `UnitTracker_${format(new Date(), 'yyyy-MM-dd_HHmm')}.xlsx`;
  const uri = (FileSystem.documentDirectory ?? FileSystem.cacheDirectory ?? '') + filename;

  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  await Sharing.shareAsync(uri, {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    dialogTitle: 'Export Unit Tracker Report',
    UTI: 'com.microsoft.excel.xlsx',
  });
};
