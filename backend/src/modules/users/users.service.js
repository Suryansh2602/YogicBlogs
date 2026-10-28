import { models } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { audit } from '../../services/audit.js';
import { publicUser } from '../auth/auth.service.js';
import * as twoFactor from '../auth/twoFactor.service.js';

async function load(userId) {
  const user = await models.User.findByPk(userId);
  if (!user) throw ApiError.unauthorized('Please sign in', 'NO_SESSION');
  return user;
}

export async function getMe(userId) {
  const user = await load(userId);
  return { user: publicUser(user, { twoFactorEnabled: await twoFactor.isEnabled(userId) }) };
}

export async function updateMe(userId, { displayName }, req) {
  const user = await load(userId);
  await user.update({ displayName });
  await audit('user.profile.updated', { req, actorId: userId, entityType: 'user', entityId: userId, metadata: { fields: ['displayName'] } });
  return { user: publicUser(user, { twoFactorEnabled: await twoFactor.isEnabled(userId) }) };
}
