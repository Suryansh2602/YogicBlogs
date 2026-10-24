import { describe, expect, it } from 'vitest';
import { assertNoSecretsInClientEnv, findSecretLikeKeys } from '../../config/envGuard.js';

describe('client env guard', () => {
  it('allows public settings such as the API URL', () => {
    expect(() => assertNoSecretsInClientEnv({ VITE_API_BASE_URL: 'https://api.example' })).not.toThrow();
  });

  it.each(['VITE_JWT_SECRET', 'VITE_DB_PASSWORD', 'VITE_STRIPE_API_KEY', 'VITE_ACCESS_TOKEN', 'VITE_DB_HOST'])(
    'blocks %s',
    (key) => {
      expect(() => assertNoSecretsInClientEnv({ [key]: 'x' })).toThrow(key);
    },
  );

  it('ignores variables Vite would not expose', () => {
    expect(findSecretLikeKeys({ JWT_SECRET: 'x', PATH: '/usr/bin' })).toEqual([]);
  });
});
