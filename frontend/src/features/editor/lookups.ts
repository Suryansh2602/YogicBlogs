// What the editor's blocks look up while writing: media library items (image previews) and the titles and
// states of linked articles ("Also read" cards). Provided by the editor page.
import { createContext } from 'react';
import type { MediaItem } from '../content/api';
import type { ArticleReferenceState } from '../articles/types';

export interface EditorLookups {
  media: (id: string) => MediaItem | undefined;
  article: (id: string) => Pick<ArticleReferenceState, 'title' | 'state'> | undefined;
}

export const EditorLookupsContext = createContext<EditorLookups>({ media: () => undefined, article: () => undefined });
