import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: 'light' | 'dark'; // Effective active theme
  preference: ThemePreference; // User selected preference ('light' | 'dark' | 'system')
  isDarkMode: boolean;
  setThemePreference: (pref: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  preference: 'dark',
  isDarkMode: true,
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
    return 'dark'; // Default starting theme
  });

  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('dark');

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
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

        // Gemini Pro Dark variables (Deep Obsidian + Sky/Gemini Accent)
        root.style.setProperty('--theme-primary', '#38bdf8');
        root.style.setProperty('--theme-primary-rgb', '56, 189, 248');
        root.style.setProperty('--theme-primary-hover', '#0284c7');
        root.style.setProperty('--theme-primary-glow', 'rgba(56, 189, 248, 0.35)');
        root.style.setProperty('--theme-primary-light', 'rgba(56, 189, 248, 0.12)');
        root.style.setProperty('--theme-primary-border', 'rgba(56, 189, 248, 0.28)');

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

        // Gemini Light variables (Google Blue #2563eb)
        root.style.setProperty('--theme-primary', '#2563eb');
        root.style.setProperty('--theme-primary-rgb', '37, 99, 235');
        root.style.setProperty('--theme-primary-hover', '#1d4ed8');
        root.style.setProperty('--theme-primary-glow', 'rgba(37, 99, 235, 0.25)');
        root.style.setProperty('--theme-primary-light', 'rgba(37, 99, 235, 0.08)');
        root.style.setProperty('--theme-primary-border', 'rgba(37, 99, 235, 0.2)');

        const metaThemeColor = document.querySelector('meta[name="theme-color"]');
        if (metaThemeColor) {
          metaThemeColor.setAttribute('content', '#ffffff');
        }
      }

      try {
        localStorage.setItem('examportal_theme_preference', preference);
        localStorage.setItem('examportal_theme', activeTheme);
      } catch {}
    };

    applyTheme();

    if (preference === 'system') {
      mediaQuery.addEventListener('change', applyTheme);
      return () => mediaQuery.removeEventListener('change', applyTheme);
    }
  }, [preference]);

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
        setThemePreference,
        toggleTheme
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
