// Optional assistant: ask about the day's classes in plain language, by typing
// or by voice. Uses Google's Gemini API with a key the user pastes in. The key
// stays in this browser (localStorage) and is sent only to Google with each
// question, together with the day's schedule as context.

import { formatMinutes, formatLongDate } from './time.js';

const KEY_STORAGE = 'szabist-tt:gemini-key';
const SPEAK_STORAGE = 'szabist-tt:assistant-speak';
// Tried in order. The first is fast with thinking switched off; the others are
// fallbacks for when a model is overloaded or retired.
const MODELS = [
  { name: 'gemini-2.5-flash', config: { thinkingConfig: { thinkingBudget: 0 } } },
  { name: 'gemini-3.5-flash-lite', config: {} },
  { name: 'gemini-flash-lite-latest', config: {} },
];
const API = 'https://generativelanguage.googleapis.com/v1beta';
const ENDPOINT = (model, key) => `${API}/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
const TIMEOUT_MS = 25_000;
const SUGGESTIONS = [
  'What is my next class?',
  'Where am I right now?',
  'Which classes are online this afternoon?',
  'When does BS(CS)-7C finish today?',
];

const $ = (sel, root = document) => root.querySelector(sel);

export function mountAssistant(getContext) {
  const dialog = $('#assistant');
  const openBtn = $('#assistant-open');
  if (!dialog || !openBtn) return;

  const ui = {
    dialog,
    close: $('#assistant-close'),
    setup: $('#assistant-setup'),
    chat: $('#assistant-chat'),
    keyInput: $('#assistant-key'),
    keySave: $('#assistant-key-save'),
    keyError: $('#assistant-key-error'),
    transcript: $('#assistant-transcript'),
    suggestions: $('#assistant-suggestions'),
    form: $('#assistant-form'),
    input: $('#assistant-input'),
    send: $('#assistant-send'),
    mic: $('#assistant-mic'),
    speak: $('#assistant-speak'),
    status: $('#assistant-status'),
    changeKey: $('#assistant-change-key'),
    clear: $('#assistant-clear'),
  };

  const history = []; // { role: 'user' | 'model', text }
  let busy = false;
  let recognition = null;

  openBtn.addEventListener('click', () => {
    dialog.showModal();
    showRightPane();
    (loadKey() ? ui.input : ui.keyInput).focus();
  });
  ui.close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { stopListening(); window.speechSynthesis?.cancel(); });

  ui.setup.addEventListener('submit', (e) => { e.preventDefault(); saveKey(); });
  ui.changeKey.addEventListener('click', () => {
    saveKeyValue('');
    history.length = 0;
    ui.transcript.replaceChildren();
    showRightPane();
    ui.keyInput.focus();
  });
  ui.clear.addEventListener('click', () => {
    history.length = 0;
    ui.transcript.replaceChildren();
    renderSuggestions();
    ui.input.focus();
  });

  ui.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = ui.input.value.trim();
    if (text) ask(text);
  });
  ui.input.addEventListener('input', () => { ui.send.disabled = !ui.input.value.trim(); });

  // Voice input through the browser's speech recognition, when it exists.
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    ui.mic.hidden = true;
  } else {
    ui.mic.addEventListener('click', () => (recognition ? stopListening() : startListening()));
  }

  // Spoken replies through the browser's speech synthesis, when it exists.
  if (!('speechSynthesis' in window)) {
    ui.speak.closest('label').hidden = true;
  } else {
    ui.speak.checked = loadSpeak();
    ui.speak.addEventListener('change', () => saveSpeak(ui.speak.checked));
  }

  renderSuggestions();

  function showRightPane() {
    const hasKey = Boolean(loadKey());
    ui.setup.hidden = hasKey;
    ui.chat.hidden = !hasKey;
    ui.keyError.textContent = '';
  }

  async function saveKey() {
    const key = ui.keyInput.value.trim();
    if (!key) { ui.keyError.textContent = 'Paste a key first.'; return; }
    ui.keySave.disabled = true;
    ui.keyError.textContent = 'Checking the key…';
    try {
      const res = await fetch(`${API}/models?pageSize=1&key=${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error(res.status === 400 || res.status === 403 ? 'Google did not accept this key.' : `Google answered with status ${res.status}.`);
      saveKeyValue(key);
      ui.keyInput.value = '';
      showRightPane();
      ui.input.focus();
    } catch (err) {
      ui.keyError.textContent = err.message.includes('Failed to fetch') ? 'Could not reach Google. Check your connection.' : err.message;
    } finally {
      ui.keySave.disabled = false;
    }
  }

  function renderSuggestions() {
    ui.suggestions.replaceChildren();
    if (history.length) { ui.suggestions.hidden = true; return; }
    ui.suggestions.hidden = false;
    for (const text of SUGGESTIONS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = text;
      b.addEventListener('click', () => ask(text));
      ui.suggestions.append(b);
    }
  }

  async function ask(text) {
    if (busy) return;
    const key = loadKey();
    if (!key) { showRightPane(); return; }
    busy = true;
    ui.input.value = '';
    ui.send.disabled = true;
    addBubble('user', text);
    history.push({ role: 'user', text });
    renderSuggestions();
    const pending = addBubble('model', '', { pending: true });
    setStatus('Thinking…');
    try {
      const answer = await callGemini(key, buildSystemPrompt(getContext()), history);
      history.push({ role: 'model', text: answer });
      pending.replaceChildren(renderMarkdown(answer));
      pending.classList.remove('is-pending');
      if (ui.speak.checked) speakText(answer);
      setStatus('');
    } catch (err) {
      pending.remove();
      history.pop();
      setStatus(friendlyError(err), true);
    } finally {
      busy = false;
      ui.input.focus();
    }
  }

  function addBubble(role, text, { pending = false } = {}) {
    const li = document.createElement('li');
    li.className = `bubble bubble-${role}${pending ? ' is-pending' : ''}`;
    if (pending) {
      li.setAttribute('aria-label', 'Thinking');
      li.innerHTML = '<span class="dots" aria-hidden="true"><i></i><i></i><i></i></span>';
    } else {
      li.append(renderMarkdown(text));
    }
    ui.transcript.append(li);
    ui.transcript.scrollTop = ui.transcript.scrollHeight;
    return li;
  }

  function setStatus(text, isError = false) {
    ui.status.textContent = text;
    ui.status.classList.toggle('is-error', isError);
  }

  function startListening() {
    window.speechSynthesis?.cancel();
    recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    let finalText = '';
    recognition.onresult = (e) => {
      let interim = '';
      for (const result of e.results) {
        if (result.isFinal) finalText += result[0].transcript; else interim += result[0].transcript;
      }
      ui.input.value = (finalText || interim).trim();
      ui.send.disabled = !ui.input.value;
    };
    recognition.onerror = (e) => {
      setStatus(e.error === 'not-allowed' ? 'Microphone access was blocked. Allow it in the browser, then try again.' : 'Could not hear that. Try again.', true);
      stopListening();
    };
    recognition.onend = () => {
      const heard = ui.input.value.trim();
      stopListening();
      if (heard && finalText) ask(heard);
    };
    recognition.start();
    ui.mic.classList.add('is-listening');
    ui.mic.setAttribute('aria-label', 'Stop listening');
    setStatus('Listening…');
  }

  function stopListening() {
    if (recognition) {
      recognition.onend = null;
      try { recognition.stop(); } catch { /* already stopped */ }
      recognition = null;
    }
    ui.mic.classList.remove('is-listening');
    ui.mic.setAttribute('aria-label', 'Ask by voice');
    if (ui.status.textContent === 'Listening…') setStatus('');
  }

  function speakText(text) {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.cancel();
    const plain = text.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
    const utterance = new SpeechSynthesisUtterance(plain);
    utterance.lang = 'en-US';
    utterance.rate = 1.02;
    synth.speak(utterance);
  }
}

