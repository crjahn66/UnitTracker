/**
 * One-time recovery script: reads all photo filenames from the Supabase Storage bucket,
 * then scans sync_state for matching local-path refs and replaces them with public URLs.
 * Also handles the case where no refs exist at all (prints what's in the bucket for manual inspection).
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function getPublicUrl(fileName) {
  return `${SUPABASE_URL}/storage/v1/object/public/photos/${encodeURIComponent(fileName)}`;
}

function collectAllImageRefs(units) {
  const refs = [];
  for (const [uid, unit] of Object.entries(units ?? {})) {
    for (const [ck, comp] of Object.entries(unit.components ?? {})) {
      for (let i = 0; i < (comp.issues ?? []).length; i++) {
        for (let j = 0; j < (comp.issues[i].images ?? []).length; j++) {
          refs.push({ path: ['units', uid, 'components', ck, 'issues', i, 'images', j], val: comp.issues[i].images[j] });
        }
      }
      for (let j = 0; j < (comp.progressImages ?? []).length; j++) {
        refs.push({ path: ['units', uid, 'components', ck, 'progressImages', j], val: comp.progressImages[j] });
      }
      for (let j = 0; j < (comp.goodImages ?? []).length; j++) {
        refs.push({ path: ['units', uid, 'components', ck, 'goodImages', j], val: comp.goodImages[j] });
      }
    }
    for (let m = 0; m < (unit.miscEquipment ?? []).length; m++) {
      const item = unit.miscEquipment[m];
      for (let i = 0; i < (item.issues ?? []).length; i++) {
        for (let j = 0; j < (item.issues[i].images ?? []).length; j++) {
          refs.push({ path: ['units', uid, 'miscEquipment', m, 'issues', i, 'images', j], val: item.issues[i].images[j] });
        }
      }
    }
  }
  return refs;
}

async function main() {
  console.log('Fetching current sync_state...');
  const { data: syncData, error: syncErr } = await supabase.from('sync_state').select('units, general_issues').eq('id', 1).single();
  if (syncErr) { console.error('Cannot read sync_state:', syncErr.message); return; }

  console.log('Fetching photos bucket...');
  const { data: files, error: listErr } = await supabase.storage.from('photos').list('', { limit: 1000 });
  if (listErr) { console.error('Cannot list bucket:', listErr.message); return; }

  const realFiles = files.filter(f => !f.name.startsWith('.'));
  console.log(`\nBucket has ${realFiles.length} photo(s):`);
  realFiles.forEach(f => console.log(`  ${f.name}  →  ${getPublicUrl(f.name)}`));

  const refs = collectAllImageRefs(syncData.units);
  const httpRefs = refs.filter(r => r.val?.startsWith('https://'));
  const localRefs = refs.filter(r => r.val && !r.val.startsWith('https://'));
  console.log(`\nsync_state has ${httpRefs.length} https:// refs and ${localRefs.length} local-path refs`);

  if (httpRefs.length > 0) {
    console.log('Photos already in sync_state — no recovery needed!');
    return;
  }

  if (realFiles.length === 0) {
    console.log('No photos in bucket — nothing to restore.');
    return;
  }

  // No photo refs in sync_state at all. We need to know WHICH issue each photo belongs to.
  // The filename format is: issueId_timestamp.jpg  (issueId = the component issue/item id)
  // Let's match by issueId prefix.
  console.log('\nAttempting to match bucket files to issues in sync_state...');
  const units = JSON.parse(JSON.stringify(syncData.units));
  let matched = 0;

  for (const file of realFiles) {
    // filename: issueId_timestamp.ext
    const issueId = file.name.split('_').slice(0, -1).join('_');
    const url = getPublicUrl(file.name);
    let found = false;

    for (const unit of Object.values(units)) {
      for (const comp of Object.values(unit.components ?? {})) {
        for (const issue of (comp.issues ?? [])) {
          if (issue.id === issueId) {
            if (!issue.images) issue.images = [];
            if (!issue.images.includes(url)) { issue.images.push(url); matched++; found = true; }
          }
        }
        // progressImages / goodImages: filename starts with unitId_compKey
        if (file.name.startsWith(`${unit.id ?? ''}_`) || file.name.match(/^[^_]+_[^_]+_prog_|^[^_]+_[^_]+_good_/)) {
          // can't reliably auto-match without more context — skip
        }
      }
    }

    if (!found) {
      console.log(`  ⚠️  Could not match: ${file.name} (issueId candidate: "${issueId}")`);
    } else {
      console.log(`  ✓ Matched: ${file.name}`);
    }
  }

  if (matched === 0) {
    console.log('\nNo photos could be auto-matched. The photos may belong to progress/good image strips.');
    console.log('A manual sync from the native app (after reinstalling the APK with the fix) is required.');
    return;
  }

  console.log(`\nMatched ${matched} photo(s). Pushing updated sync_state...`);
  const now = new Date().toISOString();
  const { error: pushErr } = await supabase
    .from('sync_state')
    .update({ units, updated_at: now })
    .eq('id', 1);

  if (pushErr) { console.error('Push failed:', pushErr.message); }
  else console.log(`Done! sync_state updated at ${now}`);
}

main().catch(console.error);
