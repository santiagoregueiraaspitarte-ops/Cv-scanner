// Improvement tips with rule-based rewrites, in English or Spanish.
// Pure module: no DOM. Each tip type is a line transform; applying tips composes those transforms
// in a fixed order and re-runs the analyzer, so score previews reflect the actual rewritten text.
// Rewrites use the CV's language (analysis.lang); titles and descriptions use the interface language (analysis.ui).

import {
  analyzeResume, findWeakPhrases, WEAK_PHRASES, countPronouns, IMAGE_RE, hasMetric,
  LONG_BULLET_WORDS, REQUIRED_SECTIONS, HEADING_NAMES,
} from './analyzer.js';
import { t } from './i18n.js';

// Order in which transforms compose when several tips touch the same line (also the tie-break order).
const TYPE_ORDER = ['headings', 'sections', 'contact', 'pronouns', 'verbs', 'long', 'metrics', 'dates', 'ats'];

const CODE_TO_TYPE = {
  'no-metric': 'metrics', 'weak-verb': 'verbs', pronoun: 'pronouns', long: 'long', 'missing-dates': 'dates',
  'ats-tabs': 'ats', 'ats-pipes': 'ats', 'ats-spacing': 'ats', 'ats-image': 'ats', 'unusual-heading': 'headings',
};

// ---------- English verb tense helpers (for "Helped with fixing bugs" -> "Fixed bugs") ----------

const IRREGULAR_PAST = {
  build: 'built', lead: 'led', run: 'ran', write: 'wrote', make: 'made', teach: 'taught', sell: 'sold', drive: 'drove',
  bring: 'brought', buy: 'bought', hold: 'held', keep: 'kept', find: 'found', set: 'set', get: 'got', give: 'gave',
  take: 'took', do: 'did', see: 'saw', think: 'thought', speak: 'spoke', meet: 'met', win: 'won', grow: 'grew',
  choose: 'chose', send: 'sent', spend: 'spent', understand: 'understood', oversee: 'oversaw', begin: 'began',
  put: 'put', cut: 'cut', rebuild: 'rebuilt', rewrite: 'rewrote', plan: 'planned', ship: 'shipped', stop: 'stopped',
  drop: 'dropped', map: 'mapped', debug: 'debugged', log: 'logged', scan: 'scanned', submit: 'submitted',
  commit: 'committed', control: 'controlled', deal: 'dealt', pay: 'paid', say: 'said', tell: 'told',
};
const DOUBLING = new Set(['run', 'set', 'get', 'put', 'cut', 'begin', 'win', 'plan', 'ship', 'stop', 'drop', 'map',
  'debug', 'log', 'scan', 'submit', 'commit', 'control']);
const KNOWN_BASE_VERBS = new Set(['fix', 'build', 'create', 'design', 'develop', 'launch', 'improve', 'reduce',
  'increase', 'manage', 'plan', 'run', 'write', 'test', 'deploy', 'implement', 'organize', 'prepare', 'analyze',
  'analyse', 'support', 'maintain', 'migrate', 'update', 'grow', 'drive', 'deliver', 'set', 'establish', 'train',
  'onboard', 'coordinate', 'research', 'review', 'define', 'ship', 'automate', 'streamline', 'resolve', 'lead',
  'make', 'close', 'sell', 'debug', 'document', 'refactor', 'monitor', 'optimize', 'produce', 'publish']);
const NOT_GERUNDS = new Set(['thing', 'things', 'string', 'strings', 'during', 'morning', 'evening', 'ceiling', 'king',
  'ring', 'spring', 'bring', 'sing', 'wing', 'swing', 'sibling', 'nothing', 'something', 'everything', 'anything',
  'marketing', 'accounting', 'engineering', 'pricing']);

function gerundOf(base) {
  if (/ie$/.test(base)) return base.slice(0, -2) + 'ying';
  if (/[^e]e$/.test(base)) return base.slice(0, -1) + 'ing';
  if (DOUBLING.has(base)) return base + base.slice(-1) + 'ing';
  return base + 'ing';
}
const GERUND_TO_BASE = new Map();
for (const b of [...Object.keys(IRREGULAR_PAST), ...KNOWN_BASE_VERBS]) GERUND_TO_BASE.set(gerundOf(b), b);

function pastFromBase(b) {
  if (IRREGULAR_PAST[b]) return IRREGULAR_PAST[b];
  if (/e$/.test(b)) return b + 'd';
  if (/[^aeiou]y$/.test(b)) return b.slice(0, -1) + 'ied';
  return b + 'ed';
}

