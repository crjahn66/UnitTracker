import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync } from 'fs';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

async function run() {
  console.log('1. Testing Supabase connection...');
  const { data, error } = await supabase.from('sync_state').select('id, updated_at').eq('id', 1).single();
  if (error) { console.error('   FAIL:', error.message); process.exit(1); }
  console.log('   OK — last sync:', data.updated_at);

  console.log('2. Testing storage upload...');
  const testBytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const testName = `test_${Date.now()}.png`;
  const { error: upErr } = await supabase.storage.from('photos').upload(testName, testBytes, { contentType: 'image/png' });
  if (upErr) { console.error('   FAIL:', upErr.message); process.exit(1); }
  const url = supabase.storage.from('photos').getPublicUrl(testName).data.publicUrl;
  console.log('   OK — uploaded:', url);

  console.log('3. Cleaning up test file...');
  await supabase.storage.from('photos').remove([testName]);
  console.log('   OK');

  console.log('\nAll checks passed — Supabase sync is functional.');
}

run().catch(e => { console.error('Unexpected error:', e); process.exit(1); });
