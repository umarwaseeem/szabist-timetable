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
  const dayPath = new URL(`${day.date}.json`, DAYS_DIR);
  const previous = await readJsonIfExists(dayPath);
  // If the actual schedule content hasn't changed since the last fetch, keep
  // the old fetchedAt/source so the file is byte-identical and git sees no
  // diff. Running this many times a day should not create commit noise;
  // only a real change to the board should.
  const unchanged = previous && contentEqual(previous, day);
  const toWrite = unchanged ? previous : day;
  await writeFile(dayPath, JSON.stringify(toWrite, null, 2) + '\n');
  await writeIndex();
  console.log(
    unchanged
      ? `No change for ${day.weekday} ${day.date} (still ${day.classes.length} classes) -> data/days/${day.date}.json`
      : `Saved ${day.classes.length} classes for ${day.weekday} ${day.date} -> data/days/${day.date}.json`,
  );
}

function contentEqual(a, b) {
  const strip = ({ fetchedAt, source, ...rest }) => rest;
  return JSON.stringify(strip(a)) === JSON.stringify(strip(b));
}

async function readJsonIfExists(url) {
  try {
    return JSON.parse(await readFile(url, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
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
  const indexPath = new URL('index.json', DATA_DIR);
  const previous = await readJsonIfExists(indexPath);
  const latest = days.at(-1)?.date ?? null;
  // Same idea as the day files: only bump updatedAt when the list of days
  // actually differs (a day's fetchedAt only changes when its content did,
  // per the check above), so an unchanged run leaves no diff here either.
  const unchanged = previous && previous.latest === latest && JSON.stringify(previous.days) === JSON.stringify(days);
  const index = unchanged ? previous : { updatedAt: new Date().toISOString(), latest, days };
  await writeFile(indexPath, JSON.stringify(index, null, 2) + '\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
