// ResumeLens tests. Run with: node tests/run.mjs
// Plain node:assert, no framework.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { analyzeResume } from '../src/analyzer.js';
import { buildTips, applyTips, projectScore } from '../src/tips.js';
import { matchJob, normalizeKeyword, suggestRoles, extractSkills, jobSearchLinks } from '../src/jobmatch.js';
import { SAMPLE_RESUMES, SAMPLE_JOBS } from '../src/samples.js';
import { pageToText } from '../src/parser.js';
import { STRINGS, detectLanguage } from '../src/i18n.js';

const STRONG = SAMPLE_RESUMES.strong.text;
const WEAK = SAMPLE_RESUMES.weak.text;
const JOBS = Object.values(SAMPLE_JOBS);

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// 1. Determinism
test('same input gives identical output across repeated runs', () => {
  for (const text of [STRONG, WEAK]) {
    const a = JSON.stringify(analyzeResume(text));
    const t = JSON.stringify(buildTips(analyzeResume(text), { targetRole: 'Software Engineer' }));
    for (let i = 0; i < 5; i++) {
      assert.equal(JSON.stringify(analyzeResume(text)), a);
      assert.equal(JSON.stringify(buildTips(analyzeResume(text), { targetRole: 'Software Engineer' })), t);
    }
    for (const job of JOBS) {
      const m = JSON.stringify(matchJob(text, job.text));
      for (let i = 0; i < 5; i++) assert.equal(JSON.stringify(matchJob(text, job.text)), m);
    }
  }
});

// 2. Strong vs weak
test('strong sample scores clearly higher than weak sample', () => {
  const s = analyzeResume(STRONG);
  const w = analyzeResume(WEAK);
  assert.ok(s.ok && w.ok);
  console.log(`      strong=${s.overall} weak=${w.overall}`);
  assert.ok(s.overall - w.overall >= 30, `expected a gap of 30+, got ${s.overall} vs ${w.overall}`);
  for (const sub of s.subscores) {
    const ws = w.subscores.find((x) => x.key === sub.key);
    assert.ok(sub.score >= ws.score, `${sub.key}: strong ${sub.score} < weak ${ws.score}`);
  }
});

// 3. Synonyms
test('synonym matching (JS/JavaScript, K8s/Kubernetes, and more)', () => {
  assert.equal(normalizeKeyword('JS'), 'JavaScript');
  assert.equal(normalizeKeyword('javascript'), 'JavaScript');
  assert.equal(normalizeKeyword('K8s'), 'Kubernetes');
  assert.equal(normalizeKeyword('TS'), 'TypeScript');
  assert.equal(normalizeKeyword('Postgres'), 'PostgreSQL');
  assert.equal(normalizeKeyword('ML'), 'Machine learning');
  assert.equal(normalizeKeyword('A/B'), 'A/B testing');
  assert.equal(normalizeKeyword('ab testing'), 'A/B testing');
  assert.equal(normalizeKeyword('GTM'), 'Go-to-market');
  assert.equal(normalizeKeyword('PowerBI'), 'Power BI');
  assert.equal(normalizeKeyword('dashboards'), 'Dashboards'); // plural stemming

  const resume = 'Built front-end apps in JS and deployed them on K8s with Postgres.';
  const jd = 'We need strong JavaScript skills, Kubernetes experience and PostgreSQL knowledge for this role.';
  const r = matchJob(resume, jd);
  const matched = r.matched.map((k) => k.label);
  for (const want of ['JavaScript', 'Kubernetes', 'PostgreSQL']) assert.ok(matched.includes(want), `missing ${want}: ${matched}`);

  // And the other direction.
  const r2 = matchJob('Expert in JavaScript and Kubernetes operations.', 'Looking for an engineer with JS and K8s for our platform.');
  assert.deepEqual(r2.matched.map((k) => k.label).sort(), ['JavaScript', 'Kubernetes']);

  // No false positives: Java must not match JavaScript, SQL must not match inside PostgreSQL.
  const r3 = matchJob('Wrote JavaScript and PostgreSQL code.', 'Strong Java and SQL skills are required here.');
  assert.deepEqual(r3.matched, []);
});

