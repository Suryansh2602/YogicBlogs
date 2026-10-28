import { useState, type Ref } from 'react';
import { Link } from 'react-router';
import { apiUrl } from '../../services/apiClient';
import type { ArticleCardData, ReaderImage } from './types';
import './articles.css';

/** Only the server's own tiny data: image is used as the blurred placeholder (never a stray URL or CSS). */
const safePlaceholder = (value: string | null) => (value?.startsWith('data:image/') && !/["\\\s]/.test(value) ? value : null);

interface ReaderImgProps {
  image: ReaderImage;
  /** Which width the image is shown at, so the browser picks the smallest file that is still sharp. */
  sizes: string;
  /** Defaults to the image's own alt text; pass "" for a decorative image. */
  alt?: string;
  /** Focal point in percent: the part of the picture kept in view when it is cropped. */
  focus?: { x: number; y: number } | undefined;
  /** Above-the-fold images (the article cover) load at once; everything else waits until it is near. */
  eager?: boolean;
  className?: string;
}

/** A responsive image from the media library, over its blurred placeholder until the real file arrives. */
export function ReaderImg({ image, sizes, alt, focus, eager = false, className = '' }: ReaderImgProps) {
  const [loaded, setLoaded] = useState(false);
  const main = image.variants.find((v) => v.width >= 960) ?? image.variants.at(-1);
  if (!main) return null;
  const placeholder = safePlaceholder(image.placeholder);
  return (
    <div className={`reader-img ${className}`} style={placeholder && !loaded ? { backgroundImage: `url("${placeholder}")` } : undefined}>
      <img
        src={apiUrl(main.url)}
        srcSet={image.variants.map((v) => `${apiUrl(v.url)} ${String(v.width)}w`).join(', ')}
        sizes={sizes}
        width={image.width ?? main.width}
        height={image.height ?? main.height}
        alt={alt ?? image.alt}
        loading={eager ? 'eager' : 'lazy'}
        fetchPriority={eager ? 'high' : undefined}
        decoding="async"
        style={focus ? { objectPosition: `${String(focus.x)}% ${String(focus.y)}%` } : undefined}
        onLoad={() => {
          setLoaded(true);
        }}
      />
    </div>
  );
}

export interface CardArticle extends ArticleCardData {
  coverFocus?: { x: number; y: number };
  condition?: { slug: string; name: string };
  readingMinutes?: number;
}

interface ArticleCardProps {
  article: CardArticle;
  /** h2 when the cards sit right under the page title, h3 under a section heading. */
  headingLevel?: 2 | 3;
  /** "row" puts a small thumbnail beside the text (used for "Also read" inside an article). */
  layout?: 'stacked' | 'row';
  /** React 19: a plain prop, passed on to the link (e.g. to move focus to the first newly loaded card). */
  ref?: Ref<HTMLAnchorElement>;
}

/** An article as a card: the whole card is one link to the article. */
export function ArticleCard({ article, headingLevel = 3, layout = 'stacked', ref }: ArticleCardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const meta = [article.condition?.name, article.readingMinutes ? `${String(article.readingMinutes)} min read` : null].filter(Boolean).join(' · ');
  return (
    <Link ref={ref} to={`/articles/${article.slug}`} className={`article-card article-card--${layout} accent--${article.accent}`}>
      <div className="article-card__cover">
        {article.cover ? (
          <ReaderImg
            image={article.cover}
            alt=""
            focus={article.coverFocus}
            sizes={layout === 'row' ? '8rem' : '(max-width: 640px) calc(100vw - 2rem), 22rem'}
          />
        ) : (
          <svg className="article-card__motif" viewBox="-50 -50 100 100" aria-hidden="true" focusable="false">
            <circle r="30" fill="none" stroke="currentColor" strokeWidth="0.8" />
            <circle r="42" fill="none" stroke="currentColor" strokeWidth="0.5" strokeDasharray="1.5 3" />
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
              <path key={angle} d="M0 -6 C-6 -14 -5 -24 0 -30 C5 -24 6 -14 0 -6 Z" fill="none" stroke="currentColor" strokeWidth="0.8" transform={`rotate(${String(angle)})`} />
            ))}
          </svg>
        )}
      </div>
      <div className="article-card__body">
        {meta && <p className="article-card__meta">{meta}</p>}
        <Heading className="article-card__title">{article.title}</Heading>
        {article.summary && <p className="article-card__summary">{article.summary}</p>}
        {article.accessLevel === 'members' && <span className="members-badge">Members</span>}
      </div>
    </Link>
  );
}
