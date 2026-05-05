import { supabase } from './supabase';

export async function ensureImagesDir(): Promise<void> {}

function isHeicBlob(blob: Blob): boolean {
  return blob.type === 'image/heic' || blob.type === 'image/heif';
}

function isHeicFile(file: File): boolean {
  if (isHeicBlob(file)) return true;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return ext === 'heic' || ext === 'heif';
}

async function convertHeicToJpeg(blob: Blob): Promise<Blob> {
  const heic2any = (await import('heic2any')).default;
  const result = await heic2any({ blob, toType: 'image/jpeg', quality: 0.9 });
  return Array.isArray(result) ? result[0] : result;
}

export async function saveImage(issueId: string, sourceUri: string, file?: File): Promise<string> {
  let blob: Blob;
  if (file) {
    blob = isHeicFile(file) ? await convertHeicToJpeg(file) : file;
  } else {
    const response = await fetch(sourceUri);
    const raw = await response.blob();
    blob = isHeicBlob(raw) ? await convertHeicToJpeg(raw) : raw;
  }

  const mimeType = blob.type || 'image/jpeg';
  const ext = mimeType === 'image/jpeg' ? 'jpg' : (mimeType.split('/')[1] ?? 'jpg');
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

export async function downloadPhoto(uri: string): Promise<void> {
  const response = await fetch(uri);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = uri.split('/').pop()?.split('?')[0] || 'photo.jpg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function readAsBase64(uri: string): Promise<string | null> {
  try {
    const response = await fetch(uri);
    if (!response.ok) return null;
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1] ?? null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

// Download blob, read raw base64 as reliable baseline, then try canvas resize.
// Returns resized JPEG if canvas works, raw base64 otherwise — never silently drops.
export async function readResizedBase64(uri: string, maxDim = 400, quality = 0.65): Promise<string | null> {
  let blob: Blob | null = null;

  // 1. Supabase SDK download (handles CORS on the API endpoint)
  try {
    const SUPABASE_PUBLIC = '/storage/v1/object/public/photos/';
    const part = uri.split(SUPABASE_PUBLIC)[1];
    if (part) {
      const fileName = decodeURIComponent(part.split('?')[0]);
      const { data, error } = await supabase.storage.from('photos').download(fileName);
      if (error) console.warn('[photos] SDK download error:', error.message);
      else if (data) blob = data;
    }
  } catch (e) { console.warn('[photos] SDK download threw:', e); }

  // 2. Fetch fallback
  if (!blob) {
    try {
      const res = await fetch(uri);
      if (res.ok) blob = await res.blob();
      else console.warn('[photos] fetch failed:', res.status, uri);
    } catch (e) { console.warn('[photos] fetch threw:', e); }
  }

  if (!blob) { console.warn('[photos] could not obtain blob for:', uri); return null; }

  // 3. Read raw base64 via FileReader — always works once we have a blob
  const rawBase64 = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob!);
  });
  if (!rawBase64) return null;

  // 4. Try canvas resize using blob URL (same-origin — canvas never tainted)
  try {
    const blobUrl = URL.createObjectURL(blob);
    const resized = await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const scale = Math.min(1, maxDim / img.width, maxDim / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, w, h);
        try { resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1] ?? null); }
        catch (e) { console.warn('[photos] toDataURL threw:', e); resolve(null); }
      };
      img.onerror = (e) => { URL.revokeObjectURL(blobUrl); console.warn('[photos] img load failed:', e); resolve(null); };
      img.src = blobUrl;
    });
    if (resized) return resized;
  } catch (e) { console.warn('[photos] canvas resize threw:', e); }

  // 5. Return raw (unresized) — at least the photo gets embedded
  return rawBase64;
}

export async function uploadLocalPhotos(units: Record<string, any>): Promise<{ units: Record<string, any>; updated: boolean; status: string }> {
  return { units, updated: false, status: '' };
}

export async function downloadPhotosToDevice(_units: Record<string, any>): Promise<{ downloaded: number; status: string }> {
  return { downloaded: 0, status: '' };
}

export async function verifyAndRepairPhotos(units: Record<string, any>): Promise<{ units: Record<string, any>; repaired: number; dropped: number; status: string }> {
  const result = JSON.parse(JSON.stringify(units));
  const SUPABASE_PUBLIC = '/storage/v1/object/public/photos/';
  const remoteFileName = (url: string): string | null => {
    const part = url.split(SUPABASE_PUBLIC)[1];
    return part ? decodeURIComponent(part) : null;
  };

  // Collect all https:// URLs in the store
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

  // Check which files actually exist in the bucket
  const { data: existing, error: listError } = await supabase.storage.from('photos').list('', { limit: 1000 });
  // Bail if list fails or is full (>= 1000 means results may be truncated — don't risk dropping valid refs)
  if (listError || !existing || existing.length >= 1000) return { units: result, repaired: 0, dropped: 0, status: '' };
  const existingNames = new Set(existing.map((f: any) => f.name));

  const dropSet = new Set<string>();
  for (const url of remoteUrls) {
    const name = remoteFileName(url);
    if (!name || !existingNames.has(name)) dropSet.add(url);
  }

  if (dropSet.size === 0) return { units: result, repaired: 0, dropped: 0, status: `${remoteUrls.length} cloud photo(s) confirmed` };

  // Drop stale refs (web can't repair from local files)
  const applyFix = (arr: string[]): string[] | undefined => {
    const out = arr.filter(u => !dropSet.has(u));
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

  return { units: result, repaired: 0, dropped: dropSet.size, status: `${dropSet.size} stale photo ref(s) removed` };
}
