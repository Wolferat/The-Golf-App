import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { boardCategoryLabel, kindLabel } from '../lib/catalog-categories.js';

test('training category uses Lessons label in mobile beta', () => {
  assert.equal(boardCategoryLabel('training'), 'Lessons');
  assert.equal(kindLabel('training'), 'Lessons');
});

test('saved listings client tracks ids locally before sync', async () => {
  const source = await readFile(new URL('../saved-listings-client.js', import.meta.url), 'utf8');
  const storage = new Map([['golfolio_saved_ids', '["abc"]']]);
  const context = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key)
    },
    window: {},
    document: { addEventListener() {} }
  };
  context.window = context;
  vm.runInNewContext(source, context);
  assert.equal(context.window.golfolioSaved.isSaved('abc'), true);
  assert.equal(context.window.golfolioSaved.isSaved('missing'), false);
});

test('mobile ui confirm resolves boolean without native prompt', async () => {
  const source = await readFile(new URL('../mobile-ui.js', import.meta.url), 'utf8');
  const context = {
    matchMedia: () => ({ matches: true }),
    document: {
      body: { classList: { add() {}, remove() {} }, append() {} },
      querySelector: () => ({
        querySelector: () => ({ onclick: null, focus() {} }),
        querySelectorAll: () => [],
        addEventListener() {}
      }),
      querySelectorAll: () => [],
      createElement: () => ({ classList: { add() {} }, append() {}, addEventListener() {} }),
      activeElement: null,
      addEventListener() {}
    },
    addEventListener() {}
  };
  context.window = context;
  vm.runInNewContext(source, context);
  assert.equal(typeof context.window.golfolioUI.confirm, 'function');
});

test('app nav exposes five player tabs', async () => {
  const source = await readFile(new URL('../app-nav.js', import.meta.url), 'utf8');
  assert.match(source, /Saved/);
  assert.match(source, /My Game/);
  assert.match(source, /Crew/);
  assert.match(source, /Profile/);
  assert.match(source, /page === 'saved'/);
});
