import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:fs/promises', () => ({ mkdir: vi.fn(), writeFile: vi.fn() }));
const sendMailSmtp = vi.fn();
vi.mock('nodemailer', () => ({ default: { createTransport: vi.fn(() => ({ sendMail: sendMailSmtp })) } }));

const { mkdir, writeFile } = await import('node:fs/promises');
const { appLink, sendMail } = await import('../../src/services/mailer.js');

describe('mailer (outbox mode)', () => {
  beforeEach(() => {
    vi.mocked(writeFile).mockResolvedValue();
    vi.mocked(mkdir).mockResolvedValue();
  });

  it('builds links from APP_URL only, with encoded parameters', () => {
    expect(appLink('/verify-email', { token: 'a b&c' })).toBe('http://localhost:5173/verify-email?token=a+b%26c');
  });

  it.each([
    ['verifyEmail', 'confirm your email address'],
    ['alreadyRegistered', 'Sign in'],
    ['resetPassword', 'Choose a new password'],
    ['passwordChanged', 'password was just changed'],
    ['sessionAlert', 'old sign-in token'],
  ])('writes the %s email to the outbox', async (template, text) => {
    await sendMail(template, 'meera@example.com', { name: 'Meera', url: 'http://localhost:5173/x?token=t' });
    const [file, html] = vi.mocked(writeFile).mock.calls.at(-1);
    expect(file.endsWith(`${template}-meera@example.com.html`)).toBe(true);
    expect(html).toContain(text);
    expect(html).toContain('Health<span');
  });

  it('escapes user-controlled text so a display name cannot inject HTML', async () => {
    await sendMail('verifyEmail', 'x@example.com', { name: '<img src=x onerror=alert(1)>', url: 'http://localhost:5173/v?a="b"' });
    const [, html] = vi.mocked(writeFile).mock.calls.at(-1);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('a=&quot;b&quot;');
  });

  it('keeps hostile characters out of the outbox file name', async () => {
    await sendMail('passwordChanged', '../../etc/passwd@example.com', { name: 'X' });
    const [file] = vi.mocked(writeFile).mock.calls.at(-1);
    expect(file.split(/[\\/]/).at(-1)).toMatch(/^[\w.@-]+\.html$/);
    expect(file).toMatch(/outbox[\\/][^\\/]+$/);
  });

  it('sends nothing at all while email features are switched off', async () => {
    const previous = process.env.EMAIL_ENABLED;
    process.env.EMAIL_ENABLED = 'false';
    try {
      vi.resetModules();
      const fsp = await import('node:fs/promises');
      const { sendMail: sendMailOff } = await import('../../src/services/mailer.js');
      await sendMailOff('verifyEmail', 'x@example.com', { name: 'X', url: 'http://localhost:5173/v' });
      expect(fsp.writeFile).not.toHaveBeenCalled();
      expect(fsp.mkdir).not.toHaveBeenCalled();
      expect(sendMailSmtp).not.toHaveBeenCalled();
    } finally {
      process.env.EMAIL_ENABLED = previous;
      vi.resetModules();
    }
  });

  it('never throws, so a mail failure cannot break sign-up', async () => {
    vi.mocked(writeFile).mockRejectedValueOnce(new Error('disk full'));
    await expect(sendMail('passwordChanged', 'x@example.com', { name: 'X' })).resolves.toBeUndefined();
    expect(sendMailSmtp).not.toHaveBeenCalled();
  });
});
