// The article body: ProseMirror/TipTap JSON, checked against an allow-list. There is no HTML anywhere:
// the reader page is built by React from this JSON, so anything not listed here is refused (400) with
// the path to the offending node, e.g. "body.content[3].content[0].marks[1]".
import { ApiError } from '../../utils/ApiError.js';

export const DOC_LIMITS = Object.freeze({ maxDepth: 20, maxNodes: 10_000, maxTextChars: 200_000, maxTextNodeChars: 20_000, maxMarks: 4 });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Control characters and the bidi overrides used to disguise text (e.g. "\u202egpj.exe"); newlines inside text
// nodes are not allowed either (paragraphs and hardBreak carry line structure).
// eslint-disable-next-line no-control-regex
const FORBIDDEN_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

const BLOCKS = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'callout', 'verse', 'divider', 'image', 'articleCard'];

/** Allowed attributes per node: a checker for each (value → error message or null). */
const oneOf = (values) => (v) => (values.includes(v) ? null : `must be one of ${values.join(', ')}`);
const text = (max) => (v) => (typeof v !== 'string' ? 'must be text' : v.length > max ? `has ${v.length} characters; keep it to ${max}` : FORBIDDEN_CHARS.test(v) ? 'contains hidden control characters' : null);
const uuid = (v) => (typeof v === 'string' && UUID.test(v) ? null : 'must be an id');
const int = (min, max) => (v) => (Number.isInteger(v) && v >= min && v <= max ? null : `must be a whole number from ${min} to ${max}`);

const NODES = {
  doc: { content: BLOCKS, min: 0 },
  paragraph: { content: ['text', 'hardBreak'], inline: true },
  heading: { attrs: { level: oneOf([2, 3]) }, required: ['level'], content: ['text', 'hardBreak'], inline: true },
  bulletList: { content: ['listItem'], min: 1 },
  orderedList: { attrs: { start: int(1, 999) }, content: ['listItem'], min: 1 },
  listItem: { content: ['paragraph', 'bulletList', 'orderedList'], min: 1, firstIs: 'paragraph' },
  blockquote: { content: ['paragraph'], min: 1 },
  callout: { attrs: { tone: oneOf(['note', 'tip', 'caution', 'doctor']) }, required: ['tone'], content: ['paragraph'], min: 1 },
  verse: {
    attrs: { devanagari: text(2000), transliteration: text(2000), meaning: text(2000), source: text(300) },
    required: ['devanagari'],
  },
  divider: { attrs: { style: oneOf(['line', 'lotus', 'danda']) }, required: ['style'] },
  image: {
    attrs: { mediaId: uuid, alt: text(255), caption: text(300), size: oneOf(['normal', 'wide', 'full']) },
    required: ['mediaId'],
  },
  articleCard: { attrs: { articleId: uuid }, required: ['articleId'] },
  hardBreak: {},
  text: {},
};

const MARKS = {
  bold: {},
  italic: {},
  link: { attrs: { href: (v) => linkProblem(v) }, required: ['href'] },
  articleLink: { attrs: { articleId: uuid }, required: ['articleId'] },
};

/** Only https and mailto links, no credentials in the URL, no spaces or control characters. */
export function linkProblem(href) {
  if (typeof href !== 'string' || href.length === 0) return 'must be a web address';
  if (href.length > 2048) return `has ${href.length} characters; keep it to 2048`;
  if (/\s/.test(href) || FORBIDDEN_CHARS.test(href)) return 'must not contain spaces or hidden characters';
  let url;
  try {
    url = new URL(href);
  } catch {
    return 'is not a complete web address (start it with https://)';
  }
  if (url.protocol === 'mailto:') return null;
  if (url.protocol !== 'https:') return 'must start with https:// (or be a mailto: email link)';
  if (url.username || url.password) return 'must not contain a user name or password';
  return null;
}

const typeName = (node) => (node && typeof node === 'object' && typeof node.type === 'string' ? node.type : null);

function checkAttrs(path, spec, attrs, problems) {
  const allowed = spec.attrs ?? {};
  if (attrs !== undefined && (attrs === null || typeof attrs !== 'object' || Array.isArray(attrs))) {
    problems.push({ path: `${path}.attrs`, message: 'must be an object' });
    return;
  }
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (!Object.hasOwn(allowed, name)) {
      problems.push({ path: `${path}.attrs.${name}`, message: 'is not allowed here' });
      continue;
    }
    // null means "not set" (TipTap writes defaults as null); required ones are checked below.
    if (value === null) continue;
    const problem = allowed[name](value);
    if (problem) problems.push({ path: `${path}.attrs.${name}`, message: problem });
  }
  for (const name of spec.required ?? []) {
    if (attrs?.[name] === undefined || attrs[name] === null) problems.push({ path: `${path}.attrs.${name}`, message: 'is required' });
  }
}

