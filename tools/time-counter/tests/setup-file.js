// The AI setup: copy the instructions, open or paste the setup file an AI wrote, see what it will
// set, confirm; and the problems dialog when the file is wrong.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const common = require('./common'), URL = common.URL;
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
(async () => {
  const b = await chromium.launch(common.launchOptions);
  const mk = async (seen = true) => {
    const ctx = await b.newContext({ viewport: { width: 1200, height: 1000 }, timezoneId: 'America/Edmonton' });
    // a stand-in clipboard, so the test does not depend on the browser's permission prompts
    await ctx.addInitScript(() => { window.__copied = null; Object.defineProperty(navigator, 'clipboard', {value: {writeText: async x => { window.__copied = x; }, readText: async () => window.__copied}, configurable: true}); });
    if (seen) await ctx.addInitScript(() => { if(!localStorage.getItem('teachingtools:timeCounter:ui')) localStorage.setItem('teachingtools:timeCounter:ui', JSON.stringify({setupSeen: true})); });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.clock.install({ time: new Date('2026-10-08T10:00:00') });
    await p.goto(URL); await p.waitForFunction(() => window.PDFLib); await p.waitForTimeout(200);
    return {ctx, p, errs};
  };
  const settle = (p, n = 150) => p.waitForTimeout(n);
  const model = p => p.evaluate(() => JSON.parse(JSON.stringify(TimeCounterApp.state.model)));
  const dir = common.out('setup-file');
  const example = JSON.stringify(JSON.parse(require('fs').readFileSync(path.join(__dirname, '..', 'ai-setup-instructions.md'), 'utf8').match(/```json\n([\s\S]*?)\n```/)[1]), null, 2);
  fs.writeFileSync(path.join(dir, 'TimeCounter-setup.json'), example);

  // the repo's copy of the instructions is what the button copies
  const A = await mk(); const p = A.p;
  const live = await p.evaluate(() => TimeCounter.setupInstructions());
  ok(fs.readFileSync(path.join(__dirname, '..', 'ai-setup-instructions.md'), 'utf8') === live + '\n', 'ai-setup-instructions.md is exactly what the tool gives (run tests/write-instructions.js if this fails)');
  await p.click('[data-act=view][data-view=data]'); await settle(p);
  ok((await p.locator('#aisetup').count()) === 1 && (await p.innerText('#aisetup')).includes('Set up from a file or with an AI') && (await p.innerText('#aisetup')).includes('leave student names out'), 'Settings & data has the card, and tells people to leave student names out');
  await p.click('[data-act=ai-copy]'); await settle(p, 250);
  const clip = await p.evaluate(() => navigator.clipboard.readText()).catch(() => null);
  ok(clip === live && (await p.innerText('.banner.ok')).includes('Copied'), 'Copy the instructions puts the whole text on the clipboard');
  await p.click('#aisetup details summary'); await settle(p, 100);
  ok((await p.inputValue('#aisetup textarea[readonly]')) === live, 'and “Read the instructions” shows the same text');

  // open a file
  const before = JSON.stringify(await model(p));
  await p.setInputFiles('#setupFile', path.join(dir, 'TimeCounter-setup.json')); await p.waitForSelector('dialog[open]');
  const dtxt = await p.innerText('dialog[open]');
  ok(dtxt.includes('TimeCounter-setup.json') && dtxt.includes('Pat Teacher, Example School') && dtxt.includes('2027–28 school year') && dtxt.includes('Timetable:') && dtxt.includes('Friday letters:') && dtxt.includes('Duties:'), 'opening a setup file lists what it will set, line by line');
  ok(JSON.stringify(await model(p)) === before, 'and changes nothing yet');
  await p.click('dialog[open] button[value=cancel]'); await settle(p);
  ok(JSON.stringify(await model(p)) === before, 'Cancel leaves everything as it was');
  await p.setInputFiles('#setupFile', path.join(dir, 'TimeCounter-setup.json')); await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button[value=ok]'); await settle(p, 300);
  const m = await model(p);
  ok(m.settings.teacher === 'Pat Teacher' && m.calendar.name === '2027–28 school year' && m.versions[0].timetable.mon.p2.name === 'Science 8' && Object.keys(m.dayTypeOverrides).length === 39 && m.duties.some(d => d.name === 'Bus duty'), 'confirming sets the name, calendar, timetable, Friday letters and duties');
  ok((await p.innerText('.vbtn[aria-current=page]')) === 'Plan' && (await p.innerText('.banner.ok')).includes('Your year is set up'), 'it then shows the plan, with a message');
  await p.click('[data-act=undo]'); await settle(p);
  ok(JSON.stringify(await model(p)) === before, 'and Undo puts everything back');

  // paste, with chat around it
  await p.click('[data-act=view][data-view=data]'); await settle(p);
  ok((await p.locator('[data-act=ai-check][disabled]').count()) === 1, 'Check is off until something is pasted');
  await p.fill('#aisetup textarea[data-f=aiText]', 'Here is your file!\n```json\n' + example + '\n```\nTell me if anything is wrong.'); await p.press('#aisetup textarea[data-f=aiText]', 'Tab'); await settle(p);
  await p.click('[data-act=ai-check]'); await p.waitForSelector('dialog[open]');
  ok((await p.innerText('dialog[open] h2')).includes('the pasted text') && (await p.innerText('dialog[open]')).includes('Bell times:'), 'a paste with a chat reply around it is understood');
  await p.click('dialog[open] button[value=ok]'); await settle(p, 300);
  ok((await model(p)).settings.school === 'Example School', 'and applies');

  // problems
  const B = await mk(); const q = B.p;
  await q.click('[data-act=view][data-view=data]'); await settle(q);
  const bad = {format: 'time-counter-setup', version: 1, timeTable: [], timetable: [{dayTypes: ['mon'], period: 9, type: 'Teaching'}], bells: [{name: 'x', dayTypes: ['mon'], periods: [{start: '8:05 am', end: '08:56'}]}]};
  const snap = JSON.stringify(await model(q));
  await q.fill('#aisetup textarea[data-f=aiText]', JSON.stringify(bad)); await q.press('#aisetup textarea[data-f=aiText]', 'Tab'); await settle(q);
  await q.click('[data-act=ai-check]'); await q.waitForSelector('dialog[open]');
  const ptxt = await q.innerText('dialog[open]');
  ok(ptxt.includes('has problems') && ptxt.includes('timeTable') && ptxt.includes('24-hour') && ptxt.includes('Nothing was changed'), 'a wrong file lists each problem with where it is, and says nothing changed');
  await q.click('dialog[open] button[value=copy]'); await settle(q, 250);
  const copied = await q.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  ok(copied.startsWith('Time Counter could not use the setup file') && copied.includes('- bells[0].periods[0].start:') && copied.includes('whole corrected file'), 'the problems can be copied to paste back to the AI');
  ok(JSON.stringify(await model(q)) === snap, 'and the year is untouched');
  await q.fill('#aisetup textarea[data-f=aiText]', '{"format": "time-counter-setup", "version": 1, "about": {"fte": 1,}}'); await q.press('#aisetup textarea[data-f=aiText]', 'Tab'); await settle(q);
  await q.click('[data-act=ai-check]'); await q.waitForSelector('dialog[open]');
  ok((await q.innerText('dialog[open]')).includes('not valid JSON') && (await q.innerText('dialog[open]')).includes('near line 1'), 'JSON with a stray comma is explained in plain words');
  await q.click('dialog[open] button[value=cancel]'); await settle(q);

  // a dropped file
  await q.evaluate(async (text) => {
    const dt = new DataTransfer(); dt.items.add(new File([text], 'TimeCounter-setup.json', {type: 'application/json'}));
    document.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
  }, example);
  await q.waitForSelector('dialog[open]');
  ok((await q.innerText('dialog[open] h2')).includes('TimeCounter-setup.json'), 'dropping a .json file anywhere on the page opens the same check');
  await q.click('dialog[open] button[value=cancel]'); await settle(q);

  // from the guided setup
  const C = await mk(false); const w = C.p;
  ok((await w.innerText('#app')).includes('Rather not type it all in?'), 'the first-run setup offers the AI route on its first step');
  await w.click('[data-act=goto-ai]'); await settle(w, 200);
  ok((await w.innerText('.vbtn[aria-current=page]')) === 'Settings & data' && (await w.evaluate(() => document.activeElement.closest('#aisetup') !== null)), 'and takes you to it');
  // files that AI assistants really wrote from the instructions (see fixtures/), for two different teachers
  for (const f of ['ai-written-usual-school.json', 'ai-written-other-school.json']) {
    const text = fs.readFileSync(path.join(__dirname, 'fixtures', f), 'utf8');
    const res = await q.evaluate(t => { const r = TimeCounter.readSetupText(t), m = TimeCounter.newModel(); const x = r.ok ? TimeCounter.applySetupFile(m, r.file) : r; return {ok: x.ok, errors: x.errors, check: TimeCounter.checkModel(m), unassigned: TimeCounter.planSummary(m).year.unassigned, missing: TimeCounter.planSummary(m).missing, types: m.duties.map(d => d.name + ':' + d.typeId)}; }, text);
    ok(res.ok && res.check === null && res.unassigned === 0 && res.missing === 0 || f.includes('usual') && res.ok && res.check === null && res.missing === 0, f + ' imports, and leaves no period or school day uncounted' + (res.ok ? '' : ': ' + JSON.stringify(res.errors)));
    if (f.includes('usual')) ok(res.types.includes('Chess club:voluntary') && res.types.includes('Junior volleyball:extraAssigned'), 'a volunteer club is Not counted and an assigned team is Assignable');
  }
  ok(A.errs.length + B.errs.length + C.errs.length === 0, 'no console errors ' + JSON.stringify([A.errs, B.errs, C.errs]));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
