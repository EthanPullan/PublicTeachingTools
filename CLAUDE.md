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

- **Scope is the EAL Benchmark tool only.** Upstream carries ~20 tools; this
  site deliberately does not.
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

## Commit / PR rules — IMPORTANT

- **Never include Claude session links** in commit messages, PR descriptions,
  code, comments, or any other artifact. No `Claude-Session:` trailer and no
  `https://claude.ai/code/session…` URLs anywhere. (Plain co-author attribution
  is fine.) This mirrors upstream's rule.
- This repo is **shared with colleagues** — it is the one being circulated.
  Keep commit messages and page copy presentable.
