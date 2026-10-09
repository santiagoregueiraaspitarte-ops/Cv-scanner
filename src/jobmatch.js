// Job description keyword matching, English and Spanish.
// Pure module: no DOM. Matching is case- and accent-insensitive, accepts simple plurals, and maps synonyms
// and translations (JS = JavaScript, K8s = Kubernetes, liderazgo = leadership, ...) to one canonical keyword.

import { t } from './i18n.js';

// [Canonical label, ...aliases]. Aliases match whole words; spaces/hyphens are interchangeable.
const TERMS = [
  // Software
  ['JavaScript', 'javascript', 'js', 'ecmascript', 'es6'],
  ['TypeScript', 'typescript', 'ts'],
  ['React', 'react', 'react.js', 'reactjs'],
  ['Node.js', 'node.js', 'nodejs', 'node'],
  ['Python', 'python'],
  ['Java', 'java'],
  ['C#', 'c#'],
  ['C++', 'c++'],
  ['Go', 'golang'],
  ['Ruby', 'ruby', 'ruby on rails', 'rails'],
  ['PHP', 'php'],
  ['HTML', 'html', 'html5'],
  ['CSS', 'css', 'css3'],
  ['SQL', 'sql'],
  ['PostgreSQL', 'postgresql', 'postgres', 'psql'],
  ['MySQL', 'mysql'],
  ['MongoDB', 'mongodb', 'mongo'],
  ['Redis', 'redis'],
  ['Kafka', 'kafka', 'apache kafka'],
  ['GraphQL', 'graphql'],
  ['REST APIs', 'rest api', 'restful api', 'restful'],
  ['Microservices', 'microservice'],
  ['Docker', 'docker'],
  ['Kubernetes', 'kubernetes', 'k8s'],
  ['AWS', 'aws', 'amazon web services'],
  ['GCP', 'gcp', 'google cloud', 'google cloud platform'],
  ['Azure', 'azure', 'microsoft azure'],
  ['Terraform', 'terraform'],
  ['Infrastructure as code', 'infrastructure as code', 'iac'],
  ['CI/CD', 'ci/cd', 'cicd', 'ci cd', 'continuous integration', 'continuous delivery', 'continuous deployment'],
  ['Git', 'git', 'github', 'gitlab'],
  ['Linux', 'linux'],
  ['Automated testing', 'automated testing', 'automated test', 'test automation', 'unit testing', 'unit test', 'integration test'],
  ['Software testing', 'software testing', 'quality assurance', 'qa testing', 'manual testing', 'qa', 'test case'],
  ['API testing', 'api testing'],
  ['Postman', 'postman'],
  ['SoapUI', 'soapui'],
  ['Oracle', 'oracle', 'oracle database', 'oracle sql'],
  ['System design', 'system design', 'systems design', 'distributed system'],
  ['Performance optimization', 'performance optimization', 'performance tuning', 'latency'],
  ['Agile', 'agile', 'scrum', 'kanban'],
  ['Code review', 'code review'],
  ['Mentoring', 'mentoring', 'mentor', 'mentored', 'mentorship', 'coaching'],
  ['Data modeling', 'data modeling', 'data modelling', 'data model', 'schema design'],
  ['Front-end', 'front-end', 'frontend'],
  ['Back-end', 'back-end', 'backend'],
  // Data
  ['Excel', 'excel', 'microsoft excel', 'spreadsheet'],
  ['Tableau', 'tableau'],
  ['Power BI', 'power bi', 'powerbi'],
  ['Looker', 'looker'],
  ['Data visualization', 'data visualization', 'data visualisation', 'data viz'],
  ['Dashboards', 'dashboard'],
  ['Statistics', 'statistics', 'statistical'],
  ['Regression', 'regression'],
  ['Hypothesis testing', 'hypothesis testing', 'hypothesis test', 'significance testing', 'statistical significance'],
  ['A/B testing', 'a/b testing', 'a/b test', 'ab testing', 'ab test', 'split testing', 'split test', 'a/b'],
  ['Machine learning', 'machine learning', 'ml'],
  ['pandas', 'pandas'],
  ['NumPy', 'numpy'],
  ['ETL', 'etl', 'elt', 'data pipeline'],
  ['Data warehouse', 'data warehouse', 'data warehousing'],
  ['BigQuery', 'bigquery'],
  ['Snowflake', 'snowflake'],
  ['dbt', 'dbt'],
  ['Airflow', 'airflow', 'apache airflow'],
  ['Spark', 'spark', 'apache spark', 'pyspark'],
  ['Data analysis', 'data analysis', 'data analytics', 'analyzing data', 'analysing data', 'analyze data'],
  ['Reporting', 'reporting'],
  ['Data cleaning', 'data cleaning', 'data cleansing', 'clean data', 'data wrangling'],
  // Marketing
  ['Product marketing', 'product marketing'],
  ['Go-to-market', 'go-to-market', 'gtm'],
  ['Positioning', 'positioning'],
  ['Messaging', 'messaging'],
  ['Product launches', 'product launch', 'launch plan'],
  ['Market research', 'market research'],
  ['Customer research', 'customer research', 'customer interview', 'user research', 'user interview'],
  ['Competitive analysis', 'competitive analysis', 'competitive intelligence', 'competitor analysis', 'battlecard'],
  ['Sales enablement', 'sales enablement', 'enablement'],
  ['Buyer personas', 'buyer persona'],
  ['Campaigns', 'campaign'],
  ['HubSpot', 'hubspot'],
  ['Salesforce', 'salesforce', 'sfdc'],
  ['CRM', 'crm'],
  ['SEO', 'seo', 'search engine optimization'],
  ['Content marketing', 'content marketing', 'content strategy'],
  ['Copywriting', 'copywriting', 'copywriter'],
  ['Storytelling', 'storytelling'],
  ['Email marketing', 'email marketing', 'email campaign'],
  ['Marketing analytics', 'marketing analytics', 'campaign analytics'],
  ['Pricing & packaging', 'pricing and packaging', 'pricing & packaging', 'pricing'],
  ['Pipeline growth', 'pipeline growth', 'pipeline generation', 'demand generation', 'demand gen'],
  ['Conversion optimization', 'conversion rate optimization', 'cro', 'conversion'],
  ['B2B', 'b2b'],
  ['SaaS', 'saas'],
  ['Google Analytics', 'google analytics', 'ga4'],
  // General
  ['Stakeholder management', 'stakeholder management', 'stakeholder'],
  ['Cross-functional collaboration', 'cross-functional', 'cross functional'],
  ['Project management', 'project management'],
  ['Customer success', 'customer success'],
  // Business, marketing and general (bilingual from the start)
  ['Leadership', 'leadership', 'team leadership', 'liderazgo', 'liderazgo de equipos', 'liderar', 'lideré', 'lideró',
    'liderando', 'líder'],
  ['Budget management', 'budget management', 'budgeting', 'gestión de presupuesto', 'gestión de presupuestos', 'manejo de presupuesto', 'manejo de presupuestos'],
  ['P&L', 'p&l', 'profit and loss', 'pérdidas y ganancias', 'estado de resultados'],
  ['Negotiation', 'negotiation', 'negotiating', 'negociación', 'negociaciones', 'negociar', 'negocié', 'negoció'],
  ['Brand management', 'brand management', 'brand strategy', 'gestión de marca', 'gestión de marcas', 'estrategia de marca'],
  ['Category management', 'category management', 'gestión de categorías', 'gestión de categoría'],
  ['Business development', 'business development', 'new business', 'desarrollo de negocios', 'desarrollo de nuevos negocios', 'nuevos negocios'],
  ['Key account management', 'key account management', 'key accounts', 'cuentas clave', 'grandes cuentas'],
  ['Forecasting', 'forecasting', 'pronósticos', 'proyecciones de ventas'],
  ['Supply chain', 'supply chain', 'cadena de suministro', 'cadena de abastecimiento'],
  ['Customer service', 'customer service', 'atención al cliente'],
  ['Sales strategy', 'sales strategy', 'estrategia comercial', 'estrategia de ventas'],
  ['FMCG', 'fmcg', 'cpg', 'consumer goods', 'consumo masivo'],
  ['ROI', 'roi', 'return on investment', 'retorno de la inversión', 'retorno de inversión'],
  ['KPIs', 'kpi', 'indicadores clave'],
  ['Digital marketing', 'digital marketing', 'marketing digital'],
  ['Advertising', 'advertising', 'publicidad'],
  ['Media planning', 'media planning', 'planificación de medios'],
  ['Consumer insights', 'consumer insights', 'insights del consumidor'],
  ['English', 'english', 'inglés'],
  ['Spanish', 'spanish', 'español'],
];

