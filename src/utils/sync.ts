import { Image } from 'react-native';
import { supabase } from './supabase';
import { useStore } from '../store/useStore';
import { UnitsStore, GeneralIssue } from '../types';
import { uploadLocalPhotos, verifyAndRepairPhotos } from './imageStorage';

export interface SyncResult {
  success: boolean;
  error?: string;
  warning?: string;
  timestamp?: string;
}

function collectRemoteImageUrls(units: UnitsStore): string[] {
  const urls: string[] = [];
  for (const unit of Object.values(units)) {
    for (const comp of Object.values(unit.components)) {
      for (const issue of comp.issues) urls.push(...(issue.images ?? []));
      urls.push(...(comp.progressImages ?? []), ...(comp.goodImages ?? []));
    }
    for (const item of (unit.miscEquipment ?? [])) {
      for (const issue of item.issues) urls.push(...(issue.images ?? []));
      urls.push(...(item.progressImages ?? []), ...(item.goodImages ?? []));
    }
  }
  return urls.filter((u) => u?.startsWith('https://'));
}

export async function syncWithCloud(): Promise<SyncResult> {
  try {
    // 1. Upload any locally stored photos to Supabase Storage
    const { units: localUnits, generalIssues: localGeneralIssues } = useStore.getState();
    let uploadedUnits = localUnits as any;
    let photoStatus: string | undefined;
    try {
      // Upload any new local photos
      const uploadResult = await uploadLocalPhotos(localUnits);
      let workingUnits = uploadResult.updated ? uploadResult.units : localUnits;
      if (uploadResult.updated) useStore.getState().loadBackup(uploadResult.units as UnitsStore, localGeneralIssues);

      // Verify existing https:// photos still exist in Supabase; re-upload from device if missing
      const repairResult = await verifyAndRepairPhotos(workingUnits);
      if (repairResult.repaired > 0) {
        useStore.getState().loadBackup(repairResult.units as UnitsStore, useStore.getState().generalIssues);
        workingUnits = repairResult.units;
      }
      uploadedUnits = workingUnits;

      const parts = [uploadResult.status, repairResult.status].filter(Boolean);
      if (parts.length) photoStatus = parts.join(' | ');
    } catch (photoErr: any) {
      return { success: false, error: `Photo upload failed: ${photoErr?.message ?? photoErr}` };
    }

    // 2. Fetch remote state
    const { data, error } = await supabase
      .from('sync_state')
      .select('units, general_issues')
      .eq('id', 1)
      .single();

    if (error) throw error;

    // 3. Merge remote into local
    const remoteUnits = (data.units ?? {}) as UnitsStore;
    const remoteGeneralIssues = (data.general_issues ?? []) as GeneralIssue[];

    if (Object.keys(remoteUnits).length > 0 || remoteGeneralIssues.length > 0) {
      useStore.getState().mergeImport(remoteUnits, remoteGeneralIssues);
    }

    // 4. Push merged state back up
    const { units: mergedUnits, generalIssues: mergedGeneralIssues } = useStore.getState();
    const now = new Date().toISOString();

    const { error: pushError } = await supabase
      .from('sync_state')
      .update({ units: mergedUnits, general_issues: mergedGeneralIssues, updated_at: now })
      .eq('id', 1);

    if (pushError) throw pushError;

    // 5. Prefetch all remote photos to local cache for offline access
    const remoteUrls = collectRemoteImageUrls(mergedUnits);
    await Promise.allSettled(remoteUrls.map((url) => Image.prefetch(url)));

    return { success: true, timestamp: now, warning: photoStatus };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Sync failed' };
  }
}
