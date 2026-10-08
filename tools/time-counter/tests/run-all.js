// Runs every test file in turn and prints one line for each, then the lines that failed.
//   NODE_PATH=$(npm root -g) node tools/time-counter/tests/run-all.js
// A name on the command line runs just the files that contain it:  run-all.js stage5
const { spawnSync } = require('child_process');
const path = require('path');

// Files that read a saved PDF with poppler or pypdf say so here, so a machine without them skips those two.
const NEEDS = {'stage5-pdf.js': ['pdftotext', 'pdfdetach', 'pdfinfo', 'python3'], 'stage6-reports.js': ['pdftotext', 'pdfinfo']};
const FILES = ['selftest.js', 'stage2-plan.js', 'stage2-plan-more.js', 'stage3-week.js', 'stage4-totals.js', 'stage5-pdf.js', 'stage6-reports.js',
               'migration.js', 'storage.js', 'setup-file.js', 'phone-widths.js', 'phone-week.js', 'hostile-text.js'];
const want = process.argv.slice(2);
const have = cmd => spawnSync('sh', ['-c', 'command -v ' + cmd]).status === 0;

let bad = 0;
const report = [];
FILES.filter(f => !want.length || want.some(w => f.includes(w))).forEach(f => {
  const missing = (NEEDS[f] || []).filter(c => !have(c));
  if(missing.length){ report.push(['skip', f, 'needs ' + missing.join(', ')]); return; }
  const t0 = Date.now();
  const r = spawnSync('node', [path.join(__dirname, f)], {encoding: 'utf8', timeout: 600000, env: process.env});
  const out = (r.stdout || '') + (r.stderr || '');
  const failed = out.split('\n').filter(l => /^\s*FAIL|^\s+FAIL/.test(l) || /Error|FAILED/.test(l) && !/^ok/.test(l));
  const ok = r.status === 0 && !failed.length;
  if(!ok) bad++;
  report.push([ok ? 'ok' : 'FAIL', f, ((Date.now() - t0) / 1000).toFixed(1) + ' s', ok ? '' : failed.slice(0, 6).join('\n      ')]);
});
report.forEach(r => console.log(r[0].padEnd(5), r[1].padEnd(22), r[2], r[3] ? '\n      ' + r[3] : ''));
console.log(bad ? '\n' + bad + ' file(s) failed' : '\nAll passed');
process.exit(bad ? 1 : 0);
