// Time helpers. Everything on the board is Pakistan time (Asia/Karachi),
// so "now" is computed in that zone no matter where the viewer is.

export const ZONE = 'Asia/Karachi';

/** Current wall-clock in Karachi as { date: 'YYYY-MM-DD', minutes }. Accepts ?now=HH:MM for testing. */
export function nowInKarachi(override = null) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type)?.value;
  let minutes = Number(get('hour')) * 60 + Number(get('minute'));
  if (override) {
    const m = override.match(/^(\d{1,2}):(\d{2})$/);
    if (m) minutes = Number(m[1]) * 60 + Number(m[2]);
  }
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes };
}

/** 480 -> "8:00 am" */
export function formatMinutes(total) {
  if (total == null) return '';
  const h24 = Math.floor(total / 60);
  const m = total % 60;
  const period = h24 >= 12 ? 'pm' : 'am';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

/** 480, 660 -> "8:00 am to 11:00 am" */
export function formatRange(start, end, raw = '') {
  if (start == null || end == null) return raw || 'Time not listed';
  return `${formatMinutes(start)} to ${formatMinutes(end)}`;
}

/** 480, 660 -> "8–11 am"; 660, 840 -> "11 am–2 pm"; 750, 840 -> "12:30–2 pm" */
export function formatShortRange(start, end) {
  if (start == null || end == null) return '';
  const part = (t, withPeriod) => {
    const h24 = Math.floor(t / 60), m = t % 60;
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    const base = m ? `${h12}:${String(m).padStart(2, '0')}` : `${h12}`;
    return withPeriod ? `${base} ${h24 >= 12 ? 'pm' : 'am'}` : base;
  };
  const samePeriod = (start >= 720) === (end >= 720);
  return `${part(start, !samePeriod)}\u2013${part(end, true)}`;
}

/** 95 -> "1 h 35 min", 40 -> "40 min" */
export function formatDuration(minutes) {
  if (minutes < 1) return 'less than a minute';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** 'done' | 'now' | 'later' | 'unknown' for a class against a minute of the day. */
export function statusFor(entry, nowMinutes) {
  const { start, end } = entry.time;
  if (start == null || end == null || nowMinutes == null) return 'unknown';
  if (nowMinutes >= end) return 'done';
  if (nowMinutes >= start) return 'now';
  return 'later';
}

/** "2026-10-08" -> "8 October 2026" */
export function formatLongDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }).format(date);
}

/** ISO timestamp -> "7:10 pm, 8 Oct" in Karachi time. */
export function formatStamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: 'numeric', minute: '2-digit', hour12: true }).format(date).replace(/\s?(am|pm)/i, ' $1').toLowerCase();
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, day: 'numeric', month: 'short' }).format(date);
  return `${time}, ${day}`;
}
