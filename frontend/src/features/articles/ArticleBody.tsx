// The reader's renderer: one React component per node of the allow-list (backend document.js). There is
// no HTML string anywhere, so nothing in an article can run as code. Anything not on the list renders
// nothing; links are https/mailto only (checked again here) and open safely in a new tab.
import { Component, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArticleCard, ReaderImg } from './ArticleCard';
import { safeHref } from './sanitize';
import type {
  ArticleCardData,
  ArticleDoc,
  BlockNode,
  CalloutTone,
  DividerStyle,
  InlineNode,
  ListItemNode,
  Mark,
  ParagraphNode,
  ReaderImage,
  TextNode,
} from './types';
import './articles.css';

interface Context {
  images: Record<string, ReaderImage>;
  articles: Record<string, ArticleCardData>;
}

// The server keys images and articles by lower-case id; documents may carry either case.
const lookup = <T,>(map: Record<string, T>, id: unknown): T | undefined =>
  typeof id === 'string' && Object.hasOwn(map, id.toLowerCase()) ? map[id.toLowerCase()] : undefined;

const markOf = <K extends Mark['type']>(marks: Mark[] | undefined, type: K) =>
  marks?.find((m): m is Extract<Mark, { type: K }> => m.type === type);

function Text({ node, ctx }: { node: TextNode; ctx: Context }) {
  let out: ReactNode = node.text;
  if (markOf(node.marks, 'italic')) out = <em>{out}</em>;
  if (markOf(node.marks, 'bold')) out = <strong>{out}</strong>;
  const link = markOf(node.marks, 'link');
  const href = link ? safeHref(link.attrs.href) : null;
  if (href) {
    out = (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow">
        {out}
        <span className="visually-hidden"> (opens in a new tab)</span>
      </a>
    );
  }
  const articleLink = markOf(node.marks, 'articleLink');
  const target = articleLink ? lookup(ctx.articles, articleLink.attrs.articleId) : undefined;
  if (target) out = <Link to={`/articles/${target.slug}`}>{out}</Link>;
  return out;
}

function Inline({ content, ctx }: { content: InlineNode[] | undefined; ctx: Context }) {
  return (content ?? []).map((node, i) => {
    // Text, or the only other inline node: a line break.
    return node.type === 'text' ? <Text key={i} node={node} ctx={ctx} /> : <br key={i} />;
  });
}

const Paragraph = ({ node, ctx }: { node: ParagraphNode; ctx: Context }) => (
  <p>
    <Inline content={node.content} ctx={ctx} />
  </p>
);

const CALLOUTS: Record<CalloutTone, { label: string; icon: ReactNode }> = {
  note: {
    label: 'Note',
    icon: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6M12 7.5v.5" />
      </>
    ),
  },
  tip: {
    label: 'Tip',
    // A small lotus bud.
    icon: (
      <>
        <path d="M12 20c-4-3-5-8-3-13 1.2 1.5 2.2 2.8 3 4.5.8-1.7 1.8-3 3-4.5 2 5 1 10-3 13Z" />
        <path d="M5 13c1 3.5 3.5 6 7 7 3.5-1 6-3.5 7-7" />
      </>
    ),
  },
  caution: {
    label: 'Caution',
    icon: (
      <>
        <path d="M12 3.5 21.5 20h-19Z" />
        <path d="M12 10v4.5M12 17v.5" />
      </>
    ),
  },
  doctor: {
    label: 'Ask your doctor',
    icon: (
      <>
        <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
        <path d="M12 8v8M8 12h8" />
      </>
    ),
  },
};

function Callout({ tone, children }: { tone: CalloutTone; children: ReactNode }) {
  const look = Object.hasOwn(CALLOUTS, tone) ? CALLOUTS[tone] : CALLOUTS.note;
  return (
    <div className={`callout callout--${Object.hasOwn(CALLOUTS, tone) ? tone : 'note'}`} role="note" aria-label={look.label}>
      <p className="callout__label">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          {look.icon}
        </svg>
        {look.label}
      </p>
      {children}
    </div>
  );
}

function Divider({ style }: { style: DividerStyle }) {
  if (style === 'lotus') {
    return (
      <div className="divider divider--lotus" role="separator">
        <svg viewBox="-20 -14 40 20" width="40" height="20" aria-hidden="true" focusable="false">
          <path d="M0 4C-3 0-3-7 0-12 3-7 3 0 0 4Z" />
          <path d="M0 4C-6 2-10-3-10-8-5-7-2-3 0 4Z" />
          <path d="M0 4C6 2 10-3 10-8 5-7 2-3 0 4Z" />
          <path d="M-16 5H16" />
        </svg>
      </div>
    );
  }
  if (style === 'danda') {
    return (
      <div className="divider divider--danda" role="separator">
        <span aria-hidden="true">॥</span>
      </div>
    );
  }
  return <hr className="divider divider--line" />;
}

