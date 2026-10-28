import { z } from 'zod';
import { IMAGE_WIDTHS, MEDIA_KIND } from '../../config/constants.js';

const altText = z
  .string()
  .trim()
  .max(255, { error: (issue) => `The alt text has ${String(issue.input).length} characters. Keep it to 255.` });

/** Multipart text fields arrive as strings; only altText is allowed. */
export const uploadFieldsSchema = z.object({ altText: altText.optional() }).strict();

export const updateMediaSchema = z.object({ altText }).strict();

export const mediaIdParams = z.object({ id: z.uuid('This file link is not valid.') }).strict();

export const listMediaQuery = z
  .object({
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(40),
    kind: z.enum(Object.values(MEDIA_KIND)).optional(),
  })
  .strict();

/**
 * Public image URL: /media/i/<uuid>/<width>. The width must be one the image was stored at: one of
 * IMAGE_WIDTHS, or the original width when the image is narrower than the largest rendition.
 */
export const imageParams = z
  .object({
    id: z.uuid(),
    width: z
      .string()
      .regex(/^[1-9]\d{0,3}$/)
      .refine((w) => Number(w) <= IMAGE_WIDTHS.at(-1)),
  })
  .strict();
