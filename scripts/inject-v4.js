const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');

for (const version of ['v4', 'v5']) {
  const cssTag = `<link rel="stylesheet" href="${version}.css">`;
  const jsTag = `<script src="${version}.js"></script>`;
  if (!html.includes(cssTag)) html = html.replace('</head>', `  ${cssTag}\n</head>`);
  if (!html.includes(jsTag)) html = html.replace('</body>', `  ${jsTag}\n</body>`);
}

fs.writeFileSync(indexPath, html);
console.log('Uplink launch and clips assets ready.');

