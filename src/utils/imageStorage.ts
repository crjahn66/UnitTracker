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

// Convert HEIC/HEIF → JPEG. Returns uri unchanged for other formats, null if conversion fails.
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

// Resize to max 1600px and compress to 0.8 quality before uploading.
// Phone cameras produce 3–10 MB files; this brings them to ~150–400 KB
// without visible quality loss for issue-tracking purposes.
const MAX_UPLOAD_DIM = 1600;
const UPLOAD_QUALITY = 0.8;

async function compressForUpload(uri: string): Promise<string> {
  if (!ImageManipulator) return uri;
  try {
    const r = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: MAX_UPLOAD_DIM } }],
      { compress: UPLOAD_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );
    return r.uri;
  } catch {
    return uri;
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

export async function readResizedBase64(uri: string, maxDim = 400, quality = 0.65): Promise<string | null> {
  try {
    let localUri = uri;
    const isRemote = uri.startsWith('https://');
    if (isRemote) {
      const tempPath = (FileSystem.cacheDirectory ?? '') + `tmp_resize_${Date.now()}.jpg`;
      const { uri: dl } = await FileSystem.downloadAsync(uri, tempPath);
      localUri = dl;
    }
    if (ImageManipulator) {
      const r = await ImageManipulator.manipulateAsync(
        localUri,
        [{ resize: { width: maxDim } }],
        { compress: quality, format: ImageManipulator.SaveFormat.JPEG },
      );
      const b64 = await FileSystem.readAsStringAsync(r.uri, { encoding: 'base64' as any });
      await FileSystem.deleteAsync(r.uri, { idempotent: true }).catch(() => {});
      if (isRemote) await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
      return b64;
    }
    const b64 = await FileSystem.readAsStringAsync(localUri, { encoding: 'base64' as any });
    if (isRemote) await FileSystem.deleteAsync(localUri, { idempotent: true }).catch(() => {});
    return b64;
  } catch { return readAsBase64(uri); }
}

// Upload a local file to Supabase using its own filename so we can always map back
async function uploadFile(localPath: string): Promise<string | null> {
  const converted = await prepareUri(localPath);
  if (converted === null) return null; // HEIC that couldn't be converted

  const compressed = await compressForUpload(converted);

  const rawExt = compressed.split('?')[0].split('/').pop()?.split('.').pop()?.toLowerCase() ?? 'jpg';
  const ext = rawExt === 'jpg' ? 'jpeg' : rawExt === 'heic' || rawExt === 'heif' ? 'jpeg' : rawExt;
  const localName = localPath.split('/').pop() ?? `${Date.now()}.${ext}`;
  const fileName = localName.replace(/\.(heic|heif)$/i, '.jpg');
  const contentType = `image/${ext}`;

  const base64 = await FileSystem.readAsStringAsync(compressed, { encoding: 'base64' as any });
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

  const upload = async (uri: string): Promise<string | null> => {
    if (!uri || uri.startsWith('https://')) return uri;
    localFound++;

    // base64 data URI — decode, write to a temp file, then upload via normal path
    if (uri.startsWith('data:')) {
      try {
        const match = uri.match(/^data:([^;]+);base64,(.+)$/s);
        if (!match) { failed++; errors.push('Unparseable data URI'); return uri; }
        const ext = match[1] === 'image/png' ? 'png' : 'jpg';
        const tmpPath = IMAGES_DIR + `datauri_${Date.now()}.${ext}`;
        await ensureImagesDir();
        await FileSystem.writeAsStringAsync(tmpPath, match[2], { encoding: 'base64' as any });
        const url = await uploadFile(tmpPath);
        await FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => {});
        if (!url) { skippedHeic++; return uri; }
        uploaded++;
        updated = true;
        return url;
      } catch (e: any) {
        failed++;
        errors.push(e?.message ?? String(e));
        console.warn('base64 photo upload failed:', e?.message);
        return uri;
      }
    }

    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) {
        // File was deleted (reinstall, storage clear, etc.) — drop the dead reference
        skippedMissing++;
        updated = true;
        return null;
      }

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

  const compact = (arr: (string | null)[]): string[] => arr.filter((u): u is string => u !== null);

  for (const unit of Object.values(result) as any[]) {
    for (const comp of Object.values(unit.components) as any[]) {
      if (comp.issues) comp.issues = await Promise.all(comp.issues.map(async (iss: any) => ({
        ...iss, images: iss.images ? compact(await Promise.all(iss.images.map(upload))) : undefined,
      })));
      if (comp.progressImages) comp.progressImages = compact(await Promise.all(comp.progressImages.map(upload)));
      if (comp.goodImages) comp.goodImages = compact(await Promise.all(comp.goodImages.map(upload)));
    }
    for (const item of (unit.miscEquipment ?? []) as any[]) {
      if (item.issues) item.issues = await Promise.all(item.issues.map(async (iss: any) => ({
        ...iss, images: iss.images ? compact(await Promise.all(iss.images.map(upload))) : undefined,
      })));
      if (item.progressImages) item.progressImages = compact(await Promise.all(item.progressImages.map(upload)));
      if (item.goodImages) item.goodImages = compact(await Promise.all(item.goodImages.map(upload)));
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

