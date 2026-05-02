import { supabase } from './supabase';
import { useStore } from '../store/useStore';
import { UnitsStore, GeneralIssue } from '../types';

export interface SyncResult {
  success: boolean;
  error?: string;
  timestamp?: string;
}

export async function syncWithCloud(): Promise<SyncResult> {
  try {
    const { data, error } = await supabase
      .from('sync_state')
      .select('units, general_issues')
      .eq('id', 1)
      .single();

    if (error) throw error;

    const remoteUnits = (data.units ?? {}) as UnitsStore;
    const remoteGeneralIssues = (data.general_issues ?? []) as GeneralIssue[];

    if (Object.keys(remoteUnits).length > 0 || remoteGeneralIssues.length > 0) {
      useStore.getState().mergeImport(remoteUnits, remoteGeneralIssues);
    }

    const { units: mergedUnits, generalIssues: mergedGeneralIssues } = useStore.getState();
    const now = new Date().toISOString();

    const { error: pushError } = await supabase
      .from('sync_state')
      .update({ units: mergedUnits, general_issues: mergedGeneralIssues, updated_at: now })
      .eq('id', 1);

    if (pushError) throw pushError;

    return { success: true, timestamp: now };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Sync failed' };
  }
}
