import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';
import { GeneralIssue, UnitsStore } from '../types';

const AUTO_BACKUP_DIR = '/storage/emulated/0/Download/Dicvon/bak/';
const AUTO_BACKUP_INTERVAL_MS = 15 * 60 * 1000;

export async function autoBackup(units: UnitsStore, generalIssues: GeneralIssue[]): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const info = await FileSystem.getInfoAsync(AUTO_BACKUP_DIR);
    if (!info.exists) return;

    const payload  = { version: 1, timestamp: new Date().toISOString(), units, generalIssues };
    const filename = `UnitTracker_Auto_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
    await FileSystem.writeAsStringAsync(AUTO_BACKUP_DIR + filename, JSON.stringify(payload), { encoding: 'utf8' as any });

    // Keep only the 10 most recent auto-backups to avoid filling storage
    const dir = await FileSystem.readDirectoryAsync(AUTO_BACKUP_DIR);
    const backups = dir.filter((f) => f.startsWith('UnitTracker_Auto_')).sort();
    for (const old of backups.slice(0, Math.max(0, backups.length - 10))) {
      await FileSystem.deleteAsync(AUTO_BACKUP_DIR + old, { idempotent: true });
    }
  } catch {
    // Silently skip any failure — permissions, storage full, etc.
  }
}

export function startAutoBackup(getState: () => { units: UnitsStore; generalIssues: GeneralIssue[] }): () => void {
  if (Platform.OS === 'web') return () => {};
  const timer = setInterval(() => {
    const { units, generalIssues } = getState();
    autoBackup(units, generalIssues).catch(() => {});
  }, AUTO_BACKUP_INTERVAL_MS);
  return () => clearInterval(timer);
}

export const backupData = async (units: UnitsStore, generalIssues: GeneralIssue[]): Promise<void> => {
  const payload = { version: 1, timestamp: new Date().toISOString(), units, generalIssues };
  const json     = JSON.stringify(payload, null, 2);
  const filename = `UnitTracker_Backup_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
  const uri      = (FileSystem.documentDirectory ?? '') + filename;

  await FileSystem.writeAsStringAsync(uri, json, { encoding: 'utf8' as any });
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save Unit Tracker Backup' });
};

export const restoreData = async (): Promise<{ units: UnitsStore; generalIssues: GeneralIssue[] } | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: ['application/json', '*/*'],
    copyToCacheDirectory: true,
  });

  if (result.canceled) return null;

  const file    = result.assets[0];
  const content = await FileSystem.readAsStringAsync(file.uri, { encoding: 'utf8' as any });
  const parsed  = JSON.parse(content);

  if (!parsed.units || typeof parsed.units !== 'object') {
    throw new Error('Invalid backup file. Expected a UnitTracker backup JSON.');
  }

  return {
    units: parsed.units as UnitsStore,
    generalIssues: Array.isArray(parsed.generalIssues) ? parsed.generalIssues as GeneralIssue[] : [],
  };
};
