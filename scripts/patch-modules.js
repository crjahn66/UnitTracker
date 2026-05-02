/**
 * Patches expo-modules-core and expo-file-system after npm install.
 * These packages ship without compiled JS (only TypeScript source).
 * Metro (React Native bundler) handles TS transpilation at bundle time,
 * but Node.js (used by Expo CLI) cannot load .ts files directly.
 * This patch makes index.js delegate to the TS source for Metro,
 * while silently returning {} when Node tries to load it.
 */
const fs = require('fs');
const path = require('path');

const PATCH = `try { module.exports = require('./src/index.ts'); } catch (e) { module.exports = {}; }\n`;

const targets = [
  'expo-modules-core/index.js',
  'expo-file-system/index.js',
];

for (const target of targets) {
  const filePath = path.join(__dirname, '..', 'node_modules', target);
  if (fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, PATCH);
    console.log('Patched:', target);
  }
}
