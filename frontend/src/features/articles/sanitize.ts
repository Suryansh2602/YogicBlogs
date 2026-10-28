// Trim editor JSON to exactly what the server's allow-list accepts (backend/src/modules/articles/document.js).
// TipTap adds attributes of its own (link target/rel/class, ordered-list type, null defaults…); the server
// refuses unknown ones, so they are dropped here before every save. Unknown nodes and marks are dropped
// too (with their content), so a stray paste can never block saving.
import type { ArticleDoc } from './types';

type Json = Record<string, unknown>;

const NODE_ATTRS: Record<string, readonly string[]> = {
  doc: [],
  paragraph: [],
  heading: ['level'],
  bulletList: [],
  orderedList: ['start'],
  listItem: [],
  blockquote: [],
  callout: ['tone'],
  verse: ['devanagari', 'transliteration', 'meaning', 'source'],
  divider: ['style'],
  image: ['mediaId', 'alt', 'caption', 'size'],
  articleCard: ['articleId'],
  hardBreak: [],
  text: [],
};
const MARK_ATTRS: Record<string, readonly string[]> = { bold: [], italic: [], link: ['href'], articleLink: ['articleId'] };

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

function pickAttrs(attrs: unknown, allowed: readonly string[]): Json | undefined {
  if (!allowed.length || !isObject(attrs)) return undefined;
  const kept: Json = {};
  for (const name of allowed) {
    const value = attrs[name];
    // TipTap writes unset attributes as null; leave them out unless they carry a value.
    if (value !== undefined && value !== null && value !== '') kept[name] = value;
  }
  return Object.keys(kept).length ? kept : undefined;
}

function cleanNode(node: unknown): Json | null {
  if (!isObject(node) || typeof node.type !== 'string') return null;
  const allowed = NODE_ATTRS[node.type];
  if (!allowed) return null;
  const out: Json = { type: node.type };
  const attrs = pickAttrs(node.attrs, allowed);
  if (attrs) out.attrs = attrs;
  if (node.type === 'text') {
    // Raw line breaks aren't allowed inside text (hardBreak carries them); empty text is dropped.
    const text = typeof node.text === 'string' ? node.text.replace(/[\r\n]+/g, ' ') : '';
    if (!text) return null;
    out.text = text;
    const marks = Array.isArray(node.marks)
      ? node.marks
          .filter((m): m is Json => isObject(m) && typeof m.type === 'string' && Object.hasOwn(MARK_ATTRS, m.type))
          .map((m) => {
            const markAttrs = pickAttrs(m.attrs, MARK_ATTRS[m.type as string] ?? []);
            return markAttrs ? { type: m.type, attrs: markAttrs } : { type: m.type };
          })
      : [];
    if (marks.length) out.marks = marks;
    return out;
  }
  if (Array.isArray(node.content)) {
    const content = node.content.map(cleanNode).filter((c): c is Json => c !== null);
    if (content.length) out.content = content;
  }
  return out;
}

/** The body as the server accepts it. */
export function toServerDoc(doc: unknown): ArticleDoc {
  const cleaned = cleanNode(doc);
  if (!cleaned || cleaned.type !== 'doc') return { type: 'doc', content: [] };
  return cleaned as unknown as ArticleDoc;
}

/** https and mailto only: checked again here so the reader page never renders anything else. */
export function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null;
  try {
    const url = new URL(href);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    if (url.protocol === 'mailto:') return href;
  } catch {
    return null;
  }
  return null;
}
