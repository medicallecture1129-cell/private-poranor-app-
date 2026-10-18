import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { 
  computeThemeVariables, 
  ComputedTheme, 
  CustomColors, 
  DEFAULT_CUSTOM_COLORS,
  normalizeHex 
} from '../utils/themeColors';

export type { CustomColors };

interface ThemeContextType {
  theme: 'dark';
  isDarkMode: true;
  customColors: CustomColors;
  computedTheme: ComputedTheme;
  setCustomColor: (key: keyof CustomColors, value: string) => void;
  setAllCustomColors: (colors: CustomColors) => void;
  resetCustomColors: () => void;
  // Backwards-compatible aliases
  baseColor: string;
  setBaseColor: (hex: string) => void;
  preference?: 'dark';
  setThemePreference?: (pref: any) => void;
  toggleTheme?: () => void;
}

const defaultComputed = computeThemeVariables(DEFAULT_CUSTOM_COLORS);

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  isDarkMode: true,
  customColors: DEFAULT_CUSTOM_COLORS,
  computedTheme: defaultComputed,
  setCustomColor: () => {},
  setAllCustomColors: () => {},
  resetCustomColors: () => {},
  baseColor: DEFAULT_CUSTOM_COLORS.primaryColor,
  setBaseColor: () => {},
  preference: 'dark',
  setThemePreference: () => {},
  toggleTheme: () => {}
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [customColors, setCustomColorsState] = useState<CustomColors>(() => {
    try {
      const saved = localStorage.getItem('examportal_custom_colors');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.bgColor && parsed.fgColor) {
          const primary = normalizeHex(parsed.primaryColor || parsed.buttonColor || parsed.logoColor || DEFAULT_CUSTOM_COLORS.primaryColor);
          return {
            bgColor: normalizeHex(parsed.bgColor, DEFAULT_CUSTOM_COLORS.bgColor),
            fgColor: normalizeHex(parsed.fgColor, DEFAULT_CUSTOM_COLORS.fgColor),
            primaryColor: primary,
            buttonColor: primary,
            logoColor: primary
          };
        }
      }
      // Migrate from old base color if present
      const oldBase = localStorage.getItem('examportal_base_color');
      if (oldBase && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(oldBase)) {
        const norm = normalizeHex(oldBase);
        return {
          ...DEFAULT_CUSTOM_COLORS,
          primaryColor: norm,
          buttonColor: norm,
          logoColor: norm
        };
      }
    } catch {}
    return DEFAULT_CUSTOM_COLORS;
  });

  // Compute theme variables from custom colors (strictly dark mode)
  const computedTheme = useMemo(() => {
    return computeThemeVariables(customColors);
  }, [customColors]);

  // Ensure DOM is permanently in Dark Mode
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add('dark');
    root.classList.remove('light');
    root.setAttribute('data-theme', 'dark');

    if (document.body) {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
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

      // 5. Button & Logo (Unified Primary)
      el.style.setProperty('--theme-primary', computedTheme.primary);
      el.style.setProperty('--theme-primary-hover', computedTheme.primaryHover);
      el.style.setProperty('--theme-primary-rgb', computedTheme.primaryRgb);
      el.style.setProperty('--theme-primary-text', computedTheme.primaryText);
      el.style.setProperty('--theme-primary-light', computedTheme.primaryLight);
      el.style.setProperty('--theme-primary-border', computedTheme.primaryBorder);
      el.style.setProperty('--theme-primary-glow', computedTheme.primaryGlow);

      // Logo uses the same unified color
      el.style.setProperty('--theme-logo', computedTheme.logoColor);
      el.style.setProperty('--theme-logo-hover', computedTheme.logoHover);
      el.style.setProperty('--theme-logo-rgb', computedTheme.logoRgb);
      el.style.setProperty('--theme-logo-glow', computedTheme.logoGlow);

      // 6. Text
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
      localStorage.setItem('examportal_custom_colors', JSON.stringify(customColors));
      localStorage.setItem('examportal_base_color', customColors.primaryColor);
    } catch {}
  }, [computedTheme, customColors]);

  const setCustomColor = (key: keyof CustomColors, value: string) => {
    if (!value) return;
    const normalized = normalizeHex(value);
    setCustomColorsState(prev => {
      if (key === 'primaryColor' || key === 'buttonColor' || key === 'logoColor') {
        return {
          ...prev,
          primaryColor: normalized,
          buttonColor: normalized,
          logoColor: normalized
        };
      }
      return {
        ...prev,
        [key]: normalized
      };
    });
  };

  const setAllCustomColors = (colors: CustomColors) => {
    const primary = normalizeHex(colors.primaryColor || colors.buttonColor || colors.logoColor);
    setCustomColorsState({
      bgColor: normalizeHex(colors.bgColor, DEFAULT_CUSTOM_COLORS.bgColor),
      fgColor: normalizeHex(colors.fgColor, DEFAULT_CUSTOM_COLORS.fgColor),
      primaryColor: primary,
      buttonColor: primary,
      logoColor: primary
    });
  };

  const resetCustomColors = () => {
    setCustomColorsState(DEFAULT_CUSTOM_COLORS);
  };

  const setBaseColor = (hex: string) => {
    setCustomColor('primaryColor', hex);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: 'dark',
        isDarkMode: true,
        customColors,
        computedTheme,
        setCustomColor,
        setAllCustomColors,
        resetCustomColors,
        baseColor: customColors.primaryColor,
        setBaseColor,
        preference: 'dark',
        setThemePreference: () => {},
        toggleTheme: () => {}
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
