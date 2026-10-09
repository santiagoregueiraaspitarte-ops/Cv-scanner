# ResumeLens — project rules

Front-end-only resume analyzer. These rules are non-negotiable; check every change against them.

## Hard rules
- **Rule-based only.** No AI/LLM API calls, no API keys, no backend, no accounts.
- **Files never leave the device.** No network requests carrying user data (no analytics, no fetch/XHR/beacon with resume or job text). The only network use is loading the app's own static files.
- **Job-search links are the one exception, and only on a click.** "Find jobs" builds plain links to job sites (opened in a new tab with `rel="noopener noreferrer"`). A link may carry only the role, skills and location the user can see and edit on screen — never resume text, contact details or personal characteristics. The app itself never requests those sites.
- **Deterministic.** Same resume text + job description + language settings => identical result, byte for byte. The interface language changes wording only, never scores. No `Math.random`, no `Date`/time-dependent logic in scoring, no reliance on object key order from untrusted input; sort with explicit tie-breaks.
- **No personal-trait scoring.** Never score, flag or comment on name, age, date of birth, gender, photo, nationality, ethnicity, religion, marital status, disability or any other personal characteristic. Contact lines are checked only for "email present" / "phone present".
- **Pure analysis modules.** `src/analyzer.js`, `src/tips.js`, `src/jobmatch.js`, `src/i18n.js` (and `src/samples.js`) must not touch `window`, `document`, `localStorage` or any DOM API, so they run under Node for tests.
- **Persistence:** `localStorage` only, always wrapped in try/catch; the app must work when storage is empty, full or blocked.

## Tech constraints
- Plain HTML, CSS, ES modules. No framework, no bundler, no build step. Must run from a simple static server (`npx serve` or `python -m http.server`).
- Parsing in browser: PDF via pdf.js, DOCX via mammoth, TXT via `File.text()`.
- Libraries are pinned and vendored in `/vendor` (see `vendor/VERSIONS.md`). Never load them from a CDN at runtime. Keep JS files as `.js` (not `.mjs`) so every static server sends a JavaScript MIME type.
- `index.html` has a Content-Security-Policy (`connect-src 'self'`, no external hosts). Don't loosen it.

## Scoring (transparent)
Overall = structure 25% + impact 25% + verbs 20% + length/readability 15% + ATS 15%.
Every sub-score carries an explanation and the line IDs behind it ("View N lines"). Keep a brief comment on each scoring rule in code.

## Scope
In: Upload, Report, Job match (+ "Find jobs" search links), Improvement tips, History (+ compare), printable report.
Out: accounts, job applications, fetching or listing live jobs inside the app, resume builder, any export beyond the print view. Don't add features beyond the spec.

## Languages (English and Spanish)
- Interface: EN | ES switch in the header (defaults to the browser language, remembered). Every user-facing string lives in `src/i18n.js` with both languages; never hard-code text in `ui.js`/`main.js`. The tests fail if a key is missing in either language.
- CV language: auto-detected per CV (`detectLanguage`), overridable on Upload. It picks the language of rewrites, placeholders and suggested headings. Detection rules (headings, verbs, weak phrases, pronouns, months, skills) are bilingual and always active, so a mixed CV is never penalized.
- Job match is accent-insensitive and bilingual (Spanish synonyms map to the same canonical skill).
- Spanish copy uses neutral "tú" forms.

## Structure
`index.html`, `styles.css`, `src/{main,parser,analyzer,tips,jobmatch,history,ui,samples,i18n}.js`, `vendor/`, `tests/`, `README.md`.

## Tests
`node tests/run.mjs` (plain `node:assert`, no framework). Must pass before finishing any change. Covers, in English and Spanish: determinism, strong sample > weak sample, synonym matching, applying all tips raises the weak sample's score, no personal-characteristic terms in analyzer output. Plus language detection and translation completeness.

## UX requirements to preserve
- Every page shows: "Score is guidance only and not a hiring guarantee."
- Tooltips work on tap and keyboard focus, not only hover. Drop zone is keyboard-operable; inputs are labelled.
- Light/dark theme via CSS variables, following `prefers-color-scheme` with a manual toggle; respect safe-area insets.
- Friendly errors: corrupt/unreadable/password-protected file, PDF with no text (scanned), empty text, < 25 words, missing job description on Job match.
- Samples: if the user names another role/industry, adapt `src/samples.js` rather than asking.
