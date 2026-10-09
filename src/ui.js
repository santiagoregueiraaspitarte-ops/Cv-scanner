// Page rendering and DOM wiring. All analysis lives in the pure modules; this file only displays it.
// Every visible string comes from i18n.js in the current interface language (state.ui).

import { countWords, analyzeResume, SUBSCORE_ORDER, WEIGHTS } from './analyzer.js';
import { projectScore } from './tips.js';
import { LEVELS, matchJob, suggestRoles, extractSkills, jobSearchLinks } from './jobmatch.js';
import { parseFile, ParseError } from './parser.js';
import { SAMPLE_RESUMES, SAMPLE_JOBS } from './samples.js';
import { t } from './i18n.js';

// ---------- Helpers ----------

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Interface language for the page being rendered (set in renderPage).
let UI = 'en';
const T = (key, params) => t(UI, key, params);
const num = (n, digits) => Number(n).toLocaleString(UI === 'es' ? 'es' : 'en-US',
  digits == null ? undefined : { minimumFractionDigits: digits, maximumFractionDigits: digits });
const sampleLabel = (x) => (x.label && typeof x.label === 'object' ? x.label[UI] || x.label.en : x.label);

const ICONS = {
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/></svg>',
  print: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>',
  external: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/></svg>',
  cross: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
};

function band(score) {
  return score >= 85 ? 'good' : score >= 70 ? 'ok' : score >= 50 ? 'warn' : 'bad';
}

const LEVEL_CLASS = { High: 'high', Medium: 'med', 'Nice to have': 'nice' };

// Circular score gauge. `size` in px; the number is the accessible text.
function ring(value, { size = 132, label, suffix = '' } = {}) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(100, value));
  return `
    <div class="ring ring-${band(v)}" style="--size:${size}px" role="img" aria-label="${esc(label || T('rep.overall'))}: ${v}${suffix ? esc(suffix) : ` ${esc(T('rep.outOf'))}`}">
      <svg viewBox="0 0 120 120" aria-hidden="true">
        <circle class="ring-track" cx="60" cy="60" r="${r}"/>
        <circle class="ring-value" cx="60" cy="60" r="${r}" stroke-dasharray="${(c * v / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 60 60)"/>
      </svg>
      <span class="ring-num tnum" aria-hidden="true">${v}<small>${suffix ? esc(suffix) : ''}</small></span>
    </div>`;
}

// Tooltip: hover (pointer devices), keyboard focus and tap all open it. Wired in wireTooltips().
let tipSeq = 0;
function tooltip(text, label) {
  const id = `tip-${++tipSeq}`;
  return `<span class="tip"><button type="button" class="tip-btn" aria-label="${esc(label)}" aria-describedby="${id}" aria-expanded="false">?</button><span role="tooltip" id="${id}" class="tip-body">${esc(text)}</span></span>`;
}

function wireTooltips(view) {
  const close = (tip) => {
    tip.classList.remove('is-open');
    const btn = tip.querySelector('.tip-btn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };
  // Keep the bubble inside the viewport (narrow phones).
  const place = (tip) => {
    const body = tip.querySelector('.tip-body');
    body.style.setProperty('--shift', '0px');
    const r = body.getBoundingClientRect();
    const pad = 12;
    let shift = 0;
    if (r.right > window.innerWidth - pad) shift = window.innerWidth - pad - r.right;
    if (r.left + shift < pad) shift = pad - r.left;
    body.style.setProperty('--shift', `${Math.round(shift)}px`);
  };
  for (const tip of view.querySelectorAll('.tip')) {
    const btn = tip.querySelector('.tip-btn');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !tip.classList.contains('is-open');
      for (const other of view.querySelectorAll('.tip.is-open')) if (other !== tip) close(other);
      tip.classList.toggle('is-open', open);
      tip.classList.remove('is-dismissed');
      btn.setAttribute('aria-expanded', String(open));
      if (open) place(tip);
    });
    btn.addEventListener('focus', () => { tip.classList.remove('is-dismissed'); place(tip); });
    btn.addEventListener('blur', () => close(tip));
    tip.addEventListener('mouseenter', () => { tip.classList.remove('is-dismissed'); place(tip); });
    tip.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(tip); tip.classList.add('is-dismissed'); }
    });
  }
}

