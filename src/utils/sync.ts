import { Platform } from 'react-native';
import { supabase } from './supabase';
import { useStore } from '../store/useStore';
import { UnitsStore, GeneralIssue, STAGES, COMPONENTS, normalizeStageStatus } from '../types';
import { uploadLocalPhotos, downloadPhotosToDevice } from './imageStorage';

export interface SyncResult {
  success: boolean;
  error?: string;
  warning?: string;
  timestamp?: string;
}

// Module-level sync status — read via getSyncStatus(), updated after each push/sync
const LS_KEY = 'syncLastSyncedAt';
const REMOTE_CHANGE_POLL_MS = 5 * 60 * 1000;
let _lastSyncedAt: number | null = (() => {
  try { const v = (globalThis as any).localStorage?.getItem(LS_KEY); return v ? Number(v) : null; } catch { return null; }
})();
let _isOnline: boolean = true;
let _hasPendingChanges: boolean = false;
let _lastPushedAt: number = Date.now();
// Tracks the updated_at timestamp of the last state we pushed to the DB.
// webAutoPoll compares against this — not _lastPushedAt — so ANY newer remote
// push (APK or another browser) is detected regardless of timing.
let _lastKnownRemoteAt: number = 0;
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

type ProgressSummary = {
  unitCount: number;
  completedStageFields: number;
  anyStageWork: number;
  componentStatusesSet: number;
};

// Only count statuses under component keys that still exist in COMPONENTS.
// Remote rows can carry orphaned keys from renamed/removed components (e.g. a
// legacy `pskFieldServer` duplicated into `fieldServer`). mergeImport drops
// those keys, so counting them here would make remote look permanently "ahead"
// of any merged local state and deadlock the stale-push guard on every device.
const VALID_COMPONENT_KEYS = new Set(COMPONENTS.map((c) => c.key));

function summarizeProgress(units: UnitsStore): ProgressSummary {
  let unitCount = 0;
  let completedStageFields = 0;
  let anyStageWork = 0;
  let componentStatusesSet = 0;

  for (const unit of Object.values(units)) {
    unitCount++;
    const stageStatuses = STAGES.map((stage) => normalizeStageStatus(unit.stages[stage.key]));
    completedStageFields += stageStatuses.filter((status) => status === 'complete').length;
    if (stageStatuses.some((status) => status !== 'pending')) anyStageWork++;
    componentStatusesSet += Object.entries(unit.components)
      .filter(([key, component]) => VALID_COMPONENT_KEYS.has(key as any) && component.status !== 'unchecked').length;
  }

  return { unitCount, completedStageFields, anyStageWork, componentStatusesSet };
}

function stalePushReason(localUnits: UnitsStore, remoteUnits: UnitsStore): string | null {
  const local = summarizeProgress(localUnits);
  const remote = summarizeProgress(remoteUnits);

  if (remote.unitCount === 0 || local.unitCount === 0) return null;

  const lostStageFields = remote.completedStageFields - local.completedStageFields;
  const lostComponentStatuses = remote.componentStatusesSet - local.componentStatusesSet;
  const lostStageWorkUnits = remote.anyStageWork - local.anyStageWork;

  if (lostStageFields >= 5 || lostComponentStatuses >= 20 || lostStageWorkUnits >= 5) {
    return [
      'Blocked stale local data from overwriting newer Supabase progress.',
      `Local progress: ${local.completedStageFields} completed stage fields, ${local.componentStatusesSet} component statuses set.`,
      `Remote progress: ${remote.completedStageFields} completed stage fields, ${remote.componentStatusesSet} component statuses set.`,
      'Sync first, then retry the edit.',
    ].join(' ');
  }

  return null;
}

