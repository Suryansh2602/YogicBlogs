// Reader article API: signed-in readers send their token; only a missing or expired session falls back to
// the anonymous (teaser) view, so a real failure is shown as an error, never as "sign in to read".
import { describe, expect, it } from 'vitest';
import { readerApi } from '../../src/features/articles/api';
import { apiError, makeUser, mockApi, session } from '../helpers/api';

const csrf = { body: { csrfToken: 'c' } };
const article = { body: { article: { slug: 'calm', title: 'Calm', locked: false } } };
const signedInBrowser = () => {
  localStorage.setItem('hm-signed-in', '1');
};

describe('reader article API', () => {
  it('asks anonymously when this browser never signed in (no refresh call)', async () => {
    const api = mockApi({ 'GET /articles/calm': article });
    await readerApi.get('calm');
    expect(api.callsTo('POST /auth/refresh')).toHaveLength(0);
    expect(api.callsTo('GET /articles/calm')[0]?.headers['Authorization']).toBeUndefined();
  });

  it('sends the token when signed in, so members articles come back in full', async () => {
    signedInBrowser();
    const api = mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/refresh': session(makeUser()), 'GET /articles/calm': article });
    await readerApi.get('calm');
    expect(api.callsTo('GET /articles/calm')[0]?.headers['Authorization']).toMatch(/^Bearer /);
  });

  it('falls back to the anonymous view when the session has expired', async () => {
    signedInBrowser();
    const api = mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/refresh': apiError(401, 'NO_SESSION'), 'GET /articles/calm': article });
    await expect(readerApi.get('calm')).resolves.toMatchObject({ article: { slug: 'calm' } });
    expect(api.callsTo('GET /articles/calm')).toHaveLength(1);
    expect(api.callsTo('GET /articles/calm')[0]?.headers['Authorization']).toBeUndefined();
  });

  it('shows a server failure as an error instead of quietly showing the members teaser', async () => {
    signedInBrowser();
    const api = mockApi({
      'GET /auth/csrf': csrf,
      'POST /auth/refresh': session(makeUser()),
      'GET /articles/calm': [apiError(503, 'UNAVAILABLE'), article],
    });
    await expect(readerApi.get('calm')).rejects.toMatchObject({ status: 503 });
    expect(api.callsTo('GET /articles/calm')).toHaveLength(1); // no anonymous retry
  });

  it('does not ask twice for an article that does not exist', async () => {
    signedInBrowser();
    const api = mockApi({ 'GET /auth/csrf': csrf, 'POST /auth/refresh': session(makeUser()), 'GET /articles/gone': apiError(404, 'NOT_FOUND') });
    await expect(readerApi.get('gone')).rejects.toMatchObject({ status: 404 });
    expect(api.callsTo('GET /articles/gone')).toHaveLength(1);
  });
});
