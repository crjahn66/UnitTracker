const fs = require('fs');
const v = require('../app.json').expo.version;
const n = fs.existsSync('./release-notes.txt')
  ? fs.readFileSync('./release-notes.txt', 'utf8').trim()
  : '';
fs.writeFileSync('dist/_v.json', JSON.stringify({ b: Date.now(), v, n }));
