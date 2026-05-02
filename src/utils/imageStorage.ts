import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const IMAGES_DIR = (FileSystem.documentDirectory ?? '') + 'issue_images/';

export async function ensureImagesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
}

export async function saveImage(issueId: string, sourceUri: string): Promise<string> {
  const ext = (sourceUri.split('.').pop()?.split('?')[0]?.toLowerCase() ?? 'jpg').slice(0, 4);
  const fileName = `${issueId}_${Date.now()}.${ext}`;
  const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;

  const response = await fetch(sourceUri);
  const arrayBuffer = await response.arrayBuffer();

  const { error } = await supabase.storage
    .from('photos')
    .upload(fileName, arrayBuffer, { contentType });

  if (error) throw error;

  const { data } = supabase.storage.from('photos').getPublicUrl(fileName);
  return data.publicUrl;
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
