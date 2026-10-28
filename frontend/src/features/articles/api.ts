// Typed calls for articles: the public reader API and the admin editor API (docs/articles.md §5).
import { apiClient, type RequestOptions } from '../../services/apiClient';
import { authed, mightHaveSession } from '../auth/session';
import type { AdminArticle, AdminArticleListItem, ArticleDraft, ArticleListItem, ArticleStatus, ReaderArticle, RevisionSummary } from './types';

const enc = encodeURIComponent;

/** Query string from optional parameters (empty and missing ones left out). */
function toQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
  return query;
}

export const readerApi = {
  list: (params: { condition?: string; q?: string; cursor?: string; limit?: number } = {}, options?: RequestOptions) => {
    const query = toQuery(params);
    return apiClient.get<{ items: ArticleListItem[]; nextCursor: string | null }>(`/articles${query.size ? `?${query.toString()}` : ''}`, options);
  },
  /**
   * One article. Signed-in readers send their token (members articles come back in full); otherwise
   * anonymous, which gives a teaser for members articles. An old address answers { redirect }.
   */
  get: (slug: string, options?: RequestOptions) => {
    const call = (o?: RequestOptions) => apiClient.get<{ article: ReaderArticle } | { redirect: string }>(`/articles/${enc(slug)}`, o);
    return mightHaveSession() ? authed(call, options).catch(() => call(options)) : call(options);
  },
};

export interface SaveResult {
  draftVersion: number;
  savedAt: string;
  hasUnpublishedChanges: boolean;
}

export const adminArticlesApi = {
  list: (params: { page?: number; pageSize?: number; status?: ArticleStatus; conditionId?: string; q?: string } = {}) => {
    const query = toQuery(params);
    return authed((o) => apiClient.get<{ items: AdminArticleListItem[]; page: number; pageSize: number; total: number }>(`/admin/articles?${query.toString()}`, o));
  },
  create: (input: { title: string; conditionId: string; accessLevel?: 'public' | 'members'; lang?: 'en' | 'hi' }) =>
    authed((o) => apiClient.post<{ article: AdminArticle }>('/admin/articles', input, o)),
  get: (id: string) => authed((o) => apiClient.get<{ article: AdminArticle }>(`/admin/articles/${enc(id)}`, o)),
  saveDraft: (id: string, draftVersion: number, draft: ArticleDraft, options?: RequestOptions) =>
    authed((o) => apiClient.put<SaveResult>(`/admin/articles/${enc(id)}/draft`, { draftVersion, draft }, o), options),
  checklist: (id: string) => authed((o) => apiClient.get<AdminArticle['checklist']>(`/admin/articles/${enc(id)}/checklist`, o)),
  preview: (id: string) => authed((o) => apiClient.get<{ preview: ReaderArticle }>(`/admin/articles/${enc(id)}/preview`, o)),
  publish: (id: string, draftVersion: number) => authed((o) => apiClient.post<{ article: AdminArticle; warnings: AdminArticle['checklist']['problems'] }>(`/admin/articles/${enc(id)}/publish`, { draftVersion }, o)),
  unpublish: (id: string, confirm = false) => authed((o) => apiClient.post<{ article: AdminArticle }>(`/admin/articles/${enc(id)}/unpublish`, { confirm }, o)),
  archive: (id: string, confirm = false) => authed((o) => apiClient.post<{ article: AdminArticle }>(`/admin/articles/${enc(id)}/archive`, { confirm }, o)),
  discardDraft: (id: string, draftVersion: number) => authed((o) => apiClient.post<{ article: AdminArticle }>(`/admin/articles/${enc(id)}/discard-draft`, { draftVersion }, o)),
  remove: (id: string, draftVersion: number, confirm = false) =>
    authed((o) => apiClient.delete<null>(`/admin/articles/${enc(id)}`, { ...o, body: { draftVersion, confirm } })),
  revisions: (id: string) => authed((o) => apiClient.get<{ items: RevisionSummary[] }>(`/admin/articles/${enc(id)}/revisions`, o)),
  revision: (id: string, revisionId: string) =>
    authed((o) => apiClient.get<{ revision: { id: string; reason: RevisionSummary['reason']; createdAt: string; snapshot: ArticleDraft } }>(`/admin/articles/${enc(id)}/revisions/${enc(revisionId)}`, o)),
  saveRevision: (id: string) => authed((o) => apiClient.post<{ items: RevisionSummary[] }>(`/admin/articles/${enc(id)}/revisions`, undefined, o)),
  restoreRevision: (id: string, revisionId: string, draftVersion: number) =>
    authed((o) => apiClient.post<{ article: AdminArticle }>(`/admin/articles/${enc(id)}/revisions/${enc(revisionId)}/restore`, { draftVersion }, o)),
};
