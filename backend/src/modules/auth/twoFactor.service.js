import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { env } from '../../config/env.js';
import { models, sequelize } from '../../config/db.js';
import { decryptSecret, encryptSecret, hmacHex, randomToken } from '../../utils/crypto.js';

const ISSUER = 'Healthmarg';
const PERIOD = 30;
const BACKUP_CODE_COUNT = 10;
// Backup codes are hashed with a key derived from the 2FA key (separate purpose string).
const backupKey = () => hmacHex(env.TWO_FACTOR_ENC_KEY, 'backup-codes-v1');

const totpFor = (secretBase32, label) =>
  new OTPAuth.TOTP({ issuer: ISSUER, label, algorithm: 'SHA1', digits: 6, period: PERIOD, secret: OTPAuth.Secret.fromBase32(secretBase32) });

export const normaliseBackupCode = (code) => String(code).toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Start (or restart) enrolment: a new secret, stored encrypted and not yet enabled. */
export async function beginEnrolment(user) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  await models.UserTwoFactor.upsert({
    userId: user.id,
    secretEncrypted: encryptSecret(secret, env.TWO_FACTOR_ENC_KEY, user.id),
    enabledAt: null,
    lastUsedStep: null,
  });
  const otpauthUrl = totpFor(secret, user.email).toString();
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl, { margin: 1, width: 220, color: { dark: '#1F2B5E', light: '#FFFFFF' } });
  // `secret` is shown once so users without a camera can type it into their authenticator app.
  return { otpauthUrl, qrDataUrl, secret };
}

export async function isEnabled(userId) {
  const row = await models.UserTwoFactor.findByPk(userId);
  return Boolean(row?.enabledAt);
}

/**
 * Check a 6-digit TOTP code (±1 step for clock drift) and refuse replays: a code is accepted only if its
 * time-step is newer than the last accepted one. `requireEnabled=false` during enrolment.
 */
export async function verifyTotp(user, code, { requireEnabled = true, transaction } = {}) {
  if (!/^\d{6}$/.test(String(code))) return false;
  const row = await models.UserTwoFactor.scope('withSecret').findByPk(user.id, { transaction, lock: transaction?.LOCK.UPDATE });
  if (!row || (requireEnabled && !row.enabledAt)) return false;
  let secret;
  try {
    secret = decryptSecret(row.secretEncrypted, env.TWO_FACTOR_ENC_KEY, user.id);
  } catch {
    return false;
  }
  const delta = totpFor(secret, user.email).validate({ token: String(code), window: 1 });
  if (delta === null) return false;
  const step = Math.floor(Date.now() / 1000 / PERIOD) + delta;
  if (row.lastUsedStep !== null && step <= Number(row.lastUsedStep)) return false;
  await row.update({ lastUsedStep: step }, { transaction });
  return true;
}

function generateBackupCodes() {
  return Array.from({ length: BACKUP_CODE_COUNT }, () => {
    const raw = randomToken(8).toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(10, '7').slice(0, 10);
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

/** Replace all backup codes; returns the plain codes ONCE (only hashes are stored). */
export async function regenerateBackupCodes(userId, transaction) {
  const codes = generateBackupCodes();
  await models.TwoFactorBackupCode.destroy({ where: { userId }, transaction });
  await models.TwoFactorBackupCode.bulkCreate(
    codes.map((code) => ({ userId, codeHash: hmacHex(backupKey(), normaliseBackupCode(code)) })),
    { transaction },
  );
  return codes;
}

/** Confirm enrolment with a first valid code; enables 2FA and issues backup codes. */
export async function enable(user, code) {
  return sequelize.transaction(async (transaction) => {
    const ok = await verifyTotp(user, code, { requireEnabled: false, transaction });
    if (!ok) return null;
    await models.UserTwoFactor.update({ enabledAt: new Date() }, { where: { userId: user.id }, transaction });
    return regenerateBackupCodes(user.id, transaction);
  });
}

/** Single-use backup code. */
export async function useBackupCode(user, code) {
  const codeHash = hmacHex(backupKey(), normaliseBackupCode(code));
  const [updated] = await models.TwoFactorBackupCode.update(
    { usedAt: new Date() },
    { where: { userId: user.id, codeHash, usedAt: null } },
  );
  return updated === 1;
}

/** TOTP code or backup code. */
export async function verifySecondFactor(user, code) {
  const value = String(code ?? '').trim();
  if (/^\d{6}$/.test(value)) return verifyTotp(user, value);
  return useBackupCode(user, value);
}
