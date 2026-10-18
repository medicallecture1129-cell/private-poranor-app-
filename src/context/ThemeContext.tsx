import React, { createContext, useContext, useEffect, useState, useMemo } from 'react';
import { 
  computeThemeVariables, 
  ComputedTheme, 
  PRESET_PALETTES, 
  PresetPalette 
} from '../utils/themeColors';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface AccentPalette extends PresetPalette {
  hoverHex: string;
}

export const ACCENT_PALETTES: AccentPalette[] = PRESET_PALETTES.map(p => ({
  ...p,
  hoverHex: p.hex
}));

interface ThemeContextType {
  theme: 'light' | 'dark'; // Effective active theme
  preference: ThemePreference; // User selected preference ('light' | 'dark' | 'system')
  isDarkMode: boolean;
  baseColor: string; // The seed color code chosen by user
  computedTheme: ComputedTheme;
  accentPalette: AccentPalette; // Backward-compatible alias
  palettes: AccentPalette[]; // All presets
  activePresetId: string | null;
  setBaseColor: (hex: string) => void; // Pick ANY color code
  setAccentPaletteId: (paletteId: string) => void;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const defaultTheme = computeThemeVariables('#2563EB', true);

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  preference: 'dark',
  isDarkMode: true,
  baseColor: '#2563EB',
  computedTheme: defaultTheme,
  accentPalette: ACCENT_PALETTES[0],
  palettes: ACCENT_PALETTES,
  activePresetId: 'royal_blue',
  setBaseColor: () => {},
  setAccentPaletteId: () => {},
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
    return 'dark'; // Pitch-Dark default as requested
  });

  const [baseColor, setBaseColorState] = useState<string>(() => {
    try {
      const savedColor = localStorage.getItem('examportal_base_color');
      if (savedColor && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(savedColor)) {
        return savedColor;
      }
      const savedPreset = localStorage.getItem('examportal_accent_palette');
      const found = PRESET_PALETTES.find(p => p.id === savedPreset);
      if (found) {
        return found.hex;
      }
    } catch {}
    return '#2563EB'; // Royal Blue preset
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('dark');

  // Compute the full theme values based on the single base color
  const computedTheme = useMemo(() => {
    return computeThemeVariables(baseColor, effectiveTheme === 'dark');
  }, [baseColor, effectiveTheme]);

  const activePreset = useMemo(() => {
    return PRESET_PALETTES.find(p => p.hex.toLowerCase() === baseColor.toLowerCase()) || null;
  }, [baseColor]);

  const accentPalette: AccentPalette = useMemo(() => {
    if (activePreset) {
      return {
        ...activePreset,
        hoverHex: computedTheme.primaryHover
      };
    }
    return {
      id: 'custom',
      name: 'Custom Tone',
      nameBn: 'কাস্টম কালার',
      hex: baseColor,
      hoverHex: computedTheme.primaryHover
    };
  }, [activePreset, baseColor, computedTheme]);

  // Handle system appearance & CSS variable injection
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

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', computedTheme.bgMain);
      }
    } else {
      root.classList.remove('dark');
      root.classList.add('light');
      document.body.classList.remove('dark');
      document.body.classList.add('light');
      root.setAttribute('data-theme', 'light');

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', computedTheme.bgMain);
      }
    }

    // Set all calculated theme CSS variables globally
    const applyVars = (el: HTMLElement) => {
      // 1. Base & Main Background (Pitch-Dark Solid)
      el.style.setProperty('--theme-base-color', computedTheme.baseHex);
      el.style.setProperty('--theme-bg-main', computedTheme.bgMain);
      el.style.setProperty('--theme-bg-main-rgb', computedTheme.bgMainRgb);

      // 2. Foreground Card & Message Containers ("No Live Exams Found", Modals, Dialogs)
      el.style.setProperty('--theme-bg-card', computedTheme.bgCard);
      el.style.setProperty('--theme-bg-card-hover', computedTheme.bgCardHover);
      el.style.setProperty('--theme-bg-card-rgb', computedTheme.bgCardRgb);

      // 3. Elevated Surface (Navbar Header, Bottom Nav, Filters)
      el.style.setProperty('--theme-bg-surface', computedTheme.bgSurface);
      el.style.setProperty('--theme-bg-surface-elevated', computedTheme.bgSurfaceElevated);

      // 4. Borders
      el.style.setProperty('--theme-border', computedTheme.borderColor);
      el.style.setProperty('--theme-border-card', computedTheme.borderCard);
      el.style.setProperty('--theme-border-strong', computedTheme.borderStrong);

      // 5. Primary Buttons, Badges, Header Capsules & Logos
      el.style.setProperty('--theme-primary', computedTheme.primary);
      el.style.setProperty('--theme-primary-hover', computedTheme.primaryHover);
      el.style.setProperty('--theme-primary-rgb', computedTheme.primaryRgb);
      el.style.setProperty('--theme-primary-text', computedTheme.primaryText);
      el.style.setProperty('--theme-primary-light', computedTheme.primaryLight);
      el.style.setProperty('--theme-primary-border', computedTheme.primaryBorder);
      el.style.setProperty('--theme-primary-glow', computedTheme.primaryGlow);

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
      localStorage.setItem('examportal_theme_preference', preference);
      localStorage.setItem('examportal_theme', effectiveTheme);
      localStorage.setItem('examportal_base_color', baseColor);
      if (activePreset) {
        localStorage.setItem('examportal_accent_palette', activePreset.id);
      }
    } catch {}
  }, [computedTheme, effectiveTheme, preference, baseColor, activePreset]);

  const setBaseColor = (hex: string) => {
    if (!hex) return;
    setBaseColorState(hex);
  };

  const setAccentPaletteId = (paletteId: string) => {
    const found = PRESET_PALETTES.find(p => p.id === paletteId);
    if (found) {
      setBaseColorState(found.hex);
    }
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
        baseColor,
        computedTheme,
        accentPalette,
        palettes: ACCENT_PALETTES,
        activePresetId: activePreset ? activePreset.id : null,
        setBaseColor,
        setAccentPaletteId,
        setThemePreference,
        toggleTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
