import * as FileSystem from 'expo-file-system/legacy';

const IMAGES_DIR = (FileSystem.documentDirectory ?? '') + 'issue_images/';

export async function ensureImagesDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(IMAGES_DIR);
  if (!info.exists) await FileSystem.makeDirectoryAsync(IMAGES_DIR, { intermediates: true });
}

export async function saveImage(issueId: string, sourceUri: string): Promise<string> {
  await ensureImagesDir();
  const ext = sourceUri.split('.').pop()?.toLowerCase() ?? 'jpg';
  const dest = IMAGES_DIR + `${issueId}_${Date.now()}.${ext}`;
  await FileSystem.copyAsync({ from: sourceUri, to: dest });
  return dest;
}

export async function deleteImage(filePath: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (info.exists) await FileSystem.deleteAsync(filePath, { idempotent: true });
  } catch { /* ignore */ }
}

export async function readAsBase64(filePath: string): Promise<string | null> {
  try {
    return await FileSystem.readAsStringAsync(filePath, { encoding: 'base64' as any });
  } catch { return null; }
}
