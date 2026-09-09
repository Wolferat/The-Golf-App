import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EVENT_TIMEZONE,
  parseEventInput,
  instantToDatetimeLocal,
  eventEnded,
  isDateOnlyValue
} from '../lib/event-timezone.js';

test('default event timezone is America/Chicago', () => {
  assert.equal(DEFAULT_EVENT_TIMEZONE, 'America/Chicago');
});

test('date-only values round-trip without inventing a start time', () => {
  assert.equal(isDateOnlyValue('2026-09-08'), true);
  const parsed = parseEventInput('2026-09-08');
  assert.equal(parsed.dateOnly, true);
  assert.equal(parsed.value, '2026-09-08');
});

test('unchanged datetime-local input preserves previous instant', () => {
  const previous = '2026-03-08T18:00:00.000Z';
  const local = instantToDatetimeLocal(previous, DEFAULT_EVENT_TIMEZONE);
  const parsed = parseEventInput(local, { previous, timeZone: DEFAULT_EVENT_TIMEZONE });
  assert.equal(parsed.unchanged, true);
  assert.equal(parsed.value, previous);
});

test('DST spring-forward date-only expiration uses Chicago calendar day', () => {
  const ended = eventEnded(
    { starts_at: '2026-03-07', kind: 'tournament' },
    new Date('2026-03-08T05:59:00.000Z'),
    DEFAULT_EVENT_TIMEZONE
  );
  assert.equal(ended, false);
  const endedNextDay = eventEnded(
    { starts_at: '2026-03-07', kind: 'tournament' },
    new Date('2026-03-09T05:59:00.000Z'),
    DEFAULT_EVENT_TIMEZONE
  );
  assert.equal(endedNextDay, true);
});
