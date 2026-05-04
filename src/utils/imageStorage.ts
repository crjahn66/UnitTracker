import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const IMAGES_DIR = (FileSystem.documentDirectory ?? '') + 'issue_images/';
const SUPABASE_PUBLIC = '/storage/v1/object/public/photos/';

let ImageManipulator: any = null;
try { ImageManipulator = require('expo-image-manipulator'); } catch {}

export async function ensureImagesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
}

// Extract filename from a Supabase photo URL
function remoteFileName(url: string): string | null {
  const part = url.split(SUPABASE_PUBLIC)[1];
  return part ? decodeURIComponent(part) : null;
}

// Returns converted JPEG uri, original uri (non-HEIC), or null (HEIC that failed)
async function prepareUri(uri: string): Promise<string | null> {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'heic' && ext !== 'heif') return uri;
  if (!ImageManipulator) return null;
  try {
    const r = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return r.uri;
  } catch {
    return null;
  }
}

export async function saveImage(issueId: string, sourceUri: string, _file?: unknown): Promise<string> {
  await ensureImagesDir();
  const src = (await prepareUri(sourceUri)) ?? sourceUri;
  const ext = src.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const dest = IMAGES_DIR + `${issueId}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: src, to: dest });
  return dest;
}

export async function deleteImage(uri: string): Promise<void> {
  try {
    if (uri.startsWith('https://')) {
      // Delete from Supabase
      const fileName = remoteFileName(uri);
      if (fileName) await supabase.storage.from('photos').remove([fileName]);
      // Also delete the local backup file (same filename)
      const localPath = IMAGES_DIR + fileName;
      const info = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }));
      if (info.exists) await FileSystem.deleteAsync(localPath, { idempotent: true });
    } else {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch {}
}

export async function downloadPhoto(uri: string): Promise<void> {
  let localUri = uri;
  if (uri.startsWith('https://')) {
    const fileName = uri.split('/').pop()?.split('?')[0] || `photo_${Date.now()}.jpg`;
    const dest = (FileSystem.cacheDirectory ?? '') + fileName;
    const { uri: downloaded } = await FileSystem.downloadAsync(uri, dest);
    localUri = downloaded;
  }
  let Sharing: any;
  try { Sharing = require('expo-sharing'); } catch { return; }
  const canShare = await Sharing.isAvailableAsync();
  if (canShare) await Sharing.shareAsync(localUri, { dialogTitle: 'Save Photo' });
}

export async function readAsBase64(uri: string): Promise<string | null> {
  try {
    if (uri.startsWith('https://')) {
      const tempPath = (FileSystem.cacheDirectory ?? '') + `tmp_${Date.now()}.jpg`;
      const { uri: localUri } = await FileSystem.downloadAsync(uri, tempPath);
      const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' as any });
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      return b64;
    }
    return await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
  } catch { return null; }
}

// Upload a local file to Supabase using its own filename so we can always map back
async function uploadFile(localPath: string): Promise<string | null> {
  const src = await prepareUri(localPath);
  if (src === null) return null; // HEIC that couldn't be converted

  const rawExt = src.split('?')[0].split('/').pop()?.split('.').pop()?.toLowerCase() ?? 'jpg';
  const ext = rawExt === 'jpg' ? 'jpeg' : rawExt === 'heic' || rawExt === 'heif' ? 'jpeg' : rawExt;
  const localName = localPath.split('/').pop() ?? `${Date.now()}.${ext}`;
  // Use the same base name but with correct extension (handles HEIC→jpg conversion)
  const fileName = localName.replace(/\.(heic|heif)$/i, '.jpg');
  const contentType = `image/${ext}`;

  const base64 = await FileSystem.readAsStringAsync(src, { encoding: 'base64' as any });
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const { error } = await supabase.storage.from('photos').upload(fileName, bytes, { contentType, upsert: true });
  if (error) throw new Error(error.message);
  return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
}

export async function uploadLocalPhotos(units: Record<string, any>): Promise<{ units: Record<string, any>; updated: boolean; status: string }> {
  let updated = false;
  let localFound = 0, uploaded = 0, skippedMissing = 0, skippedHeic = 0, failed = 0;
  const errors: string[] = [];
  const result = JSON.parse(JSON.stringify(units));

  const upload = async (uri: string): Promise<string> => {
    if (!uri || uri.startsWith('https://')) return uri;
    localFound++;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) { skippedMissing++; return uri; }

      const url = await uploadFile(uri);
      if (url === null) { skippedHeic++; return uri; }

      uploaded++;
      updated = true;
      return url;
    } catch (e: any) {
      failed++;
      const msg = e?.message ?? String(e);
      errors.push(msg);
      console.warn('Photo upload failed:', uri, msg);
      return uri;
    }
  };

  for (const unit of Object.values(result) as any[]) {
    for (const comp of Object.values(unit.components) as any[]) {
      if (comp.issues) comp.issues = await Promise.all(comp.issues.map(async (iss: any) => ({
        ...iss, images: iss.images ? await Promise.all(iss.images.map(upload)) : undefined,
      })));
      if (comp.progressImages) comp.progressImages = await Promise.all(comp.progressImages.map(upload));
      if (comp.goodImages) comp.goodImages = await Promise.all(comp.goodImages.map(upload));
    }
    for (const item of (unit.miscEquipment ?? []) as any[]) {
      if (item.issues) item.issues = await Promise.all(item.issues.map(async (iss: any) => ({
        ...iss, images: iss.images ? await Promise.all(iss.images.map(upload)) : undefined,
      })));
      if (item.progressImages) item.progressImages = await Promise.all(item.progressImages.map(upload));
      if (item.goodImages) item.goodImages = await Promise.all(item.goodImages.map(upload));
    }
  }

  if (localFound === 0) return { units: result, updated: false, status: '' };

  const parts: string[] = [];
  parts.push(`${localFound} local photo(s) found`);
  if (uploaded > 0) parts.push(`${uploaded} uploaded`);
  if (skippedHeic > 0) parts.push(`${skippedHeic} HEIC unconverted`);
  if (skippedMissing > 0) parts.push(`${skippedMissing} missing`);
  if (failed > 0) parts.push(`${failed} failed: ${errors[0] ?? ''}`);

  return { units: result, updated, status: parts.join(' | ') };
}

export async function downloadPhotosToDevice(units: Record<string, any>): Promise<{ downloaded: number; status: string }> {
  await ensureImagesDir();
  const allUrls = new Set<string>();
  for (const unit of Object.values(units) as any[]) {
    for (const comp of Object.values(unit.components) as any[]) {
      (comp.issues ?? []).forEach((i: any) => (i.images ?? []).forEach((u: string) => allUrls.add(u)));
      (comp.progressImages ?? []).forEach((u: string) => allUrls.add(u));
      (comp.goodImages ?? []).forEach((u: string) => allUrls.add(u));
    }
    for (const item of (unit.miscEquipment ?? []) as any[]) {
      (item.issues ?? []).forEach((i: any) => (i.images ?? []).forEach((u: string) => allUrls.add(u)));
      (item.progressImages ?? []).forEach((u: string) => allUrls.add(u));
      (item.goodImages ?? []).forEach((u: string) => allUrls.add(u));
    }
  }

  const remoteUrls = [...allUrls].filter(u => u?.startsWith('https://'));
  let downloaded = 0;
  for (const url of remoteUrls) {
    const fileName = remoteFileName(url);
    if (!fileName) continue;
    const localPath = IMAGES_DIR + fileName;
    const info = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }));
    if (info.exists) continue;
    try { await FileSystem.downloadAsync(url, localPath); downloaded++; } catch {}
  }
  return { downloaded, status: downloaded > 0 ? `${downloaded} photo(s) downloaded to device` : '' };
}

// Verify all https:// photos still exist in Supabase; re-upload from local if missing
export async function verifyAndRepairPhotos(units: Record<string, any>): Promise<{ units: Record<string, any>; repaired: number; dropped: number; status: string }> {
  const result = JSON.parse(JSON.stringify(units));
  let repaired = 0;

  // Collect all unique remote filenames
  const allUrls = new Set<string>();
  for (const unit of Object.values(result) as any[]) {
    for (const comp of Object.values(unit.components) as any[]) {
      (comp.issues ?? []).forEach((i: any) => (i.images ?? []).forEach((u: string) => allUrls.add(u)));
      (comp.progressImages ?? []).forEach((u: string) => allUrls.add(u));
      (comp.goodImages ?? []).forEach((u: string) => allUrls.add(u));
    }
    for (const item of (unit.miscEquipment ?? []) as any[]) {
      (item.issues ?? []).forEach((i: any) => (i.images ?? []).forEach((u: string) => allUrls.add(u)));
      (item.progressImages ?? []).forEach((u: string) => allUrls.add(u));
      (item.goodImages ?? []).forEach((u: string) => allUrls.add(u));
    }
  }

  const remoteUrls = [...allUrls].filter(u => u?.startsWith('https://'));
  if (remoteUrls.length === 0) return { units: result, repaired: 0, dropped: 0, status: '' };

  // Get list of files currently in Supabase
  const { data: existing, error: listError } = await supabase.storage.from('photos').list('', { limit: 1000 });
  // If the list call fails, bail out — better to keep stale refs than to drop valid ones
  if (listError || !existing) return { units: result, repaired: 0, dropped: 0, status: '' };
  const existingNames = new Set(existing.map(f => f.name));

  // Find missing ones we can repair from local
  const missingUrls = remoteUrls.filter(u => {
    const name = remoteFileName(u);
    return name && !existingNames.has(name);
  });

  if (missingUrls.length === 0) return { units: result, repaired: 0, dropped: 0, status: `${remoteUrls.length} cloud photo(s) confirmed` };

  // Build a URL→newURL map for repaired photos, and a drop set for unrecoverable ones
  const repairMap = new Map<string, string>();
  const dropSet = new Set<string>();
  for (const url of missingUrls) {
    const fileName = remoteFileName(url);
    if (!fileName) { dropSet.add(url); continue; }
    const localPath = IMAGES_DIR + fileName;
    const info = await FileSystem.getInfoAsync(localPath).catch(() => ({ exists: false }));
    if (!info.exists) { dropSet.add(url); continue; } // gone from Supabase AND device — drop it
    try {
      const newUrl = await uploadFile(localPath);
      if (newUrl) { repairMap.set(url, newUrl); repaired++; }
      else dropSet.add(url);
    } catch { dropSet.add(url); }
  }

  if (repairMap.size === 0 && dropSet.size === 0) return { units: result, repaired: 0, dropped: 0, status: '' };

  // Apply repairs and drop unrecoverable stale URLs
  const fix = (u: string): string | null => {
    if (repairMap.has(u)) return repairMap.get(u)!;
    if (dropSet.has(u)) return null;
    return u;
  };
  const applyFix = (arr: string[]): string[] | undefined => {
    const out = arr.map(fix).filter((u): u is string => u !== null);
    return out.length ? out : undefined;
  };
  for (const unit of Object.values(result) as any[]) {
    for (const comp of Object.values(unit.components) as any[]) {
      (comp.issues ?? []).forEach((i: any) => { if (i.images) i.images = applyFix(i.images) ?? []; });
      if (comp.progressImages) comp.progressImages = applyFix(comp.progressImages);
      if (comp.goodImages) comp.goodImages = applyFix(comp.goodImages);
    }
    for (const item of (unit.miscEquipment ?? []) as any[]) {
      (item.issues ?? []).forEach((i: any) => { if (i.images) i.images = applyFix(i.images) ?? []; });
      if (item.progressImages) item.progressImages = applyFix(item.progressImages);
      if (item.goodImages) item.goodImages = applyFix(item.goodImages);
    }
  }

  const parts: string[] = [];
  if (repaired > 0) parts.push(`${repaired} photo(s) restored from device`);
  if (dropSet.size > 0) parts.push(`${dropSet.size} stale photo ref(s) removed`);
  return { units: result, repaired, dropped: dropSet.size, status: parts.join(' | ') };
}