// 4. Applying tips raises the score
test('applying all tips to the weak sample raises its score', () => {
  const a = analyzeResume(WEAK);
  const tips = buildTips(a);
  assert.ok(tips.length >= 5, `expected several tips, got ${tips.length}`);
  for (let i = 1; i < tips.length; i++) assert.ok(tips[i - 1].points >= tips[i].points, 'tips not ordered by points');
  const p = projectScore(a, tips, tips.map((t) => t.id));
  console.log(`      weak ${a.overall} -> ${p.overall} after ${tips.length} tips`);
  assert.ok(p.analysis.ok);
  assert.ok(p.overall > a.overall + 20, `expected a clear gain, got ${a.overall} -> ${p.overall}`);
  // Toggle order must not matter.
  const reversed = applyTips(a, [...tips].reverse());
  assert.equal(reversed, p.text);
});

// 5. No personal characteristics
const PERSONAL_RE = /\b(?:age|aged|years old|birth|born|gender|sex|male|female|photo|photograph|headshot|picture|nationality|citizenship|ethnicity|race|religion|religious|marital|married|single|pregnan\w*|disabilit\w*|name|looks|appearance)\b/i;

function generatedStrings(analysis, tips, match) {
  const out = [analysis.verdict];
  for (const s of analysis.subscores) out.push(s.label, s.explanation);
  for (const l of analysis.lines) for (const f of l.findings) out.push(f.message);
  for (const t of tips) out.push(t.title, t.description);
  if (match && match.error) out.push(match.error.message);
  if (match && match.message) out.push(match.message);
  return out;
}

test('no analyzer output mentions personal characteristics', () => {
  const personal = STRONG.replace('linkedin.com/in/avery-quill-example',
    'linkedin.com/in/avery-quill-example\nDate of birth: 01/01/1990 · Nationality: Examplian\nGender: Female · Marital status: Married');
  for (const text of [STRONG, WEAK, personal]) {
    const a = analyzeResume(text);
    const tips = buildTips(a);
    const m = matchJob(text, SAMPLE_JOBS.softwareEngineer.text);
    for (const s of generatedStrings(a, tips, m)) assert.ok(!PERSONAL_RE.test(s), `personal term in output: "${s}"`);
    // Nothing in the result object is keyed on a personal attribute.
    assert.ok(!/"(?:age|gender|nationality|photo|name|dob|birth)"\s*:/i.test(JSON.stringify(a)));
  }
  // Personal lines get no findings at all, and adding them does not change any sub-score except length.
  const a = analyzeResume(personal);
  for (const l of a.lines.filter((x) => /birth|gender/i.test(x.text))) assert.deepEqual(l.findings, []);
  const base = analyzeResume(STRONG);
  for (const key of ['structure', 'impact', 'verbs', 'ats']) {
    assert.equal(a.subscores.find((s) => s.key === key).score, base.subscores.find((s) => s.key === key).score, key);
  }
});

// Extra checks
test('error states: empty and too-short text, missing job description', () => {
  assert.equal(analyzeResume('').error.code, 'empty');
  assert.equal(analyzeResume('   \n  ').error.code, 'empty');
  assert.equal(analyzeResume('Short resume with just a few words.').error.code, 'too_short');
  assert.equal(matchJob(STRONG, '').error.code, 'missing_jd');
});

test('job match: strong sample matches the software JD well, gaps sorted by level', () => {
  const r = matchJob(STRONG, SAMPLE_JOBS.softwareEngineer.text);
  console.log(`      SWE match ${r.percent}% · missing: ${r.missing.map((k) => `${k.label} (${k.level})`).join(', ')}`);
  assert.ok(r.percent >= 60);
  const order = { High: 0, Medium: 1, 'Nice to have': 2 };
  for (let i = 1; i < r.gaps.length; i++) assert.ok(order[r.gaps[i - 1].level] <= order[r.gaps[i].level]);
  for (const job of JOBS) {
    const x = matchJob(WEAK, job.text);
    console.log(`      weak vs ${job.label.en}: ${x.percent}% · keywords: ${x.keywords.map((k) => k.label).join(', ')}`);
  }
});

