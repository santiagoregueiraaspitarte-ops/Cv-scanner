// Reads resume files entirely in the browser. Nothing is uploaded.
// PDF via vendored pdf.js, DOCX via vendored mammoth, TXT via TextDecoder.
// Libraries are loaded lazily on first use so the initial page stays light.

import { countWords } from './analyzer.js';

const MAX_BYTES = 10 * 1024 * 1024;

export class ParseError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ParseError';
    this.code = code;
  }
}

const MESSAGES = {
  unsupported: "That file type isn't supported. Use a PDF, DOCX or TXT file, or paste the text below.",
  legacy_doc: "Older .doc files can't be read here. Save it as .docx or PDF, or paste the text below.",
  too_large: 'That file is larger than 10 MB. Try a smaller export, or paste the text below.',
  corrupt_pdf: "We couldn't read that PDF. It may be damaged or not a real PDF. Try exporting it again, or paste the text below.",
  corrupt_docx: "We couldn't read that DOCX. It may be damaged or not a real Word document. Try saving it again, or paste the text below.",
  corrupt_txt: "That doesn't look like a plain-text file. Try a PDF or DOCX instead, or paste the text below.",
  password_pdf: 'This PDF is password-protected. Export a copy without a password and try again, or paste the text below.',
  password_docx: 'This Word file is password-protected (or an old .doc renamed to .docx). Save a copy without a password as .docx, or paste the text below.',
  no_text: "This PDF has no selectable text, so it's probably a scanned image. Export a text-based PDF or DOCX from your editor, or paste the text below.",
  empty: 'The file appears to be empty. Check the file, or paste the text below.',
  read_failed: "Your browser couldn't read that file. Try again, or paste the text below.",
  lib_missing: "The file reader couldn't load (is the /vendor folder present?). You can still paste the text below.",
};

const fail = (code) => new ParseError(code, MESSAGES[code]);

export function detectKind(file) {
  const name = (file.name || '').toLowerCase();
  const type = file.type || '';
  if (name.endsWith('.pdf') || type === 'application/pdf') return 'pdf';
  if (name.endsWith('.docx') || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
  if (name.endsWith('.txt') || name.endsWith('.md') || type === 'text/plain') return 'txt';
  if (name.endsWith('.doc') || type === 'application/msword') return 'doc';
  return 'unknown';
}

/** Parse a File into plain text. Throws ParseError with a friendly message. */
export async function parseFile(file) {
  const kind = detectKind(file);
  if (kind === 'doc') throw fail('legacy_doc');
  if (kind === 'unknown') throw fail('unsupported');
  if (file.size > MAX_BYTES) throw fail('too_large');
  if (file.size === 0) throw fail('empty');

  let buf;
  try { buf = await file.arrayBuffer(); } catch { throw fail('read_failed'); }

  let text;
  if (kind === 'pdf') text = await parsePdf(buf);
  else if (kind === 'docx') text = await parseDocx(buf);
  else text = parseTxt(buf);

  text = tidy(text);
  if (countWords(text) === 0) throw fail(kind === 'pdf' ? 'no_text' : 'empty');
  return { text, kind };
}

function tidy(text) {
  return text
    .replace(/\r\n?/g, '\n')
    // Word's Symbol/Wingdings bullets come through as private-use characters; make them standard bullets.
    .replace(/^([ \t]*)[]/gm, '$1•')
    .replace(/[  ]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ---------- TXT ----------

function parseTxt(buf) {
  const bytes = new Uint8Array(buf);
  let text;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder('utf-16le').decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder('utf-16be').decode(bytes);
  else text = new TextDecoder('utf-8').decode(bytes);
  // Binary files renamed to .txt contain NUL bytes or lots of replacement characters.
  const bad = (text.match(/[\u0000�]/g) || []).length;
  if (bad > Math.max(4, text.length * 0.01)) throw fail('corrupt_txt');
  return text;
}

// ---------- PDF ----------

let pdfjsPromise = null;
function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdf.min.js').then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.js', import.meta.url).href;
      return lib;
    });
    pdfjsPromise.catch(() => { pdfjsPromise = null; });
  }
  return pdfjsPromise;
}

async function parsePdf(buf) {
  let lib;
  try { lib = await loadPdfJs(); } catch { throw fail('lib_missing'); }

  let doc;
  try {
    doc = await lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true }).promise;
  } catch (e) {
    if (e && e.name === 'PasswordException') throw fail('password_pdf');
    throw fail('corrupt_pdf');
  }
  try {
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      pages.push(pageToText(content.items));
      page.cleanup();
    }
    const text = pages.join('\n\n');
    if (countWords(text) < 5) throw fail('no_text');
    return text;
  } catch (e) {
    if (e instanceof ParseError) throw e;
    throw fail('corrupt_pdf');
  } finally {
    doc.destroy();
  }
}

// Rebuild lines from positioned text items: a vertical jump starts a new line (a big jump adds a
// blank line, so section headings stay separated); a wide horizontal gap becomes 3 spaces so the
// analyzer can spot column layouts. A bullet that wraps onto the next line (the new line starts where
// the bullet's text started, at normal spacing) is joined back into one line.
const BULLET_GLYPH_RE = /^\s*[•‣▪◦●·*\-–—]\s*/;

