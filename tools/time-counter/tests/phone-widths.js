const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const ctx = await b.newContext({ viewport: { width: 390, height: 800 }, timezoneId: 'America/Edmonton', hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-08T10:00:00') });
  const U = require('./common').URL;
  await p.goto(U); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('teachingtools:timeCounter:ui', '{"setupSeen":true}'); }); await p.goto(U); await p.waitForTimeout(200);
  let bad = 0;
  for (const v of ['week', 'cal', 'plan']) {
    await p.click(`[data-act=view][data-view=${v}]`); await p.waitForTimeout(100);
    const w = await p.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    console.log(v, w.join(' / '), w[0] <= w[1] ? 'ok' : 'PAGE SCROLLS SIDEWAYS'); if (w[0] > w[1]) bad++;
  }
  await p.click('[data-act=view][data-view=week]'); await p.waitForTimeout(100);
  // a tap on a block opens its form (touch)
  await p.evaluate(() => TimeCounterApp.commit(m => { TimeCounter.setTimetable(m.versions[0], 'tue', 'p1', {type:'class', name:'Math 8'}); }));
  await p.waitForTimeout(150);
  await p.locator('.daybar [data-date="2026-10-06"]').tap(); await p.waitForTimeout(150);
  await p.locator('.blk[data-date="2026-10-06"][data-ref="p1"]').tap(); await p.waitForTimeout(200);
  const open = await p.locator('dialog[open]').count();
  console.log('tap on a block opens the form:', open === 1 ? 'ok' : 'FAIL'); if (open !== 1) bad++;
  await p.screenshot({ path: require('path').join(require('./common').out('phone'), 'phone-form.png') });
  await b.close(); process.exit(bad ? 1 : 0);
})();
