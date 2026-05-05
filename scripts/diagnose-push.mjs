import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function main() {
  // Test 1: Can we read sync_state?
  console.log('--- Test 1: Read sync_state ---');
  const { data: readData, error: readErr } = await supabase.from('sync_state').select('id, updated_at').eq('id', 1).single();
  if (readErr) console.error('READ FAILED:', readErr.message);
  else console.log('READ OK:', readData);

  // Test 2: Can we UPDATE sync_state (anon key)?
  console.log('\n--- Test 2: Update sync_state (write test field) ---');
  const testTs = new Date().toISOString();
  const { error: writeErr } = await supabase.from('sync_state').update({ updated_at: testTs }).eq('id', 1);
  if (writeErr) console.error('WRITE FAILED (anon key cannot update):', writeErr.message);
  else console.log('WRITE OK - anon key can update sync_state');

  // Test 3: Can we list the photos bucket?
  console.log('\n--- Test 3: List photos bucket ---');
  const { data: files, error: listErr } = await supabase.storage.from('photos').list('', { limit: 100 });
  if (listErr) console.error('BUCKET LIST FAILED:', listErr.message);
  else {
    console.log(`BUCKET LIST OK: ${files.length} files`);
    files.forEach(f => console.log(' ', f.name));
  }

  // Test 4: Check if sync_state currently has ANY photos at all
  console.log('\n--- Test 4: Check raw sync_state units snapshot ---');
  const { data: full } = await supabase.from('sync_state').select('units').eq('id', 1).single();
  const units = full?.units ?? {};
  const unitIds = Object.keys(units);
  console.log(`Units in sync_state: ${unitIds.length}`);

  // Look for any image-like fields
  let localPaths = 0, httpUrls = 0;
  for (const unit of Object.values(units)) {
    for (const comp of Object.values(unit.components ?? {})) {
      for (const iss of (comp.issues ?? [])) {
        for (const img of (iss.images ?? [])) {
          if (img.startsWith('https://')) httpUrls++;
          else if (img.startsWith('file://') || img.startsWith('/')) localPaths++;
        }
      }
      for (const img of [...(comp.progressImages ?? []), ...(comp.goodImages ?? [])]) {
        if (img.startsWith('https://')) httpUrls++;
        else if (img.startsWith('file://') || img.startsWith('/')) localPaths++;
      }
    }
  }
  console.log(`  https:// photo URLs: ${httpUrls}`);
  console.log(`  local file paths: ${localPaths}`);
}

main().catch(console.error);
