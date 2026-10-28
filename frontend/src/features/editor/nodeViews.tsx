// How the editor shows its special blocks while writing: images from the media library, "Also read" cards
// with the linked article's title and state, verses and dividers. Selecting a block shows its settings in
// the editor's side panel (BlockSettings), so these views stay simple and read-only.
import { useContext } from 'react';
import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { apiUrl } from '../../services/apiClient';
import { EditorLookupsContext } from './lookups';

const STATE_LABEL: Record<string, string> = {
  published: 'Published',
  draft: 'Draft: readers will see plain text until it’s published',
  archived: 'Archived: readers won’t see this card',
  deleted: 'Deleted: readers won’t see this card',
  missing: 'Not found',
};

export function ImageView({ node, selected }: ReactNodeViewProps) {
  const { media } = useContext(EditorLookupsContext);
  const mediaId = String(node.attrs['mediaId'] ?? '');
  const item = media(mediaId.toLowerCase());
  const variant = item?.variants.find((v) => v.width >= 480) ?? item?.variants.at(-1);
  const ownAlt = String(node.attrs['alt'] ?? '');
  const alt = ownAlt !== '' ? ownAlt : (item?.altText ?? '');
  const caption = String(node.attrs['caption'] ?? '');
  return (
    <NodeViewWrapper className={`editor-block editor-image editor-image--${String(node.attrs['size'] ?? 'normal')} ${selected ? 'editor-block--selected' : ''}`} data-drag-handle="">
      {variant ? <img src={apiUrl(variant.url)} alt={alt} /> : <div className="editor-image__missing">Image not found in the library</div>}
      <p className="editor-block__meta">
        {alt ? `Alt: ${alt}` : '⚠ No alt text yet: select the image and add it'}
        {caption && ` · Caption: ${caption}`}
      </p>
    </NodeViewWrapper>
  );
}

export function ArticleCardView({ node, selected }: ReactNodeViewProps) {
  const { article } = useContext(EditorLookupsContext);
  const id = String(node.attrs['articleId'] ?? '').toLowerCase();
  const target = article(id);
  return (
    <NodeViewWrapper className={`editor-block editor-card ${selected ? 'editor-block--selected' : ''}`} data-drag-handle="">
      <span className="editor-card__label">Also read</span>
      <strong>{target?.title ?? 'An article'}</strong>
      <span className="editor-block__meta">{STATE_LABEL[target?.state ?? 'published'] ?? ''}</span>
    </NodeViewWrapper>
  );
}

export function VerseView({ node, selected }: ReactNodeViewProps) {
  const text = (key: string) => String(node.attrs[key] ?? '');
  return (
    <NodeViewWrapper className={`editor-block editor-verse ${selected ? 'editor-block--selected' : ''}`}>
      <p className="deva editor-verse__deva" lang="sa">
        {text('devanagari') || '(empty verse)'}
      </p>
      {text('transliteration') && <p className="editor-verse__translit">{text('transliteration')}</p>}
      {text('meaning') && <p>{text('meaning')}</p>}
      {text('source') && <p className="editor-block__meta">— {text('source')}</p>}
    </NodeViewWrapper>
  );
}

export function DividerView({ node, selected }: ReactNodeViewProps) {
  const style = String(node.attrs['style'] ?? 'line');
  return (
    <NodeViewWrapper className={`editor-block editor-divider editor-divider--${style} ${selected ? 'editor-block--selected' : ''}`} role="separator">
      {style === 'danda' ? '॥' : style === 'lotus' ? '❀' : ''}
    </NodeViewWrapper>
  );
}
