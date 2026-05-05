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

// Module-level sync status — read via getSyncStatus(), updated after each push/sync
const LS_KEY = 'syncLastSyncedAt';
let _lastSyncedAt: number | null = (() => {
  try { const v = (globalThis as any).localStorage?.getItem(LS_KEY); return v ? Number(v) : null; } catch { return null; }
})();
let _isOnline: boolean = true;
let _hasPendingChanges: boolean = false;
let _lastPushedAt: number = 0;
type SyncStatusListener = () => void;
const _listeners = new Set<SyncStatusListener>();

function notifyListeners() { _listeners.forEach((l) => l()); }

export function getSyncStatus() {
  return { lastSyncedAt: _lastSyncedAt, isOnline: _isOnline, hasPendingChanges: _hasPendingChanges };
}

export function subscribeSyncStatus(listener: SyncStatusListener) {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function markSuccess() {
  _lastSyncedAt = Date.now();
  _lastPushedAt = _lastSyncedAt;
  _isOnline = true;
  _hasPendingChanges = false;
  try { (globalThis as any).localStorage?.setItem(LS_KEY, String(_lastSyncedAt)); } catch {}
  notifyListeners();
}

function markFailure() {
  _isOnline = false;
  notifyListeners();
}

// On native: poll updated_at every 30s so remote changes (e.g. web photo uploads)
// flip _hasPendingChanges to true. Ignore if updated_at is within 10s of our own
// last push to avoid self-triggering.
async function checkForRemoteChanges() {
  try {
    const { data } = await supabase
      .from('sync_state')
      .select('updated_at')
      .eq('id', 1)
      .single();
    if (!data?.updated_at) return;
    const remoteTime = new Date(data.updated_at).getTime();
    if (remoteTime > _lastPushedAt + 10000) {
      _hasPendingChanges = true;
      notifyListeners();
    }
  } catch {}
}

if (Platform.OS !== 'web') {
  // Native: poll and flag — user taps Sync manually
  setTimeout(checkForRemoteChanges, 5000);
  setInterval(checkForRemoteChanges, 30000);
} else {
  // Web: on first load always sync to pull remote photos into local store.
  // Subsequent polls only sync if remote updated_at is > 10s newer than our last push.
  let _firstPoll = true;
  async function webAutoPoll() {
    try {
      const { data } = await supabase
        .from('sync_state')
        .select('updated_at')
        .eq('id', 1)
        .single();
      if (!data?.updated_at) return;
      const remoteTime = new Date(data.updated_at).getTime();
      if (_firstPoll || remoteTime > _lastPushedAt + 10000) {
        _firstPoll = false;
        await syncWithCloud();
      }
    } catch {}
  }
  setTimeout(webAutoPoll, 5000);
  setInterval(webAutoPoll, 30000);
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
    if (Object.keys(remoteUnits).length > 0 || remoteGeneralIssues.length > 0) {
      useStore.getState().mergeImport(remoteUnits, remoteGeneralIssues);
    }

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

    const photoStatus = [uploadStatus, repairStatus, downloadStatus].filter(Boolean).join(' | ') || 'Photos up to date';
    markSuccess();
    return { success: true, timestamp: now, warning: photoStatus };
  } catch (err: any) {
    markFailure();
    return { success: false, error: err?.message ?? 'Sync failed' };
  }
}

// Union https:// photo arrays from two sources (a=local, b=remote), no Zustand mutation.
function unionPhotoArrays(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  const aR = (a ?? []).filter(u => u?.startsWith('https://'));
  const bR = (b ?? []).filter(u => u?.startsWith('https://'));
  const all = [...new Set([...aR, ...bR])];
  return all.length ? all : undefined;
}

// Merge remote photo URLs into a deep-copy of localUnits without touching the Zustand store.
// Prevents web's auto-push from erasing native photos that haven't been synced to web yet.
function injectRemotePhotos(localUnits: Record<string, any>, remoteUnits: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = JSON.parse(JSON.stringify(localUnits));
  for (const [uid, remUnit] of Object.entries(remoteUnits) as [string, any][]) {
    if (!result[uid]) continue;
    for (const [ck, remComp] of Object.entries((remUnit as any).components ?? {}) as [string, any][]) {
      const localComp = result[uid].components?.[ck];
      if (!localComp) continue;
      localComp.progressImages = unionPhotoArrays(localComp.progressImages, remComp.progressImages);
      localComp.goodImages = unionPhotoArrays(localComp.goodImages, remComp.goodImages);
      for (const localIssue of (localComp.issues ?? [])) {
        const remIssue = (remComp.issues ?? []).find((i: any) => i.id === localIssue.id);
        if (remIssue) localIssue.images = unionPhotoArrays(localIssue.images, remIssue.images) ?? [];
      }
    }
    for (const localItem of (result[uid].miscEquipment ?? [])) {
      const remItem = ((remUnit as any).miscEquipment ?? []).find((m: any) => m.id === localItem.id);
      if (!remItem) continue;
      localItem.progressImages = unionPhotoArrays(localItem.progressImages, remItem.progressImages);
      localItem.goodImages = unionPhotoArrays(localItem.goodImages, remItem.goodImages);
      for (const localIssue of (localItem.issues ?? [])) {
        const remIssue = (remItem.issues ?? []).find((i: any) => i.id === localIssue.id);
        if (remIssue) localIssue.images = unionPhotoArrays(localIssue.images, remIssue.images) ?? [];
      }
    }
  }
  return result;
}

// Set true while pushToCloud is updating the local store to prevent a push loop.
let _suppressAutoPush = false;
export function isSuppressingAutoPush(): boolean { return _suppressAutoPush; }

// Lightweight push — writes current store state to sync_state.
// On web: fetches remote photo URLs first, injects any missing into the local store
// (suppressing the subscribe to avoid a loop), then writes the enriched state.
export async function pushToCloud(): Promise<void> {
  const { units: localUnits, generalIssues } = useStore.getState();
  let unitsToPush: Record<string, any> = localUnits;

  if (Platform.OS === 'web') {
    try {
      const { data } = await supabase.from('sync_state').select('units').eq('id', 1).single();
      if (data?.units && typeof data.units === 'object') {
        const merged = injectRemotePhotos(localUnits, data.units as Record<string, any>);
        const localCount = collectRemoteImageUrls(localUnits as UnitsStore).length;
        const mergedCount = collectRemoteImageUrls(merged as UnitsStore).length;
        if (mergedCount > localCount) {
          // New remote photos — update local store so UI shows them immediately.
          // Suppress subscribe to avoid triggering another pushToCloud.
          _suppressAutoPush = true;
          useStore.getState().loadBackup(merged as UnitsStore, generalIssues);
          _suppressAutoPush = false;
        }
        unitsToPush = merged;
      }
    } catch {}
  }

  const { error } = await supabase
    .from('sync_state')
    .update({ units: unitsToPush, general_issues: generalIssues, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) { markFailure(); } else { markSuccess(); }
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
