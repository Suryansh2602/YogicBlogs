// Typed calls for content admin (conditions, media library; articles in later branches). See docs/api.md.
import { apiClient, type UploadOptions } from '../../services/apiClient';
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

export interface MediaVariant {
  width: number;
  height: number;
  /** Relative to the API base: pass it through apiUrl(). */
  url: string;
}

export interface MediaItem {
  id: string;
  kind: 'image' | 'audio';
  status: 'processing' | 'ready' | 'failed';
  altText: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  originalName: string | null;
  /** Tiny blurred WebP (data: URI) shown while the real image loads. */
  placeholder: string | null;
  variants: MediaVariant[];
  createdAt: string;
}

export interface MediaPage {
  items: MediaItem[];
  page: number;
  pageSize: number;
  total: number;
  /** The server's real upload limit (MAX_IMAGE_MB in backend/.env). */
  limits?: { maxImageMb: number };
}

/** The server's default limit, used until the library has loaded and told us the real one. */
export const MAX_IMAGE_MB = 15;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * The server's rules, checked before uploading so the admin hears at once (and a 15 MB file isn't
 * sent just to be refused). The server still sniffs the real type from the file's bytes.
 */
export function imageProblem(file: File, maxMb = MAX_IMAGE_MB): string | undefined {
  const type = file.type.toLowerCase();
  if (!IMAGE_TYPES.has(type)) {
    if (type === 'image/heic' || type === 'image/heif' || /\.hei[cf]$/i.test(file.name)) {
      return `“${file.name}” is an iPhone HEIC photo. Export it as JPEG (or set the camera to “Most Compatible”) and upload that.`;
    }
    if (type === 'image/svg+xml' || type === 'image/gif') {
      return `“${file.name}” is ${type === 'image/gif' ? 'a GIF' : 'an SVG'}. Upload a JPEG, PNG or WebP image instead.`;
    }
    return `“${file.name}” isn’t a JPEG, PNG or WebP image.`;
  }
  if (file.size > maxMb * 1024 * 1024) {
    return `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(1)} MB. Images can be up to ${maxMb} MB; resize or compress it first.`;
  }
  return undefined;
}

export const mediaApi = {
  list: (page = 1, pageSize = 24) => authed((o) => apiClient.get<MediaPage>(`/admin/media?kind=image&page=${page}&pageSize=${pageSize}`, o)),
  uploadImage: (file: File, altText: string, options: UploadOptions = {}) => {
    const form = new FormData();
    if (altText.trim()) form.append('altText', altText.trim());
    form.append('file', file);
    return authed((o) => apiClient.upload<{ media: MediaItem; deduplicated: boolean }>('/admin/media/images', form, { ...options, ...o }), options);
  },
  update: (id: string, altText: string) =>
    authed((o) => apiClient.patch<{ media: MediaItem }>(`/admin/media/${encodeURIComponent(id)}`, { altText: altText.trim() }, o)),
  remove: (id: string) => authed((o) => apiClient.delete<null>(`/admin/media/${encodeURIComponent(id)}`, o)),
};
