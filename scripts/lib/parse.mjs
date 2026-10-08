// Parses the ZabDesk StudentNoticeboard.aspx HTML into a plain JSON day.
// The page is an Excel export: one <table>, a title row, a header row, then
// slot header rows ("SLOT 1 (08:00 AM – 11:00 AM)", "Make Up Class") that
// introduce the class rows beneath them.

import { cleanText, cleanName, parseTimeRange, normalizeCampus, splitCourse, slugify } from './normalize.mjs';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function parseSchedule(html, { fetchedAt = new Date().toISOString(), source = null } = {}) {
  const rows = extractRows(html);
  const titleRow = rows.find((r) => r.length === 1 && /Class Schedule/i.test(r[0]));
  const title = titleRow ? titleRow[0] : '';
  const { date, weekday, semester } = parseTitle(title);

  const slots = [];
  const classes = [];
  let currentSlot = null;

  for (const cells of rows) {
    if (cells.length !== 9) continue;
    const [sr, department, program, section, course, faculty, room, time, campus] = cells;
    if (sr === 'Sr No') continue;

    const isSlotHeader = sr === '' && course !== '' && department === '' && time === '';
    if (isSlotHeader) {
      currentSlot = parseSlotHeader(course);
      slots.push(currentSlot);
      continue;
    }
    if (!/^\d+$/.test(sr)) continue;

    const slotId = currentSlot ? currentSlot.id : 'other';
    const roomText = cleanText(room);
    const online = /^online$/i.test(roomText);
    const entry = {
      id: '',
      sr: Number(sr),
      slot: slotId,
      department: cleanText(department) || null,
      program: cleanText(program) || null,
      section: cleanText(section) || null,
      course: splitCourse(course),
      faculty: cleanName(faculty),
      room: roomText || null,
      online,
      time: { raw: cleanText(time), ...(parseTimeRange(time) || { start: null, end: null }) },
      campus: normalizeCampus(campus),
    };
    entry.id = makeId(entry, classes);
    classes.push(entry);
  }

  return {
    date,
    weekday,
    semester,
    title: cleanText(title),
    fetchedAt,
    source,
    slots,
    classes,
  };
}

function extractRows(html) {
  const rows = [];
  const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let tr;
  while ((tr = trRe.exec(html))) {
    const cells = [];
    const tdRe = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let td;
    while ((td = tdRe.exec(tr[1]))) cells.push(cleanText(decodeEntities(td[1].replace(/<[^>]+>/g, ' '))));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

/** "Class Schedule – Thursday, October 08, 2026 (Fall 2026)" */
function parseTitle(title) {
  const text = cleanText(title);
  const m = text.match(/(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})(?:\s*\(([^)]+)\))?/);
  if (!m) return { date: null, weekday: null, semester: null };
  const [, weekday, monthName, day, year, semester] = m;
  const month = MONTHS.findIndex((n) => n.toLowerCase() === monthName.toLowerCase()) + 1;
  const date = month ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
  return { date, weekday, semester: semester ? cleanText(semester) : null };
}

/** "SLOT 1 (08:00 AM – 11:00 AM)" or "Make Up Class" */
function parseSlotHeader(text) {
  const clean = cleanText(text);
  const m = clean.match(/^slot\s*(\d+)\s*(?:\((.+)\))?/i);
  if (m) {
    return { id: m[1], label: `Slot ${m[1]}`, range: m[2] ? parseTimeRange(m[2]) : null };
  }
  if (/make\s*-?\s*up/i.test(clean)) return { id: 'makeup', label: 'Make-up classes', range: null };
  return { id: slugify(clean) || 'other', label: clean, range: null };
}

function makeId(entry, existing) {
  const base = slugify([entry.slot, entry.section, entry.course.code || entry.course.title, entry.time.raw].join(' '));
  let id = base;
  let n = 2;
  while (existing.some((c) => c.id === id)) id = `${base}-${n++}`;
  return id;
}
