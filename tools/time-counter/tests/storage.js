// Saved data that cannot be opened must never be thrown away: it is kept aside, the person is
// told, and the copy from the last good visit can be restored.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const common = require('./common'), URL = common.URL;
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
const KEY = 'teachingtools:timeCounter:model', GOOD = KEY + ':lastGood', BAD = KEY + ':unreadable';
(async () => {
  const b = await chromium.launch(common.launchOptions);
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, timezoneId: 'America/Edmonton', acceptDownloads: true });
  await ctx.addInitScript(() => { if(!localStorage.getItem('teachingtools:timeCounter:ui')) localStorage.setItem('teachingtools:timeCounter:ui', JSON.stringify({setupSeen: true})); });
  const p = await ctx.newPage(); const errs = [];
  p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const reload = async () => { await p.reload(); await p.waitForFunction(() => window.PDFLib); await p.waitForTimeout(250); };
  const teacher = () => p.evaluate(() => TimeCounterApp.state.model.settings.teacher);
  const get = k => p.evaluate(k => localStorage.getItem(k), k);
  const banner = () => p.locator('.banner.bad[role=alert]');

  await p.goto(URL); await p.waitForFunction(() => window.PDFLib); await p.waitForTimeout(250);
  ok((await banner().count()) === 0 && (await get(GOOD)) === null, 'a brand new device shows no warning and keeps no copy yet');
  await p.evaluate(() => TimeCounterApp.commit(m => { m.settings.teacher = 'Zoë Ng'; m.settings.school = 'Test School'; }));
  const original = await get(KEY);
  await reload();
  ok((await banner().count()) === 0 && (await get(GOOD)) === original && (await teacher()) === 'Zoë Ng', 'an ordinary visit shows no warning, and keeps a copy of the data as it found it');

  // cut off
  await p.evaluate(raw => localStorage.setItem('teachingtools:timeCounter:model', raw.slice(0, 600)), original);
  await reload();
  const cutRaw = original.slice(0, 600);
  ok((await banner().count()) === 1 && (await banner().innerText()).includes('could not be opened') && (await banner().innerText()).includes('cut off'), 'data that was cut off is reported, not hidden');
  ok((await teacher()) === '' && (await get(BAD)) === cutRaw && (await get(KEY)) === cutRaw, 'a blank year is shown, the unreadable copy is kept aside, and nothing is written over it yet');
  ok((await p.locator('.banner [data-act=lost-restore]').count()) === 1 && (await banner().innerText()).includes('last visit'), 'it offers the copy from the last good visit');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.banner [data-act=lost-download]')]);
  const f = path.join(common.out('storage'), 'unreadable.txt'); await dl.saveAs(f);
  ok(fs.readFileSync(f, 'utf8') === cutRaw && dl.suggestedFilename() === 'TimeCounter-unreadable-data.txt', 'the unreadable copy can be downloaded exactly as it was');
  await p.click('.banner [data-act=lost-restore]'); await p.waitForTimeout(250);
  ok((await teacher()) === 'Zoë Ng' && (await banner().count()) === 0 && (await get(KEY)) === original, 'Restore brings the earlier copy back, saved, and the warning goes');
  ok((await get(BAD)) === cutRaw, 'and the unreadable copy is still kept');

  // whole JSON, but not a usable year
  await p.evaluate(raw => { const m = JSON.parse(raw); delete m.calendar; localStorage.setItem('teachingtools:timeCounter:model', JSON.stringify(m)); }, original);
  await reload();
  ok((await banner().count()) === 1 && (await banner().innerText()).includes('calendar'), 'a year that is whole JSON but unusable is refused, with the reason');
  // a newer version of the tool made it
  await p.evaluate(raw => { const m = JSON.parse(raw); m.version = 99; localStorage.setItem('teachingtools:timeCounter:model', JSON.stringify(m)); }, original);
  await reload();
  ok((await banner().innerText()).includes('newer version'), 'data from a newer version of the tool is refused and called that');

  // starting again on a blank year does not lose the unreadable copy
  await p.click('.banner [data-act=lost-close]'); await p.waitForTimeout(150);
  const badBefore = await get(BAD);
  await p.evaluate(() => TimeCounterApp.commit(m => { m.settings.teacher = 'Started again'; }));
  ok((await get(BAD)) === badBefore && (await get(BAD)).includes('"version":99'), 'editing the blank year saves it but leaves the unreadable copy where it was');
  await p.click('[data-act=view][data-view=data]'); await p.waitForTimeout(200);
  ok((await p.locator('section.card:has(h2:has-text("Recovery"))').count()) === 1, 'Settings & data keeps a Recovery card after the warning is closed');
  await p.click('section.card:has(h2:has-text("Recovery")) [data-act=lost-restore]'); await p.waitForSelector('dialog[open]');
  ok((await p.innerText('dialog[open]')).includes('including anything you entered since'), 'restoring over new work asks first');
  await p.click('dialog[open] button[value=ok]'); await p.waitForTimeout(250);
  ok((await teacher()) === 'Zoë Ng', 'and then brings the earlier copy back');
  await p.click('[data-act=view][data-view=data]'); await p.waitForTimeout(150);
  await p.click('section.card:has(h2:has-text("Recovery")) [data-act=lost-delete]'); await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button[value=ok]'); await p.waitForTimeout(250);
  ok((await get(BAD)) === null, 'the unreadable copy can be deleted on purpose');

  // nothing earlier to go back to
  await p.evaluate(() => { localStorage.removeItem('teachingtools:timeCounter:model:lastGood'); localStorage.setItem('teachingtools:timeCounter:model', '{"broken'); });
  await reload();
  ok((await banner().innerText()).includes('no earlier copy') && (await p.locator('.banner [data-act=lost-restore]').count()) === 0, 'with no earlier copy it says so, rather than offering a restore that cannot work');
  ok((await get(BAD)) === '{"broken', 'and still keeps what it could not open');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
