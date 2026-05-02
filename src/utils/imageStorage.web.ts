import { supabase } from './supabase';

export async function ensureImagesDir(): Promise<void> {}

export async function saveImage(issueId: string, sourceUri: string, file?: File): Promise<string> {
  let blob: Blob;
  if (file) {
    blob = file;
  } else {
    const response = await fetch(sourceUri);
    blob = await response.blob();
  }

  const mimeType = blob.type || 'image/jpeg';
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg').replace('jpg', 'jpg') ?? 'jpg';
  const fileName = `${issueId}_${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('photos').upload(fileName, blob, { contentType: mimeType });
  if (error) throw error;

  return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
}

export async function deleteImage(uri: string): Promise<void> {
  try {
    if (uri.startsWith('https://')) {
      const fileName = uri.split('/storage/v1/object/public/photos/')[1];
      if (fileName) await supabase.storage.from('photos').remove([decodeURIComponent(fileName)]);
    }
  } catch { /* ignore */ }
}

export async function readAsBase64(uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

export async function uploadLocalPhotos(units: Record<string, any>): Promise<{ units: Record<string, any>; updated: boolean }> {
  return { units, updated: false };
}
