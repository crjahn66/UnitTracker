const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Prefer CJS exports over ESM to avoid import.meta (e.g. zustand devtools middleware)
config.resolver.unstable_conditionNames = [
  'browser',
  'require',
  'default',
];

module.exports = config;
