import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';
export type ThemeColor = 'default' | 'ocean' | 'emerald' | 'purple' | 'amber' | 'crimson';

interface ThemeContextType {
  theme: ThemeMode;
  colorTheme: ThemeColor;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
  setColorTheme: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);
const THEME_MODE_KEY = 'examportal_device_theme_mode';
const THEME_COLOR_KEY = 'examportal_device_theme_color';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Device-specific theme mode ('dark' or 'light')
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem(THEME_MODE_KEY);
      if (saved === 'light' || saved === 'dark') return saved;
    } catch {}
    return 'dark';
  });

  // Device-specific color accent theme
  const [colorTheme, setColorThemeState] = useState<ThemeColor>(() => {
    try {
      const saved = localStorage.getItem(THEME_COLOR_KEY);
      if (saved && ['default', 'ocean', 'emerald', 'purple', 'amber', 'crimson'].includes(saved)) {
        return saved as ThemeColor;
      }
    } catch {}
    return 'default';
  });

  // Apply HTML classes and data-theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Remove existing color theme classes
    root.classList.remove('theme-ocean', 'theme-emerald', 'theme-purple', 'theme-amber', 'theme-crimson', 'theme-default');
    root.classList.add(`theme-${colorTheme}`);
    root.setAttribute('data-color-theme', colorTheme);

    try {
      localStorage.setItem(THEME_MODE_KEY, theme);
      localStorage.setItem(THEME_COLOR_KEY, colorTheme);
    } catch {}
  }, [theme, colorTheme]);

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const setColorTheme = (newColor: ThemeColor) => {
    setColorThemeState(newColor);
  };

  return (
    <ThemeContext.Provider value={{ theme, colorTheme, toggleTheme, setTheme, setColorTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
