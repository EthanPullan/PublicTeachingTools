const { chromium } = require('playwright');
const URL = require('./common').URL;
let fails = 0;
const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1000 }, timezoneId: 'America/Edmonton' });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const settle = () => p.waitForTimeout(60);
  const tab = async t => { if(!(await p.$(`[data-act=tab][data-tab=${t}]`))) await p.click('[data-act=view][data-view=plan]'); await p.click(`[data-act=tab][data-tab=${t}]`); await settle(); };
  const sum = () => p.evaluate(() => { const s = TimeCounter.planSummary(TimeCounterApp.state.model).year; return {i:s.instructional,a:s.assignable,t:s.totalAssignable,n:s.notCounted,u:s.unassigned}; });
  const bellsOf = (m, dt) => { const v = m.versions[0]; return v.schedules[v.days[dt].schedule].bells; };
  const model = () => p.evaluate(() => JSON.parse(JSON.stringify(TimeCounterApp.state.model)));
  const dialog = async value => { await p.waitForSelector('dialog[open]'); await p.click(`dialog[open] button[value=${value}]`); await settle(); };

  await p.goto(URL); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('teachingtools:timeCounter:ui', '{"setupSeen":true}'); }); await p.goto(URL); await settle();
  ok((await p.innerText('#summary')).startsWith('Saved'), 'header shows the saved pill');

  // Friday letters: rotation fill
  await tab('rot');
  ok((await p.innerText('#app')).includes('30 of 31 school Fridays have no day type'), 'Friday tab warns about 30 unset Fridays');
  await p.click('[data-act=rot-fill]');
  ok((await p.innerText('dialog[open]')).includes('sets 30 Fridays'), 'fill dialog says it sets 30 Fridays');
  await dialog('ok');
  let m = await model();
  ok(Object.keys(m.dayTypeOverrides).length === 30 && m.dayTypeOverrides['2026-09-04'] === 'friA' && m.dayTypeOverrides['2026-10-02'] === 'friD', 'rotation set 30 Fridays (Sep 4 = A, Oct 2 = D)');
  ok((await p.innerText('#app')).includes('All 31 school Fridays have a day type'), 'banner now says all Fridays are set');
  await p.selectOption('[data-key="fri:2026-09-04"]', 'friC'); await settle();
  ok((await model()).dayTypeOverrides['2026-09-04'] === 'friC', 'a single Friday can be changed');
  await p.check('[data-key=onlyUnset]'); await settle();
  ok((await p.$$('[data-key^="fri:"]')).length === 0, 'show-only-unset hides the lettered ones');
  await p.uncheck('[data-key=onlyUnset]'); await settle();

  // Bells: type a class on Monday
  await tab('bells');
  await p.click('[data-act=dt-select][data-dt=mon]'); await settle();
  await p.selectOption('[data-key="bell:p1:type"]', 'class'); await settle();
  await p.fill('[data-key="bell:p1:cname"]', 'Math 8'); await p.press('[data-key="bell:p1:cname"]', 'Tab'); await settle();
  let s = await sum();
  ok(s.i === 34 * 51, 'Monday Period 1 as Class adds 34 x 51 min of Instructional (' + s.i + ')');
  ok((await model()).versions[0].timetable.mon.p1.name === 'Math 8', 'class name saved in the timetable');
  // keyboard focus survives the re-render: type in a field, Tab to the next control
  await p.click('[data-key="bell:p1:cname"]'); await p.keyboard.press('Control+A'); await p.keyboard.type('Math 9'); await p.keyboard.press('Tab'); await settle();
  let foc = await p.evaluate(() => { const a = document.activeElement; return a.dataset.act + ':' + a.dataset.id; });
  ok(foc === 'bell-split:p1', 'after typing a class name and pressing Tab, focus is on that row\'s Split button (' + foc + ')');
  ok((await model()).versions[0].timetable.mon.p1.name === 'Math 9', 'what was typed was saved');
  await p.fill('[data-key="bell:p1:cname"]', 'Math 8'); await p.press('[data-key="bell:p1:cname"]', 'Tab'); await settle();
  await p.fill('[data-key="bell:p1:start"]', '08:00'); await p.press('[data-key="bell:p1:start"]', 'Tab'); await settle();
  ok(bellsOf(await model(), 'mon')[0].start === 480, 'start time changed to 8:00');
  await p.fill('[data-key="bell:p1:end"]', '07:00'); await p.press('[data-key="bell:p1:end"]', 'Tab'); await settle();
  ok((await p.innerText('.banner.bad')).includes('end after'), 'an end before the start is refused with a message');
  ok(bellsOf(await model(), 'mon')[0].end === T('8:56'), 'and nothing changed');
  function T(x){ const [h,mm]=x.split(':').map(Number); return h*60+mm; }

  // split and merge
  await p.click('[data-act=bell-split][data-id=p2]'); await p.waitForSelector('dialog[open]');
  await p.fill('dialog[open] input[name=at]', '09:20'); await dialog('ok');
  m = await model();
  ok(bellsOf(m, 'mon').length === 9, 'split gives 9 periods');
  await p.click('[data-act=bell-merge][data-id=p2]'); await settle();
  m = await model();
  ok(bellsOf(m, 'mon').length === 8 && bellsOf(m, 'mon')[1].end === T('9:45'), 'merge puts it back');

  // remove a period that has a timetable entry, moving the entry
  await p.selectOption('[data-key="bell:p3:type"]', 'class'); await settle();
  await p.fill('[data-key="bell:p3:cname"]', 'Science 8'); await p.press('[data-key="bell:p3:cname"]', 'Tab'); await settle();
  await p.click('[data-act=bell-remove][data-id=p3]'); await p.waitForSelector('dialog[open]');
  ok((await p.innerText('dialog[open]')).includes('timetable entry'), 'removing a period with an entry asks what to do with it');
  await p.check('dialog[open] input[value=move]'); await p.selectOption('dialog[open] select[name=to]', 'p4'); await dialog('ok');
  m = await model();
  ok(!bellsOf(m, 'mon').some(x => x.id === 'p3') && m.versions[0].timetable.mon.p4.name === 'Science 8', 'period removed and its entry moved to Period 4');
  await p.click('#undo'); await settle();
  ok(bellsOf(await model(), 'mon').some(x => x.id === 'p3'), 'undo brings the period back');
  await p.click('#redo'); await settle();
  ok(!bellsOf(await model(), 'mon').some(x => x.id === 'p3'), 'redo removes it again');

  // new version
  await p.fill('[data-key=newVer]', '2027-01-04'); await p.click('[data-act=ver-new]'); await settle();
  m = await model();
  ok(m.versions.length === 2 && m.versions[1].start === '2027-01-04', 'a new version starts from Jan 4');
  ok((await p.innerText('.verbar')).includes('Mon, Jan 4, 2027') || (await p.innerText('.verbar')).includes('Jan 4, 2027'), 'the version bar names the start date');
  await p.selectOption('[data-key="bell:p1:type"]', 'prep'); await settle();
  m = await model();
  ok(m.versions[1].timetable.mon.p1.type === 'prep' && m.versions[0].timetable.mon.p1.type === 'class', 'editing the new version leaves the first one alone');
  await p.fill('[data-key=newVer]', '2027-01-04'); await p.click('[data-act=ver-new]'); await settle();
  await p.selectOption('[data-key=ver-pick]', '2026-08-26'); await settle();

  // duties
  await tab('duties');
  await p.click('[data-act=duty-new]'); await settle();
  await p.click('[data-act=duty-save]'); await settle();
  ok((await p.innerText('.banner.bad')).includes('name'), 'saving an empty duty explains what is missing');
  await p.fill('[data-key="d:name"]', 'Staff meeting'); await p.selectOption('[data-key="d:typeId"]', 'meeting');
  await p.fill('[data-key="d:start"]', '15:00'); await p.fill('[data-key="d:end"]', '16:00');
  await p.selectOption('[data-key="d:kind"]', 'nthWeekday'); await settle();
  await p.selectOption('[data-key="d:nth"]', '1'); await p.selectOption('[data-key="d:wd"]', '2');
  await p.click('[data-act=duty-save]'); await settle();
  m = await model();
  const duty = m.duties.find(d => d.name === 'Staff meeting');
  ok(duty && duty.rule.kind === 'nthWeekday' && duty.rule.n === 1 && duty.rule.weekday === 2 && duty.start === 900, 'duty saved: first Tuesday 3:00 to 4:00');
  ok((await p.innerText('#app')).includes('The 1st Tuesday of each month'), 'duty list describes the rule');
  await p.click(`[data-act=duty-dates][data-id=${duty.id}]`); await settle();
  ok((await p.$$(`[data-key^="occ:${duty.id}:"]`)).length === 10, 'ten occurrences are listed');
  await p.uncheck(`[data-key="occ:${duty.id}:2026-10-06"]`); await settle();
  ok((await model()).duties.find(d => d.id === duty.id).off[0] === '2026-10-06', 'one occurrence switched off');
  // weekly duty over a class -> conflict flagged
  await p.click('[data-act=duty-new]'); await settle();
  await p.fill('[data-key="d:name"]', 'Hall duty'); await p.fill('[data-key="d:start"]', '08:10'); await p.fill('[data-key="d:end"]', '08:30');
  await p.check('[data-key="d:dayTypes:mon"]'); await p.click('[data-act=duty-save]'); await settle();
  ok((await p.innerText('#app')).includes('overlaps a class on'), 'a duty over a class is flagged on the duty');
  await tab('preview');
  ok((await p.innerText('.checks')).includes('Hall duty overlaps a class'), 'and in the plan checks');

  // arrival and departure
  const before = await sum();
  await tab('arrival');
  await p.fill('[data-key=adArr]', '15'); await p.fill('[data-key=adDep]', '15'); await p.click('[data-act=ad-apply]'); await settle();
  const after = await sum();
  ok(Math.abs((after.t - before.t) - 181 * 30) < 1e-6, 'arrival and departure of 15 min each add 90.5 h Assignable (' + (after.t - before.t) / 60 + ')');
  ok(after.i === before.i, 'Instructional unchanged');
  await p.fill('[data-key="adov:friA:dep"]', '0'); await p.press('[data-key="adov:friA:dep"]', 'Tab'); await settle();
  ok((await model()).versions[0].days.friA.departure === 0, 'a day type can override departure');

  // limits (on Settings & data; the strip with the numbers is on Plan)
  const data = async () => { await p.click('[data-act=view][data-view=data]'); await settle(); };
  const plan = async () => { await p.click('[data-act=view][data-view=plan]'); await settle(); };
  await data();
  await p.fill('[data-key="set:fte"]', '0.5'); await p.press('[data-key="set:fte"]', 'Tab'); await settle();
  await plan();
  ok((await p.innerText('#app')).includes('Needs the school'), 'FTE 0.5 asks for typical hours in the strip');
  ok((await p.innerText('.strip')).includes('458.00 h'), 'instructional limit is 458.00 h');
  await data();
  await p.fill('[data-key="set:typicalAssignedHours"]', '1190'); await p.press('[data-key="set:typicalAssignedHours"]', 'Tab'); await settle();
  await plan();
  ok((await p.innerText('.strip')).includes('595.00 h'), 'total limit is 595.00 h with 1,190 h typical');
  await data();
  await p.fill('[data-key="set:fte"]', '2'); await p.press('[data-key="set:fte"]', 'Tab'); await settle();
  ok((await p.innerText('.banner.bad')).includes('FTE'), 'FTE 2 is explained as an error');
  await p.fill('[data-key="set:fte"]', '1'); await p.press('[data-key="set:fte"]', 'Tab'); await settle();

  // persistence
  const saved = await p.evaluate(() => localStorage.getItem('teachingtools:timeCounter:model'));
  await p.reload(); await settle();
  const again = await p.evaluate(() => localStorage.getItem('teachingtools:timeCounter:model'));
  ok(saved === again && JSON.parse(saved).duties.length === 3, 'everything is still there after a reload');
  const live = await model();
  ok(live.versions.length === 2 && live.dayTypeOverrides['2026-10-02'] === 'friD', 'the reloaded app uses the saved plan');

  // phone width: no horizontal page scroll on any tab
  const ph = await ctx.newPage({ viewport: { width: 390, height: 800 } });
  await ph.setViewportSize({ width: 390, height: 800 });
  await ph.goto(URL); await ph.waitForTimeout(100);
  await ph.click('[data-act=view][data-view=plan]'); await ph.waitForTimeout(60);
  for (const t of ['preview', 'daytypes', 'bells', 'arrival', 'duties', 'rot']) {
    await ph.click(`[data-act=tab][data-tab=${t}]`); await ph.waitForTimeout(60);
    const w = await ph.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth]);
    ok(w[0] <= w[1], `phone width, ${t}: no horizontal page scroll (${w[0]} / ${w[1]})`);
  }
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
