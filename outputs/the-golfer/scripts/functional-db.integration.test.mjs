import test from 'node:test';
import assert from 'node:assert/strict';

const url = process.env.SUPABASE_FUNCTIONAL_TEST_URL;
const service = process.env.SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY;
const configured = !!(url && service);

async function rest(path, options = {}) {
  const response = await fetch(`${url}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body.message || body.hint || `REST ${response.status}`);
  }
  return body;
}

const run = configured ? test : test.skip;

run('isolated database: saved_listings ownership uniqueness', async () => {
  const users = await rest('profiles?select=id&limit=2');
  assert.ok(users.length >= 2, 'Need at least two profiles in functional test database');
  const [a, b] = users;
  const listings = await rest("listings?status=eq.approved&select=id&limit=1");
  assert.ok(listings[0]?.id, 'Need one approved listing');
  const listingId = listings[0].id;
  await rest(`saved_listings?user_id=eq.${a.id}&listing_id=eq.${listingId}`, { method: 'DELETE' }).catch(() => {});
  await rest('saved_listings', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: a.id, listing_id: listingId })
  });
  const dup = await fetch(`${url}/rest/v1/saved_listings`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation'
    },
    body: JSON.stringify({ user_id: a.id, listing_id: listingId })
  });
  assert.ok(dup.ok);
  const foreign = await fetch(`${url}/rest/v1/saved_listings`, {
    method: 'POST',
    headers: {
      apikey: service,
      Authorization: `Bearer ${service}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ user_id: b.id, listing_id: listingId })
  });
  assert.ok(foreign.ok);
  await rest(`saved_listings?user_id=eq.${a.id}&listing_id=eq.${listingId}`, { method: 'DELETE' });
  await rest(`saved_listings?user_id=eq.${b.id}&listing_id=eq.${listingId}`, { method: 'DELETE' });
});

run('isolated database: player_blocks prevents discovery relationship', async () => {
  const users = await rest('profiles?select=id&limit=2');
  const [a, b] = users;
  await rest(`player_blocks?blocker_id=eq.${a.id}&blocked_id=eq.${b.id}`, { method: 'DELETE' }).catch(() => {});
  await rest('player_blocks', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ blocker_id: a.id, blocked_id: b.id })
  });
  const blocks = await rest(
    `player_blocks?or=(and(blocker_id.eq.${a.id},blocked_id.eq.${b.id}),and(blocker_id.eq.${b.id},blocked_id.eq.${a.id}))&select=blocker_id`
  );
  assert.equal(blocks.length, 1);
  await rest(`player_blocks?blocker_id=eq.${a.id}&blocked_id=eq.${b.id}`, { method: 'DELETE' });
});

run('isolated database: account deletion request records step status', async () => {
  const [user] = await rest('profiles?select=id&limit=1');
  assert.ok(user?.id);
  const [request] = await rest('account_deletion_requests', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ user_id: user.id, status: 'processing', steps: [{ step: 'test', status: 'completed' }] })
  });
  assert.equal(request.status, 'processing');
  assert.ok(Array.isArray(request.steps));
  await rest(`account_deletion_requests?id=eq.${request.id}`, { method: 'DELETE' });
});

if (!configured) {
  test('database integration suite skipped without SUPABASE_FUNCTIONAL_TEST_URL and SUPABASE_FUNCTIONAL_TEST_SERVICE_ROLE_KEY', () => {
    assert.ok(true);
  });
}
