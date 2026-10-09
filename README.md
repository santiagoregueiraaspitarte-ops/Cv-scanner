# ResumeLens

A front-end-only, rule-based resume analyzer. Upload a PDF, DOCX or TXT resume (or paste text) and get a
transparent score, line-by-line feedback, a job-description match, and concrete rewrite tips.

- **Private:** everything runs in your browser. Files never leave your device; there is no backend, no account,
  no analytics, and the Content-Security-Policy blocks requests to other hosts. The only thing that can leave is a
  job-search link the user clicks, carrying just the title/skills/location shown on screen.
- **Deterministic:** the same resume text and job description always give the same result.
- **English and Spanish:** switch the interface with EN | ES in the header. Each CV's language is detected
  automatically (or chosen on Upload), so Spanish CVs get Spanish headings, verbs and rewrites. Job match works
  across languages (liderazgo = leadership).
- **Fair:** personal characteristics (name, age, photo, gender, nationality, etc.) are never scored or commented on.
  Contact details are checked only for "email present" and "phone present".

> Score is guidance only and not a hiring guarantee.

## Run it

No build step. Serve the folder with any static server and open the printed URL:

```sh
npx serve .
# or
python -m http.server 8000
```

Opening `index.html` straight from disk (`file://`) won't work, because browsers block ES modules there.

## Pages

| Page | What it does |
|---|---|
| **Upload** | Drop or choose a file (keyboard-operable), or paste text. Optional target role and job description, with sample resumes and jobs. |
| **Report** | Overall score, five sub-scores with explanations and "View N lines" links, and every resume line annotated as issue, suggestion or strength. Has a print view. |
| **Job match** | Importance-weighted keyword match (synonyms such as JS = JavaScript, K8s = Kubernetes), and a skills gap grouped High / Medium / Nice to have. **Find jobs** suggests job titles from the CV's skills and builds LinkedIn, Indeed and Google Jobs search links from a title, up to 5 skills and an optional location, all visible and editable. Links open in a new tab only when clicked; the app never contacts those sites. |
| **Improvement tips** | Tips ordered by score gain, each with rule-based before/after rewrites. Tick tips to preview the new score; copy the improved text or send it back to Upload to fill in placeholders. |
| **History** | Past analyses stored in `localStorage` (this browser only). Open any of them, or compare two side by side. |

## Scoring

Overall = structure 25% + impact 25% + action verbs 20% + length/readability 15% + ATS formatting 15%.

| Sub-score | Rule |
|---|---|
| Structure & sections | Email 10 + phone 10 + Summary 15 + Experience 30 + Education 15 + Skills 20, minus 5 per undated role (max −15). |
| Impact & metrics | Share of achievement lines with a number, %, currency or number word (years excluded); 60%+ = 100. |
| Action verbs | 70 × share of lines opening with an action verb + 30 × share free of weak phrases ("responsible for", "helped"…). |
| Length & readability | Length 40 (200–850 words) + bullets of 28 words or fewer 35 + no first-person pronouns 25. |
| ATS formatting | 100 minus: tab columns −10, table rows (lines starting/ending with `|`) −8, wide spacing −8, images −15, unusual headings −10 (each). |

Each rule is commented in [`src/analyzer.js`](src/analyzer.js).

## Project layout

```
index.html        App shell, CSP, header/footer
styles.css        Theme tokens (light/dark), components, print styles
src/main.js       State, hash router, theme toggle, persistence wiring
src/parser.js     PDF (pdf.js) / DOCX (mammoth) / TXT reading, friendly errors
src/analyzer.js   Pure: line parsing, findings, sub-scores
src/tips.js       Pure: tips, rewrite templates, score projection
src/jobmatch.js   Pure: keyword/synonym matching, skills gap
src/samples.js    Pure: fictional sample resumes and job descriptions (English and Spanish)
src/i18n.js       Pure: all interface text in English and Spanish, CV language detection
src/history.js    localStorage wrapper (try/catch, in-memory fallback) and history store
src/ui.js         Page rendering and DOM wiring
vendor/           Pinned pdf.js and mammoth builds (see vendor/VERSIONS.md)
tests/run.mjs     Node tests
```

The analysis modules never touch the DOM or storage, so they run under Node.

## Tests

```sh
node tests/run.mjs   # or: npm test
```

Covers, in English and Spanish, determinism, strong sample > weak sample, synonym matching, applying all tips raises the weak
sample's score, no personal-characteristic terms in output, error states, PDF line/column rebuilding,
and that the pure modules stay
free of DOM, network, randomness and clock use.