// Spanish synonyms for terms above, keyed by canonical label (merged in when patterns are built).
const ES_ALIASES = {
  'Data analysis': ['análisis de datos', 'analítica de datos', 'analizar datos'],
  'Data visualization': ['visualización de datos'],
  'Dashboards': ['tablero de control', 'tableros de control', 'panel de control'],
  'Statistics': ['estadística', 'estadísticas'],
  'Regression': ['regresión', 'regresiones'],
  'Hypothesis testing': ['prueba de hipótesis', 'pruebas de hipótesis'],
  'A/B testing': ['prueba a/b', 'pruebas a/b', 'test a/b'],
  'Machine learning': ['aprendizaje automático'],
  'Data cleaning': ['limpieza de datos'],
  'Data warehouse': ['almacén de datos'],
  'Reporting': ['reportes', 'informes de gestión', 'reportería'],
  'Excel': ['hoja de cálculo', 'hojas de cálculo'],
  'Automated testing': ['pruebas automatizadas', 'pruebas unitarias', 'testing automatizado'],
  'Software testing': ['pruebas de software', 'control de calidad', 'aseguramiento de calidad'],
  'API testing': ['pruebas de api'],
  'System design': ['diseño de sistemas'],
  'Data modeling': ['modelado de datos'],
  'Code review': ['revisión de código', 'revisiones de código'],
  'Mentoring': ['mentoría', 'mentorías'],
  'Agile': ['ágil', 'metodologías ágiles', 'metodología ágil'],
  'Infrastructure as code': ['infraestructura como código'],
  'Performance optimization': ['optimización de rendimiento', 'optimización del rendimiento'],
  'Market research': ['investigación de mercado', 'investigación de mercados', 'estudio de mercado', 'estudios de mercado'],
  'Customer research': ['investigación de clientes', 'entrevistas con clientes', 'investigación de usuarios'],
  'Competitive analysis': ['análisis competitivo', 'análisis de la competencia', 'análisis de competencia'],
  'Product launches': ['lanzamiento de producto', 'lanzamientos de producto', 'lanzamiento de productos', 'lanzamientos de productos'],
  'Campaigns': ['campaña'],
  'Positioning': ['posicionamiento'],
  'Messaging': ['mensajes clave'],
  'Go-to-market': ['salida al mercado'],
  'Sales enablement': ['habilitación de ventas'],
  'Content marketing': ['marketing de contenidos'],
  'Email marketing': ['mailing'],
  'Marketing analytics': ['analítica de marketing'],
  'Pricing & packaging': ['estrategia de precios', 'fijación de precios'],
  'Pipeline growth': ['generación de demanda', 'generación de oportunidades'],
  'Conversion optimization': ['optimización de conversión', 'tasa de conversión'],
  'Stakeholder management': ['gestión de stakeholders', 'partes interesadas'],
  'Cross-functional collaboration': ['interdisciplinario', 'multidisciplinario', 'equipos multifuncionales', 'interáreas'],
  'Project management': ['gestión de proyectos', 'dirección de proyectos'],
  'Customer success': ['éxito del cliente'],
  'Copywriting': ['redacción publicitaria', 'redacción creativa'],
};

