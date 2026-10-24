import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { validate } from '../../src/middlewares/validate.js';

describe('validate', () => {
  const schema = z.object({ title: z.string().min(3) });

  it('replaces the body with parsed data and strips unknown keys', () => {
    const req = { body: { title: 'Migraine', isAdmin: true } };
    const next = vi.fn();
    validate({ body: schema })(req, {}, next);
    expect(req.body).toEqual({ title: 'Migraine' });
    expect(next).toHaveBeenCalledOnce();
  });

  it('throws on invalid input so the error handler can respond', () => {
    const req = { body: { title: 'x' } };
    expect(() => validate({ body: schema })(req, {}, vi.fn())).toThrow();
  });
});
