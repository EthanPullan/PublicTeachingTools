const { chromium } = require('playwright');
const URL = require('./common').URL;
let fails = 0; const ok = (c, msg) => { if (!c) fails++; console.log((c ? 'ok   ' : 'FAIL ') + msg); };
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1100 }, timezoneId: 'America/Edmonton' });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-08T10:00:00') });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  const settle = (n = 80) => p.waitForTimeout(n);
  const model = () => p.evaluate(() => JSON.parse(JSON.stringify(TimeCounterApp.state.model)));
  const text = sel => p.innerText(sel);
  const T = x => { const [h, m] = x.split(':').map(Number); return h * 60 + m; };
  const blk = (date, ref) => p.locator(`.blk[data-date="${date}"][data-ref="${ref}"]`);
  const dialogOk = async v => { await p.waitForSelector('dialog[open]'); await p.click(`dialog[open] button[value=${v}]`); await settle(); };
  await p.goto(URL); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('teachingtools:timeCounter:ui', '{"setupSeen":true}'); }); await p.goto(URL); await settle(200);
  await p.evaluate(() => TimeCounterApp.commit(m => { const TC = TimeCounter, v = m.versions[0];
    TC.applyRotation(m, TC.rotationPlan(m, {dayTypes:['friA','friB','friC','friD'], weekday:5, start:'2026-08-31', countNid:false}));
    const plan = {mon:['p1','p2','p3','p4'], tue:['p1','p2','p3','p5','p6'], wed:['p2','p3','p4','p5','p6'], thu:['p1','p8'], friA:['p1','p2'], friB:['p1','p2'], friC:['p1','p2'], friD:['p1','p2']};
    Object.keys(plan).forEach(dt => plan[dt].forEach((id, i) => TC.setTimetable(v, dt, id, {type:'class', name:['Math 8','Science 8','Math 9','CTF'][i%4]})));
    TC.setTimetable(v,'tue','p4',{type:'prep',name:''});
  }));
  await settle(200);

  // ---- opens on this week
  ok((await text('.vbtn[aria-current=page]')) === 'This week', 'opens on This week');
  ok((await text('.wkt')).startsWith('Mon Oct 5') , 'showing the week of Oct 5 (today is Thu Oct 8)');
  ok((await p.$$('.wk-head')).length === 5 && (await text('.wk-head.today')).includes('Thu Oct 8'), 'Mon–Fri shown, with today highlighted');
  ok((await text('.review summary')).includes('6 past weeks not confirmed'), 'six past weeks are listed to review');
  await p.click('[data-act=wk-prev]'); await settle();
  ok((await text('.wkt')).startsWith('Mon Sep 28'), 'Previous goes back a week');
  await p.click('[data-act=wk-today]'); await settle();
  await p.fill('[data-key=wkDate]', '2026-11-18'); await p.press('[data-key=wkDate]', 'Tab'); await settle();
  ok((await text('.wkt')).startsWith('Mon Nov 16') && (await text('.wk-head.closed, .wk-head')).length > 0, 'the date picker jumps to that week (Nov 16)');
  await p.click('[data-act=wk-today]'); await settle();
  await p.check('[data-key=wkWeekend]'); await settle();
  ok((await p.$$('.wk-head')).length === 7, 'Show weekends adds Saturday and Sunday');
  await p.uncheck('[data-key=wkWeekend]'); await settle();

  // ---- add a block with the form
  const status = () => text('.stpill');
  ok((await status()) === 'Planned', 'the week starts as Planned');
  await p.click('[data-act=add-day][data-date="2026-10-06"]'); await p.waitForSelector('dialog[open]');
  ok((await p.inputValue('dialog[open] select[name=date]')) === '2026-10-06', 'the add form opens on that day');
  ok((await p.inputValue('dialog[open] input[name=start]')) === '14:45', 'starting at the end of that day (2:45)');
  await p.fill('dialog[open] input[name=name]', 'Meeting about grad'); await p.fill('dialog[open] input[name=end]', '15:30'); await p.fill('dialog[open] input[name=note]', 'Admin asked');
  await p.press('dialog[open] input[name=note]', 'Enter'); await settle(200);
  let m = await model();
  const added = (m.edits['2026-10-06'] || []).find(e => e.op === 'add');
  ok(added && added.start === T('14:45') && added.end === T('15:30') && added.note === 'Admin asked' && added.entered === '2026-10-08', 'Enter in the form saves it: 2:45–3:30, with the note and the date entered');
  ok((await status()) === '✎ Edited', 'the week is now Edited');
  ok((await text('.banner')).includes('Assignable +45 min'), 'the confirmation says Assignable +45 min');
  ok((await text('.weekfoot, section:has(h2:has-text("This week’s totals"))')).includes('+0.75 h'), 'the footer shows +0.75 h against the plan');
  ok((await p.$$('.blk.edited')).length === 1, 'the new block is marked as edited');
  await p.click('.banner [data-act=undo]'); await settle();
  ok(!((await model()).edits['2026-10-06']) && (await status()) === 'Planned', 'Undo from the message removes it');

  // ---- palette: press (keyboard route) and drag
  await p.focus('.pal[data-type=meeting]'); await p.keyboard.press('Enter'); await p.waitForSelector('dialog[open]');
  ok((await p.inputValue('dialog[open] select[name=typeId]')) === 'meeting', 'pressing a time type opens the add form with it chosen');
  await p.keyboard.press('Escape'); await settle();
  const pal = await p.locator('.pal[data-type=marking]').boundingBox();
  const body = await p.locator('.wk-body[data-date="2026-10-06"]').boundingBox();
  const lo = await p.evaluate(() => +document.querySelector('.wk-grid').dataset.rs);
  await p.mouse.move(pal.x + 10, pal.y + 8); await p.mouse.down(); await p.mouse.move(pal.x + 60, pal.y - 30, {steps: 4});
  await p.mouse.move(body.x + 60, body.y + (T('14:50') - lo) * 1.4, {steps: 8});
  ok(await p.locator('.wk-body.drop').count() === 1, 'dragging a time type highlights the day it would land on');
  await p.mouse.up(); await p.waitForSelector('dialog[open]');
  ok((await p.inputValue('dialog[open] select[name=date]')) === '2026-10-06' && (await p.inputValue('dialog[open] select[name=typeId]')) === 'marking' && (await p.inputValue('dialog[open] input[name=start]')) === '14:50', 'dropping it on Tuesday near 2:50 opens the form: Tue, Marking, 2:50');
  await p.fill('dialog[open] input[name=name]', 'Assignments'); await p.click('dialog[open] button[value=ok]'); await settle(200);
  ok((await model()).edits['2026-10-06'].some(e => e.typeId === 'marking' && e.start === T('14:50')), 'and saving adds the block');
  await p.click('.banner [data-act=undo]'); await settle();

  // ---- move and resize by dragging
  let box = await blk('2026-10-07', 'p5').boundingBox();     // Wed Period 5 (Class), 11:31-12:18
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 14, {steps: 4}); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 28, {steps: 4});
  ok(await p.locator('#tip:not([hidden])').count() === 1, 'a time tip shows while dragging');
  await p.mouse.up(); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open]')).includes('lowers Instructional time'), 'moving a class over another class asks before lowering Instructional time');
  await dialogOk('cancel');
  ok(!(await model()).edits['2026-10-07'], 'Cancel leaves the week alone');
  box = await blk('2026-10-07', 'p5').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 28, {steps: 8}); await p.mouse.up(); await p.waitForSelector('dialog[open]');
  await dialogOk('ok');
  let ch = (await model()).edits['2026-10-07'].find(e => e.op === 'change' && e.ref === 'p5');
  ok(ch && ch.start === T('11:51') && ch.end === T('12:38'), 'confirming moves it 20 min later (11:51–12:38)');
  ok((await blk('2026-10-07', 'p5').getAttribute('class')).includes('edited'), 'and it is marked as edited');
  await p.click('#undo'); await settle();
  // resize: drag the bottom edge of Thursday P8 (Class, ends 2:45) down 10 min (into free time)
  box = await blk('2026-10-08', 'p8').boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height - 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2, box.y + box.height + 12, {steps: 6}); await p.mouse.up(); await settle(200);
  ch = ((await model()).edits['2026-10-08'] || []).find(e => e.op === 'change' && e.ref === 'p8');
  ok(ch && ch.end === T('14:55') && !('start' in ch), 'dragging the bottom edge extends it to 2:55 and changes only the end');
  await p.click('#undo'); await settle();

  // ---- the block form
  await blk('2026-10-06', 'p2').click(); await p.waitForSelector('dialog[open]');
  ok((await p.inputValue('dialog[open] input[name=name]')) === 'Science 8' && (await p.inputValue('dialog[open] select[name=typeId]')) === 'class', 'clicking a block opens its form');
  await p.click('dialog[open] button[value=run10]'); await settle(200);
  ch = ((await model()).edits['2026-10-06'] || []).find(e => e.ref === 'p2');
  ok(ch && ch.end === T('9:55'), 'Ran over +10 extends it by 10 min (9:45 to 9:55)');
  await p.click('#undo'); await settle();
  await blk('2026-10-06', 'p1').focus(); await p.keyboard.press('Enter'); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open] h2')) === 'Edit block', 'a block opens with the keyboard too (Enter)');
  await p.fill('dialog[open] input[name=note]', 'Fire drill'); await p.selectOption('dialog[open] select[name=typeId]', 'prep');
  await p.click('dialog[open] button[value=ok]'); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open]')).includes('lowers Instructional'), 'retyping a Class as Prep asks first');
  await dialogOk('ok');
  ch = (await model()).edits['2026-10-06'].find(e => e.ref === 'p1');
  ok(ch.typeId === 'prep' && ch.note === 'Fire drill' && !('name' in ch), 'the change holds the new type and note, and does not store the unchanged name');
  await blk('2026-10-06', 'p1').click(); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open]')).includes('In the plan:'), 'an edited block shows what the plan had');
  await p.click('dialog[open] button[value=reset]'); await settle(200);
  ok(!(await model()).edits['2026-10-06'], 'Put back as planned removes the edit');
  // split
  await blk('2026-10-06', 'p1').click(); await p.waitForSelector('dialog[open]');
  await p.fill('dialog[open] input[name=splitAt]', '08:30'); await p.click('dialog[open] button[value=split]'); await settle(200);
  m = await model();
  ok(m.edits['2026-10-06'].length === 2 && await p.locator('.blk[data-date="2026-10-06"]').count() >= 9, 'Split makes two blocks');
  await p.click('#undo'); await settle();
  // delete a planned block, then reset it
  await blk('2026-10-08', 'p8').click(); await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button[value=del]'); await p.waitForSelector('dialog[open]');
  await dialogOk('ok');
  ok(((await model()).edits['2026-10-08'] || []).some(e => e.op === 'remove' && e.ref === 'p8') && await blk('2026-10-08', 'p8').count() === 0, 'deleting a planned class (after asking) removes it from the day');
  await p.click('#undo'); await settle();

  // ---- quick actions
  await p.click('[data-act=qa-cover]'); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open] select[name=blk]')).includes('Period 4') || (await p.locator('dialog[open] select[name=blk] option').count()) >= 1, 'Covered a class lists the week’s Prep blocks');
  await p.fill('dialog[open] input[name=whose]', 'a colleague'); await p.fill('dialog[open] input[name=start]', '10:42'); await p.click('dialog[open] button[value=ok]');
  ok((await text('dialog[open] .derr')).includes('both times'), 'one time without the other is explained');
  await p.fill('dialog[open] input[name=end]', '11:00'); await p.click('dialog[open] button[value=ok]'); await settle(200);
  m = await model();
  const cov = m.edits['2026-10-06'].find(e => e.typeId === 'coverage');
  ok(cov && cov.start === T('10:42') && cov.end === T('11:00') && cov.name === 'Coverage: a colleague', 'Covered a class turned 18 min of a Prep into Coverage');
  ok((await text('.banner')).includes('Instructional +18 min') && (await text('.banner')).includes('Not counted −18 min'), 'and says so: Instructional +18, Not counted −18');
  await p.click('[data-act=qa-ran]'); await p.waitForSelector('dialog[open]');
  await p.selectOption('dialog[open] select[name=blk]', '2026-10-05|p1'); await p.check('dialog[open] input[value=custom]'); await p.fill('dialog[open] input[name=custom]', '7'); await dialogOk('ok');
  ok(((await model()).edits['2026-10-05'] || []).some(e => e.ref === 'p1' && e.end === T('9:03')), 'Ran over (custom 7 min) extends Monday Period 1 from 8:56 to 9:03');
  await p.click('[data-act=qa-after]'); await p.waitForSelector('dialog[open]');
  await p.click('dialog[open] button[value=ok]'); ok((await text('dialog[open] .derr')).includes('name'), 'an after-school meeting asks for a name');
  await p.fill('dialog[open] input[name=name]', 'Staff meeting'); await p.selectOption('dialog[open] select[name=date]', '2026-10-09'); await dialogOk('ok');
  const fri = (await model()).edits['2026-10-09'].find(e => e.name === 'Staff meeting');
  ok(fri && fri.start === T('14:45') && fri.end === T('15:30'), 'on Friday it starts at 2:45, after the Friday meeting, not at the 12:10 last bell');
  await p.click('[data-act=qa-duty]'); await p.waitForSelector('dialog[open]');
  await p.check('dialog[open] input[value=drop]'); await dialogOk('ok');
  ok(((await model()).edits['2026-10-09'] || []).some(e => e.op === 'remove' && e.ref === 'duty:friMeeting'), 'Swap or drop a duty: dropping the Friday meeting this week only');
  await p.click('[data-act=qa-leave]'); await p.waitForSelector('dialog[open]');
  await p.selectOption('dialog[open] select[name=date]', '2026-10-07'); await dialogOk('ok');
  ok((await text('.wk-head:has-text("Wed Oct 7")')).includes('Sick leave'), 'Mark leave tags the day (Sick leave shown on Wednesday)');
  await p.click('[data-act=qa-daytype]'); await p.waitForSelector('dialog[open]');
  await p.selectOption('dialog[open] select[name=date]', '2026-10-09'); await p.selectOption('dialog[open] select[name=dt]', 'friC'); await dialogOk('ok');
  ok((await text('.wk-head:has-text("Fri Oct 9")')).includes('Friday C') && (await model()).dayTypeOverrides['2026-10-09'] === 'friA', 'Change day type: Friday ran as Friday C while the plan still says A');
  ok((await p.$$('.wk-head .pen')).length >= 3, 'days with edits show the pencil mark');
  await p.click('[data-act=qa-reset]'); await p.waitForSelector('dialog[open]');
  await p.selectOption('dialog[open] select[name=scope]', '2026-10-09'); await dialogOk('ok');
  ok(!(await model()).edits['2026-10-09'], 'Reset to plan for one day clears just that day');

  // ---- orphan edit flagged and deletable
  await p.evaluate(() => TimeCounterApp.commit(m => { TimeCounter.addEdit(m, '2026-10-05', {op:'change', ref:'p99', typeId:'prep'}); }));
  await settle(200);
  ok((await text('section:has(h2:has-text("Needs a look"))')).includes('no longer in the plan'), 'an edit pointing at a block that is gone is flagged');
  await p.click('[data-act=edit-del]'); await settle();
  ok(!((await model()).edits['2026-10-05'] || []).some(e => e.ref === 'p99'), 'and can be deleted');

  // ---- confirm and unlock
  await p.click('[data-act=wk-confirm]'); await p.waitForSelector('dialog[open]'); await dialogOk('ok');
  ok((await status()).includes('Confirmed') && (await p.locator('[data-act=add-day]:not([disabled])').count()) === 0, 'confirming locks the week (no Add buttons)');
  ok((await model()).confirmed['2026-10-05'].at === '2026-10-08', 'recording the day it was confirmed');
  await blk('2026-10-06', 'p2').click(); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open] h2')).includes('confirmed') && (await p.locator('dialog[open] input[name=name][disabled]').count()) === 1, 'a block in a confirmed week opens read-only');
  await p.keyboard.press('Escape'); await settle();
  box = await blk('2026-10-06', 'p2').boundingBox();
  const snap = JSON.stringify(await model());
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down(); await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 30, {steps: 5}); await p.mouse.up(); await settle();
  ok((await p.locator('dialog[open]').count()) === 0 && JSON.stringify(await model()) === snap, 'dragging a block in a confirmed week opens nothing and changes nothing');
  const bodyBox = await p.locator('.wk-body[data-date="2026-10-06"]').boundingBox();
  await p.mouse.click(bodyBox.x + 40, bodyBox.y + bodyBox.height - 6); await settle();
  ok((await p.locator('dialog[open]').count()) === 0, 'and clicking an empty slot adds nothing');
  // change the plan afterwards
  await p.evaluate(() => TimeCounterApp.commit(m => { TimeCounter.setTimetable(m.versions[0], 'tue', 'p1', {type:'prep', name:''}); }));
  await settle(200);
  const instr = () => p.evaluate(() => TimeCounter.weekSummary(TimeCounterApp.state.model, '2026-10-05').actual.instructional);
  const before = await instr();
  const shape = () => p.evaluate(() => JSON.stringify(TimeCounter.weekRange ? ['2026-10-05','2026-10-06','2026-10-07','2026-10-08','2026-10-09'].map(d => { const r = TimeCounter.resolveDay(TimeCounterApp.state.model, d); return [r.status, r.totals, r.blocks.map(b => [b.start, b.end, b.typeId, b.name, b.category, b.edited])]; }) : null));
  const shapeBefore = await shape();
  await p.click('[data-act=wk-unlock]'); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open]')).includes('keeps exactly what it shows now') && !(await text('dialog[open]')).includes('rebuilds'), 'the unlock dialog says the week keeps exactly what it shows');
  await dialogOk('ok');
  ok((await instr()) === before && (await shape()) === shapeBefore, 'unlocking changes nothing: same blocks, same totals, though the plan moved by 51 min since');
  ok((await status()).includes('Unlocked') && (await p.locator('.banner:has-text("exactly what it showed when it was confirmed")').count()) === 1, 'the week is marked Unlocked and a banner explains it');
  ok((await p.locator('.wk-head .pen').count()) === 0 && (await text('section:has(h2:has-text("This week’s totals"))')).includes('No edits since it was unlocked'), 'no pen marks and no edits are counted');
  ok((await model()).log.map(x => x.kind).join() === 'confirm,unlock', 'the confirm and unlock are logged');
  ok((await p.locator('[data-act=add-day]:not([disabled])').count()) > 0, 'the week can be edited again');
  // a calendar change cannot reach a kept week
  const calErr = await p.evaluate(() => { try{ TimeCounterApp.commit(m => { TimeCounter.setCalendarDate(m, '2026-10-06', {status: 'nid', label: 'x'}); }); return TimeCounterApp.state.flash && TimeCounterApp.state.flash.text; }catch(e){ return 'threw ' + e.message; } });
  ok(/was confirmed/.test(calErr || '') && (await p.evaluate(() => TimeCounter.statusOf(TimeCounterApp.state.model, '2026-10-06').status)) === 'instructional', 'a calendar change inside the kept week is refused with a reason');
  await settle(200);
  // an edit goes on top and moves only that
  await p.evaluate(() => TimeCounterApp.commit(m => { const d = TimeCounter.resolveDay(m, '2026-10-06'); const b = d.blocks.find(x => x.name === 'Class' || x.category === 'instructional'); TimeCounter.ranOver(m, '2026-10-06', b.ref, 5); })); await settle(200);
  ok((await status()).includes('Edited') && (await instr()) === before + 2, 'one edit on top moves only that block (+2 min) and the week becomes Edited');
  // reset to plan warns, and hands the week to today's plan
  await p.click('[data-act=qa-reset]'); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open]')).includes('today’s plan'), 'Reset to plan warns that a kept week will follow today’s plan');
  await dialogOk('ok'); await settle(200);
  ok((await text('dialog[open]')).includes('lowers Instructional time'), 'and, as it takes Instructional time away, asks again before doing it');
  await dialogOk('ok'); await settle(200);
  const planInstr = await p.evaluate(() => TimeCounter.weekSummary(TimeCounterApp.state.model, '2026-10-05').plan.instructional);
  ok((await instr()) === planInstr && planInstr < before && !(await status()).includes('Edited'), 'after the reset the week is exactly today’s plan');
  ok((await p.locator('.banner:has-text("exactly what it showed when it was confirmed")').count()) === 0, 'and the unlocked banner is gone');

  // ---- review list and calendar
  await p.click('.review summary'); await p.click('[data-act=wk-go][data-ws="2026-09-14"]'); await settle();
  ok((await text('.wkt')).startsWith('Mon Sep 14'), 'a week in the review list opens when clicked');
  await p.click('[data-act=view][data-view=cal]'); await settle();
  ok((await p.$$('.month')).length === 11 && (await text('.tbl tr.total')).includes('196') && (await text('.tbl tr.total')).includes('181'), 'the calendar shows 11 months and totals 196 / 181');
  await p.click('.cd[data-date="2026-10-20"]'); await settle();
  ok((await text('.wkt')).startsWith('Mon Oct 19'), 'clicking a date opens its week');
  await p.click('[data-act=view][data-view=cal]'); await p.check('[data-key=calEdit]'); await settle();
  await p.click('.cd[data-date="2026-10-20"]'); await p.waitForSelector('dialog[open]');
  await p.selectOption('dialog[open] select[name=status]', 'nid'); await p.fill('dialog[open] input[name=label]', 'Student Learning Conferences'); await dialogOk('ok');
  ok((await text('.tbl tr.total')).includes('181') === false && (await text('.tbl tr.total')).includes('180'), 'turning Oct 20 into a non-instruction day gives 180 instructional days');
  ok((await p.locator('.cd[data-date="2026-10-20"].edited').count()) === 1, 'and the date is marked as edited');
  await p.click('.cd[data-date="2026-10-20"]'); await p.waitForSelector('dialog[open]');
  ok((await text('dialog[open]')).includes('originally') , 'its original status is kept for reference');
  await p.click('dialog[open] button[value=revert]'); await settle(200);
  ok((await text('.tbl tr.total')).includes('181'), 'putting it back restores 181');
  await p.uncheck('[data-key=calEdit]'); await settle();

  // ---- everything survives a reload
  const saved = await p.evaluate(() => localStorage.getItem('teachingtools:timeCounter:model'));
  await p.reload(); await settle(200);
  ok(saved === await p.evaluate(() => localStorage.getItem('teachingtools:timeCounter:model')) && JSON.parse(saved).log.map(x => x.kind).join() === 'confirm,unlock', 'the log is still there after a reload');
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs));
  await b.close();
  console.log(fails ? fails + ' FAILED' : 'all passed'); process.exit(fails ? 1 : 0);
})();