/**
 * Validate a body. Returns the problems (empty when valid); stops early on structural limits so a
 * hostile document costs little to reject.
 */
export function documentProblems(doc) {
  const problems = [];
  let nodes = 0;
  let chars = 0;
  // Iterative walk (no recursion), so a deeply nested document can't overflow the stack.
  const stack = [{ node: doc, path: 'body', depth: 0, parent: null }];
  while (stack.length && problems.length < 20) {
    const { node, path, depth, parent } = stack.pop();
    nodes += 1;
    if (nodes > DOC_LIMITS.maxNodes) return [{ path: 'body', message: `has more than ${DOC_LIMITS.maxNodes} parts; split it into several articles` }];
    if (depth > DOC_LIMITS.maxDepth) return [{ path, message: `is nested more than ${DOC_LIMITS.maxDepth} levels deep` }];

    const type = typeName(node);
    if (!type || !Object.hasOwn(NODES, type)) {
      problems.push({ path, message: type ? `"${type.slice(0, 40)}" is not an allowed block` : 'must be a block with a type' });
      continue;
    }
    if (parent === null && type !== 'doc') {
      problems.push({ path, message: 'must be a document (type "doc")' });
      continue;
    }
    const spec = NODES[type];
    for (const key of Object.keys(node)) {
      if (!['type', 'attrs', 'content', 'marks', 'text'].includes(key)) problems.push({ path: `${path}.${key}`, message: 'is not allowed here' });
    }
    checkAttrs(path, spec, node.attrs, problems);

    if (type === 'text') {
      if (typeof node.text !== 'string' || node.text.length === 0) {
        problems.push({ path: `${path}.text`, message: 'must be non-empty text' });
      } else {
        if (node.text.length > DOC_LIMITS.maxTextNodeChars) problems.push({ path: `${path}.text`, message: `has ${node.text.length} characters in one piece; keep it to ${DOC_LIMITS.maxTextNodeChars}` });
        if (FORBIDDEN_CHARS.test(node.text) || /[\n\r]/.test(node.text)) problems.push({ path: `${path}.text`, message: 'contains hidden control characters or raw line breaks' });
        chars += node.text.length;
        if (chars > DOC_LIMITS.maxTextChars) return [{ path: 'body', message: `has more than ${DOC_LIMITS.maxTextChars.toLocaleString('en-IN')} characters of text; split it into several articles` }];
      }
      if (node.marks !== undefined) {
        if (!Array.isArray(node.marks)) {
          problems.push({ path: `${path}.marks`, message: 'must be a list' });
        } else {
          if (node.marks.length > DOC_LIMITS.maxMarks) problems.push({ path: `${path}.marks`, message: `has more than ${DOC_LIMITS.maxMarks} styles` });
          const seen = new Set();
          node.marks.forEach((mark, i) => {
            const markPath = `${path}.marks[${i}]`;
            const markType = typeName(mark);
            if (!markType || !Object.hasOwn(MARKS, markType)) {
              problems.push({ path: markPath, message: markType ? `"${markType.slice(0, 40)}" is not an allowed style` : 'must be a style with a type' });
              return;
            }
            if (seen.has(markType)) problems.push({ path: markPath, message: 'repeats a style' });
            seen.add(markType);
            for (const key of Object.keys(mark)) if (!['type', 'attrs'].includes(key)) problems.push({ path: `${markPath}.${key}`, message: 'is not allowed here' });
            checkAttrs(markPath, MARKS[markType], mark.attrs, problems);
          });
          if (seen.has('link') && seen.has('articleLink')) problems.push({ path: `${path}.marks`, message: 'can link to a web address or an article, not both' });
        }
      }
      continue;
    }
    if (node.text !== undefined) problems.push({ path: `${path}.text`, message: 'is only allowed on text' });
    if (node.marks !== undefined) problems.push({ path: `${path}.marks`, message: 'are only allowed on text' });

    const children = node.content;
    if (children === undefined) {
      if ((spec.min ?? 0) > 0) problems.push({ path: `${path}.content`, message: 'must not be empty' });
      continue;
    }
    if (!spec.content) {
      problems.push({ path: `${path}.content`, message: 'is not allowed here' });
      continue;
    }
    if (!Array.isArray(children)) {
      problems.push({ path: `${path}.content`, message: 'must be a list' });
      continue;
    }
    if (children.length < (spec.min ?? 0)) problems.push({ path: `${path}.content`, message: 'must not be empty' });
    children.forEach((child, i) => {
      const childPath = `${path}.content[${i}]`;
      const childType = typeName(child);
      if (childType && Object.hasOwn(NODES, childType) && !spec.content.includes(childType)) {
        problems.push({ path: childPath, message: `"${childType}" can't go inside "${type}"` });
        return;
      }
      if (i === 0 && spec.firstIs && childType !== spec.firstIs) problems.push({ path: childPath, message: `must start with a ${spec.firstIs}` });
      stack.push({ node: child, path: childPath, depth: depth + 1, parent: type });
    });
  }
  return problems;
}

