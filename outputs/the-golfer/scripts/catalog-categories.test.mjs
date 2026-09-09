import test from 'node:test';
import assert from 'node:assert/strict';
import {
  kindsForBoardCategory,
  kindMatchesBoardCategory,
  filterListingsByBoardCategory,
  filterListingsByKindPrefs,
  boardCategoryForKind
} from '../lib/catalog-categories.js';

test('tournaments category includes charity and corporate kinds', () => {
  assert.deepEqual(kindsForBoardCategory('tournament'), ['tournament', 'charity', 'corporate']);
});

test('training category excludes driving-range pseudo kind', () => {
  assert.deepEqual(kindsForBoardCategory('training'), ['training']);
});

test('board category filters apply consistently', () => {
  const listings = [
    { id: '1', kind: 'course' },
    { id: '2', kind: 'charity' },
    { id: '3', kind: 'training' }
  ];
  const tournaments = filterListingsByBoardCategory(listings, 'tournament');
  assert.deepEqual(
    tournaments.map((row) => row.kind),
    ['charity']
  );
  assert.equal(kindMatchesBoardCategory('corporate', 'tournament'), true);
  assert.equal(boardCategoryForKind('charity'), 'tournament');
});

test('user kind prefs hide disabled categories including tournament group', () => {
  const listings = [
    { kind: 'course' },
    { kind: 'tournament' },
    { kind: 'charity' },
    { kind: 'simulator' }
  ];
  const filtered = filterListingsByKindPrefs(listings, {
    show_courses: true,
    show_tournaments: false,
    show_training: true,
    show_simulators: true
  });
  assert.deepEqual(filtered.map((row) => row.kind), ['course', 'simulator']);
});