// Close open tooltips on any outside tap. Registered once.
if (typeof document !== 'undefined') {
  document.addEventListener('click', () => {
    for (const tip of document.querySelectorAll('.tip.is-open')) {
      tip.classList.remove('is-open');
      const btn = tip.querySelector('.tip-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
}

function sourceLabel(input) {
  const parts = [input.sourceName ? input.sourceName : T('rep.pasted')];
  if (input.targetRole) parts.push(T('rep.for', { role: input.targetRole }));
  return parts.join(' ');
}

// ---------- Router entry ----------

export function renderPage(route, view, ctx) {
  UI = ctx.state.ui === 'es' ? 'es' : 'en';
  tipSeq = 0;
  printHooks = null;
  if (route === 'upload') renderUpload(view, ctx);
  else if (route === 'history') renderHistory(view, ctx);
  else if (!ctx.state.result) renderNeedsAnalysis(view, route, ctx);
  else if (route === 'report') renderReport(view, ctx);
  else if (route === 'job') renderJob(view, ctx);
  else if (route === 'tips') renderTips(view, ctx);
  wireTooltips(view);
}

// ---------- Upload ----------

export function renderUpload(view, { state, actions }) {
  const d = state.draft;
  // Samples in the interface language first, then the others.
  const byLang = (a, b) => (a.lang === UI ? 0 : 1) - (b.lang === UI ? 0 : 1);
  const sampleOptions = Object.values(SAMPLE_RESUMES).slice().sort(byLang)
    .map((s) => `<option value="${esc(s.id)}">${esc(sampleLabel(s).charAt(0).toUpperCase() + sampleLabel(s).slice(1))}</option>`).join('');
  const jobOptions = Object.values(SAMPLE_JOBS).slice().sort(byLang)
    .map((j) => `<option value="${esc(j.id)}">${esc(sampleLabel(j))}</option>`).join('');

  view.innerHTML = `
    <div class="page page-upload">
      <header class="page-head">
        <h1>${esc(T('up.h1'))}</h1>
        <p class="lede">${esc(T('up.lede'))}</p>
      </header>

      <div class="grid-2">
        <section class="card" aria-labelledby="resume-h">
          <h2 id="resume-h"><span class="step-num" aria-hidden="true">1</span> ${esc(T('up.resumeH'))}</h2>

          <div id="dropzone" class="dropzone" role="button" tabindex="0" aria-describedby="dz-hint" aria-label="${esc(T('up.dzAria'))}">
            ${ICONS.upload}
            <p><strong>${esc(T('up.dzDrop'))}</strong> ${esc(T('up.dzOr'))} <span class="link">${esc(T('up.dzBrowse'))}</span></p>
            <p id="dz-hint" class="hint">${esc(T('up.dzHint'))}</p>
          </div>
          <input id="file-input" type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain" hidden>
          <div id="file-status" class="status" role="status" aria-live="polite"></div>

          <label for="resume-text">${esc(T('up.textLabel'))} <span class="hint">${esc(T('up.textHint'))}</span></label>
          <textarea id="resume-text" class="mono" rows="14" spellcheck="false" placeholder="${esc(T('up.textPh'))}"></textarea>
          <div class="row">
            <span id="word-count" class="hint tnum" aria-live="polite"></span>
            <div class="inline-field">
              <label for="cv-lang">${esc(T('up.cvLang'))}</label>
              <select id="cv-lang">
                <option value="auto">${esc(T('up.cvLangAuto'))}</option>
                <option value="en">${esc(t(UI, 'lang.en').replace(/^./, (c) => c.toUpperCase()))}</option>
                <option value="es">${esc(t(UI, 'lang.es').replace(/^./, (c) => c.toUpperCase()))}</option>
              </select>
            </div>
          </div>
          <div class="row">
            <div class="inline-field">
              <label for="sample-select" class="sr-only">${esc(T('up.sampleLabel'))}</label>
              <select id="sample-select">${sampleOptions}</select>
              <button id="sample-btn" class="btn btn-secondary" type="button">${ICONS.spark} ${esc(T('up.sampleBtn'))}</button>
            </div>
          </div>
        </section>

        <section class="card" aria-labelledby="job-h">
          <h2 id="job-h"><span class="step-num" aria-hidden="true">2</span> ${esc(T('up.jobH'))} <span class="optional">${esc(T('up.optional'))}</span></h2>
          <label for="target-role">${esc(T('up.role'))}</label>
          <input id="target-role" type="text" maxlength="60" autocomplete="off" placeholder="${esc(T('up.rolePh'))}">

          <label for="job-text">${esc(T('up.jd'))} <span class="hint">${esc(T('up.jdHint'))}</span></label>
          <textarea id="job-text" rows="11" placeholder="${esc(T('up.jdPh'))}"></textarea>
          <div class="row">
            <div class="inline-field">
              <label for="job-sample">${esc(T('up.jobSample'))}</label>
              <select id="job-sample">
                <option value="">${esc(T('up.choose'))}</option>
                ${jobOptions}
              </select>
            </div>
          </div>
        </section>
      </div>

      <div id="form-error" class="alert alert-error" role="alert" tabindex="-1" hidden></div>

      <div class="actions">
        <button id="analyze-btn" class="btn btn-primary btn-lg" type="button">${esc(T('up.analyze'))}</button>
        <button id="clear-btn" class="btn btn-ghost" type="button">${esc(T('up.clear'))}</button>
      </div>
    </div>`;

  const $ = (sel) => view.querySelector(sel);
  const dropzone = $('#dropzone');
  const fileInput = $('#file-input');
  const fileStatus = $('#file-status');
  const resumeTa = $('#resume-text');
  const wordCountEl = $('#word-count');
  const roleIn = $('#target-role');
  const jobTa = $('#job-text');
  const jobSample = $('#job-sample');
  const cvLang = $('#cv-lang');
  const formError = $('#form-error');

  resumeTa.value = d.resumeText;
  roleIn.value = d.targetRole;
  jobTa.value = d.jobText;
  jobSample.value = d.jobSampleId || '';
  cvLang.value = ['en', 'es'].includes(d.cvLang) ? d.cvLang : 'auto';

  const updateWordCount = () => { wordCountEl.textContent = T('up.words', { n: countWords(resumeTa.value) }); };
  updateWordCount();
  if (d.source && d.source.name) setStatus('ok', T('up.loadedFrom', { name: d.source.name }));

  function setStatus(kind, message) {
    const icon = kind === 'busy' ? '<span class="spinner" aria-hidden="true"></span>' : kind === 'ok' ? ICONS.check : ICONS.alert;
    fileStatus.className = `status status-${kind}`;
    fileStatus.innerHTML = message ? `${icon}<span>${esc(message)}</span>` : '';
  }
  function showError(message) {
    formError.innerHTML = `${ICONS.alert}<p><strong>${esc(T('up.cantAnalyze'))}</strong> ${esc(message)}</p>`;
    formError.hidden = false;
    formError.focus();
  }
  const clearError = () => { formError.hidden = true; };

  // --- File input / drop zone ---
  async function handleFile(file) {
    if (!file) return;
    clearError();
    setStatus('busy', T('up.reading', { name: file.name }));
    dropzone.setAttribute('aria-busy', 'true');
    try {
      const { text } = await parseFile(file);
      resumeTa.value = text;
      actions.updateDraft({ resumeText: text, source: { name: file.name } });
      updateWordCount();
      setStatus('ok', T('up.extracted', { n: countWords(text), name: file.name }));
    } catch (e) {
      setStatus('error', e instanceof ParseError ? T(`parse.${e.code}`) : T('up.readError'));
    } finally {
      dropzone.removeAttribute('aria-busy');
      fileInput.value = '';
    }
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  fileInput.addEventListener('change', () => handleFile(fileInput.files[0]));
  let dragDepth = 0;
  dropzone.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dropzone.classList.add('is-dragover'); });
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  dropzone.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; dropzone.classList.remove('is-dragover'); } });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropzone.classList.remove('is-dragover');
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 1) setStatus('error', T('up.dropOne'));
    else handleFile(files && files[0]);
  });

  // --- Text fields ---
  resumeTa.addEventListener('input', () => {
    actions.updateDraft({ resumeText: resumeTa.value, source: null });
    updateWordCount();
    clearError();
  });
  roleIn.addEventListener('input', () => actions.updateDraft({ targetRole: roleIn.value }));
  jobTa.addEventListener('input', () => actions.updateDraft({ jobText: jobTa.value, jobSampleId: '' }));
  cvLang.addEventListener('change', () => actions.updateDraft({ cvLang: cvLang.value }));

  $('#sample-btn').addEventListener('click', () => {
    const sample = SAMPLE_RESUMES[$('#sample-select').value] || SAMPLE_RESUMES.strong;
    resumeTa.value = sample.text;
    actions.updateDraft({ resumeText: sample.text, source: null });
    updateWordCount();
    clearError();
    setStatus('ok', T('up.sampleLoaded', { label: sampleLabel(sample) }));
  });

  jobSample.addEventListener('change', () => {
    const job = SAMPLE_JOBS[jobSample.value];
    if (!job) return;
    jobTa.value = job.text;
    // Only fill the role if it's empty or still holds a previous sample's role.
    const sampleRoles = Object.values(SAMPLE_JOBS).map((j) => j.role);
    if (!roleIn.value.trim() || sampleRoles.includes(roleIn.value.trim())) roleIn.value = job.role;
    actions.updateDraft({ jobText: job.text, targetRole: roleIn.value, jobSampleId: job.id });
  });

  // --- Actions ---
  $('#analyze-btn').addEventListener('click', () => {
    clearError();
    const res = actions.analyze();
    if (!res.ok) showError(res.error.message);
  });
  $('#clear-btn').addEventListener('click', () => {
    if ((resumeTa.value || jobTa.value) && !window.confirm(T('up.clearConfirm'))) return;
    resumeTa.value = ''; roleIn.value = ''; jobTa.value = ''; jobSample.value = '';
    actions.updateDraft({ resumeText: '', targetRole: '', jobText: '', jobSampleId: '', source: null });
    updateWordCount();
    setStatus('ok', '');
    clearError();
    resumeTa.focus();
  });
}

