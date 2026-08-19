/* Builds a single self-contained index.html:
   three.module.min.js (export list rewritten into a `THREE` object) + game.js
   injected into shell.html. */
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const three = fs.readFileSync(path.join(dir, 'vendor/three.module.min.js'), 'utf8');
const game = fs.readFileSync(path.join(dir, 'game.js'), 'utf8');
const shell = fs.readFileSync(path.join(dir, 'shell.html'), 'utf8');

// The min build ends with `export{a as ACESFilmicToneMapping,...};`
// Rewrite it into `const THREE={ACESFilmicToneMapping:a,...};`
const m = three.match(/export\{([^}]*)\};?\s*$/);
if (!m) throw new Error('could not find the export block in three.module.min.js');

const pairs = m[1].split(',').map(entry => {
  const parts = entry.trim().split(/\s+as\s+/);
  const local = parts[0];
  const exported = parts[1] || parts[0];
  return JSON.stringify(exported) + ':' + local;
});
const threeNs = three.slice(0, m.index) + '\nconst THREE={' + pairs.join(',') + '};\n';

// The game shares a module scope with minified three, so give it its own
// closure — otherwise short names (`C`, `S`, `box`) collide with three's.
const scopedGame = '\n;(function () {\n' + game + '\n})();\n';

const out = shell
  .replace('__THREE__', () => threeNs)
  .replace('__GAME__', () => scopedGame);

const file = path.join(dir, 'index.html');
fs.writeFileSync(file, out);
console.log('wrote', file, (out.length / 1024).toFixed(0) + ' KB', '·', pairs.length, 'three exports');