function pastFromGerund(g) {
  const base = GERUND_TO_BASE.get(g);
  if (base) return pastFromBase(base);
  const stem = g.slice(0, -3);
  if (/ee$/.test(stem)) return stem + 'd';
  if (/[^aeiou]y$/.test(stem)) return stem.slice(0, -1) + 'ied';
  return stem + 'ed'; // covers e-drop verbs too: "managing" -> "manag" + "ed"
}

const isGerund = (w) => /^[a-z]{3,}ing$/.test(w) && !NOT_GERUNDS.has(w);

// ---------- Spanish verb helpers (for "Responsable de gestionar cuentas" -> "Gestioné cuentas") ----------

const ES_IRREGULAR_PRETERITE = {
  hacer: 'hice', tener: 'tuve', obtener: 'obtuve', mantener: 'mantuve', sostener: 'sostuve', contener: 'contuve',
  conducir: 'conduje', reducir: 'reduje', producir: 'produje', introducir: 'introduje', traducir: 'traduje',
  poner: 'puse', proponer: 'propuse', componer: 'compuse', disponer: 'dispuse', ir: 'fui', ser: 'fui', dar: 'di',
  decir: 'dije', traer: 'traje', saber: 'supe', poder: 'pude', querer: 'quise', venir: 'vine', estar: 'estuve',
  construir: 'construí', destruir: 'destruí', distribuir: 'distribuí', contribuir: 'contribuí', incluir: 'incluí',
  leer: 'leí', elegir: 'elegí', dirigir: 'dirigí', corregir: 'corregí',
};
// Words ending in -ar/-er/-ir that aren't verbs.
const ES_NOT_INFINITIVE = new Set(['lugar', 'hogar', 'familiar', 'particular', 'popular', 'similar', 'regular', 'militar',
  'mujer', 'placer', 'nivel', 'mar', 'par', 'bar', 'auxiliar', 'escolar', 'titular', 'solar', 'polar', 'singular',
  'ayer', 'taller', 'alquiler', 'carácter', 'caracter']);

const isEsInfinitive = (w) => /^[a-záéíóúñ]{3,}(?:ar|er|ir)$/.test(w) && !ES_NOT_INFINITIVE.has(w);

// First-person preterite: -car → -qué, -gar → -gué, -zar → -cé, -ar → -é, -er/-ir → -í.
function esPreterite(inf) {
  if (ES_IRREGULAR_PRETERITE[inf]) return ES_IRREGULAR_PRETERITE[inf];
  if (/car$/.test(inf)) return inf.slice(0, -3) + 'qué';
  if (/gar$/.test(inf)) return inf.slice(0, -3) + 'gué';
  if (/zar$/.test(inf)) return inf.slice(0, -3) + 'cé';
  if (/ar$/.test(inf)) return inf.slice(0, -2) + 'é';
  return inf.slice(0, -2) + 'í';
}

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const join = (a, b) => (b ? `${a} ${b}` : a);
const endWithPeriod = (s) => (/[.!?]$/.test(s) ? s : s.replace(/[,;:\s]+$/, '') + '.');
const isAllCaps = (s) => /\p{Lu}/u.test(s) && s === s.toUpperCase();

// ---------- Line transforms ----------

function summaryTemplate(ctx) {
  if (ctx.lang === 'es') {
    const role = ctx.targetRole || '[Tu puesto]';
    return `${role} con [N] años de experiencia en [área], con foco en [fortaleza clave]. Logro reciente: [resultado con un número, p. ej. aumenté las ventas un X%].`;
  }
  const role = ctx.targetRole || '[Your role]';
  return `${role} with [N] years of experience in [field], known for [key strength]. Recent highlight: [result with a number, e.g. grew sign-ups by X%].`;
}

