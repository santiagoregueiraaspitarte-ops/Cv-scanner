// Rule-based resume analyzer for English and Spanish CVs.
// Pure module: no DOM, no randomness, no clock. The same text and options always yield the same result.
// It never looks at personal characteristics; contact lines are only checked for email/phone presence.
//
// Detection rules are bilingual (English and Spanish headings, verbs, weak phrases, pronouns and months
// are always recognized), so a mixed CV is never penalized for its language. The CV language (detected,
// or chosen) only decides the language of suggested headings and rewrites; `ui` decides the language
// of messages.

import { t, detectLanguage, normalizeLang } from './i18n.js';

export const WEIGHTS = Object.freeze({ structure: 0.25, impact: 0.25, verbs: 0.2, readability: 0.15, ats: 0.15 });
export const SUBSCORE_ORDER = ['structure', 'impact', 'verbs', 'readability', 'ats'];
export const SUBSCORE_LABELS = {
  structure: 'Structure & sections',
  impact: 'Impact & metrics',
  verbs: 'Action verbs',
  readability: 'Length & readability',
  ats: 'ATS formatting',
};
export const MIN_WORDS = 25;
export const LONG_BULLET_WORDS = 28;
const VERY_LONG_BULLET_WORDS = 40;

// Compare without accents ("Educación" = "educacion").
export const fold = (s) => s.normalize('NFD').replace(/\p{M}+/gu, '');

// ---------- Section headings ----------

const SECTION_ALIASES = {
  contact: ['contact', 'contact information', 'contact info', 'contact details',
    'contacto', 'datos de contacto', 'informacion de contacto', 'datos personales'],
  summary: ['summary', 'professional summary', 'career summary', 'profile', 'professional profile', 'about',
    'about me', 'objective', 'career objective', 'overview', 'personal statement',
    'resumen', 'resumen profesional', 'resumen ejecutivo', 'perfil', 'perfil profesional', 'perfil laboral',
    'sobre mi', 'acerca de mi', 'objetivo', 'objetivo profesional', 'extracto', 'presentacion'],
  experience: ['experience', 'work experience', 'professional experience', 'relevant experience', 'employment',
    'employment history', 'work history', 'career history', 'professional background',
    'experiencia', 'experiencia laboral', 'experiencia profesional', 'experiencia relevante', 'antecedentes laborales',
    'historial laboral', 'trayectoria', 'trayectoria profesional', 'trayectoria laboral'],
  education: ['education', 'education and training', 'academic background', 'academic qualifications',
    'qualifications', 'education and certifications',
    'educacion', 'formacion', 'formacion academica', 'estudios', 'estudios realizados', 'educacion y formacion',
    'formacion y certificaciones', 'formacion profesional', 'antecedentes academicos'],
  skills: ['skills', 'technical skills', 'core skills', 'key skills', 'skills and tools', 'tools and technologies',
    'technologies', 'tools', 'core competencies', 'competencies', 'expertise', 'areas of expertise', 'skills and expertise',
    'habilidades', 'habilidades tecnicas', 'habilidades y herramientas', 'habilidades blandas', 'competencias',
    'competencias clave', 'aptitudes', 'conocimientos', 'conocimientos tecnicos', 'herramientas', 'tecnologias'],
  // Recognized standard headings that are not required.
  extra: ['projects', 'selected projects', 'key projects', 'certifications', 'certificates', 'licenses and certifications',
    'awards', 'honors', 'honors and awards', 'publications', 'volunteering', 'volunteer experience', 'languages',
    'interests', 'achievements', 'key achievements', 'leadership', 'training', 'courses', 'additional information', 'activities',
    'athletics', 'athletic achievements', 'leadership and achievements', 'leadership and athletic achievements',
    'leadership and activities', 'extracurricular activities', 'awards and achievements', 'honors and activities',
    'proyectos', 'certificaciones', 'certificados', 'cursos y certificaciones', 'premios', 'premios y reconocimientos',
    'reconocimientos', 'logros', 'logros deportivos', 'idiomas', 'intereses', 'voluntariado', 'publicaciones', 'cursos',
    'capacitacion', 'capacitaciones', 'liderazgo', 'actividades', 'actividades extracurriculares', 'informacion adicional',
    'referencias', 'deportes', 'otros'],
};

