// The audit log lives in its own database (AUDIT_DB_NAME, e.g. healthmarg_audit) where the
// runtime app user only has INSERT and SELECT: it can add entries but never edit or delete them.
// Raw SQL so the cross-database table name is explicit. No foreign key to users on purpose.
const ident = (name) => {
  if (!/^[A-Za-z0-9_]+$/.test(name)) throw new Error(`Unsafe SQL identifier: ${name}`);
  return `\`${name}\``;
};

export async function up({ sequelize, auditDatabase }) {
  await sequelize.query(`
    CREATE TABLE ${ident(auditDatabase)}.\`audit_logs\` (
      \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      \`actor_id\` CHAR(36) BINARY NULL,
      \`action\` VARCHAR(64) NOT NULL,
      \`entity_type\` VARCHAR(64) NULL,
      \`entity_id\` VARCHAR(64) NULL,
      \`request_id\` VARCHAR(64) NULL,
      \`ip\` VARCHAR(45) NULL,
      \`user_agent\` VARCHAR(512) NULL,
      \`metadata\` JSON NULL,
      \`created_at\` DATETIME NOT NULL,
      INDEX \`audit_logs_actor\` (\`actor_id\`, \`created_at\`),
      INDEX \`audit_logs_entity\` (\`entity_type\`, \`entity_id\`),
      INDEX \`audit_logs_action\` (\`action\`, \`created_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci
  `);
}

export async function down({ sequelize, auditDatabase }) {
  await sequelize.query(`DROP TABLE IF EXISTS ${ident(auditDatabase)}.\`audit_logs\``);
}
