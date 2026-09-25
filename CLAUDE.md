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
  only the EAL Benchmark tool and Graph Paper.
- **No Class Lists.** The shared roster panel (localStorage
  `teachingtools:rosters`) is not on this homepage. The EAL tool handles its
  absence on its own — it hides the class pickers and falls back to a typed
  name — so nothing needs patching to keep that working.
- **The homepage has no JavaScript at all.** `index.html` is a pure static
  launcher. Keep it that way unless there's a real reason not to.

## Layout

- `index.html` — the launcher. Its `:root` tokens and component CSS are lifted
  verbatim from upstream's homepage so the two sites stay visually identical.
- `tools/eal-benchmark/index.html` — **forked from upstream.** This repo is the
  source of truth for the tool; it has diverged and is no longer a copy.
- `tools/graph-paper/index.html` — **native to this repo** (not from upstream).
  Printable blank grids of every common kind.
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
- A **Student work** card near the bottom. Pick or drop a PDF, often a
  whole class scanned into one file, click the pages for this student (or
  type `3-4`), and those pages are saved as their own PDF. It is named after
  the form's file name plus `STUDENT_WORK`, joined by the chosen separator
  (an underscore when that is "none"). The file is held in memory only, not
  in the draft. "Clear form" keeps the scan loaded and only clears the page
  selection, and pages already saved are faded.
- **`PdfDoc`** is a hand-built PDF reader behind that card, with no library
  (upstream rules out CDNs). It follows the cross-reference table, including
  xref streams, object streams and incremental updates, and falls back to
  scanning for objects when the table is damaged. It previews each page from
  its largest JPEG, which is how scanners store pages. It writes the chosen
  pages into a new PDF by copying their objects byte for byte, and trims a
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

## Commit / PR rules — IMPORTANT

- **Never include Claude session links** in commit messages, PR descriptions,
  code, comments, or any other artifact. No `Claude-Session:` trailer and no
  `https://claude.ai/code/session…` URLs anywhere. (Plain co-author attribution
  is fine.) This mirrors upstream's rule.
- This repo is **shared with colleagues** — it is the one being circulated.
  Keep commit messages and page copy presentable.