function normalizeHeading(s) {
  return fold(s.toLowerCase()).replace(/&/g, ' and ').replace(/[:\-–—•*_#=]+/g, ' ')
    .replace(/(?<!\p{L})y(?!\p{L})/gu, 'and').replace(/\s+/g, ' ').trim();
}

const HEADING_LOOKUP = new Map();
for (const key of Object.keys(SECTION_ALIASES)) for (const a of SECTION_ALIASES[key]) HEADING_LOOKUP.set(normalizeHeading(a), key);

export const SECTION_LABELS = { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills' };
export const REQUIRED_SECTIONS = ['summary', 'experience', 'education', 'skills'];
// Standard heading names in each CV language (used for suggestions and inserted sections).
export const HEADING_NAMES = {
  en: { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', additional: 'Additional Information' },
  es: { summary: 'Resumen', experience: 'Experiencia', education: 'Educación', skills: 'Habilidades', additional: 'Información adicional' },
};

// ---------- Patterns ----------

const BULLET_RE = /^(\s*)([-*•‣▪◦●–—·>]|\d{1,2}[.)])\s+/;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_CANDIDATE_RE = /\+?\(?\d[\d\s().-]{6,}\d/g;
const PHONE_PLACEHOLDER_RE = /\[(?:phone|tel[eé]fono)[^\]]*\]/i;
const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b(?:linkedin|github)\.com\/\S+/i;
const YEAR_RE = /\b(?:19|20)\d{2}\b/;
// Bracketed placeholders from rewrite templates count as "to be filled in" (score previews assume you fill them).
const DATE_PLACEHOLDER_RE = /\[(?:(?:mon|mes)\s+)?(?:yyyy|aaaa)\]/i;
const MONTH_RE = /(?<!\p{L})(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec|ene|abr|ago|set|dic)\p{L}*\.?(?!\p{L})/giu;
const NUMBER_WORDS_RE = new RegExp('(?<!\\p{L})(?:doubled|tripled|quadrupled|halved|twice|dozens|hundreds|thousands|millions|billions'
  + '|dupliqu[eé]|duplic[oó]|tripliqu[eé]|triplic[oó]|cuadrupliqu[eé]|cuadruplic[oó]|la mitad|decenas|docenas|cientos|miles|millones)(?!\\p{L})', 'iu');
export const IMAGE_RE = /\[(?:image|img|photo|picture|logo|graphic|icon|chart|imagen|foto|logotipo|gr[aá]fico|icono)(?![a-z])[^\]]*\]|!\[[^\]]*\]\([^)]*\)|\.(?:png|jpe?g|gif|svg|webp)\b/i;
const ROLE_WORDS_RE = /\b(?:engineer|developer|manager|analyst|intern|designer|specialist|coordinator|lead|director|consultant|assistant|associate|scientist|administrator|officer|representative|architect|marketer|technician|teacher|nurse|accountant|founder|owner|vp|president|executive|supervisor|programmer|editor|writer|researcher)s?\b/i;
const ROLE_WORDS_ES_RE = /(?<!\p{L})(?:gerente|director|directora|analista|pasante|practicante|dise[ñn]ador|dise[ñn]adora|desarrollador|desarrolladora|coordinador|coordinadora|jefe|jefa|l[ií]der|consultor|consultora|asistente|ejecutivo|ejecutiva|especialista|ingeniero|ingeniera|responsable|supervisor|supervisora|vendedor|vendedora|docente|profesor|profesora|contador|contadora|administrativo|administrativa|fundador|fundadora|socio|socia|encargado|encargada|t[eé]cnico|t[eé]cnica|redactor|redactora|investigador|investigadora|programador|programadora|tutor|tutora|becario|becaria|auxiliar)(?:es|s)?(?!\p{L})/iu;
const EDU_RE = /\b(?:university|college|school|academy|institute|bachelor|master|b\.?s\.?c?|b\.?a\.?|m\.?s\.?c?|m\.?b\.?a|ph\.?d|degree|diploma|certificate)\b/i;
const EDU_ES_RE = /(?<!\p{L})(?:universidad|licenciatura|licenciad[oa]|maestr[ií]a|posgrado|diplomatura|diplomado|instituto|colegio|escuela|t[ií]tulo|tecnicatura|doctorado|bachiller|carrera|ingenier[ií]a)(?!\p{L})/iu;
const isRoleLike = (s) => ROLE_WORDS_RE.test(s) || ROLE_WORDS_ES_RE.test(s);
const isEduLike = (s) => EDU_RE.test(s) || EDU_ES_RE.test(s);

