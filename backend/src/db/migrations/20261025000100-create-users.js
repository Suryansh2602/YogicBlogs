import { TABLE_OPTIONS, addAliveColumn, addAliveUnique, addCheckIn, timestamps, uuidPk } from '../migrationHelpers.js';

export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable(
    'users',
    {
      id: uuidPk(Sequelize),
      email: { type: Sequelize.STRING(254), allowNull: false },
      email_verified_at: { type: Sequelize.DATE, allowNull: true },
      password_hash: { type: Sequelize.STRING(255), allowNull: true },
      display_name: { type: Sequelize.STRING(80), allowNull: false },
      avatar_url: { type: Sequelize.STRING(2048), allowNull: true },
      role: { type: Sequelize.STRING(32), allowNull: false, defaultValue: 'user' },
      status: { type: Sequelize.STRING(16), allowNull: false, defaultValue: 'active' },
      token_version: { type: Sequelize.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
      last_login_at: { type: Sequelize.DATE, allowNull: true },
      password_changed_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize, { deleted: true }),
    },
    TABLE_OPTIONS,
  );
  await addAliveColumn(queryInterface, 'users');
  await addAliveUnique(queryInterface, 'users', 'email');
  await addCheckIn(queryInterface, 'users', 'role', ['user', 'admin']);
  await addCheckIn(queryInterface, 'users', 'status', ['active', 'suspended']);
  await queryInterface.addIndex('users', ['role'], { name: 'users_role' });
}

export async function down({ queryInterface }) {
  await queryInterface.dropTable('users');
}