// ---------- Placeholder / empty states ----------

function renderNeedsAnalysis(view, route) {
  view.innerHTML = `
    <div class="page">
      <header class="page-head"><h1>${esc(T(`route.${route}`))}</h1></header>
      <section class="card empty-state">
        ${ICONS.doc}
        <h2>${esc(T('na.h2'))}</h2>
        <p>${esc(T('na.p'))}</p>
        <a class="btn btn-primary" href="#/upload">${esc(T('na.go'))}</a>
      </section>
    </div>`;
}

// ---------- Report ----------

// Line filter survives re-renders of the same result, resets for a new one.
let reportFilter = { result: null, severity: 'all', category: null };

function renderReport(view, { state }) {
  const { analysis: a, tips, match, input } = state.result;
  if (reportFilter.result !== state.result) reportFilter = { result: state.result, severity: 'all', category: null };

  const shown = a.lines.filter((l) => !l.blank);
  const count = (s) => shown.filter((l) => l.status === s).length;
  const counts = { all: shown.length, issue: count('issue'), warn: count('warn'), strength: count('strength') };
  const subLabel = (key) => T(`sub.${key}`);

  const subs = a.subscores.map((s) => `
    <li class="sub">
      <div class="sub-head">
        <h3>${esc(s.label)}</h3>${tooltip(T(`rule.${s.key}`), T('rep.howCalc', { label: s.label }))}
        <span class="sub-score tnum">${s.score}<small>/100</small></span>
      </div>
      <div class="bar bar-${band(s.score)}" aria-hidden="true"><span style="width:${s.score}%"></span></div>
      <p class="sub-expl">${esc(s.explanation)}</p>
      <div class="sub-foot">
        <span class="hint tnum">${esc(T('rep.weight', { w: Math.round(s.weight * 100), p: num(s.points) }))}</span>
        ${s.lineIds.length ? `<button type="button" class="btn-link no-print" data-view-cat="${s.key}">${esc(T('rep.viewLines', { n: s.lineIds.length }))}</button>` : ''}
      </div>
    </li>`).join('');

  const sum = a.subscores.map((s) => num(s.points)).join(' + ');
  const topTips = tips.slice(0, 5);

  view.innerHTML = `
    <div class="page page-report">
      <header class="page-head head-row">
        <div>
          <h1>${esc(T('rep.h1'))}</h1>
          <p class="lede">${esc(sourceLabel(input))} · <span class="tnum">${esc(T('rep.words', { n: a.wordCount }))}</span></p>
          <p class="hint cv-lang-note">${esc(T('rep.cvLang', { lang: a.lang, auto: a.langAuto }))}</p>
        </div>
        <div class="head-actions no-print">
          <button id="print-btn" class="btn btn-ghost" type="button">${ICONS.print} ${esc(T('rep.print'))}</button>
        </div>
      </header>

      <div class="grid-report">
        <section class="card score-card" aria-labelledby="score-h">
          <h2 id="score-h" class="sr-only">${esc(T('rep.overall'))}</h2>
          ${ring(a.overall)}
          <p class="verdict">${esc(a.verdict)}</p>
          <ul class="stat-row" aria-label="${esc(T('rep.lineSummary'))}">
            <li class="stat stat-issue">${esc(T('rep.issues', { n: counts.issue }))}</li>
            <li class="stat stat-warn">${esc(T('rep.suggestions', { n: counts.warn }))}</li>
            <li class="stat stat-strength">${esc(T('rep.strengths', { n: counts.strength }))}</li>
          </ul>
          <div class="stack no-print">
            ${tips.length ? `<a class="btn btn-primary" href="#/tips">${ICONS.spark} ${esc(T('rep.seeTips', { n: tips.length }))}</a>` : ''}
            <a class="btn btn-secondary" href="#/job">${ICONS.target} ${esc(match && match.ok && match.percent != null ? T('rep.jobMatchPct', { p: match.percent }) : T('rep.jobMatch'))}</a>
            <a class="btn btn-ghost" href="#/job" id="find-jobs-btn">${ICONS.search} ${esc(T('rep.findJobs'))}</a>
          </div>
          <p class="hint guidance">${esc(T('app.disclaimer'))}</p>
        </section>

        <section class="card" aria-labelledby="breakdown-h">
          <h2 id="breakdown-h">${esc(T('rep.breakdown'))}</h2>
          <ul class="subs">${subs}</ul>
          <p class="hint formula tnum">${esc(T('rep.formula'))} = ${esc(sum)} = <strong>${a.overall}</strong> ${esc(T('rep.formulaWeights'))}</p>
        </section>
      </div>

      <section class="card feedback" id="feedback" aria-labelledby="fb-h">
        <h2 id="fb-h" tabindex="-1">${esc(T('rep.feedback'))}</h2>
        <div class="filters no-print" role="group" aria-label="${esc(T('rep.showLines'))}">
          ${['all', 'issue', 'warn', 'strength'].map((k) =>
            `<button type="button" class="chip chip-${k}" data-sev="${k}" aria-pressed="false">${esc(T(`rep.f.${k}`))} <span class="tnum">${counts[k]}</span></button>`).join('')}
        </div>
        <div id="cat-filter" class="cat-filter no-print"></div>
        <p id="lines-status" class="sr-only" role="status" aria-live="polite"></p>
        <ol id="lines" class="lines"></ol>
      </section>

      ${topTips.length || match ? `
      <section class="card print-only" aria-label="${esc(T('rep.printSummary'))}">
        ${topTips.length ? `<h2>${esc(T('rep.topTips'))}</h2><ol class="print-tips">${topTips.map((x) =>
          `<li><strong>${esc(x.title)}</strong>${x.points > 0 ? ` ${esc(T('rep.points', { n: x.points }))}` : ''} — ${esc(x.description)}</li>`).join('')}</ol>` : ''}
        ${match && match.ok && match.percent != null ? `<h2>${esc(T('rep.jobMatchPct', { p: match.percent }))}</h2>
          <p>${esc(T('rep.matched'))}: ${esc(match.matched.map((k) => k.label).join(', ') || T('rep.none'))}</p>
          <p>${esc(T('rep.missing'))}: ${esc(match.gaps.map((k) => `${k.label} (${T(`level.${k.level}`)})`).join(', ') || T('rep.none'))}</p>` : ''}
      </section>` : ''}
    </div>`;

  const linesEl = view.querySelector('#lines');
  const catEl = view.querySelector('#cat-filter');
  const statusEl = view.querySelector('#lines-status');

  function drawLines() {
    const { severity, category } = reportFilter;
    let list = shown;
    if (category) list = list.filter((l) => l.findings.some((f) => f.category === category));
    if (severity !== 'all') list = list.filter((l) => l.status === severity);

    for (const b of view.querySelectorAll('[data-sev]')) b.setAttribute('aria-pressed', String(b.dataset.sev === severity));
    catEl.innerHTML = category
      ? `<span>${esc(T('rep.behind', { n: list.length }))} <strong>${esc(subLabel(category))}</strong></span>
         <button type="button" class="btn-link" id="clear-cat">${ICONS.cross} ${esc(T('rep.allCats'))}</button>`
      : '';
    const clearBtn = catEl.querySelector('#clear-cat');
    if (clearBtn) clearBtn.addEventListener('click', () => { reportFilter.category = null; drawLines(); linesEl.focus(); });
    // Announce the result of every filter change to screen readers.
    statusEl.textContent = T('rep.status', { n: list.length, sev: severity, cat: category ? subLabel(category) : '' });

    if (!list.length) {
      linesEl.innerHTML = `<li class="line-empty">${esc(T('rep.noLines'))}</li>`;
      return;
    }
    linesEl.innerHTML = list.map((l) => {
      const findings = category ? l.findings.filter((f) => f.category === category) : l.findings;
      return `
        <li class="line line-${l.status}">
          <span class="ln tnum" aria-hidden="true">${l.id + 1}</span>
          <div class="line-main">
            <p class="line-text${l.kind === 'heading' ? ' is-heading' : ''}"><span class="sr-only">${esc(T('rep.lineN', { n: l.id + 1 }))}</span>${esc(l.raw.trim())}</p>
            ${findings.length ? `<ul class="findings">${findings.map((f) =>
              `<li class="f f-${f.severity}"><span class="f-tag">${esc(T(`sev.${f.severity}`))}</span> ${esc(f.message)}</li>`).join('')}</ul>` : ''}
          </div>
        </li>`;
    }).join('');
  }
  linesEl.setAttribute('tabindex', '-1');
  linesEl.setAttribute('aria-label', T('rep.linesLabel'));
  drawLines();

  for (const b of view.querySelectorAll('[data-sev]')) {
    b.addEventListener('click', () => { reportFilter.severity = b.dataset.sev; drawLines(); });
  }
  for (const b of view.querySelectorAll('[data-view-cat]')) {
    b.addEventListener('click', () => {
      reportFilter.category = b.dataset.viewCat;
      reportFilter.severity = 'all';
      drawLines();
      const h = view.querySelector('#fb-h');
      h.scrollIntoView({ behavior: 'smooth', block: 'start' });
      h.focus({ preventScroll: true });
    });
  }
  // Print every line, not just the current filter. beforeprint/afterprint also cover Ctrl+P and
  // browsers where window.print() returns before printing.
  let saved = null;
  printHooks = {
    before() { saved = { ...reportFilter }; reportFilter.severity = 'all'; reportFilter.category = null; drawLines(); },
    after() { if (saved) { Object.assign(reportFilter, saved); saved = null; drawLines(); } },
  };
  view.querySelector('#print-btn').addEventListener('click', () => window.print());
  view.querySelector('#find-jobs-btn').addEventListener('click', () => { jumpToFind = true; });
}

