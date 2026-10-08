// Shared by the browser tests: where the page is, how to start the browser, and where
// scratch files (downloaded PDFs, print-outs) go.
const path = require('path'), os = require('os'), fs = require('fs');
exports.URL = require('url').pathToFileURL(path.resolve(__dirname, '..', 'index.html')).href;
// Set CHROME to the path of a Chromium or Chrome binary if Playwright cannot find its own.
exports.launchOptions = process.env.CHROME ? {executablePath: process.env.CHROME} : {};
exports.out = name => {
  const d = path.join(os.tmpdir(), 'time-counter-tests', name);
  fs.mkdirSync(d, {recursive: true});
  return d;
};