async function guardAgainstStalePush(localUnits: UnitsStore, remoteUnits?: UnitsStore): Promise<void> {
  let unitsToCompare = remoteUnits;
  if (!unitsToCompare) {
    const { data, error } = await supabase.from('sync_state').select('units').eq('id', 1).single();
    if (error || !data?.units) return;
    unitsToCompare = data.units as UnitsStore;
  }

  const reason = stalePushReason(localUnits, unitsToCompare);
  if (!reason) return;

  _hasPendingChanges = true;
  notifyListeners();
  throw new Error(reason);
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
    if (remoteTime > _lastPushedAt + 90000) {
      _hasPendingChanges = true;
      notifyListeners();
    }
  } catch {}
}

if (Platform.OS !== 'web') {
  // Native fallback polling: Realtime handles normal change detection; this is
  // only a low-frequency safety net so we don't burn Supabase egress all day.
  setTimeout(checkForRemoteChanges, 5000);
  setInterval(checkForRemoteChanges, REMOTE_CHANGE_POLL_MS);
} else {
  // Web: on first load always sync to pull remote photos into local store.
  // Realtime handles normal updates; polling is a low-frequency fallback.
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
      if (_firstPoll || remoteTime > _lastKnownRemoteAt) {
        _firstPoll = false;
        await syncWithCloud();
      }
    } catch {}
  }
  setTimeout(webAutoPoll, 5000);
  setInterval(webAutoPoll, REMOTE_CHANGE_POLL_MS);
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

// Wraps a Supabase call with an AbortController-backed timeout. Aborts the
// underlying fetch so the connection is actually released, not just abandoned.
async function withAbortTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try {
    const result = await fn(ac.signal);
    // supabase-js v2 returns abort errors in the result object instead of throwing
    if (ac.signal.aborted) throw new Error(`${label} timed out after ${ms / 1000}s`);
    return result;
  } catch (err: any) {
    if (ac.signal.aborted) throw new Error(`${label} timed out after ${ms / 1000}s`);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

async function _syncBody(): Promise<SyncResult> {
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;
  const { units: localUnits, generalIssues: localGeneralIssues } = useStore.getState();
  let uploadStatus = '';

  // 1. Upload any local file-path photos to Supabase Storage (30s timeout)
  try {
    const uploadResult = await Promise.race([
      uploadLocalPhotos(localUnits),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('upload timed out after 30s')), 30_000)),
    ]);
    if (uploadResult.updated) {
      useStore.getState().loadBackup(uploadResult.units as UnitsStore, localGeneralIssues);
    }
    uploadStatus = uploadResult.status;
    console.log(`[sync] upload done (${elapsed()})`);
  } catch (photoErr: any) {
    return { success: false, error: `Photo upload failed: ${photoErr?.message ?? photoErr}` };
  }

  // 2. Fetch remote state (20s timeout, aborts the underlying request)
  let data: any;
  try {
    const result = await withAbortTimeout(
      (signal) => supabase.from('sync_state').select('units, general_issues').eq('id', 1).single().abortSignal(signal),
      20_000,
      'Fetch remote state'
    );
    if (result.error) return { success: false, error: result.error.message ?? 'Failed to fetch remote state' };
    data = result.data;
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to fetch remote state' };
  }
  console.log(`[sync] fetch done (${elapsed()})`);

  // 3. Merge remote into local
  const remoteUnits = (data.units ?? {}) as UnitsStore;
  const remoteGeneralIssues = (data.general_issues ?? []) as GeneralIssue[];
  if (Object.keys(remoteUnits).length > 0 || remoteGeneralIssues.length > 0) {
    useStore.getState().mergeImport(remoteUnits, remoteGeneralIssues);
  }
  console.log(`[sync] merge done (${elapsed()})`);

  // 3b. Upload any base64 photos that arrived from remote during merge (web only path).
  // Remote sync_state can contain data: URIs written by an older client or a failed
  // uploadLocalPhotos call; if we push them straight back they re-pollute the DB row.
  try {
    const { units: mergedUnits, generalIssues: mergedGeneral } = useStore.getState();
    const postMergeResult = await Promise.race([
      uploadLocalPhotos(mergedUnits),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('post-merge upload timed out after 30s')), 30_000)),
    ]);
    if (postMergeResult.updated) {
      useStore.getState().loadBackup(postMergeResult.units as UnitsStore, mergedGeneral);
      if (postMergeResult.status) uploadStatus = postMergeResult.status;
    }
    console.log(`[sync] post-merge upload done (${elapsed()})`);
  } catch (postErr: any) {
    console.warn(`[sync] post-merge upload failed (non-fatal): ${postErr?.message ?? postErr}`);
  }

  // 4. Push merged state back to cloud (25s timeout, aborts the underlying request)
  const { units: finalUnits, generalIssues: finalGeneralIssues } = useStore.getState();
  const payloadSize = JSON.stringify(finalUnits).length + JSON.stringify(finalGeneralIssues).length;
  if (payloadSize > 500_000) console.warn(`[sync] payload is ${(payloadSize / 1024).toFixed(0)} KB — check for embedded base64 images`);
  const now = new Date().toISOString();
  // Set optimistically before the push so any Realtime echo arriving during
  // the round-trip is correctly identified as our own write and ignored.
  _lastKnownRemoteAt = new Date(now).getTime();
  try {
    await guardAgainstStalePush(finalUnits, remoteUnits);
    const pushResult = await withAbortTimeout(
      (signal) => supabase.from('sync_state').update({ units: finalUnits, general_issues: finalGeneralIssues, updated_at: now }).eq('id', 1).abortSignal(signal),
      25_000,
      'Push to cloud'
    );
    if (pushResult.error) return { success: false, error: pushResult.error.message ?? 'Failed to push to cloud' };
  } catch (err: any) {
    return { success: false, error: err.message ?? 'Failed to push to cloud' };
  }
  console.log(`[sync] push done (${elapsed()})`);

  // 5. Download any missing remote photos to device for offline access (native only).
  // Fire-and-forget — don't await so a slow download can't hang the sync completion.
  if (Platform.OS !== 'web') {
    downloadPhotosToDevice(finalUnits).catch(() => {});
  }

  const photoStatus = uploadStatus || 'Photos up to date';
  markSuccess();
  return { success: true, timestamp: now, warning: photoStatus };
}

