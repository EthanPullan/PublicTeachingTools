const { chromium } = require('playwright');
const url = require('./common').URL + '?test';
(async () => {
    const browser = await chromium.launch(require('./common').launchOptions);
  let bad = 0;
  for (const tz of ['America/Edmonton', 'UTC', 'Pacific/Auckland', 'Europe/London']) {
    const ctx = await browser.newContext({ timezoneId: tz });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    const t0 = Date.now();
    await page.goto(url);
    await page.waitForFunction(() => window.TimeCounterTest, null, {timeout: 60000});
    const r = await page.evaluate(() => window.TimeCounterTest);
    const ms = Date.now() - t0;
    if (!r) { console.log(tz, 'NO RESULT', errs); bad++; continue; }
    console.log(`${tz}: ${r.passed}/${r.ran} pass (${ms} ms)`, errs.length ? errs : '');
    if (tz === 'America/Edmonton') {
      for (const c of r.results) console.log(' ', String(c.n).padStart(2), c.pending ? 'pending '+c.pending : (c.pass ? 'PASS' : 'FAIL'), `(${c.asserts})`, c.title);
    }
    r.results.filter(c => c.pass === false).forEach(c => { bad++; console.log('   FAIL', c.n, c.failures); });
    await ctx.close();
  }
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
