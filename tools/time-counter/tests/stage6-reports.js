const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const URL = require('./common').URL;
const DIR = require('./common').out('stage6');
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
const SETUP = () => TimeCounterApp.commit(m => { const TC = TimeCounter, T = TC.T, v = m.versions[0];
  TC.missingDayTypeDates(m, 5).forEach((d, i) => TC.setDayType(m, d, ['friA','friB','friC','friD'][i % 4]));
  ['mon','tue','wed','thu'].forEach(dt => ['p1','p2','p3','p4','p6','p7'].forEach(id => TC.setTimetable(v, dt, id, {type: 'class', name: 'Math 8'})));
  ['mon','tue','wed','thu'].forEach(dt => ['p5','p8'].forEach(id => TC.setTimetable(v, dt, id, {type: 'prep', name: ''})));
  ['friA','friB','friC','friD'].forEach(dt => ['p1','p2','p3','p4'].forEach(id => TC.setTimetable(v, dt, id, {type: 'class', name: 'Science'})));
  m.settings.teacher = 'Zoë Ng'; m.settings.school = 'Test School';
  TC.coverClass(m, '2026-09-08', 'p5', {whose: 'a colleague', note: 'Ms Lee away'});
  TC.addBlock(m, '2026-10-06', {start: T('14:45'), end: T('15:45'), typeId: 'meeting', name: 'Grad meeting', note: 'Admin asked for it'}, {entered: '2026-10-06'});
  TC.setLeave(m, '2026-09-10', 'sick', {note: 'flu'});
  TC.confirmWeek(m, '2026-09-07', {at: '2026-09-11'});
});
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const mk = async (seen = true, opts = {}) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 1200, height: 1000 }, timezoneId: 'America/Edmonton', acceptDownloads: true }, opts));
    if (seen) await ctx.addInitScript(() => { if(!localStorage.getItem('teachingtools:timeCounter:ui')) localStorage.setItem('teachingtools:timeCounter:ui', JSON.stringify({setupSeen: true})); });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.clock.install({ time: new Date('2026-10-08T10:00:00') });
    await p.goto(URL); await p.waitForFunction(() => window.PDFLib); await p.waitForTimeout(150);
    return {ctx, p, errs};
  };
  const settle = (p, n = 150) => p.waitForTimeout(n);
  const text = (p, sel) => p.innerText(sel);

  // ---------- first-run setup
  const A = await mk(false); const pa = A.p;
  ok((await text(pa, '.setup .sttitle')).startsWith('Step 1 of 7: School year'), 'a device that has never been used opens on the guided setup');
  ok((await text(pa, '#app')).includes('196 operational days') && (await text(pa, '#app')).includes('181 instructional days'), 'step 1 shows the built-in calendar and its day counts');
  ok((await pa.locator('.steps .step').count()) === 7, 'seven steps, in the order of the brief');
  await pa.click('[data-act=setup-next].primary'); await settle(pa);
  ok((await text(pa, '.setup .sttitle')).startsWith('Step 2 of 7: About you') && (await pa.evaluate(() => document.activeElement.className)) === 'sttitle', 'Next goes to step 2 and puts keyboard focus on its title');
  await pa.fill('[data-key="set:teacher"]', 'Pat Teacher'); await pa.press('[data-key="set:teacher"]', 'Tab'); await settle(pa);
  await pa.fill('[data-key="set:fte"]', '0.5'); await pa.press('[data-key="set:fte"]', 'Tab'); await settle(pa);
  ok((await pa.locator('[data-key="set:typicalAssignedHours"]').count()) === 1 && (await text(pa, '#app')).includes('Limits'), 'below 1.0 FTE it asks for the typical hours, and the limits are shown');
  ok((await pa.evaluate(() => TimeCounterApp.state.model.settings.teacher)) === 'Pat Teacher' && (await pa.evaluate(() => TimeCounterApp.state.view)) === 'setup', 'what you type is saved, and you stay in the setup');
  await pa.fill('[data-key="set:fte"]', '1'); await pa.press('[data-key="set:fte"]', 'Tab'); await settle(pa);
  await pa.click('[data-act=setup-next].primary'); await settle(pa);
  ok((await text(pa, '#app')).includes('already set this up') && (await pa.locator('#app [data-act=pdf-open]').count()) === 1, 'step 3 offers to open a colleague’s TimeTracker.pdf as school setup');
  await pa.click('[data-act=setup-next].primary'); await settle(pa);
  ok((await pa.locator('.bells, .panel, table').count()) > 0 && (await text(pa, '.setup .sttitle')).includes('Timetable for the first term'), 'step 4 is the bells and timetable');
  await pa.click('.step[data-step="6"]'); await settle(pa);
  ok((await text(pa, '.setup .sttitle')).includes('Friday letters') && (await text(pa, 'body')).includes('Rotation fill'), 'any step can be opened from the list, and step 6 has the rotation fill');
  await pa.click('[data-act=setup-back]'); await settle(pa);
  ok((await text(pa, '.setup .sttitle')).includes('Step 5 of 7'), 'Back goes back a step');
  await pa.click('.step[data-step="7"]'); await settle(pa);
  ok((await text(pa, '.setup')).includes('Review') && (await pa.locator('.strip').count()) === 1, 'the last step shows the planning preview');
  await pa.click('[data-act=setup-close]'); await settle(pa);
  ok((await text(pa, '.vbtn[aria-current=page]')) === 'This week', 'finishing goes to This week');
  await pa.reload(); await settle(pa, 250);
  ok((await text(pa, '.vbtn[aria-current=page]')) === 'This week', 'and the setup does not open again');
  await pa.click('[data-act=view][data-view=data]'); await settle(pa); await pa.click('[data-act=setup-open]'); await settle(pa);
  ok((await text(pa, '.setup .sttitle')).startsWith('Step 1 of 7'), 'it can be run again from Settings & data');
  const skip = await mk(false); await skip.p.click('.setup [data-act=setup-close]'); await settle(skip.p);
  ok((await skip.p.evaluate(() => JSON.parse(localStorage.getItem('teachingtools:timeCounter:ui')).setupSeen)) === true && (await text(skip.p, '.vbtn[aria-current=page]')) === 'This week', 'Skip setup closes it for good');
  const old = await mk(false); await old.p.evaluate(() => { const m = TimeCounter.newModel(); m.settings.teacher = 'Already here'; m.modified = new Date().toISOString(); localStorage.setItem('teachingtools:timeCounter:model', JSON.stringify(m)); localStorage.removeItem('teachingtools:timeCounter:ui'); }); await old.p.reload(); await settle(old.p, 250);
  ok((await text(old.p, '.vbtn[aria-current=page]')) === 'This week', 'a device that already has data does not open the setup');
  ok(A.errs.length === 0 && skip.errs.length === 0, 'no console errors ' + JSON.stringify(A.errs));

  // ---------- reports
  const R = await mk(); const p = R.p;
  await p.evaluate(SETUP); await settle(p, 200);
  await p.click('[data-act=view][data-view=totals]'); await settle(p);
  ok((await p.locator('.tabs .tab').allInnerTexts()).join() === 'Dashboard,Year summary,Week sheet,Change log', 'Totals has a dashboard and three reports');
  ok((await p.locator('details.whatcounts').count()) === 1, 'the dashboard has a “What counts?” explainer');
  await p.click('details.whatcounts summary'); await settle(p, 100);
  const wc = await text(p, 'details.whatcounts');
  ok(wc.includes('Instructional') && wc.includes('Assignable') && wc.includes('Not counted') && wc.includes('916 h') && wc.includes('1,200 h') && wc.includes('6 h'), 'it explains the three categories, the two limits and the 6 h Convention day');
  await p.click('[data-act=rep][data-rep=year]'); await settle(p);
  const yr = await text(p, '.report');
  ok(yr.includes('Time summary') && yr.includes('Instructional time: plan lines') && yr.includes('TOTAL ANNUAL INSTRUCTIONAL TIME') && yr.includes('TOTAL ANNUAL ASSIGNED NON-INSTRUCTIONAL TIME') && yr.includes('Not counted: the record') && yr.includes('Maximum annual instructional time at this FTE: 916.00 h'), 'the year summary follows the calculator: plan lines, by time type, assigned lines, totals against the limits');
  const planRows = await p.locator('.report section:has(h2:has-text("plan lines")) tbody tr').count();
  ok(planRows >= 9 && (await text(p, '.report section:has(h2:has-text("plan lines"))')).includes('Friday A') && (await text(p, '.report section:has(h2:has-text("plan lines"))')).includes('Subtotal: the plan'), 'plan lines are days × minutes for each day type, with a subtotal');
  ok((await text(p, '.report')).includes('+0.78 h') && (await text(p, '.report')).includes('Coverage'), 'and the edits show as net adjustments by time type (+0.78 h Coverage)');
  const screenInstr = /Total instructional time\s+([\d,.]+) h/.exec(yr)[1], screenAssigned = /Total assigned time\s+([\d,.]+) h/.exec(yr)[1];

  // the PDF says the same, to the minute
  await p.click('[data-act=view][data-view=data]'); await settle(p);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('[data-act=pdf-save]')]); const pdf = path.join(DIR, 'TimeTracker.pdf'); await dl.saveAs(pdf);
  const ptxt = execFileSync('pdftotext', ['-layout', pdf, '-']).toString();
  ok(new RegExp('Total instructional time\\s+' + screenInstr.replace('.', '\\.') + ' h').test(ptxt) && new RegExp('Total assigned time\\s+' + screenAssigned.replace(/[.,]/g, '\\$&') + ' h').test(ptxt), 'the PDF’s year summary shows the same totals as the screen (' + screenInstr + ' h instructional, ' + screenAssigned + ' h assigned)');

  // printing
  await p.click('[data-act=view][data-view=totals]'); await p.click('[data-act=rep][data-rep=year]'); await settle(p);
  await p.emulateMedia({media: 'print'}); await settle(p, 100);
  const hidden = await p.evaluate(() => ['header.toolbar', 'nav.views', '.tabs', '.report .btn', 'body > .wrap > footer'].map(s => { const e = document.querySelector(s); return e ? getComputedStyle(e).display : 'none'; }));
  ok(hidden.every(x => x === 'none'), 'printing hides the toolbar, the navigation, the buttons and the page footer');
  ok((await p.evaluate(() => getComputedStyle(document.querySelector('.rfoot')).position)) === 'fixed' && (await p.evaluate(() => getComputedStyle(document.querySelector('.rfoot')).display)) === 'block', 'and shows the estimate notice, links and Local 38’s contact as a footer on every printed page');
  await p.pdf({path: path.join(DIR, 'print-year.pdf'), format: 'Letter'});
  const prt = execFileSync('pdftotext', ['-layout', path.join(DIR, 'print-year.pdf'), '-']).toString(), np = +/Pages:\s+(\d+)/.exec(execFileSync('pdfinfo', [path.join(DIR, 'print-year.pdf')]).toString())[1];
  ok((prt.match(/not an official ruling/g) || []).length === np && !/\d{3}-\d{3}-\d{4}/.test(prt) && !/@/.test(prt) && prt.includes('TOTAL ANNUAL INSTRUCTIONAL TIME') && !prt.includes('Run the engine self-test'), 'the printed year summary is ' + np + ' pages, each with the footer, and nothing but the report');
  await p.emulateMedia({media: 'screen'});

  // week sheet
  await p.click('[data-act=rep][data-rep=week]'); await settle(p);
  ok((await text(p, '.report h2')).startsWith('Week of Mon Oct 5'), 'the week sheet opens on the current week');
  ok((await text(p, '.report')).includes('Grad meeting') && (await text(p, '.report')).includes('Admin asked for it') && (await p.locator('.report .pen').count()) >= 1 && (await text(p, '.report h2')).includes('Edited'), 'every block with its time, type and note, edited ones marked');
  await p.click('.report [data-act=wk-prev]'); await settle(p);
  ok((await text(p, '.report h2')).startsWith('Week of Mon Sep 28'), 'Previous goes back a week');
  await p.fill('[data-key=wkDate]', '2026-09-08'); await p.press('[data-key=wkDate]', 'Tab'); await settle(p);
  ok((await text(p, '.report h2')).includes('Confirmed') && (await text(p, '.report')).includes('Sick leave: flu') && (await text(p, '.report')).includes('Coverage: a colleague') && (await text(p, '.report')).includes('Ms Lee away'), 'a confirmed week shows its coverage, its leave tag and the notes');
  await p.click('.report [data-act=wk-today]'); await settle(p);

  // change log
  await p.click('[data-act=rep][data-rep=log]'); await settle(p);
  const rows = () => p.locator('.report tbody tr').count();
  ok((await rows()) === 4 && (await text(p, '.report')).includes('Added Grad meeting') && (await text(p, '.report')).includes('Confirmed the week of Sep 7'), 'the change log lists each change away from the plan, and the confirmation');
  await p.fill('[data-key="log:from"]', '2026-09-20'); await p.press('[data-key="log:from"]', 'Tab'); await settle(p);
  ok((await rows()) === 1 && (await text(p, '.report')).includes('1 of 4 entry'), 'it filters from a date');
  await p.click('[data-act=log-clear]'); await settle(p);
  await p.selectOption('[data-key="log:type"]', 'coverage'); await settle(p);
  ok((await rows()) === 1 && (await text(p, '.report tbody')).includes('Coverage'), 'by time type');
  await p.selectOption('[data-key="log:type"]', 'event'); await settle(p);
  ok((await rows()) === 1 && (await text(p, '.report tbody')).includes('Confirmed'), 'by kind');
  await p.fill('[data-key="log:to"]', '2026-01-01'); await p.press('[data-key="log:to"]', 'Tab'); await settle(p);
  ok((await text(p, '.report')).includes('Nothing matches that filter'), 'and says so when nothing matches');
  await p.click('[data-act=log-clear]'); await settle(p);
  ok((await rows()) === 4, '“Show everything” clears the filters');
  // unlocking shows up, with the day each kept edit was first entered
  await p.evaluate(() => TimeCounterApp.commit(m => { TimeCounter.unlockWeek(m, '2026-09-07', {at: '2026-10-08'}); })); await settle(p, 200);
  const logTxt = await text(p, '.report');
  ok(logTxt.includes('Unlocked the week of Sep 7 (kept exactly as it was)') && logTxt.includes('Kept from the confirmed week: Coverage: a colleague'), 'unlocking is logged, and a kept edit stays in the log');
  ok(R.errs.length === 0, 'no console errors ' + JSON.stringify(R.errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