// Spanish display labels (Spanish interface); anything not listed keeps its name (SQL, Power BI, …).
const ES_LABELS = {
  'data analysis': 'Análisis de datos', 'data visualization': 'Visualización de datos', dashboards: 'Tableros',
  statistics: 'Estadística', regression: 'Regresión', 'hypothesis testing': 'Pruebas de hipótesis', 'a/b testing': 'Pruebas A/B',
  'machine learning': 'Aprendizaje automático', 'data cleaning': 'Limpieza de datos', 'data warehouse': 'Almacén de datos',
  reporting: 'Reportes', 'automated testing': 'Pruebas automatizadas', 'software testing': 'Pruebas de software',
  'api testing': 'Pruebas de API', 'system design': 'Diseño de sistemas', 'data modeling': 'Modelado de datos',
  'code review': 'Revisión de código', mentoring: 'Mentoría', agile: 'Metodologías ágiles',
  'infrastructure as code': 'Infraestructura como código', 'performance optimization': 'Optimización de rendimiento',
  'market research': 'Investigación de mercado', 'customer research': 'Investigación de clientes',
  'competitive analysis': 'Análisis competitivo', 'product launches': 'Lanzamientos de producto', campaigns: 'Campañas',
  positioning: 'Posicionamiento', messaging: 'Mensajes clave', 'go-to-market': 'Salida al mercado',
  'sales enablement': 'Habilitación de ventas', 'content marketing': 'Marketing de contenidos',
  'marketing analytics': 'Analítica de marketing', 'pricing & packaging': 'Precios', 'pipeline growth': 'Generación de demanda',
  'conversion optimization': 'Optimización de conversión', 'stakeholder management': 'Gestión de stakeholders',
  'cross-functional collaboration': 'Colaboración interáreas', 'project management': 'Gestión de proyectos',
  'customer success': 'Éxito del cliente', copywriting: 'Redacción publicitaria', leadership: 'Liderazgo',
  'budget management': 'Gestión de presupuestos', negotiation: 'Negociación', 'brand management': 'Gestión de marca',
  'category management': 'Gestión de categorías', 'business development': 'Desarrollo de negocios',
  'key account management': 'Cuentas clave', forecasting: 'Pronósticos', 'supply chain': 'Cadena de suministro',
  'customer service': 'Atención al cliente', 'sales strategy': 'Estrategia comercial', fmcg: 'Consumo masivo',
  'digital marketing': 'Marketing digital', advertising: 'Publicidad', 'media planning': 'Planificación de medios',
  'consumer insights': 'Insights del consumidor', english: 'Inglés', spanish: 'Español', storytelling: 'Storytelling',
};

