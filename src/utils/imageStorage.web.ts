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

// Resize to max 1600px and compress to 0.8 quality using canvas.
// Falls back to original blob if canvas is unavailable or fails.
const MAX_UPLOAD_DIM = 1600;
const UPLOAD_QUALITY = 0.8;

async function compressBlob(blob: Blob): Promise<Blob> {
  try {
    const blobUrl = URL.createObjectURL(blob);
    const compressed = await new Promise<Blob | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(blobUrl);
        const scale = Math.min(1, MAX_UPLOAD_DIM / img.width, MAX_UPLOAD_DIM / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob((b) => resolve(b), 'image/jpeg', UPLOAD_QUALITY);
      };
      img.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(null); };
      img.src = blobUrl;
    });
    return compressed ?? blob;
  } catch {
    return blob;
  }
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

  blob = await compressBlob(blob);

  const mimeType = 'image/jpeg';
  const fileName = `${issueId}_${Date.now()}.jpg`;

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
  let updated = false;
  let uploaded = 0, failed = 0;
  const result = JSON.parse(JSON.stringify(units));

  const upload = async (uri: string): Promise<string> => {
    if (!uri || uri.startsWith('https://')) return uri;
    // Only handle base64 data URIs on web — file:// paths don't exist here
    if (!uri.startsWith('data:')) return uri;
    try {
      const match = uri.match(/^data:([^;]+);base64,(.+)$/s);
      if (!match) return uri;
      const mimeType = match[1];
      const ext = mimeType === 'image/png' ? 'png' : 'jpg';
      const fileName = `datauri_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
      const { error } = await supabase.storage.from('photos').upload(fileName, bytes, { contentType: mimeType, upsert: false });
      if (error) throw error;
      uploaded++;
      updated = true;
      return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
    } catch (e: any) {
      failed++;
      console.warn('[web] base64 photo upload failed:', e?.message);
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

  const status = uploaded > 0 ? `${uploaded} base64 photo(s) uploaded to storage` : '';
  return { units: result, updated, status };
}

export async function downloadPhotosToDevice(_units: Record<string, any>): Promise<{ downloaded: number; status: string }> {
  return { downloaded: 0, status: '' };
}

