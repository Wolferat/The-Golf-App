import test from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_FUNCTIONAL_TEST_URL;
const service = process.env.SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY;
const anon = process.env.SUPABASE_FUNCTIONAL_TEST_ANON_KEY;
const configured = !!(url && service && anon);

function serviceHeaders(extra = {}) {
  return {
    apikey: service,
    Authorization: `Bearer ${service}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

async function serviceRest(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: { ...serviceHeaders(), ...(options.headers || {}) }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.message || body.hint || body.error || `REST ${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

async function userRest(user, path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: anon,
      Authorization: `Bearer ${user.accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, body };
}

async function createTestUser(label) {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const email = `functional+${label}-${suffix}@example.test`;
  const password = `FnTest!${suffix}A1`;
  const username = `fn_${label}_${suffix}`.replace(/[^A-Za-z0-9_\-]/g, '_').slice(0, 24);

  const createRes = await fetch(`${url}/auth/v1/admin/users`, {
    method: 'POST',
    headers: serviceHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(created.msg || created.message || 'Could not create test user');
  const userId = created.id;

  await serviceRest('profiles', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ id: userId, username, role: 'player', social_eligibility_status: 'eligible' })
  }).catch(async () => {
    await serviceRest(`profiles?id=eq.${userId}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ username, social_eligibility_status: 'eligible' })
    });
  });

  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anon, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const session = await tokenRes.json();
  if (!tokenRes.ok) throw new Error(session.error_description || session.msg || 'Could not sign in test user');

  return { id: userId, email, password, username, accessToken: session.access_token };
}

async function deleteTestUser(userId) {
  await fetch(`${url}/auth/v1/admin/users/${userId}`, {
    method: 'DELETE',
    headers: serviceHeaders()
  }).catch(() => {});
  await serviceRest(`profiles?id=eq.${userId}`, { method: 'DELETE' }).catch(() => {});
}

async function createFixtureListing() {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const [listing] = await serviceRest('listings', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      title: `Functional fixture ${suffix}`,
      kind: 'course',
      status: 'approved',
      city: 'Sherman, TX'
    })
  });
  return listing;
}

async function invokeHandler(modulePath, { method = 'GET', body = {}, headers = {}, query = {} }) {
  process.env.SUPABASE_URL = url;
  process.env.SUPABASE_ANON_KEY = anon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = service;
  const mod = await import(`${modulePath}?test=${Date.now()}`);
  let status = 500;
  let payload = null;
  const req = {
    method,
    body,
    headers,
    query
  };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(data) {
      payload = data;
      return this;
    }
  };
  await mod.default(req, res);
  return { status, payload };
}

const run = configured ? test : test.skip;

run('RLS: cross-user saved_listings reads and writes are denied', async () => {
  const cleanup = [];
  try {
    const userA = await createTestUser('saved_a');
    const userB = await createTestUser('saved_b');
    cleanup.push(userA.id, userB.id);
    const listing = await createFixtureListing();
    cleanup.push(`listing:${listing.id}`);

    const ownSave = await userRest(userA, 'saved_listings', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ listing_id: listing.id })
    });
    assert.equal(ownSave.ok, true);

    const foreignRead = await userRest(userB, `saved_listings?user_id=eq.${userA.id}&select=listing_id`);
    assert.equal(foreignRead.ok, true);
    assert.equal(foreignRead.body.length, 0);

    const foreignWrite = await userRest(userB, 'saved_listings', {
      method: 'POST',
      body: JSON.stringify({ user_id: userA.id, listing_id: listing.id })
    });
    assert.equal(foreignWrite.ok, false);
  } finally {
    for (const id of cleanup) {
      if (String(id).startsWith('listing:')) {
        await serviceRest(`saved_listings?listing_id=eq.${id.slice(8)}`, { method: 'DELETE' }).catch(() => {});
        await serviceRest(`listings?id=eq.${id.slice(8)}`, { method: 'DELETE' }).catch(() => {});
      } else {
        await serviceRest(`saved_listings?user_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
        await deleteTestUser(id);
      }
    }
  }
});

run('RLS: blocked discovery and friend requests are denied', async () => {
  const cleanup = [];
  try {
    const userA = await createTestUser('block_a');
    const userB = await createTestUser('block_b');
    cleanup.push(userA.id, userB.id);

    await serviceRest('app_settings?id=eq.true', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ social_features_enabled: true })
    });

    await serviceRest('player_blocks', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({ blocker_id: userA.id, blocked_id: userB.id })
    });

    const { lookupExactEligiblePlayer } = await import('../lib/social-discovery.js');
    const discovery = await lookupExactEligiblePlayer(serviceRest, {
      viewerId: userB.id,
      username: userA.username,
      appSettings: { social_features_enabled: true },
      viewerProfile: { id: userB.id, social_eligibility_status: 'eligible', account_restricted: false }
    });
    assert.equal(discovery.players.length, 0);

    const friendAttempt = await invokeHandler('../api/social.js', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userB.accessToken}` },
      body: { action: 'friend_request', user_id: userA.id }
    });
    assert.equal(friendAttempt.status, 403);
  } finally {
    for (const id of cleanup) {
      await serviceRest(`player_blocks?or=(blocker_id.eq.${id},blocked_id.eq.${id})`, { method: 'DELETE' }).catch(
        () => {}
      );
      await serviceRest(`player_friendships?or=(requester_id.eq.${id},addressee_id.eq.${id})`, {
        method: 'DELETE'
      }).catch(() => {});
      await deleteTestUser(id);
    }
    await serviceRest('app_settings?id=eq.true', {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ social_features_enabled: false })
    }).catch(() => {});
  }
});

