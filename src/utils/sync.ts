import { Platform } from 'react-native';
import { supabase } from './supabase';
import { useStore } from '../store/useStore';
import { UnitsStore, GeneralIssue } from '../types';
import { uploadLocalPhotos, verifyAndRepairPhotos, downloadPhotosToDevice } from './imageStorage';

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
    const { units: localUnits, generalIssues: localGeneralIssues } = useStore.getState();
    let uploadStatus = '';

    // 1. Upload any local file-path photos to Supabase Storage
    try {
      const uploadResult = await uploadLocalPhotos(localUnits);
      if (uploadResult.updated) {
        useStore.getState().loadBackup(uploadResult.units as UnitsStore, localGeneralIssues);
      }
      uploadStatus = uploadResult.status;
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
    const remotePhotoCount = collectRemoteImageUrls(remoteUnits).length;

    if (Object.keys(remoteUnits).length > 0 || remoteGeneralIssues.length > 0) {
      useStore.getState().mergeImport(remoteUnits, remoteGeneralIssues);
    }

    const postMergePhotoCount = collectRemoteImageUrls(useStore.getState().units).length;

    // 4. Verify photos AFTER merge — drops/repairs any https:// URLs that don't exist in the
    //    bucket, including ones the merge just restored from stale sync_state data (e.g. a photo
    //    the user deleted before this sync ran).
    const { units: postMergeUnits, generalIssues: postMergeGeneral } = useStore.getState();
    let repairStatus = '';
    try {
      const repairResult = await verifyAndRepairPhotos(postMergeUnits);
      if (repairResult.repaired > 0 || repairResult.dropped > 0) {
        useStore.getState().loadBackup(repairResult.units as UnitsStore, postMergeGeneral);
      }
      repairStatus = repairResult.status;
    } catch { /* non-fatal — push whatever we have */ }

    const postVerifyPhotoCount = collectRemoteImageUrls(useStore.getState().units).length;

    // 5. Push merged + repaired state back to cloud
    const { units: finalUnits, generalIssues: finalGeneralIssues } = useStore.getState();
    const now = new Date().toISOString();

    const { error: pushError } = await supabase
      .from('sync_state')
      .update({ units: finalUnits, general_issues: finalGeneralIssues, updated_at: now })
      .eq('id', 1);

    if (pushError) throw pushError;

    // 6. Download any missing remote photos to device for offline access (native only)
    let downloadStatus = '';
    if (Platform.OS !== 'web') {
      try {
        const dlResult = await downloadPhotosToDevice(finalUnits);
        downloadStatus = dlResult.status;
      } catch {}
    }

    const debugLine = `[debug] remote:${remotePhotoCount} → merge:${postMergePhotoCount} → verify:${postVerifyPhotoCount}`;
    const photoStatus = [uploadStatus, repairStatus, downloadStatus, debugLine].filter(Boolean).join(' | ');
    return { success: true, timestamp: now, warning: photoStatus };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Sync failed' };
  }
}

// Lightweight push — just writes current store state to sync_state, no merge or verify.
// Used for web auto-push so changes propagate to other devices without a full sync.
export async function pushToCloud(): Promise<void> {
  const { units, generalIssues } = useStore.getState();
  await supabase
    .from('sync_state')
    .update({ units, general_issues: generalIssues, updated_at: new Date().toISOString() })
    .eq('id', 1);
}

// Delete all photos from the bucket, clear refs from the store, and push the
// cleaned state to sync_state so other devices don't restore the URLs on next sync.
export async function wipeAllPhotos(): Promise<{ success: boolean; error?: string }> {
  try {
    const { units, generalIssues } = useStore.getState();

    // Batch-delete all bucket files referenced in the store
    const SUPABASE_PUBLIC = '/storage/v1/object/public/photos/';
    const remoteUrls = collectRemoteImageUrls(units);
    if (remoteUrls.length > 0) {
      const fileNames = remoteUrls
        .map(u => { const p = u.split(SUPABASE_PUBLIC)[1]; return p ? decodeURIComponent(p) : null; })
        .filter((n): n is string => n !== null);
      if (fileNames.length > 0) {
        await supabase.storage.from('photos').remove(fileNames);
      }
    }

    // Clear refs from store
    useStore.getState().clearAllPhotos();

    // Push cleared state so sync_state no longer has any photo URLs
    const { units: clearedUnits, generalIssues: clearedGeneral } = useStore.getState();
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('sync_state')
      .update({ units: clearedUnits, general_issues: clearedGeneral, updated_at: now })
      .eq('id', 1);
    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Wipe failed' };
  }
}
