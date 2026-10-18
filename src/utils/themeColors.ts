/**
 * Custom Color Management Engine
 * 
 * 3 Unified Color Controls:
 * 1. Background Color (মেইন ব্যাকগ্রাউন্ড কালার)
 * 2. Foreground Color (ফোরগ্রাউন্ড / কার্ড কালার)
 * 3. Button & Logo Color (বাটন ও লোগো কালার — ১টি সমন্বিত কালার পিকার)
 */

export interface ColorHSL {
  h: number;
  s: number;
  l: number;
}

export interface ColorHSV {
  h: number; // 0 - 360
  s: number; // 0 - 100
  v: number; // 0 - 100
}

export interface ColorRGB {
  r: number;
  g: number;
  b: number;
}

export function normalizeHex(hex: string | undefined | null, fallback: string = '#2563eb'): string {
  if (!hex || typeof hex !== 'string') return fallback;
  let clean = hex.trim();
  if (!clean.startsWith('#')) clean = '#' + clean;
  if (/^#[0-9A-Fa-f]{6}$/.test(clean)) return clean.toLowerCase();
  if (/^#[0-9A-Fa-f]{3}$/.test(clean)) {
    return (`#${clean[1]}${clean[1]}${clean[2]}${clean[2]}${clean[3]}${clean[3]}`).toLowerCase();
  }
  return fallback;
}

export function hexToRgb(hex: string): ColorRGB {
  const cleanHex = normalizeHex(hex, '#2563eb').replace('#', '');
  const num = parseInt(cleanHex, 16);
  if (isNaN(num)) {
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

export function hsvToRgb(h: number, s: number, v: number): ColorRGB {
  const sNorm = Math.max(0, Math.min(100, s)) / 100;
  const vNorm = Math.max(0, Math.min(100, v)) / 100;
  const c = vNorm * sNorm;
  const hPrime = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hPrime % 2) - 1));
  const m = vNorm - c;

  let r1 = 0, g1 = 0, b1 = 0;
  if (hPrime >= 0 && hPrime < 1) { r1 = c; g1 = x; b1 = 0; }
  else if (hPrime >= 1 && hPrime < 2) { r1 = x; g1 = c; b1 = 0; }
  else if (hPrime >= 2 && hPrime < 3) { r1 = 0; g1 = c; b1 = x; }
  else if (hPrime >= 3 && hPrime < 4) { r1 = 0; g1 = x; b1 = c; }
  else if (hPrime >= 4 && hPrime < 5) { r1 = x; g1 = 0; b1 = c; }
  else if (hPrime >= 5 && hPrime < 6) { r1 = c; g1 = 0; b1 = x; }

  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255),
  };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const rgb = hsvToRgb(h, s, v);
  const rHex = rgb.r.toString(16).padStart(2, '0');
  const gHex = rgb.g.toString(16).padStart(2, '0');
  const bHex = rgb.b.toString(16).padStart(2, '0');
  return `#${rHex}${gHex}${bHex}`;
}

export function hexToHsv(hex: string): ColorHSV {
  const rgb = hexToRgb(hex);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === r) {
      h = ((g - b) / delta) % 6;
    } else if (max === g) {
      h = (b - r) / delta + 2;
    } else {
      h = (r - g) / delta + 4;
    }
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : Math.round((delta / max) * 100);
  const v = Math.round(max * 100);

  return { h, s, v };
}

export interface CustomColors {
  bgColor: string;      // Background Color (Default: #090e18)
  fgColor: string;      // Foreground / Card Color (Default: #132035)
  primaryColor: string; // Unified Button & Logo Color (Default: #2563eb)
  buttonColor?: string; // Compatibility alias
  logoColor?: string;   // Compatibility alias
}

export const DEFAULT_CUSTOM_COLORS: CustomColors = {
  bgColor: '#090e18',
  fgColor: '#132035',
  primaryColor: '#2563eb',
  buttonColor: '#2563eb',
  logoColor: '#2563eb'
};

export interface ComputedTheme {
  isDark: true;
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
  // 3. Button & Logo (Unified Primary)
  primary: string;
  primaryHover: string;
  primaryRgb: string;
  primaryText: string;
  primaryLight: string;
  primaryBorder: string;
  primaryGlow: string;
  logoColor: string;
  logoHover: string;
  logoRgb: string;
  logoGlow: string;
  // 4. Typography
  textTitle: string;
  textBody: string;
  textMuted: string;
}

export function computeThemeVariables(colors: CustomColors): ComputedTheme {
  const normBg = normalizeHex(colors.bgColor, DEFAULT_CUSTOM_COLORS.bgColor);
  const normFg = normalizeHex(colors.fgColor, DEFAULT_CUSTOM_COLORS.fgColor);
  const normPrimary = normalizeHex(
    colors.primaryColor || colors.buttonColor || colors.logoColor, 
    DEFAULT_CUSTOM_COLORS.primaryColor
  );

  const bgRgb = hexToRgb(normBg);
  const fgRgb = hexToRgb(normFg);
  const primaryRgb = hexToRgb(normPrimary);

  const primaryHsl = rgbToHsl(primaryRgb.r, primaryRgb.g, primaryRgb.b);
  const fgHsl = rgbToHsl(fgRgb.r, fgRgb.g, fgRgb.b);

  const primaryHex = normPrimary;
  const primaryHoverHex = hslToHex(
    primaryHsl.h, 
    primaryHsl.s, 
    Math.max(20, Math.min(80, primaryHsl.l > 40 ? primaryHsl.l - 7 : primaryHsl.l + 7))
  );
  const primaryRgbStr = `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`;

  const bgMainHex = normBg;
  const bgMainRgbStr = `${bgRgb.r}, ${bgRgb.g}, ${bgRgb.b}`;

  const bgCardHex = normFg;
  const bgCardHoverHex = hslToHex(
    fgHsl.h, 
    fgHsl.s, 
    Math.max(10, Math.min(95, fgHsl.l > 50 ? fgHsl.l - 4 : fgHsl.l + 4))
  );
  const bgCardRgbStr = `${fgRgb.r}, ${fgRgb.g}, ${fgRgb.b}`;

  // Surface: slightly adjusted relative to card
  const bgSurfaceHex = hslToHex(
    fgHsl.h, 
    Math.round(fgHsl.s * 0.9), 
    Math.max(6, Math.min(94, fgHsl.l > 50 ? fgHsl.l + 3 : fgHsl.l - 3))
  );
  const bgSurfaceElevated = bgCardHoverHex;

  // Borders
  const borderCard = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.25)`;
  const borderColor = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.18)`;
  const borderStrong = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.45)`;

  // Button & Logo Glow / Tints
  const primaryLight = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.18)`;
  const primaryBorder = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.42)`;
  const primaryGlow = `rgba(${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}, 0.35)`;

  const textTitle = '#f8fafc';
  const textBody = '#e2e8f0';
  const textMuted = '#94a3b8';

  return {
    isDark: true,
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
    logoColor: primaryHex,
    logoHover: primaryHoverHex,
    logoRgb: primaryRgbStr,
    logoGlow: primaryGlow,
    textTitle,
    textBody,
    textMuted
  };
}