run('RLS: private storage is denied to other users', async () => {
  const cleanup = [];
  try {
    const userA = await createTestUser('storage_a');
    const userB = await createTestUser('storage_b');
    cleanup.push(userA.id, userB.id);
    const listing = await createFixtureListing();
    cleanup.push(`listing:${listing.id}`);

    const storagePath = `${userA.id}/${listing.id}/fixture.jpg`;
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    const upload = await fetch(`${url}/storage/v1/object/player-contributions/${storagePath}`, {
      method: 'POST',
      headers: {
        ...serviceHeaders({ 'Content-Type': 'image/png', 'x-upsert': 'true' })
      },
      body: png
    });
    assert.equal(upload.ok, true);

    await serviceRest('listing_photo_contributions', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        listing_id: listing.id,
        contributor_id: userA.id,
        storage_path: storagePath,
        status: 'pending'
      })
    });

    const ownerRead = await fetch(`${url}/storage/v1/object/player-contributions/${storagePath}`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${userA.accessToken}`
      }
    });
    assert.equal(ownerRead.ok, true);

    const foreignRead = await fetch(`${url}/storage/v1/object/player-contributions/${storagePath}`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${userB.accessToken}`
      }
    });
    assert.equal(foreignRead.ok, false);

    const foreignMeta = await userRest(userB, `listing_photo_contributions?contributor_id=eq.${userA.id}&select=id`);
    assert.equal(foreignMeta.ok, true);
    assert.equal(foreignMeta.body.length, 0);
  } finally {
    for (const id of cleanup) {
      if (String(id).startsWith('listing:')) {
        const listingId = id.slice(8);
        await serviceRest(`listing_photo_contributions?listing_id=eq.${listingId}`, { method: 'DELETE' }).catch(
          () => {}
        );
        await fetch(`${url}/storage/v1/object/player-contributions`, {
          method: 'DELETE',
          headers: serviceHeaders(),
          body: JSON.stringify({ prefixes: [`${listingId}`] })
        }).catch(() => {});
        await serviceRest(`listings?id=eq.${listingId}`, { method: 'DELETE' }).catch(() => {});
      } else {
        await fetch(`${url}/storage/v1/object/player-contributions`, {
          method: 'DELETE',
          headers: serviceHeaders(),
          body: JSON.stringify({ prefixes: [id] })
        }).catch(() => {});
        await deleteTestUser(id);
      }
    }
  }
});

run('deletion cleanup survives failure and retries without the deleted user session', async () => {
  const cleanup = [];
  try {
    const user = await createTestUser('delete_retry');
    cleanup.push(user.id);
    const requestId = crypto.randomUUID();
    const pendingPath = `${user.id}/fixture-listing/failed.jpg`;

    await serviceRest('account_deletion_requests', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        id: requestId,
        user_id: user.id,
        status: 'cleanup_pending',
        pending_storage_objects: [{ bucket: 'player-contributions', path: pendingPath, status: 'failed', error: 'simulated' }],
        steps: [
          { step: 'moderation_evidence', status: 'completed' },
          { step: 'owned_data_cleanup', status: 'completed' },
          { step: 'profile_scrub', status: 'completed' },
          { step: 'auth_delete', status: 'completed' },
          { step: 'storage_cleanup', status: 'failed' }
        ]
      })
    });

    await fetch(`${url}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: serviceHeaders()
    });

    const expiredSession = await fetch(`${url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { apikey: anon, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, password: user.password })
    });
    assert.equal(expiredSession.ok, false);

    const { retryDeletionCleanup, storageRemoveStrict } = await import('../lib/account-deletion.js');
    process.env.SUPABASE_URL = url;
    process.env.SUPABASE_SERVICE_ROLE_KEY = service;

    const first = await retryDeletionCleanup(serviceRest, async () => {
      throw new Error('storage unavailable');
    }, requestId, { force: true });
    assert.equal(first.ok, false);
    assert.equal(first.status, 'cleanup_pending');

    const second = await retryDeletionCleanup(serviceRest, storageRemoveStrict, requestId, { force: true });
    assert.equal(second.ok, true);
    assert.equal(second.status, 'completed');

    const [finalRequest] = await serviceRest(
      `account_deletion_requests?id=eq.${requestId}&select=status,pending_storage_objects`
    );
    assert.equal(finalRequest.status, 'completed');
    assert.equal(finalRequest.pending_storage_objects.every((item) => item.status === 'deleted'), true);
  } finally {
    for (const id of cleanup) {
      await serviceRest(`account_deletion_requests?user_id=eq.${id}`, { method: 'DELETE' }).catch(() => {});
      await deleteTestUser(id);
    }
  }
});

if (!configured) {
  test('database integration suite skipped without SUPABASE_FUNCTIONAL_TEST_URL, SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY, and SUPABASE_FUNCTIONAL_TEST_ANON_KEY', () => {
    assert.ok(true);
  });
}
