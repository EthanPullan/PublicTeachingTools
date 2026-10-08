const { chromium } = require('playwright');
const URL = require('./common').URL;
(async () => {
  const b = await chromium.launch(require('./common').launchOptions);
  const p = await b.newPage({ viewport: { width: 1100, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(URL); await p.evaluate(() => { localStorage.clear(); localStorage.setItem('teachingtools:timeCounter:ui', '{"setupSeen":true}'); }); await p.goto(URL);
  // build a stage-2 shaped model and save it as if an earlier visit had
  const before = await p.evaluate(() => {
    const TC = TimeCounter, m = TC.newModel();
    TC.applyRotation(m, TC.rotationPlan(m, {dayTypes:['friA','friB','friC','friD'], weekday:5, start:'2026-08-31', countNid:false}));
    ['p1','p2'].forEach(id => TC.setTimetable(m.versions[0], 'mon', id, {type:'class', name:'Math'}));
    const y = TC.yearTotals(m, {planOnly:true});
    const old = JSON.parse(JSON.stringify(m)); old.version = 1;
    // a real version 1 year predates the Full day assignable time defaults
    delete old.defaultsVersion; old.dayTypes = old.dayTypes.filter(d => d.id !== 'fullDay'); old.timeTypes = old.timeTypes.filter(t => t.id !== 'fullDay');
    old.versions.forEach(v => { delete v.days.fullDay; delete v.schedules.full; });
    old.versions.forEach(v => { Object.keys(v.days).forEach(id => { const sc = v.schedules[v.days[id].schedule]; v.days[id].bells = sc ? JSON.parse(JSON.stringify(sc.bells)) : []; if (sc && sc.placeholder) v.days[id].placeholder = sc.placeholder; delete v.days[id].schedule; }); delete v.schedules; });
    localStorage.setItem('teachingtools:timeCounter:model', JSON.stringify(old));
    return {i: y.instructional, a: y.assignable};
  });
  await p.goto(URL); await p.waitForTimeout(200);
  const after = await p.evaluate(() => { const s = TimeCounter.planSummary(TimeCounterApp.state.model).year; return {i: s.instructional, a: s.assignable, v: TimeCounterApp.state.model.version, sch: Object.keys(TimeCounterApp.state.model.versions[0].schedules).length, full: TimeCounterApp.state.model.defaultsVersion === 1 && TimeCounterApp.state.model.dayTypes.some(d => d.id === 'fullDay')}; });
  console.log('before', before, 'after', after);
  const ok = after.i === before.i && after.a === before.a && after.v === 2 && after.sch === 4 && after.full && errs.length === 0;   // mt, fri, early, and the added full day schedule
  console.log(ok ? 'migration e2e ok' : 'MIGRATION FAILED ' + JSON.stringify(errs));
  await b.close(); process.exit(ok ? 0 : 1);
})();
