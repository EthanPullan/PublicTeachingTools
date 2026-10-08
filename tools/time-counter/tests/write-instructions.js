// Writes ai-setup-instructions.md from the same function the tool uses, so the copy people can
// read on GitHub is always what the "Copy the instructions" button copies.
//   node tools/time-counter/tests/write-instructions.js
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const engine = /<script>\n\/\* =+\n   Time Counter — engine[\s\S]*?<\/script>/.exec(html)[0].replace(/^<script>/, '').replace(/<\/script>$/, '');
global.window = {};
new Function(engine)();
const out = path.join(__dirname, '..', 'ai-setup-instructions.md');
fs.writeFileSync(out, global.window.TimeCounter.setupInstructions() + '\n');
console.log('wrote', path.relative(process.cwd(), out));
