import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface AccentPalette {
  id: string;
  name: string;
  nameBn: string;
  hex: string;
  hoverHex: string;
}

export const ACCENT_PALETTES: AccentPalette[] = [
  { id: 'royal_blue', name: 'Soft Royal Blue', nameBn: 'রয়েল নীল', hex: '#2563EB', hoverHex: '#1D4ED8' },
  { id: 'crimson_red', name: 'Muted Crimson Red', nameBn: 'মার্জিত লাল', hex: '#DC2626', hoverHex: '#B91C1C' },
  { id: 'warm_amber', name: 'Warm Amber / Orange', nameBn: 'কমলা/হলুদ আম্বার', hex: '#D97706', hoverHex: '#B45309' },
  { id: 'sage_green', name: 'Sage Forest Green', nameBn: 'সবুজ', hex: '#059669', hoverHex: '#047857' },
  { id: 'terracotta_brown', name: 'Muted Terracotta Brown', nameBn: 'হালকা বাদামী', hex: '#B45309', hoverHex: '#92400E' },
  { id: 'amethyst_purple', name: 'Deep Amethyst Purple', nameBn: 'বেগুনি', hex: '#7C3AED', hoverHex: '#6D28D9' },
  { id: 'rose_pink', name: 'Rose Pink', nameBn: 'গোলাপী', hex: '#DB2777', hoverHex: '#BE185D' },
  { id: 'magenta_berry', name: 'Dark Magenta / Berry', nameBn: 'গাঢ় গোলাপী', hex: '#BE185D', hoverHex: '#9D174D' },
  { id: 'slate_teal', name: 'Slate Teal', nameBn: 'টিল/সবুজাভ নীল', hex: '#0D9488', hoverHex: '#0F766E' },
  { id: 'charcoal_gold', name: 'Warm Charcoal / Gold', nameBn: 'সোনালী ওয়ার্ম টোন', hex: '#CA8A04', hoverHex: '#A16207' },
];

interface ThemeContextType {
  theme: 'light' | 'dark'; // Effective active theme
  preference: ThemePreference; // User selected preference ('light' | 'dark' | 'system')
  isDarkMode: boolean;
  accentPalette: AccentPalette;
  palettes: AccentPalette[];
  setAccentPaletteId: (paletteId: string) => void;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  preference: 'dark',
  isDarkMode: true,
  accentPalette: ACCENT_PALETTES[0],
  palettes: ACCENT_PALETTES,
  setAccentPaletteId: () => {},
  setThemePreference: () => {},
  toggleTheme: () => {}
});

function hexToRgb(hex: string): string {
  const cleanHex = hex.replace('#', '');
  const r = parseInt(cleanHex.substring(0, 2), 16) || 37;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 99;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 235;
  return `${r}, ${g}, ${b}`;
}

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreference] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem('examportal_theme_preference') as ThemePreference | null;
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        return saved;
      }
    } catch {}
    return 'dark'; // Default starting theme
  });

  const [accentPaletteId, setAccentPaletteIdState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('examportal_accent_palette');
      if (saved && ACCENT_PALETTES.some(p => p.id === saved)) {
        return saved;
      }
    } catch {}
    return 'royal_blue'; // Default to Soft Royal Blue (#2563EB)
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('dark');

  const currentPalette = ACCENT_PALETTES.find(p => p.id === accentPaletteId) || ACCENT_PALETTES[0];

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyThemeAndAccent = () => {
      let activeTheme: 'light' | 'dark' = 'dark';
      if (preference === 'system') {
        activeTheme = mediaQuery.matches ? 'dark' : 'light';
      } else {
        activeTheme = preference;
      }

      setEffectiveTheme(activeTheme);

      const root = document.documentElement;
      const isDark = activeTheme === 'dark';

      if (isDark) {
        root.classList.add('dark');
        root.classList.remove('light');
        document.body.classList.add('dark');
        document.body.classList.remove('light');
        root.setAttribute('data-theme', 'dark');

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', '#0e1117');
        }
      } else {
        root.classList.remove('dark');
        root.classList.add('light');
        document.body.classList.remove('dark');
        document.body.classList.add('light');
        root.setAttribute('data-theme', 'light');

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', '#f8fafd');
        }
      }

      // Dynamic CSS variables for selected Accent Palette
      const rgb = hexToRgb(currentPalette.hex);
      root.style.setProperty('--theme-primary', currentPalette.hex);
      root.style.setProperty('--theme-primary-rgb', rgb);
      root.style.setProperty('--theme-primary-hover', currentPalette.hoverHex);
      root.style.setProperty('--theme-primary-glow', `rgba(${rgb}, ${isDark ? 0.48 : 0.22})`);
      root.style.setProperty('--theme-primary-light', `rgba(${rgb}, ${isDark ? 0.22 : 0.09})`);
      root.style.setProperty('--theme-primary-border', `rgba(${rgb}, ${isDark ? 0.42 : 0.24})`);

      if (document.body) {
        document.body.style.setProperty('--theme-primary', currentPalette.hex);
        document.body.style.setProperty('--theme-primary-rgb', rgb);
        document.body.style.setProperty('--theme-primary-hover', currentPalette.hoverHex);
        document.body.style.setProperty('--theme-primary-glow', `rgba(${rgb}, ${isDark ? 0.48 : 0.22})`);
        document.body.style.setProperty('--theme-primary-light', `rgba(${rgb}, ${isDark ? 0.22 : 0.09})`);
        document.body.style.setProperty('--theme-primary-border', `rgba(${rgb}, ${isDark ? 0.42 : 0.24})`);
      }

      try {
        localStorage.setItem('examportal_theme_preference', preference);
        localStorage.setItem('examportal_theme', activeTheme);
        localStorage.setItem('examportal_accent_palette', currentPalette.id);
      } catch {}
    };

    applyThemeAndAccent();

    if (preference === 'system') {
      mediaQuery.addEventListener('change', applyThemeAndAccent);
      return () => mediaQuery.removeEventListener('change', applyThemeAndAccent);
    }
  }, [preference, currentPalette]);

  const setThemePreference = (pref: ThemePreference) => {
    setPreference(pref);
  };

  const toggleTheme = () => {
    setPreference(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setAccentPaletteId = (paletteId: string) => {
    if (ACCENT_PALETTES.some(p => p.id === paletteId)) {
      setAccentPaletteIdState(paletteId);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme: effectiveTheme,
        preference,
        isDarkMode: effectiveTheme === 'dark',
        accentPalette: currentPalette,
        palettes: ACCENT_PALETTES,
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
