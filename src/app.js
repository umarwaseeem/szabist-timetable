import { nowInKarachi, formatMinutes, formatRange, formatShortRange, formatDuration, statusFor, formatLongDate, formatStamp } from './time.js';
import { loadPrefs, savePrefs, loadTheme, saveTheme } from './store.js';

const $ = (sel, root = document) => root.querySelector(sel);
const params = new URLSearchParams(location.search);

const state = {
  index: null,
  day: null,
  programs: [],
  prefs: loadPrefs(),
  filters: { q: '', slot: 'all', campus: 'all' },
  now: nowInKarachi(params.get('now')),
};

const els = {
  heroKicker: $('#hero-kicker'), heroDay: $('#hero-day'), heroDate: $('#hero-date'), heroMeta: $('#hero-meta'),
  daySelect: $('#day-select'), programSelect: $('#program-select'), sectionChips: $('#section-chips'),
  chosen: $('#chosen-sections'), search: $('#search'), slotFilter: $('#slot-filter'), campusFilter: $('#campus-filter'),
  clearFilters: $('#clear-filters'), viewMine: $('#view-mine'), viewAll: $('#view-all'), resultCount: $('#result-count'),
  list: $('#schedule-list'), pdfList: $('#pdf-list'), footerUpdated: $('#footer-updated'),
  themeToggle: $('#theme-toggle'), themeLabel: $('#theme-label'), sourceLink: $('#source-link'),
  tpl: $('#tpl-class'),
};

init().catch(showFatal);

async function init() {
  setupTheme();
  const [index, programs] = await Promise.all([
    fetchJson('data/index.json'),
    fetchJson('data/programs.json').catch(() => ({ programs: [] })),
  ]);
  state.index = index;
  state.programs = programs.programs || [];
  renderPdfs();

  const wanted = params.get('date');
  const chosenDate = index.days.some((d) => d.date === wanted) ? wanted : index.latest;
  await loadDay(chosenDate);

  els.daySelect.addEventListener('change', () => loadDay(els.daySelect.value));
  els.programSelect.addEventListener('change', () => {
    state.prefs.program = els.programSelect.value;
    savePrefs(state.prefs);
    renderSectionChips();
  });
  els.search.addEventListener('input', () => { state.filters.q = els.search.value.trim(); renderSchedule(); });
  els.clearFilters.addEventListener('click', () => {
    state.filters = { q: '', slot: 'all', campus: 'all' };
    els.search.value = '';
    renderFilterControls();
    renderSchedule();
    els.search.focus();
  });
  els.viewMine.addEventListener('click', () => setView('mine'));
  els.viewAll.addEventListener('click', () => setView('all'));

  // Keep the clock honest: re-render every 30 seconds, and at once when the tab
  // comes back to the front, because browsers slow timers in background tabs.
  // Skipped when the time is pinned with ?now= for testing.
  if (!params.get('now')) {
    setInterval(refreshClock, 30_000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshClock(); });
    window.addEventListener('focus', refreshClock);
    window.addEventListener('pageshow', refreshClock);
  }
}

function refreshClock() {
  if (!state.day) return;
  const next = nowInKarachi();
  if (next.minutes !== state.now.minutes || next.date !== state.now.date) {
    state.now = next;
    renderHero();
    renderDaySelect();
    renderSchedule();
  }
}

async function loadDay(date) {
  const meta = state.index.days.find((d) => d.date === date) || state.index.days.at(-1);
  if (!meta) {
    renderEmptyIndex();
    return;
  }
  state.day = await fetchJson(`data/${meta.file}`);
  const url = new URL(location.href);
  if (meta.date === state.index.latest) url.searchParams.delete('date'); else url.searchParams.set('date', meta.date);
  history.replaceState(null, '', url);

  renderDaySelect();
  renderHero();
  renderProgramSelect();
  renderSectionChips();
  renderFilterControls();
  if (state.prefs.view === 'mine' && state.prefs.sections.length === 0) state.prefs.view = 'all';
  renderSchedule();
  els.footerUpdated.textContent = `Collected from the noticeboard at ${formatStamp(state.day.fetchedAt)} Pakistan time.`;
  if (state.day.source) els.sourceLink.href = state.day.source;
}

/* ---------- Rendering ---------- */

function renderDaySelect() {
  const select = els.daySelect;
  select.replaceChildren();
  const today = state.now.date;
  for (const d of [...state.index.days].reverse()) {
    const opt = document.createElement('option');
    opt.value = d.date;
    const label = `${d.weekday}, ${formatLongDate(d.date)}`;
    opt.textContent = d.date === today ? `${label} (today)` : label;
    opt.selected = d.date === state.day.date;
    select.append(opt);
  }
}

