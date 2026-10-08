/* Time Counter self-test. index.html fetches this file only when the address ends in ?test,
   so the tool itself never needs it. It runs every check in the page and shows pass or fail
   for each; the results are also in window.TimeCounterTest. */
/* =====================================================================
   Self-test: open this page with ?test at the end of the address.
   Checks are numbered as in the design brief. Stage 1 owns 1–13, 15–17 and 21;
   stage 5 owns 14 and 18–20. The PDF checks wait for the PDF library, which loads last.
   ===================================================================== */
(async function(){
'use strict';
const TC = window.TimeCounter, T = TC.T;
const out = document.getElementById('out'), summary = document.getElementById('summary');
const params = new URLSearchParams(location.search);
if(!params.has('test')) return;
document.getElementById('stageNote').innerHTML = 'Time Counter ' + TC.VERSION + ' self-test. Checks are numbered as in the design brief.';

const FRI = ['friA', 'friB', 'friC', 'friD'];
const results = [], jobs = [];
const libReady = new Promise(res => { if(window.PDFLib) res(); else window.addEventListener('load', () => res()); });

// A check may be async (the PDF ones are); its result is filled in when it finishes.
function check(n, title, fn){
  const a = [];
  const t = {
    ok(c, msg){ a.push({pass: !!c, msg}); },
    eq(got, want, msg){
      const pass = JSON.stringify(got) === JSON.stringify(want);
      a.push({pass, msg: msg + (pass ? '' : ' — got ' + JSON.stringify(got) + ', expected ' + JSON.stringify(want))});
    }
  };
  const rec = {n, title, asserts: a, pass: false};
  const done = () => { rec.pass = a.length > 0 && a.every(x => x.pass); };
  results.push(rec);
  try{
    const r = fn(t);
    if(r && typeof r.then === 'function') jobs.push(r.then(done, e => { a.push({pass: false, msg: 'Threw: ' + e.message}); done(); }));
    else done();
  }catch(e){ a.push({pass:false, msg:'Threw: ' + e.message}); done(); }
}
function pending(n, title, stage){ results.push({n, title, pending:stage}); }

// Give every school Friday that has no day type a letter, A to D in turn.
function lettered(m){
  TC.missingDayTypeDates(m, 5).forEach((d, i) => TC.setDayType(m, d, FRI[i % 4]));
}
// A starting timetable: the periods each day type teaches a class in.
const CLASS_PLAN = {mon:['p1','p2','p3','p4'], tue:['p1','p2','p3'], wed:['p2','p3','p4','p5','p6'], thu:['p1','p8'],
                    friA:['p1','p2'], friB:['p1','p2'], friC:['p1','p2'], friD:['p1','p2'], early:['p1','p2']};
function withClasses(){
  const m = TC.newModel(); lettered(m);
  const v = m.versions[0];
  Object.keys(CLASS_PLAN).forEach(dt => CLASS_PLAN[dt].forEach(id => TC.setTimetable(v, dt, id, {type:'class', name:'Class'})));
  return m;
}
const blockSig = d => d.blocks.map(b => [b.start, b.end, b.typeId, b.name, b.ref]);
const diff = (a, b, k) => b.totals[k] - a.totals[k];

check(1, 'Load the 2026–27 calendar', t => {
  const m = TC.newModel(), c = TC.countDays(m);
  t.eq(c.operational, 196, 'operational days');
  t.eq(c.instructional, 181, 'instructional days');
  t.eq([c.nid, c.convention], [13, 2], 'non-instruction days and Convention days');
  t.eq([1,2,3,4,5].map(w => c.byWeekday[w]), [34, 40, 38, 38, 31], 'instructional days Mon–Fri (matches the Excel)');
  const pdf = {'2026-08':[4,1],'2026-09':[20,19],'2026-10':[21,20],'2026-11':[18,17],'2026-12':[14,14],'2027-01':[20,19],
               '2027-02':[19,16],'2027-03':[17,16],'2027-04':[22,21],'2027-05':[20,19],'2027-06':[21,19]};
  Object.keys(pdf).forEach(mo => t.eq([c.byMonth[mo].operational, c.byMonth[mo].instructional], pdf[mo], 'month ' + mo + ' (operational, instructional) matches the CBE table'));
  t.eq(TC.datesWhere(m, (d, st) => TC.weekday(d) === 5 && st.status === 'instructional').length, 31, 'instructional Fridays');
  const m2 = TC.newModel();
  TC.setCalendarDate(m2, '2026-10-20', 'nid', 'Student Learning Conferences');
  const e = TC.statusOf(m2, '2026-10-20');
  t.ok(e.edited && e.original.status === 'instructional' && e.status === 'nid', 'an edited date is marked and keeps its original status');
  t.eq(TC.countDays(m2).instructional, 180, 'editing one date to a non-instruction day updates the counts');
});

check(2, 'Same minutes per weekday as the Excel', t => {
  // The Excel's minutes-per-day cells are empty, so this test types its own: the
  // minutes below are the sums of the Class periods in CLASS_PLAN, added by hand.
  const m = withClasses();
  const mins = {1:192, 2:145, 3:237, 4:98, 5:101};
  const days = {1:34, 2:40, 3:38, 4:38, 5:31};                // Excel B15:B19
  const want = [1,2,3,4,5].reduce((s, w) => s + days[w] * mins[w], 0);   // days × minutes
  const y = TC.yearTotals(m, {planOnly:true});
  t.eq(y.instructional, want, 'instructional minutes = days × minutes per day, summed');
  t.eq(TC.hours(y.instructional), TC.hours(want), 'and in hours (' + TC.hours(want) + ' h)');
});

check(3, 'Mark a 50-minute Prep as “Covered a class”', t => {
  const m = TC.newModel(), v = m.versions[0], d = '2026-09-04';
  TC.setDayType(m, d, 'friA');
  TC.setTimetable(v, 'friA', 'p2', {type:'prep', name:'Prep'});
  const a = TC.resolveDay(m, d);
  t.eq(a.blocks.find(b => b.ref === 'p2').minutes, 50, 'Friday Period 2 is the 50-minute Prep');
  TC.coverClass(m, d, 'p2', {whose:'a colleague'});
  const b = TC.resolveDay(m, d);
  t.eq(diff(a, b, 'instructional'), 50, 'Instructional +50 min');
  t.eq(diff(a, b, 'notCounted'), -50, 'Not counted −50 min');
  t.eq(b.totals.total, a.totals.total, 'the day’s total minutes are unchanged');
  const d2 = '2026-09-11';
  TC.setDayType(m, d2, 'friA');
  const a2 = TC.resolveDay(m, d2);
  TC.coverClass(m, d2, 'p2', {start:T('8:58'), end:T('9:18')});
  const b2 = TC.resolveDay(m, d2);
  t.eq([diff(a2, b2, 'instructional'), diff(a2, b2, 'notCounted'), b2.totals.total - a2.totals.total], [20, -20, 0], 'covering part of a Prep moves only those minutes');
});

check(4, 'Add a 45-minute meeting after the last bell', t => {
  const m = withClasses(), d = '2026-09-08';       // a Tuesday; last bell 2:45 pm
  const a = TC.yearTotals(m);
  TC.addEdit(m, d, {op:'add', start:T('14:45'), end:T('15:30'), typeId:'meeting', name:'Meeting about grad', note:'Admin asked'});
  const b = TC.yearTotals(m);
  t.eq(b.assignable - a.assignable, 45, 'Assignable +45 min (0.75 h)');
  t.eq(b.totalAssignable - a.totalAssignable, 45, 'Total assignable +45 min');
  t.eq(b.instructional, a.instructional, 'Instructional unchanged');
  t.eq(TC.hours(45), 0.75, '45 min displays as 0.75 h');
});

check(5, 'Mark a day as sick leave', t => {
  const m = withClasses(), d = '2026-09-08';
  const a = TC.yearTotals(m);
  TC.addEdit(m, d, {op:'leave', kind:'sick'});
  const b = TC.yearTotals(m), day = TC.resolveDay(m, d);
  t.eq(b, a, 'no total changes');
  t.eq(day.leave && day.leave.kind, 'sick', 'the day carries the leave tag');
});

check(6, 'Open Feb 11 and 12', t => {
  const m = withClasses();
  TC.addEdit(m, '2027-02-11', {op:'add', start:T('9:00'), end:T('10:00'), typeId:'class', name:'Class'});
  m.duties.push({id:'x', name:'Meeting', typeId:'meeting', start:T('13:00'), end:T('14:00'), off:[], rule:{kind:'dates', dates:['2027-02-11','2027-02-12']}});
  const a = TC.resolveDay(m, '2027-02-11'), b = TC.resolveDay(m, '2027-02-12');
  t.eq([a.status, b.status], ['convention', 'convention'], 'both dates are Teachers’ Convention');
  t.eq([a.totals.assignable, b.totals.assignable], [360, 360], '6 h Assignable each, whatever blocks are on them');
  t.eq([a.totals.instructional + b.totals.instructional, a.totals.notCounted + b.totals.notCounted], [0, 0], 'nothing else is counted');
  t.eq(TC.hours(a.totals.assignable + b.totals.assignable), 12, '12 h in all');
  t.ok(!a.flags.some(f => f.code === 'missing-day-type'), 'no missing-day-type flag on a Convention day');
});

check(7, 'Start a new timetable version on Jan 4', t => {
  const m = withClasses(), start = m.calendar.start;
  const sum = (a, b) => TC.sumRange(m, a, b);
  TC.confirmWeek(m, '2027-01-11');
  const before = sum(start, '2027-01-03'), conf = sum('2027-01-11', '2027-01-17'), open = sum('2027-01-18', '2027-01-24');
  const v = TC.ensureVersion(m, '2027-01-04');
  ['mon','tue','wed','thu'].forEach(dt => TC.setTimetable(v, dt, 'p1', {type:'prep', name:''}));
  t.eq(m.versions.map(x => x.start), [start, '2027-01-04'], 'the plan now has two versions');
  t.eq(sum(start, '2027-01-03'), before, 'nothing before Jan 4 changes');
  t.eq(sum('2027-01-11', '2027-01-17'), conf, 'the confirmed week does not change');
  t.ok(sum('2027-01-18', '2027-01-24').instructional < open.instructional, 'an unconfirmed week from Jan 4 does pick up the change');
});

check(8, 'Lunch supervision over a Lunch block', t => {
  const m = TC.newModel(), d = '2026-09-04';
  TC.setDayType(m, d, 'friA');
  const a = TC.resolveDay(m, d);
  m.duties.push({id:'ls', name:'Lunch supervision', typeId:'supervision', start:T('12:10'), end:T('12:35'), off:[],
                 rule:{kind:'weekly', dayTypes:FRI}});
  const b = TC.resolveDay(m, d);
  t.eq(diff(a, b, 'assignable'), 25, 'Assignable +25 min as Supervision');
  t.eq(diff(a, b, 'notCounted'), -25, 'Lunch loses the same 25 min');
  t.eq(b.totals.total, a.totals.total, 'the overlap is counted once (day total unchanged)');
  const inside = b.blocks.filter(x => x.start >= T('12:10') && x.end <= T('12:35'));
  t.eq(inside.map(x => x.typeId), ['supervision'], '12:10–12:35 is one Supervision block');
  // Monday to Thursday: no period is pre-typed as Lunch, so the teacher types one.
  const tu = '2026-09-08', v = m.versions[0];
  TC.setTimetable(v, 'tue', 'p6', {type:'lunch', name:'Lunch'});
  const c = TC.resolveDay(m, tu);
  m.duties.push({id:'ls2', name:'Lunch supervision', typeId:'supervision', start:T('12:30'), end:T('12:55'), off:[],
                 rule:{kind:'weekly', dayTypes:['tue']}});
  const e = TC.resolveDay(m, tu);
  t.eq([diff(c, e, 'assignable'), diff(c, e, 'notCounted'), e.totals.total - c.totals.total], [25, -25, 0], 'same result on a Tuesday');
});

check(9, 'A planned duty overlaps a Class', t => {
  const m = TC.newModel(), d = '2026-09-04';
  TC.setDayType(m, d, 'friA');
  TC.setTimetable(m.versions[0], 'friA', 'p2', {type:'class', name:'Math 8'});
  const a = TC.resolveDay(m, d);
  m.duties.push({id:'hall', name:'Hall duty', typeId:'supervision', start:T('9:00'), end:T('9:20'), off:[],
                 rule:{kind:'weekly', dayTypes:['friA']}});
  const b = TC.resolveDay(m, d);
  const f = b.flags.find(x => x.code === 'duty-conflict');
  t.ok(f && f.minutes === 20, 'flagged as a conflict (20 min)');
  t.eq(b.totals.total, a.totals.total, 'the minutes are counted once (day total unchanged)');
  t.eq([diff(a, b, 'instructional'), diff(a, b, 'assignable')], [-20, 20], 'the duty, as the later layer, takes the 20 minutes');
});

check(10, 'A 4-minute gap between two classes', t => {
  const m = TC.newModel(), v = m.versions[0], d = '2026-09-14';   // a Monday
  TC.addDayType(m, {id:'x', name:'Test day'});
  [['9:00','9:50'], ['9:54','10:40'], ['10:50','11:30'], ['11:41','12:20']].forEach(p => {
    const id = TC.addPeriod(v, 'x', {start:T(p[0]), end:T(p[1])});
    TC.setTimetable(v, 'x', id, {type:'class', name:'Class'});
  });
  TC.setDayType(m, d, 'x');
  const day = TC.resolveDay(m, d);
  const tr = day.blocks.filter(b => b.typeId === 'transition');
  t.eq(tr.map(b => [b.start, b.end]), [[T('9:50'), T('9:54')], [T('10:40'), T('10:50')]], 'the 4-minute gap and the 10-minute gap are shown as Transition blocks');
  t.eq(day.totals.assignable, 14, 'and counted as Assignable (4 + 10 min)');
  const lg = day.flags.filter(f => f.code === 'long-gap');
  t.eq(lg.map(f => f.minutes), [11], 'an 11-minute gap stays empty and is flagged');
  t.ok(!day.blocks.some(b => b.start >= T('11:30') && b.end <= T('11:41')), 'and nothing is counted in it');
});

check(11, 'An instructional Friday has no letter', t => {
  const m = TC.newModel();
  const list = TC.datesWhere(m, (d, st) => TC.weekday(d) === 5 && st.status === 'instructional');
  const missing = TC.missingDayTypeDates(m, 5);
  t.eq([list.length, missing.length], [31, 30], '31 instructional Fridays in the list; 30 flagged (June 25 already runs Early dismissal)');
  t.ok(!missing.includes('2027-06-25'), 'June 25 is not flagged');
  t.ok(TC.resolveDay(m, '2026-09-04').flags.some(f => f.code === 'missing-day-type'), 'flagged on the day');
  t.ok(TC.weekFlags(m, '2026-08-31').some(f => f.date === '2026-09-04' && f.code === 'missing-day-type'), 'flagged in its week');
  t.ok((TC.flagsByDate(m)['2026-09-04'] || []).some(f => f.code === 'missing-day-type'), 'flagged for the year view');
  TC.setDayType(m, '2026-09-04', 'friB');
  t.eq(TC.missingDayTypeDates(m, 5).length, 29, 'setting a letter clears the flag');
  t.eq(TC.dayTypeFor(m, '2026-09-04'), 'friB', 'and the date now runs Friday B');
});

check(12, 'A staff meeting on the first Tuesday of each month', t => {
  const m = TC.newModel();
  const duty = {id:'staff', name:'Staff meeting', typeId:'meeting', start:T('15:00'), end:T('16:00'), off:[], rule:{kind:'nthWeekday', n:1, weekday:2}};
  m.duties.push(duty);
  const want = ['2026-09-01','2026-10-06','2026-11-03','2026-12-01','2027-01-05','2027-02-02','2027-03-02','2027-04-06','2027-05-04','2027-06-01'];
  t.eq(TC.dutyDates(m, duty).map(x => x.date), want, 'appears on each month’s first Tuesday');
  t.ok(TC.dutyDates(m, duty).every(x => x.state === 'on'), 'all on (no first Tuesday falls on a closed day this year)');
  t.ok(TC.resolveDay(m, '2027-01-05').blocks.some(b => b.ref === 'duty:staff'), 'it is on the day, Jan 5');
  t.ok(!TC.resolveDay(m, '2027-01-12').blocks.some(b => b.ref === 'duty:staff'), 'and not on the second Tuesday');
  const mon = {id:'mon1', name:'Monday meeting', typeId:'meeting', start:T('15:00'), end:T('16:00'), off:[], rule:{kind:'nthWeekday', n:1, weekday:1}};
  m.duties.push(mon);
  const md = TC.dutyDates(m, mon);
  t.eq(md.find(x => x.date === '2026-09-07').state, 'skipped', 'a first Monday with no school (Labour Day, Sep 7) is skipped');
  t.ok(!TC.resolveDay(m, '2026-09-07').blocks.length, 'and puts nothing on that day');
  t.eq(md.find(x => x.date === '2026-10-05').state, 'on', 'the next one is on');
  TC.setDutyOccurrence(mon, '2026-10-05', false);
  t.eq(TC.dutyDates(m, mon).find(x => x.date === '2026-10-05').state, 'off', 'one occurrence can be switched off');
  t.ok(!TC.resolveDay(m, '2026-10-05').blocks.some(b => b.ref === 'duty:mon1'), 'and then it is not on the day');
  const rot = {id:'rot', name:'Rotation', typeId:'supervision', start:T('8:00'), end:T('8:05'), off:[], rule:{kind:'everyNWeeks', n:2, startDate:'2026-11-03'}};
  const rd = TC.dutyDates(m, rot).filter(x => x.date >= '2026-11-03').slice(0, 3).map(x => x.date);
  t.eq(rd, ['2026-11-03', '2026-11-17', '2026-12-01'], 'every 2nd week counts school weeks: the Nov 11–13 break week is skipped (Nov 3, Nov 17, Dec 1)');
});

check(13, 'Set FTE to 0.5', t => {
  const m = TC.newModel();
  let l = TC.limits(m);
  t.eq([l.instructionalHours, l.totalAssignableHours], [916, 1200], 'at 1.0 FTE: 916 h and 1,200 h');
  m.settings.fte = 0.5;
  l = TC.limits(m);
  t.eq(l.instructionalHours, 458, 'instructional limit 458 h');
  t.ok(l.needsTypicalHours && l.totalAssignableHours === null, 'asks for the school’s typical full-time assigned hours');
  m.settings.typicalAssignedHours = 1190;
  l = TC.limits(m);
  t.eq([l.needsTypicalHours, l.totalAssignableHours], [false, 595], 'with 1,190 h entered the total limit is 595 h');
  m.settings.fte = 1.5;
  t.ok(!!TC.limits(m).error, 'an FTE above 1.0 is an error');
});

check(15, 'View weeks either side of a daylight-saving change', t => {
  const m = withClasses();
  // Alberta changes on Nov 1, 2026 and Mar 14, 2027.
  [['2026-10-26', '2026-11-02'], ['2027-03-08', '2027-03-15']].forEach(p => {
    t.eq(blockSig(TC.resolveDay(m, p[1])), blockSig(TC.resolveDay(m, p[0])), 'Monday ' + p[1] + ' has the same blocks as Monday ' + p[0]);
  });
  let ok = true, prev = null;
  TC.dateRange(m.calendar.start, m.calendar.end).forEach(d => {
    const n = TC.dayNum(d);
    if(TC.isoOf(n) !== d || (prev !== null && n !== prev + 1)) ok = false;
    if(prev !== null && TC.weekday(d) !== (TC.weekday(TC.isoOf(prev)) + 1) % 7) ok = false;
    prev = n;
  });
  t.ok(ok, 'every date in the year is exactly one day after the last, with the weekday cycling normally');
  t.eq(TC.weekStart('2026-11-01'), '2026-10-26', 'the week of Nov 1 starts Monday Oct 26');
});

check(16, 'Change arrival and departure from 0 to 15 min each', t => {
  const m = withClasses();
  const a = TC.yearTotals(m, {planOnly:true});
  TC.setArrivalDeparture(m, m.calendar.start, 15, 15);
  const b = TC.yearTotals(m, {planOnly:true});
  t.eq(b.assignable - a.assignable, 181 * 30, 'Assignable +30 min on each of 181 instructional days');
  t.eq(TC.hours(b.totalAssignable - a.totalAssignable), 90.5, 'the year projection rises 90.5 h');
  t.eq(b.instructional, a.instructional, 'Instructional unchanged');
  const gain = d => TC.resolveDay(m, d).totals.assignable - TC.resolveDay(withClasses(), d).totals.assignable;
  t.eq(gain('2026-09-08'), 30, 'a Tuesday gains 30 min');
  t.eq(gain('2027-06-25'), 30, 'Jun 25 (Early dismissal) gains 30 min too');
  t.eq([TC.resolveDay(m, '2026-09-25').totals.assignable, TC.resolveDay(m, '2027-02-11').totals.assignable], [0, 360], 'non-instruction days are unaffected; Convention stays 6 h');
  // Departure starts at the last bell (12:10 on Fridays), so on Friday it takes minutes from Lunch.
  t.eq(a.notCounted - b.notCounted, 30 * 15, 'side effect to know about: Friday Lunch shrinks by 15 min on the 30 lettered Fridays (7.5 h)');
});

check(17, 'Load the bell-time template', t => {
  const m = TC.newModel(), tue = TC.resolveDay(m, '2026-09-08');
  const per = d => d.blocks.filter(b => b.source === 'bell' && b.ref !== 'lunch');
  t.eq(per(tue).length, 8, 'Mon–Thu: 8 periods');
  t.eq(per(tue).map(b => b.minutes), [51, 47, 47, 47, 47, 49, 47, 47], 'period lengths, 382 min in all');
  t.eq([per(tue)[0].start, per(tue)[7].end], [T('8:05'), T('14:45')], 'running 8:05 to 2:45');
  t.eq(tue.totals.assignable, 18, '18 min of Transition');
  t.ok(tue.blocks.filter(b => b.typeId === 'transition').every(b => b.category === 'assignable'), 'Transition is Assignable');
  t.eq(tue.totals.unassigned, 382, 'no period is pre-typed, so the 382 min are unassigned (flagged, not counted)');
  t.ok(tue.flags.some(f => f.code === 'unassigned-minutes'), 'and flagged');
  FRI.forEach(dt => {
    const d = '2026-09-04'; TC.setDayType(m, d, dt);
    const fr = TC.resolveDay(m, d);
    t.eq(per(fr).length, 5, dt + ': 5 periods');
    t.eq([per(fr)[0].start, per(fr)[4].end], [T('8:05'), T('12:10')], dt + ': 8:05 to 12:10');
    t.eq(fr.blocks.filter(b => b.typeId === 'transition').reduce((s, b) => s + b.minutes, 0), 14, dt + ': 14 min of Transition');
    t.eq(fr.blocks.filter(b => b.typeId === 'lunch').reduce((s, b) => s + b.minutes, 0), 50, dt + ': 50 min of Lunch');
    const mt = fr.blocks.find(b => b.typeId === 'meeting');
    t.eq([mt && mt.start, mt && mt.end, mt && mt.minutes, mt && mt.category], [T('13:00'), T('14:45'), 105, 'assignable'], dt + ': 1:00–2:45 Meeting, 105 min Assignable');
  });
  t.eq(per(TC.resolveDay(m, '2026-09-04')).map(b => b.minutes), [51, 50, 30, 51, 49], 'Friday period lengths, 231 min in all');
});

check(21, 'From Jan 4, remove Period 8 on Mondays and add a Period 9 on Tuesdays', t => {
  const m = withClasses();
  const has = (d, ref) => TC.resolveDay(m, d).blocks.some(b => b.ref === ref);
  const stale = TC.addEdit(m, '2027-01-11', {op:'change', ref:'p8', typeId:'prep', note:'Prep moved'});   // Mon, before the change
  TC.confirmWeek(m, '2027-01-18');
  const v = TC.ensureVersion(m, '2027-01-04');
  TC.unlinkSchedule(v, 'mon', 'Monday bells');      // Monday and Tuesday stop sharing the Mon\u2013Thu bell times
  TC.unlinkSchedule(v, 'tue', 'Tuesday bells');
  TC.removePeriod(v, 'mon', 'p8');
  const id = TC.addPeriod(v, 'tue', {start:T('14:47'), end:T('15:30')});
  t.eq(id, 'p9', 'the new period on Tuesdays is Period 9');
  t.ok(has('2027-01-06', 'p8') && !has('2027-01-06', 'p9'), 'Wednesdays, which still share the Mon\u2013Thu bells, are untouched');
  t.ok(!has('2027-01-25', 'p8') && !has('2027-01-11', 'p8'), 'Mondays from Jan 4 have no Period 8');
  t.ok(has('2027-01-05', 'p9') && has('2027-01-26', 'p9'), 'Tuesdays from Jan 4 have a Period 9');
  t.eq(TC.resolveDay(m, '2027-01-05').blocks.find(b => b.ref === 'p9').label, 'Period 9', 'and it is labelled Period 9');
  t.ok(has('2026-12-07', 'p8') && !has('2026-12-08', 'p9'), 'earlier weeks keep their periods');
  t.ok(has('2027-01-18', 'p8') && !has('2027-01-19', 'p9'), 'the confirmed week keeps its periods');
  const f = TC.resolveDay(m, '2027-01-11').flags.filter(x => x.code === 'edit-orphan');
  t.ok(f.length === 1 && f[0].editId === stale.id, 'the edit that pointed at the removed Period 8 is flagged');
  t.ok((m.edits['2027-01-11'] || []).some(e => e.id === stale.id), 'and it is kept, not dropped');
});

check('E1', 'Extra: the saved model survives a JSON round trip', t => {
  const m = withClasses();
  TC.addEdit(m, '2026-09-08', {op:'add', start:T('14:45'), end:T('15:30'), typeId:'meeting', name:'Meeting'});
  TC.confirmWeek(m, '2026-09-14');
  TC.ensureVersion(m, '2027-01-04');
  const m2 = JSON.parse(JSON.stringify(m));
  t.eq(TC.yearTotals(m2), TC.yearTotals(m), 'identical year totals after save and reload');
});

check('E2', 'Extra: rotation fill', t => {
  const m = TC.newModel();
  const o = {dayTypes:FRI, weekday:5, start:'2026-08-31', countNid:false};
  const plan = TC.rotationPlan(m, o);
  const tag = p => p.date.slice(5) + ' ' + p.dayTypeId.slice(3);
  t.eq(plan.length, 30, '30 school Fridays are lettered (Jun 25 keeps its Early dismissal schedule)');
  t.eq(plan.slice(0, 8).map(tag), ['09-04 A','09-11 B','09-18 C','10-02 D','10-09 A','10-16 B','10-23 C','10-30 D'],
       'A, B, C, D in turn; the Sep 25 non-instruction day does not use up a letter');
  t.eq(TC.rotationPlan(m, Object.assign({}, o, {countNid:true})).slice(2, 5).map(tag), ['09-18 C','10-02 A','10-09 B'],
       'with "count non-instruction days" Sep 25 uses up D');
  t.ok(!plan.some(p => ['2027-01-01','2027-03-26','2027-06-25'].includes(p.date)), 'closed Fridays and Jun 25 are skipped');
  t.eq(TC.rotationPlan(m, Object.assign({}, o, {start:'2026-10-02'}))[0].dayTypeId, 'friA', 'filling from a later start begins again at the first letter');
  TC.setDayType(m, '2026-09-04', 'friC');
  t.eq(TC.rotationPlan(m, o)[0].current, 'friC', 'the plan reports a letter that would be changed');
  TC.applyRotation(m, plan);
  t.eq([TC.missingDayTypeDates(m, 5).length, TC.dayTypeFor(m, '2026-09-04')], [0, 'friA'], 'applying it leaves no Friday without a letter');
});

check('E3', 'Extra: split and merge periods', t => {
  const m = TC.newModel(), v = m.versions[0], d = '2026-09-14';
  TC.setTimetable(v, 'mon', 'p1', {type:'class', name:'Math 8'});
  TC.setTimetable(v, 'tue', 'p1', {type:'prep', name:''});
  const before = JSON.stringify(TC.bellsOf(v, 'mon'));
  const a = TC.resolveDay(m, d);
  const id = TC.splitPeriod(v, 'mon', 'p1', T('8:30'));
  const b = TC.resolveDay(m, d);
  t.eq(id, 'p9', 'the second half is a new period');
  t.eq(b.blocks.filter(x => x.source === 'bell').length, 9, 'Monday now has 9 periods');
  t.eq([b.totals.instructional, b.totals.assignable], [a.totals.instructional, a.totals.assignable], 'no minutes appear or vanish (51 min of Class, 18 of Transition)');
  t.eq(b.blocks.filter(x => x.ref === id).map(x => [x.typeId, x.name]), [['class', 'Math 8']], 'the second half keeps the time type and class name');
  t.eq([TC.bellsOf(v, 'tue').length, v.timetable.tue[id].type], [9, 'prep'], 'Tuesday shares the bells, so it is split too, and keeps its own entry (Prep)');
  t.eq(b.blocks.filter(x => x.source === 'bell').map(x => x.label).slice(0, 3), ['Period 1', 'Period 2', 'Period 3'], 'period numbers renumber on their own');
  TC.mergePeriods(v, 'mon', 'p1', id);
  t.eq(JSON.stringify(TC.bellsOf(v, 'mon')), before, 'merging them back restores the original bells');
  t.ok(!v.timetable.mon[id] && !v.timetable.tue[id], 'and drops the extra timetable entries');
  let threw = false; try{ TC.mergePeriods(v, 'mon', 'p1', 'p3'); }catch(e){ threw = true; }
  t.ok(threw, 'only neighbouring periods can be merged');
});

check('E4', 'Extra: a typical day of each day type', t => {
  const m = TC.newModel(), v = m.versions[0];
  ['p1', 'p2'].forEach(id => TC.setTimetable(v, 'friA', id, {type:'class', name:'Class'}));
  m.duties.push({id:'monthly', name:'Monthly meeting', typeId:'meeting', start:T('15:00'), end:T('16:00'), off:[], rule:{kind:'nthWeekday', n:1, weekday:2}});
  const f = TC.planDay(m, 'friA', v.start);
  t.eq(f.date, null, 'it is not tied to a date');
  t.eq([f.totals.instructional, f.totals.assignable, f.totals.notCounted, f.totals.unassigned], [101, 14 + 105, 50, 130],
       'Friday A: 101 Class, 14 Transition + 105 Meeting, 50 Lunch, 130 untyped');
  t.ok(!f.blocks.some(b => b.ref === 'duty:monthly'), 'duties that repeat by date are not in a typical day');
  const rows = TC.dayTypeTotals(m, v.start);
  t.eq(rows.length, 13, 'one row per day type');
  const row = id => rows.find(r => r.id === id);
  t.eq([row('mon').totals.assignable, row('mon').totals.unassigned, row('mon').dates], [18, 382, 34], 'Monday: 18 Transition, 382 untyped, used on 34 dates');
  t.eq(row('friA').dates, 0, 'a Friday letter with no dates yet is used on 0 dates');
  t.eq(row('nid').totals.total, 0, 'a day type with no bells counts nothing');
});

check('E5', 'Extra: the typical week', t => {
  const m = withClasses(), s = TC.planSummary(m);
  t.eq(s.weekdays.map(w => w.avg.instructional), [192, 145, 237, 98, 101], 'average planned Class minutes for Mon–Fri');
  t.eq(s.weekdays.map(w => w.dates), [34, 40, 38, 38, 31], 'over each weekday’s school days');
  t.eq(s.week.instructional, 773, 'the typical week adds the five (773 min)');
  const y = TC.yearTotals(m, {planOnly:true});
  t.eq(['instructional', 'assignable', 'notCounted', 'unassigned'].map(k => s.year[k]), ['instructional', 'assignable', 'notCounted', 'unassigned'].map(k => y[k]), 'the year matches the plain year total');
  const m2 = TC.newModel(), v = m2.versions[0];
  TC.missingDayTypeDates(m2, 5).forEach((d, i) => TC.setDayType(m2, d, i % 2 ? 'friB' : 'friA'));
  TC.setTimetable(v, 'friA', 'p1', {type:'class', name:''});
  ['p1', 'p2'].forEach(id => TC.setTimetable(v, 'friB', id, {type:'class', name:''}));
  const fri = TC.planSummary(m2).weekdays.find(w => w.weekday === 5);
  t.ok(Math.abs(fri.avg.instructional - (15 * 51 + 15 * 101) / 31) < 1e-9, 'Friday is the average of the lettered Fridays, weighted by how often each runs');
  const s3 = TC.planSummary(TC.newModel()), f3 = s3.weekdays.find(w => w.weekday === 5);
  t.eq([s3.missing, f3.missing, f3.dates], [30, 30, 1], 'with no letters set, 30 Fridays are left out and counted as missing');
});

check('E6', 'Extra: copying and deleting a day type', t => {
  const m = TC.newModel();
  TC.setTimetable(m.versions[0], 'friA', 'p1', {type:'class', name:'Math 8'});
  const id = TC.copyDayType(m, 'friA', 'Friday E');
  t.eq(m.versions[0].days[id].schedule, m.versions[0].days.friA.schedule, 'the copy follows the same bell times');
  t.eq(m.versions[0].timetable[id].p1.name, 'Math 8', 'and the same timetable');
  m.versions[0].timetable[id].p1.name = 'Science 8';
  t.eq(m.versions[0].timetable.friA.p1.name, 'Math 8', 'but they are independent');
  TC.setDayType(m, '2026-09-04', id);
  m.duties[0].rule.dayTypes.push(id);
  t.eq([TC.dayTypeUsage(m, id).dates, TC.dayTypeUsage(m, id).overrides, TC.dayTypeUsage(m, id).duties], [1, 1, ['Meeting']], 'usage counts dates, overrides and duties');
  TC.deleteDayType(m, id);
  t.ok(!m.dayTypes.some(d => d.id === id) && !m.dayTypeOverrides['2026-09-04'] && !m.duties[0].rule.dayTypes.includes(id) && !m.versions[0].days[id], 'deleting it clears every reference');
  TC.deleteDayType(m, 'friA');
  t.eq(m.duties[0].rule.dayTypes, ['friB', 'friC', 'friD'], 'including the Friday meeting’s rule');
  t.eq(TC.dayTypeFor(m, '2026-09-04'), null, 'and the date has no day type again');
});

check('E7', 'Extra: arrival and departure by version and by day type', t => {
  const m = TC.newModel(), start = m.calendar.start;
  TC.ensureVersion(m, '2027-01-04'); TC.ensureVersion(m, '2027-03-01');
  TC.setArrivalDeparture(m, '2027-01-04', 20, 20);
  t.eq(m.versions.map(v => [v.arrival, v.departure]), [[0, 0], [20, 20], [20, 20]], 'a change applies from the chosen date forward, including later versions');
  TC.setArrivalDeparture(m, start, 15, 15);
  TC.setDayTypeArrivalDeparture(m, start, 'friA', 0, null);
  TC.setDayType(m, '2026-09-04', 'friA');
  const fa = TC.resolveDay(m, '2026-09-04'), tu = TC.resolveDay(m, '2026-09-08');
  t.eq([fa.blocks.some(b => b.ref === 'arrival'), fa.blocks.some(b => b.ref === 'departure')], [false, true], 'a day type can override one of them (arrival 0, departure inherited)');
  t.eq([tu.blocks.some(b => b.ref === 'arrival'), tu.blocks.some(b => b.ref === 'departure')], [true, true], 'other day types follow the general setting');
  const dep = fa.blocks.find(b => b.ref === 'departure');
  t.eq([dep.start, dep.end], [T('12:10'), T('12:25')], 'departure starts at the last bell (12:10 on Fridays)');
  TC.deleteVersion(m, '2027-01-04');
  t.eq(m.versions.map(v => v.start), [start, '2027-03-01'], 'a version can be deleted');
  let threw = false; try{ TC.deleteVersion(m, start); }catch(e){ threw = true; }
  t.ok(threw, 'but not the first one');
});

check('E8', 'Extra: shared bell times', t => {
  const m = TC.newModel(), v = m.versions[0], d = {mon:'2026-09-14', tue:'2026-09-08', wed:'2026-09-09', thu:'2026-09-10'};
  t.eq(['mon', 'tue', 'wed', 'thu'].map(id => v.days[id].schedule), ['mt', 'mt', 'mt', 'mt'], 'Monday to Thursday share one set of bell times');
  t.eq(['friA', 'friB', 'friC', 'friD'].map(id => v.days[id].schedule), ['fri', 'fri', 'fri', 'fri'], 'Friday A to D share another');
  t.ok(v.days.early.schedule === 'early' && v.schedules.early.placeholder, 'Early dismissal has its own placeholder times');
  const mon = TC.bellsOf(v, 'mon').find(b => b.id === 'p1'), end = mon.end;
  TC.updateBell(v, 'thu', 'p1', {end: T('8:57')});
  t.eq(['mon', 'tue', 'wed', 'thu'].map(id => TC.resolveDay(m, d[id]).blocks.find(b => b.ref === 'p1').end), [T('8:57'), T('8:57'), T('8:57'), T('8:57')],
       'a bell time changed on Thursday changes on all four days');
  t.eq(end, T('8:56'), '(it was 8:56)');
  // every day keeps its own classes and prep
  TC.setTimetable(v, 'mon', 'p2', {type:'class', name:'Math 8'});
  TC.setTimetable(v, 'tue', 'p2', {type:'prep', name:''});
  const at = id => TC.resolveDay(m, d[id]).blocks.find(b => b.ref === 'p2');
  t.eq([at('mon').typeId, at('tue').typeId, at('wed').typeId], ['class', 'prep', null], 'the timetable is separate for each day');
  // making one day different
  TC.unlinkSchedule(v, 'tue', 'Tuesday bells');
  TC.updateBell(v, 'tue', 'p1', {end: T('8:50')});
  t.eq([TC.resolveDay(m, d.tue).blocks.find(b => b.ref === 'p1').end, TC.resolveDay(m, d.wed).blocks.find(b => b.ref === 'p1').end], [T('8:50'), T('8:57')], 'Tuesday can have its own bell times without moving the others');
  t.eq(at('tue').typeId, 'prep', 'and keeps its timetable');
  TC.linkSchedule(v, 'tue', 'mt');
  t.eq([TC.resolveDay(m, d.tue).blocks.find(b => b.ref === 'p1').end, v.schedules.s1], [T('8:57'), undefined], 'pointing it back at the shared times drops its private copy');
  t.eq(at('tue').typeId, 'prep', 'and keeps its timetable');
  // a period only some days share
  const id = TC.addPeriod(v, 'mon', {start: T('15:00'), end: T('15:30')});
  t.ok(['mon', 'tue', 'wed', 'thu'].every(x => TC.bellsOf(v, x).some(b => b.id === id)), 'a period added on Monday is added to all four days');
  TC.setTimetable(v, 'wed', id, {type:'class', name:'Extra'});
  TC.removePeriod(v, 'thu', id);
  t.ok(!TC.bellsOf(v, 'mon').some(b => b.id === id) && !v.timetable.wed[id], 'removing it takes it, and each day’s entry for it, away from all four');
  let threw = false; try{ TC.updateBell(v, 'mon', 'p1', {end: T('7:00')}); }catch(e){ threw = true; }
  t.ok(threw, 'an end before the start is refused');
  t.eq(TC.moveTimetableEntry(v, 'mon', 'p2', 'p3'), true, 'a timetable entry can be moved to a free period');
  TC.setTimetable(v, 'tue', 'p3', {type:'class', name:'x'});
  t.eq(TC.moveTimetableEntry(v, 'tue', 'p2', 'p3'), false, 'but not onto a period that already has one');
});

check('E9', 'Extra: a model saved in the earlier layout still opens', t => {
  const m = withClasses();
  TC.addEdit(m, '2026-09-08', {op:'add', start:T('14:45'), end:T('15:30'), typeId:'meeting', name:'Meeting'});
  const want = TC.yearTotals(m);
  // rebuild the old layout: a separate copy of the bells inside every day type
  const old = JSON.parse(JSON.stringify(m));
  old.version = 1;
  old.versions.forEach(v => {
    Object.keys(v.days).forEach(id => {
      const sc = v.schedules[v.days[id].schedule];
      v.days[id].bells = sc ? JSON.parse(JSON.stringify(sc.bells)) : [];
      if(sc && sc.placeholder) v.days[id].placeholder = sc.placeholder;
      delete v.days[id].schedule;
    });
    delete v.schedules;
  });
  const up = TC.migrate(old);
  t.eq(up.version, 2, 'it is upgraded to the new layout');
  t.eq(TC.yearTotals(up), want, 'with identical year totals');
  const v = up.versions[0], sc = id => v.days[id].schedule;
  t.ok(sc('mon') === sc('tue') && sc('tue') === sc('wed') && sc('wed') === sc('thu') && sc('mon') !== sc('friA'), 'days with identical bells share one set again');
  t.ok(sc('friA') === sc('friD') && sc('early') !== sc('friA') && v.schedules[sc('early')].placeholder, 'Friday A to D share, and the Early dismissal placeholder keeps its own');
  t.ok(sc('nid') === null && sc('convention') === null, 'a day type with no bells follows none');
  t.eq(v.schedules[sc('mon')].name, 'Monday – Thursday', 'and the shared set is named after its days');
  t.eq([TC.migrate({format:'other'}), TC.migrate(Object.assign(JSON.parse(JSON.stringify(m)), {version:9}))], [null, null], 'anything else is not opened');
});

check('E10', 'Extra: editing a block', t => {
  const m = withClasses(), d = '2026-09-08';          // a Tuesday; Period 1 is a Class, 8:05–8:56
  const day = () => TC.resolveDay(m, d), p1 = () => day().blocks.find(b => b.ref === 'p1');
  TC.editBlock(m, d, 'p1', {start:T('8:10'), end:T('8:57')}, {entered:'2026-09-08'});
  t.eq([p1().start, p1().end, p1().edited], [T('8:10'), T('8:57'), true], 'a block can be moved and resized, and is marked as edited');
  TC.editBlock(m, d, 'p1', {end:T('8:56')});
  t.eq(m.edits[d].length, 1, 'further changes are merged into the one edit');
  TC.editBlock(m, d, 'p1', {start:T('8:05')});
  t.ok(!m.edits[d], 'putting it back where the plan has it removes the edit');
  TC.editBlock(m, d, 'p1', {typeId:'prep', note:'Meeting ran long'});
  t.eq([day().totals.instructional, day().totals.notCounted, p1().note], [94, 51, 'Meeting ran long'], 'a block can be retyped (Class to Prep) and carry a note');
  TC.resetBlock(m, d, 'p1');
  t.ok(!m.edits[d] && day().totals.instructional === 145, 'resetting a block brings the plan back');
  TC.deleteBlock(m, d, 'p1');
  t.ok(!p1() && m.edits[d][0].op === 'remove', 'deleting a planned block records a removal');
  TC.resetBlock(m, d, 'p1');
  const e = TC.addBlock(m, d, {start:T('14:45'), end:T('15:15'), typeId:'meeting', name:'Grad meeting', note:'Admin asked'});
  TC.editBlock(m, d, 'edit:' + e.id, {end:T('15:30')});
  t.eq([m.edits[d].length, m.edits[d][0].end], [1, T('15:30')], 'a block the week added is changed in place');
  TC.deleteBlock(m, d, 'edit:' + e.id);
  t.ok(!m.edits[d], 'and deleting it simply removes it');
  const thrown = fn => { try{ fn(); return ''; }catch(x){ return x.message; } };
  t.ok(thrown(() => TC.addBlock(m, d, {start:T('10:00'), end:T('9:00'), typeId:'meeting'})).includes('end after'), 'a block that ends before it starts is refused');
  t.ok(thrown(() => TC.addBlock(m, d, {start:T('10:00'), end:T('11:00'), typeId:'other', name:' '})).includes('description'), '“Other assigned” needs a description');
  t.ok(thrown(() => TC.addBlock(m, '2027-02-11', {start:T('10:00'), end:T('11:00'), typeId:'meeting'})).includes('Convention'), 'a Convention day takes no blocks (it counts a fixed 6 h)');
  const before = day().totals;
  const nb = TC.splitBlock(m, d, 'p1', T('8:30'));
  t.eq([p1().end, day().blocks.find(b => b.ref === 'edit:' + nb.id).start, day().totals.instructional], [T('8:30'), T('8:30'), before.instructional], 'splitting a block keeps every minute and its time type');
  const nb2 = TC.splitBlock(m, d, 'edit:' + nb.id, T('8:45'));
  t.eq(day().blocks.filter(b => b.typeId === 'class' && b.start < T('8:56')).length, 3, 'a block made by a split can be split again');
  t.ok(thrown(() => TC.splitBlock(m, d, 'p5', T('11:40'))).includes('time type'), 'a block with no time type cannot be split');
});

check('E11', 'Extra: quick actions', t => {
  const m = withClasses(), wed = '2026-09-09', tue = '2026-09-08', fri = '2026-09-04';
  const d1 = TC.describeChange(m, wed, x => TC.ranOver(x, wed, 'p4', 5));
  t.eq([d1.delta.instructional, d1.delta.assignable], [2, -2], 'Ran over +5: 5 min more Class, minus 3 min of the next class and 2 of Transition');
  t.eq(TC.resolveDay(m, wed).blocks.find(b => b.ref === 'p4').end, T('11:29'), '(describeChange left the real model alone)');
  TC.ranOver(m, wed, 'p4', 5);
  t.eq(TC.resolveDay(m, wed).blocks.find(b => b.ref === 'p4').end, T('11:34'), 'applied for real, the block ends 5 min later');
  t.eq(TC.scheduledEnd(m, tue), T('14:45'), 'the scheduled end of a Tuesday is the last bell, 2:45');
  t.eq(TC.scheduledEnd(TC.newModel(), fri), null, '(a Friday with no day type has nothing scheduled)');
  t.eq(TC.scheduledEnd(m, fri), T('14:45'), 'on Friday it is the end of the Friday meeting, not the 12:10 last bell');
  const a = TC.yearTotals(m);
  TC.afterSchoolMeeting(m, tue, {name:'Grad', minutes:45});
  const b = TC.yearTotals(m);
  t.eq([b.assignable - a.assignable, b.instructional - a.instructional], [45, 0], 'an after-school meeting adds 45 min Assignable');
  t.eq(TC.resolveDay(m, tue).blocks.find(x => x.name === 'Grad').start, T('14:45'), 'starting right after the day’s scheduled end');
  TC.setArrivalDeparture(m, m.calendar.start, 0, 15);
  t.eq(TC.scheduledEnd(m, tue), T('15:00'), 'with a required departure the day is scheduled until 3:00');
  // swap or drop a duty
  const tue2 = '2026-09-15';
  const total = x => TC.resolveDay(m, x).totals.assignable;
  const both = total(fri) + total(tue2);
  TC.swapDuty(m, fri, 'duty:friMeeting', {start:T('13:30'), end:T('15:15')});
  t.eq(TC.resolveDay(m, fri).blocks.find(x => x.ref === 'duty:friMeeting').start, T('13:30'), 'a duty occurrence can move to another time');
  TC.swapDuty(m, fri, 'duty:friMeeting', {toDate:tue2, start:T('13:00'), end:T('14:45')});
  const moved = TC.resolveDay(m, tue2).blocks.filter(x => x.name === 'Meeting' && x.edited);
  t.ok(!TC.resolveDay(m, fri).blocks.some(x => x.name === 'Meeting') && moved.length === 1, 'or to another date: gone from one day, added to the other');
  t.ok(moved[0].note.includes('moved from 2026-09-04'), 'and says where it came from');
  t.eq(total(fri) + total(tue2), both - 4, 'the minutes follow it: 105 off one day, 105 on the other, less 4 min of Transition the meeting replaces on Tuesday');
  const sep18 = '2026-09-18';
  const q = TC.describeChange(m, sep18, x => TC.deleteBlock(x, sep18, 'duty:friMeeting'));
  t.eq(q.delta.assignable, -105, 'dropping a duty removes its minutes for that week only');
  t.ok(TC.resolveDay(m, '2026-09-25').blocks.length === 0 && TC.dutyDates(m, m.duties[0]).some(x => x.date === sep18 && x.state === 'on'), '(the plan still has the duty on that date)');
  // leave
  const y0 = TC.yearTotals(m);
  TC.setLeave(m, tue, 'sick'); TC.setLeave(m, tue, 'personal');
  t.eq([TC.resolveDay(m, tue).leave.kind, m.edits[tue].filter(x => x.op === 'leave').length], ['personal', 1], 'one leave tag per day');
  t.eq(TC.yearTotals(m), y0, 'leave changes no totals');
  TC.setLeave(m, tue, null);
  t.ok(!TC.resolveDay(m, tue).leave, 'and it can be cleared');
  // change the day type
  TC.setDayTypeEdit(m, fri, 'friC');
  t.eq([TC.resolveDay(m, fri).dayTypeId, TC.dayTypeFor(m, fri)], ['friC', 'friA'], 'a Friday can run as Friday C for one week while the plan still says A');
  TC.setDayTypeEdit(m, fri, 'friA');
  t.ok(!(m.edits[fri] || []).some(x => x.op === 'dayType'), 'setting it back to the plan’s day type removes the edit');
  // reset
  TC.setLeave(m, wed, 'sick');
  const n = TC.resetWeek(m, '2026-09-07');
  t.ok(n >= 1 && !(m.edits[wed]) && !(m.edits[tue]), 'resetting a week clears its edits (' + n + ')');
});

check('E12', 'Extra: what a change does, and a week against its plan', t => {
  const m = withClasses(), d = '2026-09-08', ws = '2026-09-07';
  const snapshot = JSON.stringify(m);
  const r = TC.describeChange(m, d, x => TC.afterSchoolMeeting(x, d, {name:'Grad', minutes:45}));
  t.eq([r.delta.assignable, r.delta.instructional, JSON.stringify(m) === snapshot], [45, 0, true], 'describing a change reports +45 Assignable and leaves the model untouched');
  const low = TC.describeChange(m, d, x => TC.deleteBlock(x, d, 'p1'));
  t.eq(low.delta.instructional, -51, 'deleting a Class period reports Instructional −51 (the app asks before doing this)');
  t.eq(TC.weekSummary(m, ws).status, 'planned', 'a week with no edits is Planned');
  TC.afterSchoolMeeting(m, d, {name:'Grad', minutes:45});
  const w = TC.weekSummary(m, ws);
  t.eq([w.status, w.edits, w.delta.assignable, w.delta.totalAssignable, w.delta.instructional], ['edited', 1, 45, 45, 0], 'with an edit it is Edited, +0.75 h Assignable against the plan');
  t.eq(w.actual.assignable - w.plan.assignable, 45, 'actual minus plan is the difference');
});

check('E13', 'Extra: a confirmed week never shifts', t => {
  const m = withClasses(), d = '2026-09-08', ws = '2026-09-07';
  const thrown = fn => { try{ fn(); return ''; }catch(x){ return x.message; } };
  TC.setLeave(m, d, 'sick');
  TC.afterSchoolMeeting(m, d, {name:'Grad', minutes:45, note:'Admin asked'});
  TC.setTimetable(m.versions[0], 'tue', 'p5', {type:'prep', name:''});               // a Prep, so the day has some of every kind
  TC.confirmWeek(m, ws, {at:'2026-09-11'});
  const days = () => [0, 1, 2, 3, 4, 5, 6].map(k => TC.resolveDay(m, TC.addDays(ws, k)));
  const shape = () => JSON.stringify(days().map(r => [r.status, r.dayTypeId, r.totals, r.byType, r.blocks.map(b => [b.start, b.end, b.typeId, b.name, b.category, b.edited, b.note, b.source]), r.leave]));
  const kept = shape(), wk = () => TC.resolveDay(m, d).totals;
  t.eq(TC.weekSummary(m, ws).status, 'confirmed', 'confirming marks the week Confirmed');
  t.ok(thrown(() => TC.addBlock(m, d, {start:T('10:00'), end:T('11:00'), typeId:'meeting'})).includes('confirmed'), 'a confirmed week takes no new blocks');
  t.ok(thrown(() => TC.resetWeek(m, ws)).includes('confirmed') && thrown(() => TC.setLeave(m, d, 'other')).includes('confirmed'), 'no resets or leave tags either');
  t.ok(thrown(() => TC.setCalendarDate(m, d, 'nid', 'x')).includes('confirmed'), 'its dates cannot be edited in the calendar');
  // everything that could move it
  TC.setTimetable(m.versions[0], 'tue', 'p1', {type:'prep', name:''});                 // the plan changes
  TC.ensureVersion(m, '2026-09-01'); TC.deleteDayType(m, 'friB');                      // versions and day types change
  m.timeTypes.find(x => x.id === 'class').category = 'notCounted';                     // a time type changes category
  t.eq(shape(), kept, 'a confirmed week does not move when the plan, the day types or the time types change');
  m.timeTypes.find(x => x.id === 'class').category = 'instructional';
  // unlocking keeps it exactly as it was
  t.eq(wk().instructional, 145, '(Tuesday still has 145 min of Class)');
  TC.unlockWeek(m, ws, {at:'2026-09-12'});
  t.eq([TC.weekSummary(m, ws).status, shape()], ['reopened', kept], 'unlocking does not change a single block, total, note or leave tag; the week is Reopened, not Edited');
  t.eq(TC.weekSummary(m, ws).edits, 0, 'and it has no edits of its own yet');
  t.eq(m.log.map(x => x.kind), ['confirm', 'unlock'], 'both are logged');
  m.timeTypes.find(x => x.id === 'class').category = 'notCounted';
  t.eq(wk().instructional, 145, 'even a time type that changes category later does not move a kept block');
  m.timeTypes.find(x => x.id === 'class').category = 'instructional';
  TC.setTimetable(m.versions[0], 'tue', 'p2', {type:'prep', name:''});
  t.ok(thrown(() => TC.setCalendarDate(m, d, 'nid', 'x')).includes('confirmed'), 'a kept week’s dates still cannot be edited in the calendar');
  t.eq(shape(), kept, 'a later plan change still does not reach it');
  // changes go on top
  const p3 = TC.resolveDay(m, d).blocks.find(b => b.ref && b.name === 'Class' && b.start === T('9:53')), before = wk();
  TC.ranOver(m, d, p3.ref, 5);
  t.eq([TC.weekSummary(m, ws).status, TC.weekSummary(m, ws).edits, wk().instructional - before.instructional], ['edited', 1, 2], 'a change made by hand goes on top (5 min over, 3 of them taken from the next class: +2) and the week becomes Edited');
  const grad = TC.resolveDay(m, d).blocks.find(b => b.name === 'Grad');
  t.eq([grad.note, grad.edited], ['Admin asked', true], 'a block that was an edit when confirmed is still marked as one, with its note');
  TC.deleteBlock(m, d, grad.ref);
  t.ok(!TC.resolveDay(m, d).blocks.some(b => b.name === 'Grad') && TC.weekSummary(m, ws).edits === 2, 'deleting a kept block works, and counts as an edit');
  t.eq(TC.resolveDay(m, '2026-09-09').blocks.find(b => b.typeId === 'class' && b.start === T('8:58')).end, T('9:45'), '(the Wednesday is untouched)');
  t.ok(thrown(() => TC.setDayTypeEdit(m, d, 'wed')).includes('fixed'), 'a kept day’s day type is fixed (put the day back to plan to change it)');
  // confirm it again, unlock it again: nothing is lost
  const second = shape();
  TC.confirmWeek(m, ws, {at:'2026-09-13'}); TC.unlockWeek(m, ws, {at:'2026-09-14'});
  t.eq(shape(), second, 'confirming and unlocking again changes nothing');
  // putting it back to the plan is a separate, deliberate step
  TC.resetWeek(m, ws);
  t.eq([TC.weekSummary(m, ws).status, wk().instructional], ['planned', 94], 'Reset to plan makes the week follow today’s plan again (Tuesday Class now 94 min)');
});

check('E14', 'Extra: the weeks to review', t => {
  const m = TC.newModel();
  t.eq(TC.weekRange(m), {first:'2026-08-24', last:'2027-06-28'}, 'the school year runs from the week of Aug 24 to the week of Jun 28');
  let list = TC.weeksToReview(m, '2026-10-08');
  t.eq(list.map(x => x.ws), ['2026-08-24', '2026-08-31', '2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'], 'on Oct 8, the six weeks before this one are to review');
  TC.confirmWeek(m, '2026-09-14');
  t.eq(TC.weeksToReview(m, '2026-10-08').length, 5, 'confirming one takes it off the list');
  list = TC.weeksToReview(m, '2027-04-05').map(x => x.ws);
  t.ok(!list.includes('2026-12-21') && !list.includes('2026-12-28') && !list.includes('2027-03-22'), 'break weeks with no school are not listed');
  t.ok(list.includes('2026-11-09') && list.includes('2027-03-29'), 'weeks with some school either side of a break are');
  TC.confirmWeek(m, '2026-09-21'); TC.unlockWeek(m, '2026-09-21');
  t.eq(TC.weeksToReview(m, '2026-10-08').find(x => x.ws === '2026-09-21').status, 'reopened', 'a reopened week is back in the list to review, as Reopened');
  t.eq(TC.weeksToReview(m, '2026-08-20'), [], 'before the year starts there is nothing to review');
  t.ok(TC.weeksToReview(m, '2027-09-01').every(x => x.ws <= '2027-06-28'), 'and nothing past the end of the year is listed');
});

check('E15', 'Extra: the tracked year', t => {
  const m = withClasses(), today = '2026-10-08';
  const ty = TC.trackYear(m, today);
  t.eq([ty.currentWeek, ty.operational], ['2026-10-05', {total:196, gone:26}], 'on Oct 8 the current week starts Oct 5, and 26 of 196 school days are in the weeks before it');
  const through = TC.sumRange(m, '2026-08-24', '2026-10-04');
  t.eq([ty.toDate.instructional, ty.toDate.assignable, ty.toDate.notCounted], [through.instructional, through.assignable, through.notCounted], '“to date” is the weeks before this one');
  const y = TC.yearTotals(m), py = TC.yearTotals(m, {planOnly:true});
  t.eq([ty.projected.instructional, ty.projected.assignable, ty.plan.instructional, ty.plan.assignable], [y.instructional, y.assignable, py.instructional, py.assignable], 'the projected year and the plan match the plain year totals');
  t.eq([ty.weeks.reduce((n, w) => n + w.totals.instructional, 0), ty.months.reduce((n, x) => n + x.totals.instructional, 0), ty.weeks.length, ty.months.length], [y.instructional, y.instructional, 45, 11], 'the weeks (45) and months (11) each add up to the year');
  const last = ty.series[ty.series.length - 1];
  t.eq([last.x, last.i, last.t], [196, y.instructional, y.totalAssignable], 'the running totals end at the projected year');
  t.eq([ty.series.find(x => x.ws === '2026-09-28').past, ty.series.find(x => x.ws === '2026-10-05').past], [true, false], 'weeks before this one are “so far”; this week on is projected');
  t.eq([ty.ticks[0], ty.ticks[1], ty.ticks.length], [{key:'2026-08', x:0}, {key:'2026-09', x:4}, 11], 'month ticks sit at the first school day of each month');
  // an edit in a past week that is not confirmed
  TC.afterSchoolMeeting(m, '2026-09-08', {name:'Grad', minutes:45});
  const withEdits = TC.trackYear(m, today), planned = TC.trackYear(m, today, {pastUnconfirmed:'plan'});
  t.eq([withEdits.toDate.assignable - ty.toDate.assignable, planned.toDate.assignable - ty.toDate.assignable], [45, 0], 'a past, unconfirmed week counts with its edits (and as the plan alone if asked)');
  t.eq(planned.projected.assignable - ty.projected.assignable, 0, 'under that choice its edits are left out of the projection too');
  TC.confirmWeek(m, '2026-09-07');
  t.eq(TC.trackYear(m, today, {pastUnconfirmed:'plan'}).toDate.assignable - ty.toDate.assignable, 45, 'once confirmed, the edits count either way');
  TC.afterSchoolMeeting(m, '2026-11-10', {name:'Later', minutes:30});
  const fut = TC.trackYear(m, today);
  t.eq([fut.projected.assignable - withEdits.projected.assignable, fut.toDate.assignable - withEdits.toDate.assignable], [30, 0], 'a future edit is in the projection, not in “to date”');
  const early = TC.trackYear(m, '2026-08-01'), late = TC.trackYear(m, '2027-07-15');
  t.eq([early.toDate.total, early.operational.gone, late.operational.gone, late.toDate.instructional === late.projected.instructional], [0, 0, 196, true], 'before the year nothing is to date; after it everything is');
});

check('E16', 'Extra: the dashboard', t => {
  const m = withClasses(), today = '2026-10-08';
  const make = () => { const ty = TC.trackYear(m, today); return {ty, d: TC.dashboard(m, ty)}; };
  let {ty, d} = make();
  const by = k => d.find(x => x.key === k);
  t.eq(d.map(x => x.key), ['instructional', 'totalAssignable', 'assignable', 'notCounted'], 'four totals: Instructional, Total assignable, Assignable on its own, Not counted');
  t.eq([by('instructional').limit, by('totalAssignable').limit, by('assignable').limit, by('notCounted').level], [916 * 60, 1200 * 60, null, 'none'], 'the first two have limits; the others have none');
  t.eq([by('instructional').level, by('instructional').headroom], ['ok', 916 * 60 - ty.projected.instructional], 'headroom is the limit minus the projection');
  t.ok(Math.abs(by('instructional').yearGone - 26 / 196) < 1e-9 && Math.abs(by('instructional').limitUsed - ty.toDate.instructional / (916 * 60)) < 1e-12, 'pace compares the share of the year gone (26 of 196 days) with the share of the limit used');
  const proj = ty.projected.instructional / 60, set = h => { m.settings.limits.instructionalHours = h; return make(); };
  ({d} = set(proj / 0.96)); t.eq([by('instructional').level, by('instructional').reason], ['near', null], 'a projection at 96% of the limit is amber (the warning is at 95%)');
  ({d} = set(proj - 1)); t.eq([by('instructional').level, by('instructional').reason], ['over', 'projected'], 'a projection over the limit is red');
  ({d} = set(ty.toDate.instructional / 60 - 1)); t.eq([by('instructional').level, by('instructional').reason], ['over', 'actual'], 'so is actual time already over it');
  set(916);
  // what moved it: coverage added to a Tuesday Prep (one past, two to come)
  TC.setTimetable(m.versions[0], 'tue', 'p4', {type:'prep', name:''});
  const base = make().ty;
  ['2026-09-08', '2026-11-03', '2026-11-10'].forEach(dt => TC.coverClass(m, dt, 'p4', {whose:'a colleague'}));
  ({ty, d} = make());
  t.eq([by('instructional').drift, by('instructional').causes], [141, [{typeId:'coverage', name:'Coverage', minutes:141}]], 'Coverage explains +141 min of Instructional against the plan');
  t.eq([by('totalAssignable').causes.length, by('notCounted').causes.length, by('notCounted').drift], [1, 0, -141 + 0], 'it shows under Total assignable too, and Not counted drifts down by the Prep it replaced');
  const rows = TC.typeRows(m, ty), cov = rows.find(r => r.typeId === 'coverage'), prep = rows.find(r => r.typeId === 'prep');
  t.eq([cov.toDate, cov.projected, cov.plan, cov.drift], [47, 141, 0, 141], 'by time type: Coverage 47 min to date, 141 projected, 0 planned');
  t.eq([prep.drift, rows[0].typeId === 'coverage' || rows[0].typeId === 'prep'], [-141, true], 'and the rows are ordered by how far each has moved');
  // limits that are not known yet
  m.settings.fte = 0.5;
  ({d} = make());
  t.eq([by('instructional').limit, by('totalAssignable').needsTypical, by('totalAssignable').level], [458 * 60, true, 'none'], 'at 0.5 FTE the instructional limit is 458 h, and the total limit waits for the typical hours');
  m.settings.fte = 2;
  ({d} = make());
  t.eq([by('instructional').limit, by('instructional').level], [null, 'none'], 'an invalid FTE gives no limits rather than wrong ones');
});

/* ---------- stage 5: TimeTracker.pdf, safe import, school setup, a new year ---------- */
const PDF = window.TimeCounterPdf, TODAY = '2026-10-08';
const WEEK_SHAPE = m => JSON.stringify(TC.dateRange(m.calendar.start, m.calendar.end).map(d => { const r = TC.resolveDay(m, d); return [d, r.status, r.dayTypeId, r.totals, r.blocks.map(b => [b.start, b.end, b.typeId, b.name, b.note, b.edited])]; }));
const pdfOf = async (m, saved) => { await libReady; return PDF.build(m, {today: TODAY, saved: saved || '2026-10-08T16:00:00Z'}); };
// What opening a PDF does: find the data, then check it. Never changes anything.
const openPdf = async bytes => { const r = await PDF.read(bytes); return r.found ? Object.assign({found: true}, TC.unpack(r.text)) : r; };
// A year with a bit of everything: classes, a cover, a meeting with a note that has an arrow and an emoji,
// a leave tag, your own time type, a personal duty, one confirmed week and one unlocked one.
function richModel(){
  const m = withClasses(), v = m.versions[0];
  TC.setTimetable(v, 'tue', 'p4', {type: 'prep', name: ''});
  m.settings.teacher = 'Zoë Ng'; m.settings.school = 'Test School';
  const club = TC.addTimeType(m, {name: 'Library help', category: 'notCounted'});
  TC.coverClass(m, '2026-09-08', 'p4', {whose: 'a colleague'});
  TC.addBlock(m, '2026-09-22', {start: T('14:45'), end: T('15:45'), typeId: 'meeting', name: 'Grad → 🤖', note: 'Told admin → agreed 🤖 ễ'}, {entered: '2026-09-22'});
  TC.setLeave(m, '2026-09-10', 'sick', {note: 'flu'});
  TC.addBlock(m, '2026-10-06', {start: T('15:00'), end: T('15:30'), typeId: club.id, name: 'Shelving', note: 'room 12'});
  m.duties.push({id: 'd1', name: 'Bus duty', typeId: 'supervision', start: T('8:00'), end: T('8:05'), from: null, to: null, off: [], shared: false, rule: {kind: 'weekly', dayTypes: ['mon']}});
  TC.confirmWeek(m, '2026-09-07', {at: '2026-09-11'});
  TC.confirmWeek(m, '2026-09-14', {at: '2026-09-18'}); TC.unlockWeek(m, '2026-09-14', {at: '2026-09-19'});
  return m;
}
// A colleague's setup: their own bells, a renamed day type, a second shared duty.
function senderModel(){
  const m = richModel(), v = m.versions[0];
  TC.updateBell(v, 'mon', 'p1', {end: T('8:57')});
  TC.renameDayType(m, 'friA', 'Friday 1');
  m.duties.push({id: 'assembly', name: 'Assembly', typeId: 'meeting', start: T('9:00'), end: T('9:20'), from: null, to: null, off: [], shared: true, rule: {kind: 'weekly', dayTypes: ['mon']}});
  return m;
}

check(14, 'Import a colleague’s TimeTracker.pdf as School setup only', async t => {
  const sender = senderModel();
  const inc = await openPdf(await pdfOf(sender));
  t.ok(inc.found && inc.ok, 'the colleague’s PDF is found and passes the safety checks');
  const mine = TC.newModel();
  mine.settings.teacher = 'Pat Receiver';
  TC.setTimetable(mine.versions[0], 'mon', 'p1', {type: 'class', name: 'Mine'});
  mine.duties.push({id: 'assembly', name: 'My own duty', typeId: 'supervision', start: T('8:00'), end: T('8:05'), from: null, to: null, off: [], shared: false, rule: {kind: 'weekly', dayTypes: ['tue']}});
  TC.addBlock(mine, '2026-09-22', {start: T('15:00'), end: T('15:30'), typeId: 'meeting', name: 'Mine', note: 'my own note'});
  const before = JSON.stringify(mine);
  const pv = TC.previewSetup(mine, inc.model, {today: TODAY});
  t.eq(JSON.stringify(mine) === before, true, 'a preview changes nothing');
  t.eq(pv.changes.map(c => c.key), ['dayTypes', 'letters', 'bells', 'duties'], 'it lists what would change: day types, Friday letters, bell times and shared duties (the calendar already matches)');
  t.eq(pv.changes.find(c => c.key === 'letters').text, '30 letters changed', 'and says so in counts, e.g. “30 letters changed” (all 31 school Fridays, but June 25 already has its day type)');
  const r = TC.applySetup(mine, inc.model, {today: TODAY, at: TODAY});
  t.eq(mine.dayTypeOverrides, inc.model.dayTypeOverrides, 'the Friday letters arrive');
  t.eq([mine.dayTypes.find(d => d.id === 'friA').name, TC.bellsOf(mine.versions[0], 'mon')[0].end], ['Friday 1', T('8:57')], 'day types and bell times arrive');
  t.eq(mine.calendar, inc.model.calendar, 'the calendar arrives');
  t.eq(mine.duties.filter(d => d.shared).map(d => d.id), ['friMeeting', 'assembly_1'], 'shared duties arrive (a clash with one of your own ids is renamed, not overwritten)');
  t.eq(mine.duties.filter(d => !d.shared).map(d => [d.id, d.name]), [['assembly', 'My own duty']], 'your own duty stays');
  t.eq([mine.versions[0].timetable.mon.p1.name, mine.versions[0].timetable.mon.p2, mine.versions[0].timetable.tue], ['Mine', undefined, undefined], 'no timetable arrives, and yours is not touched');
  t.eq([Object.keys(mine.edits), TC.notesList(mine).map(n => n.note)], [['2026-09-22'], ['my own note']], 'no edits or notes arrive; yours stay');
  t.eq([Object.keys(mine.confirmed).length, mine.settings.teacher, mine.timeTypes.some(x => x.name === 'Library help')], [0, 'Pat Receiver', false], 'no confirmed weeks, settings or time types of theirs arrive');
  t.eq(r.kept.edits, 1, 'it reports what it kept');
  t.eq(mine.log[mine.log.length - 1].kind, 'import-setup', 'the import is logged');
  const again = TC.applySetup(mine, inc.model, {today: TODAY});
  t.eq(again.changes, [], 'importing the same setup again changes nothing');
});

check(18, 'Save as PDF, then open that PDF in a fresh browser', async t => {
  const m = richModel(), wrote = JSON.stringify(m);
  const bytes = await pdfOf(m);
  t.eq(String.fromCharCode.apply(null, bytes.subarray(0, 5)), '%PDF-', 'the result is a real PDF');
  t.eq(JSON.stringify(m) === wrote, true, 'saving does not change the data');
  const back = await openPdf(bytes);          // only the bytes are used: nothing is shared with the saving side
  t.ok(back.found && back.ok, 'the data is found inside the PDF and passes the checks');
  const r = back.model;
  t.eq(JSON.stringify(r) === wrote, true, 'everything restores exactly, byte for byte');
  t.eq(JSON.stringify(TC.trackYear(r, TODAY)) === JSON.stringify(TC.trackYear(m, TODAY)), true, 'the year to date and projected are identical');
  t.eq(JSON.stringify(TC.dashboard(r, TC.trackYear(r, TODAY))) === JSON.stringify(TC.dashboard(m, TC.trackYear(m, TODAY))), true, 'so is every tile on Totals');
  t.eq(WEEK_SHAPE(r) === WEEK_SHAPE(m), true, 'every block of every day is identical');
  t.eq([Object.keys(r.confirmed), TC.weekStatus(r, '2026-09-14')], [['2026-09-07'], 'reopened'], 'a confirmed week stays confirmed and an unlocked week stays unlocked');
  let locked = '';
  try{ TC.addBlock(r, '2026-09-08', {start: T('15:00'), end: T('15:30'), typeId: 'meeting', name: 'x'}); }catch(e){ locked = e.message; }
  t.ok(/confirmed/.test(locked), 'the confirmed week is still locked');
  const was = TC.weekSummary(r, '2026-10-05').actual.assignable;
  TC.addBlock(r, '2026-10-07', {start: T('15:00'), end: T('15:30'), typeId: 'meeting', name: 'After restoring'});
  t.eq([TC.weekSummary(r, '2026-10-05').edits, TC.weekSummary(r, '2026-10-05').actual.assignable], [2, was + 30], 'it stays fully editable: a new block goes on top of the old edits, and the totals respond');
});

check(19, 'Import a PDF that was printed to a new PDF', async t => {
  await libReady;
  const L = window.PDFLib, m = richModel(), wrote = JSON.stringify(m), bytes = await pdfOf(m);
  const src = await L.PDFDocument.load(bytes), out = await L.PDFDocument.create();
  (await out.copyPages(src, src.getPageIndices())).forEach(p => out.addPage(p));      // what printing to PDF does: pages, no attachment
  let r = await openPdf(await out.save());
  t.eq([r.found, r.reason], [false, 'no-data'], 'a PDF printed to a new PDF says no Time Counter data was found');
  const plain = await L.PDFDocument.create(); plain.addPage([200, 200]);
  r = await openPdf(await plain.save());
  t.eq([r.found, r.reason], [false, 'no-data'], 'so does any other PDF');
  const other = await L.PDFDocument.create(); other.addPage([200, 200]); await other.attach(new TextEncoder().encode('hello'), 'notes.txt', {mimeType: 'text/plain'});
  r = await openPdf(await other.save());
  t.eq([r.found, r.reason], [false, 'no-data'], 'and a PDF with some other attachment');
  t.eq([(await openPdf(new TextEncoder().encode('just some text'))).reason, (await openPdf(new Uint8Array(0))).reason], ['not-pdf', 'not-pdf'], 'a file that is not a PDF, or is empty, is turned away');
  r = await openPdf(bytes.slice(0, Math.floor(bytes.length / 2)));
  t.eq(r.found, false, 'a PDF cut off halfway is turned away');
  t.eq(JSON.stringify(m) === wrote, true, 'none of that changes the data');
  r = await openPdf(bytes);
  t.eq(r.ok, true, 'the original file, kept as it was saved, still opens');
});

check(20, 'Save as PDF with a note containing “→” or an emoji', async t => {
  const m = richModel(), bytes = await pdfOf(m);
  t.ok(bytes.length > 1000, 'the PDF saves');
  t.eq([PDF.printable('a → b'), PDF.printable('🤖'), PDF.printable('ễ'), PDF.printable('café – 2 × 3')], ['a -> b', '?', 'e', 'café – 2 × 3'],
    'the page swaps → for ->, an emoji for ?, ễ for e, and keeps é – and ×');
  t.eq(PDF.printable('go 🤖🤖 now'), 'go ? now', 'a run of emoji is one ?');
  t.eq(PDF.printable('👩‍💻'), '?', 'so is one emoji made of several');
  const back = (await openPdf(bytes)).model;
  const blk = TC.resolveDay(back, '2026-09-22').blocks.find(b => b.name.indexOf('Grad') === 0);
  t.eq([blk.name, blk.note], ['Grad → 🤖', 'Told admin → agreed 🤖 ễ'], 'the data inside keeps the exact original text');
  t.eq(TC.notesList(back).filter(n => n.note.indexOf('Told admin') === 0).length, 1, 'and the note is listed once');
});

check('E17', 'Extra: the save file and its safety checks', t => {
  t.eq(TC.crc32(new TextEncoder().encode('123456789')), 'cbf43926', 'the checksum is the standard CRC-32');
  const m = richModel(), text = TC.pack(m, '2026-10-08T16:00:00.000Z');
  const env = JSON.parse(text);
  t.eq([env.format, env.version, env.checksum.alg, typeof env.checksum.value, env.saved], ['time-counter-save', 1, 'crc32', 'string', '2026-10-08T16:00:00.000Z'], 'the file names its format, version and checksum');
  t.eq([TC.VERSION, env.appVersion], ['0.6', '0.6'], 'this is version 0.6, and the file records which version made it');
  const ok = TC.unpack(text);
  t.eq(ok.appVersion, '0.6', 'opening it says so');
  t.eq([ok.ok, ok.saved, JSON.stringify(ok.model) === JSON.stringify(m)], [true, '2026-10-08T16:00:00.000Z', true], 'it opens and matches');
  const edit = fn => { const e = JSON.parse(text); fn(e); return TC.unpack(JSON.stringify(e)); };
  t.eq(edit(e => { e.payload = e.payload.replace('Test School', 'Test Schoop'); }).code, 'damaged', 'a changed character fails the checksum');
  t.eq(edit(e => { e.payload = e.payload.slice(0, -10); }).code, 'damaged', 'a cut-off file fails it too');
  t.eq(edit(e => { e.format = 'something-else'; }).code, 'foreign', 'another format is refused');
  t.eq(edit(e => { e.version = 99; }).code, 'newer', 'a file from a newer version is refused, with a reason');
  t.eq(TC.unpack('not json').code, 'damaged', 'text that is not JSON is refused');
  // a payload that is internally consistent (the checksum matches) but is not a usable year
  const rewrap = model => { const payload = typeof model === 'string' ? model : JSON.stringify(model), bytes = new TextEncoder().encode(payload); return TC.unpack(JSON.stringify({format: 'time-counter-save', version: 1, checksum: {alg: 'crc32', bytes: bytes.length, value: TC.crc32(bytes)}, payload})); };
  const broken = fn => { const c = JSON.parse(JSON.stringify(m)); fn(c); return rewrap(c); };
  t.eq(broken(c => { delete c.calendar; }).code, 'unreadable', 'a year with no calendar is refused');
  t.eq(broken(c => { c.versions[0].days.mon.schedule = 'gone'; }).code, 'unreadable', 'bells that point at nothing are refused');
  t.eq(broken(c => { c.duties[0].rule.kind = 'sometimes'; }).code, 'unreadable', 'a duty with an unknown rule is refused');
  t.eq(broken(c => { c.edits['2026-13-45'] = []; }).code, 'unreadable', 'an impossible date is refused');
  t.eq(broken(c => { c.settings.fte = 'half'; }).code, 'unreadable', 'settings of the wrong kind are refused');
  t.eq(broken(c => { c.version = 7; }).code, 'newer', 'a model from a newer version is refused');
  t.eq(rewrap('{"__proto__": {"x": 1}, "format": "time-counter"}').ok, false, 'a __proto__ key is refused');
  t.eq(rewrap('5').ok, false, 'something that is not a year at all is refused');
  const v1 = JSON.parse(JSON.stringify(m)); // an old save (version 1) is upgraded, not refused
  v1.version = 1; v1.versions.forEach(v => { Object.keys(v.days).forEach(id => { v.days[id].bells = (v.schedules[v.days[id].schedule] || {bells: []}).bells; delete v.days[id].schedule; }); delete v.schedules; });
  t.eq(rewrap(v1).ok, true, 'a version 1 save is upgraded and opens');
  t.eq(TC.checkModel(TC.newModel()), null, 'the school template passes the checks');
});

check('E18', 'Extra: school setup into an existing year', t => {
  const today = TODAY, sender = senderModel(), mine = TC.newModel(), v = mine.versions[0];
  // period 8 exists in my timetable; the colleague's Monday–Thursday bells do not have it
  TC.setTimetable(v, 'mon', 'p8', {type: 'class', name: 'Mine'}); TC.setTimetable(v, 'mon', 'p1', {type: 'class', name: 'Kept'});
  const sv = sender.versions[0]; sv.schedules.mt.bells = sv.schedules.mt.bells.filter(b => b.id !== 'p8');
  // a later version of mine is not the one in force today
  TC.ensureVersion(mine, '2027-01-04'); TC.setTimetable(mine.versions[1], 'mon', 'p8', {type: 'prep', name: 'Later'});
  const pv = TC.previewSetup(mine, sender, {today});
  t.eq(pv.changes.find(c => c.key === 'bells').text, 'changed on 4 day types', 'bell times change on the four days that share them');
  TC.applySetup(mine, sender, {today});
  t.eq([mine.versions[0].timetable.mon.p8, mine.versions[0].timetable.mon.p1.name], [undefined, 'Kept'], 'a period the new bells do not have loses its timetable entry; the rest stays');
  t.eq([mine.versions.length, mine.versions[1].start, TC.bellsOf(mine.versions[1], 'mon').length], [2, '2027-01-04', 8], 'a later version of mine is left alone');
  // a different school year: the calendar is replaced and counted
  const other = TC.newModel(); other.calendar.name = 'Another year'; other.calendarEdits['2026-10-20'] = {status: 'nid', label: 'Conferences'};
  const pv2 = TC.previewSetup(TC.newModel(), other, {today});
  t.eq(pv2.changes.map(c => c.key), ['calendar'], 'a changed calendar is the only change when nothing else differs');
  t.ok(/^CBE 2026.27 Instructional Calendar → Another year, 1 date differs$/.test(pv2.changes[0].text), 'and it says how many dates differ');
  // a duty that uses a time type the receiver does not have brings the type with it
  const s2 = TC.newModel(), c = TC.addTimeType(s2, {name: 'Library help', category: 'assignable'});
  s2.duties.push({id: 'library', name: 'Library', typeId: c.id, start: T('15:00'), end: T('16:00'), from: null, to: null, off: [], shared: true, rule: {kind: 'weekly', dayTypes: ['mon']}});
  const m3 = TC.newModel(); TC.applySetup(m3, s2, {today});
  t.eq(m3.timeTypes.find(x => x.id === c.id).category, 'assignable', 'the time type comes with the duty that needs it');
  // day types that disappear take their traces with them
  const s3 = TC.newModel(); TC.deleteDayType(s3, 'conference');
  const m4 = TC.newModel(); m4.duties.push({id: 'p', name: 'P', typeId: 'supervision', start: T('8:00'), end: T('8:05'), from: null, to: null, off: [], shared: false, rule: {kind: 'weekly', dayTypes: ['conference', 'mon']}});
  TC.applySetup(m4, s3, {today});
  t.eq([m4.dayTypes.some(d => d.id === 'conference'), Object.keys(m4.versions[0].days).indexOf('conference'), m4.duties.find(d => d.id === 'p').rule.dayTypes], [false, -1, ['mon']], 'a day type the setup does not have is removed everywhere it was used');
  t.eq(TC.checkModel(m4), null, 'and the year still passes the checks');
});

check('E19', 'Extra: typing in a new calendar, and starting a new year', t => {
  const m = TC.newModel(), cal = TC.CAL_2026_27;
  // type the built-in calendar back in; it has to count exactly like the data it came from
  const word = x => x.dayType === 'early' ? 'early' : x.status === 'instructional' ? 'school' : x.status;
  const text = cal.exceptions.map(x => x.from + (x.to ? ' to ' + x.to : '') + ' ' + word(x) + ' ' + x.label).join('\n');
  const f = {name: '', start: cal.start, firstStudentDay: cal.firstStudentDay, lastStudentDay: cal.lastStudentDay, end: cal.end};
  const res = TC.parseCalendar(m, f, text);
  t.eq([res.ok, res.counts.operational, res.counts.instructional, res.counts.byWeekday], [true, 196, 181, {1: 34, 2: 40, 3: 38, 4: 38, 5: 31}], 'the 2026–27 calendar typed in gives 196 operational and 181 instructional days, by weekday 34, 40, 38, 38, 31');
  t.eq([res.calendar.name, res.calendar.id], ['2026–27 school year', 'custom-2026-27'], 'it names the year');
  t.eq(res.calendar.exceptions, JSON.parse(JSON.stringify(cal.exceptions)).map(x => { const o = {from: x.from}; if(x.to) o.to = x.to; o.status = x.status; o.label = x.label; if(x.dayType) o.dayType = x.dayType; return o; }), 'and the exceptions come out as they went in');
  const bad = (txt, fields) => TC.parseCalendar(m, Object.assign({}, f, fields || {}), txt);
  t.ok(/not like/.test(bad('Labour Day 2026-09-07').errors[0].msg), 'a line that does not start with a date is explained');
  t.ok(/should be one of/.test(bad('2026-09-07 holiday Labour Day').errors[0].msg), 'an unknown word is explained');
  t.ok(/does not exist/.test(bad('2026-02-30 closed X').errors[0].msg), 'a date that does not exist is caught');
  t.ok(/outside the school year/.test(bad('2025-09-07 closed X').errors[0].msg), 'a date outside the year is caught');
  t.ok(/overlaps line 1/.test(bad('2026-12-21 to 2027-01-01 closed A\n2026-12-25 closed B').errors[0].msg), 'overlapping lines are caught');
  t.ok(/ends before/.test(bad('2026-09-09 to 2026-09-07 closed X').errors[0].msg), 'a range that ends before it starts is caught');
  t.eq(bad('# a comment\n\n2026-09-07 closed X').ok, true, 'blank lines and comments are ignored');
  t.ok(/cannot be before/.test(bad('', {firstStudentDay: '2026-08-20'}).errors[0].msg), 'the year dates have to be in order');
  t.ok(/needs a date/.test(bad('', {end: ''}).errors[0].msg), 'and all four are needed');
  const noEarly = TC.newModel(); TC.deleteDayType(noEarly, 'early');
  t.ok(/no .early. day type/.test(TC.parseCalendar(noEarly, f, '2027-06-25 early x').errors[0].msg), 'early needs an Early dismissal day type to exist');
  // a new year
  const old = senderModel(); TC.addBlock(old, '2026-10-07', {start: T('15:00'), end: T('15:30'), typeId: 'meeting', name: 'x'});
  old.duties.push({id: 'r', name: 'Rotation', typeId: 'supervision', start: T('8:00'), end: T('8:05'), from: '2026-09-01', to: '2026-12-01', off: ['2026-11-03'], shared: false, rule: {kind: 'everyNWeeks', n: 2, startDate: '2026-11-03'}});
  old.duties.push({id: 'dl', name: 'Dates', typeId: 'supervision', start: T('8:00'), end: T('8:05'), from: null, to: null, off: [], shared: false, rule: {kind: 'dates', dates: ['2026-10-01']}});
  const ny = TC.parseCalendar(old, {name: '', start: '2027-08-25', firstStudentDay: '2027-08-30', lastStudentDay: '2028-06-23', end: '2028-06-28'}, '2027-09-06 closed Labour Day\n2028-06-23 early Last day');
  t.ok(ny.ok && ny.counts.instructional > 170, 'a new calendar parses');
  const kept = JSON.stringify([old.dayTypes, old.timeTypes, old.settings, old.versions[0].schedules]);
  TC.newYear(old, ny.calendar, {at: '2027-08-20'});
  t.eq([old.calendar.id, old.calendarEdits, old.dayTypeOverrides, old.edits, old.confirmed, old.versions.length, old.versions[0].start], ['custom-2027-28', {}, {}, {}, {}, 1, '2027-08-25'], 'it loads the new calendar and clears Friday letters, edits and confirmed weeks');
  t.eq([JSON.stringify([old.dayTypes, old.timeTypes, old.settings, old.versions[0].schedules]) === kept, old.versions[0].timetable], [true, {}], 'day types, time types, settings and the bell times carry over; the timetable is cleared');
  const r = old.duties.find(d => d.id === 'r'), dl = old.duties.find(d => d.id === 'dl');
  t.eq([r.from, r.to, r.off, r.rule.startDate, TC.weekday(r.rule.startDate), dl.rule.dates], [null, null, [], '2027-08-31', 2, []], 'dates on duties are cleared, and a repeating duty starts on the same weekday in the first student week');
  t.eq([old.log.map(x => x.kind), old.duties.find(d => d.id === 'friMeeting').shared], [['new-year'], true], 'the log starts again, and the Friday meeting stays shared');
  t.eq(TC.checkModel(old), null, 'the new year passes the checks');
  t.eq(TC.planSummary(old).year.unassigned > 0, true, 'every period needs a time type again');
  t.eq(TC.missingDayTypeDates(old, 5).length, ny.counts.byWeekday[5] - 1, 'every instructional Friday needs a letter again (except the one the calendar gives Early dismissal)');
});

check('E20', 'Extra: time types and notes', t => {
  const m = TC.newModel();
  const x = TC.addTimeType(m, {name: '  Library help ', category: 'assignable'});
  t.eq([x.id, x.name, x.category], ['c1', 'Library help', 'assignable'], 'a new time type gets its own id and a trimmed name');
  t.eq(TC.addTimeType(m, {name: 'Another', category: 'notCounted'}).id, 'c2', 'the next one gets the next id');
  const fails = fn => { try{ fn(); return ''; }catch(e){ return e.message; } };
  t.ok(/already a time type called/.test(fails(() => TC.addTimeType(m, {name: 'library HELP', category: 'assignable'}))), 'a name that is already used is refused, whatever its case');
  t.ok(/Give the time type a name/.test(fails(() => TC.addTimeType(m, {name: '  ', category: 'assignable'}))), 'so is an empty one');
  t.ok(/category/.test(fails(() => TC.addTimeType(m, {name: 'Z', category: 'big'}))), 'and an unknown category');
  TC.renameTimeType(m, 'class', 'Teaching'); TC.renameTimeType(m, 'class', 'Teaching');
  t.eq([m.timeTypes.find(y => y.id === 'class').name, m.timeTypes.find(y => y.id === 'class').category], ['Teaching', 'instructional'], 'any type can be renamed, and it stays in its category');
  t.ok(/already a time type/.test(fails(() => TC.renameTimeType(m, 'prep', 'Teaching'))), 'a rename cannot take another type’s name');
  // a type of your own counts in its own category
  const v = m.versions[0]; TC.setTimetable(v, 'mon', 'p1', {type: x.id, name: 'Shelving'});
  const base = TC.planSummary(TC.newModel()).year.assignable;
  t.eq(TC.planSummary(m).year.assignable > base, true, 'a period typed with your own Assignable type counts as Assignable');
  // notes: planned blocks have none; edits, confirmed weeks and leave do
  const n = richModel(), list = TC.notesList(n);
  t.eq(list.map(y => y.date + ' ' + y.note), ['2026-09-10 flu', '2026-09-22 Told admin → agreed 🤖 ễ', '2026-10-06 room 12'], 'notes come out in date order, leave included, each once');
  TC.confirmWeek(n, '2026-09-21', {at: '2026-09-25'});
  t.eq(TC.notesList(n).filter(y => y.date === '2026-09-22').length, 1, 'a note in a confirmed week is still listed once');
  const s = TC.fileSummary(n, TODAY);
  t.eq([s.year, s.teacher, s.school, s.confirmedWeeks, s.notes], ['CBE 2026–27 Instructional Calendar', 'Zoë Ng', 'Test School', 2, 3], 'the summary shows year, name, confirmed weeks and notes');
});


check('E21', 'Extra: the year summary, laid out like the Local 38 calculator', t => {
  const m = richModel();
  m.duties.push({id: 'monthly', name: 'Staff meeting', typeId: 'meeting', start: T('15:00'), end: T('16:00'), from: null, to: null, off: [], shared: false, rule: {kind: 'nthWeekday', n: 1, weekday: 2}});
  const y = TC.yearSummary(m, TODAY), ty = TC.trackYear(m, TODAY);
  const sum = (list, k) => list.reduce((n, l) => n + l.minutes[k], 0);
  t.eq(['instructional', 'assignable', 'notCounted'].map(k => sum(y.planLines, k)), [ty.plan.instructional, ty.plan.assignable, ty.plan.notCounted], 'the plan lines (days × planned minutes) add up to the plan exactly, in every category');
  t.ok(y.planLines.every(l => l.days > 0 && l.minutes.instructional === l.days * l.perDay.instructional), 'each plan line is days times minutes per day');
  t.ok(y.planLines.some(l => /with a duty on that date/.test(l.name)), 'a day that holds a duty only on certain dates gets its own line, so the lines stay exact');
  const conv = y.planLines.find(l => l.name === 'Teachers’ Convention');
  t.eq([conv.days, conv.perDay.assignable, conv.minutes.assignable], [2, 360, 720], 'Convention is 2 days at a fixed 6 h');
  t.eq([y.instructional.sum.plan, y.instructional.sum.adjust, y.instructional.sum.plan + y.instructional.sum.adjust, y.instructional.total], [ty.plan.instructional - 0, y.instructional.sum.adjust, ty.projected.instructional, ty.projected.instructional], 'instructional: plan lines plus adjustments is the projected year');
  t.ok(y.instructional.adjustments.every(a => a.adjust !== 0) && y.instructional.adjustments.some(a => a.typeId === 'coverage' && a.adjust === 47), 'adjustment lines are the net change from edits by time type (47 min of Coverage)');
  t.eq([y.assigned.sum.total, y.notCounted.sum.total, y.totalAssigned.total], [ty.projected.assignable, ty.projected.notCounted, ty.projected.totalAssignable], 'the assigned and not-counted lines add up to their totals, and total assigned is instructional plus assigned');
  t.ok([].concat(y.instructional.lines, y.assigned.lines, y.notCounted.lines).every(l => l.total === l.plan + l.adjust), 'every line is plan plus adjustment');
  t.eq([y.days.operational, y.days.instructional, y.days.byWeekday], [196, 181, {1: 34, 2: 40, 3: 38, 4: 38, 5: 31}], 'the day counts match the calendar, to check against the official calculator');
  t.eq([y.instructional.limit, y.totalAssigned.limit, y.header.fte], [916 * 60, 1200 * 60, 1], 'the limits are at the user’s FTE');
  m.settings.fte = 0.5; m.settings.typicalAssignedHours = 1190;
  const h = TC.yearSummary(m, TODAY);
  t.eq([h.instructional.limit, h.totalAssigned.limit], [458 * 60, 595 * 60], 'at 0.5 FTE the limits halve, with the school’s typical hours');
  const blank = TC.yearSummary(TC.newModel(), TODAY), nl = blank.planLines.find(l => l.name === 'School days with no day type');
  t.eq([blank.missing, nl.days, nl.minutes.instructional + nl.minutes.assignable], [30, 30, 0], 'school days with no day type are counted, and carry no minutes');
  // several versions: lines are kept apart by the version they come from
  const v2 = withClasses(); TC.ensureVersion(v2, '2027-01-04');
  const y2 = TC.yearSummary(v2, TODAY);
  t.ok(y2.planLines.some(l => l.versionStart === '2027-01-04') && sum(y2.planLines, 'instructional') === TC.trackYear(v2, TODAY).plan.instructional, 'with a later timetable version the lines say which version, and still add up');
});

check('E22', 'Extra: the week sheet', t => {
  const m = richModel(), ws = TC.weekSheet(m, '2026-10-05');
  t.eq([ws.days.length, ws.days.map(d => d.date)], [5, ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']], 'it shows the school week, not a quiet weekend');
  const tue = ws.days[1], club = tue.blocks.find(b => b.name === 'Shelving');
  t.eq([club.note, club.edited, club.start, club.end, club.typeName], ['room 12', true, T('15:00'), T('15:30'), 'Library help'], 'every block has its times, type and note, and edited ones are marked');
  t.ok(ws.days.every(d => d.blocks.every((b, i) => i === 0 || d.blocks[i - 1].end <= b.start)), 'blocks are in order and do not overlap');
  const total = d => d.blocks.reduce((n, b) => n + b.minutes, 0) + d.transitionMinutes;
  t.ok(ws.days.every(d => total(d) === d.totals.instructional + d.totals.assignable + d.totals.notCounted + d.totals.unassigned), 'a day’s blocks plus its Transition are the whole day');
  t.eq([tue.blocks.some(b => b.source === 'gap'), tue.transitionMinutes > 0], [false, true], 'the Transition the gaps make is one line a day, not a row each');
  t.eq(ws.actual.assignable, ws.days.reduce((n, d) => n + d.totals.assignable, 0), 'the week’s totals are the days added up');
  const lab = TC.weekSheet(m, '2026-09-07');
  t.eq([lab.days[0].status, lab.days[0].statusLabel, lab.status], ['closed', 'Labour Day', 'confirmed'], 'a holiday shows as a closed day, and the week says it is confirmed');
});

check('E23', 'Extra: the change log', t => {
  const m = richModel();
  const log = TC.changeLog(m);
  t.eq(log.map(x => x.date + ' ' + x.kind), ['2026-09-07 event', '2026-09-08 add', '2026-09-10 leave', '2026-09-14 event', '2026-09-14 event', '2026-09-22 add', '2026-10-06 add'], 'edits and the confirm and unlock events come out in date order');
  const grad = log.find(x => /Grad/.test(x.what));
  t.eq([grad.entered, grad.note, grad.what], ['2026-09-22', 'Told admin → agreed 🤖 ễ', 'Added Grad → 🤖, 2:45 pm–3:45 pm (Meeting, 60 min)'], 'each entry has the day it was entered, its note and what it was');
  t.eq(TC.changeLog(m, {from: '2026-09-20'}).length, 2, 'it can be filtered from a date');
  t.eq(TC.changeLog(m, {to: '2026-09-09'}).length, 2, 'to a date');
  t.eq(TC.changeLog(m, {type: 'coverage'}).map(x => x.date), ['2026-09-08'], 'by time type');
  t.eq([TC.changeLog(m, {type: 'event'}).length, TC.changeLog(m, {type: 'leave'}).length, TC.changeLog(m, {type: 'dayType'}).length], [3, 1, 0], 'or by kind');
  // a moved block, a changed time type, a removed block and a day type change
  const m2 = withClasses();
  TC.editBlock(m2, '2026-10-07', 'p2', {start: T('10:13'), end: T('11:00'), typeId: 'coverage'}, {entered: '2026-10-07'});
  TC.deleteBlock(m2, '2026-10-08', 'p3', {entered: '2026-10-08', note: 'away'});
  TC.setDayTypeEdit(m2, '2026-10-09', 'friB', {entered: '2026-10-09'});
  const l2 = TC.changeLog(m2);
  t.ok(/moved from .* to 10:13 am.11:00 am; time type Class → Coverage/.test(l2[0].what), 'a changed block says how: moved, and its time type from → to (' + l2[0].what + ')');
  t.ok(/^Removed /.test(l2[1].what) && l2[1].note === 'away' && l2[1].minutes < 0, 'a removed block says so, with the minutes taken away and the note');
  t.ok(/^Day type .* → Friday B$/.test(l2[2].what) && l2[2].kind === 'dayType', 'a day type change says from and to');
  // a block edited before a week was confirmed keeps the day it was entered after the unlock
  const m3 = withClasses();
  TC.addBlock(m3, '2026-09-15', {start: T('15:00'), end: T('15:30'), typeId: 'meeting', name: 'Grad', note: 'x'}, {entered: '2026-09-15'});
  TC.confirmWeek(m3, '2026-09-14', {at: '2026-09-18'}); TC.unlockWeek(m3, '2026-09-14', {at: '2026-09-25'});
  let k = TC.changeLog(m3).find(x => x.kind === 'kept');
  t.eq([k.entered, k.what], ['2026-09-15', 'Kept from the confirmed week: Grad, 3:00 pm–3:30 pm'], 'an edit from before the week was confirmed is listed after it is unlocked, with the day it was entered');
  TC.deleteBlock(m3, '2026-09-15', 'edit:' + m3.edits['2026-09-15'].find(e => e.op === 'add' && e.name === 'Grad').id, {entered: '2026-09-26'});
  t.ok(/then removed$/.test(TC.changeLog(m3).find(x => x.kind === 'kept').what), 'and what happened to it since');
  t.eq(TC.changeLog(m3).filter(x => x.kind === 'kept').length, 1, 'blocks that were simply the plan are not listed as changes');
});

check('E24', 'Extra: extra-curricular and conference time', t => {
  const m = TC.newModel(), by = id => m.timeTypes.find(x => x.id === id);
  t.eq([by('voluntary').name, by('voluntary').category, by('extraAssigned').name, by('extraAssigned').category], ['Extra-curricular volunteer', 'notCounted', 'Extra-curricular assigned', 'assignable'], 'extra-curricular time is Not counted when you volunteer for it and Assignable when it is assigned');
  t.ok(!JSON.stringify(m.timeTypes).toLowerCase().includes('robotic'), 'no time type mentions robotics');
  // a block of each, on a school day
  const d = '2026-10-06', base = TC.resolveDay(m, d).totals; TC.addBlock(m, d, {start: T('15:00'), end: T('16:00'), typeId: 'voluntary', name: 'Chess club'}); TC.addBlock(m, d, {start: T('16:00'), end: T('17:00'), typeId: 'extraAssigned', name: 'Assigned team'});
  const r = TC.resolveDay(m, d);
  t.eq([r.totals.notCounted - base.notCounted, r.totals.assignable - base.assignable, r.totals.instructional - base.instructional], [60, 60, 0], 'an hour of each: volunteer time is not counted, assigned time is Assignable');
  // a save from before the change is upgraded, and a name somebody changed is left alone
  const old = JSON.parse(JSON.stringify(TC.newModel()));
  old.timeTypes = old.timeTypes.filter(x => x.id !== 'extraAssigned'); const v = old.timeTypes.find(x => x.id === 'voluntary'); v.name = 'Voluntary'; v.includes = 'Clubs and coaching (the old wording)';
  const up = TC.migrate(JSON.parse(JSON.stringify(old)));
  t.eq([up.timeTypes.find(x => x.id === 'voluntary').name, up.timeTypes.find(x => x.id === 'extraAssigned').category, up.timeTypes.findIndex(x => x.id === 'extraAssigned') === up.timeTypes.findIndex(x => x.id === 'event') + 1], ['Extra-curricular volunteer', 'assignable', true], 'an older save gets the new name and the new type, next to School event');
  t.ok(!JSON.stringify(up.timeTypes).toLowerCase().includes('robotic'), 'and no longer mentions robotics');
  old.timeTypes.find(x => x.id === 'voluntary').name = 'My volunteering';
  t.eq(TC.migrate(JSON.parse(JSON.stringify(old))).timeTypes.find(x => x.id === 'voluntary').name, 'My volunteering', 'a name the teacher changed is kept');
  t.eq(JSON.stringify(TC.migrate(JSON.parse(JSON.stringify(up)))) === JSON.stringify(up), true, 'upgrading twice changes nothing more');
  t.eq(TC.checkModel(up), null, 'and the upgraded year passes the safety checks');
  // conference time is Assignable: School event, evenings too
  const c = TC.newModel(); TC.setCalendarDate(c, '2026-10-20', 'nid', 'Student Learning Conferences'); TC.setDayType(c, '2026-10-20', 'conference');
  TC.addBlock(c, '2026-10-20', {start: T('12:00'), end: T('20:00'), typeId: 'event', name: 'Student-led conferences'});
  const cd = TC.resolveDay(c, '2026-10-20');
  t.eq([cd.dayTypeId, cd.totals.assignable, cd.totals.instructional, cd.totals.notCounted], ['conference', 480, 0, 0], 'eight hours of conferences on a conference day, evening included, are all Assignable');
  t.eq(TC.TIME_TYPES.find(x => x.id === 'event').category, 'assignable', 'School event is an Assignable time type');
});

check('E25', 'Extra: data kept in the browser that cannot be opened', t => {
  const m = richModel(), raw = JSON.stringify(m);
  const ok = TC.openSaved(raw);
  t.eq([ok.ok, JSON.stringify(ok.model) === raw], [true, true], 'good saved data opens, exactly as it was');
  const cut = TC.openSaved(raw.slice(0, 4000));
  t.eq([cut.ok, cut.code, /cut off/.test(cut.reason)], [false, 'damaged', true], 'data that is cut off is refused, and the reason says so');
  const noCal = JSON.parse(raw); delete noCal.calendar;
  const r2 = TC.openSaved(JSON.stringify(noCal));
  t.eq([r2.ok, r2.code, /calendar/.test(r2.reason)], [false, 'unreadable', true], 'data that is whole JSON but not a usable year is refused, naming the problem');
  const newer = JSON.parse(raw); newer.version = 99;
  t.eq([TC.openSaved(JSON.stringify(newer)).code, /newer version/.test(TC.openSaved(JSON.stringify(newer)).reason)], ['newer', true], 'data from a newer version is refused, and said to be newer');
  t.eq([TC.openSaved('').ok, TC.openSaved('null').ok, TC.openSaved('{"__proto__": {}}').ok, TC.openSaved('[1,2]').ok], [false, false, false, false], 'empty text, null, a __proto__ key and an array are all refused');
  const v1 = JSON.parse(raw); v1.version = 1; v1.versions.forEach(v => { Object.keys(v.days).forEach(id => { v.days[id].bells = (v.schedules[v.days[id].schedule] || {bells: []}).bells; delete v.days[id].schedule; }); delete v.schedules; });
  t.eq(TC.openSaved(JSON.stringify(v1)).ok, true, 'an older layout still opens, and is upgraded');
  t.eq(TC.readModel(raw).ok && TC.unpack(TC.pack(m, null)).ok, true, 'a saved file and browser storage use the same checks');
});

check('E26', 'Extra: the setup file an AI writes, and the instructions that make it', t => {
  const ins = TC.setupInstructions();
  t.ok(TC.TIME_TYPES.every(x => ins.indexOf(x.name) >= 0 && ins.indexOf('[' + x.id + ']') >= 0) && TC.DAY_TYPES.every(x => ins.indexOf(x.id + ' = ' + x.name) >= 0), 'the instructions list every time type (with its category) and every day type');
  t.ok(ins.indexOf('08:05–08:56, 08:58–09:45') >= 0 && ins.indexOf('13:00–14:45') >= 0 && ins.indexOf('2026-08-26') >= 0, 'they give the default bell times, the Friday meeting and the built-in calendar, so a teacher at this school need not repeat them');
  t.ok(!/\d{3}-\d{3}-\d{4}|@/.test(ins), 'and carry no phone number or email address');
  const fenced = /```json\n([\s\S]*?)\n```/.exec(ins);
  t.eq(JSON.parse(fenced[1]), TC.SETUP_EXAMPLE, 'the example in them is the example the tool is tested with');

  // the example really is accepted, and does what it says
  const m = TC.newModel(), r = TC.applySetupFile(m, TC.SETUP_EXAMPLE, {at: '2027-08-01'});
  t.eq([r.ok, TC.checkModel(m), r.changes.map(c => c.label)], [true, null, ['About you', 'Calendar', 'Bell times', 'Timetable', 'Friday letters', 'Duties']], 'the example imports, and the year it makes passes the safety checks');
  const v = m.versions[0], bellsMon = TC.bellsOf(v, 'mon'), p2 = bellsMon[1];
  t.eq([m.settings.teacher, m.calendar.name, m.calendar.start, v.start, bellsMon.length, p2.id], ['Pat Teacher', '2027–28 school year', '2027-08-25', '2027-08-25', 4, 'p2'], 'name, calendar, the version start and bell times are set');
  t.eq([v.timetable.mon.p2, v.timetable.tue.p2, v.timetable.mon.p4, v.timetable.friC.p1], [{type: 'class', name: 'Science 8'}, {type: 'prep', name: ''}, {type: 'supervision', name: 'Lunch supervision'}, {type: 'class', name: 'Math 8'}], 'a timetable line for several day types sets each of them, by period number');
  t.eq([TC.bellsOf(v, 'friA').map(b => b.kind + ':' + b.id), TC.bellsOf(v, 'friA')[2].type], [['period:p1', 'period:p2', 'block:b1'], 'lunch'], 'a fixed block comes after the periods and keeps its time type');
  t.eq([Object.keys(m.dayTypeOverrides).length, m.dayTypeOverrides['2027-09-03'], TC.missingDayTypeDates(m, 5).length], [39, 'friA', 0], 'the Friday letters are filled in from the start date, skipping days with no school');
  t.eq(m.duties.map(d => d.name + ':' + d.rule.kind), ['Meeting:weekly', 'Staff meeting:nthWeekday', 'Bus duty:weekly'], 'duties are added beside the Friday meeting that is already there');
  t.eq(m.log[m.log.length - 1].kind, 'setup-file', 'it is logged');
  t.eq(TC.changeLog(m).some(x => x.kind === 'event' && /setup file/.test(x.what)), true, 'and shows in the change log');

  // what the file leaves out is left alone, and a preview changes nothing
  const keep = TC.newModel(); TC.setTimetable(keep.versions[0], 'mon', 'p1', {type: 'class', name: 'Mine'}); const snap = JSON.stringify(keep);
  t.eq(TC.previewSetupFile(keep, {format: 'time-counter-setup', version: 1, about: {fte: 0.5}}).ok && JSON.stringify(keep) === snap, true, 'a preview changes nothing');
  TC.applySetupFile(keep, {format: 'time-counter-setup', version: 1, about: {fte: 0.5}});
  t.eq([keep.settings.fte, keep.versions[0].timetable.mon.p1.name, keep.calendar.id], [0.5, 'Mine', 'cbe-2026-27'], 'a file that only sets FTE changes only that: the timetable and the built-in calendar stay');
  // with no bells in the file, the default eight periods are there to type into
  const d = TC.newModel(); TC.applySetupFile(d, {format: 'time-counter-setup', version: 1, timetable: [{dayTypes: ['mon'], period: 8, type: 'prep'}, {dayTypes: ['mon'], period: 1, type: 'class', name: 'Math'}]});
  t.eq([d.versions[0].timetable.mon.p8.type, d.versions[0].timetable.mon.p1.name], ['prep', 'Math'], 'with no bells in the file the default bell times are used');
  // a timetable in a file replaces the old one; a duty with the same name is replaced, with its id kept
  TC.applySetupFile(d, {format: 'time-counter-setup', version: 1, timetable: [{dayTypes: ['tue'], period: 1, type: 'class'}]});
  t.eq([Object.keys(d.versions[0].timetable), d.versions[0].timetable.tue.p1.name], [['tue'], ''], 'a timetable in a file replaces the one before');
  TC.applySetupFile(d, {format: 'time-counter-setup', version: 1, duties: [{name: 'meeting', type: 'Committee', start: '15:00', end: '16:00', repeat: {dayTypes: ['mon']}}]});
  t.eq([d.duties.length, d.duties[0].id, d.duties[0].typeId, d.duties[0].shared], [1, 'friMeeting', 'committee', true], 'a duty with the same name is replaced, and keeps its id and whether it is shared');
  // extra day types, and a rotation by dates
  const c = TC.newModel(), rc = TC.applySetupFile(c, {format: 'time-counter-setup', version: 1, dayTypes: [{id: 'day1', name: 'Day 1'}, {id: 'day2', name: 'Day 2'}], defaultDayTypes: {fri: 'day1'}, fridayLetters: {dates: {'2026-09-04': 'Day 2'}},
    bells: [{name: 'Cycle', dayTypes: ['day1', 'day2'], periods: [{start: '09:00', end: '10:00'}]}], timetable: [{dayTypes: ['Day 1', 'day2'], period: 1, type: 'Class'}]});
  t.eq([rc.ok, c.dayTypes.map(x => x.id).slice(-2), c.dayTypeDefaults.weekday[5], c.dayTypeOverrides['2026-09-04'], c.versions[0].timetable.day2.p1.type], [true, ['day1', 'day2'], 'day1', 'day2', 'class'], 'a school with its own day types can add them, make one the default, and write letters by date (names work as well as ids)');

  // wrong files are refused, line by line, and nothing changes
  const bad = (file, base) => { const x = base || TC.newModel(), s0 = JSON.stringify(x), r = TC.applySetupFile(x, file); return {ok: r.ok, errs: r.errors || [], same: JSON.stringify(x) === s0}; };
  const F = o => Object.assign({format: 'time-counter-setup', version: 1}, o);
  const one = (file, re, msg, base) => { const b = bad(file, base); t.eq([b.ok, b.same, b.errs.some(e => re.test(e.path + ' ' + e.message))], [false, true, true], msg); };
  one({format: 'other', version: 1}, /format/, 'a file of another format is refused');
  one(F({timeTable: []}), /Unknown key .timeTable./, 'a misspelt key is refused rather than ignored');
  one(F({timetable: [{dayTypes: ['mon'], period: 9, type: 'class'}]}), /Monday has 8 periods, so there is no period 9/, 'a period that does not exist is named, with how many there are');
  one(F({timetable: [{dayTypes: ['mon'], period: 1, type: 'Teaching'}]}), /no time type called "Teaching".*Class/, 'an unknown time type lists the ones there are');
  const all = bad(F({timeTable: [], timetable: [{dayTypes: ['mon'], period: 9, type: 'Teaching'}], bells: [{name: 'x', dayTypes: ['mon'], periods: [{start: '8:05 am', end: '08:56'}]}]}));
  t.eq([all.ok, all.same, all.errs.length >= 3], [false, true, true], 'every problem is reported in one pass, so an AI can fix them all at once');
  one(F({timetable: [{dayTypes: ['mon'], period: 1, type: 'class'}, {dayTypes: ['mon', 'tue'], period: 1, type: 'prep'}]}), /Monday period 1 is listed twice/, 'the same period listed twice is refused');
  one(F({timetable: [{dayTypes: ['monday2'], period: 1, type: 'class'}]}), /no day type called "monday2"/, 'an unknown day type is refused');
  one(F({bells: [{name: 'x', dayTypes: ['mon'], periods: [{start: '8:05 am', end: '08:56'}]}]}), /24-hour/, 'a time with am or pm is refused, with how to write it');
  one(F({bells: [{name: 'x', dayTypes: ['mon'], periods: [{start: '08:00', end: '09:00'}, {start: '08:30', end: '09:30'}]}]}), /overlap/, 'bell times that overlap are refused');
  one(F({bells: [{name: 'x', dayTypes: ['mon'], periods: [{start: '09:00', end: '08:00'}]}]}), /not after it starts/, 'a period that ends before it starts is refused');
  one(F({bells: [{name: 'a', dayTypes: ['mon'], periods: [{start: '08:00', end: '09:00'}]}, {name: 'b', dayTypes: ['mon'], periods: [{start: '08:00', end: '09:00'}]}]}), /in two bell time entries/, 'a day type in two bell entries is refused');
  one(F({calendar: {firstOperationalDay: '2027-02-30', firstStudentDay: '2027-09-01', lastStudentDay: '2028-06-01', lastOperationalDay: '2028-06-05', dates: []}}), /calendar\.firstOperationalDay.*needs a date/, 'a date that does not exist is refused, naming the field');
  one(F({calendar: {firstOperationalDay: '2027-08-25', firstStudentDay: '2027-08-30', lastStudentDay: '2028-06-23', lastOperationalDay: '2028-06-28', dates: ['Labour Day 2027-09-06']}}), /calendar\.dates \(line 1\)/, 'a calendar line that is not in the format is refused, with its line');
  one(F({duties: [{name: 'x', type: 'Meeting', start: '15:00', end: '16:00'}]}), /duties\[0\]\.repeat/, 'a duty with no repeat is refused');
  one(F({duties: [{name: 'x', type: 'Meeting', start: '16:00', end: '15:00', repeat: {dayTypes: ['mon']}}]}), /not after it starts/, 'a duty that ends before it starts is refused');
  one(F({fridayLetters: {dates: {'2030-01-04': 'friA'}}}), /not a date inside the school year/, 'a Friday letter outside the year is refused');
  one(F({about: {fte: 3}}), /FTE is a number above 0/, 'an FTE above 1 is refused');
  const used = TC.newModel(); TC.addBlock(used, '2026-10-06', {start: T('15:00'), end: T('15:30'), typeId: 'meeting', name: 'x'});
  one(F({calendar: SETUP_CAL()}), /edits or confirmed weeks/, 'a new calendar is refused when the year already has edits', used);
  const two = TC.newModel(); TC.ensureVersion(two, '2027-01-04');
  one(F({timetable: [{dayTypes: ['mon'], period: 1, type: 'class'}]}), /timetable versions that start later/, 'a timetable is refused when the plan has a later version', two);
  function SETUP_CAL(){ return TC.SETUP_EXAMPLE.calendar; }
  // text from a paste or a file
  const text = JSON.stringify(TC.SETUP_EXAMPLE, null, 2);
  t.eq([TC.readSetupText(text).ok, TC.readSetupText('```json\n' + text + '\n```').ok, TC.readSetupText('Here you go!\n```json\n' + text + '\n```\nLet me know.').ok, TC.readSetupText('Sure. ' + text + ' Done.').ok], [true, true, true, true], 'the JSON is found whether it is bare, in a code block, or in a chat reply');
  const broken = TC.readSetupText(text.replace('"fte": 1', '"fte": 1,'));
  t.eq([broken.ok, /not valid JSON/.test(broken.errors[0].message)], [false, true], 'JSON with a stray comma is refused in plain words');
  t.eq([TC.readSetupText('').ok, TC.readSetupText('{"__proto__": 1}').ok, TC.readSetupText('[1]').ok && TC.applySetupFile(TC.newModel(), TC.readSetupText('[1]').file).ok], [false, false, false], 'an empty paste, a __proto__ key and a list are refused');
});

check('E27', 'Extra: Full day assignable time (a field trip or sports day, start to finish)', t => {
  const m = TC.newModel(), ver = m.versions[0], d = '2026-09-08';
  t.eq([m.dayTypes.some(x => x.id === 'fullDay'), m.timeTypes.find(x => x.id === 'fullDay').category, m.defaultsVersion], [true, 'assignable', 1], 'a new year has the day type, an Assignable time type and the defaults marker');
  t.eq([TC.bellsOf(ver, 'fullDay').length, TC.bellsOf(ver, 'fullDay')[0].type, TC.bellsOf(ver, 'fullDay')[0].start, TC.bellsOf(ver, 'fullDay')[0].end], [1, 'fullDay', T('8:05'), T('14:45')], 'the day type is one block, 08:05 to 14:45, typed Full day assignable time');
  for(let p = 1; p <= 8; p++) TC.setTimetable(ver, 'tue', 'p' + p, {type: 'class', name: 'Math'});
  const plan = TC.resolveDay(m, d).totals;
  t.eq([plan.instructional > 0, TC.checkModel(m)], [true, null], 'a Tuesday with classes starts with Instructional time');
  const change = TC.describeChange(m, [d], mm => TC.setFullDay(mm, d, {start: T('7:30'), end: T('16:00'), name: 'Zoo trip'}, {entered: d}));
  t.ok(change.delta.instructional < 0 && change.after.instructional === 0, 'making it a full day lowers Instructional time, which is what the screen asks about first');
  const r0 = TC.setFullDay(m, d, {start: T('7:30'), end: T('16:00'), name: 'Zoo trip', note: 'bus at 7:30'}, {entered: d});
  const day = TC.resolveDay(m, d);
  t.eq([day.dayTypeId, day.blocks.length, day.blocks[0].start, day.blocks[0].end, day.blocks[0].name, day.blocks[0].category], ['fullDay', 1, T('7:30'), T('16:00'), 'Zoo trip', 'assignable'], 'the whole day is one block from the start to the finish, with the name given');
  t.eq([day.totals.instructional, day.totals.assignable, day.totals.notCounted, day.totals.unassigned, day.flags.length], [0, 510, 0, 0, 0], '8 h 30 min, all Assignable, nothing unassigned, nothing flagged');
  t.eq(r0.dropped, 0, 'nothing had been changed on that day, so nothing was replaced');
  t.eq([TC.userEdits(m, d).length, m.edits[d].map(e => e.op).sort().join()], [2, 'change,dayType'], 'it is two small edits to the plan: the day type and the block’s times');
  TC.resetDay(m, d);
  t.eq([JSON.stringify(TC.resolveDay(m, d).totals) === JSON.stringify(plan), m.edits[d]], [true, undefined], 'resetting the day puts it back exactly as the plan has it');
  // a period changed earlier no longer exists on a full day, so that change goes; a block the week added stays
  TC.editBlock(m, d, 'p1', {end: T('9:00')}, {}); TC.addBlock(m, d, {start: T('16:30'), end: T('17:30'), typeId: 'meeting', name: 'Staff meeting'});
  const r1 = TC.setFullDay(m, d, {start: T('8:05'), end: T('14:45')}, {});
  const d1 = TC.resolveDay(m, d);
  t.eq([r1.dropped, d1.flags.length, d1.totals.instructional, d1.totals.assignable], [1, 0, 0, 400 + 60], 'a change to an old period is replaced (and counted), a block added that day stays, and nothing is left flagged');
  // days it cannot be used on
  const refuse = (date, o, re, msg) => { let e = ''; try{ TC.setFullDay(m, date, o || {start: T('8:05'), end: T('14:45')}, {}); }catch(x){ e = x.message; } t.ok(re.test(e), msg); };
  const conv = m.calendar.exceptions.find(x => x.status === 'convention').from, closed = m.calendar.exceptions.find(x => x.status === 'closed').from;
  refuse(conv, null, /fixed 6 h/, 'a Teachers’ Convention day is refused: it counts a fixed 6 h');
  refuse(closed, null, /closed/, 'a closed day is refused');
  refuse('2026-09-12', null, /closed/, 'a Saturday is refused');
  refuse('2026-09-09', {start: T('15:00'), end: T('9:00')}, /end after it starts/, 'a day that ends before it starts is refused');
  const before = JSON.stringify(m);
  refuse('2026-09-09', {start: T('8:00'), end: T('25:00')}, /within one day/, 'a time past midnight is refused');
  t.eq(JSON.stringify(m), before, 'a refused change leaves the year untouched');
  // locked and kept weeks
  const ws = TC.weekStart('2026-09-15'); TC.confirmWeek(m, ws, {at: '2026-09-21'});
  refuse('2026-09-15', null, /confirmed/, 'a confirmed week is refused');
  TC.unlockWeek(m, ws, {at: '2026-09-22'});
  refuse('2026-09-15', null, /kept as it was/, 'a week that was unlocked and kept as it was is refused until the day is put back to plan');
  // a calendar line, a year saved before this existed, and one where the day type was deleted
  const cal = TC.parseCalendar(m, {start: '2027-08-23', firstStudentDay: '2027-09-01', lastStudentDay: '2028-06-24', end: '2028-06-28'}, '2027-10-15 fullday Sports day');
  t.eq([cal.ok, cal.calendar.exceptions[0].dayType, cal.calendar.exceptions[0].status], [true, 'fullDay', 'instructional'], 'the calendar word fullday makes a school day that runs as a full day');
  const old = JSON.parse(JSON.stringify(TC.newModel()));
  delete old.defaultsVersion; old.dayTypes = old.dayTypes.filter(x => x.id !== 'fullDay'); old.timeTypes = old.timeTypes.filter(x => x.id !== 'fullDay');
  old.versions.forEach(v => { delete v.days.fullDay; delete v.schedules.full; });
  const up = TC.migrate(JSON.parse(JSON.stringify(old)));
  t.eq([up.defaultsVersion, up.dayTypes.some(x => x.id === 'fullDay'), up.timeTypes.some(x => x.id === 'fullDay'), TC.bellsOf(up.versions[0], 'fullDay').length, TC.checkModel(up)], [1, true, true, 1, null], 'a year saved before it existed gets the day type, the time type and the block');
  t.eq(JSON.stringify(TC.migrate(JSON.parse(JSON.stringify(up)))) === JSON.stringify(up), true, 'upgrading twice changes nothing more');
  const gone = JSON.parse(JSON.stringify(TC.newModel())); TC.deleteDayType(gone, 'fullDay');
  t.eq(TC.migrate(JSON.parse(JSON.stringify(gone))).dayTypes.some(x => x.id === 'fullDay'), false, 'a day type the teacher deleted is not put back');
  const taken = JSON.parse(JSON.stringify(old)); taken.versions[0].schedules.full = {id: 'full', name: 'Mine', bells: [{id: 'p1', kind: 'period', name: '', start: 480, end: 540}]};
  const tk = TC.migrate(taken);
  t.eq([tk.versions[0].schedules.full.name, tk.versions[0].days.fullDay.schedule !== 'full', TC.checkModel(tk)], ['Mine', true, null], 'a schedule that already has the id is left alone and the new one gets another');
  t.eq([TC.unpack(TC.pack(m, null)).ok, TC.unpack(TC.pack(m, null)).model.defaultsVersion], [true, 1], 'the marker survives saving and opening a TimeTracker.pdf');
  // the instructions an AI is given
  const ins = TC.setupInstructions();
  t.ok(/fullday \(/.test(ins) && /fullDay = Full day assignable time/.test(ins) && ins.indexOf('Full day assignable time [fullDay]') >= 0, 'the setup instructions name the calendar word, the day type and the time type');
});

await Promise.all(jobs);
results.sort((a, b) => (typeof a.n === 'number' ? a.n : 99) - (typeof b.n === 'number' ? b.n : 99));

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ran = results.filter(r => !r.pending), passed = ran.filter(r => r.pass);
let html = '';
results.forEach(r => {
  if(r.pending){
    html += '<section class="card tcard pending"><h2><span class="n">' + r.n + '</span><span class="t">' + esc(r.title) +
            '</span><span class="pill">not yet — ' + r.pending + '</span></h2></section>';
    return;
  }
  const bad = r.asserts.filter(a => !a.pass);
  html += '<section class="card tcard" data-check="' + r.n + '"><h2><span class="n">' + r.n + '</span><span class="t">' + esc(r.title) +
          '</span><span class="pill ' + (r.pass ? 'ok' : 'bad') + '">' + (r.pass ? '✓ pass' : '✗ fail') + ' · ' +
          (r.asserts.length - bad.length) + '/' + r.asserts.length + '</span></h2>';
  if(bad.length) html += '<ul>' + bad.map(a => '<li class="fail">' + esc(a.msg) + '</li>').join('') + '</ul>';
  html += '<details><summary>What was checked</summary><ul>' + r.asserts.filter(a => a.pass).map(a => '<li>' + esc(a.msg) + '</li>').join('') + '</ul></details></section>';
});
out.innerHTML = html;
summary.textContent = passed.length + ' / ' + ran.length + ' checks pass';
summary.className = 'pill ' + (passed.length === ran.length ? 'ok' : 'bad');
window.TimeCounterTest = {results: results.map(r => ({n:r.n, title:r.title, pending:r.pending || null, pass:r.pending ? null : r.pass,
  failures:(r.asserts || []).filter(a => !a.pass).map(a => a.msg), asserts:(r.asserts || []).length})),
  passed: passed.length, ran: ran.length};
})();