const labelFor = (term, lang) => (lang === 'es' && ES_LABELS[term.id]) || term.label;

// Strip accents but keep every character in place (same string length), so match positions found
// on the folded text line up with the original text.
const foldKeep = (s) => s.replace(/[^\x00-\x7f]/g, (ch) => {
  const f = ch.normalize('NFD').replace(/\p{M}+/gu, '');
  return f.length === 1 ? f : ch;
});

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Build one regex per alias: whole-word, accent-insensitive, spaces/hyphens interchangeable, optional plural "s"/"es".
function aliasPattern(alias) {
  const a = foldKeep(alias);
  let p = escapeRe(a).replace(/-/g, '[\\s-]?').replace(/ /g, '[\\s-]+');
  if (/[a-z]$/.test(a)) p += '(?:e?s)?';
  return `(?<![\\p{L}\\p{N}+#.])${p}(?![\\p{L}\\p{N}+#])`;
}

const COMPILED = TERMS.map(([label, ...aliases]) => {
  const all = [...aliases, ...(ES_ALIASES[label] || [])];
  return { id: label.toLowerCase(), label, aliases: all, re: new RegExp(all.map(aliasPattern).join('|'), 'giu') };
});

/** Map any keyword or synonym (English or Spanish, accents optional) to its canonical label, or null if unknown. */
export function normalizeKeyword(s) {
  const x = foldKeep(String(s || '').trim().toLowerCase());
  if (!x) return null;
  for (const term of COMPILED) {
    term.re.lastIndex = 0;
    const m = term.re.exec(x);
    if (m && m.index === 0 && m[0].length === x.length) return term.label;
  }
  return null;
}

function findTerms(text) {
  const found = new Map();
  for (const term of COMPILED) {
    term.re.lastIndex = 0;
    const starts = new Set();
    const spans = [];
    let m;
    while ((m = term.re.exec(text)) !== null) {
      if (!starts.has(m.index)) { starts.add(m.index); spans.push([m.index, m.index + m[0].length]); }
      if (m[0].length === 0) term.re.lastIndex++;
    }
    if (spans.length) found.set(term.id, { term, count: spans.length, first: Math.min(...starts), spans });
  }
  return found;
}