// Set by the Report page while it is shown; cleared on every render.
let printHooks = null;
if (typeof window !== 'undefined') {
  window.addEventListener('beforeprint', () => { if (printHooks) printHooks.before(); });
  window.addEventListener('afterprint', () => { if (printHooks) printHooks.after(); });
}

// ---------- Find jobs (search links; nothing is sent until the user clicks) ----------

// Set by the Report page's "Find jobs" button so the Job match page scrolls to the card.
let jumpToFind = false;
// The card's choices survive re-renders of the same result, reset for a new one.
let findState = { result: null, role: '', skills: [] };
const MAX_SEARCH_SKILLS = 5;

function findJobsHtml(state) {
  const r = state.result;
  // Titles and skills in the CV's language: that's the job market being searched.
  const lang = r.analysis.lang;
  const roles = suggestRoles(r.analysis.text, { lang });
  const skills = extractSkills(r.analysis.text, { lang }).slice(0, 10);
  if (findState.result !== r) {
    const role = r.input.targetRole || roles[0] || '';
    // Default to two skills that don't just repeat the job title ("Data analysis" for "Data Analyst").
    const roleWords = new Set(role.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
    const fresh = skills.filter((s) => !roleWords.has(s.toLowerCase().split(/[^\p{L}\p{N}]+/u)[0]));
    findState = { result: r, role, skills: fresh.slice(0, 2) };
  }
  const skillBoxes = skills.map((s, i) => `
    <label class="skill-opt"><input type="checkbox" data-skill="${esc(s)}" id="sk-${i}"${findState.skills.includes(s) ? ' checked' : ''}> ${esc(s)}</label>`).join('');
  return `
    <section class="card find-jobs" id="find-jobs" aria-labelledby="find-h">
      <h2 id="find-h" tabindex="-1">${ICONS.search} ${esc(T('find.h'))}</h2>
      <p class="hint">${esc(T('find.intro'))}</p>
      <div class="find-grid">
        <div>
          <label for="find-role">${esc(T('find.title'))}</label>
          <input id="find-role" type="text" maxlength="60" autocomplete="off" placeholder="${esc(T('find.titlePh'))}">
          ${roles.length ? `<div class="role-sugs" role="group" aria-label="${esc(T('find.suggested').replace(/:$/, ''))}"><span class="hint">${esc(T('find.suggested'))}</span>
            ${roles.map((x) => `<button type="button" class="chip" data-role="${esc(x)}">${esc(x)}</button>`).join('')}</div>` : ''}
        </div>
        <div>
          <label for="find-loc">${esc(T('find.location'))} <span class="hint">${esc(T('find.optional'))}</span></label>
          <input id="find-loc" type="text" maxlength="60" autocomplete="off" placeholder="${esc(T('find.locationPh'))}">
        </div>
      </div>
      ${skills.length ? `<fieldset class="skill-pick"><legend>${esc(T('find.skills'))} <span class="hint">${esc(T('find.skillsHint', { max: MAX_SEARCH_SKILLS }))}</span></legend>${skillBoxes}</fieldset>` : ''}
      <p class="search-preview" id="search-preview" aria-live="polite"></p>
      <div class="job-links" id="job-links"></div>
      <p class="hint">${esc(T('find.note'))}</p>
    </section>`;
}

function wireFindJobs(view, { actions }) {
  const card = view.querySelector('#find-jobs');
  if (!card) return;
  const roleIn = card.querySelector('#find-role');
  const locIn = card.querySelector('#find-loc');
  const preview = card.querySelector('#search-preview');
  const linksEl = card.querySelector('#job-links');
  const boxes = [...card.querySelectorAll('[data-skill]')];
  roleIn.value = findState.role;
  locIn.value = actions.prefs.get('jobLocation', '');

  function update() {
    findState.role = roleIn.value;
    findState.skills = boxes.filter((b) => b.checked).map((b) => b.dataset.skill);
    const full = findState.skills.length >= MAX_SEARCH_SKILLS;
    for (const b of boxes) b.disabled = full && !b.checked;
    for (const c of card.querySelectorAll('[data-role]')) c.setAttribute('aria-pressed', String(c.dataset.role === roleIn.value.trim()));
    const s = jobSearchLinks({ role: roleIn.value, skills: findState.skills, location: locIn.value });
    preview.innerHTML = s.keywords
      ? `${esc(T('find.search'))} <strong>${esc(s.keywords)}</strong>${s.location ? ` · <strong>${esc(s.location)}</strong>` : ''}`
      : esc(T('find.empty'));
    linksEl.innerHTML = s.links.length
      ? s.links.map((l) => `<a class="btn btn-secondary" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer">${esc(l.site)} ${ICONS.external}<span class="sr-only"> ${esc(T('find.newTab'))}</span></a>`).join('')
      : '';
  }
  update();
  roleIn.addEventListener('input', update);
  locIn.addEventListener('input', () => { actions.prefs.set('jobLocation', locIn.value.slice(0, 60)); update(); });
  for (const b of boxes) b.addEventListener('change', update);
  for (const c of card.querySelectorAll('[data-role]')) c.addEventListener('click', () => { roleIn.value = c.dataset.role; update(); });

  if (jumpToFind) {
    jumpToFind = false;
    // After the router has focused the page heading, move on to the card.
    setTimeout(() => {
      card.scrollIntoView({ block: 'start' });
      card.querySelector('#find-h').focus({ preventScroll: true });
    }, 0);
  }
}

// ---------- Job match ----------

function renderJob(view, ctx) {
  const { state } = ctx;
  const { match, input } = state.result;
  const head = `<header class="page-head"><h1>${esc(T('job.h1'))}</h1>
    <p class="lede">${esc(input.targetRole ? T('job.ledeRole', { role: input.targetRole }) : T('job.lede'))}</p></header>`;
  const find = findJobsHtml(state);

  if (!match || !match.ok) {
    view.innerHTML = `
      <div class="page">${head}
        <section class="card empty-state">
          ${ICONS.target}
          <h2>${esc(T('job.noJdH'))}</h2>
          <p>${esc(match && match.error ? match.error.message : T('job.missing_jd'))} ${esc(T('job.noJdP'))}</p>
          <a class="btn btn-primary" href="#/upload">${esc(T('job.addJd'))}</a>
        </section>
        ${find}
      </div>`;
    wireFindJobs(view, ctx);
    return;
  }
  if (match.percent == null) {
    view.innerHTML = `
      <div class="page">${head}
        <section class="card empty-state">
          ${ICONS.target}
          <h2>${esc(T('job.nothingH'))}</h2>
          <p>${esc(match.message)} ${esc(T('job.tryFull'))}</p>
          <a class="btn btn-secondary" href="#/upload">${esc(T('job.editJd'))}</a>
        </section>
        ${find}
      </div>`;
    wireFindJobs(view, ctx);
    return;
  }

  const chip = (k, cls) => `<li class="kw ${cls}">${cls === 'kw-hit' ? ICONS.check : ''}${esc(k.label)}</li>`;
  const gapGroups = LEVELS.map((lvl) => {
    const ks = match.gaps.filter((k) => k.level === lvl);
    return ks.length ? `<div class="gap-group gap-${LEVEL_CLASS[lvl]}">
      <h3>${esc(T(`level.${lvl}`))} <span class="hint tnum">${ks.length}</span></h3>
      <ul class="kw-list">${ks.map((k) => chip(k, 'kw-miss')).join('')}</ul></div>` : '';
  }).join('');

  const rows = match.keywords.map((k) => `
    <tr>
      <th scope="row">${esc(k.label)}${k.source === 'jd-word' ? ` <span class="hint">${esc(T('job.repeated'))}</span>` : ''}</th>
      <td><span class="lvl lvl-${LEVEL_CLASS[k.level]}">${esc(T(`level.${k.level}`))}</span></td>
      <td class="tnum num">${k.count}</td>
      <td class="tnum num">${esc(num(k.importance, 2))}</td>
      <td>${k.matched ? `<span class="yes">${ICONS.check}<span>${esc(T('job.yes'))}</span></span>` : `<span class="no">${ICONS.cross}<span>${esc(T('job.no'))}</span></span>`}</td>
    </tr>`).join('');

  view.innerHTML = `
    <div class="page page-job">${head}
      <div class="grid-report">
        <section class="card score-card" aria-labelledby="match-h">
          <h2 id="match-h" class="sr-only">${esc(T('job.score'))}</h2>
          ${ring(match.percent, { label: T('job.ring'), suffix: '%' })}
          <p class="verdict">${esc(T('job.found', { a: match.matched.length, b: match.keywords.length }))}
            ${tooltip(T('job.matchHelp'), T('rep.howCalc', { label: T('job.ring') }))}</p>
          <p class="hint">${esc(T('job.honest'))}</p>
          <p class="hint guidance">${esc(T('app.disclaimer'))}</p>
        </section>

        <section class="card" aria-labelledby="gap-h">
          <div class="title-row"><h2 id="gap-h">${esc(T('job.gapH'))}</h2>${tooltip(T('job.levelHelp'), T('job.importanceHow'))}</div>
          ${match.gaps.length ? `<p class="hint">${esc(T('job.gapIntro'))}</p>${gapGroups}`
            : `<p class="all-good">${ICONS.check} ${esc(T('job.allGood'))}</p>`}
          ${match.matched.length ? `<h3 class="matched-h">${esc(T('job.already'))} <span class="hint tnum">${match.matched.length}</span></h3>
            <ul class="kw-list">${match.matched.map((k) => chip(k, 'kw-hit')).join('')}</ul>` : ''}
        </section>
      </div>

      ${find}

      <section class="card" aria-labelledby="kw-h">
        <h2 id="kw-h">${esc(T('job.allKw'))}</h2>
        <div class="table-wrap" tabindex="0" role="region" aria-labelledby="kw-h">
          <table class="data">
            <thead><tr><th scope="col">${esc(T('job.th.kw'))}</th><th scope="col">${esc(T('job.th.level'))}</th><th scope="col" class="num">${esc(T('job.th.count'))}</th>
              <th scope="col" class="num">${esc(T('job.th.importance'))}</th><th scope="col">${esc(T('job.th.resume'))}</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </section>
    </div>`;
  wireFindJobs(view, ctx);
}

// ---------- Improvement tips ----------

const markPlaceholders = (s) => esc(s).replace(/\[[^\]\n]+\]/g, '<mark class="ph">$&</mark>');

