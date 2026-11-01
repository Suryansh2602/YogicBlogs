// Admin security settings: the setup code set from the Admin panel (stored hashed, argon2id), which
// replaces ADMIN_SETUP_CODE from the server environment while it is set. One row (id = 1).
// See docs/admin-recovery.md.
export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable('admin_security', {
    id: { type: Sequelize.TINYINT.UNSIGNED, primaryKey: true },
    setup_code_hash: { type: Sequelize.STRING(255), allowNull: true },
    // No foreign key: the record of who changed it stays even if that account is later removed.
    setup_code_changed_by: { type: Sequelize.CHAR(36), allowNull: true },
    setup_code_changed_at: { type: Sequelize.DATE, allowNull: true },
    created_at: { type: Sequelize.DATE, allowNull: false },
    updated_at: { type: Sequelize.DATE, allowNull: false },
  });
  await queryInterface.sequelize.query('ALTER TABLE `admin_security` ADD CONSTRAINT `admin_security_single_row_chk` CHECK (`id` = 1)');
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('admin_security');
}