// ---------- Fallback: repeated domain words not in the dictionary ----------

const STOPWORDS = new Set(`about above across after again against also among an and another any are around as at
be because been before being below between both but by can could did do does doing down during each either else
etc even ever every few for from further get gets getting had has have having here how however if in into is it
its itself just less like more most much must need needs no nor not now of off on once only or other others our
ours out over own per plus rather really same should since so some such than that the their them then there these
they this those through to too under until up upon us very via was we well were what when where whether which while
who whom whose why will with within without would yet you your yours you'll you're we're we'll ourselves
able ability abilities year years experience experienced experiences work works working worked team teams role roles
strong solid excellent proven great good deep plus preferred required requirements requirement responsibilities
responsibility qualifications qualification skill skills knowledge understanding familiarity familiar comfortable
including include includes included new modern based level senior junior mid join joining looking hiring hire
company companies candidate candidates opportunity opportunities position positions day days week weeks month months
business businesses across environment environments world help helps helping make makes making take takes using use
used uses build builds building maintain maintaining design designs designing own owns run runs running plan plans
define drive drives driving improve improves improving write writes writing present presents analyze analyse
collaborate collaborating conduct measure measuring review reviewing deploy operate support supporting partner partners
ensure ensuring create creating develop developing deliver delivering manage managing lead leading related relevant
track record nice have bonus fictional professional fast paced high quality best practices key core great ideal
what'll you'd you've who'll many various multiple other within part parts across turn into well
engineer developer manager analyst specialist associate director lead intern software product platform data
service feature insight decision customer customers user users tool tools
para como pero sobre entre desde hasta hacia segun este esta estos estas esto ese esos esas aquel cual cuales donde
cuando quien quienes nuestro nuestra nuestros nuestras tambien ademas cada todo toda todos todas otro otra otros otras
mucho mucha muchos muchas puede pueden debe deben sera seran tener tiene tienen hacer realizar contar cuenta
equipo equipos experiencia experiencias anos empresa empresas trabajo trabajar buscamos busca buscando requisito
requisitos deseable deseables excluyente conocimiento conocimientos manejo nivel capacidad capacidades habilidad
habilidades responsabilidad responsabilidades tarea tareas puesto puestos posicion perfil candidato candidata persona
personas area areas traves mediante principal principales nuevo nueva nuevos nuevas alto alta buen buena buenas
buenos mejor mejores sumate unite ofrecemos beneficios modalidad hibrida remoto presencial jornada lunes viernes
importante clave fuerte solida orientado orientada orientacion vinculado vinculada relacionado relacionada
analista analistas gerente gerentes director directora directores jefe jefa ingeniero ingeniera desarrollador
desarrolladora especialista especialistas pasante datos dato producto productos servicio servicios usuario usuarios
herramienta herramientas decision decisiones resultado resultados proceso procesos negocio negocios`.split(/\s+/));

// Compare words without accents ("líder" = "lider").
const fold = (s) => s.normalize('NFD').replace(/\p{M}+/gu, '');

// Spanish derivational/verb endings, longest first. Stripped once, only if 4+ letters remain, so
// liderar/líder/líderes/liderazgo/lideró all become "lider" and gestionar/gestión become "gestion".
const ES_SUFFIXES = ['amientos', 'imientos', 'amiento', 'imiento', 'aciones', 'iciones', 'acion', 'icion', 'azgos', 'azgo',
  'ando', 'iendo', 'adas', 'ados', 'idas', 'idos', 'ada', 'ado', 'ida', 'ido', 'ar', 'er', 'ir'];

