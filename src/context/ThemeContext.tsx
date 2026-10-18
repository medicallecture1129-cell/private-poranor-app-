import React, { createContext, useContext, useEffect, useState } from 'react';
import { subscribePortalSettings, updatePortalSettings } from '../services/db';

type Theme = 'dark' | 'light';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<Theme>('dark');

  // Real-time Firestore sync for portal theme customization
  useEffect(() => {
    const unsub = subscribePortalSettings((settings) => {
      if (settings.theme === 'light' || settings.theme === 'dark') {
        setThemeState(settings.theme);
      }
    });

    return () => unsub();
  }, []);

  // Update HTML class whenever theme changes
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const toggleTheme = () => {
    const newTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    setThemeState(newTheme);
    // Persist to Cloud Firestore so all devices and reloads sync seamlessly
    updatePortalSettings({ theme: newTheme }).catch((err) => {
      console.warn('Theme Firestore sync warning:', err);
    });
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    updatePortalSettings({ theme: newTheme }).catch((err) => {
      console.warn('Theme Firestore sync warning:', err);
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
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
