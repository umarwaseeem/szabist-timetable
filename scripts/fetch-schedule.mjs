#!/usr/bin/env node
// Fetches today's schedule from ZabDesk, parses it, and writes
// data/days/<date>.json plus data/index.json. Safe to run many times a day:
// the newest fetch for a date replaces the older file.

import { mkdir, readFile, writeFile, readdir } from 'node:fs/promises';
import { parseSchedule } from './lib/parse.mjs';

const SOURCE = 'https://zabdesk.szabist-isb.edu.pk/ZabNoticeboard/StudentNoticeboard.aspx';
const DATA_DIR = new URL('../data/', import.meta.url);
const DAYS_DIR = new URL('../data/days/', import.meta.url);

async function main() {
  const fromFile = process.argv[2];
  const html = fromFile
    ? await readFile(fromFile, 'utf8')
    : await fetchHtml(SOURCE);

  const day = parseSchedule(html, { fetchedAt: new Date().toISOString(), source: SOURCE });
  if (!day.date) throw new Error('Could not find the schedule date in the page. Did the layout change?');
  if (day.classes.length === 0) console.warn(`Warning: ${day.date} has no classes (holiday or empty board).`);

  await mkdir(DAYS_DIR, { recursive: true });
  await writeFile(new URL(`${day.date}.json`, DAYS_DIR), JSON.stringify(day, null, 2) + '\n');
  await writeIndex();
  console.log(`Saved ${day.classes.length} classes for ${day.weekday} ${day.date} -> data/days/${day.date}.json`);
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; szabist-timetable/0.1; +https://github.com/umarwaseeem/szabist-timetable)' },
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

async function writeIndex() {
  const files = (await readdir(DAYS_DIR)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const days = [];
  for (const file of files) {
    const day = JSON.parse(await readFile(new URL(file, DAYS_DIR), 'utf8'));
    days.push({
      date: day.date,
      weekday: day.weekday,
      semester: day.semester,
      fetchedAt: day.fetchedAt,
      classes: day.classes.length,
      file: `days/${file}`,
    });
  }
  const index = { updatedAt: new Date().toISOString(), latest: days.at(-1)?.date ?? null, days };
  await writeFile(new URL('index.json', DATA_DIR), JSON.stringify(index, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
