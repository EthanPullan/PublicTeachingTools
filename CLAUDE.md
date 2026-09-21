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
- `tools/eal-benchmark/index.html` — **a verbatim vendored copy** of
  `tools/eal-benchmark/index.html` upstream.
- `.nojekyll` — serve files as-is on GitHub Pages.
- `.github/workflows/pages.yml` — publishes the site on every push to
  `main`. Upstream has no workflow (it deploys from a branch); this repo
  carries one so deploying doesn't depend on a settings toggle.

## Syncing the EAL tool

The tool is a plain copy, kept byte-identical so a refresh is a `cp` and a
`diff`, never a merge:

```bash
git clone --depth 1 https://github.com/EthanPullan/TeachingTools /tmp/tt
cp /tmp/tt/tools/eal-benchmark/index.html tools/eal-benchmark/index.html
diff /tmp/tt/tools/eal-benchmark/index.html tools/eal-benchmark/index.html   # expect no output
```

**Do not hand-edit the vendored file.** Fix it upstream and re-copy, or the
next sync conflicts.

## Commit / PR rules — IMPORTANT

- **Never include Claude session links** in commit messages, PR descriptions,
  code, comments, or any other artifact. No `Claude-Session:` trailer and no
  `https://claude.ai/code/session…` URLs anywhere. (Plain co-author attribution
  is fine.) This mirrors upstream's rule.
- This repo is **shared with colleagues** — it is the one being circulated.
  Keep commit messages and page copy presentable.
