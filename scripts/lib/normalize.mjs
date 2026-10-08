// Small, dependency-free helpers that turn the noticeboard's raw cell text
// into tidy values. Shared by the scraper and its tests.

const DASHES = /[‐-―−]/g; // hyphen variants, en/em dash, minus

export function cleanText(value) {
  if (value == null) return '';
  return String(value)
    .replace(/ /g, ' ')
    .replace(DASHES, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanName(value) {
  const text = cleanText(value).replace(/^[-\s]+|[-\s]+$/g, '').trim();
  return text || null;
}

/** "08:30 PM-09:30PM" -> { start: 1230, end: 1290 } (minutes after midnight). */
export function parseTimeRange(value) {
  const text = cleanText(value).toUpperCase();
  const re = /(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?\s*-\s*(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?/;
  const m = text.match(re);
  if (!m) return null;
  const [, h1, m1, p1, h2, m2, p2] = m;
  const end = toMinutes(h2, m2, p2 || p1);
  // When only the end carries AM/PM, infer the start's period so that start < end.
  let start = toMinutes(h1, m1, p1 || p2);
  if (!p1 && p2 && start > end) start = toMinutes(h1, m1, p2 === 'PM' ? 'AM' : 'PM');
  if (start == null || end == null) return null;
  return { start, end };
}

function toMinutes(h, m, period) {
  let hours = Number(h);
  const minutes = Number(m || 0);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  if (period === 'PM' && hours < 12) hours += 12;
  if (period === 'AM' && hours === 12) hours = 0;
  if (!period && hours < 7) hours += 12; // bare "1:00 - 2:00" is an afternoon class
  return hours * 60 + minutes;
}

export function normalizeCampus(value) {
  const text = cleanText(value);
  if (!text) return null;
  if (/HMB|I-8/i.test(text)) return 'HMB (I-8)';
  if (/H-8/i.test(text)) return 'H-8';
  return text;
}

/** "BSA 1101 English Writing Skills (3,0)" -> { code, title, credits } */
export function splitCourse(value) {
  let text = cleanText(value);
  let credits = null;
  const creditMatch = text.match(/\((\d\s*,\s*\d)\)\s*$/);
  if (creditMatch) {
    credits = creditMatch[1].replace(/\s/g, '');
    text = text.slice(0, creditMatch.index).trim();
  }
  const codeMatch = text.match(/^([A-Z]{2,5}L?\s?\d{3,4}[A-Z]?)\s+(.+)$/);
  if (codeMatch) return { code: codeMatch[1].replace(/\s+/, ' '), title: codeMatch[2].trim(), credits };
  return { code: null, title: text, credits };
}

export function slugify(value) {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