test('rewrite templates produce sensible verbs and splits', () => {
  const tips = buildTips(analyzeResume(WEAK));
  const rewrites = Object.fromEntries(tips.flatMap((t) => t.items.map((it) => [`${t.type}:${it.original}`, it.rewrite])));
  assert.equal(rewrites['verbs:- Was involved in testing.'], '- Tested.');
  assert.equal(rewrites['verbs:- Responsible for working on the website.'], '- Developed the website.');
  assert.equal(rewrites['verbs:- Handled emails from customers.'], '- Managed emails from customers.');
  const long = tips.find((t) => t.type === 'long').items[0].rewrite.split('\n');
  for (const part of long) assert.ok(part.split(/\s+/).length - 1 <= 28, part);
  const { text } = projectScore(analyzeResume(WEAK), tips, tips.map((t) => t.id));
  assert.ok(!/^- (?:When|That|Which|While|Where)\b/m.test(text), 'split produced a dangling clause');
});

test('subscore weights sum to 1 and overall equals the breakdown total', () => {
  for (const text of [STRONG, WEAK]) {
    const a = analyzeResume(text);
    assert.equal(Math.round(a.subscores.reduce((s, x) => s + x.weight, 0) * 100), 100);
    assert.equal(a.overall, Math.round(a.subscores.reduce((s, x) => s + x.points, 0)));
  }
});

test('PDF line rebuild: column gaps become wide spacing, word spaces stay single', () => {
  // Shaped like pdf.js getTextContent() output at 10pt, including the whitespace-only item
  // pdf.js inserts across a column gap.
  const item = (str, x, y, w) => ({ str, transform: [10, 0, 0, 10, x, y], width: w });
  const text = pageToText([
    item('Pat Lee', 50, 780, 36),
    item('SKILLS', 50, 735, 33.9), item(' ', 83.9, 735, 246.1), item('LANGUAGES', 330, 735, 62.2),
    item('Built 5', 50, 720, 30), item(' ', 80, 720, 2.8), item('dashboards', 82.8, 720, 50),
  ]);
  assert.equal(text, 'Pat Lee\n\nSKILLS   LANGUAGES\nBuilt 5 dashboards');
});

test('PDF line rebuild: wrapped bullets are joined back into one line', () => {
  // Bullet glyph as its own item (x=39.6), text at x=57.6; the wrap starts at x=57.6 on the next line.
  const item = (str, x, y, w, size = 11.88) => ({ str, transform: [size, 0, 0, size, x, y], width: w });
  const text = pageToText([
    item('•', 39.6, 529.4, 4.6, 10.08), item(' ', 44.3, 529.4, 13.4, 10.08), item('Delivered tutoring in SQL, data analysis, and', 57.6, 529.4, 400),
    item('programming for 30 students', 57.6, 515.7, 150),
    item('•', 39.6, 502.1, 4.6, 10.08), item('Built a problem-', 57.6, 502.1, 90), item('solving guide', 57.6, 488.4, 70),
    item('•', 39.6, 474.3, 4.6, 10.08), item('Cut report time by 20%', 57.6, 474.3, 120),
    item('Analyst, Foo Co | Jan 2024 – May 2025', 21.6, 445.2, 200, 13.68),
    item('• Same-item bullet that wraps onto', 39.6, 420, 180), item('a second line', 50.5, 406.3, 60),
  ]);
  assert.deepEqual(text.split('\n'), [
    '• Delivered tutoring in SQL, data analysis, and programming for 30 students',
    '• Built a problem-solving guide',
    '• Cut report time by 20%',
    '',
    'Analyst, Foo Co | Jan 2024 – May 2025',
    '• Same-item bullet that wraps onto a second line',
  ]);
});

