// Typed calls for content admin (conditions now; articles and media in later branches). See docs/api.md.
import { apiClient } from '../../services/apiClient';
import { authed } from '../auth/session';

export interface Condition {
  id: string;
  name: string;
  slug: string;
  summary: string | null;
  description: string | null;
  sortOrder: number;
  isPublished: boolean;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConditionInput {
  name: string;
  slug?: string;
  summary?: string;
  sortOrder?: number;
  isPublished?: boolean;
}

export const conditionsApi = {
  list: () => authed((o) => apiClient.get<{ items: Condition[] }>('/admin/conditions', o)),
  create: (input: ConditionInput) => authed((o) => apiClient.post<{ condition: Condition }>('/admin/conditions', input, o)),
  update: (id: string, input: Partial<ConditionInput>) =>
    authed((o) => apiClient.patch<{ condition: Condition }>(`/admin/conditions/${encodeURIComponent(id)}`, input, o)),
  remove: (id: string) => authed((o) => apiClient.delete<null>(`/admin/conditions/${encodeURIComponent(id)}`, o)),
};

/** Same rule as the server's slugify: "Lower Back Pain" → "lower-back-pain"; "" for non-Latin names. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140)
    .replace(/-+$/, '');
}

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
