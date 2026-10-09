// App entry: state, hash router, theme, and the analyze action.

import { analyzeResume } from './analyzer.js';
import { buildTips } from './tips.js';
import { matchJob } from './jobmatch.js';
import { storage, history } from './history.js';
import { renderPage } from './ui.js';

const ROUTES = {
  upload: 'Upload',
  report: 'Report',
  job: 'Job match',
  tips: 'Improvement tips',
  history: 'History',
};

const state = {
  // What's in the Upload form (kept across page switches and reloads).
  draft: { resumeText: '', jobText: '', targetRole: '', jobSampleId: '', source: null },
  // The current analysis: { input, analysis, tips, match } or null.
  result: null,
  // Tip ids marked "done" on the Tips page.
  done: new Set(),
};

// ---------- Analysis ----------

// record: add the result to History (only for fresh analyses, not when reopening one).
function runAnalysis(input, { persist = true, record = persist } = {}) {
  const resumeText = String(input.resumeText || '');
  const jobText = String(input.jobText || '');
  const targetRole = String(input.targetRole || '').trim().slice(0, 60);
  const sourceName = typeof input.sourceName === 'string' ? input.sourceName.slice(0, 120) : '';

  const analysis = analyzeResume(resumeText);
  if (!analysis.ok) return { ok: false, error: analysis.error };

  const tips = buildTips(analysis, { targetRole });
  const match = jobText.trim() ? matchJob(analysis.text, jobText) : null;
  state.result = { input: { resumeText, jobText, targetRole, sourceName }, analysis, tips, match };
  state.done = new Set();
  if (persist) {
    storage.set('current', state.result.input);
    storage.set('done', []);
  }
  if (record) history.add(state.result.input, analysis, match);
  return { ok: true };
}

let draftTimer = null;
const actions = {
  updateDraft(patch) {
    Object.assign(state.draft, patch);
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => storage.set('draft', state.draft), 300);
  },
  analyze() {
    clearTimeout(draftTimer);
    storage.set('draft', state.draft);
    const d = state.draft;
    const res = runAnalysis({ ...d, sourceName: d.source && d.source.name });
    if (res.ok) navigate('report');
    return res;
  },
  toggleTip(id, isDone) {
    if (isDone) state.done.add(id); else state.done.delete(id);
    storage.set('done', [...state.done].sort());
  },
  // Put text (e.g. the improved resume) back into the Upload form for editing.
  editText(text) {
    clearTimeout(draftTimer);
    Object.assign(state.draft, { resumeText: text, source: null });
    storage.set('draft', state.draft);
    navigate('upload');
  },
  openHistory(id) {
    const entry = history.get(id);
    if (!entry) return false;
    const input = { resumeText: entry.resumeText, jobText: entry.jobText, targetRole: entry.targetRole || '', sourceName: entry.sourceName || '' };
    const res = runAnalysis(input, { persist: true, record: false });
    if (!res.ok) return false;
    clearTimeout(draftTimer);
    Object.assign(state.draft, { resumeText: input.resumeText, jobText: input.jobText, targetRole: input.targetRole,
      jobSampleId: '', source: input.sourceName ? { name: input.sourceName } : null });
    storage.set('draft', state.draft);
    navigate('report');
    return true;
  },
  history,
  // Small per-browser conveniences (e.g. the job-search location). Same try/catch storage wrapper.
  prefs: {
    get: (k, fallback) => { const v = storage.get(`pref:${k}`, fallback); return typeof v === typeof fallback ? v : fallback; },
    set: (k, v) => storage.set(`pref:${k}`, v),
  },
  navigate,
};

// ---------- Router ----------

function currentRoute() {
  const m = location.hash.match(/^#\/([a-z]+)/);
  return m && ROUTES[m[1]] ? m[1] : 'upload';
}

function navigate(route) {
  if (currentRoute() === route) render(false);
  else location.hash = `#/${route}`;
}

function render(initial) {
  const route = currentRoute();
  for (const a of document.querySelectorAll('.tabs a')) {
    if (a.dataset.route === route) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  const view = document.getElementById('view');
  renderPage(route, view, { state, actions });
  document.title = `${ROUTES[route]} · ResumeLens`;
  if (!initial) {
    // Move focus to the new page heading so keyboard and screen-reader users land in the right place.
    window.scrollTo(0, 0);
    const h1 = view.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  }
}

// ---------- Theme ----------

const root = document.documentElement;
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

function effectiveTheme() {
  return root.dataset.theme || (darkQuery && darkQuery.matches ? 'dark' : 'light');
}
function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme; // follow the system setting
  const btn = document.getElementById('theme-toggle');
  const mode = effectiveTheme();
  btn.dataset.mode = mode;
  btn.setAttribute('aria-label', mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  btn.title = btn.getAttribute('aria-label');
}

// ---------- Boot ----------

function init() {
  applyTheme(storage.get('theme', null));
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    storage.set('theme', next);
  });
  if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', () => applyTheme(root.dataset.theme || null));

  const draft = storage.get('draft', null);
  if (draft && typeof draft === 'object') {
    for (const k of ['resumeText', 'jobText', 'targetRole', 'jobSampleId']) if (typeof draft[k] === 'string') state.draft[k] = draft[k];
    if (draft.source && typeof draft.source.name === 'string') state.draft.source = { name: draft.source.name };
  }
  // Re-run the last analysis (deterministic, so this reproduces the same report).
  const current = storage.get('current', null);
  if (current && typeof current === 'object' && typeof current.resumeText === 'string') {
    runAnalysis(current, { persist: false });
    // Restore tips marked done, keeping only ids that still exist.
    const done = storage.get('done', []);
    if (state.result && Array.isArray(done)) {
      const ids = new Set(state.result.tips.map((t) => t.id));
      state.done = new Set(done.filter((id) => typeof id === 'string' && ids.has(id)));
    }
  }

  // Stop a file dropped outside the drop zone from navigating away from the app.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  window.addEventListener('hashchange', () => render(false));
  render(true);
}

init();