function renderHero() {
  const { day, now } = state;
  const isToday = day.date === now.date;
  els.heroKicker.textContent = isToday ? 'Class schedule for today' : 'Class schedule for an earlier day';
  els.heroDay.textContent = day.weekday || 'Schedule';
  els.heroDate.textContent = `${formatLongDate(day.date)}${day.semester ? `, ${day.semester}` : ''}`;
  const count = day.classes.length;
  const timePart = isToday ? `It is ${formatMinutes(now.minutes)} in Islamabad. ` : '';
  els.heroMeta.textContent = `${timePart}${count} ${count === 1 ? 'class' : 'classes'} on the board.`;
  document.title = isToday ? `SZABIST classes today, ${day.weekday}` : `SZABIST classes, ${day.weekday} ${formatLongDate(day.date)}`;
}

function programsInDay() {
  const map = new Map();
  for (const c of state.day.classes) {
    if (!c.program) continue;
    if (!map.has(c.program)) map.set(c.program, new Set());
    if (c.section) map.get(c.program).add(c.section);
  }
  return map;
}

function renderProgramSelect() {
  const map = programsInDay();
  const select = els.programSelect;
  const current = state.prefs.program;
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Choose a program';
  select.append(placeholder);
  for (const program of [...map.keys()].sort((a, b) => a.localeCompare(b))) {
    const opt = document.createElement('option');
    opt.value = program;
    opt.textContent = `${program} (${map.get(program).size} ${map.get(program).size === 1 ? 'section' : 'sections'})`;
    select.append(opt);
  }
  select.value = map.has(current) ? current : '';
  if (!map.has(current)) state.prefs.program = '';
}

function renderSectionChips() {
  const map = programsInDay();
  const container = els.sectionChips;
  container.replaceChildren();
  const program = els.programSelect.value;
  if (!program) {
    const p = document.createElement('p');
    p.className = 'chips-empty';
    p.textContent = state.prefs.sections.length ? 'Pick a program to add more sections.' : 'Pick a program to see its sections.';
    container.append(p);
  } else {
    const sections = [...(map.get(program) || [])].sort(compareSections);
    for (const section of sections) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = section;
      chip.setAttribute('aria-pressed', String(state.prefs.sections.includes(section)));
      chip.addEventListener('click', () => toggleSection(section));
      container.append(chip);
    }
  }
  renderChosen();
}

function renderChosen() {
  const box = els.chosen;
  box.replaceChildren();
  if (state.prefs.sections.length === 0) return;
  const title = document.createElement('p');
  title.className = 'chosen-title';
  title.textContent = `Your sections (${state.prefs.sections.length})`;
  const list = document.createElement('ul');
  list.className = 'chosen-list';
  for (const section of state.prefs.sections) {
    const li = document.createElement('li');
    li.className = 'chosen-item';
    li.append(section);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'chosen-remove';
    remove.setAttribute('aria-label', `Remove ${section}`);
    remove.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    remove.addEventListener('click', () => toggleSection(section));
    li.append(remove);
    list.append(li);
  }
  box.append(title, list);
}

function toggleSection(section) {
  const set = new Set(state.prefs.sections);
  if (set.has(section)) set.delete(section); else set.add(section);
  const hadNone = state.prefs.sections.length === 0;
  state.prefs.sections = [...set];
  if (hadNone && set.size === 1) state.prefs.view = 'mine';
  if (set.size === 0) state.prefs.view = 'all';
  savePrefs(state.prefs);
  renderSectionChips();
  renderSchedule();
}

function renderFilterControls() {
  const slotOptions = [{ value: 'all', label: 'All' }, ...state.day.slots.map((s) => ({ value: s.id, label: s.id === 'makeup' ? 'Make-up' : s.range ? `${s.label} (${formatShortRange(s.range.start, s.range.end)})` : s.label }))];
  const campuses = [...new Set(state.day.classes.map((c) => c.campus).filter(Boolean))].sort();
  const campusOptions = [{ value: 'all', label: 'All' }, ...campuses.map((c) => ({ value: c, label: c })), { value: 'online', label: 'Online' }];
  renderSegmented(els.slotFilter, 'slot', slotOptions, state.filters.slot);
  renderSegmented(els.campusFilter, 'campus', campusOptions, state.filters.campus);
}