// First-person pronouns. English excludes "i.e." and "I/O".
const PRONOUN_EN = '\\b(?:i|me|my|mine|myself|we|our|ours)\\b(?![./&-]\\w)';
const PRONOUN_ES = '(?<!\\p{L})(?:yo|mi|mis|me|conmigo|nosotros|nosotras|nuestro|nuestra|nuestros|nuestras)(?!\\p{L})';
const PRONOUN_RE = new RegExp(`${PRONOUN_EN}|${PRONOUN_ES}`, 'iu');
export const hasPronoun = (s) => PRONOUN_RE.test(s);
export const countPronouns = (s) => (s.match(new RegExp(`${PRONOUN_EN}|${PRONOUN_ES}`, 'giu')) || []).length;

// Weak verbs/phrases. `verb` replaces the phrase at the start of a line, `mid` replaces it mid-sentence.
// `lang` is the language of the phrase (and of its replacement).
const ES_B = '(?<!\\p{L})';
const ES_E = '(?!\\p{L})';
const es = (src) => new RegExp(`${ES_B}${src}${ES_E}`, 'iu');
export const WEAK_PHRASES = [
  { phrase: 'responsible for', re: /\b(?:(?:was|were) )?responsible for\b/i, verb: 'Owned', mid: 'owned', lang: 'en' },
  { phrase: 'worked on', re: /\bworked on\b/i, verb: 'Developed', mid: 'developed', lang: 'en' },
  { phrase: 'worked with', re: /\bworked with\b/i, verb: 'Collaborated with', mid: 'collaborated with', lang: 'en' },
  { phrase: 'helped', re: /\bhelped(?: to| with)?\b/i, verb: 'Supported', mid: 'supported', lang: 'en' },
  { phrase: 'assisted', re: /\bassisted(?: with| in)?\b/i, verb: 'Supported', mid: 'supported', lang: 'en' },
  { phrase: 'participated in', re: /\bparticipated in\b/i, verb: 'Contributed to', mid: 'contributed to', lang: 'en' },
  { phrase: 'was involved in', re: /\b(?:(?:was|were) )?involved in\b/i, verb: 'Contributed to', mid: 'contributed to', lang: 'en' },
  { phrase: 'handled', re: /\bhandled\b/i, verb: 'Managed', mid: 'managed', lang: 'en' },
  { phrase: 'tasked with', re: /\b(?:(?:was|were) )?tasked with\b/i, verb: 'Delivered', mid: 'delivered', lang: 'en' },
  { phrase: 'in charge of', re: /\b(?:(?:was|were) )?in charge of\b/i, verb: 'Led', mid: 'led', lang: 'en' },
  { phrase: 'duties included', re: /\bduties included\b/i, verb: 'Delivered', mid: 'delivered', lang: 'en' },
  { phrase: 'took part in', re: /\btook part in\b/i, verb: 'Contributed to', mid: 'contributed to', lang: 'en' },
  { phrase: 'dealt with', re: /\bdealt with\b/i, verb: 'Resolved', mid: 'resolved', lang: 'en' },
  { phrase: 'responsable de', re: es('(?:fui |era |como )?responsable de'), verb: 'Lideré', mid: 'lideré', lang: 'es' },
  { phrase: 'encargado de', re: es('(?:fui |era |estuve )?encargad[oa]s? de'), verb: 'Gestioné', mid: 'gestioné', lang: 'es' },
  { phrase: 'me encargué de', re: es('(?:me )?encargu[ée] de'), verb: 'Gestioné', mid: 'gestioné', lang: 'es' },
  { phrase: 'a cargo de', re: es('(?:estuve |estaba )?a cargo de'), verb: 'Dirigí', mid: 'dirigí', lang: 'es' },
  { phrase: 'ayudé', re: es('ayud(?:é|e|ó|o|ar|aba)(?: a| con| en)?'), verb: 'Contribuí a', mid: 'contribuí a', lang: 'es' },
  { phrase: 'participé en', re: es('particip(?:é|e|ó|o|ar|aba|ación)(?: en| de)?'), verb: 'Contribuí a', mid: 'contribuí a', lang: 'es' },
  { phrase: 'trabajé en', re: es('trabaj(?:é|e|ó|aba) (?:en|sobre)'), verb: 'Desarrollé', mid: 'desarrollé', lang: 'es' },
  { phrase: 'trabajé con', re: es('trabaj(?:é|e|ó|aba) con'), verb: 'Colaboré con', mid: 'colaboré con', lang: 'es' },
  { phrase: 'asistí', re: es('asist(?:í|i|ió|io|ir|ía)(?: a| en| con)?'), verb: 'Apoyé', mid: 'apoyé', lang: 'es' },
];

