const KEY = 'reprush_token';

/**
 * Auth token storage.
 *
 * Deliberately localStorage, not sessionStorage: sessionStorage is cleared when
 * the tab (or the installed PWA) closes, so a long-lived JWT would still force a
 * login on every cold start. localStorage lets the 30-day token actually last
 * 30 days. Legacy sessionStorage tokens are migrated on first read.
 */
export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  const stored = localStorage.getItem(KEY);
  if (stored) return stored;

  const legacy = sessionStorage.getItem(KEY);
  if (legacy) {
    localStorage.setItem(KEY, legacy);
    sessionStorage.removeItem(KEY);
    return legacy;
  }
  return null;
}

export function setToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(KEY, token);
  sessionStorage.removeItem(KEY);
}

export function clearToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
  sessionStorage.removeItem(KEY);
}