export async function syncWithCloud(): Promise<SyncResult> {
  // Suppress useAutoPush during sync — store mutations inside _syncBody (mergeImport, loadBackup)
  // must not trigger concurrent pushToCloud calls while sync is still in flight.
  _suppressDepth++;

  // Attach .catch() immediately so any rejection from _syncBody is always handled,
  // even if the 45s timeout wins the race and this promise settles after we return.
  const bodyPromise = _syncBody().catch((err: any): SyncResult => {
    markFailure();
    return { success: false, error: err?.message ?? 'Sync failed' };
  });

  const result = await Promise.race([
    bodyPromise,
    new Promise<SyncResult>((resolve) =>
      setTimeout(() => resolve({ success: false, error: 'Sync timed out — check connection' }), 90_000)
    ),
  ]);

  // Decrement only after bodyPromise settles — if the timeout won, _syncBody is still
  // running and mutating the store; decrementing now would let a concurrent sync's
  // auto-push fire while this stalled body is mid-merge.
  bodyPromise.then(() => { _suppressDepth = Math.max(0, _suppressDepth - 1); });

  return result;
}

// Union https:// photo arrays from two sources (a=local, b=remote), no Zustand mutation.
function unionPhotoArrays(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  const aR = (a ?? []).filter(u => u?.startsWith('https://'));
  const bR = (b ?? []).filter(u => u?.startsWith('https://'));
  const all = [...new Set([...aR, ...bR])];
  return all.length ? all : undefined;
}

