import test from 'node:test';
import assert from 'node:assert/strict';
import {
  allStorageDeleted,
  attemptPendingStorageCleanup,
  listUserStoragePaths,
  markDeletionCompleted,
  persistPendingStorageObjects,
  requiredStepsComplete,
  retryDeletionCleanup,
  storageObjectsFromPaths
} from '../lib/account-deletion.js';

test('storage enumeration fails closed when contribution query fails', async () => {
  const supabase = async () => {
    throw new Error('relation missing');
  };
  await assert.rejects(
    () => listUserStoragePaths(supabase, 'user-1'),
    /Could not enumerate|relation missing|Database request failed/
  );
});

test('partial storage cleanup keeps pending objects for server-side retry', async () => {
  const remove = async (bucket, path) => {
    if (path.endsWith('fail.jpg')) throw new Error('storage unavailable');
  };
  const objects = storageObjectsFromPaths([
    { bucket: 'player-contributions', path: 'u1/l1/ok.jpg' },
    { bucket: 'player-contributions', path: 'u1/l1/fail.jpg' }
  ]);
  const { objects: updated, failures } = await attemptPendingStorageCleanup(remove, objects);
  assert.equal(failures.length, 1);
  assert.equal(allStorageDeleted(updated), false);
  assert.equal(updated.find((item) => item.path.endsWith('ok.jpg')).status, 'deleted');
  assert.equal(updated.find((item) => item.path.endsWith('fail.jpg')).status, 'failed');
});

test('retry cleanup is idempotent and does not require the deleted user session', async () => {
  const state = {
    request: {
      id: 'req-1',
      status: 'cleanup_pending',
      retry_count: 0,
      next_retry_at: null,
      pending_storage_objects: storageObjectsFromPaths([
        { bucket: 'player-contributions', path: 'u1/l1/ok.jpg' },
        { bucket: 'player-contributions', path: 'u1/l1/fail.jpg' }
      ]),
      steps: [
        { step: 'moderation_evidence', status: 'completed' },
        { step: 'owned_data_cleanup', status: 'completed' },
        { step: 'profile_scrub', status: 'completed' },
        { step: 'auth_delete', status: 'completed' },
        { step: 'storage_cleanup', status: 'failed' }
      ]
    },
    removed: []
  };

  const supabase = async (path, options = {}) => {
    if (path.startsWith('account_deletion_requests?id=eq.req-1&select=')) {
      return [structuredClone(state.request)];
    }
    if (path.startsWith('account_deletion_requests?id=eq.req-1') && options.method === 'PATCH') {
      Object.assign(state.request, JSON.parse(options.body));
      return [];
    }
    throw new Error(`unexpected supabase call: ${path}`);
  };

  const removePass = { failPending: true };
  const remove = async (bucket, path) => {
    if (path.endsWith('fail.jpg') && removePass.failPending) {
      throw new Error('storage unavailable');
    }
    state.removed.push(path);
  };

  const first = await retryDeletionCleanup(supabase, remove, 'req-1', { force: true });
  assert.equal(first.ok, false);
  assert.equal(first.status, 'cleanup_pending');
  assert.equal(state.request.retry_count, 1);
  assert.equal(state.removed.length, 1);

  removePass.failPending = false;

  const second = await retryDeletionCleanup(supabase, remove, 'req-1', { force: true });
  assert.equal(second.ok, true);
  assert.equal(second.status, 'completed');
  assert.equal(state.request.status, 'completed');
  assert.equal(allStorageDeleted(state.request.pending_storage_objects), true);
  assert.equal(state.removed.length, 2);
});

test('deletion cannot complete while required steps remain unfinished', async () => {
  assert.equal(requiredStepsComplete([{ step: 'auth_delete', status: 'completed' }]), false);
  await assert.rejects(
    () => markDeletionCompleted(async () => {}, 'req-1', { steps: [] }),
    /required steps remain unfinished/
  );
});

test('owned-data cleanup failure prevents completion even when storage objects were captured', async () => {
  const failures = await (async () => {
    const supabase = async (path, options = {}) => {
      if (options.method === 'DELETE' && path.startsWith('rounds?')) {
        throw new Error('database unavailable');
      }
      return [];
    };
    const { deleteUserOwnedDataStrict } = await import('../lib/account-deletion.js');
    return deleteUserOwnedDataStrict(supabase, 'user-1');
  })();
  assert.ok(failures.some((entry) => entry.table === 'rounds'));
  assert.equal(
    requiredStepsComplete([
      { step: 'moderation_evidence', status: 'completed' },
      { step: 'owned_data_cleanup', status: 'failed' },
      { step: 'profile_scrub', status: 'completed' },
      { step: 'auth_delete', status: 'completed' }
    ]),
    false
  );
});

test('persistPendingStorageObjects stores exact paths before source rows are removed', async () => {
  let saved = null;
  const supabase = async (path, options = {}) => {
    if (path.startsWith('account_deletion_requests?id=eq.req-2') && options.method === 'PATCH') {
      saved = JSON.parse(options.body);
      return [];
    }
    throw new Error(`unexpected supabase call: ${path}`);
  };
  const objects = await persistPendingStorageObjects(supabase, 'req-2', [
    { bucket: 'review-photos', path: 'player/review.jpg' }
  ]);
  assert.equal(objects.length, 1);
  assert.deepEqual(saved.pending_storage_objects[0], {
    bucket: 'review-photos',
    path: 'player/review.jpg',
    status: 'pending'
  });
});