// Light, language-agnostic stemmer for the fallback keyword match. Both the job description and
// the resume go through the same function, so related forms land on the same stem.
function stemToken(w, accentedEnd) {
  // Spanish preterite/first-person endings carry the accent: lideré, lideró, gestioné -> stem.
  if (accentedEnd && w.length >= 5) return w.slice(0, -1);
  if (/ies$/.test(w) && w.length > 4) w = w.slice(0, -3) + 'y';
  else if (/(?:ses|xes|ches|shes)$/.test(w)) w = w.slice(0, -2);
  else if (/s$/.test(w) && !/(?:ss|us|is)$/.test(w)) w = w.slice(0, -1);
  for (const suf of ES_SUFFIXES) {
    if (w.endsWith(suf) && w.length - suf.length >= 4) { w = w.slice(0, -suf.length); break; }
  }
  // Plural "-es" after a consonant (líderes -> lidere -> lider).
  if (/[rnldz]e$/.test(w) && w.length >= 6) w = w.slice(0, -1);
  return w;
}

function tokenize(text) {
  const out = [];
  const re = /\p{L}[\p{L}'’-]{2,}/gu;
  let m;
  while ((m = re.exec(text)) !== null) {
    const raw = m[0].replace(/['’]s$/, '').replace(/^-+|-+$/g, '');
    const word = fold(raw);
    if (word.length < 4 || STOPWORDS.has(word)) continue;
    const stem = stemToken(word, /[áéíó]$/.test(raw));
    if (STOPWORDS.has(stem)) continue;
    out.push({ stem, raw, index: m.index });
  }
  return out;
}

function maskSpans(text, spans) {
  const chars = text.split('');
  for (const [a, b] of spans) for (let i = a; i < b; i++) chars[i] = ' ';
  return chars.join('');
}

const MAX_DOMAIN_WORDS = 5;

// ---------- Main entry ----------

export const LEVELS = ['High', 'Medium', 'Nice to have'];
// "Nice to have" markers (English and Spanish; matched on accent-folded text).
const NICE_RE = /nice[\s-]to[\s-]have|bonus points|\bbonus\b|preferred qualifications|\bpreferred\b|\bpluses\b|\ba plus\b|\bdeseables?\b|\bvalorables?\b|se valorara|no excluyentes?|\bes un plus\b|\bsuman\b/i;

const prep = (s) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').toLowerCase().normalize('NFC');

/** Match a resume against a job description. opts.ui: language of labels and messages ('en' | 'es'). */
export function matchJob(resumeText, jobText, opts = {}) {
  const ui = opts.ui === 'es' ? 'es' : 'en';
  const jd = prep(jobText);
  const resume = prep(resumeText);
  if (jd.split(/\s+/).filter(Boolean).length < 5) {
    return { ok: false, error: { code: 'missing_jd', message: t(ui, 'job.missing_jd') } };
  }
  // Accent-folded copies (same length) for dictionary matching; the original keeps accents for labels.
  const jdF = foldKeep(jd);

  const len = Math.max(1, jd.length);
  const niceMatch = jdF.match(NICE_RE);
  const niceStart = niceMatch ? niceMatch.index : Infinity;

  const jdTerms = findTerms(jdF);
  const resumeTerms = findTerms(foldKeep(resume));

  const keywords = [];
  for (const [id, info] of jdTerms) {
    keywords.push({ id, label: labelFor(info.term, ui), count: info.count, first: info.first, matched: resumeTerms.has(id), source: 'dictionary' });
  }

  // Repeated domain words in the JD that the dictionary doesn't cover.
  const masked = maskSpans(jd, [...jdTerms.values()].flatMap((x) => x.spans));
  const counts = new Map();
  for (const t of tokenize(masked)) {
    const c = counts.get(t.stem);
    // Label with the first spelling seen in the job description (keeps accents: "liderar").
    if (c) c.count++; else counts.set(t.stem, { stem: t.stem, label: t.raw, count: 1, first: t.index });
  }
  const resumeStems = new Set(tokenize(resume).map((t) => t.stem));
  const domain = [...counts.values()].filter((c) => c.count >= 2)
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, MAX_DOMAIN_WORDS);
  for (const d of domain) {
    keywords.push({ id: `word:${d.stem}`, label: d.label, count: d.count, first: d.first, matched: resumeStems.has(d.stem), source: 'jd-word' });
  }

  // Importance = frequency in the JD + up to 2 points for appearing early.
  // If the JD has a "Nice to have" part, terms first seen there are halved and bucketed as Nice to have,
  // and everything before it is at least Medium. Without such a marker, low importance means Nice to have.
  const hasNice = niceStart !== Infinity;
  for (const k of keywords) {
    let importance = k.count + 2 * (1 - k.first / len);
    const nice = k.first > niceStart;
    if (nice) importance *= 0.5;
    k.importance = Math.round(importance * 100) / 100;
    if (nice) k.level = 'Nice to have';
    else if (importance >= 2.6) k.level = 'High';
    else if (hasNice || importance >= 1.6) k.level = 'Medium';
    else k.level = 'Nice to have';
  }
  keywords.sort((a, b) => b.importance - a.importance || a.first - b.first || (a.label < b.label ? -1 : a.label > b.label ? 1 : 0));

  if (!keywords.length) {
    return { ok: true, percent: null, keywords: [], matched: [], missing: [], gaps: [],
      message: t(ui, 'job.noKeywords') };
  }

  // Match % = importance-weighted share of JD keywords found in the resume.
  const total = keywords.reduce((s, k) => s + k.importance, 0);
  const got = keywords.filter((k) => k.matched).reduce((s, k) => s + k.importance, 0);
  const strip = ({ first, ...rest }) => rest;
  const matched = keywords.filter((k) => k.matched).map(strip);
  const missing = keywords.filter((k) => !k.matched).map(strip);
  return {
    ok: true,
    percent: Math.round((got / total) * 100),
    keywords: keywords.map(strip),
    matched,
    missing,
    // Skills gap: missing keywords grouped by level, most important first.
    gaps: LEVELS.flatMap((lvl) => missing.filter((k) => k.level === lvl)),
  };
}

// ---------- Find jobs: role suggestions, skills and search links ----------

// Soft/process terms make poor job-search keywords; they're left out of the skills list.
const NOT_SEARCH_SKILLS = new Set(['stakeholder management', 'cross-functional collaboration', 'mentoring', 'code review',
  'project management', 'agile', 'storytelling', 'reporting', 'campaigns', 'messaging', 'positioning', 'leadership',
  'english', 'spanish', 'kpis', 'roi']);

/** Hard skills found in the resume, most mentioned first (ties: earliest first). opts.lang: label language. */
export function extractSkills(resumeText, opts = {}) {
  const found = findTerms(foldKeep(prep(resumeText)));
  return [...found.values()]
    .filter((x) => !NOT_SEARCH_SKILLS.has(x.term.id))
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .map((x) => labelFor(x.term, opts.lang));
}

// Role families, each defined by dictionary terms (canonical ids). A family is suggested when the
// resume mentions at least 3 of its terms; more hits rank higher, ties keep this table's order.
const ROLE_FAMILIES = [
  ['Data Analyst', ['sql', 'excel', 'power bi', 'tableau', 'looker', 'data analysis', 'dashboards', 'data visualization',
    'statistics', 'data cleaning', 'regression', 'hypothesis testing', 'a/b testing', 'pandas']],
  ['Business Intelligence Analyst', ['power bi', 'tableau', 'looker', 'dashboards', 'data warehouse', 'sql', 'excel', 'data visualization']],
  ['QA Analyst', ['software testing', 'automated testing', 'api testing', 'postman', 'soapui', 'sql', 'agile']],
  ['Software Engineer', ['javascript', 'typescript', 'python', 'java', 'c#', 'c++', 'go', 'node.js', 'react', 'rest apis',
    'git', 'system design', 'microservices', 'docker', 'kubernetes', 'ci/cd']],
  ['Front-end Developer', ['javascript', 'typescript', 'react', 'html', 'css', 'front-end', 'graphql']],
  ['Back-end Developer', ['node.js', 'java', 'python', 'go', 'c#', 'postgresql', 'mysql', 'mongodb', 'redis', 'rest apis', 'back-end', 'microservices']],
  ['Data Scientist', ['python', 'machine learning', 'statistics', 'regression', 'pandas', 'numpy', 'hypothesis testing', 'a/b testing']],
  ['Data Engineer', ['etl', 'airflow', 'spark', 'dbt', 'data warehouse', 'bigquery', 'snowflake', 'kafka', 'data modeling']],
  ['DevOps Engineer', ['docker', 'kubernetes', 'terraform', 'infrastructure as code', 'ci/cd', 'aws', 'gcp', 'azure', 'linux']],
  ['Product Marketing Manager', ['product marketing', 'go-to-market', 'positioning', 'messaging', 'product launches',
    'competitive analysis', 'sales enablement', 'buyer personas', 'market research']],
  ['Digital Marketing Specialist', ['seo', 'content marketing', 'email marketing', 'campaigns', 'google analytics',
    'copywriting', 'hubspot', 'conversion optimization', 'digital marketing']],
  ['Brand Manager', ['brand management', 'campaigns', 'market research', 'positioning', 'product launches',
    'category management', 'consumer insights', 'fmcg', 'advertising']],
  ['Marketing Director', ['brand management', 'digital marketing', 'budget management', 'p&l', 'leadership', 'campaigns',
    'advertising', 'media planning', 'marketing analytics']],
  ['Business Development Manager', ['business development', 'negotiation', 'key account management', 'sales strategy',
    'p&l', 'b2b', 'crm', 'salesforce']],
];

// Job titles as typically posted in Spanish-language job ads.
const ROLE_LABELS_ES = {
  'Data Analyst': 'Analista de datos', 'Business Intelligence Analyst': 'Analista de BI', 'QA Analyst': 'Analista QA',
  'Software Engineer': 'Desarrollador de software', 'Front-end Developer': 'Desarrollador front-end',
  'Back-end Developer': 'Desarrollador back-end', 'Data Scientist': 'Científico de datos', 'Data Engineer': 'Ingeniero de datos',
  'DevOps Engineer': 'Ingeniero DevOps', 'Product Marketing Manager': 'Product Marketing Manager',
  'Digital Marketing Specialist': 'Especialista en marketing digital', 'Brand Manager': 'Gerente de marca',
  'Marketing Director': 'Director de marketing', 'Business Development Manager': 'Gerente de desarrollo de negocios',
};

/** Up to 3 job titles that fit the skills in the resume. opts.lang: title language ('en' | 'es'). */
export function suggestRoles(resumeText, opts = {}) {
  const ids = new Set([...findTerms(foldKeep(prep(resumeText))).keys()]);
  return ROLE_FAMILIES
    .map(([label, terms], order) => ({ label, hits: terms.filter((id) => ids.has(id)).length, order }))
    .filter((r) => r.hits >= 3)
    .sort((a, b) => b.hits - a.hits || a.order - b.order)
    .slice(0, 3)
    .map((r) => (opts.lang === 'es' && ROLE_LABELS_ES[r.label]) || r.label);
}

// Search fields are short, visible, user-editable words. Strip anything that looks like contact
// details so a pasted email/phone/URL can never ride along in a link.
function cleanField(s, max) {
  return String(s == null ? '' : s)
    .replace(/\S+@\S+/g, ' ')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\+?\d[\d\s().-]{5,}\d/g, ' ')
    .replace(/[^\p{L}\p{N} +#./&,'’-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export const JOB_SITES = ['LinkedIn', 'Indeed', 'Google Jobs'];

/** Plain search links built only from the given role, skills (max 5) and location. */
export function jobSearchLinks({ role = '', skills = [], location = '' } = {}) {
  const r = cleanField(role, 60);
  const sk = (Array.isArray(skills) ? skills : []).map((s) => cleanField(s, 30)).filter(Boolean).slice(0, 5);
  const loc = cleanField(location, 60);
  const keywords = [r, ...sk].filter(Boolean).join(' ');
  if (!keywords) return { keywords: '', location: loc, links: [] };
  const qs = (o) => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();
  return {
    keywords,
    location: loc,
    links: [
      { site: 'LinkedIn', url: `https://www.linkedin.com/jobs/search/?${qs({ keywords, location: loc })}` },
      { site: 'Indeed', url: `https://www.indeed.com/jobs?${qs({ q: keywords, l: loc })}` },
      { site: 'Google Jobs', url: `https://www.google.com/search?${qs({ q: `${keywords} jobs${loc ? ` ${loc}` : ''}`, ibp: 'htl;jobs' })}` },
    ],
  };
}
