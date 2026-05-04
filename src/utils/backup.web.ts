import { format } from 'date-fns';
import { GeneralIssue, UnitsStore } from '../types';

export async function autoBackup(_units: UnitsStore, _generalIssues: GeneralIssue[]): Promise<void> {}

export function startAutoBackup(_getState: () => { units: UnitsStore; generalIssues: GeneralIssue[] }): () => void {
  return () => {};
}

export const backupData = async (units: UnitsStore, generalIssues: GeneralIssue[]): Promise<void> => {
  const payload = { version: 1, timestamp: new Date().toISOString(), units, generalIssues };
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `UnitTracker_Backup_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
  a.click();
  URL.revokeObjectURL(url);
};

export const restoreData = async (): Promise<{ units: UnitsStore; generalIssues: GeneralIssue[] } | null> => {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) { resolve(null); return; }
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        if (!parsed.units || typeof parsed.units !== 'object') {
          reject(new Error('Invalid backup file. Expected a UnitTracker backup JSON.'));
          return;
        }
        resolve({
          units: parsed.units as UnitsStore,
          generalIssues: Array.isArray(parsed.generalIssues) ? parsed.generalIssues as GeneralIssue[] : [],
        });
      } catch (e) { reject(e); }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
};
