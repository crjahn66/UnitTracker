/**
 * One-shot migration: find any data: base64 image URIs in sync_state,
 * upload them to Supabase Storage, and replace them with https:// URLs.
 * Run from the project root: node scripts/migrate-base64-photos.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function parseDataUri(uri) {
  const match = uri.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return null;
  return { mimeType: match[1], base64: match[2] };
}

async function uploadBase64(base64, mimeType) {
  const ext = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'jpg';
  const fileName = `migrated_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const bytes = Buffer.from(base64, 'base64');
  const { error } = await supabase.storage.from('photos').upload(fileName, bytes, { contentType: mimeType, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  return supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
}

function walkAndFix(obj, fixes) {
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => walkAndFix(item, fixes)));
  }
  if (obj && typeof obj === 'object') {
    return Promise.all(Object.entries(obj).map(async ([key, val]) => {
      if (key === 'images' && Array.isArray(val)) {
        obj[key] = await Promise.all(val.map(async (uri) => {
          if (typeof uri === 'string' && uri.startsWith('data:')) {
            const parsed = parseDataUri(uri);
            if (!parsed) { console.warn('  Unparseable data URI, skipping'); return uri; }
            console.log(`  Uploading base64 (${(uri.length / 1024).toFixed(0)} KB, ${parsed.mimeType})...`);
            const url = await uploadBase64(parsed.base64, parsed.mimeType);
            fixes.push({ from: uri.slice(0, 40) + '...', to: url });
            console.log(`  → ${url}`);
            return url;
          }
          return uri;
        }));
      } else {
        await walkAndFix(val, fixes);
      }
    }));
  }
}

async function main() {
  console.log('Fetching sync_state...');
  const { data: rows, error } = await supabase
    .from('sync_state')
    .select('units, general_issues')
    .eq('id', 1)
    .single();
  if (error) { console.error('Fetch failed:', error.message); process.exit(1); }

  const units = rows.units ?? {};
  const generalIssues = rows.general_issues ?? [];
  const fixes = [];

  console.log('Scanning for base64 image URIs...');
  await walkAndFix(units, fixes);
  await walkAndFix(generalIssues, fixes);

  if (fixes.length === 0) {
    console.log('No base64 images found — nothing to migrate.');
    return;
  }

  console.log(`\nMigrated ${fixes.length} image(s). Pushing cleaned state...`);
  const now = new Date().toISOString();
  const { error: pushError } = await supabase
    .from('sync_state')
    .update({ units, general_issues: generalIssues, updated_at: now })
    .eq('id', 1);

  if (pushError) { console.error('Push failed:', pushError.message); process.exit(1); }
  console.log('Done. sync_state updated at', now);
}

main().catch(e => { console.error(e); process.exit(1); });