/* ---------- Gemini ---------- */

async function callGemini(key, systemPrompt, history) {
  const contents = history.slice(-12).map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  let lastError = null;
  for (const model of MODELS) {
    const body = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.2, maxOutputTokens: 1024, ...model.config },
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT(model.name, key), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        try { err.detail = (await res.json()).error?.message; } catch { /* no body */ }
        // A bad key will fail on every model, so stop early. Anything else: try the next model.
        if (res.status === 400 && /api key|API_KEY/i.test(err.detail || '')) throw err;
        if (res.status === 403) throw err;
        lastError = err;
        continue;
      }
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
      if (!text) { lastError = new Error('empty'); continue; }
      return text;
    } catch (err) {
      if (err.name === 'AbortError') { lastError = Object.assign(new Error('timeout'), { status: 0 }); continue; }
      if (err.status === 403 || (err.status === 400 && /api key|API_KEY/i.test(err.detail || ''))) throw err;
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('unknown');
}

function friendlyError(err) {
  if (err.status === 400 || err.status === 403) return 'Google did not accept the key. Use "Change key" to paste a new one.';
  if (err.status === 429) return 'The key has hit its limit for now. Try again in a minute.';
  if (err.status === 503) return 'Google says the model is busy right now. Try again in a moment.';
  if (err.message === 'timeout') return 'Google took too long to answer. Try again.';
  if (err.message === 'empty') return 'No answer came back. Try asking in a different way.';
  if (err.message?.includes('Failed to fetch')) return 'Could not reach Google. Check your connection.';
  return 'Something went wrong. Try again.';
}

