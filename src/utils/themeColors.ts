/**
 * Custom Color Management Engine (Zero Presets)
 * 
 * Allows setting:
 * 1. Background Color (মেইন ব্যাকগ্রাউন্ড কালার)
 * 2. Foreground Color (ফোরগ্রাউন্ড / কার্ড কালার)
 * 3. Button Color (বাটন কালার)
 * 4. Logo Color (লোগো কালার)
 */

export interface ColorHSL {
  h: number;
  s: number;
  l: number;
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: string): ColorRGB {
  let cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  const num = parseInt(cleanHex, 16);
  if (isNaN(num) || cleanHex.length !== 6) {
    return { r: 37, g: 99, b: 235 };
  }
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHsl(r: number, g: number, b: number): ColorHSL {
  const rNorm = r / 255;
  const gNorm = g / 255;
  const bNorm = b / 255;
  const max = Math.max(rNorm, gNorm, bNorm);
  const min = Math.min(rNorm, gNorm, bNorm);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rNorm:
        h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
        break;
      case gNorm:
        h = (bNorm - rNorm) / d + 2;
        break;
      case bNorm:
        h = (rNorm - gNorm) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hNorm = h / 360;
  const sNorm = s / 100;
  const lNorm = l / 100;

  if (sNorm === 0) {
    const val = Math.round(lNorm * 255);
    const hex = val.toString(16).padStart(2, '0');
    return `#${hex}${hex}${hex}`;
  }

  const hue2rgb = (p: number, q: number, t: number) => {
    let tAdj = t;
    if (tAdj < 0) tAdj += 1;
    if (tAdj > 1) tAdj -= 1;
    if (tAdj < 1 / 6) return p + (q - p) * 6 * tAdj;
    if (tAdj < 1 / 2) return q;
    if (tAdj < 2 / 3) return p + (q - p) * (2 / 3 - tAdj) * 6;
    return p;
  };

  const q = lNorm < 0.5 ? lNorm * (1 + sNorm) : lNorm + sNorm - lNorm * sNorm;
  const p = 2 * lNorm - q;

  const r = Math.round(hue2rgb(p, q, hNorm + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hNorm) * 255);
  const b = Math.round(hue2rgb(p, q, hNorm - 1 / 3) * 255);

  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export interface CustomColors {
  bgColor: string;     // Background Color (Default: #090e18)
  fgColor: string;     // Foreground / Card Color (Default: #132035)
  buttonColor: string; // Button Color (Default: #2563eb)
  logoColor: string;   // Logo Color (Default: #2563eb)
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  bgColor: '#090e18',
  fgColor: '#132035',
  buttonColor: '#2563eb',
  logoColor: '#2563eb'
};

export interface ComputedTheme {
  isDark: boolean;
  // 1. Backgrounds
  bgMain: string;
  bgMainRgb: string;
  bgCard: string;
  bgCardHover: string;
  bgCardRgb: string;
  bgSurface: string;
  bgSurfaceElevated: string;
  // 2. Borders
  borderColor: string;
  borderCard: string;
  borderStrong: string;
  // 3. Button
  primary: string;
  primaryHover: string;
  primaryRgb: string;
  primaryText: string;
  primaryLight: string;
  primaryBorder: string;
  primaryGlow: string;
  // 4. Logo
  logoColor: string;
  logoHover: string;
  logoRgb: string;
  logoGlow: string;
  // 5. Typography
  textTitle: string;
  textBody: string;
  textMuted: string;
}

export function computeThemeVariables(colors: CustomColors, isDark: boolean = true): ComputedTheme {
  const bgRgb = hexToRgb(colors.bgColor || DEFAULT_CUSTOM_COLORS.bgColor);
  const fgRgb = hexToRgb(colors.fgColor || DEFAULT_CUSTOM_COLORS.fgColor);
  const btnRgb = hexToRgb(colors.buttonColor || DEFAULT_CUSTOM_COLORS.buttonColor);
  const logoRgb = hexToRgb(colors.logoColor || DEFAULT_CUSTOM_COLORS.logoColor);

  const btnHsl = rgbToHsl(btnRgb.r, btnRgb.g, btnRgb.b);
  const fgHsl = rgbToHsl(fgRgb.r, fgRgb.g, fgRgb.b);
  const logoHsl = rgbToHsl(logoRgb.r, logoRgb.g, logoRgb.b);

  const primaryHex = colors.buttonColor || DEFAULT_CUSTOM_COLORS.buttonColor;
  const primaryHoverHex = hslToHex(btnHsl.h, btnHsl.s, Math.max(20, Math.min(80, btnHsl.l > 40 ? btnHsl.l - 7 : btnHsl.l + 7)));
  const primaryRgbStr = `${btnRgb.r}, ${btnRgb.g}, ${btnRgb.b}`;

  const logoHex = colors.logoColor || DEFAULT_CUSTOM_COLORS.logoColor;
  const logoHoverHex = hslToHex(logoHsl.h, logoHsl.s, Math.max(20, Math.min(80, logoHsl.l > 40 ? logoHsl.l - 7 : logoHsl.l + 7)));
  const logoRgbStr = `${logoRgb.r}, ${logoRgb.g}, ${logoRgb.b}`;

  const bgMainHex = colors.bgColor || DEFAULT_CUSTOM_COLORS.bgColor;
  const bgMainRgbStr = `${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}`;

  const bgCardHex = colors.fgColor || DEFAULT_CUSTOM_COLORS.fgColor;
  const bgCardHoverHex = hslToHex(fgHsl.h, fgHsl.s, Math.max(10, Math.min(95, fgHsl.l > 50 ? fgHsl.l - 4 : fgHsl.l + 4)));
  const bgCardRgbStr = `${fgRgb.r}, ${fgRgb.g}, ${fgRgb.b}`;

  // Surface: slightly toned between card and bg
  const bgSurfaceHex = hslToHex(fgHsl.h, Math.round(fgHsl.s * 0.9), Math.max(6, Math.min(94, fgHsl.l > 50 ? fgHsl.l + 3 : fgHsl.l - 3)));
  const bgSurfaceElevated = bgCardHoverHex;

  // Borders
  const borderCard = `rgba(${btnRgb.r}, ${btnRgb.g}, ${btnRgb.b}, 0.25)`;
  const borderColor = `rgba(${btnRgb.r}, ${btnRgb.g}, ${btnRgb.b}, 0.18)`;
  const borderStrong = `rgba(${btnRgb.r}, ${btnRgb.g}, ${btnRgb.b}, 0.45)`;

  // Button glow & light
  const primaryLight = `rgba(${btnRgb.r}, ${btnRgb.g}, ${btnRgb.b}, 0.18)`;
  const primaryBorder = `rgba(${btnRgb.r}, ${btnRgb.g}, ${btnRgb.b}, 0.42)`;
  const primaryGlow = `rgba(${btnRgb.r}, ${btnRgb.g}, ${btnRgb.b}, 0.35)`;

  const logoGlow = `rgba(${logoRgb.r}, ${logoRgb.g}, ${logoRgb.b}, 0.35)`;

  // Text contrast
  const bgHsl = rgbToHsl(bgRgb.r, bgRgb.g, bgRgb.b);
  const isBackgroundDark = bgHsl.l < 50;

  const textTitle = isBackgroundDark ? '#f8fafc' : '#0f172a';
  const textBody = isBackgroundDark ? '#e2e8f0' : '#334155';
  const textMuted = isBackgroundDark ? '#94a3b8' : '#64748b';

  return {
    isDark,
    bgMain: bgMainHex,
    bgMainRgb: bgMainRgbStr,
    bgCard: bgCardHex,
    bgCardHover: bgCardHoverHex,
    bgCardRgb: bgCardRgbStr,
    bgSurface: bgSurfaceHex,
    bgSurfaceElevated,
    borderColor,
    borderCard,
    borderStrong,
    primary: primaryHex,
    primaryHover: primaryHoverHex,
    primaryRgb: primaryRgbStr,
    primaryText: '#ffffff',
    primaryLight,
    primaryBorder,
    primaryGlow,
    logoColor: logoHex,
    logoHover: logoHoverHex,
    logoRgb: logoRgbStr,
    logoGlow,
    textTitle,
    textBody,
    textMuted
  };
}
