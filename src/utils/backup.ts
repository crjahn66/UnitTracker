import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { format } from 'date-fns';
import { UnitsStore } from '../types';

export const backupData = async (units: UnitsStore): Promise<void> => {
  const payload = { version: 1, timestamp: new Date().toISOString(), units };
  const json     = JSON.stringify(payload, null, 2);
  const filename = `UnitTracker_Backup_${format(new Date(), 'yyyy-MM-dd_HHmm')}.json`;
  const uri      = (FileSystem.documentDirectory ?? '') + filename;

  await FileSystem.writeAsStringAsync(uri, json, { encoding: 'utf8' as any });
  await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save Unit Tracker Backup' });
};

export const restoreData = async (): Promise<UnitsStore | null> => {
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

  return parsed.units as UnitsStore;
};
