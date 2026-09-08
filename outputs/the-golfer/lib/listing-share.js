import { listingEventTimezone, formatEventDisplay, isDateOnlyValue } from './event-timezone.js';

export function listingShareUrl(listingId, origin = '') {
  const base = String(origin || '').replace(/\/+$/, '');
  return `${base}/listing?id=${encodeURIComponent(listingId)}`;
}

export function buildListingIcs(listing, origin = '') {
  if (!listing?.starts_at && !listing?.ends_at) return null;
  const tz = listingEventTimezone(listing);
  const uid = `${listing.id}@golfolio`;
  const dtstamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const fmt = (value, dateOnly = false) => {
    if (!value) return null;
    if (dateOnly || isDateOnlyValue(value)) return String(value).replace(/-/g, '');
    return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  };
  const start = fmt(listing.starts_at, listing.starts_at_date_only);
  const end = fmt(listing.ends_at || listing.starts_at, listing.ends_at_date_only || listing.starts_at_date_only);
  if (!start) return null;
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Golfolio//Listing Export//EN',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    listing.starts_at_date_only || isDateOnlyValue(listing.starts_at)
      ? `DTSTART;VALUE=DATE:${start}`
      : `DTSTART:${start}`,
    listing.ends_at_date_only || isDateOnlyValue(listing.ends_at || listing.starts_at)
      ? `DTEND;VALUE=DATE:${end}`
      : end
        ? `DTEND:${end}`
        : null,
    `SUMMARY:${String(listing.title || 'Golf event').replace(/[,\\;]/g, ' ')}`,
    listing.city ? `LOCATION:${String(listing.city).replace(/[,\\;]/g, ' ')}` : null,
    `DESCRIPTION:${formatEventDisplay(listing.starts_at, { timeZone: tz, dateOnly: listing.starts_at_date_only })} · ${listingShareUrl(listing.id, origin)}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean);
  return `${lines.join('\r\n')}\r\n`;
}
