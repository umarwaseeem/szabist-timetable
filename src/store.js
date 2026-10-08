// Preferences live in localStorage on this device only.
const KEY = 'szabist-tt:prefs';
const THEME_KEY = 'szabist-tt:theme';

const DEFAULTS = { sections: [], program: '', view: 'all' };

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...parsed, sections: Array.isArray(parsed.sections) ? parsed.sections : [] };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode, ignore */ }
}

/** 'light' | 'dark' | null (system) */
export function loadTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === 'light' || t === 'dark' ? t : null;
  } catch { return null; }
}

export function saveTheme(theme) {
  try {
    if (theme) localStorage.setItem(THEME_KEY, theme);
    else localStorage.removeItem(THEME_KEY);
  } catch { /* ignore */ }
}
