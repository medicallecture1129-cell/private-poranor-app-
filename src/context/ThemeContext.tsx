import React, { createContext, useContext, useEffect } from 'react';

/**
 * Clean & Professional Pro Dark Mode (Permanently active)
 * Inspired by modern ultra-clean dark UI aesthetics (Deep obsidian/charcoal with coral-rose accents).
 * All previous extra themes and multi-theme switchers have been cleanly removed.
 */
interface ThemeContextType {
  theme: 'dark';
  colorTheme: 'pro-dark';
  isDarkMode: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'dark',
  colorTheme: 'pro-dark',
  isDarkMode: true
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  useEffect(() => {
    const root = document.documentElement;

    // Enforce permanent dark mode class on <html> and <body>
    root.classList.add('dark');
    document.body.classList.add('dark');
    root.setAttribute('data-theme', 'dark');

    // Set eye-comfortable, professional Pro Dark CSS variables (Obsidian + Coral-Rose Accent)
    root.style.setProperty('--theme-primary', '#f43f5e');
    root.style.setProperty('--theme-primary-rgb', '244, 63, 94');
    root.style.setProperty('--theme-primary-hover', '#e11d48');
    root.style.setProperty('--theme-primary-glow', 'rgba(244, 63, 94, 0.35)');
    root.style.setProperty('--theme-primary-light', 'rgba(244, 63, 94, 0.12)');
    root.style.setProperty('--theme-primary-border', 'rgba(244, 63, 94, 0.28)');

    // Ensure clean dark theme storage
    try {
      localStorage.setItem('examportal_theme', 'dark');
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: 'dark', colorTheme: 'pro-dark', isDarkMode: true }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
