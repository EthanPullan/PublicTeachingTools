const { chromium } = require('playwright');
const URL = require('./common').URL;
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
const SETUP = () => TimeCounterApp.commit(m => { const TC = TimeCounter, v = m.versions[0];
  TC.applyRotation(m, TC.rotationPlan(m, {dayTypes:['friA','friB','friC','friD'], weekday:5, start:'2026-08-31', countNid:false}));
  const plan = {mon:['p1','p2','p3','p4','p6','p7'], tue:['p1','p2','p3','p5','p6','p8'], wed:['p1','p2','p3','p4','p5','p7'], thu:['p1','p2','p3','p4','p6','p8'], friA:['p1','p2','p3','p4'], friB:['p1','p2','p3','p4'], friC:['p1','p2','p3','p4'], friD:['p1','p2','p3','p4'], early:['p1','p2']};
  Object.keys(plan).forEach(dt => plan[dt].forEach((id, i) => TC.setTimetable(v, dt, id, {type:'class', name:['Math 8','Science 8','Math 9','CTF'][i%4]})));
  ['mon','tue','wed','thu'].forEach(dt => TC.setTimetable(v, dt, 'p5', {type:'prep', name:''}));
  TC.setTimetable(v,'tue','p4',{type:'prep',name:''});
  ['2026-09-08','2026-09-15','2026-11-03'].forEach(d => TC.coverClass(m, d, 'p4', {whose:'a colleague'}));
  TC.afterSchoolMeeting(m, '2026-09-22', {name:'Grad', minutes:60}); TC.afterSchoolMeeting(m, '2026-12-01', {name:'Staff', minutes:45});
  TC.confirmWeek(m, '2026-09-07', {at:'2026-09-11'});
});
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 }, timezoneId: 'America/Edmonton' });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-08T10:00:00') });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const settle = (n = 80) => p.waitForTimeout(n);
  const text = sel => p.innerText(sel);
  const hrsTxt = min => new Intl.NumberFormat('en-CA', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Math.round(min / 60 * 100) / 100) + ' h';
  await p.goto(URL); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('teachingtools:timeCounter:ui', '{"setupSeen":true}'); }); await p.goto(URL); await settle(200);
  await p.evaluate(SETUP); await settle(200);
  const dash = () => p.evaluate(() => { const ty = TimeCounter.trackYear(TimeCounterApp.state.model, '2026-10-08'); return TimeCounter.dashboard(TimeCounterApp.state.model, ty).map(d => ({key: d.key, projected: d.projected, toDate: d.toDate, level: d.level, headroom: d.headroom})); });

  await p.click('[data-act=view][data-view=totals]'); await settle(200);
  ok((await text('.vbtn[aria-current=page]')) === 'Totals', 'Totals is a view in the top navigation');
  ok((await text('.answer-card h2')) === 'Will I stay within my limits this year?', 'it leads with the question');
  ok((await text('.answer')).startsWith('So far so good'), 'with periods still untyped it says the plan is not finished, not a green Yes');
  // the confirmed week keeps the blocks it was confirmed with (untyped periods included), so unlock it, hand it back to the plan (which drops its edits), type everything, redo the cover, and confirm it again
  await p.evaluate(() => TimeCounterApp.commit(m => { const TC = TimeCounter; TC.unlockWeek(m, '2026-09-07'); TC.resetWeek(m, '2026-09-07'); m.versions.forEach(v => Object.keys(v.days).forEach(dt => TC.bellsOf(v, dt).forEach(b => { if(b.kind !== 'block' && !((v.timetable[dt] || {})[b.id] || {}).type) TC.setTimetable(v, dt, b.id, {type: 'prep', name: ''}); }))); TC.coverClass(m, '2026-09-08', 'p4', {whose: 'a colleague'}); TC.confirmWeek(m, '2026-09-07', {at: '2026-09-11'}); })); await settle(150);
  ok((await text('.answer')).startsWith('Yes') && (await p.locator('.answer.ok').count()) === 1, 'once every period has a time type it answers Yes, in green, while both limits have headroom');
  const d = await dash();
  const tiles = await p.locator('.tile').all();
  ok(tiles.length === 4, 'four tiles');
  for (let i = 0; i < 4; i++) ok((await tiles[i].locator('.big').innerText()) === hrsTxt(d[i].projected), `tile ${i + 1} shows the projected year: ${hrsTxt(d[i].projected)}`);
  ok((await text('.tile:nth-child(1) .kv')).includes(hrsTxt(d[0].toDate)) && (await text('.tile:nth-child(1) .kv')).includes('916.00 h'), 'the Instructional tile shows To date and the 916.00 h limit');
  ok((await text('.tile:nth-child(1) .kv')).includes('13% of the year'), 'with pace: 26 of 196 school days is 13% of the year');
  ok((await text('.tile:nth-child(3)')).includes('Against plan'), 'the Assignable-on-its-own tile has no limit and compares against the plan');
  ok((await p.locator('.tile .big').first().evaluate(e => getComputedStyle(e).fontVariantNumeric)) === 'normal', 'big numbers use proportional figures');
  ok((await text('.answer-card')).includes('Mostly +2.35 h coverage against your plan'), 'the cause is named: +2.35 h coverage');

  // warnings change colour and wording
  const setLimit = h => p.evaluate(x => TimeCounterApp.commit(m => { m.settings.limits.instructionalHours = x; }), h);
  await setLimit(d[0].projected / 60 / 0.96); await settle(150);
  ok((await text('.answer')).startsWith('Close') && (await p.locator('.tile:nth-child(1) .meter.near').count()) === 1 && (await text('.tile:nth-child(1) .lvl')).includes('Near the limit'), 'a projection at 96% of a limit is amber: "Close", with a Near the limit label');
  await setLimit(d[0].projected / 60 - 1); await settle(150);
  ok((await text('.answer')).startsWith('Not at this rate') && (await p.locator('.tile:nth-child(1) .meter.over').count()) === 1 && (await text('.tile:nth-child(1) .kv')).includes('(over)'), 'over the limit is red, says so in words, and shows the headroom as over');
  ok((await text('.answer-card')).includes('is 1.00 h over the'), 'naming how far over');
  await setLimit(d[0].toDate / 60 - 1); await settle(150);
  ok((await text('.answer-card')).includes('so far is already over'), 'actual time already over the limit says so');
  await setLimit(916); await settle(150);

  // charts
  ok((await p.locator('.chwrap').count()) === 2, 'two charts: Instructional and Total assignable');
  ok((await p.locator('.chwrap svg[aria-label]').first().getAttribute('aria-label')).includes('so far'), 'each has a text alternative');
  const box = await p.locator('.chwrap').first().boundingBox();
  await p.mouse.move(box.x + box.width * 0.5, box.y + 100); await settle(120);
  ok(await p.locator('.chtip:not([hidden])').count() === 1, 'hovering a chart shows a tooltip');
  const tip = await text('.chtip:not([hidden])');
  ok(/h instructional, running total/.test(tip) && /Week of/.test(tip) && /Even pace/.test(tip), 'it leads with the value, then the week and the even pace: ' + tip.replace(/\n/g, ' | '));
  await p.mouse.move(box.x + box.width * 0.5, 4); await settle(120);
  ok(await p.locator('.chtip:not([hidden])').count() === 0, 'and goes away when the pointer leaves');
  await p.focus('.chwrap'); await settle(100);
  const t1 = await text('.chtip:not([hidden])');
  await p.keyboard.press('ArrowRight'); await settle(80);
  const t2 = await text('.chtip:not([hidden])');
  ok(t1 && t2 && t1 !== t2 && /projected/.test(t2) && /so far/.test(t1), 'the keyboard reads it too: focus starts at "so far", the right arrow moves to the next week (projected)');
  await p.keyboard.press('End'); await settle(80);
  ok((await text('.chtip:not([hidden])')).includes('Even pace: 916.00 h'), 'End jumps to the end of the year (even pace reaches the 916.00 h limit)');
  await p.locator('.chfig').first().locator('summary').click(); await settle(80);
  const rows = await p.locator('.chfig').first().locator('tbody tr').count();
  const lastRow = await p.locator('.chfig').first().locator('tbody tr:last-child').innerText();
  ok(rows === 45 && lastRow.includes(hrsTxt(d[0].projected)), 'the table view has 45 weeks and ends at the projected year (' + hrsTxt(d[0].projected) + ')');

  // tables
  const monthTot = await text('.card:has(h2:has-text("By month")) tr.total');
  ok(monthTot.includes('196') && monthTot.includes(hrsTxt(d[0].projected)) && monthTot.includes(hrsTxt(d[1].projected)), 'the month table totals 196 school days and the projected year');
  ok((await p.locator('.card:has(h2:has-text("By month")) tbody tr').count()) === 12, 'eleven months and a total');
  await p.click('details.wkdet summary'); await settle(80);
  ok((await p.locator('details.wkdet tbody tr').count()) === 45, 'the week table has 45 weeks');
  const wk = await text('details.wkdet');
  ok(wk.includes('Confirmed') && /to review/.test(wk) && wk.includes('this week'), 'it marks the confirmed week, past weeks still to review, and this week');
  const drift = await text('.card:has(h2:has-text("moved from the plan"))');
  ok(drift.includes('+2.35 h') && drift.includes('−2.35 h') && drift.includes('Coverage'), 'drift is shown by category and by time type (+2.35 h coverage, −2.35 h Prep)');
  const nc = await text('.card:has(h2:has-text("Not counted: the record"))');
  ok(nc.includes('Prep') && nc.includes('Lunch / break') && nc.includes('All Not counted'), 'the Not counted record lists Prep and Lunch / break, with a total');

  // limits not known yet
  await p.evaluate(() => TimeCounterApp.commit(m => { m.settings.fte = 0.5; })); await settle(150);
  ok((await text('.tile:nth-child(1) .kv')).includes('458.00 h') && (await text('.tile:nth-child(2)')).includes('typical full-time hours'), 'at 0.5 FTE: Instructional limit 458.00 h, and Total assignable asks for the typical hours');
  ok((await text('.answer-card')).includes('add the school’s typical full-time hours'), 'and the answer says so');
  await p.evaluate(() => TimeCounterApp.commit(m => { m.settings.fte = 1; })); await settle(100);

  // a later date moves "to date"
  const later = await ctx.newPage();
  await later.clock.install({ time: new Date('2026-12-14T10:00:00') });
  await later.goto(URL); await later.waitForTimeout(200);
  await later.click('[data-act=view][data-view=totals]'); await later.waitForTimeout(200);
  const laterTo = await later.locator('.tile').first().locator('.kv dd').first().innerText();
  const nowTo = await p.locator('.tile').first().locator('.kv dd').first().innerText();
  ok(parseFloat(laterTo.replace(/,/g, '')) > parseFloat(nowTo.replace(/,/g, '')) * 2, 'with the date moved to Dec 14, "to date" is much larger (' + nowTo + ' → ' + laterTo + ')');
  await later.close();

  // phone width
  const ph = await (await b.newContext({ viewport: { width: 390, height: 800 }, timezoneId: 'America/Edmonton', hasTouch: true, isMobile: true })).newPage();
  await ph.clock.install({ time: new Date('2026-10-08T10:00:00') });
  await ph.goto(URL); await ph.waitForTimeout(200);
  await ph.click('[data-act=view][data-view=totals]'); await ph.waitForTimeout(250);
  const w = await ph.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
  ok(w[0] <= w[1], `phone width: no sideways page scroll (${w.join(' / ')})`);
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
