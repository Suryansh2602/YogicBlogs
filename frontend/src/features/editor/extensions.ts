// TipTap set-up for the article editor. Node and mark names and attributes match the server's allow-list
// exactly (backend/src/modules/articles/document.js); toServerDoc trims anything TipTap adds on top.
import { Mark, mergeAttributes, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extensions';
import { ReactNodeViewRenderer } from '@tiptap/react';
import type { CalloutTone, DividerStyle, ImageSize } from '../articles/types';
import { safeHref } from '../articles/sanitize';
import { ArticleCardView, DividerView, ImageView, VerseView } from './nodeViews';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    hmBlocks: {
      setCallout: (tone: CalloutTone) => ReturnType;
      insertVerse: (attrs: { devanagari: string; transliteration?: string; meaning?: string; source?: string }) => ReturnType;
      insertDivider: (style: DividerStyle) => ReturnType;
      insertImage: (attrs: { mediaId: string; alt?: string; caption?: string; size?: ImageSize }) => ReturnType;
      insertArticleCard: (articleId: string) => ReturnType;
      setArticleLink: (articleId: string) => ReturnType;
      unsetArticleLink: () => ReturnType;
    };
  }
}

/** A callout box (note / tip / caution / ask your doctor) holding paragraphs. */
export const Callout = Node.create({
  name: 'callout',
  group: 'block',
  content: 'paragraph+',
  defining: true,
  addAttributes() {
    return { tone: { default: 'note' as CalloutTone } };
  },
  parseHTML() {
    return [{ tag: 'div[data-callout]' }];
  },
  renderHTML({ node, HTMLAttributes }) {
    const tone = String(node.attrs['tone']);
    return ['div', mergeAttributes(HTMLAttributes, { 'data-callout': tone, class: `callout callout--${tone}` }), 0];
  },
  addCommands() {
    return {
      setCallout:
        (tone) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { tone }),
    };
  },
});

/** A Sanskrit verse (Devanagari, transliteration, meaning, source): edited through its form, not inline. */
export const Verse = Node.create({
  name: 'verse',
  group: 'block',
  atom: true,
  addAttributes() {
    return { devanagari: { default: '' }, transliteration: { default: null }, meaning: { default: null }, source: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'figure[data-verse]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-verse': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(VerseView);
  },
  addCommands() {
    return {
      insertVerse:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    };
  },
});

export const Divider = Node.create({
  name: 'divider',
  group: 'block',
  atom: true,
  addAttributes() {
    return { style: { default: 'line' as DividerStyle } };
  },
  parseHTML() {
    return [{ tag: 'div[data-divider]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-divider': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(DividerView);
  },
  addCommands() {
    return {
      insertDivider:
        (style) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { style } }),
    };
  },
});

/** An image from the media library (by id); alt, caption and size are set on the block. */
export const ArticleImage = Node.create({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { mediaId: { default: null }, alt: { default: null }, caption: { default: null }, size: { default: 'normal' as ImageSize } };
  },
  parseHTML() {
    return [{ tag: 'figure[data-media-id]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageView);
  },
  addCommands() {
    return {
      insertImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { size: 'normal', ...attrs } }),
    };
  },
});

/** "Also read": a card for another article (by id), resolved when readers open the page. */
export const ArticleCardNode = Node.create({
  name: 'articleCard',
  group: 'block',
  atom: true,
  draggable: true,
  addAttributes() {
    return { articleId: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'div[data-article-card]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-article-card': '' })];
  },
  addNodeView() {
    return ReactNodeViewRenderer(ArticleCardView);
  },
  addCommands() {
    return {
      insertArticleCard:
        (articleId) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { articleId } }),
    };
  },
});

/** A link to another article by id: survives slug changes; plain text for readers if it isn't published. */
export const ArticleLink = Mark.create({
  name: 'articleLink',
  inclusive: false,
  excludes: 'link',
  addAttributes() {
    return { articleId: { default: null } };
  },
  parseHTML() {
    return [{ tag: 'a[data-article-id]' }];
  },
  renderHTML({ mark, HTMLAttributes }) {
    return ['a', mergeAttributes(HTMLAttributes, { 'data-article-id': String(mark.attrs['articleId']), class: 'editor-article-link' }), 0];
  },
  addCommands() {
    return {
      setArticleLink:
        (articleId) =>
        ({ commands }) =>
          commands.setMark(this.name, { articleId }),
      unsetArticleLink:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    };
  },
});

export const editorExtensions = [
  StarterKit.configure({
    heading: { levels: [2, 3] },
    code: false,
    codeBlock: false,
    strike: false,
    underline: false,
    horizontalRule: false,
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https', isAllowedUri: (url) => safeHref(url) !== null },
  }),
  Placeholder.configure({ placeholder: 'Start writing… (use the toolbar for headings, lists, callouts, verses and images)' }),
  Callout,
  Verse,
  Divider,
  ArticleImage,
  ArticleCardNode,
  ArticleLink,
];
