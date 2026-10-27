import { z } from 'zod';
import { ACCESS_LEVEL, ARTICLE_LANGS, ARTICLE_STATUS, CARD_ACCENTS, SLUG_PATTERN } from '../../config/constants.js';

// Messages say exactly what is wrong (docs: feedback-specific-errors), counting characters where useful.
const tooLong = (field, max) => ({ error: (issue) => `${field} has ${String(issue.input).length} characters. Keep it to ${max}.` });
const id = (what) => z.uuid(`${what} is not valid.`);

const title = z.string().trim().min(1, 'Enter a title.').max(200, tooLong('The title', 200));
const accessLevel = z.enum(Object.values(ACCESS_LEVEL), { error: 'Choose who can read it: public or members.' });
const lang = z.enum(ARTICLE_LANGS, { error: 'Choose the language: en (English) or hi (Hindi).' });

/** A version the client says it started from (optimistic locking). */
const draftVersion = z.number({ error: 'Send the draftVersion you loaded.' }).int().positive();

export const createArticleSchema = z
  .object({ title: title.min(3, 'The title needs at least 3 characters.'), conditionId: id('The condition'), accessLevel: accessLevel.optional(), lang: lang.optional() })
  .strict();

/** The whole editable copy, as the editor sends it on every autosave (missing parts get defaults). */
export const draftSchema = z
  .object({
    title,
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .max(220, tooLong('The web address', 220))
      .refine((s) => s === '' || SLUG_PATTERN.test(s), 'Use only lowercase letters, numbers and single hyphens, like "calming-migraine".')
      .default(''),
    summary: z.string().trim().max(500, tooLong('The short description', 500)).default(''),
    conditionId: id('The condition'),
    accessLevel: accessLevel.default(ACCESS_LEVEL.MEMBERS),
    lang: lang.default('en'),
    accent: z.enum(CARD_ACCENTS, { error: `Choose a card colour: ${CARD_ACCENTS.join(', ')}.` }).default('saffron'),
    cover: z
      .object({
        mediaId: id('The thumbnail image').nullable().default(null),
        alt: z.string().trim().max(255, tooLong('The thumbnail’s alt text', 255)).default(''),
        focalX: z.number().int().min(0).max(100, 'The focal point is a percentage from 0 to 100.').default(50),
        focalY: z.number().int().min(0).max(100, 'The focal point is a percentage from 0 to 100.').default(50),
      })
      .strict()
      .default({ mediaId: null, alt: '', focalX: 50, focalY: 50 }),
    relatedIds: z
      .array(id('A related article'))
      .max(6, 'Choose at most 6 related articles.')
      .refine((ids) => new Set(ids.map((x) => x.toLowerCase())).size === ids.length, 'A related article is listed twice.')
      .default([]),
    seoTitle: z.string().trim().max(70, tooLong('The search-engine title', 70)).default(''),
    seoDescription: z.string().trim().max(160, tooLong('The search-engine description', 160)).default(''),
    // Checked in depth by the document allow-list (document.js).
    body: z.object({ type: z.literal('doc', 'The body must be an editor document.') }).passthrough(),
  })
  .strict();

export const saveDraftSchema = z.object({ draftVersion, draft: z.unknown() }).strict();
export const versionOnlySchema = z.object({ draftVersion }).strict();
export const confirmSchema = z.object({ confirm: z.boolean().optional() }).strict();
export const deleteSchema = z.object({ draftVersion, confirm: z.boolean().optional() }).strict();

export const articleIdParams = z.object({ id: id('This article link') }).strict();
export const revisionParams = z
  .object({ id: id('This article link'), revisionId: z.string().regex(/^[1-9]\d{0,18}$/, 'This revision link is not valid.') })
  .strict();

export const adminListQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
    status: z.enum(Object.values(ARTICLE_STATUS)).optional(),
    conditionId: id('The condition').optional(),
    q: z.string().trim().max(100, tooLong('The search', 100)).optional(),
  })
  .strict();

export const publicListQuery = z
  .object({
    condition: z.string().trim().max(140).regex(SLUG_PATTERN, 'Unknown condition.').optional(),
    q: z.string().trim().max(100, tooLong('The search', 100)).optional(),
    cursor: z.string().max(200).regex(/^[A-Za-z0-9_-]+$/, 'This page link is not valid.').optional(),
    limit: z.coerce.number().int().min(1).max(30).default(12),
  })
  .strict();

export const slugParams = z.object({ slug: z.string().max(220).regex(SLUG_PATTERN) }).strict();
