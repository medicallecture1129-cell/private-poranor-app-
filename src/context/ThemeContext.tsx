import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'dark' | 'light';
export type ThemeColor = 
  | 'default' 
  | 'ocean' 
  | 'emerald' 
  | 'purple' 
  | 'amber' 
  | 'crimson' 
  | 'cyberpunk' 
  | 'midnight' 
  | 'forest';

export interface ThemeOption {
  id: ThemeColor;
  name: string;
  nameBn: string;
  colorHex: string;
  bgClass: string;
}

export const AVAILABLE_THEMES: ThemeOption[] = [
  { id: 'default', name: 'Classic Slate', nameBn: 'ক্লাসিক স্লেট', colorHex: '#2563eb', bgClass: 'bg-blue-600' },
  { id: 'ocean', name: 'Ocean Cyan', nameBn: 'সমুদ্র নীল', colorHex: '#06b6d4', bgClass: 'bg-cyan-600' },
  { id: 'emerald', name: 'Medical Mint', nameBn: 'মেডিকেল মিন্ট', colorHex: '#059669', bgClass: 'bg-emerald-600' },
  { id: 'purple', name: 'Royal Indigo', nameBn: 'রয়েল পার্পল', colorHex: '#7c3aed', bgClass: 'bg-purple-600' },
  { id: 'amber', name: 'Warm Amber', nameBn: 'সূর্যাস্ত সোনালী', colorHex: '#d97706', bgClass: 'bg-amber-600' },
  { id: 'crimson', name: 'Rose Crimson', nameBn: 'গোলাপী রুবি', colorHex: '#e11d48', bgClass: 'bg-rose-600' },
  { id: 'cyberpunk', name: 'Neon Cyber', nameBn: 'নিয়ন সাইবার', colorHex: '#ec4899', bgClass: 'bg-pink-600' },
  { id: 'midnight', name: 'Midnight AMOLED', nameBn: 'মধ্যরাত কালো', colorHex: '#3b82f6', bgClass: 'bg-indigo-600' },
  { id: 'forest', name: 'Deep Forest', nameBn: 'গভীর অরণ্য', colorHex: '#15803d', bgClass: 'bg-green-700' },
];

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
      if (saved && AVAILABLE_THEMES.some(t => t.id === saved)) {
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
    AVAILABLE_THEMES.forEach(t => root.classList.remove(`theme-${t.id}`));
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
