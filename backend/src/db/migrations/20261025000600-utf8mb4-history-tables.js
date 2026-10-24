// Databases created before the migrator used its own history model got `schema_migrations` /
// `schema_seeds` in the legacy utf8 (utf8mb3) charset. Convert them so every table is utf8mb4.
// Idempotent: converting an already-utf8mb4 table is a no-op.
const TABLES = ['schema_migrations', 'schema_seeds'];

export async function up({ sequelize }) {
  const [rows] = await sequelize.query(
    'SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN (:tables)',
    { replacements: { tables: TABLES } },
  );
  for (const { name } of rows) {
    if (!TABLES.includes(name)) continue;
    await sequelize.query(`ALTER TABLE \`${name}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`);
  }
}

export async function down() {
  // Intentionally a no-op: never convert back to the legacy charset.
}