// Pronouns: drop leading "I/We (was/am...)" / "Yo", turn "my/our" into "the" and "mi/mis/nuestro" into
// an article. Prose summaries written in first person are replaced by a fill-in template.
function removePronouns(content, line, ctx) {
  const s = content.trim();
  const isSummaryProse = !line.isBullet && ['summary', 'other'].includes(line.section);
  const opener = s.replace(/^(?:yo|nosotros|nosotras)\s+/i, '');
  if (isSummaryProse && (/^(?:i am|i'm|soy|me considero)(?!\p{L})/iu.test(opener) || countPronouns(s) >= 2)) {
    return summaryTemplate(ctx);
  }
  // "Me encargué de ordenar…": dropping "me" leaves broken Spanish; rewrite the verb instead ("Ordené…").
  let c = /(?<!\p{L})me encargu[ée] de(?!\p{L})/iu.test(s) ? fixWeakVerbs(s) : s;
  c = c
    .replace(/^(?:i|we)\s+(?:am|was|were|have|had|also)\s+/i, '')
    .replace(/^(?:i'm|i've|i'd|we're|we've)\s+/i, '')
    .replace(/^(?:my|our)\s+(?:role|job|responsibilit(?:y|ies)|duties|tasks?)\s+(?:was|were|is|are|included|involved)\s+(?:to\s+)?/i, '')
    .replace(/^(?:i|we)\s+/i, '')
    .replace(/\b(?:my|our)\b/gi, 'the')
    .replace(/\s+myself\b/gi, '')
    // Spanish
    .replace(/^(?:yo|nosotros|nosotras)\s+/i, '')
    .replace(/(?<!\p{L})mis\s+(\p{L}+)/giu, (m, w) => `${/as$/i.test(w) ? 'las' : 'los'} ${w}`)
    .replace(/(?<!\p{L})mi\s+(\p{L}+)/giu, (m, w) => `${/(?:a|ción|sión|dad|tad|tud|umbre)$/i.test(w) ? 'la' : 'el'} ${w}`)
    .replace(/(?<!\p{L})nuestr(os|as|o|a)(?!\p{L})/giu, (m, e) => ({ o: 'el', a: 'la', os: 'los', as: 'las' })[e.toLowerCase()])
    .replace(/(?<!\p{L})(?:me|conmigo)(?!\p{L})\s*/giu, '');
  return capitalize(c.trim());
}

// Weak verbs: replace each weak phrase; a following gerund/base verb (English) or infinitive (Spanish)
// becomes past tense.
function fixWeakVerbs(content) {
  let c = content.trim();
  for (let pass = 0; pass < 6; pass++) {
    const w = WEAK_PHRASES.find((x) => x.re.test(c));
    if (!w) break;
    const m = c.match(w.re);
    const before = c.slice(0, m.index);
    const after = c.slice(m.index + m[0].length).replace(/^\s+/, '');
    const atStart = /^\W*$/u.test(before) || /^[\s\p{P}]*$/u.test(before);
    const [firstRaw = '', ...restWords] = after.split(/\s+/);
    // Keep punctuation glued to the next word ("testing." -> word "testing", tail ".").
    const [, first = '', tail = ''] = firstRaw.match(/^(\p{L}*)(.*)$/u) || [];
    const lw = first.toLowerCase();
    const rest = (tail + (restWords.length ? ' ' + restWords.join(' ') : '')).replace(/^\s+/, '');
    const glue = (a, b) => (!b ? a : /^[.,;:!?)]/.test(b) ? a + b : `${a} ${b}`);
    let repl;
    if (w.lang === 'es') {
      if (isEsInfinitive(lw)) repl = glue(esPreterite(lw), rest);
      // "Contribuí a" + "al/el …" contracts to "Contribuí al …".
      else repl = join(atStart ? w.verb : w.mid, after).replace(/(?<!\p{L})a (?:el|al)(?!\p{L})/iu, 'al');
    } else if (isGerund(lw)) repl = glue(pastFromGerund(lw), rest);
    else if ((w.phrase === 'helped' || w.phrase === 'assisted') && KNOWN_BASE_VERBS.has(lw)) repl = glue(pastFromBase(lw), rest);
    else if (w.phrase === 'helped' && /with$/i.test(m[0])) repl = join('Contributed to', after);
    else repl = join(atStart ? w.verb : w.mid, after);
    c = atStart ? before + capitalize(repl) : before + lowerFirst(repl);
  }
  return c;
}

// Long bullets: trim filler words; then split into two bullets at "and"/"y"/comma near the middle,
// or else cut a trailing detail clause ("when…", "que…"), or as a last resort split at word 20.
const FILLERS = [
  [/\band also\b/gi, 'and'], [/\bin order to\b/gi, 'to'], [/\ba number of\b/gi, 'several'],
  [/\b(?:stuff|things) and other (?:stuff|things)\b/gi, 'other tasks'], [/\bstuff\b/gi, 'tasks'],
  [/\b(?:very|really|various|different|basically|just|actually|successfully)\s+/gi, ''],
  [/(?<!\p{L})adem[aá]s tambi[eé]n(?!\p{L})/giu, 'también'],
  [/(?<!\p{L})(?:con el (?:fin|objetivo) de|a fin de)(?!\p{L})/giu, 'para'],
  [/(?<!\p{L})cosas(?!\p{L})/giu, 'tareas'],
  [/(?<!\p{L})(?:muy|realmente|b[aá]sicamente|simplemente|exitosamente|diferentes|diversas|diversos)\s+/giu, ''],
];
const SPLIT_WORDS = new Set(['and', 'y', 'e']);
const CLAUSE_WORDS = new Set(['while', 'which', 'when', 'that', 'where', 'que', 'cuando', 'donde', 'mientras']);
function shorten(content) {
  let c = content.trim();
  for (const [re, r] of FILLERS) c = c.replace(re, r);
  c = c.replace(/\s{2,}/g, ' ');
  const words = c.split(' ');
  if (words.length <= 20) return c;
  const n = words.length;
  let best = null;
  for (let i = 4; i <= n - 4; i++) {
    const isAnd = SPLIT_WORDS.has(words[i].toLowerCase());
    if (!isAnd && !/[,;]$/.test(words[i - 1])) continue;
    const secondLen = n - i - (isAnd ? 1 : 0);
    if (i > LONG_BULLET_WORDS || secondLen > LONG_BULLET_WORDS) continue;
    const score = Math.abs(i - n / 2);
    if (!best || score < best.score) best = { i, score, drop: isAnd };
  }
  if (best) {
    const first = words.slice(0, best.i).join(' ');
    const second = words.slice(best.drop ? best.i + 1 : best.i).join(' ');
    return `${endWithPeriod(first)}\n${capitalize(second)}`;
  }
  const cut = words.findIndex((w, i) => i >= 6 && CLAUSE_WORDS.has(w.toLowerCase()));
  if (cut !== -1) return endWithPeriod(words.slice(0, cut).join(' '));
  return `${endWithPeriod(words.slice(0, 20).join(' '))}\n${capitalize(words.slice(20).join(' '))}`;
}

// Metrics: append a fill-in result to every segment that has no number yet.
function addMetric(content, line, ctx) {
  const tail = ctx.lang === 'es' ? ', mejorando [métrica] en un [X]%.' : ', improving [metric] by [X]%.';
  return content.split('\n')
    .map((seg) => (hasMetric(seg) ? seg : `${seg.trim().replace(/[.;,:\s]+$/, '')}${tail}`))
    .join('\n');
}

// Dates: append a fill-in date range to the role line.
function addDates(content, line, ctx) {
  const range = ctx.lang === 'es' ? '[Mes AAAA] – [Mes AAAA]' : '[Mon YYYY] – [Mon YYYY]';
  return `${content.trim().replace(/[\s,;|–—-]+$/, '')} — ${range}`;
}

// ATS: remove image markers, turn tabs/pipes/wide spacing into a comma list. Returns null to delete the line.
const IMAGE_RE_G = new RegExp(IMAGE_RE.source, 'gi');
function fixAts(content) {
  return content.split('\n').map((seg) => {
    let c = seg.replace(IMAGE_RE_G, '');
    if (!c.trim()) return null;
    c = c.replace(/\s*\t+\s*/g, ', ').replace(/\s*\|\s*/g, ', ').replace(/(\S) {3,}(?=\S)/g, '$1, ');
    return c.replace(/(?:,\s*){2,}/g, ', ').replace(/^[,\s]+|[,\s]+$/g, '');
  }).filter((s) => s !== null).join('\n') || null;
}

// Headings: rename to the suggested standard heading, keeping the original casing style.
function renameHeading(content, line, ctx) {
  const name = line.suggestedHeading || HEADING_NAMES[ctx.lang].additional;
  return isAllCaps(content) ? name.toUpperCase() : name;
}

const LINE_TRANSFORMS = {
  headings: renameHeading,
  pronouns: removePronouns,
  verbs: fixWeakVerbs,
  long: shorten,
  metrics: addMetric,
  dates: addDates,
  ats: fixAts,
};

function transformLine(line, types, ctx) {
  let c = line.content;
  for (const type of TYPE_ORDER) {
    if (!types.has(type) || !LINE_TRANSFORMS[type]) continue;
    c = LINE_TRANSFORMS[type](c, line, ctx);
    if (c === null) return null;
  }
  return c;
}

// ---------- Insert templates (missing sections / contact details) ----------

function sectionTemplate(key, ctx) {
  const names = HEADING_NAMES[ctx.lang];
  const h = (name) => (ctx.upperHeadings ? name.toUpperCase() : name);
  if (ctx.lang === 'es') {
    switch (key) {
      case 'summary': return [h(names.summary), summaryTemplate(ctx)];
      case 'experience': return [h(names.experience), '[Puesto], [Organización] — [Mes AAAA] – [Mes AAAA]',
        '- Lideré [proyecto o responsabilidad], mejorando [métrica] en un [X]%.'];
      case 'education': return [h(names.education), '[Título o certificación], [Institución] — [AAAA]'];
      case 'skills': return [h(names.skills), '[Habilidad], [Habilidad], [Herramienta], [Herramienta], [Metodología]'];
      default: return [];
    }
  }
  switch (key) {
    case 'summary': return [h(names.summary), summaryTemplate(ctx)];
    case 'experience': return [h(names.experience), '[Job title], [Organization] — [Mon YYYY] – [Mon YYYY]',
      '- Delivered [project or responsibility], improving [metric] by [X]%.'];
    case 'education': return [h(names.education), '[Degree or certification], [Institution] — [YYYY]'];
    case 'skills': return [h(names.skills), '[Skill], [Skill], [Tool], [Tool], [Method]'];
    default: return [];
  }
}

function makeCtx(analysis, opts) {
  const role = typeof opts.targetRole === 'string' ? opts.targetRole.replace(/\s+/g, ' ').trim().slice(0, 60) : '';
  const known = analysis.lines.filter((l) => l.kind === 'heading' && !l.unusual);
  const upper = known.length > 0 && known.filter((l) => isAllCaps(l.text)).length * 2 >= known.length;
  return { targetRole: role, upperHeadings: upper, lang: analysis.lang === 'es' ? 'es' : 'en', ui: analysis.ui || 'en' };
}

// Re-analyze rewritten text with the same CV language and interface language.
const reanalyze = (text, analysis) => analyzeResume(text, { lang: analysis.lang, ui: analysis.ui });

// ---------- Public API ----------

/** Apply a set of tips to the analyzed text and return the rewritten resume text. */
export function applyTips(analysis, tips, opts = {}) {
  if (!analysis || !analysis.ok) return analysis && analysis.text ? analysis.text : '';
  const ctx = makeCtx(analysis, opts);
  const perLine = new Map();
  const inserts = { contact: [], summary: [], end: [] };
  for (const tip of tips) {
    for (const item of tip.items) {
      if (item.lineId != null) {
        if (!perLine.has(item.lineId)) perLine.set(item.lineId, new Set());
        perLine.get(item.lineId).add(tip.type);
      } else if (item.insert) inserts[item.insert.at].push(item.insert);
    }
  }
  // Canonical insert order so the result doesn't depend on the order tips were toggled.
  for (const k of Object.keys(inserts)) inserts[k].sort((a, b) => a.order - b.order);

  const lines = analysis.lines;
  const firstHeading = lines.findIndex((l) => l.kind === 'heading');
  const headerEnd = firstHeading === -1 ? lines.length : firstHeading;
  let lastHeader = 0;
  for (let i = 0; i < headerEnd; i++) if (!lines[i].blank) lastHeader = i;

  const out = [];
  for (const line of lines) {
    if (line.id === headerEnd) for (const ins of inserts.summary) out.push(...ins.lines, '');
    const types = perLine.get(line.id);
    if (types) {
      const res = transformLine(line, types, ctx);
      if (res !== null) for (const seg of res.split('\n')) out.push(line.prefix + seg);
    } else out.push(line.raw);
    if (line.id === lastHeader) for (const ins of inserts.contact) out.push(...ins.lines);
  }
  if (headerEnd === lines.length) for (const ins of inserts.summary) out.push('', ...ins.lines);
  for (const ins of inserts.end) out.push('', ...ins.lines);
  return out.join('\n');
}

/** Build prioritized tips. Each tip's `points` = score gain from applying that tip alone. */
export function buildTips(analysis, opts = {}) {
  if (!analysis || !analysis.ok) return [];
  const ctx = makeCtx(analysis, opts);
  const lines = analysis.lines;

  const byType = new Map();
  for (const line of lines) {
    for (const f of line.findings) {
      const type = CODE_TO_TYPE[f.code];
      if (!type) continue;
      if (!byType.has(type)) byType.set(type, []);
      const ids = byType.get(type);
      if (!ids.includes(line.id)) ids.push(line.id);
    }
  }

  const tips = [];
  for (const type of TYPE_ORDER) {
    const ids = byType.get(type);
    if (!ids) continue;
    const items = [];
    for (const id of ids) {
      const line = lines[id];
      const res = transformLine(line, new Set([type]), ctx);
      const rewrite = res === null ? '' : res.split('\n').map((s) => (line.prefix + s).trim()).join('\n');
      if (res !== null && rewrite === line.raw.trim()) continue; // no template improves this line
      items.push({ lineId: id, original: line.raw.trim(), rewrite, remove: res === null });
    }
    if (items.length) tips.push({ type, items });
  }

  // Missing sections (skipping any that a heading rename would already provide).
  const renamed = new Set(lines.filter((l) => l.unusual).map((l) => l.suggestedKey));
  const missing = analysis.missingSections.filter((k) => !renamed.has(k));
  if (missing.length) {
    tips.push({
      type: 'sections',
      items: missing.map((k) => {
        const tpl = sectionTemplate(k, ctx);
        return { lineId: null, section: k, original: t(ctx.ui, 'tip.noSection', { section: t(ctx.ui, `section.${k}`) }),
          rewrite: tpl.join('\n'), remove: false,
          insert: { at: k === 'summary' ? 'summary' : 'end', order: REQUIRED_SECTIONS.indexOf(k), lines: tpl } };
      }),
    });
  }

  // Contact details: presence only.
  const contactItems = [];
  const emailPh = ctx.lang === 'es' ? '[tu.email@ejemplo.com]' : '[your.email@example.com]';
  const phonePh = ctx.lang === 'es' ? '[teléfono]' : '[phone number]';
  if (!analysis.sections.email) contactItems.push({ lineId: null, field: 'email', original: t(ctx.ui, 'tip.noEmail'), rewrite: emailPh, remove: false,
    insert: { at: 'contact', order: 0, lines: [emailPh] } });
  if (!analysis.sections.phone) contactItems.push({ lineId: null, field: 'phone', original: t(ctx.ui, 'tip.noPhone'), rewrite: phonePh, remove: false,
    insert: { at: 'contact', order: 1, lines: [phonePh] } });
  if (contactItems.length) tips.push({ type: 'contact', items: contactItems });

  for (const tip of tips) {
    Object.assign(tip, { id: tip.type }, describe(tip, ctx.ui));
    const after = reanalyze(applyTips(analysis, [tip], opts), analysis);
    tip.projected = after.ok ? after.overall : analysis.overall;
    tip.points = tip.projected - analysis.overall;
  }
  // Highest gain first; ties broken by fixed type order (deterministic).
  tips.sort((a, b) => b.points - a.points || TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type));
  return tips;
}

/** Score preview after applying the tips whose ids are in `doneIds`. */
export function projectScore(analysis, tips, doneIds, opts = {}) {
  const done = new Set(doneIds);
  const text = applyTips(analysis, tips.filter((x) => done.has(x.id)), opts);
  const after = reanalyze(text, analysis);
  return { text, analysis: after, overall: after.ok ? after.overall : analysis.overall };
}

function describe(tip, ui) {
  const n = tip.items.length;
  const p = { n, max: LONG_BULLET_WORDS };
  switch (tip.type) {
    case 'verbs': {
      const found = [];
      for (const it of tip.items) for (const ph of findWeakPhrases(it.original)) if (!found.includes(ph)) found.push(ph);
      const list = found.slice(0, 2).map((ph) => `"${ph}"`).join(ui === 'es' ? ' y ' : ' and ');
      return { title: t(ui, 'tip.verbs.t', { list }), description: t(ui, 'tip.verbs.d', p) };
    }
    case 'sections': {
      const labels = tip.items.map((it) => t(ui, `section.${it.section}`)).join(', ');
      return { title: t(ui, 'tip.sections.t', { n, labels }), description: t(ui, 'tip.sections.d') };
    }
    case 'contact': {
      const has = (f) => tip.items.some((it) => it.field === f);
      return { title: t(ui, 'tip.contact.t', { email: has('email'), phone: has('phone') }), description: t(ui, 'tip.contact.d') };
    }
    default:
      return { title: t(ui, `tip.${tip.type}.t`, p), description: t(ui, `tip.${tip.type}.d`, p) };
  }
}