const STRONG_VERBS = new Set(`accelerated achieved analyzed analysed architected authored automated boosted built
championed closed coached collaborated consolidated contributed coordinated created cut debugged decreased defined
delivered deployed designed developed directed doubled drove eliminated enabled engineered established exceeded
executed expanded facilitated fixed generated grew halved hired identified implemented improved increased initiated
introduced launched led maintained managed mentored migrated modernized negotiated optimized orchestrated organized
owned partnered pioneered planned presented produced prototyped published raised rebuilt redesigned reduced refactored
resolved restructured revamped saved scaled secured shipped simplified spearheaded standardized streamlined supported
taught tested trained transformed tripled won wrote conducted
oversaw ran sold made began brought held kept set chose advised guided consulted awarded earned
lead build manage design develop own drive launch create deliver improve reduce increase mentor scale ship run
analyze coordinate define oversee advise guide consult sell`.split(/\s+/));
const WEAK_FIRST_WORDS = new Set(['helped', 'assisted', 'participated', 'handled', 'worked', 'involved', 'tasked', 'dealt']);

// Spanish: present-tense and noun-style openers that count as action verbs (accents folded). Preterite
// forms (lideré, gestionó, dirigí…) are recognized by their accented ending instead of a list.
const ES_STRONG = new Set(`lidero gestiono desarrollo coordino dirijo administro superviso diseno implemento analizo
asesoro negocio planifico organizo ejecuto creo lanzo construyo defino establezco impulso optimizo automatizo capacito
liderazgo gestion implementacion coordinacion direccion planificacion analisis creacion lanzamiento administracion
negociacion supervision optimizacion automatizacion elaboracion ejecucion construccion definicion redaccion migracion
integracion investigacion capacitacion
hice reduje conduje produje introduje obtuve mantuve tuve puse propuse traduje`.split(/\s+/));
const ES_WEAK_FIRST = new Set(['ayude', 'ayudo', 'ayudaba', 'participe', 'participo', 'participaba', 'asisti', 'asistio',
  'trabaje', 'trabajo', 'trabajaba', 'fui', 'era', 'estuve', 'estaba', 'responsable', 'encargado', 'encargada', 'encargue']);

// ---------- Small helpers ----------

export function countWords(s) {
  return s.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

export function hasMetric(s) {
  // Years are not metrics; digits, %, currency or number words are.
  const x = s.replace(/\b(?:19|20)\d{2}\b/g, '');
  return /\d|%|[$€£¥]/.test(x) || NUMBER_WORDS_RE.test(x);
}

export function hasDate(s) {
  return YEAR_RE.test(s) || DATE_PLACEHOLDER_RE.test(s);
}

function isDateOnly(s) {
  if (!hasDate(s)) return false;
  const rest = s.replace(MONTH_RE, '').replace(/\b(?:19|20)\d{2}\b/g, '').replace(new RegExp(DATE_PLACEHOLDER_RE.source, 'gi'), '')
    .replace(/(?<!\p{L})(?:present|current|now|to|until|actualidad|presente|actual|hoy|fecha|hasta|desde|la|a|al|de)(?!\p{L})/giu, '')
    .replace(/[\s–—\-/,.()|]+/g, '');
  return rest.length === 0;
}

function hasPhone(s) {
  if (PHONE_PLACEHOLDER_RE.test(s)) return true;
  const m = s.match(PHONE_CANDIDATE_RE);
  return !!m && m.some((x) => { const d = x.replace(/\D/g, '').length; return d >= 7 && d <= 15; });
}

// Weak phrases in the order they appear in the line.
export function findWeakPhrases(s) {
  return WEAK_PHRASES.map((w) => ({ p: w.phrase, i: s.search(w.re) }))
    .filter((x) => x.i !== -1)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.p);
}

