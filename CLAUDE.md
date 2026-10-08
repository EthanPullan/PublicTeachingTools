# Public Teaching Tools — project notes for Claude

The public, colleague-facing sibling of
[`EthanPullan/TeachingTools`](https://github.com/EthanPullan/TeachingTools).
Same design system, same single-file rules, a curated subset of the tools.

## Conventions live upstream — follow the link, don't restate them

The canonical design system and general project conventions are **not copied
into this repo**. Read them at source:

- [STYLE_GUIDE.md](https://github.com/EthanPullan/TeachingTools/blob/main/STYLE_GUIDE.md)
  — the design system (tokens, components, voice).
- [CLAUDE.md](https://github.com/EthanPullan/TeachingTools/blob/main/CLAUDE.md)
  — upstream project notes.

Those files change upstream; this one only records what is different **here**.

## What's different here

- **Scope is a curated subset.** Upstream carries ~20 tools; this site carries
  only the EAL Benchmark tool, Graph Paper and Time Counter.
- **No shared Class Lists.** The shared roster panel (localStorage
  `teachingtools:rosters`) is not on this homepage, and the EAL tool no
  longer reads it. The tool has its own class list instead (see below).
- **The homepage has no JavaScript at all.** `index.html` is a pure static
  launcher. Keep it that way unless there's a real reason not to.

## Layout

- `index.html` — the launcher. Its `:root` tokens and component CSS are lifted
  verbatim from upstream's homepage so the two sites stay visually identical.
- `tools/eal-benchmark/index.html` — **forked from upstream.** This repo is the
  source of truth for the tool; it has diverged and is no longer a copy.
- `tools/graph-paper/index.html` — **native to this repo** (not from upstream).
  Printable blank grids of every common kind.
- `tools/time-counter/index.html` — **native to this repo.** Plans and records a
  school year of work time against the instructional and assignable limits. Being
  built in stages, and linked from the homepage.
- `.nojekyll` — serve files as-is on GitHub Pages.

## The EAL tool has forked from upstream

It began as a verbatim copy of `tools/eal-benchmark/index.html` in
TeachingTools, but the file-name builder was added here, so the two have
diverged.

**Never `cp` the tool from TeachingTools** — that would silently delete the
file-name builder. Edit it here. If a fix belongs on both sites, make it here
and port it upstream by hand.

### What diverged

- A **File name** card at the top of the tool. Draggable chips — First, Last,
  ASN, Year, Month, Date, and a repeatable free-text part — set the order of
  the downloaded PDF's name, with a separator picker and a live preview.
  Reorder by dragging, or focus a chip and use ← / → and Delete.
- The chosen order is a *preference*, not form data: it is saved under
  `teachingtools:ealBenchmark:filename`, separate from the draft, so
  "Clear form" leaves it alone.
- `safeToken()` and `formatDateFile()` are gone, replaced by `safeFilePart()`.
  The old helper stripped every digit (`[^A-Z-]`), which would have erased the
  ASN and the date parts outright.
- Its own **Class list** card near the top replaces upstream's shared-roster
  pickers and "Add to class" button. It is a small table of name and ASN, typed
  in or pasted as two columns from a spreadsheet (a digits-only column is
  taken as the ASN). It is saved under `teachingtools:ealBenchmark:class` as
  `{ students: [{ name, asn, done }] }`. The table always ends in one blank
  row, and typing into it starts the next student. `done` is set when that
  student's benchmark is downloaded and drives the ✓ in the picker and the
  "n / m downloaded" pill. "Untick all" resets it. The old
  `teachingtools:ealBenchmark:completed` log is no longer used.
- Picking a student fills in **name and ASN**, and keeps **grade, context and
  next steps**, which are usually shared across a class. It clears the LP
  scores and rubric dates. Upstream clears all of them.
- A **Student work** card near the bottom. Pick or drop a PDF, often a
  whole class scanned into one file, click the pages for this student (or
  type `3-4`), and those pages are saved as their own PDF. It is named after
  the form's file name plus `STUDENT_WORK`, joined by the chosen separator
  (an underscore when that is "none"). The file is held in memory only, not
  in the draft. "Clear form" keeps the scan loaded and only clears the page
  selection, and pages already saved are faded.
- A **Combine** checkbox under that card puts the benchmark and the picked
  pages into one PDF, benchmark first, named with the plain benchmark file
  name. It is a preference saved under `teachingtools:ealBenchmark:combine`.
  It works by reading the freshly built benchmark back through `PdfDoc` and
  handing both documents to `writePages()`, which takes `{ doc, i }` pages
  from any number of documents.
- **`PdfDoc`** is a hand-built PDF reader behind that card, with no library
  (upstream rules out CDNs). It follows the cross-reference table, including
  xref streams, object streams and incremental updates, and falls back to
  scanning for objects when the table is damaged. It previews each page from
  its largest JPEG, which is how scanners store pages. It writes the chosen
  pages into a new PDF (`PdfDoc.writePages`) by copying their objects byte for byte, and trims a
  shared `/XObject` dictionary to what each page's content actually uses.
  Encrypted or unreadable files fall back to saving the whole PDF renamed.

## Graph Paper — how it's built

- **One geometry, four outputs.** `build()` turns the settings into a flat list
  of drawing items in points (top-left origin). The SVG preview, the print
  pages, the PNG and the hand-built PDF all render that same list, so they can't
  disagree. Add a new grid type by adding a `draw…()` that emits items — never
  by drawing straight into one output.
- **Lengths are stored in millimetres**, whatever unit is on screen, so switching
  units never rounds anything. Line weights and text sizes are in points.
- **The PDF draws the grid once** as a Form XObject that every page reuses, and
  is Flate-compressed via `CompressionStream` where the browser has it.
- Settings persist under `teachingtools:graphPaper:settings`; a "Copy link"
  button encodes the non-default settings in the URL hash (`#s=…`).

## Time Counter — how it's built

- **Engine first, screens later.** The scripts, in order: a DOM-free engine
  (`window.TimeCounter`), the PDF layer (`window.TimeCounterPdf`), the screens, the
  self-test, and last of all the inlined pdf-lib. Opening the page with `?test` runs
  every check and shows pass or fail for each. The self-test is async because the PDF
  checks wait for the library; `window.TimeCounterTest` is set when all have finished.
- **Minutes and local dates only.** Dates are `YYYY-MM-DD` strings, times are
  minutes after midnight, totals are whole minutes (hours are for display). No
  `Date` with a time zone anywhere, so daylight-saving changes can't move a block.
- **Layers, and each minute counted once.** A day is built from calendar status,
  day type, the timetable version in force, bells, required arrival/departure,
  duties, then that week's edits. The later layer takes the minutes it covers.
  Every time type belongs to one category: Instructional, Assignable or Not counted.
- **The calendar and limits are data**, not code, so another year can be swapped in.
- **The saved model is plain JSON** (no Maps, Sets or Dates), so it can be embedded
  in a PDF later and reloaded without loss.
- **Screens only change the model through `commit()`** (third script). It snapshots
  the model for undo/redo, saves it to `teachingtools:timeCounter:model`, and rolls
  back if the change throws. Screens re-render from the model, and keep keyboard
  focus by control name or position, so keep new controls in the same DOM order.
- **Plan changes apply from a date forward.** A timetable version is a full copy of
  the generic week; edits go to the version in force, never to earlier ones.
- **Bell times are shared, the timetable is not.** A version holds named bell
  *schedules*, and each day type follows one: Monday to Thursday share one and
  Friday A to D share another, so a bell time is changed once. Each day type keeps
  its own timetable (the time type and class on each period), so classes and prep
  differ by day. "Make this day different" gives a day type its own copy. Models
  saved before this (`version: 1`, bells inside each day type) are upgraded by
  `TC.migrate()` when they are opened.
- **A week is the plan plus edits.** Edits are changes to the plan, kept minimal: one
  `change` per planned block (later changes merge into it, and a change back to the
  plan removes it), a `remove` for a deleted block, an `add` for a block the week made
  itself (edited in place), plus `dayType` and `leave` tags. Screens go through
  `TC.editBlock` / `addBlock` / `deleteBlock` / `splitBlock` and the quick-action
  helpers, never straight into `model.edits`. A change that points at a block that is
  no longer in the plan is **flagged, never dropped**.
- **Ask before lowering Instructional time.** `guardedEdit()` runs a change on a copy
  with `TC.describeChange()`; if Instructional would go down it asks first, then
  reports what changed with an Undo.
- **A confirmed week is locked, and a week that was ever confirmed never shifts.**
  `confirmWeek` snapshots the week's blocks and every edit helper refuses to touch it.
  `unlockWeek` does not hand the week back to the plan: it turns the snapshot into
  ordinary edit ops (one `hold` per day, which pins the status, day type and version,
  plus a base `add` per block and a base `leave`), so the week shows exactly what it
  showed and nothing moves unless the teacher edits it (a deliberate choice). Base ops
  are not user edits (`TC.userEdits` leaves them out), so the status is *reopened*
  until something is changed by hand, then *edited*. Calendar changes inside a
  confirmed or held week are refused. Reset to plan (`resetDay` / `resetWeek`) removes
  the holds and is the only way back to the current plan, and it says so. Confirm and
  unlock are both logged in `model.log`.
- **The week grid is plain pointer events** (no drag-and-drop API). Mouse: drag a
  block, its top or bottom edge, or a time type from the palette. Touch and keyboard:
  press a block, an empty slot or a palette item to open the same form. Anything a
  drag can do, a form can do.
- **Totals read one tracked year** (`TC.trackYear`). Every date counts as `resolveDay`
  reports it, so a confirmed week counts as confirmed and any other week as the plan
  plus its edits. "To date" is the weeks *before the current one*; the current week
  and everything after it is the rest of the projection. Past weeks that are not
  confirmed count **with their edits** (a deliberate choice: an unconfirmed week must
  not silently drop what was recorded). `trackYear(m, today, {pastUnconfirmed: 'plan'})`
  counts them as the plan alone, if that is ever wanted. `TC.dashboard` turns it into
  the four figures, levels (amber at the warning % of a limit, red when the
  projection *or* actual time is over) and the time types that moved it.
- **The headline is only a clean "Yes" when the plan is finished.** Days with no day
  type, or time with no time type, are not counted, so with either it says the plan is
  not finished rather than showing green.
- **Charts are hand-built inline SVG** (no library): one series per chart, a 2px line
  (solid so far, dashed projected), halo-backed direct labels, a crosshair and tooltip
  that also work from the keyboard, and a table view for every chart. The time axis
  counts school days, so the even-pace line to the limit is straight. Text uses text
  colours, never the series colour. Big numbers use proportional figures.
- The calendar year view opens a date's week; its **Edit dates** switch changes a
  date's status instead.
- **TimeTracker.pdf is the only export, and the only import.** `TimeCounterPdf.build`
  draws a short report with pdf-lib's built-in fonts and attaches `timetracker-data.json`:
  an envelope (`format: 'time-counter-save'`, `version`, a CRC-32 `checksum`) whose
  `payload` is the whole model as text (`TC.pack`). The page swaps characters the fonts
  cannot draw (arrows, emoji, many accents) through `printable()`; the attachment keeps
  the exact text. `TimeCounterPdf.read` finds the attachment by scanning every embedded
  file, so it survives other tools that rename it. A PDF printed to a new PDF has no
  attachment, which is reported as "no Time Counter data found".
- **Opening a file never changes anything until it is confirmed.** `TC.unpack` never
  throws: it checks the format, version, checksum, then `TC.checkModel` (types, dates,
  every reference, and a trial calculation) and returns a reason. The dialog shows the
  file next to what is on the device, offers a save first, and either replaces
  everything (`TC.replaceModel`, undoable) or brings in only the **school setup**
  (`TC.applySetup`). When the envelope or model changes shape, bump `FILE_VERSION` or
  the model `version` and add a step to `TC.migrate`.
- **School setup is the shareable part:** calendar and its edits, day types, Friday
  letters, the bell times *in force today* (put into the importer's version in force
  today), and duties marked `shared`. The timetable, personal duties, edits, notes,
  confirmed weeks and settings are never touched. `applySetup` computes the counts it
  reports before it changes anything, so `previewSetup` (on a copy) and the real import
  agree and a repeat import reports nothing.
- **A new year** (`TC.newYear`) keeps day types, bell times, time types and settings,
  loads a new calendar, and clears the timetable (a deliberate choice: what each period
  is changes every year, and a stale one would count silently wrong), Friday letters,
  edits, confirmed weeks, dates on duties and the log. The calendar is typed in, one line per exception
  (`2027-11-11 to 2027-11-13 closed Fall Break`), and `TC.parseCalendar` reports line
  numbers and the day counts to check against the school's calendar. To start from last
  year's file, open it first, then start the new year.
- **`commit()` stamps `model.modified`** (shown as "last changed" when a file is opened).
  Opening a file restores the file's own stamp, so it is not treated as unsaved work.
  The backup reminder (a week since the last save, and changes since) uses it; the last
  save time is a device fact, kept in the UI storage and not in the model.
- **Settings & data** is its own view: Your TimeTracker.pdf, About you, Limits,
  Counting and display, Time types (rename or add; each stays in one category), a new
  year, and Start over. It used to be a Plan tab.
- **pdf-lib 1.17.1 (MIT) is inlined unchanged** in the last `<script>`, so the page
  works offline with no CDN. To upgrade it, replace that block and run the self-test.

## Commit / PR rules — IMPORTANT

- **Never include Claude session links** in commit messages, PR descriptions,
  code, comments, or any other artifact. No `Claude-Session:` trailer and no
  `https://claude.ai/code/session…` URLs anywhere. (Plain co-author attribution
  is fine.) This mirrors upstream's rule.
- This repo is **shared with colleagues** — it is the one being circulated.
  Keep commit messages and page copy presentable.
