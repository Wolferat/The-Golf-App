import test from 'node:test';
import assert from 'node:assert/strict';

const handlerModules = [
  '../api/account.js',
  '../api/moderation.js',
  '../api/purge-evidence.js',
  '../api/deletion-cleanup.js',
  '../api/social.js',
  '../api/saved-listings.js',
  '../api/photo-contributions.js',
  '../api/location.js'
];

for (const modulePath of handlerModules) {
  test(`api handler import smoke: ${modulePath}`, async () => {
    const imported = await import(modulePath);
    assert.equal(typeof imported.default, 'function', `${modulePath} must export a default handler`);
  });
}

test('account handler resolves deletion exports from lib/account-deletion.js', async () => {
  const deletion = await import('../lib/account-deletion.js');
  for (const name of [
    'deleteAuthUser',
    'retentionDaysFromSettings',
    'verifyUserPassword',
    'listUserStoragePaths',
    'persistPendingStorageObjects',
    'retryDeletionCleanup',
    'retryPendingDeletionCleanups'
  ]) {
    assert.equal(typeof deletion[name], 'function', `${name} must be exported`);
  }
  await import('../api/account.js');
});