/** Throw a 400 listing the problems (paths relative to the request body's draft). */
export function assertValidDocument(doc, prefix = 'draft') {
  const problems = documentProblems(doc);
  if (problems.length) {
    throw ApiError.badRequest(
      'The article body has parts that aren’t allowed.',
      problems.map((p) => ({ path: `${prefix}.${p.path}`, message: `${p.path.split('.').pop()} ${p.message}` })),
      'INVALID_DOCUMENT',
    );
  }
}

/** Depth-first visit of every node (the document is already validated). */
export function walk(doc, visit) {
  const stack = [doc];
  while (stack.length) {
    const node = stack.pop();
    visit(node);
    if (Array.isArray(node.content)) for (let i = node.content.length - 1; i >= 0; i -= 1) stack.push(node.content[i]);
  }
}

const BLOCK_BREAK = new Set(['paragraph', 'heading', 'listItem', 'verse', 'blockquote', 'callout']);

/** Plain text for search, reading time and listening: blocks separated by line breaks. */
export function extractText(doc) {
  const parts = [];
  walk(doc, (node) => {
    if (node.type === 'text') parts.push(node.text);
    else if (node.type === 'hardBreak') parts.push('\n');
    else if (node.type === 'verse') {
      const { devanagari, transliteration, meaning } = node.attrs ?? {};
      parts.push('\n', [devanagari, transliteration, meaning].filter(Boolean).join('\n'), '\n');
    } else if (BLOCK_BREAK.has(node.type)) parts.push('\n');
  });
  return parts.join('').replace(/\n{2,}/g, '\n').trim();
}

/** Words for reading time: whitespace-separated runs (works for Hindi as well as English). */
export const countWords = (plain) => (plain.match(/\S+/g) ?? []).length;

/** About 200 words a minute; at least one minute. */
export const readingMinutes = (words) => Math.max(1, Math.ceil(words / 200));

/** Everything the document points at: article links, article cards and images (with their alt). */
export function collectReferences(doc) {
  const links = new Set();
  const cards = new Set();
  const images = [];
  walk(doc, (node) => {
    if (node.type === 'articleCard') cards.add(node.attrs.articleId.toLowerCase());
    else if (node.type === 'image') images.push({ mediaId: node.attrs.mediaId.toLowerCase(), alt: node.attrs.alt ?? '' });
    else if (node.type === 'text') for (const mark of node.marks ?? []) if (mark.type === 'articleLink') links.add(mark.attrs.articleId.toLowerCase());
  });
  return { links, cards, images };
}

/**
 * The body as a reader may see it: links to articles that aren't published lose their link (the text
 * stays), and cards for them disappear, so nothing about a hidden article (not even its id) is sent.
 * Images whose file is gone (deleted, not ready) are dropped too. Returns a new document; the input is
 * not changed.
 */
export function readerBody(doc, isVisibleArticle, isVisibleImage = () => true) {
  const clean = (node) => {
    if (node.type === 'articleCard') return isVisibleArticle(node.attrs.articleId.toLowerCase()) ? { ...node } : null;
    if (node.type === 'image') return isVisibleImage(node.attrs.mediaId.toLowerCase()) ? { ...node } : null;
    if (node.type === 'text') {
      const marks = (node.marks ?? []).filter((m) => m.type !== 'articleLink' || isVisibleArticle(m.attrs.articleId.toLowerCase()));
      return marks.length ? { ...node, marks } : { type: 'text', text: node.text };
    }
    if (!Array.isArray(node.content)) return { ...node };
    return { ...node, content: node.content.map(clean).filter(Boolean) };
  };
  return clean(doc);
}

export const EMPTY_DOC = Object.freeze({ type: 'doc', content: [] });
