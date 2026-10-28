// Development sample data: a few published conditions so the frontend has something to show.
// Refused in production by src/db/cli.js.
import { v7 as uuidv7 } from 'uuid';

const CONDITIONS = [
  { name: 'Migraine', slug: 'migraine', summary: 'Recurring headaches, their triggers and calming practices.' },
  { name: 'Insomnia', slug: 'insomnia', summary: 'Difficulty sleeping and evening routines that help.' },
  { name: 'Acidity', slug: 'acidity', summary: 'Digestive heat, diet and cooling breathwork.' },
  { name: 'Lower Back Pain', slug: 'lower-back-pain', summary: 'Posture, gentle asanas and daily care.' },
  { name: 'Stress & Anxiety', slug: 'stress-anxiety', summary: 'Calming the nervous system with breath and routine.' },
];

export async function up({ queryInterface }) {
  const now = new Date();
  await queryInterface.bulkInsert(
    'conditions',
    CONDITIONS.map((c, i) => ({
      id: uuidv7(),
      ...c,
      description: null,
      sort_order: i,
      is_published: true,
      created_at: now,
      updated_at: now,
    })),
  );
}

export async function down({ queryInterface }) {
  await queryInterface.bulkDelete('conditions', { slug: CONDITIONS.map((c) => c.slug) });
}
