// Conditions: what each article is about (e.g. Migraine). Admins manage them; members browse the
// published ones. Articles must belong to one, so a condition in use can't be deleted.
import { fn, col, UniqueConstraintError } from 'sequelize';
import { models } from '../../config/db.js';
import { ApiError } from '../../utils/ApiError.js';
import { cache } from '../../utils/cache.js';
import { audit } from '../../services/audit.js';

const PUBLIC_LIST_KEY = 'conditions:list';
const PUBLIC_LIST_TTL = 3600;

/** "Lower Back Pain" → "lower-back-pain". Empty for names with no Latin letters or digits (e.g. Hindi). */
export function slugify(text) {
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

const conflict = (path, message, code) => new ApiError(409, message, [{ path, message }], code);

const toAdmin = (c, articleCount = 0) => ({
  id: c.id,
  name: c.name,
  slug: c.slug,
  summary: c.summary,
  description: c.description,
  sortOrder: c.sortOrder,
  isPublished: c.isPublished,
  articleCount,
  createdAt: c.createdAt,
  updatedAt: c.updatedAt,
});

/** Name and web address must be unique among conditions that aren't deleted (also enforced by MySQL). */
async function assertUnique({ name, slug }, exceptId) {
  const others = async (where) => {
    const found = await models.Condition.findOne({ where, attributes: ['id'] });
    return found && found.id !== exceptId;
  };
  if (name !== undefined && (await others({ name }))) {
    throw conflict('name', `A condition called "${name}" already exists. Use a different name.`, 'NAME_TAKEN');
  }
  if (slug !== undefined && (await others({ slug }))) {
    throw conflict('slug', `The web address "${slug}" is already used by another condition. Choose another.`, 'SLUG_TAKEN');
  }
}

/**
 * Two admins saving the same name at the same moment both pass assertUnique; MySQL's unique index then
 * stops the second. Give that admin the same specific message as the normal duplicate check.
 */
async function saveUnique(save, { name, slug }) {
  try {
    return await save();
  } catch (err) {
    if (!(err instanceof UniqueConstraintError)) throw err;
    // MySQL reports the index, e.g. { conditions_name_alive: 'migraine-1' } or conditions_slug_alive.
    if (Object.keys(err.fields ?? {}).some((key) => /(^|_)name(_|$)/.test(key))) {
      throw conflict('name', `A condition called "${name}" already exists. Use a different name.`, 'NAME_TAKEN');
    }
    throw conflict('slug', `The web address "${slug}" is already used by another condition. Choose another.`, 'SLUG_TAKEN');
  }
}

async function articleCounts() {
  const rows = await models.Article.findAll({
    attributes: ['conditionId', [fn('COUNT', col('id')), 'count']],
    group: ['conditionId'],
    raw: true,
  });
  return new Map(rows.map((r) => [r.conditionId, Number(r.count)]));
}

export async function listForAdmin() {
  const [conditions, counts] = await Promise.all([
    models.Condition.findAll({ order: [['sortOrder', 'ASC'], ['name', 'ASC']] }),
    articleCounts(),
  ]);
  return { items: conditions.map((c) => toAdmin(c, counts.get(c.id) ?? 0)) };
}

/** Published conditions for everyone, cached for an hour (cleared on every admin change). */
export function listPublished() {
  return cache.getOrSet(PUBLIC_LIST_KEY, PUBLIC_LIST_TTL, async () => {
    const conditions = await models.Condition.findAll({
      where: { isPublished: true },
      attributes: ['id', 'name', 'slug', 'summary', 'sortOrder'],
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
    return { items: conditions.map((c) => ({ id: c.id, name: c.name, slug: c.slug, summary: c.summary })) };
  });
}

async function findOr404(id) {
  const condition = await models.Condition.findByPk(id);
  if (!condition) throw ApiError.notFound('This condition no longer exists. It may have been deleted.');
  return condition;
}

export async function create(data, req) {
  const slug = data.slug ?? slugify(data.name);
  if (!slug) {
    const message = 'This name has no English letters to build a web address from. Type one, like "lower-back-pain".';
    throw new ApiError(400, message, [{ path: 'slug', message }], 'SLUG_REQUIRED');
  }
  await assertUnique({ name: data.name, slug });
  const condition = await saveUnique(() => models.Condition.create({ ...data, slug }), { name: data.name, slug });
  await cache.del(PUBLIC_LIST_KEY);
  await audit('condition.created', { req, actorId: req.auth.userId, entityType: 'condition', entityId: condition.id });
  return { condition: toAdmin(condition) };
}

export async function update(id, data, req) {
  const condition = await findOr404(id);
  await assertUnique({ name: data.name, slug: data.slug }, id);
  await saveUnique(() => condition.update(data), { name: data.name ?? condition.name, slug: data.slug ?? condition.slug });
  await cache.del(PUBLIC_LIST_KEY);
  await audit('condition.updated', { req, actorId: req.auth.userId, entityType: 'condition', entityId: id, metadata: { fields: Object.keys(data) } });
  const counts = await articleCounts();
  return { condition: toAdmin(condition, counts.get(id) ?? 0) };
}

export async function remove(id, req) {
  const condition = await findOr404(id);
  const inUse = await models.Article.count({ where: { conditionId: id } });
  if (inUse > 0) {
    throw new ApiError(
      409,
      `${inUse} article${inUse === 1 ? ' uses' : 's use'} this condition. Move ${inUse === 1 ? 'it' : 'them'} to another condition first.`,
      [{ path: 'articles', message: String(inUse) }],
      'CONDITION_IN_USE',
    );
  }
  await condition.destroy();
  await cache.del(PUBLIC_LIST_KEY);
  await audit('condition.deleted', { req, actorId: req.auth.userId, entityType: 'condition', entityId: id });
}
