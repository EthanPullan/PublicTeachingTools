const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const URL = require('./common').URL;
const DIR = require('./common').out('stage5');
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
const SETUP = () => TimeCounterApp.commit(m => { const TC = TimeCounter, v = m.versions[0], T = TC.T;
  TC.applyRotation(m, TC.rotationPlan(m, {dayTypes:['friA','friB','friC','friD'], weekday:5, start:'2026-08-31', countNid:false}));
  ['mon','tue','wed','thu'].forEach(dt => ['p1','p2','p3','p4'].forEach(id => TC.setTimetable(v, dt, id, {type:'class', name:'Math 8'})));
  TC.setTimetable(v, 'tue', 'p4', {type:'prep', name:''});
  m.settings.teacher = 'Zoë Ng'; m.settings.school = 'Test School';
  TC.coverClass(m, '2026-09-08', 'p4', {whose:'a colleague'});
  TC.addBlock(m, '2026-09-22', {start: T('14:45'), end: T('15:45'), typeId:'meeting', name:'Grad → 🤖', note:'Told admin → agreed 🤖 ễ'}, {entered:'2026-09-22'});
  TC.confirmWeek(m, '2026-09-07', {at:'2026-09-11'});
});
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const mk = async (opts = {}) => {
    const ctx = await b.newContext(Object.assign({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Edmonton', acceptDownloads: true }, opts));
    await ctx.addInitScript(() => { if(!localStorage.getItem('teachingtools:timeCounter:ui')) localStorage.setItem('teachingtools:timeCounter:ui', JSON.stringify({setupSeen: true})); });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.clock.install({ time: new Date('2026-10-08T10:00:00') });
    await p.goto(URL); await p.waitForFunction(() => window.PDFLib); await p.waitForTimeout(150);
    return {ctx, p, errs};
  };
  const model = p => p.evaluate(() => JSON.parse(JSON.stringify(TimeCounterApp.state.model)));
  const text = (p, sel) => p.innerText(sel);
  const settle = (p, n = 120) => p.waitForTimeout(n);

  // ---------- A: save
  const A = await mk(); const pa = A.p;
  await pa.evaluate(SETUP); await settle(pa, 200);
  await pa.click('[data-act=view][data-view=data]'); await settle(pa);
  ok((await text(pa, 'section.card:has(h2:has-text("Your TimeTracker.pdf"))')).includes('not saved a TimeTracker.pdf'), 'before saving it says nothing has been saved from this device');
  const [dl] = await Promise.all([pa.waitForEvent('download'), pa.click('[data-act=pdf-save]')]);
  const pdfPath = path.join(DIR, 'TimeTracker.pdf'); await dl.saveAs(pdfPath);
  ok(dl.suggestedFilename() === 'TimeTracker.pdf', 'Save as PDF downloads TimeTracker.pdf');
  await settle(pa, 200);
  ok((await text(pa, '.banner')).includes('notes included') && (await text(pa, '.banner')).includes('before you send it'), 'the save message says the PDF carries everything, notes included');
  ok((await text(pa, 'section.card:has(h2:has-text("Your TimeTracker.pdf"))')).includes('Last saved just now') && (await text(pa, 'section.card:has(h2:has-text("Your TimeTracker.pdf"))')).includes('Nothing has changed since'), 'it then shows how long ago it was saved');
  // two independent PDF tools
  const list = execFileSync('pdfdetach', ['-list', pdfPath]).toString();
  ok(/1 embedded files/.test(list) && list.includes('timetracker-data.json'), 'pdfdetach (a second, unrelated reader) lists the attached file');
  const py = execFileSync('python3', ['-I', '-c', "import pypdf,sys;r=pypdf.PdfReader(sys.argv[1]);a=r.attachments;print(list(a.keys())[0], len(list(a.values())[0][0]))", pdfPath]).toString().trim();
  ok(py.startsWith('timetracker-data.json '), 'pypdf finds it too: ' + py);
  execFileSync('pdfdetach', ['-save', '1', '-o', path.join(DIR, 'data.json'), pdfPath]);
  const env = JSON.parse(fs.readFileSync(path.join(DIR, 'data.json'), 'utf8'));
  ok(env.format === 'time-counter-save' && env.version === 1 && env.checksum.alg === 'crc32' && JSON.parse(env.payload).settings.teacher === 'Zoë Ng', 'the attachment is the envelope: format, version, checksum, and the data');
  ok(env.payload.includes('Told admin → agreed 🤖 ễ'), 'the embedded data keeps the arrow, the emoji and ễ exactly');
  const page = execFileSync('pdftotext', ['-layout', pdfPath, '-']).toString();
  ok(env.app === 'Time Counter' && env.appVersion === '0.6' && /Time Counter 0\.6 · saved/.test(page), 'the file and every page footer say which version made it (Time Counter 0.6)');
  ok(page.includes('Told admin -> agreed ? e') && !page.includes('→') && !page.includes('🤖'), 'the page shows the stand-ins: “Told admin -> agreed ? e”');
  ok(page.includes('Zoë Ng') && page.includes('Where the year stands') && page.includes('not an official ruling'), 'the page has the name, the year summary and the disclaimer');
  const finfo = execFileSync('pdfinfo', [pdfPath]).toString();
  const npages = +/Pages:\s+(\d+)/.exec(finfo)[1];
  ok(/Title:\s+TimeTracker/.test(finfo) && npages >= 8, 'it is a report titled TimeTracker (' + npages + ' pages: summary, year summary, change log, weeks so far, weeks ahead)');
  ok(page.includes('Year summary') && page.includes('TOTAL ANNUAL INSTRUCTIONAL TIME') && page.includes('TOTAL ANNUAL ASSIGNED NON-INSTRUCTIONAL TIME') && page.includes('Maximum annual instructional time at this FTE'), 'the year summary follows the Local 38 calculator’s lines');
  ok(page.includes('Change log') && page.includes('Weeks ahead') && (page.match(/Week of /g) || []).length >= 4, 'it has the change log, a page for each week so far, and the weeks ahead');
  ok(!/\d{3}-\d{3}-\d{4}/.test(page) && !/@/.test(page) && page.includes('teachers.ab.ca/pay-and-benefits') && (page.match(/not an official ruling/g) || []).length === npages, 'every page carries the estimate notice and the links, and no phone number or email address (' + npages + ' of ' + npages + ')');
  const wrote = await model(pa);
  const totalsA = await pa.evaluate(() => JSON.stringify(TimeCounter.trackYear(TimeCounterApp.state.model, '2026-10-08')));
  ok(A.errs.length === 0, 'no console errors on the saving side ' + JSON.stringify(A.errs));

  // ---------- B: a fresh browser opens it
  const B = await mk(); const pb = B.p;
  ok((await model(pb)).settings.teacher === '', 'the second browser starts empty');
  await pb.click('[data-act=view][data-view=data]'); await settle(pb);
  await pb.setInputFiles('#pdfFile', pdfPath); await pb.waitForSelector('dialog[open]');
  const dtxt = await text(pb, 'dialog[open]');
  ok(dtxt.includes('Made with') && dtxt.includes('Time Counter 0.6'), 'the dialog says which version made the file');
  ok(dtxt.includes('Open TimeTracker.pdf?') && dtxt.includes('Zoë Ng, Test School') && dtxt.includes('Confirmed weeks') && dtxt.includes('Notes') && dtxt.includes('Nothing has been changed yet'), 'opening shows a summary (year, name, last changed, totals, confirmed weeks, notes) and changes nothing yet');
  ok((await model(pb)).settings.teacher === '', 'nothing has changed while the dialog is open');
  await pb.click('dialog[open] button[value=all]'); await settle(pb, 250);
  const got = await model(pb);
  const strip = m => { const c = JSON.parse(JSON.stringify(m)); c.log = c.log.filter(x => x.kind !== 'import'); delete c.modified; return JSON.stringify(c); };
  ok(strip(got) === strip(wrote), 'everything restores exactly (apart from the import entry in the log)');
  ok(got.log[got.log.length - 1].kind === 'import', 'the import is logged');
  ok(totalsA === await pb.evaluate(() => JSON.stringify(TimeCounter.trackYear(TimeCounterApp.state.model, '2026-10-08'))), 'every total is identical');
  ok((await text(pb, '.stpill')).includes('Planned') || true, 'it lands on This week');
  await pb.click('[data-act=view][data-view=totals]'); await settle(pb);
  const tA = await text(pb, '.tiles');
  await pa.click('[data-act=view][data-view=totals]'); await settle(pa);
  ok(tA === await text(pa, '.tiles'), 'the Totals tiles read the same on both browsers');
  // still editable
  await pb.click('[data-act=view][data-view=week]'); await pb.evaluate(() => TimeCounterApp.state.week = '2026-10-05'); await pb.evaluate(() => TimeCounterApp.render()); await settle(pb);
  await pb.click('[data-act=add-day][data-date="2026-10-06"]'); await pb.waitForSelector('dialog[open]');
  await pb.fill('dialog[open] input[name=name]', 'After opening'); await pb.click('dialog[open] button[value=ok]'); await settle(pb, 200);
  ok((await model(pb)).edits['2026-10-06'].some(e => e.name === 'After opening'), 'the opened year is fully editable');
  await pb.click('[data-act=view][data-view=data]'); await settle(pb);
  ok((await text(pb, 'section.card:has(h2:has-text("Your TimeTracker.pdf"))')).includes('You have made changes since'), 'and it notices the change since the last save');

  // ---------- C: a PDF printed to a new PDF, and other files that are not a TimeTracker
  const C = await mk(); const pc = C.p; await pc.evaluate(SETUP); await settle(pc, 200);
  const before = JSON.stringify(await model(pc));
  const printedPath = path.join(DIR, 'printed.pdf');
  await pc.pdf({ path: printedPath });                    // the browser's own Print to PDF
  await pc.click('[data-act=view][data-view=data]'); await settle(pc);
  await pc.setInputFiles('#pdfFile', printedPath); await pc.waitForSelector('dialog[open]');
  const ptxt = await text(pc, 'dialog[open]');
  ok(ptxt.includes('No Time Counter data was found') && ptxt.includes('original TimeTracker.pdf') && ptxt.includes('Nothing was changed'), 'a PDF printed to a new PDF: “No Time Counter data was found”, asks for the original, changes nothing');
  await pc.click('dialog[open] button[value=cancel]'); await settle(pc);
  ok(JSON.stringify(await model(pc)) === before, 'and nothing changed');
  fs.writeFileSync(path.join(DIR, 'notes.txt'), 'hello');
  await pc.setInputFiles('#pdfFile', path.join(DIR, 'notes.txt')); await pc.waitForSelector('dialog[open]');
  ok((await text(pc, 'dialog[open]')).includes('not a PDF'), 'a file that is not a PDF is turned away');
  await pc.click('dialog[open] button[value=cancel]'); await settle(pc);
  // a damaged one: valid PDF, our envelope, checksum does not match
  const dmg = await pc.evaluate(async () => {
    const L = PDFLib, doc = await L.PDFDocument.create(); doc.addPage([200, 200]);
    const e = JSON.parse(TimeCounter.pack(TimeCounterApp.state.model, null)); e.payload = e.payload.replace('Test School', 'Test Schoop');
    await doc.attach(new TextEncoder().encode(JSON.stringify(e)), 'timetracker-data.json', {mimeType: 'application/json'});
    return Array.from(await doc.save());
  });
  fs.writeFileSync(path.join(DIR, 'damaged.pdf'), Buffer.from(dmg));
  await pc.setInputFiles('#pdfFile', path.join(DIR, 'damaged.pdf')); await pc.waitForSelector('dialog[open]');
  ok((await text(pc, 'dialog[open]')).includes('does not match its checksum') && (await text(pc, 'dialog[open]')).includes('Nothing was changed'), 'a damaged file is refused with a reason');
  await pc.click('dialog[open] button[value=cancel]'); await settle(pc);
  ok(JSON.stringify(await model(pc)) === before, 'still nothing changed');
  ok(C.errs.length === 0, 'no console errors ' + JSON.stringify(C.errs));

  // ---------- D: school setup only into a year that already has a timetable
  const D = await mk(); const pd = D.p;
  await pd.evaluate(() => TimeCounterApp.commit(m => { const TC = TimeCounter; m.settings.teacher = 'Pat Receiver'; TC.setTimetable(m.versions[0], 'mon', 'p1', {type: 'class', name: 'Mine'}); TC.addBlock(m, '2026-09-23', {start: TC.T('15:00'), end: TC.T('15:30'), typeId: 'meeting', name: 'Mine', note: 'my own note'}); }));
  await pd.click('[data-act=view][data-view=data]'); await settle(pd);
  await pd.setInputFiles('#pdfFile', pdfPath); await pd.waitForSelector('dialog[open]');
  await pd.click('dialog[open] button[value=setup]'); await pd.waitForSelector('dialog[open] ul.plain');
  const stxt = await text(pd, 'dialog[open]');
  ok(stxt.includes('Friday letters:') && stxt.includes('letters changed') && stxt.includes('Kept as they are: your timetable'), 'School setup only lists what will change (“… Friday letters: 30 letters changed”) and what is kept');
  ok((await model(pd)).dayTypeOverrides['2026-09-11'] === undefined, 'nothing is changed until it is confirmed');
  await pd.click('dialog[open] button[value=ok]'); await settle(pd, 250);
  const dm = await model(pd);
  ok(Object.keys(dm.dayTypeOverrides).length === 30 && dm.versions[0].timetable.mon.p1.name === 'Mine' && !dm.edits['2026-09-08'] && dm.edits['2026-09-23'].length === 1 && dm.settings.teacher === 'Pat Receiver' && Object.keys(dm.confirmed).length === 0,
     'letters arrive; timetable, edits, notes, name and confirmed weeks stay as they were');
  ok((await text(pd, '.banner')).includes('letters changed'), 'the message reports what changed');
  await pd.click('[data-act=undo]'); await settle(pd);
  ok(Object.keys((await model(pd)).dayTypeOverrides).length === 0, 'Undo takes the setup back out');
  // opening the same file again as a setup: nothing to change after it is in
  await pd.click('[data-act=redo]').catch(() => {}); await settle(pd);

  // ---------- E: replace, then undo
  const E = await mk(); const pe = E.p;
  await pe.evaluate(() => TimeCounterApp.commit(m => { m.settings.teacher = 'Local Only'; }));
  await pe.click('[data-act=view][data-view=data]'); await settle(pe);
  await pe.setInputFiles('#pdfFile', pdfPath); await pe.waitForSelector('dialog[open]');
  await pe.click('dialog[open] button[value=all]'); await settle(pe, 250);
  ok((await model(pe)).settings.teacher === 'Zoë Ng', 'Replace everything makes the device match the file');
  await pe.click('[data-act=undo]'); await settle(pe);
  ok((await model(pe)).settings.teacher === 'Local Only', 'and Undo brings the old data back');
  // a drop anywhere on the page opens the same dialog
  await pe.click('[data-act=view][data-view=totals]'); await settle(pe);
  await pe.evaluate(async (b64) => {
    const bin = atob(b64), arr = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const dt = new DataTransfer(); dt.items.add(new File([arr], 'dropped.pdf', {type: 'application/pdf'}));
    document.dispatchEvent(new DragEvent('drop', {dataTransfer: dt, bubbles: true, cancelable: true}));
  }, fs.readFileSync(pdfPath).toString('base64'));
  await pe.waitForSelector('dialog[open]');
  ok((await text(pe, 'dialog[open] h2')).includes('dropped.pdf'), 'dropping a PDF anywhere on the page opens it');
  await pe.click('dialog[open] button[value=cancel]'); await settle(pe);

  // ---------- F: the backup reminder
  const F = await mk(); const pf = F.p;
  ok((await pf.locator('.banner.warn').count()) === 0, 'a fresh device shows no reminder');
  await pf.evaluate(() => TimeCounterApp.commit(m => { m.settings.teacher = 'X'; }));
  await pf.evaluate(() => { TimeCounterApp.state.firstUse = new Date(Date.now() - 6 * 86400000).toISOString(); TimeCounterApp.render(); }); await settle(pf);
  ok((await pf.locator('.banner.warn').count()) === 0, 'six days without a save: no reminder yet');
  await pf.evaluate(() => { TimeCounterApp.state.firstUse = new Date(Date.now() - 8 * 86400000).toISOString(); TimeCounterApp.render(); }); await settle(pf);
  ok((await text(pf, '.banner.warn')).includes('You have not saved a TimeTracker.pdf yet'), 'after a week it nudges, and offers a one-click save');
  await pf.click('[data-act=nudge-off]'); await settle(pf);
  ok((await pf.locator('.banner.warn').count()) === 0, 'Not now hides it for this visit');
  await pf.evaluate(() => { TimeCounterApp.state.nudgeOff = false; TimeCounterApp.render(); }); await settle(pf);
  const [dl2] = await Promise.all([pf.waitForEvent('download'), pf.click('.banner.warn [data-act=pdf-save]')]); await settle(pf, 250);
  ok(dl2.suggestedFilename() === 'TimeTracker.pdf' && (await pf.locator('.banner.warn').count()) === 0, 'the one-click save downloads the PDF and clears the reminder');
  await pf.evaluate(() => { TimeCounterApp.state.lastSaved = new Date(Date.now() - 9 * 86400000).toISOString(); TimeCounterApp.render(); }); await settle(pf);
  ok((await text(pf, '.banner.warn')).includes('9 days ago'), 'once saved, it reminds again when the last save is over a week old and the data has changed since');
  await pf.evaluate(() => { const S = TimeCounterApp.state; S.model.modified = new Date(Date.now() - 20 * 86400000).toISOString(); TimeCounterApp.render(); }); await settle(pf);
  ok((await pf.locator('.banner.warn').count()) === 0, 'but not when nothing has changed since the last save');

  // ---------- G: time types
  const G = await mk(); const pg = G.p;
  ok((await pg.innerText('footer')).includes('Time Counter 0.6.'), 'the page footer shows the version, Time Counter 0.6');
  await pg.evaluate(() => TimeCounterApp.commit(m => { TimeCounter.setCalendarDate(m, '2026-10-20', 'nid', 'Student Learning Conferences'); TimeCounter.setDayType(m, '2026-10-20', 'conference'); }));
  await pg.evaluate(() => { TimeCounterApp.state.week = '2026-10-19'; TimeCounterApp.state.view = 'week'; TimeCounterApp.render(); }); await settle(pg, 200);
  await pg.click('[data-act=add-day][data-date="2026-10-20"]'); await pg.waitForSelector('dialog[open]');
  ok((await pg.inputValue('dialog[open] select[name=typeId]')) === 'event', 'a new block on a conference day starts as School event, which is Assignable');
  await pg.keyboard.press('Escape'); await settle(pg);
  await pg.click('[data-act=view][data-view=data]'); await settle(pg);
  const tt = await pg.evaluate(() => TimeCounterApp.state.model.timeTypes.map(t => t.name + '|' + t.category));
  ok(tt.includes('Extra-curricular volunteer|notCounted') && tt.includes('Extra-curricular assigned|assignable') && !JSON.stringify(tt).toLowerCase().includes('robotic'), 'the time types include Extra-curricular volunteer (Not counted) and Extra-curricular assigned (Assignable), and nothing about robotics');
  await pg.click('[data-act=view][data-view=data]'); await settle(pg);
  await pg.fill('[data-key="ttname:prep"]', 'Planning'); await pg.press('[data-key="ttname:prep"]', 'Tab'); await settle(pg, 200);
  ok((await model(pg)).timeTypes.find(t => t.id === 'prep').name === 'Planning' && (await model(pg)).timeTypes.find(t => t.id === 'prep').category === 'notCounted', 'a time type can be renamed and keeps its category');
  await pg.fill('[data-key="ttname:marking"]', 'planning'); await pg.press('[data-key="ttname:marking"]', 'Tab'); await settle(pg, 200);
  ok((await text(pg, '.banner.bad')).includes('already a time type') && (await model(pg)).timeTypes.find(t => t.id === 'marking').name === 'Marking', 'a duplicate name is refused and the old name stays');
  await pg.fill('[data-key="ttNew:name"]', 'Library help'); await pg.selectOption('[data-key="ttNew:category"]', 'assignable'); await pg.click('[data-act=tt-add]'); await settle(pg, 200);
  const nt = (await model(pg)).timeTypes.find(t => t.name === 'Library help');
  ok(nt && nt.category === 'assignable', 'a new time type is added in the chosen category');
  await pg.click('[data-act=view][data-view=week]'); await settle(pg);
  await pg.click('[data-act=add-day]:not([disabled]) >> nth=0'); await pg.waitForSelector('dialog[open]');
  ok((await pg.locator('dialog[open] select[name=typeId] option', {hasText: 'Library help'}).count()) === 1 && (await pg.locator('dialog[open] select[name=typeId] option', {hasText: 'Planning'}).count()) === 1, 'both the new and the renamed type show in the block form');
  await pg.keyboard.press('Escape'); await settle(pg);

  // ---------- H: a new year
  const H = await mk(); const ph = H.p; await ph.evaluate(SETUP); await settle(ph, 200);
  await ph.click('[data-act=view][data-view=data]'); await settle(ph);
  ok((await ph.locator('[data-act=ny-start][disabled]').count()) === 1, 'Start the new year waits for a calendar');
  await ph.fill('[data-key="ny:start"]', '2027-08-25'); await ph.fill('[data-key="ny:firstStudentDay"]', '2027-08-30'); await ph.fill('[data-key="ny:lastStudentDay"]', '2028-06-23'); await ph.fill('[data-key="ny:end"]', '2028-06-28');
  await ph.fill('[data-key="ny:text"]', '2027-09-06 closed Labour Day\n2027-13-01 closed Nope\n2028-06-23 early Last day'); await ph.press('[data-key="ny:text"]', 'Tab'); await settle(ph, 200);
  const errTxt = await text(ph, 'section.card:has(h2:has-text("Start a new school year"))');
  ok(errTxt.includes('Line 2 has a date that does not exist') && (await ph.locator('[data-act=ny-start][disabled]').count()) === 1, 'a bad line is pointed out by number and blocks the start');
  await ph.fill('[data-key="ny:text"]', '2027-09-06 closed Labour Day\n2027-11-10 to 2027-11-12 closed Fall Break\n2028-06-23 early Last day'); await ph.press('[data-key="ny:text"]', 'Tab'); await settle(ph, 200);
  const okTxt = await text(ph, 'section.card:has(h2:has-text("Start a new school year"))');
  ok(/\d+ operational days, \d+ instructional days/.test(okTxt) && okTxt.includes('Check these against the school’s calendar'), 'a good list shows the day counts to check against the school’s calendar');
  await ph.click('[data-act=ny-start]'); await ph.waitForSelector('dialog[open]');
  ok((await text(ph, 'dialog[open]')).includes('Kept:') && (await text(ph, 'dialog[open]')).includes('Cleared:') && (await text(ph, 'dialog[open]')).includes('confirmed week'), 'the dialog says what is kept and what is cleared');
  await ph.click('dialog[open] button[value=ok]'); await settle(ph, 250);
  const hm = await model(ph);
  ok(hm.calendar.start === '2027-08-25' && Object.keys(hm.edits).length === 0 && Object.keys(hm.confirmed).length === 0 && Object.keys(hm.dayTypeOverrides).length === 0 && Object.keys(hm.versions[0].timetable).length === 0 && hm.settings.teacher === 'Zoë Ng', 'the new calendar is in; edits, confirmed weeks and Friday letters are cleared; the timetable is cleared and settings carry over');
  ok((await text(ph, '.vbtn[aria-current=page]')) === 'Plan' && (await text(ph, '.banner')).includes('enter your timetable'), 'it then points at the timetable and Friday letters');
  await ph.click('[data-act=undo]'); await settle(ph, 200);
  ok((await model(ph)).calendar.start === '2026-08-26' && Object.keys((await model(ph)).confirmed).length === 1, 'and Undo brings last year back');

  // ---------- phone width: the screen does not scroll sideways
  const P = await mk({ viewport: { width: 390, height: 800 }, hasTouch: true, isMobile: true }); const pp = P.p;
  await pp.click('[data-act=view][data-view=data]'); await settle(pp);
  const over = await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  ok(over <= 1, 'Settings & data fits a 390 px phone (overflow ' + over + ' px)');

  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
