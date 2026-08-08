'use client';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { DEFAULT_THEME, applyTheme, getTheme, type Theme } from './themes';

const STORAGE_KEY = 'reprush.theme';

interface ThemeCtx {
  themeId: string;
  theme: Theme;
  setThemeId: (id: string) => void;
}

const Ctx = createContext<ThemeCtx>({
  themeId: DEFAULT_THEME,
  theme: getTheme(DEFAULT_THEME),
  setThemeId: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // The inline script in <head> has already painted the right theme before
  // hydration; we start from what it chose so the first render matches.
  const [themeId, setId] = useState<string>(DEFAULT_THEME);

  useEffect(() => {
    const stored = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const id = getTheme(stored).id;
    setId(id);
    applyTheme(id);
  }, []);

  const setThemeId = useCallback((id: string) => {
    const next = getTheme(id).id;
    setId(next);
    applyTheme(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the theme just won't persist */
    }
  }, []);

  return (
    <Ctx.Provider value={{ themeId, theme: getTheme(themeId), setThemeId }}>{children}</Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);

/**
 * Runs before first paint to avoid a flash of the default theme.
 * Kept deliberately tiny and dependency-free — it is inlined into <head>.
 * It only sets the attributes; the full variable set is applied on hydration,
 * with `globals.css` holding the dark/light defaults so the gap is invisible.
 */
export const themeBootScript = `(function(){try{
var t=localStorage.getItem('${STORAGE_KEY}')||'${DEFAULT_THEME}';
var d=document.documentElement;d.dataset.theme=t;
var light=/light|retro|winter|spring|summer|cotton|jade|lemonberry/.test(t);
d.dataset.mode=light?'light':'dark';d.style.colorScheme=light?'light':'dark';
}catch(e){}})();`;