test('headings: role titles followed by dates are not "unusual headings"; athletic sections are recognized', () => {
  const text = `Pat Lee
pat.lee@example.com | (555) 010-1234

PROFESSIONAL SUMMARY
Analyst with 3 years of experience building reports and dashboards for 12 teams across the business.

PROFESSIONAL EXPERIENCE
Data Analyst | Foo Co
Jan 2024 – May 2025
- Built 8 dashboards that cut reporting time by 30%.

Case Competition Participant
Bar University | Apr 2025
- Presented a pricing model to a panel of 6 judges.

EDUCATION
B.A. Economics, Bar University — 2025

SKILLS
SQL, Python, Excel
LEADERSHIP & ATHLETIC ACHIEVEMENTS
Bar University
Varsity athlete | Jan 2022 – May 2025
- Captained a team of 25 to a conference title.`;
  const a = analyzeResume(text);
  const unusual = a.lines.filter((l) => l.unusual).map((l) => l.text);
  assert.deepEqual(unusual, []);
  const ath = a.lines.find((l) => l.text === 'LEADERSHIP & ATHLETIC ACHIEVEMENTS');
  assert.equal(ath.kind, 'heading');
  assert.equal(a.subscores.find((s) => s.key === 'ats').score, 100);
});

test('ATS: pipe separators in a line are fine; only real table rows are flagged', () => {
  const base = `Pat Lee
pat.lee@example.com | (555) 010-1234

SUMMARY
Business director with 12 years of experience growing agency accounts across 3 countries and 40 clients.

EXPERIENCE
Commercial Director | Foo Agency, Buenos Aires | 07/ 2026 – Present
- Grew annual revenue by 25% across 14 accounts.
Business Director | Bar Group, Chile | 03/ 2018 – 06/ 2020
- Led a team of 12 that won 6 new clients.

EDUCATION
I.G.C.S.E. University of Cambridge | First Language | 2001

SKILLS
Negotiation, P&L management, Account strategy`;
  const a = analyzeResume(base);
  const codes = (x) => x.lines.flatMap((l) => l.findings.map((f) => f.code));
  assert.ok(!codes(a).includes('ats-pipes'), 'separator pipes were flagged');
  const table = analyzeResume(base.replace('Negotiation, P&L management, Account strategy',
    '| Skill | Level |\n|---|---|\n| Negotiation | Expert |'));
  assert.equal(codes(table).filter((c) => c === 'ats-pipes').length, 3);
});

test('action verbs: lead-in labels are skipped and irregular/present-tense verbs count', () => {
  const a = analyzeResume(`Pat Lee
pat.lee@example.com | (555) 010-1234

EXPERIENCE
Business Director | Foo Agency | 03/ 2018 – Present
- Key Achievement: Increased revenue by +60% (USD 100,000) through new positioning.
- Oversaw regional B2B marketing for 4 clients across 3 countries.
- Advise 12 executives on marketing and communication plans.
- Achievement: Responsible for the main account.

EDUCATION
B.A. Marketing, Bar Institute — 2010

SKILLS
Brand strategy, P&L, Power BI`);
  const verbFinding = (start) => a.lines.find((l) => l.text.startsWith(start)).findings.find((f) => f.category === 'verbs').code;
  assert.equal(verbFinding('Key Achievement'), 'action-verb');
  assert.equal(verbFinding('Oversaw'), 'action-verb');
  assert.equal(verbFinding('Advise'), 'action-verb');
  assert.equal(verbFinding('Achievement: Responsible'), 'weak-verb'); // weak phrasing is still caught behind a label
});

test('job match: accents and Spanish word forms match (liderar = líder, gestionar = gestión)', () => {
  const jd = 'Buscamos un Director Comercial para liderar equipos de ventas. Deberá liderar la estrategia de marca, ' +
    'gestionar presupuestos y asegurar la gestión de cuentas clave. Experiencia en planificación comercial y en ' +
    'planificar campañas. Se valorará experiencia en negociación y negociar con proveedores.';
  const cv = 'Líder de cuentas regionales. Lideré equipos de 12 personas y gestioné presupuestos de USD 2M. ' +
    'Planificación anual de marca.';
  const r = matchJob(cv, jd, { ui: 'es' });
  const byLabel = Object.fromEntries(r.keywords.map((k) => [k.label, k.matched]));
  assert.equal(byLabel.Liderazgo, true, JSON.stringify(byLabel)); // liderar (aviso) = líder / lideré (CV)
  assert.equal(byLabel.gestionar, true, JSON.stringify(byLabel)); // fallback stemming: gestionar = gestioné
  assert.equal(byLabel['planificación'], true, JSON.stringify(byLabel));
  assert.equal(byLabel['Negociación'], false, JSON.stringify(byLabel)); // genuinely missing stays missing
  for (const k of r.keywords) assert.ok(!['buscamos', 'experiencia', 'equipos', 'deberá'].includes(k.label), `filler word as keyword: ${k.label}`);
});