function mergeIssueUpdates(a: any[] | undefined, b: any[] | undefined): any[] | undefined {
  if (!a?.length && !b?.length) return undefined;
  const map = new Map<string, any>();
  for (const u of (a ?? [])) map.set(u.id, u);
  for (const u of (b ?? [])) map.set(u.id, u);
  const result = [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
  return result.length ? result : undefined;
}

// Merge remote photo URLs into a deep-copy of localUnits without touching the Zustand store.
// Iterates over REMOTE issues so photos on issues that don't yet exist in the web local store
// are still carried into the push, preventing web's auto-push from silently dropping them.
function injectRemotePhotos(localUnits: Record<string, any>, remoteUnits: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = JSON.parse(JSON.stringify(localUnits));
  for (const [uid, remUnit] of Object.entries(remoteUnits) as [string, any][]) {
    if (!result[uid]) continue;
    for (const [ck, remComp] of Object.entries((remUnit as any).components ?? {}) as [string, any][]) {
      const localComp = result[uid].components?.[ck];
      if (!localComp) continue;
      localComp.progressImages = unionPhotoArrays(localComp.progressImages, remComp.progressImages);
      localComp.goodImages = unionPhotoArrays(localComp.goodImages, remComp.goodImages);
      // Iterate over REMOTE issues — adds photos for issues not yet in web local store
      const localIssueMap = new Map<string, any>((localComp.issues ?? []).map((i: any) => [i.id, i]));
      for (const remIssue of (remComp.issues ?? [])) {
        const remPhotos = (remIssue.images ?? []).filter((u: string) => u?.startsWith('https://'));
        if (remPhotos.length === 0) continue;
        const localIssue = localIssueMap.get(remIssue.id);
        if (localIssue) {
          localIssue.images = unionPhotoArrays(localIssue.images, remIssue.images) ?? [];
        } else {
          // Remote issue not in local — add it so its photo URL isn't lost on push
          localComp.issues = [...(localComp.issues ?? []), { ...remIssue, images: remPhotos }];
        }
      }
    }
    const localMiscMap = new Map<string, any>((result[uid].miscEquipment ?? []).map((m: any) => [m.id, m]));
    for (const remItem of ((remUnit as any).miscEquipment ?? [])) {
      const localItem = localMiscMap.get(remItem.id);
      if (!localItem) continue;
      localItem.progressImages = unionPhotoArrays(localItem.progressImages, remItem.progressImages);
      localItem.goodImages = unionPhotoArrays(localItem.goodImages, remItem.goodImages);
      const localIssueMap2 = new Map<string, any>((localItem.issues ?? []).map((i: any) => [i.id, i]));
      for (const remIssue of (remItem.issues ?? [])) {
        const remPhotos = (remIssue.images ?? []).filter((u: string) => u?.startsWith('https://'));
        if (remPhotos.length === 0) continue;
        const localIssue = localIssueMap2.get(remIssue.id);
        if (localIssue) {
          localIssue.images = unionPhotoArrays(localIssue.images, remIssue.images) ?? [];
        } else {
          localItem.issues = [...(localItem.issues ?? []), { ...remIssue, images: remPhotos }];
        }
      }
    }
  }
  return result;
}

// Ref-counter: >0 means suppress auto-push. Use increment/decrement so concurrent
// syncs (e.g. stalled body + new manual sync) don't prematurely re-enable auto-push.
let _suppressDepth = 0;
export function isSuppressingAutoPush(): boolean { return _suppressDepth > 0; }

// Lightweight push — merges remote state into local then writes back to sync_state.
// On web: uploads any base64 URIs, then mergeImports the full remote state so APK
// changes (new issues, status updates, etc.) are preserved rather than overwritten.
export async function pushToCloud(): Promise<void> {
  let { units: localUnits, generalIssues } = useStore.getState();

  if (Platform.OS === 'web') {
    // Upload any base64 data: URIs before they reach the DB row.
    try {
      const uploadResult = await uploadLocalPhotos(localUnits);
      if (uploadResult.updated) {
        _suppressDepth++;
        useStore.getState().loadBackup(uploadResult.units as UnitsStore, generalIssues);
        _suppressDepth--;
        localUnits = uploadResult.units as UnitsStore;
      }
    } catch {}

    // Additive merge: pull in any items the cloud has that local doesn't (new
    // APK issues, misc items, photos), but never overwrite local fields. Local
    // is the freshest source for status/notes/dates because the user just
    // edited — using mergeImport here would let cloud's pre-edit values clobber
    // the user's change before the push lands.
    try {
      const { data } = await supabase.from('sync_state').select('units, general_issues').eq('id', 1).single();
      if (data?.units && typeof data.units === 'object') {
        _suppressDepth++;
        useStore.getState().mergeAdditive(data.units as UnitsStore, (data.general_issues ?? []) as GeneralIssue[]);
        _suppressDepth--;
      }
    } catch {}
  }

  // Read the final merged state and push it
  const { units: finalUnits, generalIssues: finalGeneralIssues } = useStore.getState();
  const now = new Date().toISOString();
  _lastKnownRemoteAt = new Date(now).getTime(); // optimistic — prevents Realtime echo self-triggering
  try {
    await guardAgainstStalePush(finalUnits);
  } catch (err) {
    markFailure();
    throw err;
  }
  const { error } = await supabase
    .from('sync_state')
    .update({ units: finalUnits, general_issues: finalGeneralIssues, updated_at: now })
    .eq('id', 1);
  if (error) { markFailure(); } else { markSuccess(); }
}

/**
 * Subscribe to Supabase Realtime for instant change detection on sync_state.
 * On web: triggers a full sync immediately when a remote change arrives.
 * On native: sets _hasPendingChanges so the user sees the sync indicator.
 * Falls back gracefully if Realtime is unavailable — polling still runs.
 * Returns a cleanup function to unsubscribe.
 *
 * Requires Supabase Realtime to be enabled for the sync_state table:
 *   ALTER TABLE sync_state REPLICA IDENTITY FULL;
 */
export function subscribeRealtimeSync(): () => void {
  const SELF_PUSH_GRACE_MS = 10_000;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  const handleChange = (payload: any) => {
    const remoteAt = payload?.new?.updated_at;
    if (!remoteAt) return;
    const remoteTime = new Date(remoteAt).getTime();
    if (remoteTime <= _lastKnownRemoteAt + SELF_PUSH_GRACE_MS) return;

    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      if (Platform.OS === 'web') {
        syncWithCloud().catch(() => {});
      } else {
        _hasPendingChanges = true;
        notifyListeners();
      }
    }, 2000);
  };

  const channel = supabase
    .channel('sync_state_realtime')
    .on('postgres_changes' as any, { event: 'UPDATE', schema: 'public', table: 'sync_state', filter: 'id=eq.1' }, handleChange)
    .subscribe((status) => console.log('[realtime] sync_state channel:', status));

  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    supabase.removeChannel(channel);
  };
}

// Surgically remove a single stagesNotes key from the Supabase row without
// doing a full push. This guarantees the clear lands atomically — bypassing the
// merge/push pipeline that can race with webAutoPoll and restore the old value.
// Atomically write '' + timestamp into Supabase for a stage note, bypassing the
// merge pipeline. Other devices see '' with a fresh timestamp and remove their
// local copy via mergeImport's timestamp-based resolution.
export async function forceDeleteStageNote(unitId: string, stageKey: string): Promise<void> {
  try {
    const { data } = await supabase.from('sync_state').select('units').eq('id', 1).single();
    if (!data?.units) return;
    const units = JSON.parse(JSON.stringify(data.units)) as Record<string, any>;
    const unit = units[unitId];
    if (!unit) return;
    const now = new Date().toISOString();
    unit.stagesNotes = { ...(unit.stagesNotes ?? {}), [stageKey]: '' };
    unit.stagesNotesUpdatedAt = { ...(unit.stagesNotesUpdatedAt ?? {}), [stageKey]: now };
    _lastKnownRemoteAt = new Date(now).getTime();
    await supabase.from('sync_state').update({ units, updated_at: now }).eq('id', 1);
  } catch {}
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
