import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function collectPhotos(units) {
  const found = [];
  for (const [uid, unit] of Object.entries(units ?? {})) {
    for (const [ck, comp] of Object.entries(unit.components ?? {})) {
      for (const issue of (comp.issues ?? [])) {
        for (const url of (issue.images ?? [])) {
          found.push({ where: `unit ${uid} / ${ck} / issue ${issue.id}`, url });
        }
      }
      for (const url of (comp.progressImages ?? [])) found.push({ where: `unit ${uid} / ${ck} / progressImages`, url });
      for (const url of (comp.goodImages ?? [])) found.push({ where: `unit ${uid} / ${ck} / goodImages`, url });
    }
    for (const item of (unit.miscEquipment ?? [])) {
      for (const issue of (item.issues ?? [])) {
        for (const url of (issue.images ?? [])) found.push({ where: `unit ${uid} / misc ${item.id} / issue`, url });
      }
    }
  }
  return found;
}

async function main() {
  console.log('Fetching sync_state...');
  const { data, error } = await supabase
    .from('sync_state')
    .select('updated_at, units')
    .eq('id', 1)
    .single();

  if (error) { console.error('ERROR fetching sync_state:', error.message); return; }
  console.log('sync_state.updated_at:', data.updated_at);

  const photos = collectPhotos(data.units);
  console.log(`\nTotal photo refs in sync_state: ${photos.length}`);
  for (const p of photos) {
    const isRemote = p.url?.startsWith('https://');
    const isLocal = p.url && !isRemote;
    console.log(`  [${isLocal ? 'LOCAL PATH - NOT SYNCED' : 'https url'}] ${p.where}`);
    console.log(`    ${p.url}`);
  }

  if (photos.length > 0) {
    console.log('\nChecking bucket for these files...');
    const { data: bucketFiles, error: listErr } = await supabase.storage.from('photos').list('', { limit: 1000 });
    if (listErr) { console.error('Bucket list error:', listErr.message); }
    else {
      const existingNames = new Set(bucketFiles.map(f => f.name));
      console.log(`Bucket has ${bucketFiles.length} files`);
      for (const p of photos.filter(p => p.url?.startsWith('https://'))) {
        const part = p.url.split('/storage/v1/object/public/photos/')[1];
        const name = part ? decodeURIComponent(part) : null;
        const exists = name ? existingNames.has(name) : false;
        console.log(`  ${exists ? '✓ EXISTS' : '✗ MISSING IN BUCKET'}: ${name}`);
      }
    }
  }
}

main().catch(console.error);
