# Vendored libraries

Downloaded once from jsDelivr and served locally (no runtime CDN use).

| File | Package | Version | Source | SHA-256 |
|---|---|---|---|---|
| `pdf.min.js` | pdfjs-dist | 4.10.38 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs | 27FC2A057A00F92A4334AD06E17DBD7259912954E9FB7F76400BCCA5FD190A9C |
| `pdf.worker.min.js` | pdfjs-dist | 4.10.38 | https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs | 1BAA1844C89C80A5B2797C916E75AB29254BE46D8E9CB53CB6364D7AAD84BE36 |
| `mammoth.browser.min.js` | mammoth | 1.8.0 | https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js | DEB07BF230D1CB3E190BC5ADC6743F35C6531B6571D1E5469B24F452A7F0F4AB |

The pdf.js files are the upstream `.mjs` ES-module builds, renamed to `.js` (contents unchanged — hashes above
match the originals). Some simple static servers (e.g. `python -m http.server`) serve `.mjs` as `text/plain`,
which browsers refuse to run as a module; `.js` is served as JavaScript everywhere.

Usage:
- pdf.js is an ES module: `import('../vendor/pdf.min.js')`, with `GlobalWorkerOptions.workerSrc` pointing at `vendor/pdf.worker.min.js`. Loaded lazily on the first PDF.
- mammoth is a UMD script: injected on the first DOCX, exposes `window.mammoth`.

Licenses: pdf.js — Apache-2.0; mammoth — BSD-2-Clause.
