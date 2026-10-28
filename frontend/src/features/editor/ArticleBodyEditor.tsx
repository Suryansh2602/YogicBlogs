// The article body editor: TipTap with a toolbar, inline panels for links, verses, images and article
// picks, and a settings panel for the selected block. Lazy-loaded with the admin editor page only.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import { NodeSelection } from '@tiptap/pm/state';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/TextField';
import { apiUrl } from '../../services/apiClient';
import { mediaApi, type MediaItem } from '../content/api';
import { adminArticlesApi } from '../articles/api';
import { safeHref } from '../articles/sanitize';
import type { AdminArticleListItem, ArticleDoc, CalloutTone, DividerStyle, ImageSize } from '../articles/types';
import { errorMessage } from '../auth/errors';
import { editorExtensions } from './extensions';
import { EditorLookupsContext, type EditorLookups } from './lookups';

type Panel = null | 'link' | 'articleLink' | 'articleCard' | 'image' | 'verse';

/** An attribute as text ('' when it isn't a string). */
const attrText = (value: unknown) => (typeof value === 'string' ? value : '');
/** What to call a library image: its alt text, else its file name. */
const mediaLabel = (m: MediaItem) => (m.altText !== '' ? m.altText : (m.originalName ?? 'Untitled image'));

interface ToolButtonProps {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}

function ToolButton({ label, active = false, disabled = false, onClick, children }: ToolButtonProps) {
  return (
    <button type="button" className="tool" aria-label={label} title={label} aria-pressed={active} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

function ArticlePicker({ excludeId, onPick, onClose, purpose }: { excludeId: string; onPick: (a: AdminArticleListItem) => void; onClose: () => void; purpose: string }) {
  const [q, setQ] = useState('');
  const [items, setItems] = useState<AdminArticleListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      adminArticlesApi.list({ q: q.trim() || undefined, pageSize: 10 }).then(
        (res) => {
          if (current) setItems(res.items.filter((a) => a.id !== excludeId));
        },
        (err: unknown) => {
          if (current) setError(errorMessage(err));
        },
      );
    }, 250);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [q, excludeId]);
  return (
    <div className="editor-panel" role="region" aria-label={purpose}>
      <div className="editor-panel__head">
        <strong>{purpose}</strong>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      <TextField label="Find an article" value={q} autoFocus onChange={(e) => { setQ(e.target.value); }} hint="Search by title. Drafts can be linked: readers see plain text until they’re published." />
      {error && <p className="field__error">{error}</p>}
      <ul className="picker-list">
        {items.map((a) => (
          <li key={a.id}>
            <button type="button" className="picker-item" onClick={() => { onPick(a); }}>
              <span>{a.title}</span>
              <span className={`badge ${a.status === 'published' ? 'badge--ok' : ''}`}>{a.status}</span>
            </button>
          </li>
        ))}
        {items.length === 0 && <li className="muted">No articles found.</li>}
      </ul>
    </div>
  );
}