/** The whole day's schedule as compact text, plus who the user is and what time it is. */
export function buildSystemPrompt({ day, prefs, now }) {
  const isToday = day.date === now.date;
  const lines = day.classes.map((c) => {
    const slot = day.slots.find((s) => s.id === c.slot)?.label || c.slot;
    let status = '';
    if (isToday && c.time.start != null) {
      status = now.minutes >= c.time.end ? 'ENDED' : now.minutes >= c.time.start ? 'NOW' : 'LATER';
      status += ' | ';
    }
    const time = c.time.start != null ? `${formatMinutes(c.time.start)}-${formatMinutes(c.time.end)}` : c.time.raw;
    const course = [c.course.code, c.course.title].filter(Boolean).join(' ');
    const place = c.online ? 'Online' : `Room ${c.room || '?'}${c.campus ? ` (${c.campus} campus)` : ''}`;
    return `${status}${slot} | ${time} | ${c.section} | ${c.program} | ${course} | ${c.faculty || 'teacher not listed'} | ${place}`;
  });
  const mine = prefs.sections.length ? prefs.sections.join(', ') : 'none saved';
  return [
    'You are a helpful assistant inside a web page that shows the SZABIST University Islamabad class schedule for one day.',
    `The schedule below is for ${day.weekday}, ${formatLongDate(day.date)}${day.semester ? ` (${day.semester})` : ''}.`,
    isToday ? `It is now ${formatMinutes(now.minutes)} in Islamabad, and the schedule is for today.` : `The schedule is for a different day, not today. Do not talk about "now" unless asked.`,
    `The user's saved sections: ${mine}. When the user says "my", "me" or "I", use these sections. If none are saved, ask which section they are in.`,
    'Answer only from the schedule. Never invent a class, room, teacher or time. If the schedule does not answer the question, say so briefly and suggest checking the ZabDesk noticeboard.',
    'Be brief: one to three short sentences, or a short bulleted list when several classes are involved. Use 12-hour times like 2:30 pm. Mention room and campus when giving a location. Plain text with simple markdown only (bold, bullets).',
    isToday ? 'Column order: status | slot | time | section | program | course | teacher | place. Status is ENDED (already finished), NOW (running at this moment) or LATER (still to come). "Next class" means the earliest LATER class; a NOW class is the current one.' : 'Column order: slot | time | section | program | course | teacher | place.',
    '',
    'SCHEDULE:',
    ...lines,
  ].join('\n');
}

/* ---------- Tiny safe markdown ---------- */

export function renderMarkdown(text) {
  const frag = document.createDocumentFragment();
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim());
    if (!lines.length) continue;
    const isList = lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l));
    if (isList) {
      const ul = document.createElement('ul');
      for (const line of lines) {
        const li = document.createElement('li');
        li.append(inline(line.replace(/^\s*([-*•]|\d+[.)])\s+/, '')));
        ul.append(li);
      }
      frag.append(ul);
    } else {
      const p = document.createElement('p');
      lines.forEach((line, i) => {
        if (i) p.append(document.createElement('br'));
        p.append(inline(line));
      });
      frag.append(p);
    }
  }
  return frag;
}

function inline(text) {
  const frag = document.createDocumentFragment();
  const re = /\*\*(.+?)\*\*|`([^`]+)`/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) frag.append(text.slice(last, m.index));
    const el = document.createElement(m[1] != null ? 'strong' : 'code');
    el.textContent = m[1] ?? m[2];
    frag.append(el);
    last = m.index + m[0].length;
  }
  if (last < text.length) frag.append(text.slice(last));
  return frag;
}

/* ---------- Storage ---------- */

function loadKey() { try { return localStorage.getItem(KEY_STORAGE) || ''; } catch { return ''; } }
function saveKeyValue(key) { try { key ? localStorage.setItem(KEY_STORAGE, key) : localStorage.removeItem(KEY_STORAGE); } catch { /* ignore */ } }
function loadSpeak() { try { return localStorage.getItem(SPEAK_STORAGE) === '1'; } catch { return false; } }
function saveSpeak(on) { try { localStorage.setItem(SPEAK_STORAGE, on ? '1' : '0'); } catch { /* ignore */ } }
