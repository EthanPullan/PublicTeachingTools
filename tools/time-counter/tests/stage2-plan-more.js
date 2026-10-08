const { chromium } = require('playwright');
const URL = require('./common').URL;
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const p = await (await b.newContext({ viewport: { width: 1100, height: 1000 } })).newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const settle = () => p.waitForTimeout(60);
  const tab = async t => { if(!(await p.$(`[data-act=tab][data-tab=${t}]`))) await p.click('[data-act=view][data-view=plan]'); await p.click(`[data-act=tab][data-tab=${t}]`); await settle(); };
  const model = () => p.evaluate(() => JSON.parse(JSON.stringify(TimeCounterApp.state.model)));
  await p.goto(URL); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('teachingtools:timeCounter:ui', '{"setupSeen":true}'); }); await p.goto(URL); await settle();

  await tab('daytypes');
  await p.fill('[data-key="dtname:mon"]', 'Day 1'); await p.press('[data-key="dtname:mon"]', 'Tab'); await settle();
  ok((await model()).dayTypes.find(d => d.id === 'mon').name === 'Day 1', 'a day type can be renamed');
  await p.click('[data-act=dt-add]'); await settle();
  let m = await model();
  ok(m.dayTypes.length === 13 && m.dayTypes[12].name === 'New day type' && m.versions[0].days[m.dayTypes[12].id], 'adding a day type gives it an empty schedule in every version');
  const newId = m.dayTypes[12].id;
  await p.click(`[data-act=dt-copy][data-id=friA]`); await settle();
  m = await model();
  ok(m.dayTypes.length === 14 && m.dayTypes[13].name === 'Friday A copy' && m.versions[0].days[m.dayTypes[13].id].schedule === 'fri', 'a copy of Friday A follows the same Friday bell times');
  await p.selectOption('[data-key="wdDefault:5"]', 'friB'); await settle();
  ok((await model()).dayTypeDefaults.weekday[5] === 'friB', 'a weekday default can be set (Friday -> Friday B)');
  await tab('rot'); ok((await p.innerText('#app')).includes('All 31 school Fridays have a day type') || (await p.innerText('#app')).includes('no day type') === false, 'with a Friday default no Friday is left without a day type');
  await tab('daytypes'); await p.selectOption('[data-key="wdDefault:5"]', ''); await settle();
  // overrides
  await p.fill('[data-key=ovrDate]', '2026-09-08'); await p.selectOption('[data-key=ovrDt]', 'wed'); await p.click('[data-act=ovr-add]'); await settle();
  ok((await model()).dayTypeOverrides['2026-09-08'] === 'wed', 'a Tuesday can run a Wednesday schedule');
  ok((await p.innerText('#app')).includes('Tue Sep 8, 2026'), 'and the override is listed');
  await p.click('[data-act=ovr-rm][data-date="2026-09-08"]'); await settle();
  ok(!(await model()).dayTypeOverrides['2026-09-08'], 'and can be removed');
  // delete with usage message, then cancel with Escape
  await p.click('[data-act=dt-delete][data-id=thu]'); await p.waitForSelector('dialog[open]');
  const msg = await p.innerText('dialog[open]');
  ok(msg.includes('38 dates') && msg.includes('Thursday'), 'delete warns that it runs on 38 dates and is the Thursday default');
  await p.keyboard.press('Escape'); await settle();
  ok((await model()).dayTypes.some(d => d.id === 'thu'), 'Escape cancels the delete');
  await p.click('[data-act=dt-delete][data-id=thu]'); await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button[value=ok]'); await settle();
  m = await model();
  ok(!m.dayTypes.some(d => d.id === 'thu') && !m.dayTypeDefaults.weekday[4], 'confirming deletes it and clears the Thursday default');
  await tab('preview');
  ok((await p.innerText('.checks')).includes('Thursday'), 'Thursdays now show up as school days with no day type');
  await p.click('#undo'); await settle();
  ok((await model()).dayTypes.some(d => d.id === 'thu') && (await model()).dayTypeDefaults.weekday[4] === 'thu', 'undo restores the day type and its default');

  // placeholder
  await tab('preview');
  ok((await p.innerText('.checks')).includes('are a placeholder'), 'the Early dismissal placeholder is a plan check');
  await p.click('[data-act=ph-dismiss]'); await settle();
  ok(!(await p.innerText('#app')).includes('are a placeholder'), '"Mark as correct" clears it');
  await p.click('#undo'); await settle();
  // editing early's bells also clears it
  await tab('bells'); await p.click('[data-act=dt-select][data-dt=early]'); await settle();
  ok((await p.innerText('.banner.warn')).includes('Copy of the Friday periods'), 'the Early dismissal editor shows the placeholder notice');
  await p.fill('[data-key="bell:p5:end"]', '11:30'); await p.press('[data-key="bell:p5:end"]', 'Tab'); await settle();
  ok((await p.$$('.banner.warn')).length === 0, 'editing its bell times clears the notice');
  // block add + type
  await p.click('[data-act=dt-select][data-dt=mon]'); await settle();
  await p.click('[data-act=bell-add-block]'); await settle();
  m = await model();
  const blk = m.versions[0].schedules.mt.bells.find(x => x.kind === 'block');
  ok(blk && blk.id === 'b1' && blk.name === 'New block', 'adding a block creates a numbered-free block (b1)');
  await p.selectOption(`[data-key="bell:b1:type"]`, 'lunch'); await settle();
  ok((await model()).versions[0].schedules.mt.bells.find(x => x.id === 'b1').type === 'lunch', 'a block carries its own time type');

  // shared bell times
  await tab('bells'); await p.click('[data-act=dt-select][data-dt=tue]'); await settle();
  ok((await p.innerText('.schedbar')).includes('shared with') && (await p.innerText('.schedbar')).includes('Monday'), 'Tuesday says its bell times are shared with the other days');
  await p.fill('[data-key="bell:p2:end"]', '09:44'); await p.press('[data-key="bell:p2:end"]', 'Tab'); await settle();
  await p.click('[data-act=dt-select][data-dt=thu]'); await settle();
  ok((await p.inputValue('[data-key="bell:p2:end"]')) === '09:44', 'a time changed on Tuesday shows on Thursday');
  await p.click('[data-act=sched-split]'); await settle();
  ok((await p.innerText('.schedbar')).includes('Only Thursday uses these bell times'), 'Make Thursday different gives it its own bell times');
  await p.fill('[data-key="bell:p2:end"]', '09:40'); await p.press('[data-key="bell:p2:end"]', 'Tab'); await settle();
  await p.click('[data-act=dt-select][data-dt=wed]'); await settle();
  ok((await p.inputValue('[data-key="bell:p2:end"]')) === '09:44', 'and Wednesday did not move');
  await p.click('[data-act=dt-select][data-dt=thu]'); await settle();
  const keep = await p.evaluate(() => { const v = TimeCounterApp.state.model.versions[0]; return Object.keys(v.schedules).length; });
  await p.selectOption('[data-key=sched]', 'mt'); await settle();
  ok((await p.innerText('.schedbar')).includes('shared with') && (await p.inputValue('[data-key="bell:p2:end"]')) === '09:44', 'pointing Thursday back at the Mon–Thu times shares them again');
  ok((await p.evaluate(() => Object.keys(TimeCounterApp.state.model.versions[0].schedules).length)) === keep - 1, 'and its private copy is dropped');
  // removing a period shared by four days
  await p.click('[data-act=dt-select][data-dt=mon]'); await settle();
  await p.selectOption('[data-key="bell:p8:type"]', 'class'); await settle();
  await p.click('[data-act=dt-select][data-dt=tue]'); await settle();
  await p.selectOption('[data-key="bell:p8:type"]', 'prep'); await settle();
  await p.click('[data-act=bell-remove][data-id=p8]'); await p.waitForSelector('dialog[open]');
  const rm = await p.innerText('dialog[open]');
  ok(rm.includes('shared by') && rm.includes('Monday') && rm.includes('Tuesday'), 'removing a shared period says which days lose it and lists each day’s entry');
  await p.click('dialog[open] button[value=ok]'); await settle();
  m = await model();
  ok(!m.versions[0].schedules.mt.bells.some(x => x.id === 'p8') && !m.versions[0].timetable.mon.p8 && !m.versions[0].timetable.tue.p8, 'it is gone from all four, with each day’s entry');

  // reset
  await p.click('[data-act=view][data-view=data]'); await settle(); await p.click('[data-act=reset]'); await p.waitForSelector('dialog[open]'); await p.click('dialog[open] button[value=ok]'); await settle();
  m = await model();
  ok(m.versions.length === 1 && m.dayTypes.length === 12 && m.dayTypeDefaults.weekday[4] === 'thu', 'reset returns to the school template');
  await p.click('#undo'); await settle();
  ok((await model()).dayTypes.length === 14 || (await model()).dayTypes.length === 13, 'and reset can be undone');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
