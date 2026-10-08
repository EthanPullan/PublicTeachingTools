# Time Counter tests

Two layers, both outside the tool itself so a colleague's copy of `index.html` stays small.

**The self-test** is `../self-test.js`. Open the tool with `?test` on the address
(`index.html?test`) and it runs every check from the design brief plus the extra ones, and
shows pass or fail for each. It needs no tools at all. The checks cover the counting engine,
the saved file and its safety checks, and the PDF.

**The browser tests** here drive the real screens with [Playwright](https://playwright.dev)
and Chromium: drag and drop, confirming weeks, saving a PDF in one browser and opening it in
another, printing, the phone layout, and hostile text in names and notes.

```
npm install -g playwright            # once, with a Chromium (npx playwright install chromium)
NODE_PATH=$(npm root -g) node tools/time-counter/tests/run-all.js
NODE_PATH=$(npm root -g) node tools/time-counter/tests/run-all.js stage5     # just some files
```

- Set `CHROME=/path/to/chromium` if Playwright cannot find a browser.
- `stage5-pdf.js` and `stage6-reports.js` read the saved PDFs with a second, unrelated reader
  (`pdftotext`, `pdfdetach`, `pdfinfo` from poppler, and Python's `pypdf`). Without them
  those two files are skipped.
- `check-setup-file.js file.json` is not a test either: it checks a setup file the way the tool does and prints every problem, or what it would set.
- `write-instructions.js` is not a test: it rewrites `ai-setup-instructions.md` from the tool. `setup-file.js` fails when that copy is out of date.
- `selftest.js` runs `?test` in four time zones (Edmonton, UTC, Auckland, London) to show that
  a daylight-saving change never moves a block.
- `fixtures/` holds two setup files that AI assistants really wrote from the instructions, for two different (made-up) teachers. `setup-file.js` checks that they still import.
- The files are named for the build stage that introduced them. Scratch files go in the
  system temp folder, never in the repo.