test('find jobs: role suggestions and skills come from the CV, deterministically', () => {
  assert.equal(suggestRoles(STRONG)[0], 'Software Engineer');
  const cv = 'Data analyst intern. Wrote SQL queries on Oracle, built Power BI dashboards and Excel reports, ran regression ' +
    'and data cleaning. Software testing intern: API testing with Postman and SoapUI, unit testing in an Agile team.';
  const roles = suggestRoles(cv);
  assert.ok(roles.includes('Data Analyst') && roles.includes('QA Analyst'), roles.join(', '));
  const skills = extractSkills(cv);
  for (const s of ['SQL', 'Power BI', 'Postman', 'SoapUI']) assert.ok(skills.includes(s), `${s} missing: ${skills}`);
  assert.ok(!skills.includes('Agile'), 'soft/process terms are not search skills');
  assert.deepEqual(suggestRoles('Hard working person who likes learning new things every single day at work.'), []);
  for (let i = 0; i < 3; i++) {
    assert.deepEqual(suggestRoles(cv), roles);
    assert.deepEqual(extractSkills(cv), skills);
  }
});

test('find jobs: links carry only the visible role, skills and location', () => {
  const s = jobSearchLinks({ role: 'Data Analyst', skills: ['SQL', 'Power BI'], location: 'Remote' });
  assert.equal(s.keywords, 'Data Analyst SQL Power BI');
  assert.deepEqual(s.links.map((l) => l.site), ['LinkedIn', 'Indeed', 'Google Jobs']);
  for (const l of s.links) {
    const u = new URL(l.url);
    assert.equal(u.protocol, 'https:');
    const values = [...u.searchParams.values()].join(' ');
    assert.ok(values.includes('Data Analyst SQL Power BI') && values.includes('Remote'), values);
  }
  // Contact details typed or pasted into the fields never reach a link.
  const leaky = jobSearchLinks({ role: 'Analyst pat@example.com +54 911 3031 1800', skills: ['SQL', 'https://linkedin.com/in/pat'], location: 'Remote' });
  for (const l of leaky.links) assert.ok(!/@|example\.com|3031|linkedin\.com\/in/.test(decodeURIComponent(l.url)), l.url);
  assert.equal(leaky.keywords, 'Analyst SQL');
  // At most 5 skills; nothing to search gives no links.
  assert.equal(jobSearchLinks({ skills: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }).keywords, 'A B C D E');
  assert.deepEqual(jobSearchLinks({ role: '  ', skills: [] }).links, []);
});

// ---------- Spanish / bilingual ----------

const STRONG_ES = SAMPLE_RESUMES.strongEs.text;
const WEAK_ES = SAMPLE_RESUMES.weakEs.text;

test('language: CVs are detected as English or Spanish, and the choice can be overridden', () => {
  assert.equal(detectLanguage(STRONG), 'en');
  assert.equal(detectLanguage(WEAK), 'en');
  assert.equal(detectLanguage(STRONG_ES), 'es');
  assert.equal(detectLanguage(WEAK_ES), 'es');
  const auto = analyzeResume(STRONG_ES);
  assert.equal(auto.lang, 'es'); assert.equal(auto.langAuto, true);
  const forced = analyzeResume(STRONG_ES, { lang: 'en' });
  assert.equal(forced.lang, 'en'); assert.equal(forced.langAuto, false);
});

