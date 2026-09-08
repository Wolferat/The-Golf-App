export const DEFAULT_EVENT_TIMEZONE = 'America/Chicago';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnlyValue(value) {
  return DATE_ONLY_RE.test(String(value || '').trim());
}

export function listingEventTimezone(listing = {}) {
  return String(listing.event_timezone || DEFAULT_EVENT_TIMEZONE).trim() || DEFAULT_EVENT_TIMEZONE;
}

function partsInZone(instant, timeZone) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });
  const parts = Object.fromEntries(formatter.formatToParts(instant).map((p) => [p.type, p.value]));
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute
  };
}

/** Convert stored ISO instant to datetime-local input value in listing timezone. */
export function instantToDatetimeLocal(value, timeZone = DEFAULT_EVENT_TIMEZONE) {
  if (!value) return '';
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return '';
  const p = partsInZone(instant, timeZone);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Convert stored date-only YYYY-MM-DD to date input value. */
export function storedDateToInput(value) {
  if (!value) return '';
  if (isDateOnlyValue(value)) return value;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return '';
  return instant.toISOString().slice(0, 10);
}

function offsetMinutesForZone(instant, timeZone) {
  const p = partsInZone(instant, timeZone);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute)
  );
  return (asUtc - instant.getTime()) / 60000;
}

/** Parse admin datetime-local or date-only input without shifting unchanged values. */
export function parseEventInput(value, { previous = null, timeZone = DEFAULT_EVENT_TIMEZONE } = {}) {
  const raw = String(value ?? '').trim();
  if (!raw) return { value: null, dateOnly: false, unchanged: previous == null && !raw };

  if (isDateOnlyValue(raw)) {
    if (previous && isDateOnlyValue(previous) && previous === raw) {
      return { value: previous, dateOnly: true, unchanged: true };
    }
    return { value: raw, dateOnly: true, unchanged: false };
  }

  const match = raw.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!match) throw new Error('Event date/time must be YYYY-MM-DD or a valid datetime-local value.');

  const [, datePart, hour, minute] = match;
  const probe = new Date(`${datePart}T12:00:00.000Z`);
  const offsetMinutes = offsetMinutesForZone(probe, timeZone);
  const utcMs =
    Date.UTC(
      Number(datePart.slice(0, 4)),
      Number(datePart.slice(5, 7)) - 1,
      Number(datePart.slice(8, 10)),
      Number(hour),
      Number(minute)
    ) - offsetMinutes * 60000;
  const iso = new Date(utcMs).toISOString();

  if (previous && !isDateOnlyValue(previous)) {
    const prevMs = new Date(previous).getTime();
    if (Number.isFinite(prevMs) && Math.abs(prevMs - utcMs) < 1000) {
      return { value: previous, dateOnly: false, unchanged: true };
    }
  }

  return { value: iso, dateOnly: false, unchanged: false };
}

export function formatEventDisplay(value, { timeZone = DEFAULT_EVENT_TIMEZONE, dateOnly = false } = {}) {
  if (!value) return '';
  if (dateOnly || isDateOnlyValue(value)) {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(new Date(`${value}T12:00:00`));
  }
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(value));
}

/** Expiration helper honoring date-only events in listing timezone. */
export function eventEnded({ starts_at, ends_at, kind }, now = new Date(), timeZone = DEFAULT_EVENT_TIMEZONE) {
  if (ends_at) {
    if (isDateOnlyValue(ends_at)) {
      const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
      return today > ends_at;
    }
    return new Date(ends_at).getTime() < now.getTime();
  }
  if (!starts_at) return false;
  if (isDateOnlyValue(starts_at)) {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    return today > starts_at;
  }
  return new Date(starts_at).getTime() < now.getTime();
}
