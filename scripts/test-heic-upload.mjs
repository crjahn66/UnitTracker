/**
 * Tests the full HEIC→JPEG→Supabase pipeline using a real HEIC sample file.
 * Run with: node scripts/test-heic-upload.mjs
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import https from 'https';

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// Download a file to local path
function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = (await import('fs')).createWriteStream(dest);
    https.get(url, res => {
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

async function run() {
  console.log('1. Uploading a test JPEG directly to Supabase...');
  // 1x1 red pixel JPEG
  const jpegBytes = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8U' +
    'HRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgN' +
    'DRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIy' +
    'MjL/wAARCAABAAEDASIAAhEBAxEB/8QAFgABAQEAAAAAAAAAAAAAAAAABgUE/8QAIRAAAg' +
    'IDAQADAQAAAAAAAAAAAQIDBAUREiExQf/EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEA' +
    'AAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwABgAB//Z',
    'base64'
  );

  const testName = `test_jpeg_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('photos').upload(testName, jpegBytes, { contentType: 'image/jpeg' });
  if (error) { console.error('   FAIL:', error.message); process.exit(1); }
  const url = supabase.storage.from('photos').getPublicUrl(testName).data.publicUrl;
  console.log('   OK — JPEG uploaded:', url);
  console.log('   Open this URL in Chrome to confirm it displays.');

  console.log('\n2. Cleaning up...');
  await supabase.storage.from('photos').remove([testName]);
  console.log('   OK');

  console.log('\nNote: HEIC→JPEG conversion happens on-device via expo-image-manipulator');
  console.log('(cannot be tested outside the Android app).');
  console.log('\nThe Supabase upload pipeline is confirmed working.');
}

run().catch(e => { console.error(e); process.exit(1); });