function renderTips(view, { state, actions }) {
  const { analysis: a, tips, input } = state.result;
  const opts = { targetRole: input.targetRole };

  if (!tips.length) {
    view.innerHTML = `
      <div class="page">
        <header class="page-head"><h1>${esc(T('tips.h1'))}</h1></header>
        <section class="card empty-state">
          ${ICONS.check}
          <h2>${esc(T('tips.noneH'))}</h2>
          <p>${esc(T('tips.noneP'))}</p>
          <a class="btn btn-secondary" href="#/job">${esc(T('tips.openJob'))}</a>
        </section>
      </div>`;
    return;
  }

  const cards = tips.map((x, i) => `
    <li class="card tip-card" data-tip="${esc(x.id)}">
      <div class="tip-head">
        <input type="checkbox" id="done-${esc(x.id)}" data-done="${esc(x.id)}" ${state.done.has(x.id) ? 'checked' : ''}>
        <label for="done-${esc(x.id)}"><span class="tip-rank tnum" aria-hidden="true">${i + 1}</span><span class="tip-title">${esc(x.title)}</span><span class="sr-only"> ${esc(T('tips.markDone'))}</span></label>
        <span class="gain tnum ${x.points > 0 ? '' : 'gain-zero'}">${esc(x.points > 0 ? T('tips.pts', { n: x.points }) : T('tips.ptsZero'))}
          ${tooltip(T('tips.gainHelp', { a: a.overall, b: x.projected }), T('tips.about'))}</span>
      </div>
      <p class="tip-desc">${esc(x.description)}</p>
      <details>
        <summary>${esc(T('tips.show', { n: x.items.length }))}</summary>
        <ul class="rewrites">${x.items.map((it) => `
          <li>
            ${it.lineId != null ? `<span class="hint tnum">${esc(T('tips.line', { n: it.lineId + 1 }))}</span>` : ''}
            <div class="diff"><del><span class="sr-only">${esc(T('tips.before'))}</span>${esc(it.original)}</del>
            ${it.remove ? `<ins class="ins-remove"><span class="sr-only">${esc(T('tips.after'))}</span>${esc(T('tips.remove'))}</ins>`
              : `<ins><span class="sr-only">${esc(T('tips.after'))}</span>${it.rewrite.split('\n').map(markPlaceholders).join('<br>')}</ins>`}</div>
          </li>`).join('')}
        </ul>
      </details>
    </li>`).join('');

  view.innerHTML = `
    <div class="page page-tips">
      <header class="page-head">
        <h1>${esc(T('tips.h1'))}</h1>
        <p class="lede">${esc(T('tips.lede1'))} <mark class="ph">${esc(T('tips.ph'))}</mark> ${esc(T('tips.lede2'))}</p>
      </header>

      <section class="card projection" aria-labelledby="proj-h">
        <h2 id="proj-h" class="sr-only">${esc(T('tips.preview'))}</h2>
        <div class="proj-scores" id="proj" aria-live="polite"></div>
        <div class="stack-row no-print">
          <button id="copy-btn" class="btn btn-secondary" type="button">${esc(T('tips.copy'))}</button>
          <button id="edit-btn" class="btn btn-ghost" type="button">${esc(T('tips.edit'))}</button>
        </div>
        <p id="copy-status" class="status" role="status" aria-live="polite"></p>
      </section>

      <ol class="tip-list">${cards}</ol>

      <details class="card improved">
        <summary>${esc(T('tips.previewText'))}</summary>
        <label for="improved-text" class="sr-only">${esc(T('tips.improvedLabel'))}</label>
        <textarea id="improved-text" class="mono" rows="18" readonly></textarea>
      </details>
    </div>`;

  const projEl = view.querySelector('#proj');
  const improved = view.querySelector('#improved-text');
  const copyStatus = view.querySelector('#copy-status');
  let current = '';

  function update() {
    // With nothing ticked, preview all tips so the buttons are useful straight away.
    const ids = state.done.size ? [...state.done] : tips.map((x) => x.id);
    const p = projectScore(a, tips, ids, opts);
    current = p.text;
    improved.value = current;
    const doneCount = state.done.size;
    projEl.innerHTML = `
      <div class="proj-item"><span class="hint">${esc(T('tips.current'))}</span><span class="proj-num tnum">${a.overall}</span></div>
      <span class="proj-arrow" aria-hidden="true">→</span>
      <div class="proj-item"><span class="hint">${esc(doneCount ? T('tips.withDone', { n: doneCount }) : T('tips.withAll', { n: tips.length }))}</span>
        <span class="proj-num tnum proj-${band(p.overall)}">${p.overall}</span></div>
      <p class="hint proj-note">${esc(doneCount ? T('tips.progress', { a: doneCount, b: tips.length }) : T('tips.tickHint'))} ${esc(T('tips.assume'))}</p>`;
    view.querySelector('#copy-btn').textContent = doneCount ? T('tips.copy') : T('tips.copyAll');
  }
  update();

  for (const cb of view.querySelectorAll('[data-done]')) {
    cb.addEventListener('change', () => {
      actions.toggleTip(cb.dataset.done, cb.checked);
      cb.closest('.tip-card').classList.toggle('is-done', cb.checked);
      update();
    });
    cb.closest('.tip-card').classList.toggle('is-done', cb.checked);
  }

  const setCopyStatus = (ok, msg) => {
    copyStatus.className = `status status-${ok ? 'ok' : 'error'}`;
    copyStatus.innerHTML = `${ok ? ICONS.check : ICONS.alert}<span>${esc(msg)}</span>`;
  };
  view.querySelector('#copy-btn').addEventListener('click', async () => {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(current);
      setCopyStatus(true, T('tips.copied'));
    } catch {
      // Fallback: open the preview and select the text so the user can copy it manually.
      view.querySelector('details.improved').open = true;
      improved.focus();
      improved.select();
      setCopyStatus(false, T('tips.copyFail'));
    }
  });
  view.querySelector('#edit-btn').addEventListener('click', () => actions.editText(current));
}

