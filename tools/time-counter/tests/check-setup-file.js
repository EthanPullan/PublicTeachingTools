// Checks a setup file the way the tool does, without a browser: prints every problem, or what
// the file would set. Handy for trying out what an AI wrote.
//   node tools/time-counter/tests/check-setup-file.js path/to/TimeCounter-setup.json
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
global.window = {};
new Function(/<script>\n\/\* =+\n   Time Counter — engine[\s\S]*?<\/script>/.exec(html)[0].replace(/^<script>/, '').replace(/<\/script>$/, ''))();
const TC = global.window.TimeCounter;
const read = TC.readSetupText(fs.readFileSync(process.argv[2], 'utf8'));
const res = read.ok ? TC.previewSetupFile(TC.newModel(), read.file) : read;
if(!res.ok){ console.log('PROBLEMS'); res.errors.forEach(e => console.log('  ' + (e.path ? e.path + ': ' : '') + e.message)); process.exit(1); }
console.log('OK'); res.changes.forEach(c => console.log('  ' + c.label + ': ' + c.text));