test('Spanish: deterministic in both interface languages', () => {
  for (const text of [STRONG_ES, WEAK_ES]) {
    for (const ui of ['en', 'es']) {
      const a = JSON.stringify(analyzeResume(text, { ui }));
      const tp = JSON.stringify(buildTips(analyzeResume(text, { ui }), { targetRole: 'Analista de datos' }));
      const m = JSON.stringify(matchJob(text, SAMPLE_JOBS.analistaDatos.text, { ui }));
      for (let i = 0; i < 3; i++) {
        assert.equal(JSON.stringify(analyzeResume(text, { ui })), a);
        assert.equal(JSON.stringify(buildTips(analyzeResume(text, { ui }), { targetRole: 'Analista de datos' })), tp);
        assert.equal(JSON.stringify(matchJob(text, SAMPLE_JOBS.analistaDatos.text, { ui })), m);
      }
    }
  }
  // The interface language changes wording only, never scores.
  for (const text of [STRONG, WEAK, STRONG_ES, WEAK_ES]) {
    const en = analyzeResume(text, { ui: 'en' });
    const es = analyzeResume(text, { ui: 'es' });
    assert.deepEqual(en.subscores.map((s) => s.score), es.subscores.map((s) => s.score));
  }
});

test('Spanish: strong sample scores clearly higher than weak sample, with Spanish headings recognized', () => {
  const s = analyzeResume(STRONG_ES, { ui: 'es' });
  const w = analyzeResume(WEAK_ES, { ui: 'es' });
  console.log(`      strongEs=${s.overall} weakEs=${w.overall}`);
  assert.ok(s.overall - w.overall >= 30, `${s.overall} vs ${w.overall}`);
  assert.deepEqual(s.missingSections, []); // RESUMEN PROFESIONAL, EXPERIENCIA LABORAL, EDUCACIÓN, HABILIDADES
  for (const sub of s.subscores) assert.ok(sub.score >= w.subscores.find((x) => x.key === sub.key).score, sub.key);
  assert.ok(/secciones/.test(s.subscores[0].explanation), 'explanations are in Spanish');
});

test('Spanish: applying all tips raises the weak sample, with natural Spanish rewrites', () => {
  const a = analyzeResume(WEAK_ES, { ui: 'es' });
  const tips = buildTips(a);
  const p = projectScore(a, tips, tips.map((x) => x.id));
  console.log(`      weakEs ${a.overall} -> ${p.overall} after ${tips.length} tips`);
  assert.ok(p.overall > a.overall + 20);
  assert.equal(applyTips(a, [...tips].reverse()), p.text);
  const rw = Object.fromEntries(tips.flatMap((x) => x.items.map((it) => [`${x.type}:${it.original}`, it.rewrite])));
  assert.equal(rw['verbs:- Responsable de atender clientes en el local.'], '- Atendí clientes en el local.');
  assert.equal(rw['verbs:- Ayudé al encargado.'], '- Contribuí al encargado.');
  assert.equal(rw['verbs:- Trabajé con proveedores.'], '- Colaboré con proveedores.');
  assert.ok(rw['dates:Vendedor en Comercial del Sur'].endsWith('[Mes AAAA] – [Mes AAAA]'));
  assert.ok(rw['metrics:- Participé en reuniones.'].includes('[métrica]'));
  assert.equal(rw['headings:Mi Historia'], 'Resumen');
  for (const x of tips) assert.ok(!/\b(?:Add|Replace|Remove)\b/.test(x.title), `tip title not translated: ${x.title}`);
});

test('Spanish: no output mentions personal characteristics', () => {
  const PERSONAL_ES = /(?<!\p{L})(?:edad|nacimiento|nacid[oa]|g[eé]nero|sexo|masculino|femenino|foto|fotograf[ií]a|nacionalidad|ciudadan[ií]a|etnia|raza|religi[oó]n|religios[oa]|estado civil|casad[oa]|solter[oa]|embarazo|discapacidad|nombre|apariencia)(?!\p{L})/iu;
  const personal = STRONG_ES.replace('linkedin.com/in/lucia-ferraro-ejemplo',
    'linkedin.com/in/lucia-ferraro-ejemplo\nFecha de nacimiento: 01/01/1990 · Nacionalidad: Ejemplana\nEstado civil: Casada · Género: Femenino');
  for (const text of [STRONG_ES, WEAK_ES, personal]) {
    const a = analyzeResume(text, { ui: 'es' });
    const tips = buildTips(a);
    const m = matchJob(text, SAMPLE_JOBS.analistaDatos.text, { ui: 'es' });
    for (const s of generatedStrings(a, tips, m)) assert.ok(!PERSONAL_ES.test(s), `personal term in output: "${s}"`);
  }
  const a = analyzeResume(personal, { ui: 'es' });
  for (const l of a.lines.filter((x) => /nacimiento|civil/i.test(x.text))) assert.deepEqual(l.findings, []);
  const base = analyzeResume(STRONG_ES);
  for (const key of ['structure', 'impact', 'verbs', 'ats']) {
    assert.equal(a.subscores.find((s) => s.key === key).score, base.subscores.find((s) => s.key === key).score, key);
  }
});

