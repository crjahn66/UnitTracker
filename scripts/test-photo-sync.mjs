import { createClient } from '@supabase/supabase-js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const TEMP_DIR = '/data/data/com.termux/files/home/UnitTracker/scripts/tmp_photos';

async function main() {
  const { data, error } = await supabase.from('sync_state').select('units, general_issues, updated_at').eq('id', 1).single();
  if (error) { console.error('sync_state fetch failed:', error.message); process.exit(1); }

  console.log('=== sync_state structure (photo locations) ===');
  const units = data.units ?? {};
  for (const [uid, unit] of Object.entries(units)) {
    for (const [compKey, comp] of Object.entries(unit.components ?? {})) {
      for (const issue of (comp.issues ?? [])) {
        if (issue.images?.length) {
          console.log(`Unit: ${uid} | Component: ${compKey} | Issue: ${issue.id}`);
          issue.images.forEach(u => console.log(`  -> ${u}`));
        }
      }
      if (comp.progressImages?.length) console.log(`Unit: ${uid} | Component: ${compKey} | progressImages:`, comp.progressImages);
      if (comp.goodImages?.length) console.log(`Unit: ${uid} | Component: ${compKey} | goodImages:`, comp.goodImages);
    }
    for (const item of (unit.miscEquipment ?? [])) {
      for (const issue of (item.issues ?? [])) {
        if (issue.images?.length) {
          console.log(`Unit: ${uid} | MiscEquip: ${item.label} | Issue: ${issue.id}`);
          issue.images.forEach(u => console.log(`  -> ${u}`));
        }
      }
    }
  }

  console.log('\n=== Bucket files NOT in sync_state ===');
  const { data: files } = await supabase.storage.from('photos').list('', { limit: 1000 });
  const allSyncUrls = JSON.stringify(data);
  for (const f of (files ?? [])) {
    if (f.name === '.emptyFolderPlaceholder') continue;
    const inSync = allSyncUrls.includes(f.name);
    if (!inSync) {
      const url = `${SUPABASE_URL}/storage/v1/object/public/photos/${f.name}`;
      console.log(`  ORPHAN: ${f.name}`);
    }
  }

  console.log('\n=== Download all bucket photos to temp dir ===');
  if (!existsSync(TEMP_DIR)) mkdirSync(TEMP_DIR, { recursive: true });
  for (const f of (files ?? [])) {
    if (f.name === '.emptyFolderPlaceholder') continue;
    const url = `${SUPABASE_URL}/storage/v1/object/public/photos/${f.name}`;
    const dest = join(TEMP_DIR, f.name);
    try {
      const resp = await fetch(url);
      if (!resp.ok) { console.log(`  ✗ HTTP ${resp.status} ${f.name}`); continue; }
      const buf = await resp.arrayBuffer();
      writeFileSync(dest, Buffer.from(buf));
      console.log(`  ✓ ${f.name} (${(buf.byteLength/1024).toFixed(1)} KB)`);
    } catch (e) { console.log(`  ✗ ${f.name}:`, e.message); }
  }
}

main().catch(console.error);