export function pageToText(items) {
  let out = '';
  let lastY = null;
  let lastEndX = null;
  let lastH = 0;
  let bulletTextX = null;      // x where the current bullet's text starts
  let awaitingBulletText = false;
  for (const it of items) {
    // pdf.js fills gaps with whitespace-only items (one can span a whole column gap). Skip them and
    // measure the gap between the real text runs on either side instead.
    if (typeof it.str !== 'string' || it.str.trim() === '') continue;
    const [, , c, d, x, y] = it.transform;
    const h = Math.hypot(c, d) || it.height || 10;
    let lineStart = lastY === null;
    if (lastY !== null) {
      const dy = Math.abs(y - lastY);
      const lh = Math.max(h, lastH);
      if (dy > lh * 0.5) {
        const wrapped = bulletTextX !== null && dy <= lh * 1.9 && Math.abs(x - bulletTextX) <= Math.max(2, h * 0.3)
          && !BULLET_GLYPH_RE.test(it.str);
        if (wrapped) {
          out += /[-­]$/.test(out) && /^[a-z]/.test(it.str) ? '' : ' '; // keep hyphenated words whole
        } else {
          out += dy > lh * 1.9 ? '\n\n' : '\n';
          bulletTextX = null;
          awaitingBulletText = false;
          lineStart = true;
        }
      } else if (lastEndX !== null) {
        const gap = x - lastEndX;
        if (gap > h * 2.5) out += '   ';
        else if (gap > h * 0.15 && !/\s$/.test(out) && !/^\s/.test(it.str)) out += ' ';
      }
    }
    if (lineStart) {
      const m = it.str.match(BULLET_GLYPH_RE);
      if (m && m[0].length < it.str.length) bulletTextX = x + (it.width || 0) * (m[0].length / it.str.length);
      else if (m) awaitingBulletText = true; // the bullet glyph is its own item; text follows
    } else if (awaitingBulletText) {
      bulletTextX = x;
      awaitingBulletText = false;
    }
    out += it.str;
    lastY = y;
    lastEndX = x + (it.width || 0);
    lastH = h;
  }
  return out;
}

// ---------- DOCX ----------

let mammothPromise = null;
function loadMammoth() {
  if (window.mammoth) return Promise.resolve(window.mammoth);
  if (!mammothPromise) {
    mammothPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = new URL('../vendor/mammoth.browser.min.js', import.meta.url).href;
      s.onload = () => (window.mammoth ? resolve(window.mammoth) : reject(new Error('mammoth missing')));
      s.onerror = () => reject(new Error('mammoth failed to load'));
      document.head.appendChild(s);
    });
    mammothPromise.catch(() => { mammothPromise = null; });
  }
  return mammothPromise;
}

async function parseDocx(buf) {
  const head = new Uint8Array(buf.slice(0, 4));
  // Encrypted Office files (and legacy .doc) are OLE containers, not ZIPs.
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) throw fail('password_docx');
  if (!(head[0] === 0x50 && head[1] === 0x4b)) throw fail('corrupt_docx');

  let mammoth;
  try { mammoth = await loadMammoth(); } catch { throw fail('lib_missing'); }

  let html;
  try {
    const result = await mammoth.convertToHtml({ arrayBuffer: buf }, {
      ignoreEmptyParagraphs: false,
      // Keep a marker for images so the ATS check can flag them; image data is discarded.
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: '' })),
    });
    html = result.value;
  } catch {
    throw fail('corrupt_docx');
  }
  return htmlToText(html);
}

// Convert mammoth's HTML to text: paragraphs/headings become lines, list items become "- " bullets,
// multi-column table rows become tab-separated (so the ATS check sees the table), images become "[image]".
function htmlToText(html) {
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  const lines = [];
  const push = (s, prefix = '') => {
    for (const part of s.split('\n')) lines.push(prefix + part.replace(/[ \t ]+/g, ' ').trim());
  };
  const inline = (node) => {
    let s = '';
    for (const child of node.childNodes) {
      if (child.nodeType === 3) s += child.data;
      else if (child.nodeType === 1) {
        const tag = child.tagName;
        if (tag === 'IMG') s += ' [image] ';
        else if (tag === 'BR') s += '\n';
        else if (tag !== 'UL' && tag !== 'OL') s += inline(child);
      }
    }
    return s;
  };
  const walk = (el, depth) => {
    for (const node of el.children) {
      const tag = node.tagName;
      if (tag === 'P' || /^H[1-6]$/.test(tag)) push(inline(node));
      else if (tag === 'UL' || tag === 'OL') {
        for (const li of node.children) {
          if (li.tagName !== 'LI') continue;
          push(inline(li), `${'  '.repeat(depth)}- `);
          for (const sub of li.children) if (sub.tagName === 'UL' || sub.tagName === 'OL') walk({ children: [sub] }, depth + 1);
        }
      } else if (tag === 'TABLE') {
        for (const tr of node.querySelectorAll('tr')) {
          const cells = [...tr.children].map((td) => inline(td).replace(/\s+/g, ' ').trim()).filter(Boolean);
          if (cells.length) lines.push(cells.join('\t'));
        }
        lines.push('');
      } else if (tag === 'IMG') lines.push('[image]');
      else walk(node, depth);
    }
  };
  walk(doc.body, 0);
  return lines.join('\n');
}
