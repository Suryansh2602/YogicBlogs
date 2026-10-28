import { TABLE_OPTIONS, addCheckIn, fk, timestamps, uuidPk } from '../migrationHelpers.js';

export async function up({ queryInterface, Sequelize }) {
  await queryInterface.createTable(
    'oauth_accounts',
    {
      id: uuidPk(Sequelize),
      user_id: fk(Sequelize, 'users'),
      provider: { type: Sequelize.STRING(32), allowNull: false },
      provider_user_id: { type: Sequelize.STRING(255), allowNull: false },
      email: { type: Sequelize.STRING(254), allowNull: true },
      ...timestamps(Sequelize),
    },
    TABLE_OPTIONS,
  );
  await addCheckIn(queryInterface, 'oauth_accounts', 'provider', ['google']);
  await queryInterface.addIndex('oauth_accounts', ['provider', 'provider_user_id'], {
    unique: true,
    name: 'oauth_accounts_provider_user',
  });
  await queryInterface.addIndex('oauth_accounts', ['user_id', 'provider'], {
    unique: true,
    name: 'oauth_accounts_user_provider',
  });

  await queryInterface.createTable(
    'refresh_tokens',
    {
      id: uuidPk(Sequelize),
      user_id: fk(Sequelize, 'users'),
      family_id: { type: Sequelize.UUID, allowNull: false },
      token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      family_expires_at: { type: Sequelize.DATE, allowNull: false },
      amr: { type: Sequelize.STRING(32), allowNull: true },
      revoked_at: { type: Sequelize.DATE, allowNull: true },
      revoked_reason: { type: Sequelize.STRING(32), allowNull: true },
      replaced_by_id: { type: Sequelize.UUID, allowNull: true },
      ip: { type: Sequelize.STRING(45), allowNull: true },
      user_agent: { type: Sequelize.STRING(512), allowNull: true },
      ...timestamps(Sequelize),
    },
    TABLE_OPTIONS,
  );
  await queryInterface.addIndex('refresh_tokens', ['user_id'], { name: 'refresh_tokens_user' });
  await queryInterface.addIndex('refresh_tokens', ['family_id'], { name: 'refresh_tokens_family' });
  await queryInterface.addIndex('refresh_tokens', ['expires_at'], { name: 'refresh_tokens_expires' });

  await queryInterface.createTable(
    'user_two_factor',
    {
      user_id: fk(Sequelize, 'users', { primaryKey: true }),
      secret_encrypted: { type: Sequelize.STRING(512), allowNull: false },
      enabled_at: { type: Sequelize.DATE, allowNull: true },
      last_used_step: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      ...timestamps(Sequelize),
    },
    TABLE_OPTIONS,
  );

  await queryInterface.createTable(
    'two_factor_backup_codes',
    {
      id: uuidPk(Sequelize),
      user_id: fk(Sequelize, 'users'),
      code_hash: { type: Sequelize.CHAR(64), allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize, { updated: false }),
    },
    TABLE_OPTIONS,
  );
  await queryInterface.addIndex('two_factor_backup_codes', ['user_id'], { name: 'two_factor_backup_codes_user' });

  await queryInterface.createTable(
    'auth_tokens',
    {
      id: uuidPk(Sequelize),
      user_id: fk(Sequelize, 'users'),
      purpose: { type: Sequelize.STRING(32), allowNull: false },
      token_hash: { type: Sequelize.CHAR(64), allowNull: false, unique: true },
      new_email: { type: Sequelize.STRING(254), allowNull: true },
      expires_at: { type: Sequelize.DATE, allowNull: false },
      used_at: { type: Sequelize.DATE, allowNull: true },
      ...timestamps(Sequelize, { updated: false }),
    },
    TABLE_OPTIONS,
  );
  await addCheckIn(queryInterface, 'auth_tokens', 'purpose', ['email_verification', 'password_reset', 'email_change']);
  await queryInterface.addIndex('auth_tokens', ['user_id', 'purpose'], { name: 'auth_tokens_user_purpose' });

  await queryInterface.createTable(
    'user_consents',
    {
      id: uuidPk(Sequelize),
      user_id: fk(Sequelize, 'users'),
      kind: { type: Sequelize.STRING(32), allowNull: false },
      version: { type: Sequelize.STRING(20), allowNull: false },
      accepted_at: { type: Sequelize.DATE, allowNull: false },
      withdrawn_at: { type: Sequelize.DATE, allowNull: true },
      ip: { type: Sequelize.STRING(45), allowNull: true },
      ...timestamps(Sequelize),
    },
    TABLE_OPTIONS,
  );
  await addCheckIn(queryInterface, 'user_consents', 'kind', ['terms', 'privacy', 'marketing']);
  await queryInterface.addIndex('user_consents', ['user_id', 'kind'], { name: 'user_consents_user_kind' });
}

export async function down({ queryInterface }) {
  for (const table of ['user_consents', 'auth_tokens', 'two_factor_backup_codes', 'user_two_factor', 'refresh_tokens', 'oauth_accounts']) {
    await queryInterface.dropTable(table);
  }
}