// ---------- History ----------

function formatSaved(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(UI === 'es' ? 'es' : 'en', { dateStyle: 'medium', timeStyle: 'short' });
  } catch { return ''; }
}

function renderHistory(view, { state, actions }) {
  const entries = actions.history.list();
  const cur = state.result && state.result.input;
  const isCurrent = (e) => cur && e.resumeText === cur.resumeText && e.jobText === cur.jobText && (e.targetRole || '') === cur.targetRole;
  const head = `<header class="page-head head-row"><div><h1>${esc(T('hist.h1'))}</h1>
    <p class="lede">${esc(T('hist.lede'))}</p></div>
    ${entries.length ? `<div class="head-actions"><button id="clear-hist" class="btn btn-ghost" type="button">${esc(T('hist.clear'))}</button></div>` : ''}</header>`;

  if (!entries.length) {
    view.innerHTML = `
      <div class="page">${head}
        <section class="card empty-state">
          ${ICONS.clock}
          <h2>${esc(T('hist.emptyH'))}</h2>
          <p>${esc(T('hist.emptyP'))}</p>
          <a class="btn btn-primary" href="#/upload">${esc(T('hist.analyze'))}</a>
        </section>
      </div>`;
    return;
  }

  // Re-score every entry from its saved text (deterministic), so the list and the comparison always
  // agree with the current rules instead of trusting stored numbers.
  const live = new Map(entries.map((e) => {
    const a = analyzeResume(e.resumeText, { lang: e.cvLang, ui: UI });
    const m = a.ok && e.jobText.trim() ? matchJob(a.text, e.jobText, { ui: UI }) : null;
    return [e.id, { a, overall: a.ok ? a.overall : e.overall, match: m && m.ok && m.percent != null ? m.percent : null }];
  }));
  const name = (e) => sourceLabel({ sourceName: e.sourceName, targetRole: e.targetRole });
  const items = entries.map((e) => {
    const L = live.get(e.id);
    return `
    <li class="hist-item${isCurrent(e) ? ' is-current' : ''}">
      <span class="hist-score score-${band(L.overall)} tnum" aria-label="${esc(T('hist.score', { n: L.overall }))}">${L.overall}</span>
      <div class="hist-main">
        <p class="hist-title">${esc(name(e))}${isCurrent(e) ? ` <span class="badge">${esc(T('hist.current'))}</span>` : ''}</p>
        <p class="hint">${esc(formatSaved(e.savedAt))}${L.match != null ? ` · ${esc(T('hist.match', { p: L.match }))}` : ''} · ${esc(T('rep.words', { n: countWords(e.resumeText) }))}</p>
      </div>
      <div class="hist-actions">
        <button type="button" class="btn btn-secondary" data-open="${esc(e.id)}">${esc(T('hist.open'))}<span class="sr-only"> ${esc(name(e))}</span></button>
        <button type="button" class="btn btn-ghost icon-only" data-del="${esc(e.id)}" aria-label="${esc(T('hist.delete', { name: name(e) }))}" title="${esc(T('hist.deleteTitle'))}">${ICONS.cross}</button>
      </div>
    </li>`;
  }).join('');

  const opt = (e, sel) => `<option value="${esc(e.id)}"${sel ? ' selected' : ''}>${live.get(e.id).overall} · ${esc(name(e))} · ${esc(formatSaved(e.savedAt))}</option>`;

  view.innerHTML = `
    <div class="page page-history">${head}
      <section class="card" aria-labelledby="hist-h">
        <h2 id="hist-h">${esc(T('hist.saved'))} <span class="hint tnum">${entries.length}</span></h2>
        <ul class="hist-list">${items}</ul>
      </section>
      ${entries.length >= 2 ? `
      <section class="card" aria-labelledby="cmp-h">
        <h2 id="cmp-h">${esc(T('hist.compare'))}</h2>
        <div class="cmp-pick">
          <div><label for="cmp-a">${esc(T('hist.before'))}</label><select id="cmp-a">${entries.map((e, i) => opt(e, i === 1)).join('')}</select></div>
          <div><label for="cmp-b">${esc(T('hist.after'))}</label><select id="cmp-b">${entries.map((e, i) => opt(e, i === 0)).join('')}</select></div>
        </div>
        <div id="cmp-out" aria-live="polite"></div>
      </section>` : ''}
    </div>`;

  for (const b of view.querySelectorAll('[data-open]')) {
    b.addEventListener('click', () => {
      if (!actions.openHistory(b.dataset.open)) window.alert(T('hist.openFail'));
    });
  }
  for (const b of view.querySelectorAll('[data-del]')) {
    b.addEventListener('click', () => {
      if (!window.confirm(T('hist.confirmDelete'))) return;
      actions.history.remove(b.dataset.del);
      actions.navigate('history');
    });
  }
  const clearBtn = view.querySelector('#clear-hist');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (!window.confirm(T('hist.confirmClear'))) return;
    actions.history.clear();
    actions.navigate('history');
  });

  const selA = view.querySelector('#cmp-a');
  const selB = view.querySelector('#cmp-b');
  if (!selA) return;
  const out = view.querySelector('#cmp-out');
  function drawCompare() {
    const ea = entries.find((e) => e.id === selA.value);
    const eb = entries.find((e) => e.id === selB.value);
    if (!ea || !eb) { out.innerHTML = ''; return; }
    if (ea.id === eb.id) { out.innerHTML = `<p class="hint">${esc(T('hist.pickTwo'))}</p>`; return; }
    const A = live.get(ea.id).a;
    const B = live.get(eb.id).a;
    if (!A.ok || !B.ok) { out.innerHTML = `<p class="hint">${esc(T('hist.notEnough'))}</p>`; return; }
    const delta = (x, y) => {
      const d = y - x;
      const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'same';
      return `<td class="num tnum delta delta-${cls}">${d > 0 ? '+' : d < 0 ? '−' : '±'}${num(Math.abs(d))}</td>`;
    };
    const row = (label, x, y, extra = '') => `<tr${extra}><th scope="row">${label}</th><td class="num tnum">${num(x)}</td><td class="num tnum">${num(y)}</td>${delta(x, y)}</tr>`;
    const subRows = SUBSCORE_ORDER.map((k) => row(`${esc(T(`sub.${k}`))} <span class="hint">${Math.round(WEIGHTS[k] * 100)}%</span>`,
      A.subscores.find((s) => s.key === k).score, B.subscores.find((s) => s.key === k).score)).join('');
    const sameJob = ea.jobText.trim() && ea.jobText === eb.jobText;
    const ma = live.get(ea.id).match;
    const mb = live.get(eb.id).match;
    const matchRow = ma != null && mb != null
      ? row(`${esc(T('hist.matchPct'))}${sameJob ? '' : ` <span class="hint">${esc(T('hist.diffJd'))}</span>`}`, ma, mb) : '';
    const words = row(esc(T('hist.words')), A.wordCount, B.wordCount);
    out.innerHTML = `
      <div class="table-wrap" tabindex="0" role="region" aria-label="${esc(T('hist.comparison'))}">
        <table class="data cmp">
          <thead><tr><th scope="col">${esc(T('hist.th.measure'))}</th><th scope="col" class="num">${esc(T('hist.before'))}</th><th scope="col" class="num">${esc(T('hist.after'))}</th><th scope="col" class="num">${esc(T('hist.th.change'))}</th></tr></thead>
          <tbody>${row(`<strong>${esc(T('hist.overall'))}</strong>`, A.overall, B.overall, ' class="row-total"')}${subRows}${matchRow}${words}</tbody>
        </table>
      </div>`;
  }
  selA.addEventListener('change', drawCompare);
  selB.addEventListener('change', drawCompare);
  drawCompare();
}