function esActionVerb(word) {
  const raw = word.toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  const f = fold(raw);
  if (!f || ES_WEAK_FIRST.has(f)) return false;
  if (raw.length >= 5 && /[éóí]$/.test(raw)) return true; // preterite: lideré, gestionó, dirigí
  return ES_STRONG.has(f);
}

export function startsWithActionVerb(s) {
  // Skip a short lead-in label ("Key Achievement: Increased…", "Logro clave: Aumenté…") and check the verb after it.
  const body = s.trim().replace(/^\p{L}[\p{L} ]{0,30}:\s+/u, (m) => (m.trim().split(/\s+/).length <= 3 ? '' : m));
  const word = body.split(/\s+/)[0] || '';
  const first = word.toLowerCase().replace(/[^a-z-]/g, '');
  if (first && !WEAK_FIRST_WORDS.has(first) && (STRONG_VERBS.has(first) || /^[a-z]{3,}ed$/.test(first))) return true;
  return esActionVerb(word);
}

function isAllCaps(s) {
  return /\p{Lu}/u.test(s) && s === s.toUpperCase();
}

// Unknown heading heuristic: short, title-cased or all-caps line on its own, followed by content.
// Inside Experience or a recognized extra section, a title line whose next line holds dates is a
// role/entry title (e.g. "Econ Games Participant" + "University | Apr 2025"), not a heading.
function looksLikeHeading(line, prev, next, section) {
  const s = line.text.replace(/:$/, '');
  if (line.isBullet || !next || next.blank) return false;
  if (prev && !prev.blank && !line.text.endsWith(':')) return false;
  if ((section === 'experience' || section === 'extra') && hasDate(next.text)) return false;
  const words = s.split(/\s+/);
  if (words.length > 4 || s.length > 32) return false;
  if (/[\d@,.;!?|]/.test(s) || /\t/.test(line.content) || isRoleLike(s)) return false;
  return isAllCaps(s) || words.every((w) => /^[\p{Lu}&]/u.test(w)) || line.text.endsWith(':');
}

// Suggest a standard heading (by key) for an unusual one, based on what sits under it.
function guessHeading(lines, idx) {
  const body = [];
  for (let j = idx + 1; j < lines.length && lines[j].kind !== 'heading'; j++) {
    if (!lines[j].blank && !IMAGE_RE.test(lines[j].content)) body.push(lines[j]);
  }
  if (body.some((l) => l.isBullet) && body.some((l) => YEAR_RE.test(l.text) || isRoleLike(l.text))) return 'experience';
  if (body.some((l) => isEduLike(l.text))) return 'education';
  const listy = body.length > 0 && body.every((l) => {
    const items = l.content.split(/[,\t|•·;]+/).map((x) => x.trim()).filter(Boolean);
    return items.length >= 2 && items.reduce((n, x) => n + countWords(x), 0) / items.length <= 3;
  });
  if (listy) return 'skills';
  if (body.some((l) => l.words >= 10 && !l.isBullet)) return 'summary';
  return 'additional';
}

// ---------- Line parsing ----------

function normalizeInput(text) {
  return String(text == null ? '' : text)
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/\s+$/, '');
}

function parseLines(text) {
  const lines = text.split('\n').map((raw, id) => {
    const m = raw.match(BULLET_RE);
    const prefix = m ? m[0] : (raw.match(/^\s*/) || [''])[0];
    const content = raw.slice(prefix.length).replace(/\s+$/, '');
    const s = content.replace(/\s+/g, ' ').trim();
    return { id, raw, prefix, content, text: s, blank: s === '', isBullet: !!m && s !== '', words: countWords(s),
      kind: 'blank', section: 'header', findings: [], status: 'neutral' };
  });

  let section = 'header';
  let seenFirst = false;
  let headerLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    line.section = section;
    if (line.blank) continue;
    const prev = i > 0 ? lines[i - 1] : null;
    const next = lines[i + 1] || null;

    if (!seenFirst) { seenFirst = true; line.kind = 'header'; continue; }

    const known = !line.isBullet && line.words <= 5 ? HEADING_LOOKUP.get(normalizeHeading(line.text)) : undefined;
    if (known) {
      line.kind = 'heading'; line.headingKey = known; section = known; line.section = known; continue;
    }
    if (looksLikeHeading(line, prev, next, section)) {
      line.kind = 'heading'; line.headingKey = 'other'; line.unusual = true; section = 'other'; line.section = 'other'; continue;
    }
    if (section === 'header') {
      headerLines++;
      // Header block holds at most 3 lines after the first; anything beyond is ordinary content.
      if (headerLines <= 3) {
        line.kind = EMAIL_RE.test(line.text) || hasPhone(line.text) || URL_RE.test(line.text) ? 'contact' : 'header';
        continue;
      }
      section = 'other'; line.section = 'other';
    }
    if (section === 'contact') line.kind = 'contact';
    else if (line.isBullet) line.kind = 'bullet';
    else if (section === 'experience') {
      if (isDateOnly(line.text)) line.kind = 'date';
      else if (line.words <= 14 && !/[.!?]$/.test(line.text)) line.kind = 'role';
      else line.kind = 'body';
    } else line.kind = 'body';
  }

  for (const line of lines) {
    if (line.kind === 'heading' && line.unusual) line.suggestedKey = guessHeading(lines, line.id);
  }
  return lines;
}

