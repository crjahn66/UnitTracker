import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const IMAGES_DIR = (FileSystem.documentDirectory ?? '') + 'issue_images/';

export async function ensureImagesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
}

function isHeic(uri: string): boolean {
  const ext = uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  return ext === 'heic' || ext === 'heif';
}

// Convert a HEIC file (given as base64) to JPEG bytes using pure JS.
// Returns null if conversion fails.
async function heicBase64ToJpeg(base64: string): Promise<Uint8Array | null> {
  try {
    const heicDecode = require('heic-decode');
    const jpegJs = require('jpeg-js');

    const binaryStr = atob(base64);
    const heicBytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) heicBytes[i] = binaryStr.charCodeAt(i);

    const images = await heicDecode.all({ buffer: heicBytes.buffer });
    if (!images?.length) return null;
    const { width, height, data } = await images[0].decode();
    const encoded = jpegJs.encode({ width, height, data }, 85);
    return new Uint8Array(encoded.data);
  } catch {
    return null;
  }
}

export async function saveImage(issueId: string, sourceUri: string, _file?: unknown): Promise<string> {
  await ensureImagesDir();

  if (isHeic(sourceUri)) {
    try {
      const b64 = await FileSystem.readAsStringAsync(sourceUri, { encoding: 'base64' as any });
      const jpegBytes = await heicBase64ToJpeg(b64);
      if (jpegBytes) {
        const dest = IMAGES_DIR + `${issueId}_${Date.now()}.jpg`;
        await FileSystem.writeAsStringAsync(dest, btoa(String.fromCharCode(...jpegBytes)), { encoding: 'base64' as any });
        return dest;
      }
    } catch { /* fall through to copy original */ }
  }

  const ext = sourceUri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg';
  const dest = IMAGES_DIR + `${issueId}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function deleteImage(uri: string): Promise<void> {
  try {
    if (uri.startsWith('https://')) {
      const fileName = uri.split('/storage/v1/object/public/photos/')[1];
      if (fileName) await supabase.storage.from('photos').remove([decodeURIComponent(fileName)]);
    } else {
      const info = await FileSystem.getInfoAsync(uri);
      if (info.exists) await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch { /* ignore */ }
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

export async function uploadLocalPhotos(units: Record<string, any>): Promise<{ units: Record<string, any>; updated: boolean; heicFailed: number }> {
  let updated = false;
  let heicFailed = 0;
  const result = JSON.parse(JSON.stringify(units));

  const upload = async (uri: string): Promise<string> => {
    if (!uri || uri.startsWith('https://')) return uri;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return uri;

      let bytes: Uint8Array;
      let ext: string;
      let contentType: string;

      if (isHeic(uri)) {
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
        const jpegBytes = await heicBase64ToJpeg(b64);
        if (!jpegBytes) { heicFailed++; return uri; }
        bytes = jpegBytes;
        ext = 'jpg';
        contentType = 'image/jpeg';
      } else {
        ext = (uri.split('?')[0].split('.').pop()?.toLowerCase() ?? 'jpg').slice(0, 4);
        contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        const b64 = await FileSystem.readAsStringAsync(uri, { encoding: 'base64' as any });
        const binaryStr = atob(b64);
        bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      }

      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const { error } = await supabase.storage.from('photos').upload(fileName, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      updated = true;
      return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
    } catch (e) {
      console.warn('Photo upload skipped:', uri, e);
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

  return { units: result, updated, heicFailed };
}
