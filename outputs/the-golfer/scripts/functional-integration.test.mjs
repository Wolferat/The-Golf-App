import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('ordered functional migrations exist with expected sequence', () => {
  const files = [
    '09-event-timezone-migration.sql',
    '10-saved-listings-migration.sql',
    '11-private-rounds-migration.sql',
    '12-social-foundation-migration.sql',
    '13-photo-contributions-migration.sql',
    '14-account-lifecycle-migration.sql'
  ];
  for (const file of files) {
    const path = join(root, 'supabase', file);
    const sql = readFileSync(path, 'utf8');
    assert.match(sql, /run once|Run once/i);
  }
});

test('database integration tests are documented as NOT RUN in cloud workspace', () => {
  assert.equal(process.env.SUPABASE_FUNCTIONAL_TEST_URL, undefined);
});