// Lines that describe what you did: bullets outside skills/education, plus prose lines under Experience.
function isAchievementLine(l) {
  if (l.kind === 'bullet') return !['skills', 'education', 'contact', 'header'].includes(l.section);
  return l.kind === 'body' && l.section === 'experience';
}

// Lines where a first-person pronoun check makes sense (prose, not lists).
function isProseLine(l) {
  if (isAchievementLine(l)) return true;
  return l.kind === 'body' && ['summary', 'experience', 'other', 'extra'].includes(l.section) && l.words >= 4;
}

function add(line, category, severity, code, message) {
  line.findings.push({ category, severity, code, message });
}

// ---------- Main entry ----------

/**
 * Analyze resume text.
 * opts.lang: CV language for rewrites/suggested headings ('en' | 'es'; anything else = auto-detect).
 * opts.ui:   language of messages ('en' | 'es', default 'en').
 */
export function analyzeResume(input, opts = {}) {
  const ui = normalizeLang(opts.ui);
  const text = normalizeInput(input);
  const wordCount = countWords(text);
  if (wordCount === 0) {
    return { ok: false, error: { code: 'empty', message: t(ui, 'err.empty') } };
  }
  if (wordCount < MIN_WORDS) {
    return { ok: false, error: { code: 'too_short', message: t(ui, 'err.too_short', { n: wordCount, min: MIN_WORDS }) } };
  }
  const langAuto = opts.lang !== 'en' && opts.lang !== 'es';
  const lang = langAuto ? detectLanguage(text) : opts.lang;

  const lines = parseLines(text);
  for (const l of lines) if (l.suggestedKey) l.suggestedHeading = HEADING_NAMES[lang][l.suggestedKey];
  const achievement = lines.filter(isAchievementLine);
  const prose = lines.filter(isProseLine);

  // --- Contact: only presence of email / phone is checked. ---
  const contactPool = lines.filter((l) => l.kind === 'contact' || l.kind === 'header');
  const emailLine = contactPool.find((l) => EMAIL_RE.test(l.text)) || lines.find((l) => !l.blank && EMAIL_RE.test(l.text));
  const phoneLine = contactPool.find((l) => hasPhone(l.text));
  if (emailLine) add(emailLine, 'structure', 'strength', 'email', t(ui, 'f.email'));
  if (phoneLine) add(phoneLine, 'structure', 'strength', 'phone', t(ui, 'f.phone'));

  // --- Section headings ---
  const present = { summary: false, experience: false, education: false, skills: false };
  for (const l of lines) {
    if (l.kind !== 'heading') continue;
    if (l.unusual) {
      add(l, 'ats', 'warn', 'unusual-heading', t(ui, 'f.unusualHeading', { suggested: l.suggestedHeading }));
    } else {
      add(l, 'structure', 'strength', 'heading', t(ui, 'f.heading'));
      if (l.headingKey in present) present[l.headingKey] = true;
    }
  }

  // --- Roles: each role block (consecutive role/date lines) needs dates. ---
  let undatedRoles = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== 'role' && lines[i].kind !== 'date') continue;
    const block = [];
    while (i < lines.length && (lines[i].kind === 'role' || lines[i].kind === 'date')) block.push(lines[i++]);
    const dated = block.some((l) => hasDate(l.text));
    const roleLines = block.filter((l) => l.kind === 'role');
    if (dated) roleLines.forEach((l) => add(l, 'structure', 'strength', 'dated-role', t(ui, 'f.datedRole')));
    else if (roleLines.length) {
      undatedRoles++;
      add(roleLines[0], 'structure', 'issue', 'missing-dates', t(ui, 'f.missingDates'));
    }
  }

  // --- Achievement lines: metrics, verbs, length ---
  let withMetric = 0, strongStarts = 0, weakLines = 0, longLines = 0;
  for (const l of achievement) {
    // Impact: a line counts when it contains a number, %, currency or a number word (years excluded).
    if (hasMetric(l.text)) { withMetric++; add(l, 'impact', 'strength', 'metric', t(ui, 'f.metric')); }
    else add(l, 'impact', 'warn', 'no-metric', t(ui, 'f.noMetric'));

    // Verbs: weak phrasing is flagged; otherwise reward lines that open with an action verb.
    const weak = findWeakPhrases(l.text);
    if (weak.length) { weakLines++; add(l, 'verbs', 'warn', 'weak-verb', t(ui, 'f.weakVerb', { phrases: weak.map((p) => `"${p}"`).join(', ') })); }
    else if (startsWithActionVerb(l.text)) { strongStarts++; add(l, 'verbs', 'strength', 'action-verb', t(ui, 'f.actionVerb')); }
    else add(l, 'verbs', 'warn', 'no-action-verb', t(ui, 'f.noActionVerb'));

    // Readability: bullets over 28 words are hard to scan; over 40 is an issue.
    if (l.words > LONG_BULLET_WORDS) {
      longLines++;
      add(l, 'readability', l.words > VERY_LONG_BULLET_WORDS ? 'issue' : 'warn', 'long',
        t(ui, 'f.long', { n: l.words, max: LONG_BULLET_WORDS + 1 }));
    }
  }

  // --- Pronouns in prose lines ---
  let pronounLines = 0;
  for (const l of prose) {
    if (hasPronoun(l.text)) {
      pronounLines++;
      add(l, 'readability', 'warn', 'pronoun', t(ui, 'f.pronoun'));
    }
  }

  // --- ATS formatting signals on every non-blank line ---
  let atsPenalty = 0;
  const atsCounts = { tabs: 0, tables: 0, spacing: 0, images: 0, headings: 0 };
  for (const l of lines) {
    if (l.blank) continue;
    if (/\S\t+\S/.test(l.content)) {
      atsCounts.tabs++; atsPenalty += 10; // tab-separated columns
      add(l, 'ats', 'issue', 'ats-tabs', t(ui, 'f.atsTabs'));
    }
    // Table rows: a line that starts or ends with "|" (text copied from a table) or a |---|---| divider.
    // Pipes used as separators inside a line ("Title | Company | Dates") are fine for modern ATS.
    const c = l.content.trim();
    if (/^\|.*\|/.test(c) || /\|.*\|$/.test(c) || /^\|?\s*:?-{3,}:?\s*\|/.test(c)) {
      atsCounts.tables++; atsPenalty += 8; // table rows
      add(l, 'ats', 'issue', 'ats-pipes', t(ui, 'f.atsTable'));
    }
    if (/\S {3,}\S/.test(l.content)) {
      atsCounts.spacing++; atsPenalty += 8; // wide spacing used to fake columns
      add(l, 'ats', 'issue', 'ats-spacing', t(ui, 'f.atsSpacing'));
    }
    if (IMAGE_RE.test(l.content)) {
      atsCounts.images++; atsPenalty += 15; // images/graphics are invisible to ATS
      add(l, 'ats', 'issue', 'ats-image', t(ui, 'f.atsImage'));
    }
  }
  for (const l of lines) if (l.kind === 'heading' && l.unusual) { atsCounts.headings++; atsPenalty += 10; }

  // ---------- Sub-scores ----------
  const n = achievement.length;

  // Structure (0-100): email 10 + phone 10 + summary 15 + experience 30 + education 15 + skills 20,
  // minus 5 per role without dates (max -15).
  const structureRaw = (emailLine ? 10 : 0) + (phoneLine ? 10 : 0) + (present.summary ? 15 : 0)
    + (present.experience ? 30 : 0) + (present.education ? 15 : 0) + (present.skills ? 20 : 0);
  const structure = clamp(structureRaw - Math.min(15, undatedRoles * 5));
  const missing = REQUIRED_SECTIONS.filter((k) => !present[k]);
  const structureExpl = t(ui, 'x.structure', {
    found: REQUIRED_SECTIONS.length - missing.length, total: REQUIRED_SECTIONS.length,
    missing: missing.map((k) => t(ui, `section.${k}`)).join(', '), email: !!emailLine, phone: !!phoneLine, undated: undatedRoles,
  });

  // Impact (0-100): share of achievement lines with a metric; 60% or more earns full marks.
  const impact = n ? clamp(Math.round(Math.min(1, withMetric / n / 0.6) * 100)) : 0;
  const impactExpl = n ? t(ui, 'x.impact', { with: withMetric, n }) : t(ui, 'x.impactNone');

  // Verbs (0-100): 70% weight on lines opening with an action verb, 30% on avoiding weak phrasing.
  const verbs = n ? clamp(Math.round((strongStarts / n) * 70 + (1 - weakLines / n) * 30)) : 0;
  const verbsExpl = n ? t(ui, 'x.verbs', { strong: strongStarts, n, weak: weakLines }) : t(ui, 'x.verbsNone');

  // Length & readability (0-100): total length 40 + concise bullets 35 + no first-person pronouns 25.
  const lengthPts = wordCount >= 200 && wordCount <= 850 ? 40 : (wordCount >= 120 && wordCount <= 1200 ? 25 : 10);
  const longPts = n ? 35 * (1 - longLines / n) : 0;
  const pronounPts = prose.length ? 25 * (1 - pronounLines / prose.length) : 25;
  const readability = clamp(Math.round(lengthPts + longPts + pronounPts));
  const readabilityExpl = t(ui, 'x.readability', { words: wordCount, long: longLines, max: LONG_BULLET_WORDS, pronouns: pronounLines });

  // ATS (0-100): start at 100; tabs -10, table rows -8, wide spacing -8, image -15, unusual heading -10 (each).
  const ats = clamp(100 - atsPenalty);
  const atsExpl = t(ui, 'x.ats', atsCounts);

  const raw = { structure, impact, verbs, readability, ats };
  const expl = { structure: structureExpl, impact: impactExpl, verbs: verbsExpl, readability: readabilityExpl, ats: atsExpl };

  // Finalize line status: issue > warn > strength.
  for (const l of lines) {
    const sev = l.findings.map((f) => f.severity);
    l.status = sev.includes('issue') ? 'issue' : sev.includes('warn') ? 'warn' : sev.includes('strength') ? 'strength' : 'neutral';
  }

  const subscores = SUBSCORE_ORDER.map((key) => {
    const points = Math.round(raw[key] * WEIGHTS[key] * 10) / 10;
    const lineIds = lines.filter((l) => l.findings.some((f) => f.category === key)).map((l) => l.id);
    return { key, label: t(ui, `sub.${key}`), score: raw[key], weight: WEIGHTS[key], points, explanation: expl[key], lineIds };
  });
  // Overall = weighted sum of sub-scores (sum of the points column, rounded).
  const overall = clamp(Math.round(subscores.reduce((s, x) => s + x.points, 0)));

  return {
    ok: true,
    text,
    lang,
    langAuto,
    ui,
    wordCount,
    overall,
    verdict: verdictFor(overall, ui),
    subscores,
    sections: { email: !!emailLine, phone: !!phoneLine, ...present },
    missingSections: missing,
    lines: lines.map(({ id, raw: r, prefix, content, text: s, blank, isBullet, words, kind, section, headingKey, unusual, suggestedKey, suggestedHeading, findings, status }) => ({
      id, raw: r, prefix, content, text: s, blank, isBullet, words, kind, section,
      headingKey: headingKey || null, unusual: !!unusual, suggestedKey: suggestedKey || null,
      suggestedHeading: suggestedHeading || null, findings, status,
    })),
  };
}

function clamp(x) {
  return Math.max(0, Math.min(100, x));
}

export function verdictFor(score, ui = 'en') {
  if (score >= 85) return t(ui, 'verdict.85');
  if (score >= 70) return t(ui, 'verdict.70');
  if (score >= 50) return t(ui, 'verdict.50');
  return t(ui, 'verdict.0');
}
