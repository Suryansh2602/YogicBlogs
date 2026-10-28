import { z } from 'zod';
import { SLUG_PATTERN } from '../../config/constants.js';

// Messages say exactly what is wrong (docs: feedback-specific-errors), counting characters where useful.
const tooLong = (field, max) => ({ error: (issue) => `${field} has ${String(issue.input).length} characters. Keep it to ${max}.` });

const name = z.string().trim().min(1, 'Enter a name, like "Migraine".').max(120, tooLong('The name', 120));
const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Enter a web address, like "lower-back-pain".')
  .max(140, tooLong('The web address', 140))
  .regex(SLUG_PATTERN, 'Use only lowercase letters, numbers and single hyphens, like "lower-back-pain".');
const summary = z.string().trim().max(500, tooLong('The summary', 500));
const description = z.string().trim().max(5000, tooLong('The description', 5000));
const sortOrder = z.number().int('Use a whole number for the order.').min(-1000).max(1000);

const fields = {
  name,
  slug: slug.optional(),
  summary: summary.optional(),
  description: description.optional(),
  sortOrder: sortOrder.optional(),
  isPublished: z.boolean().optional(),
};

export const createConditionSchema = z.object(fields).strict();

export const updateConditionSchema = z
  .object({ ...fields, name: name.optional() })
  .strict()
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change: send at least one field.');

export const conditionIdParams = z.object({ id: z.uuid('This condition link is not valid.') }).strict();
