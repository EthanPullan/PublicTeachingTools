const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const URL = require('./common').URL;
const EVIL = '<img src=x data-evil=1 onerror="window.__pwn=1">';
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const mk = async () => { const ctx = await b.newContext({ acceptDownloads: true, viewport: {width: 1300, height: 900}, timezoneId: 'America/Edmonton' }); await ctx.addInitScript(() => { if(!localStorage.getItem('teachingtools:timeCounter:ui')) localStorage.setItem('teachingtools:timeCounter:ui', JSON.stringify({setupSeen: true})); }); const p = await ctx.newPage(); p.on('dialog', d => d.dismiss()); await p.clock.install({ time: new Date('2026-10-08T10:00:00') }); await p.goto(URL); await p.waitForFunction(() => window.PDFLib); return p; };
  const a = await mk();
  await a.evaluate((E) => TimeCounterApp.commit(m => { const TC = TimeCounter, T = TC.T, v = m.versions[0];
    m.settings.teacher = E; m.settings.school = E; m.calendar.name = E; m.calendar.exceptions[1].label = E;
    m.dayTypes[0].name = E; m.timeTypes[0].name = E; m.timeTypes[0].includes = E;
    v.schedules.mt.name = E; v.schedules.mt.bells[0].name = E;
    TC.setTimetable(v, 'mon', 'p2', {type: 'class', name: E});
    m.duties[0].name = E;
    m.duties.push({id: 'x', name: E, typeId: 'supervision', start: T('8:00'), end: T('8:05'), from: null, to: null, off: [], shared: true, rule: {kind: 'weekly', dayTypes: ['mon']}});
    TC.addBlock(m, '2026-10-06', {start: T('15:00'), end: T('15:30'), typeId: 'meeting', name: E, note: E});
    TC.setLeave(m, '2026-10-07', 'sick', {note: E});
    TC.confirmWeek(m, '2026-09-07', {at: '2026-09-11'});
  }), EVIL);
  await a.click('[data-act=view][data-view=data]');
  const [dl] = await Promise.all([a.waitForEvent('download'), a.click('[data-act=pdf-save]')]);
  const f = path.join(require('./common').out('hostile'), 'evil.pdf'); await dl.saveAs(f);
  const p = await mk();
  await p.click('[data-act=view][data-view=data]'); await p.setInputFiles('#pdfFile', f); await p.waitForSelector('dialog[open]');
  const bad = async where => { const n = await p.locator('[data-evil]').count(), pwn = await p.evaluate(() => window.__pwn); if(n || pwn) console.log('FAIL injected at', where, n, pwn); return n || pwn; };
  let fails = 0;
  fails += await bad('import dialog') ? 1 : 0;
  await p.click('dialog[open] button[value=setup]'); await p.waitForSelector('dialog[open] ul.plain'); fails += await bad('setup dialog') ? 1 : 0;
  await p.click('dialog[open] button[value=back]'); await p.click('dialog[open] button[value=all]'); await p.waitForTimeout(300);
  for (const v of ['week', 'cal', 'totals', 'data']) { await p.click(`[data-act=view][data-view=${v}]`); await p.waitForTimeout(250); fails += await bad('view ' + v) ? 1 : 0; }
  await p.click('[data-act=view][data-view=totals]');
  await p.evaluate(() => { TimeCounterApp.state.week = '2026-10-05'; });
  for (const r of ['year', 'week', 'log', 'dash']) { await p.click(`[data-act=rep][data-rep=${r}]`); await p.waitForTimeout(250); fails += await bad('report ' + r) ? 1 : 0; }
  await p.click('[data-act=view][data-view=setup]').catch(() => {});
  await p.evaluate(() => { TimeCounterApp.state.view = 'setup'; TimeCounterApp.state.setupStep = 3; TimeCounterApp.render(); }); await p.waitForTimeout(250); fails += await bad('setup step 3') ? 1 : 0;
  await p.evaluate(() => { TimeCounterApp.state.setupStep = 4; TimeCounterApp.render(); }); await p.waitForTimeout(250); fails += await bad('setup step 4') ? 1 : 0;
  await p.click('[data-act=setup-close]');
  await p.click('[data-act=view][data-view=plan]');
  for (const t of ['preview', 'daytypes', 'bells', 'arrival', 'duties', 'rot']) { await p.click(`[data-act=tab][data-tab=${t}]`); await p.waitForTimeout(200); fails += await bad('plan ' + t) ? 1 : 0; }
  await p.click('[data-act=view][data-view=week]'); await p.evaluate(() => { TimeCounterApp.state.week = '2026-10-05'; TimeCounterApp.render(); }); await p.waitForTimeout(250);
  fails += await bad('week of the block') ? 1 : 0;
  await p.locator('.blk').filter({hasText: 'evil'}).first().click({timeout: 3000}).catch(() => {}); await p.waitForTimeout(300); fails += await bad('block form') ? 1 : 0;
  console.log(fails ? 'XSS FAILED' : 'no injected markup anywhere');
  await b.close(); process.exit(fails ? 1 : 0);
})();
