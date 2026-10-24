// Shared builders for migrations. Kept outside migrations/ so the migrator doesn't load it as a migration.
// Migrations are frozen history: they must not import models, which keep changing.

export const TABLE_OPTIONS = { engine: 'InnoDB', charset: 'utf8mb4', collate: 'utf8mb4_0900_ai_ci' };

export const uuidPk = (Sequelize) => ({ type: Sequelize.UUID, allowNull: false, primaryKey: true });

export const fk = (Sequelize, table, { allowNull = false, onDelete = 'CASCADE', primaryKey = false } = {}) => ({
  type: Sequelize.UUID,
  allowNull,
  primaryKey,
  references: { model: table, key: 'id' },
  onUpdate: 'CASCADE',
  onDelete,
});

export const timestamps = (Sequelize, { updated = true, deleted = false } = {}) => ({
  created_at: { type: Sequelize.DATE, allowNull: false },
  ...(updated && { updated_at: { type: Sequelize.DATE, allowNull: false } }),
  ...(deleted && { deleted_at: { type: Sequelize.DATE, allowNull: true } }),
});

const ident = (name) => {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `\`${name}\``;
};
const literal = (value) => {
  if (!/^[a-z0-9_]+$/.test(value)) throw new Error(`Unsafe CHECK value: ${value}`);
  return `'${value}'`;
};

/**
 * Unique among non-deleted rows only. `alive` is 1 while deleted_at IS NULL and NULL after a soft delete;
 * MySQL unique indexes ignore NULLs, so a soft-deleted row no longer blocks its slug/email.
 */
export async function addAliveColumn(queryInterface, table) {
  await queryInterface.sequelize.query(
    `ALTER TABLE ${ident(table)} ADD COLUMN \`alive\` TINYINT GENERATED ALWAYS AS (IF(\`deleted_at\` IS NULL, 1, NULL)) VIRTUAL`,
  );
}

export async function addAliveUnique(queryInterface, table, column) {
  await queryInterface.sequelize.query(
    `ALTER TABLE ${ident(table)} ADD UNIQUE INDEX ${ident(`${table}_${column}_alive`)} (${ident(column)}, \`alive\`)`,
  );
}

/** Database-level allow-list for a status/role column (mirrors src/config/constants.js at this point in history). */
export async function addCheckIn(queryInterface, table, column, values) {
  await queryInterface.sequelize.query(
    `ALTER TABLE ${ident(table)} ADD CONSTRAINT ${ident(`${table}_${column}_chk`)} CHECK (${ident(column)} IN (${values.map(literal).join(', ')}))`,
  );
}
