#!/usr/bin/env node
// Reads https://szabist-isb.edu.pk/timetable-all/ and records the link to each
// program's full-semester timetable PDF in data/programs.json.

import { writeFile } from 'node:fs/promises';

const SOURCE = 'https://szabist-isb.edu.pk/timetable-all/';
const ORIGIN = 'https://szabist-isb.edu.pk';

const res = await fetch(SOURCE, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; szabist-timetable/0.1)' } });
if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
const html = await res.text();

const seen = new Set();
const programs = [];
const re = /<a\b[^>]*href="([^"]+TimeTable\/[^"]+\.pdf)"[^>]*>([\s\S]*?)<\/a>/gi;
let m;
while ((m = re.exec(html))) {
  const url = m[1].startsWith('http') ? m[1] : ORIGIN + m[1];
  if (seen.has(url)) continue;
  seen.add(url);
  const label = m[2].replace(/<[^>]+>/g, ' ').replace(/[→→]/g, '').replace(/\s+/g, ' ').trim();
  const semester = (url.match(/TimeTable\/([A-Za-z]+\d{4})\//) || [])[1] || null;
  const key = url.split('/').pop().replace(/\.pdf$/i, '');
  programs.push({ key, label, url, semester: semester ? semester.replace(/(\D)(\d)/, '$1 $2') : null });
}

await writeFile(new URL('../data/programs.json', import.meta.url),
  JSON.stringify({ updatedAt: new Date().toISOString(), source: SOURCE, programs }, null, 2) + '\n');
console.log(`Saved ${programs.length} program PDFs -> data/programs.json`);
