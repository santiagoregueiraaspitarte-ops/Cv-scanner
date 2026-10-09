// On-device persistence. localStorage only, every access wrapped in try/catch.
// If storage is blocked or full, values live in memory for this tab so the app keeps working.

const PREFIX = 'resumelens:';
const memory = new Map();

export const storage = {
  get(key, fallback = null) {
    // The memory copy is always the newest value this tab wrote (even when localStorage was full),
    // so it wins. Return a copy so callers can't mutate the cache.
    if (memory.has(key)) return JSON.parse(JSON.stringify(memory.get(key)));
    try {
      const raw = window.localStorage.getItem(PREFIX + key);
      if (raw !== null) return JSON.parse(raw);
    } catch { /* blocked or corrupt */ }
    return fallback;
  },
  set(key, value) {
    memory.set(key, value);
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false; // quota exceeded or storage disabled; memory copy still works
    }
  },
  remove(key) {
    memory.delete(key);
    try { window.localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  },
};

// ---------- History of analyses ----------
// Each entry keeps the inputs (so the report can be rebuilt exactly) plus a score snapshot for the list.

const HISTORY_KEY = 'history';
const MAX_ENTRIES = 25;

function isEntry(e) {
  return e && typeof e === 'object' && typeof e.id === 'string' && Number.isFinite(e.seq)
    && typeof e.resumeText === 'string' && typeof e.jobText === 'string' && Number.isFinite(e.overall);
}

// Stored data is untrusted (it may be edited or from an older version): coerce every field to its expected type.
function normalize(e) {
  const str = (v) => (typeof v === 'string' ? v : '');
  const num = (v) => (Number.isFinite(v) ? v : null);
  return {
    id: e.id, seq: e.seq, savedAt: str(e.savedAt), sourceName: str(e.sourceName).slice(0, 120),
    targetRole: str(e.targetRole).slice(0, 60), resumeText: e.resumeText, jobText: e.jobText,
    cvLang: e.cvLang === 'en' || e.cvLang === 'es' ? e.cvLang : 'auto',
    overall: e.overall, matchPercent: num(e.matchPercent),
  };
}

function load() {
  const raw = storage.get(HISTORY_KEY, []);
  const list = Array.isArray(raw) ? raw.filter(isEntry).map(normalize) : [];
  // Newest first; seq is unique, so the order is fully determined.
  return list.sort((a, b) => b.seq - a.seq);
}

function save(list) {
  // If storage is full, drop the oldest entries until it fits (the memory copy keeps everything for this tab).
  let trimmed = list.slice(0, MAX_ENTRIES);
  while (!storage.set(HISTORY_KEY, trimmed) && trimmed.length > 1) trimmed = trimmed.slice(0, -1);
  memory.set(HISTORY_KEY, list.slice(0, MAX_ENTRIES));
}

export const history = {
  list: load,

  get(id) {
    return load().find((e) => e.id === id) || null;
  },

  /** Record an analysis. Re-analyzing identical inputs refreshes the existing entry instead of duplicating it. */
  add({ resumeText, jobText, targetRole, sourceName, cvLang = 'auto' }, analysis, match) {
    const list = load();
    const seq = list.reduce((m, e) => Math.max(m, e.seq), 0) + 1;
    const same = (e) => e.resumeText === resumeText && e.jobText === jobText && e.targetRole === targetRole && e.cvLang === cvLang;
    const prev = list.find(same);
    const entry = {
      id: prev ? prev.id : `h${seq}`,
      seq,
      savedAt: new Date().toISOString(), // display only; never used in scoring
      sourceName: sourceName || (prev && prev.sourceName) || '',
      targetRole,
      resumeText,
      jobText,
      cvLang,
      overall: analysis.overall,
      matchPercent: match && match.ok && match.percent != null ? match.percent : null,
    };
    save([entry, ...list.filter((e) => !same(e))]);
    return entry;
  },

  remove(id) {
    save(load().filter((e) => e.id !== id));
  },

  clear() {
    storage.remove(HISTORY_KEY);
  },
};