test('bilingual matching: Spanish job ads match English CVs and vice versa', () => {
  const r = matchJob('Led a team of 8. Leadership of budget management and negotiation with agencies. Brand strategy.',
    'Buscamos liderazgo de equipos, gestión de presupuestos, negociación con agencias y estrategia de marca.', { ui: 'en' });
  const got = r.matched.map((k) => k.label).sort();
  for (const want of ['Brand management', 'Budget management', 'Leadership', 'Negotiation']) assert.ok(got.includes(want), `${want}: ${got}`);
  const r2 = matchJob(STRONG_ES, SAMPLE_JOBS.dataAnalyst.text, { ui: 'es' });
  assert.ok(r2.percent >= 60, `Spanish CV vs English data JD: ${r2.percent}%`);
  assert.ok(r2.matched.some((k) => k.label === 'Análisis de datos'), 'Spanish labels in a Spanish interface');
  assert.equal(normalizeKeyword('análisis de datos'), 'Data analysis');
  assert.equal(normalizeKeyword('Analisis de Datos'), 'Data analysis'); // accents optional
  assert.deepEqual(suggestRoles(STRONG_ES, { lang: 'es' }).slice(0, 1), ['Analista de datos']);
  assert.ok(!extractSkills(STRONG_ES).includes('Buyer personas'), '"personas" is not a skill');
});

test('i18n: English and Spanish have the same keys, and every key used in code exists', () => {
  const en = Object.keys(STRINGS.en).sort();
  const es = Object.keys(STRINGS.es).sort();
  assert.deepEqual(en.filter((k) => !es.includes(k)), [], 'missing in Spanish');
  assert.deepEqual(es.filter((k) => !en.includes(k)), [], 'missing in English');
  for (const f of ['ui.js', 'main.js', 'analyzer.js', 'tips.js', 'jobmatch.js']) {
    const src = readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), 'utf8');
    const used = [...src.matchAll(/\bT\('([\w.]+)'|\bt\([^,()]+, '([\w.]+)'/g)].map((m) => m[1] || m[2]);
    for (const k of used) assert.ok(k in STRINGS.en, `${f}: unknown string key "${k}"`);
  }
  for (const code of ['unsupported', 'legacy_doc', 'too_large', 'corrupt_pdf', 'corrupt_docx', 'corrupt_txt', 'password_pdf',
    'password_docx', 'no_text', 'empty', 'read_failed', 'lib_missing']) assert.ok(`parse.${code}` in STRINGS.es, code);
});

test('pure modules do not touch the DOM, storage, network, randomness or the clock', () => {
  for (const f of ['analyzer.js', 'tips.js', 'jobmatch.js', 'samples.js', 'i18n.js']) {
    const src = readFileSync(fileURLToPath(new URL(`../src/${f}`, import.meta.url)), 'utf8');
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const banned = /\b(?:window|document|localStorage|sessionStorage|navigator)\s*[.[]|\bfetch\s*\(|XMLHttpRequest|Math\.random|Date\.now|new Date\b/;
    assert.ok(!banned.test(code), `${f}: ${(code.match(banned) || [])[0]}`);
  }
});

// ---------- runner ----------
let failed = 0;
for (const [name, fn] of tests) {
  try { fn(); console.log(`  ✓ ${name}`); }
  catch (e) { failed++; console.log(`  ✗ ${name}\n      ${e.message.split('\n').join('\n      ')}`); }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exitCode = failed ? 1 : 0;
