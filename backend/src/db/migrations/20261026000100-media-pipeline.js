// Media pipeline (content plan, branch 2): processing status, a tiny blurred placeholder, where the file is
// stored (local disk now, Cloudflare R2 later), an allow-list of the formats we produce, and an index to
// find duplicate uploads by checksum.
import { addCheckIn } from '../migrationHelpers.js';

// Formats the pipeline *outputs* (images are always re-encoded to WebP). Video is added in branch 7.
const MIME_TYPES = ['image/webp', 'audio/mpeg', 'audio/mp4', 'audio/ogg', 'audio/webm'];

export async function up({ queryInterface, Sequelize }) {
  await queryInterface.addColumn('media', 'status', { type: Sequelize.STRING(12), allowNull: false, defaultValue: 'ready' });
  await queryInterface.addColumn('media', 'failure_reason', { type: Sequelize.STRING(64), allowNull: true });
  // data:image/webp;base64,… of a ~16 px preview (≤ 400 bytes before base64).
  await queryInterface.addColumn('media', 'placeholder', { type: Sequelize.STRING(700), allowNull: true });
  await queryInterface.addColumn('media', 'storage_backend', { type: Sequelize.STRING(8), allowNull: false, defaultValue: 'local' });

  await addCheckIn(queryInterface, 'media', 'status', ['processing', 'ready', 'failed']);
  await addCheckIn(queryInterface, 'media', 'storage_backend', ['local', 'r2']);
  // Fixed constant list (not user input); addCheckIn only takes [a-z0-9_] values, and MIME types contain "/".
  await queryInterface.sequelize.query(
    `ALTER TABLE \`media\` ADD CONSTRAINT \`media_mime_type_chk\` CHECK (\`mime_type\` IN (${MIME_TYPES.map((m) => `'${m}'`).join(', ')}))`,
  );
  await queryInterface.addIndex('media', ['checksum_sha256', 'kind'], { name: 'media_checksum_kind' });
}

export async function down({ queryInterface }) {
  await queryInterface.removeIndex('media', 'media_checksum_kind');
  for (const name of ['media_mime_type_chk', 'media_storage_backend_chk', 'media_status_chk']) {
    await queryInterface.sequelize.query(`ALTER TABLE \`media\` DROP CHECK \`${name}\``);
  }
  for (const column of ['storage_backend', 'placeholder', 'failure_reason', 'status']) {
    await queryInterface.removeColumn('media', column);
  }
}