function MediaPicker({ onPick, onClose }: { onPick: (m: MediaItem) => void; onClose: () => void }) {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    mediaApi.list(1, 48).then(
      (res) => {
        if (current) setItems(res.items);
      },
      (err: unknown) => {
        if (current) setError(errorMessage(err));
      },
    );
    return () => {
      current = false;
    };
  }, []);
  return (
    <div className="editor-panel" role="region" aria-label="Choose an image">
      <div className="editor-panel__head">
        <strong>Choose an image</strong>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
      {error && <p className="field__error">{error}</p>}
      {items?.length === 0 && <p className="muted">No images yet. Upload some in Admin → Media first.</p>}
      <ul className="picker-grid">
        {items?.map((m) => {
          const v = m.variants[0];
          return (
            <li key={m.id}>
              <button type="button" className="picker-image" onClick={() => { onPick(m); }} aria-label={`Insert ${mediaLabel(m)}`}>
                {v && <img src={apiUrl(v.url)} alt="" />}
                <span className="picker-image__name">{mediaLabel(m)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LinkPanel({ initial, onApply, onRemove, onClose }: { initial: string; onApply: (href: string) => void; onRemove: () => void; onClose: () => void }) {
  const [href, setHref] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const apply = () => {
    const value = href.trim();
    const safe = safeHref(value) ?? safeHref(`https://${value}`);
    if (!safe) {
      setError('Enter a full web address starting with https:// (or a mailto: email link). Other kinds of links aren’t allowed.');
      return;
    }
    onApply(safe);
  };
  return (
    <div className="editor-panel" role="region" aria-label="Web link">
      <TextField
        label="Web address"
        value={href}
        error={error}
        autoFocus
        placeholder="https://"
        onChange={(e) => {
          setHref(e.target.value);
          setError(undefined);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          }
        }}
      />
      <div className="editor-panel__actions">
        <Button size="sm" onClick={apply}>
          Apply link
        </Button>
        {initial && (
          <Button size="sm" variant="secondary" onClick={onRemove}>
            Remove link
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

interface VerseValues {
  devanagari: string;
  transliteration: string;
  meaning: string;
  source: string;
}

function VersePanel({ initial, onSave, onClose }: { initial: VerseValues; onSave: (v: VerseValues) => void; onClose: () => void }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | undefined>();
  const field = (key: keyof VerseValues, label: string, max: number, extra: Record<string, string> = {}) => (
    <TextField
      label={label}
      value={v[key]}
      maxLength={max}
      error={key === 'devanagari' ? error : undefined}
      {...extra}
      onChange={(e) => {
        setV((cur) => ({ ...cur, [key]: e.target.value }));
        if (key === 'devanagari') setError(undefined);
      }}
    />
  );
  return (
    <div className="editor-panel" role="region" aria-label="Sanskrit verse">
      {field('devanagari', 'Verse in Devanagari', 2000, { lang: 'sa', className: 'deva' })}
      {field('transliteration', 'Transliteration (optional)', 2000)}
      {field('meaning', 'Meaning (optional)', 2000)}
      {field('source', 'Source, e.g. Yoga Sutra 1.2 (optional)', 300)}
      <div className="editor-panel__actions">
        <Button
          size="sm"
          onClick={() => {
            if (!v.devanagari.trim()) {
              setError('Enter the verse in Devanagari.');
              return;
            }
            onSave({ devanagari: v.devanagari.trim(), transliteration: v.transliteration.trim(), meaning: v.meaning.trim(), source: v.source.trim() });
          }}
        >
          Save verse
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const selectedNode = (editor: Editor) => (editor.state.selection instanceof NodeSelection ? editor.state.selection.node : null);

/** Settings for the block the cursor is on: image alt/caption/size, verse text, callout tone. */
function BlockSettings({ editor, onEditVerse }: { editor: Editor; onEditVerse: () => void }) {
  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const node = selectedNode(e);
      return {
        nodeType: node?.type.name ?? null,
        attrs: node?.attrs ?? {},
        callout: e.isActive('callout') ? String(e.getAttributes('callout')['tone'] ?? 'note') : null,
      };
    },
  });
  const altId = useId();
  if (info.nodeType === 'image') {
    const attr = (k: string) => attrText(info.attrs[k]);
    const update = (attrs: Record<string, unknown>) => {
      // No focus(): typing in these fields must not jump the cursor back into the text (and close this panel).
      editor.chain().updateAttributes('image', attrs).run();
    };
    return (
      <div className="block-settings" role="region" aria-label="Image settings">
        <strong>Image</strong>
        <TextField id={altId} label="Alt text for this use (optional: the library’s alt is used if empty)" value={attr('alt')} maxLength={255} onChange={(e) => { update({ alt: e.target.value }); }} />
        <TextField label="Caption (optional)" value={attr('caption')} maxLength={300} onChange={(e) => { update({ caption: e.target.value }); }} />
        <fieldset className="segmented">
          <legend>Size</legend>
          {(['normal', 'wide', 'full'] as ImageSize[]).map((s) => (
            <label key={s}>
              <input type="radio" name="image-size" checked={(info.attrs['size'] ?? 'normal') === s} onChange={() => { update({ size: s }); }} /> {s}
            </label>
          ))}
        </fieldset>
      </div>
    );
  }
  if (info.nodeType === 'verse') {
    return (
      <div className="block-settings" role="region" aria-label="Verse settings">
        <strong>Sanskrit verse</strong>
        <Button size="sm" variant="secondary" onClick={onEditVerse}>
          Edit verse
        </Button>
      </div>
    );
  }
  if (info.callout) {
    return (
      <div className="block-settings" role="region" aria-label="Callout settings">
        <strong>Callout</strong>
        <fieldset className="segmented">
          <legend>Kind</legend>
          {(['note', 'tip', 'caution', 'doctor'] as CalloutTone[]).map((t) => (
            <label key={t}>
              <input type="radio" name="callout-tone" checked={info.callout === t} onChange={() => { editor.chain().focus().updateAttributes('callout', { tone: t }).run(); }} />{' '}
              {t === 'doctor' ? 'ask your doctor' : t}
            </label>
          ))}
        </fieldset>
        <Button size="sm" variant="ghost" onClick={() => { editor.chain().focus().lift('callout').run(); }}>
          Remove callout
        </Button>
      </div>
    );
  }
  return null;
}

export interface ArticleBodyEditorProps {
  articleId: string;
  initial: ArticleDoc;
  lookups: EditorLookups;
  onChange: (json: JSONContent) => void;
  /** Let the page learn about media and articles picked here (for previews and card titles). */
  onPickMedia: (m: MediaItem) => void;
  onPickArticle: (a: AdminArticleListItem) => void;
}

export function ArticleBodyEditor({ articleId, initial, lookups, onChange, onPickMedia, onPickArticle }: ArticleBodyEditorProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });
  const editor = useEditor({
    extensions: editorExtensions,
    content: initial,
    editorProps: { attributes: { class: 'editor-surface article-body', 'aria-label': 'Article text', role: 'textbox', 'aria-multiline': 'true' } },
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getJSON());
    },
  });
  const active = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      h2: e.isActive('heading', { level: 2 }),
      h3: e.isActive('heading', { level: 3 }),
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      quote: e.isActive('blockquote'),
      link: e.isActive('link'),
      articleLink: e.isActive('articleLink'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      href: String(e.getAttributes('link')['href'] ?? ''),
    }),
  });

  const chain = () => editor.chain().focus();
  const toggle = (p: Panel) => {
    setPanel((cur) => (cur === p ? null : p));
  };
  const verseAttrs = (): VerseValues => {
    const node = selectedNode(editor);
    const a: Record<string, unknown> = node?.type.name === 'verse' ? node.attrs : {};
    const s = (k: string) => attrText(a[k]);
    return { devanagari: s('devanagari'), transliteration: s('transliteration'), meaning: s('meaning'), source: s('source') };
  };

  return (
    <EditorLookupsContext.Provider value={lookups}>
      <div className="body-editor">
        <div className="toolbar" role="toolbar" aria-label="Formatting">
          <ToolButton label="Heading" active={active.h2} onClick={() => { chain().toggleHeading({ level: 2 }).run(); }}>H2</ToolButton>
          <ToolButton label="Subheading" active={active.h3} onClick={() => { chain().toggleHeading({ level: 3 }).run(); }}>H3</ToolButton>
          <ToolButton label="Bold" active={active.bold} onClick={() => { chain().toggleBold().run(); }}><strong>B</strong></ToolButton>
          <ToolButton label="Italic" active={active.italic} onClick={() => { chain().toggleItalic().run(); }}><em>I</em></ToolButton>
          <span className="toolbar__sep" aria-hidden="true" />
          <ToolButton label="Bulleted list" active={active.bullet} onClick={() => { chain().toggleBulletList().run(); }}>• List</ToolButton>
          <ToolButton label="Numbered list" active={active.ordered} onClick={() => { chain().toggleOrderedList().run(); }}>1. List</ToolButton>
          <ToolButton label="Quote" active={active.quote} onClick={() => { chain().toggleBlockquote().run(); }}>“ ”</ToolButton>
          <label className="tool-select">
            <span className="visually-hidden">Insert a callout</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) chain().setCallout(e.target.value as CalloutTone).run();
              }}
            >
              <option value="">Callout…</option>
              <option value="note">Note</option>
              <option value="tip">Tip</option>
              <option value="caution">Caution</option>
              <option value="doctor">Ask your doctor</option>
            </select>
          </label>
          <ToolButton label="Sanskrit verse" onClick={() => { toggle('verse'); }}>ॐ Verse</ToolButton>
          <label className="tool-select">
            <span className="visually-hidden">Insert a divider</span>
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) chain().insertDivider(e.target.value as DividerStyle).run();
              }}
            >
              <option value="">Divider…</option>
              <option value="line">Line</option>
              <option value="lotus">Lotus</option>
              <option value="danda">॥</option>
            </select>
          </label>
          <span className="toolbar__sep" aria-hidden="true" />
          <ToolButton label="Image" onClick={() => { toggle('image'); }}>🖼 Image</ToolButton>
          <ToolButton label="Web link" active={active.link} onClick={() => { toggle('link'); }}>🔗 Link</ToolButton>
          <ToolButton label="Link to an article" active={active.articleLink} onClick={() => { toggle('articleLink'); }}>↪ Article link</ToolButton>
          <ToolButton label="Also read card" onClick={() => { toggle('articleCard'); }}>▤ Also read</ToolButton>
          <span className="toolbar__sep" aria-hidden="true" />
          <ToolButton label="Undo" disabled={!active.canUndo} onClick={() => { chain().undo().run(); }}>↶</ToolButton>
          <ToolButton label="Redo" disabled={!active.canRedo} onClick={() => { chain().redo().run(); }}>↷</ToolButton>
        </div>

        {panel === 'link' && (
          <LinkPanel
            initial={active.href}
            onApply={(href) => {
              chain().extendMarkRange('link').unsetArticleLink().setLink({ href }).run();
              setPanel(null);
            }}
            onRemove={() => {
              chain().extendMarkRange('link').unsetLink().run();
              setPanel(null);
            }}
            onClose={() => { setPanel(null); }}
          />
        )}
        {(panel === 'articleLink' || panel === 'articleCard') && (
          <ArticlePicker
            excludeId={articleId}
            purpose={panel === 'articleLink' ? 'Link the selected text to an article' : 'Add an “Also read” card'}
            onClose={() => { setPanel(null); }}
            onPick={(a) => {
              onPickArticle(a);
              if (panel === 'articleLink') chain().unsetLink().setArticleLink(a.id).run();
              else chain().insertArticleCard(a.id).run();
              setPanel(null);
            }}
          />
        )}
        {panel === 'image' && (
          <MediaPicker
            onClose={() => { setPanel(null); }}
            onPick={(m) => {
              onPickMedia(m);
              chain().insertImage({ mediaId: m.id }).run();
              // Select the new image so its settings (alt text, caption, size) open straight away.
              const found: { pos: number | null } = { pos: null };
              editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'image' && node.attrs['mediaId'] === m.id && pos < editor.state.selection.from) found.pos = pos;
              });
              if (found.pos !== null) editor.commands.setNodeSelection(found.pos);
              setPanel(null);
            }}
          />
        )}
        {panel === 'verse' && (
          <VersePanel
            initial={verseAttrs()}
            onClose={() => { setPanel(null); }}
            onSave={(v) => {
              if (selectedNode(editor)?.type.name === 'verse') chain().updateAttributes('verse', v).run();
              else chain().insertVerse(v).run();
              setPanel(null);
            }}
          />
        )}

        <BlockSettings editor={editor} onEditVerse={() => { setPanel('verse'); }} />
        <EditorContent editor={editor} />
      </div>
    </EditorLookupsContext.Provider>
  );
}
