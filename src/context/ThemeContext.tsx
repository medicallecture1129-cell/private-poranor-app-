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
  colorHex: string;
  colorRgb: string;
  bgClass: string;
  hoverHex: string;
  glowRgba: string;
}

export const AVAILABLE_THEMES: ThemeOption[] = [
  { 
    id: 'default', 
    name: 'Electric Blue', 
    colorHex: '#2563eb', 
    colorRgb: '37, 99, 235', 
    bgClass: 'bg-blue-600',
    hoverHex: '#1d4ed8',
    glowRgba: 'rgba(37, 99, 235, 0.35)'
  },
  { 
    id: 'ocean', 
    name: 'Ocean Cyan', 
    colorHex: '#06b6d4', 
    colorRgb: '6, 182, 212', 
    bgClass: 'bg-cyan-500',
    hoverHex: '#0891b2',
    glowRgba: 'rgba(6, 182, 212, 0.35)'
  },
  { 
    id: 'emerald', 
    name: 'Medical Emerald', 
    colorHex: '#10b981', 
    colorRgb: '16, 185, 129', 
    bgClass: 'bg-emerald-600',
    hoverHex: '#059669',
    glowRgba: 'rgba(16, 185, 129, 0.35)'
  },
  { 
    id: 'purple', 
    name: 'Royal Purple', 
    colorHex: '#8b5cf6', 
    colorRgb: '139, 92, 246', 
    bgClass: 'bg-purple-600',
    hoverHex: '#7c3aed',
    glowRgba: 'rgba(139, 92, 246, 0.35)'
  },
  { 
    id: 'amber', 
    name: 'Warm Amber', 
    colorHex: '#f59e0b', 
    colorRgb: '245, 158, 11', 
    bgClass: 'bg-amber-600',
    hoverHex: '#d97706',
    glowRgba: 'rgba(245, 158, 11, 0.35)'
  },
  { 
    id: 'crimson', 
    name: 'Rose Crimson', 
    colorHex: '#f43f5e', 
    colorRgb: '244, 63, 94', 
    bgClass: 'bg-rose-600',
    hoverHex: '#e11d48',
    glowRgba: 'rgba(244, 63, 94, 0.35)'
  },
  { 
    id: 'cyberpunk', 
    name: 'Neon Pink', 
    colorHex: '#ec4899', 
    colorRgb: '236, 72, 153', 
    bgClass: 'bg-pink-600',
    hoverHex: '#db2777',
    glowRgba: 'rgba(236, 72, 153, 0.38)'
  },
  { 
    id: 'midnight', 
    name: 'Deep Indigo', 
    colorHex: '#6366f1', 
    colorRgb: '99, 102, 241', 
    bgClass: 'bg-indigo-600',
    hoverHex: '#4f46e5',
    glowRgba: 'rgba(99, 102, 241, 0.38)'
  },
  { 
    id: 'forest', 
    name: 'Forest Green', 
    colorHex: '#16a34a', 
    colorRgb: '22, 163, 74', 
    bgClass: 'bg-green-600',
    hoverHex: '#15803d',
    glowRgba: 'rgba(22, 163, 74, 0.35)'
  },
];

interface ThemeContextType {
  theme: ThemeMode;
  colorTheme: ThemeColor;
  activeThemeOption: ThemeOption;
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

  const activeThemeOption = AVAILABLE_THEMES.find(t => t.id === colorTheme) || AVAILABLE_THEMES[0];

  // Apply HTML classes, data attributes, and CSS variables
  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    // Set data attribute
    root.setAttribute('data-theme-mode', theme);
    root.setAttribute('data-color-theme', colorTheme);

    // Apply root CSS Variables for active theme palette
    root.style.setProperty('--theme-primary', activeThemeOption.colorHex);
    root.style.setProperty('--theme-primary-rgb', activeThemeOption.colorRgb);
    root.style.setProperty('--theme-primary-hover', activeThemeOption.hoverHex);
    root.style.setProperty('--theme-primary-glow', activeThemeOption.glowRgba);
    root.style.setProperty('--theme-primary-light', `rgba(${activeThemeOption.colorRgb}, 0.12)`);
    root.style.setProperty('--theme-primary-border', `rgba(${activeThemeOption.colorRgb}, 0.28)`);

    try {
      localStorage.setItem(THEME_MODE_KEY, theme);
      localStorage.setItem(THEME_COLOR_KEY, colorTheme);
    } catch {}
  }, [theme, colorTheme, activeThemeOption]);

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
    <ThemeContext.Provider value={{ 
      theme, 
      colorTheme, 
      activeThemeOption, 
      toggleTheme, 
      setTheme, 
      setColorTheme 
    }}>
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
