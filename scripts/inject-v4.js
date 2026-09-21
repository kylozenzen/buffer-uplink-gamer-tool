const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const indexPath = path.join(root, 'index.html');
const cssTag = '<link rel="stylesheet" href="v4.css">';
const jsTag = '<script src="v4.js"></script>';
let html = fs.readFileSync(indexPath, 'utf8');

if (!html.includes(cssTag)) {
  html = html.replace('</head>', `  ${cssTag}\n</head>`);
}
if (!html.includes(jsTag)) {
  html = html.replace('</body>', `  ${jsTag}\n</body>`);
}

fs.writeFileSync(indexPath, html);
console.log('Uplink V4 assets injected into index.html');
