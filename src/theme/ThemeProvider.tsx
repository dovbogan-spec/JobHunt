import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_THEME_KEY, THEME_BY_KEY, type ThemePaletteEntry } from "./palette";
import { deriveThemeTokens } from "./themeUtils";

const THEME_STORAGE_KEY = "themeColorKey";

type ThemeContextValue = {
  themeKey: string;
  currentTheme: ThemePaletteEntry;
  setThemeColor: (key: string) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getThemeByKey(themeKey: string): ThemePaletteEntry {
  return THEME_BY_KEY[themeKey] ?? THEME_BY_KEY[DEFAULT_THEME_KEY];
}

function applyThemeToRoot(theme: ThemePaletteEntry): void {
  const rootStyle = document.documentElement.style;
  const tokens = deriveThemeTokens(theme.baseHex);

  rootStyle.setProperty("--primary", tokens.primary);
  rootStyle.setProperty("--primary-contrast", tokens.primaryContrast);
  rootStyle.setProperty("--primary-hover", tokens.primaryHover);
  rootStyle.setProperty("--primary-active", tokens.primaryActive);
  rootStyle.setProperty("--ring", tokens.ring);
  rootStyle.setProperty("--border-accent", tokens.borderAccent);
  rootStyle.setProperty("--bg-accent", tokens.bgAccent);

  rootStyle.setProperty("--accent", tokens.primary);
  rootStyle.setProperty("--accent-strong", tokens.primaryActive);
  rootStyle.setProperty("--focus-ring", tokens.ring);
  rootStyle.setProperty("--hover", tokens.bgAccent);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeKey, setThemeKey] = useState<string>(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored && THEME_BY_KEY[stored] ? stored : DEFAULT_THEME_KEY;
  });

  useEffect(() => {
    const selectedTheme = getThemeByKey(themeKey);
    applyThemeToRoot(selectedTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, selectedTheme.key);
  }, [themeKey]);

  const value = useMemo<ThemeContextValue>(() => {
    const currentTheme = getThemeByKey(themeKey);
    return {
      themeKey,
      currentTheme,
      setThemeColor: (nextThemeKey: string) => {
        if (nextThemeKey === themeKey) return;
        setThemeKey(getThemeByKey(nextThemeKey).key);
      },
    };
  }, [themeKey]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return context;
}