function renderSegmented(fieldset, name, options, current) {
  fieldset.querySelector('.segmented-options')?.remove();
  const wrap = document.createElement('div');
  wrap.className = 'segmented-options';
  for (const opt of options) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = opt.value;
    input.checked = opt.value === current;
    input.addEventListener('change', () => { state.filters[name] = opt.value; renderSchedule(); });
    label.append(input);
    const m = name === 'slot' ? opt.label.match(/^(.*?)\s*\((.+)\)$/) : null;
    if (m) {
      const small = document.createElement('small');
      small.textContent = `(${m[2]})`;
      label.append(m[1], small);
    } else {
      label.append(opt.label);
    }
    wrap.append(label);
  }
  fieldset.append(wrap);
}

function setView(view) {
  if (view === 'mine' && state.prefs.sections.length === 0) {
    els.programSelect.focus();
    els.resultCount.textContent = 'Choose at least one section first, then "My classes" will show only yours.';
    return;
  }
  state.prefs.view = view;
  savePrefs(state.prefs);
  renderSchedule();
}

function visibleClasses() {
  const { q, slot, campus } = state.filters;
  const mine = new Set(state.prefs.sections);
  const needle = q.toLowerCase();
  return state.day.classes.filter((c) => {
    if (state.prefs.view === 'mine' && !mine.has(c.section)) return false;
    if (slot !== 'all' && c.slot !== slot) return false;
    if (campus === 'online' ? !c.online : campus !== 'all' && c.campus !== campus) return false;
    if (needle) {
      const hay = [c.course.title, c.course.code, c.faculty, c.room, c.section, c.program, c.department].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

function renderSchedule() {
  const view = state.prefs.view;
  els.viewMine.setAttribute('aria-selected', String(view === 'mine'));
  els.viewAll.setAttribute('aria-selected', String(view === 'all'));
  els.viewMine.disabled = false;

  const classes = visibleClasses().sort(compareClasses);
  const isToday = state.day.date === state.now.date;
  const nowMinutes = isToday ? state.now.minutes : null;
  const mine = new Set(state.prefs.sections);

  renderResultCount(classes.length, view);

  els.list.replaceChildren();
  if (classes.length === 0) {
    els.list.append(renderEmpty(view));
    return;
  }

  if (view === 'mine') {
    els.list.append(renderFlatList(classes, nowMinutes, mine, { showNowLine: isToday }));
    return;
  }
  const filtersActive = Boolean(state.filters.q) || state.filters.slot !== 'all' || state.filters.campus !== 'all';
  const openSlots = slotsToOpen(nowMinutes);
  for (const slot of [...state.day.slots, { id: 'other', label: 'Other classes', range: null }]) {
    const group = classes.filter((c) => c.slot === slot.id);
    if (group.length === 0) continue;
    const details = document.createElement('details');
    details.className = 'slot-group';
    details.open = filtersActive || openSlots.has(slot.id);
    const head = document.createElement('summary');
    head.className = 'slot-head';
    head.append(svgIcon('i-chevron'));
    const name = document.createElement('h3');
    name.className = 'slot-name';
    name.textContent = slot.label;
    head.append(name);
    if (slot.range) {
      const range = document.createElement('span');
      range.className = 'slot-range';
      range.textContent = formatRange(slot.range.start, slot.range.end);
      head.append(range);
    }
    const count = document.createElement('span');
    count.className = 'slot-count';
    count.textContent = `${group.length} ${group.length === 1 ? 'class' : 'classes'}`;
    head.append(count);
    details.append(head, renderFlatList(group, nowMinutes, mine, { showNowLine: slotHoldsNow(slot, group, nowMinutes) }));
    els.list.append(details);
  }
}

/** True when the Now line belongs inside this slot group. */
function slotHoldsNow(slot, group, nowMinutes) {
  if (nowMinutes == null) return false;
  if (slot.range) return nowMinutes >= slot.range.start && nowMinutes < slot.range.end;
  const started = group.some((c) => c.time.start != null && c.time.start <= nowMinutes);
  const pending = group.some((c) => c.time.start != null && c.time.start > nowMinutes);
  return started && pending;
}

/** Which slot groups start open in the "Everyone" view: the current slot and the next one, or all slots when the day is not today. */
function slotsToOpen(nowMinutes) {
  const ids = state.day.slots.map((s) => s.id);
  if (nowMinutes == null) return new Set(ids);
  const timed = state.day.slots.filter((s) => s.range);
  const current = timed.find((s) => nowMinutes >= s.range.start && nowMinutes < s.range.end);
  const upcoming = timed.find((s) => s.range.start > nowMinutes);
  const open = new Set();
  if (current) open.add(current.id);
  if (upcoming) open.add(upcoming.id);
  if (open.size === 0) open.add(nowMinutes < (timed[0]?.range.start ?? 0) ? timed[0]?.id : timed.at(-1)?.id);
  open.add('makeup');
  return open;
}

function renderFlatList(classes, nowMinutes, mine, { showNowLine }) {
  const ul = document.createElement('ul');
  ul.className = 'class-list is-fresh';
  let nowLinePlaced = nowMinutes == null || !showNowLine;
  const firstUpcoming = nowMinutes == null ? null : classes.find((c) => statusFor(c, nowMinutes) === 'later');
  for (const c of classes) {
    const status = statusFor(c, nowMinutes);
    if (!nowLinePlaced && status === 'later') {
      ul.append(nowLine(nowMinutes));
      nowLinePlaced = true;
    }
    ul.append(renderClass(c, status, nowMinutes, { mine: mine.has(c.section), isNext: c === firstUpcoming }));
  }
  if (!nowLinePlaced) ul.append(nowLine(nowMinutes));
  return ul;
}

function nowLine(nowMinutes) {
  const li = document.createElement('li');
  li.className = 'now-line';
  li.setAttribute('aria-label', `Now, ${formatMinutes(nowMinutes)}`);
  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.textContent = `Now, ${formatMinutes(nowMinutes)}`;
  li.append(dot, text);
  return li;
}

function renderClass(c, status, nowMinutes, { mine, isNext }) {
  const node = els.tpl.content.firstElementChild.cloneNode(true);
  node.classList.toggle('is-now', status === 'now');
  node.classList.toggle('is-done', status === 'done');
  node.dataset.id = c.id;

  const start = $('.class-start', node);
  start.textContent = c.time.start != null ? formatMinutes(c.time.start) : (c.time.raw || 'Time not listed');
  if (c.time.start != null) start.dateTime = `${String(Math.floor(c.time.start / 60)).padStart(2, '0')}:${String(c.time.start % 60).padStart(2, '0')}`;
  $('.class-end', node).textContent = c.time.end != null ? `to ${formatMinutes(c.time.end)}` : '';

  const state = $('.class-state', node);
  if (status === 'now') {
    state.classList.add('state-now');
    $('.class-state-text', node).textContent = `Now, ends in ${formatDuration(c.time.end - nowMinutes)}`;
  } else if (isNext) {
    state.classList.add('state-next');
    $('.class-state-text', node).textContent = `Next, in ${formatDuration(c.time.start - nowMinutes)}`;
  } else {
    state.remove();
  }

  const flags = $('.class-flags', node);
  if (c.slot === 'makeup') flags.append(tag('tag-makeup', 'Make-up'));
  if (c.online) flags.append(tag('tag-online', 'Online', 'i-globe'));
  if (mine && viewIsAll()) flags.append(tag('tag-mine', 'Yours'));
  if (!flags.childElementCount) flags.remove();
  const topline = $('.class-topline', node);
  if (!topline.childElementCount) topline.remove();

  $('.class-title', node).textContent = c.course.title || 'Untitled class';
  const codeBits = [c.course.code, c.course.credits ? `(${c.course.credits})` : null].filter(Boolean).join(' ');
  $('.class-code', node).textContent = codeBits;

  const room = $('.meta-room', node);
  if (c.online) {
    room.querySelector('use').setAttribute('href', '#i-globe');
    room.querySelector('span').textContent = 'Online class';
  } else {
    room.querySelector('span').textContent = c.room ? `Room ${c.room}${c.campus ? `, ${c.campus}` : ''}` : 'Room not listed';
  }
  const faculty = $('.meta-faculty', node);
  if (c.faculty) faculty.querySelector('span').textContent = c.faculty; else faculty.remove();
  $('.meta-section span', node).textContent = c.section || c.program || 'Section not listed';
  return node;
}

function viewIsAll() { return state.prefs.view === 'all'; }

function tag(cls, text, icon = null) {
  const span = document.createElement('span');
  span.className = `tag ${cls}`;
  if (icon) span.append(svgIcon(icon));
  span.append(text);
  return span;
}

function svgIcon(id, cls = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
}

function metaItem(icon, text, cls = '') {
  const li = document.createElement('li');
  li.className = `meta ${cls}`.trim();
  const span = document.createElement('span');
  span.textContent = text;
  li.append(svgIcon(icon), span);
  return li;
}

function renderResultCount(count, view) {
  const { q, slot, campus } = state.filters;
  const filtered = q || slot !== 'all' || campus !== 'all';
  const scope = view === 'mine' ? 'for your sections' : 'on the board';
  const noun = count === 1 ? 'class' : 'classes';
  els.resultCount.textContent = filtered ? `${count} ${noun} ${scope} match your search and filters.` : `${count} ${noun} ${scope}.`;
}

function renderEmpty(view) {
  const box = document.createElement('div');
  box.className = 'empty';
  const title = document.createElement('p');
  title.className = 'empty-title';
  const body = document.createElement('p');
  const { q, slot, campus } = state.filters;
  if (q || slot !== 'all' || campus !== 'all') {
    title.textContent = 'Nothing matches';
    body.textContent = 'Try a shorter search, or clear the slot and campus filters.';
  } else if (view === 'mine') {
    title.textContent = 'No classes for your sections today';
    body.textContent = 'Check "Everyone" in case the board lists your class under a merged or open section.';
  } else {
    title.textContent = 'The board is empty for this day';
    body.textContent = 'This can mean a holiday, or the noticeboard was not published yet.';
  }
  box.append(title, body);
  return box;
}

function renderEmptyIndex() {
  els.heroDay.textContent = 'No data yet';
  els.heroMeta.textContent = 'Run "npm run fetch" to collect today\'s schedule.';
}

function renderPdfs() {
  const groups = new Map();
  for (const p of state.programs) {
    const g = pdfGroup(p.key);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(p);
  }
  els.pdfList.replaceChildren();
  for (const [name, items] of groups) {
    const section = document.createElement('section');
    const h3 = document.createElement('h3');
    h3.className = 'pdf-group-title';
    h3.textContent = name;
    const ul = document.createElement('ul');
    ul.className = 'pdf-list';
    for (const p of items) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = p.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.append(svgIcon('i-file'));
      const nameSpan = document.createElement('span');
      nameSpan.className = 'pdf-name';
      nameSpan.textContent = p.label;
      const ext = document.createElement('span');
      ext.className = 'pdf-ext';
      ext.textContent = p.semester ? `PDF, ${p.semester}` : 'PDF';
      a.append(nameSpan, ext);
      li.append(a);
      ul.append(li);
    }
    section.append(h3, ul);
    els.pdfList.append(section);
  }
}

function pdfGroup(key) {
  if (/^(BBA|BSAF|BSBA|MBAD|MBAE|MSMS|MSPM|MSBA|PhDMS|EMBA|MHRM|MPM|PMBA)$/i.test(key)) return 'Management Sciences';
  if (/^(BSCS|BSSE|BSAI|MSCS|MSDataScience|MSCyberSecurity|LAB-CS|PhDCS)$/i.test(key)) return 'Computer Sciences and AI';
  if (/^(BSMS|MMS)$/i.test(key)) return 'Media Sciences';
  if (/^(BSSS|BSIR|BSSociology|BSED|BSP|MSSS|MSIR|MSPSY|MSDS|PhDPsychology)$/i.test(key)) return 'Social Sciences';
  return 'Other programs';
}

/* ---------- Theme ---------- */

function setupTheme() {
  applyTheme(loadTheme());
  els.themeToggle.addEventListener('click', () => {
    const current = loadTheme();
    const next = current === null ? 'dark' : current === 'dark' ? 'light' : null;
    saveTheme(next);
    applyTheme(next);
  });
}

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme; else delete document.documentElement.dataset.theme;
  const label = theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : 'Auto';
  els.themeLabel.textContent = label;
  document.querySelector('.theme-use')?.setAttribute('href', theme === 'dark' ? '#i-moon' : theme === 'light' ? '#i-sun' : '#i-auto');
  els.themeToggle.setAttribute('aria-label', `Theme: ${label}. Switch theme`);
}

/* ---------- Helpers ---------- */

function compareClasses(a, b) {
  const sa = a.time.start ?? 9999, sb = b.time.start ?? 9999;
  if (sa !== sb) return sa - sb;
  const ea = a.time.end ?? 9999, eb = b.time.end ?? 9999;
  if (ea !== eb) return ea - eb;
  return (a.section || '').localeCompare(b.section || '', undefined, { numeric: true });
}

function compareSections(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

async function fetchJson(path) {
  const res = await fetch(path, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ${path} (${res.status})`);
  return res.json();
}

function showFatal(err) {
  console.error(err);
  els.heroDay.textContent = 'Something went wrong';
  els.heroMeta.textContent = `${err.message}. Reload the page to try again.`;
}