function ListItem({ node, ctx }: { node: ListItemNode; ctx: Context }) {
  return (
    <li>
      {node.content.map((child, i) => (
        <Block key={i} node={child} ctx={ctx} />
      ))}
    </li>
  );
}

function Block({ node, ctx }: { node: BlockNode; ctx: Context }): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <Paragraph node={node} ctx={ctx} />;
    case 'heading': {
      const Heading = node.attrs.level === 3 ? 'h3' : 'h2';
      return (
        <Heading>
          <Inline content={node.content} ctx={ctx} />
        </Heading>
      );
    }
    case 'bulletList':
      return (
        <ul>
          {node.content.map((item, i) => (
            <ListItem key={i} node={item} ctx={ctx} />
          ))}
        </ul>
      );
    case 'orderedList':
      return (
        <ol start={node.attrs?.start ?? undefined}>
          {node.content.map((item, i) => (
            <ListItem key={i} node={item} ctx={ctx} />
          ))}
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote>
          {node.content.map((p, i) => (
            <Paragraph key={i} node={p} ctx={ctx} />
          ))}
        </blockquote>
      );
    case 'callout':
      return (
        <Callout tone={node.attrs.tone}>
          {node.content.map((p, i) => (
            <Paragraph key={i} node={p} ctx={ctx} />
          ))}
        </Callout>
      );
    case 'verse': {
      const { devanagari, transliteration, meaning, source } = node.attrs;
      return (
        <figure className="verse">
          <span className="verse__ornament" aria-hidden="true">
            ॥
          </span>
          <blockquote className="verse__lines">
            <p className="verse__deva" lang="sa">
              {devanagari}
            </p>
            {transliteration && (
              <p className="verse__translit" lang="sa-Latn">
                {transliteration}
              </p>
            )}
          </blockquote>
          {meaning && <p className="verse__meaning">{meaning}</p>}
          {source && (
            <figcaption className="verse__source">
              <cite>{source}</cite>
            </figcaption>
          )}
        </figure>
      );
    }
    case 'divider':
      return <Divider style={node.attrs.style} />;
    case 'image': {
      // An image the server didn't send (deleted, not ready) is simply left out.
      const image = lookup(ctx.images, node.attrs.mediaId);
      if (!image) return null;
      const size = node.attrs.size === 'wide' || node.attrs.size === 'full' ? node.attrs.size : 'normal';
      const sizes = { normal: '(max-width: 44rem) calc(100vw - 2rem), 42rem', wide: '(max-width: 60rem) calc(100vw - 2rem), 58rem', full: '100vw' }[size];
      return (
        <figure className={`article-figure article-figure--${size}`}>
          <ReaderImg image={image} alt={node.attrs.alt?.trim() ? node.attrs.alt : image.alt} sizes={sizes} />
          {node.attrs.caption && <figcaption>{node.attrs.caption}</figcaption>}
        </figure>
      );
    }
    case 'articleCard': {
      // Cards for articles that aren't published never reach the reader; any left over render nothing.
      const target = lookup(ctx.articles, node.attrs.articleId);
      if (!target) return null;
      return (
        <div className="also-read">
          <p className="also-read__label">Also read</p>
          <ArticleCard article={target} layout="row" />
        </div>
      );
    }
    default:
      // Not on the allow-list (an older or newer editor, or a tampered document): show nothing.
      return null;
  }
}

interface ArticleBodyProps {
  body: ArticleDoc;
  images: Record<string, ReaderImage>;
  articles: Record<string, ArticleCardData>;
}

/** A damaged block (it should never pass the server's checks) is left out instead of breaking the page. */
class SkipIfBroken extends Component<{ children: ReactNode }, { broken: boolean }> {
  override state = { broken: false };
  static getDerivedStateFromError() {
    return { broken: true };
  }
  override render() {
    return this.state.broken ? null : this.props.children;
  }
}

/** The top-level blocks, skipping anything that isn't a node at all. */
function blocksOf(body: unknown): BlockNode[] {
  const content = typeof body === 'object' && body !== null ? (body as { content?: unknown }).content : undefined;
  return Array.isArray(content) ? content.filter((n): n is BlockNode => typeof n === 'object' && n !== null && typeof (n as { type?: unknown }).type === 'string') : [];
}

/** An article's body, rendered from its allow-listed JSON. */
export function ArticleBody({ body, images, articles }: ArticleBodyProps) {
  const ctx: Context = { images, articles };
  return (
    <div className="article-body">
      {blocksOf(body).map((node, i) => (
        <SkipIfBroken key={i}>
          <Block node={node} ctx={ctx} />
        </SkipIfBroken>
      ))}
    </div>
  );
}
