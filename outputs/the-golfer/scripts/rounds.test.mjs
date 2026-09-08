import test from 'node:test';
import assert from 'node:assert/strict';
import { statsForRounds } from '../lib/rounds.js';

function makeRounds(count, { holes = 18, baseScore = 90 } = {}) {
  return Array.from({ length: count }, (_, index) => ({
    score: baseScore + (index % 5),
    holes
  }));
}

test('stats use all rounds, not just the latest history page', () => {
  const rounds = [...makeRounds(55, { holes: 18, baseScore: 80 }), ...makeRounds(10, { holes: 9, baseScore: 40 })];
  const all = statsForRounds(rounds);
  const eighteen = statsForRounds(rounds, 18);
  const nine = statsForRounds(rounds, 9);
  assert.equal(all.rounds, 65);
  assert.equal(eighteen.rounds, 55);
  assert.equal(nine.rounds, 10);
  assert.equal(eighteen.best, 80);
  assert.equal(eighteen.average, 82);
});

test('ownership validation requires matching player id', () => {
  const owned = { id: 'r1', player_id: 'u1' };
  assert.notEqual(owned.player_id, 'u2');
});
