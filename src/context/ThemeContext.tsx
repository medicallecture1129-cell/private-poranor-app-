import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { 
  computeThemeVariables, 
  ComputedTheme, 
  CustomColors, 
  DEFAULT_CUSTOM_COLORS 
} from '../utils/themeColors';

export type ThemePreference = 'light' | 'dark' | 'system';
export type { CustomColors };

interface ThemeContextType {
  theme: 'light' | 'dark'; // Effective active theme
  preference: ThemePreference;
  isDarkMode: boolean;
  customColors: CustomColors;
  computedTheme: ComputedTheme;
  setCustomColor: (key: keyof CustomColors, value: string) => void;
  setAllCustomColors: (colors: CustomColors) => void;
  resetCustomColors: () => void;
  // Backwards-compatible aliases
  baseColor: string;
  setBaseColor: (hex: string) => void;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const defaultComputed = computeThemeVariables(DEFAULT_CUSTOM_COLORS, true);

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  preference: 'dark',
  isDarkMode: true,
  customColors: DEFAULT_CUSTOM_COLORS,
  computedTheme: defaultComputed,
  setCustomColor: () => {},
  setAllCustomColors: () => {},
  resetCustomColors: () => {},
  baseColor: DEFAULT_CUSTOM_COLORS.buttonColor,
  setBaseColor: () => {},
  setThemePreference: () => {},
  toggleTheme: () => {}
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem('examportal_theme_preference') as ThemePreference | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {}
    return 'dark';
  });

  const [customColors, setCustomColorsState] = useState<CustomColors>(() => {
    try {
      const saved = localStorage.getItem('examportal_custom_colors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.bgColor && parsed.fgColor && parsed.buttonColor && parsed.logoColor) {
          return parsed;
        }
      }
      // Migrate from old base color if present
      const oldBase = localStorage.getItem('examportal_base_color');
      if (oldBase && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(oldBase)) {
        return {
          ...DEFAULT_CUSTOM_COLORS,
          buttonColor: oldBase,
          logoColor: oldBase
        };
      }
    } catch {}
    return DEFAULT_CUSTOM_COLORS;
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('dark');

  // Compute theme variables from the 4 custom color settings
  const computedTheme = useMemo(() => {
    return computeThemeVariables(customColors, effectiveTheme === 'dark');
  }, [customColors, effectiveTheme]);

  // System appearance handler
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const resolveThemeMode = () => {
      if (preference === 'system') {
        return mediaQuery.matches ? 'dark' : 'light';
      }
      return preference;
    };

    const activeTheme = resolveThemeMode();
    setEffectiveTheme(activeTheme);
  }, [preference]);

  // Apply CSS Variables to root & body
  useEffect(() => {
    const root = document.documentElement;
    const isDark = effectiveTheme === 'dark';

    if (isDark) {
      root.classList.add('dark');
      root.classList.remove('light');
      document.body.classList.add('dark');
      document.body.classList.remove('light');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      root.setAttribute('data-theme', 'light');
    }

    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', computedTheme.bgMain);
    }

    const applyVars = (el: HTMLElement) => {
      // 1. Backgrounds
      el.style.setProperty('--theme-base-color', computedTheme.primary);
      el.style.setProperty('--theme-bg-main', computedTheme.bgMain);
      el.style.setProperty('--theme-bg-main-rgb', computedTheme.bgMainRgb);

      // 2. Foreground / Cards
      el.style.setProperty('--theme-bg-card', computedTheme.bgCard);
      el.style.setProperty('--theme-bg-card-hover', computedTheme.bgCardHover);
      el.style.setProperty('--theme-bg-card-rgb', computedTheme.bgCardRgb);

      // 3. Surface
      el.style.setProperty('--theme-bg-surface', computedTheme.bgSurface);
      el.style.setProperty('--theme-bg-surface-elevated', computedTheme.bgSurfaceElevated);

      // 4. Borders
      el.style.setProperty('--theme-border', computedTheme.borderColor);
      el.style.setProperty('--theme-border-card', computedTheme.borderCard);
      el.style.setProperty('--theme-border-strong', computedTheme.borderStrong);

      // 5. Button
      el.style.setProperty('--theme-primary', computedTheme.primary);
      el.style.setProperty('--theme-primary-hover', computedTheme.primaryHover);
      el.style.setProperty('--theme-primary-rgb', computedTheme.primaryRgb);
      el.style.setProperty('--theme-primary-text', computedTheme.primaryText);
      el.style.setProperty('--theme-primary-light', computedTheme.primaryLight);
      el.style.setProperty('--theme-primary-border', computedTheme.primaryBorder);
      el.style.setProperty('--theme-primary-glow', computedTheme.primaryGlow);

      // 6. Logo
      el.style.setProperty('--theme-logo', computedTheme.logoColor);
      el.style.setProperty('--theme-logo-hover', computedTheme.logoHover);
      el.style.setProperty('--theme-logo-rgb', computedTheme.logoRgb);
      el.style.setProperty('--theme-logo-glow', computedTheme.logoGlow);

      // 7. Text
      el.style.setProperty('--theme-text-title', computedTheme.textTitle);
      el.style.setProperty('--theme-text-body', computedTheme.textBody);
      el.style.setProperty('--theme-text-muted', computedTheme.textMuted);
    };

    applyVars(root);
    if (document.body) {
      applyVars(document.body);
    }

    // Persist in localStorage
    try {
      localStorage.setItem('examportal_theme_preference', preference);
      localStorage.setItem('examportal_theme', effectiveTheme);
      localStorage.setItem('examportal_custom_colors', JSON.stringify(customColors));
      localStorage.setItem('examportal_base_color', customColors.buttonColor);
    } catch {}
  }, [computedTheme, effectiveTheme, preference, customColors]);

  const setCustomColor = (key: keyof CustomColors, value: string) => {
    if (!value) return;
    setCustomColorsState(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const setAllCustomColors = (colors: CustomColors) => {
    setCustomColorsState(colors);
  };

  const resetCustomColors = () => {
    setCustomColorsState(DEFAULT_CUSTOM_COLORS);
  };

  const setBaseColor = (hex: string) => {
    setCustomColor('buttonColor', hex);
  };

  const setThemePreference = (pref: ThemePreference) => {
    setPreference(pref);
  };

  const toggleTheme = () => {
    setPreference(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: effectiveTheme,
        preference,
        isDarkMode: effectiveTheme === 'dark',
        customColors,
        computedTheme,
        setCustomColor,
        setAllCustomColors,
        resetCustomColors,
        baseColor: customColors.buttonColor,
        setBaseColor,
        setThemePreference,
        toggleTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
