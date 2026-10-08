import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseSchedule } from '../scripts/lib/parse.mjs';
import { parseTimeRange, normalizeCampus, splitCourse, cleanName } from '../scripts/lib/normalize.mjs';

const html = readFileSync(new URL('./fixtures/noticeboard-2026-10-08.html', import.meta.url), 'utf8');

test('parseTimeRange handles the formats seen on the noticeboard', () => {
  assert.deepEqual(parseTimeRange('08:00 AM - 11:00 AM'), { start: 480, end: 660 });
  assert.deepEqual(parseTimeRange('02:00 PM – 05:00 PM'), { start: 840, end: 1020 });
  assert.deepEqual(parseTimeRange('08:30 PM-09:30PM'), { start: 1230, end: 1290 });
  assert.deepEqual(parseTimeRange('12:30 PM - 02:00 PM'), { start: 750, end: 840 });
  assert.deepEqual(parseTimeRange('12:00 PM - 01:00 PM'), { start: 720, end: 780 });
  assert.equal(parseTimeRange(''), null);
  assert.equal(parseTimeRange('TBA'), null);
});

test('normalizeCampus maps the two campuses to short labels', () => {
  assert.equal(normalizeCampus('SZABIST University,H-8 Campus, Isb'), 'H-8');
  assert.equal(normalizeCampus('SZABIST University, HMB Campus, I-8 Isb'), 'HMB (I-8)');
  assert.equal(normalizeCampus(''), null);
});

test('splitCourse separates code, title and credits', () => {
  assert.deepEqual(splitCourse('BSA 1101 English Writing Skills and OCPS (3,0)'),
    { code: 'BSA 1101', title: 'English Writing Skills and OCPS', credits: '3,0' });
  assert.deepEqual(splitCourse('BA 1215 Ideology and Constitution of Pakistan'),
    { code: 'BA 1215', title: 'Ideology and Constitution of Pakistan', credits: null });
  assert.deepEqual(splitCourse('Demo'), { code: null, title: 'Demo', credits: null });
});

test('cleanName trims stray dashes and whitespace', () => {
  assert.equal(cleanName('Sadia Rasool -'), 'Sadia Rasool');
  assert.equal(cleanName('  Dr. Nasir  Munir '), 'Dr. Nasir Munir');
  assert.equal(cleanName(''), null);
});

test('parseSchedule reads the header, slots and every class row', () => {
  const day = parseSchedule(html, { fetchedAt: '2026-10-08T02:00:00.000Z' });
  assert.equal(day.date, '2026-10-08');
  assert.equal(day.weekday, 'Thursday');
  assert.equal(day.semester, 'Fall 2026');
  assert.equal(day.classes.length, 184);
  assert.deepEqual(day.slots.map((s) => s.id), ['1', '2', '3', '4', 'makeup']);
  assert.equal(day.slots[0].label, 'Slot 1');
  assert.deepEqual(day.slots[0].range, { start: 480, end: 660 });
  assert.equal(day.slots[4].label, 'Make-up classes');

  const first = day.classes[0];
  assert.equal(first.sr, 1);
  assert.equal(first.department, 'Management Sciences');
  assert.equal(first.program, 'BBA');
  assert.equal(first.section, 'BBA-1 A');
  assert.equal(first.course.code, 'BA 1215');
  assert.equal(first.faculty, 'Sadia Rasool');
  assert.equal(first.room, '102');
  assert.equal(first.online, false);
  assert.deepEqual(first.time, { raw: '08:00 AM - 10:00 AM', start: 480, end: 600 });
  assert.equal(first.slot, '1');
  assert.equal(first.campus, 'H-8');

  const makeup = day.classes.at(-1);
  assert.equal(makeup.slot, 'makeup');
  assert.equal(makeup.section, 'BBA Open');
  assert.equal(makeup.campus, 'HMB (I-8)');

  const online = day.classes.filter((c) => c.online);
  assert.equal(online.length, 6);
  assert.ok(day.classes.every((c) => typeof c.id === 'string' && c.id.length > 0));
  assert.equal(new Set(day.classes.map((c) => c.id)).size, day.classes.length);
});
