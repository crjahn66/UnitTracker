/**
 * Tests HEIC→JPEG conversion + Supabase upload.
 * Run: node scripts/test-heic-convert.mjs
 * Then open the printed URL in Chrome to confirm the photo displays.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createRequire } from 'module';
import https from 'https';
import http from 'http';

const require = createRequire(import.meta.url);
const heicDecode = require('heic-decode');
const jpegJs = require('jpeg-js');

const SUPABASE_URL = 'https://kizqpjitayvlezcjvdeo.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HfhY_YliSPzpT7HQgSu9xw_1lQZu04n';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const proto = url.startsWith('https') ? https : http;
    const file = require('fs').createWriteStream(dest);
    proto.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', e => { require('fs').unlink(dest, () => {}); reject(e); });
  });
}

async function run() {
  // 1. Get a sample HEIC file
  const heicPath = '/data/data/com.termux/files/home/test_sample.heic';
  console.log('1. Downloading a sample HEIC file...');
  // Small public HEIC sample
  await downloadFile(
    'https://github.com/tigranbs/test-heic-images/raw/master/image1.heic',
    heicPath
  );
  console.log('   OK —', readFileSync(heicPath).length, 'bytes');

  // 2. Convert HEIC → JPEG using pure JS (same logic will run in the app)
  console.log('2. Converting HEIC → JPEG...');
  const heicBuffer = readFileSync(heicPath);
  const images = await heicDecode.all({ buffer: heicBuffer });
  const { width, height, data } = await images[0].decode();
  console.log(`   Decoded: ${width}x${height} pixels`);

  // Encode as JPEG
  const jpegData = jpegJs.encode({ width, height, data }, 85);
  const jpegBytes = new Uint8Array(jpegData.data);
  console.log(`   Encoded: ${jpegBytes.length} bytes JPEG`);

  // 3. Upload to Supabase
  console.log('3. Uploading JPEG to Supabase...');
  const fileName = `test_heic_converted_${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('photos').upload(fileName, jpegBytes, {
    contentType: 'image/jpeg',
  });
  if (error) { console.error('   FAIL:', error.message); process.exit(1); }

  const url = supabase.storage.from('photos').getPublicUrl(fileName).data.publicUrl;
  console.log('\n✓ Success! Open this URL in Chrome to confirm the photo displays:');
  console.log(url);
  console.log('\n(File will be auto-deleted in 5 seconds...)');

  await new Promise(r => setTimeout(r, 5000));
  await supabase.storage.from('photos').remove([fileName]);
  console.log('Cleaned up.');
}

run().catch(e => { console.error('Error:', e.message ?? e); process.exit(1); });
