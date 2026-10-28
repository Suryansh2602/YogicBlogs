// Article shapes, mirroring the API (docs/articles.md). The body is allow-listed editor JSON: the same
// node and mark names as backend/src/modules/articles/document.js. No HTML anywhere.

export type CalloutTone = 'note' | 'tip' | 'caution' | 'doctor';
export type DividerStyle = 'line' | 'lotus' | 'danda';
export type ImageSize = 'normal' | 'wide' | 'full';
export type CardAccent = 'saffron' | 'teal' | 'lotus' | 'gold';
export type AccessLevel = 'public' | 'members';
export type ArticleLang = 'en' | 'hi';
export type ArticleStatus = 'draft' | 'published' | 'archived';

export type Mark = { type: 'bold' } | { type: 'italic' } | { type: 'link'; attrs: { href: string } } | { type: 'articleLink'; attrs: { articleId: string } };

export interface TextNode {
  type: 'text';
  text: string;
  marks?: Mark[];
}
export interface HardBreakNode {
  type: 'hardBreak';
}
export type InlineNode = TextNode | HardBreakNode;

export interface ParagraphNode {
  type: 'paragraph';
  content?: InlineNode[];
}
export interface HeadingNode {
  type: 'heading';
  attrs: { level: 2 | 3 };
  content?: InlineNode[];
}
export interface ListItemNode {
  type: 'listItem';
  content: (ParagraphNode | BulletListNode | OrderedListNode)[];
}
export interface BulletListNode {
  type: 'bulletList';
  content: ListItemNode[];
}
export interface OrderedListNode {
  type: 'orderedList';
  attrs?: { start?: number | null };
  content: ListItemNode[];
}
export interface BlockquoteNode {
  type: 'blockquote';
  content: ParagraphNode[];
}
export interface CalloutNode {
  type: 'callout';
  attrs: { tone: CalloutTone };
  content: ParagraphNode[];
}
export interface VerseNode {
  type: 'verse';
  attrs: { devanagari: string; transliteration?: string | null; meaning?: string | null; source?: string | null };
}
export interface DividerNode {
  type: 'divider';
  attrs: { style: DividerStyle };
}
export interface ImageNode {
  type: 'image';
  attrs: { mediaId: string; alt?: string | null; caption?: string | null; size?: ImageSize | null };
}
export interface ArticleCardNode {
  type: 'articleCard';
  attrs: { articleId: string };
}

export type BlockNode = ParagraphNode | HeadingNode | BulletListNode | OrderedListNode | BlockquoteNode | CalloutNode | VerseNode | DividerNode | ImageNode | ArticleCardNode;

export interface ArticleDoc {
  type: 'doc';
  content?: BlockNode[];
}

/** The editable copy, exactly as PUT /admin/articles/:id/draft takes it. */
export interface ArticleDraft {
  title: string;
  slug: string;
  summary: string;
  conditionId: string;
  accessLevel: AccessLevel;
  lang: ArticleLang;
  accent: CardAccent;
  cover: { mediaId: string | null; alt: string; focalX: number; focalY: number };
  relatedIds: string[];
  seoTitle: string;
  seoDescription: string;
  body: ArticleDoc;
}

export interface ChecklistProblem {
  field: string;
  message: string;
  blocking: boolean;
}

export interface ArticleReferenceState {
  articleId: string;
  kind: 'link' | 'card' | 'related';
  title: string | null;
  state: ArticleStatus | 'deleted' | 'missing';
}

/** GET /admin/articles/:id */
export interface AdminArticle {
  id: string;
  status: ArticleStatus;
  slug: string | null;
  publishedAt: string | null;
  contentUpdatedAt: string | null;
  liveVersion: number;
  draftVersion: number;
  draft: ArticleDraft;
  savedAt: string;
  savedBy: string | null;
  hasUnpublishedChanges: boolean;
  references: ArticleReferenceState[];
  inboundCount: number;
  checklist: { ready: boolean; slug: string; words: number; problems: ChecklistProblem[] };
}

export interface AdminArticleListItem {
  id: string;
  title: string;
  status: ArticleStatus;
  hasUnpublishedChanges: boolean;
  slug: string | null;
  condition: { id: string; name: string | null };
  accessLevel: AccessLevel;
  lang: ArticleLang;
  coverMediaId: string | null;
  publishedAt: string | null;
  updatedAt: string;
}

export interface RevisionSummary {
  id: string;
  reason: 'publish' | 'manual' | 'autosnap' | 'restore' | 'delete';
  sizeBytes: number;
  createdAt: string;
  createdBy: string | null;
}

/** An image as readers get it (variant URLs are relative to the API base: use apiUrl()). */
export interface ReaderImage {
  alt: string;
  width: number | null;
  height: number | null;
  placeholder: string | null;
  variants: { width: number; height: number; url: string }[];
}

export interface ArticleCardData {
  slug: string;
  title: string;
  summary: string | null;
  accent: CardAccent;
  accessLevel: AccessLevel;
  cover: ReaderImage | null;
}

interface ReaderBase {
  slug: string;
  title: string;
  summary: string | null;
  lang: ArticleLang;
  accent: CardAccent;
  accessLevel: AccessLevel;
  condition: { slug: string; name: string } | null;
  cover: ReaderImage | null;
  coverFocus: { x: number; y: number };
  readingMinutes: number;
  publishedAt: string | null;
  updatedAt: string | null;
  seo: { title: string; description: string | null };
}

/** GET /articles/:slug → article. A members article signed out is a teaser (no body). */
export type ReaderArticle =
  | (ReaderBase & { locked: true; reason: 'SIGN_IN_REQUIRED' })
  | (ReaderBase & {
      locked: false;
      body: ArticleDoc;
      /** Inline images by media id; an image block not listed here isn't shown. */
      images: Record<string, ReaderImage>;
      /** Published articles that links and "Also read" cards point at, by article id. */
      articles: Record<string, ArticleCardData>;
      related: ArticleCardData[];
    });

export interface ArticleListItem extends ArticleCardData {
  lang: ArticleLang;
  condition: { slug: string; name: string };
  coverFocus: { x: number; y: number };
  readingMinutes: number;
  publishedAt: string;
}
