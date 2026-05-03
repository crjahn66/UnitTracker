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

async function convertToJpeg(uri: string): Promise<string> {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const result = await ImageManipulator.manipulateAsync(uri, [], {
      compress: 0.9,
      format: ImageManipulator.SaveFormat.JPEG,
    });
    return result.uri;
  } catch {
    return uri; // conversion failed — use original, upload will proceed
  }
}

export async function saveImage(issueId: string, sourceUri: string, _file?: unknown): Promise<string> {
  await ensureImagesDir();
  let src = sourceUri;
  if (isHeic(src)) src = await convertToJpeg(src);
  const ext = src.split('.').pop()?.toLowerCase() ?? 'jpg';
  const dest = IMAGES_DIR + `${issueId}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: src, to: dest });
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

export async function uploadLocalPhotos(units: Record<string, any>): Promise<{ units: Record<string, any>; updated: boolean }> {
  let updated = false;
  const result = JSON.parse(JSON.stringify(units));

  const upload = async (uri: string): Promise<string> => {
    if (!uri || uri.startsWith('https://')) return uri;
    try {
      const info = await FileSystem.getInfoAsync(uri);
      if (!info.exists) return uri; // file missing — skip silently, keep existing path

      const src = isHeic(uri) ? await convertToJpeg(uri) : uri;
      const ext = (src.split('.').pop()?.toLowerCase() ?? 'jpg').slice(0, 4);
      const fileName = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
      const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

      const base64 = await FileSystem.readAsStringAsync(src, { encoding: 'base64' as any });
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

      const { error } = await supabase.storage.from('photos').upload(fileName, bytes, { contentType, upsert: false });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      updated = true;
      return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
    } catch (e) {
      console.warn('Photo upload skipped:', uri, e);
      return uri; // keep local path, will retry on next sync
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

  return { units: result, updated };
}
