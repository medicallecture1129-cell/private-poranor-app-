/**
 * Automated Global Color Palette Calculation Engine
 * 
 * Derives a cohesive, high-contrast dark theme hierarchy from a single base color:
 * 1. Pitch-Dark Solid Main Background (Rich dark tint maintaining the color's vibe)
 * 2. Foreground Cards & Message Containers ("No Live Exams Found", Dialogs, Modals, Popups)
 * 3. Elevated Surfaces (Header / Navbar, Bottom Nav, Filters)
 * 4. Refined Vibrant Buttons, App Logo capsule, Profile badge, and Active tabs
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
    return { r: 37, g: 99, b: 235 }; // Default Royal Blue fallback
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

export interface ComputedTheme {
  baseHex: string;
  isDark: boolean;
  hue: number;
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
  // 3. Primary Buttons, Badges, Header Capsules
  primary: string;
  primaryHover: string;
  primaryRgb: string;
  primaryText: string;
  primaryLight: string;
  primaryBorder: string;
  primaryGlow: string;
  // 4. Typography
  textTitle: string;
  textBody: string;
  textMuted: string;
}

export function computeThemeVariables(baseHex: string, isDark: boolean = true): ComputedTheme {
  const rgb = hexToRgb(baseHex);
  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const h = hsl.h;
  const s = hsl.s;

  if (isDark) {
    // DARK THEME (Matches the 11 reference screenshots)

    // 1. Primary Button / Accent: Refined vibrant tone
    let primaryL = 50;
    if (h >= 40 && h <= 65) {
      // Yellow/Amber hues need slight tuning for optimal contrast
      primaryL = 46;
    }
    const primarySat = Math.max(76, s);
    const primaryHex = hslToHex(h, primarySat, primaryL);
    const primaryHoverHex = hslToHex(h, primarySat, Math.max(30, primaryL - 6));
    const primaryRgbObj = hexToRgb(primaryHex);
    const primaryRgb = `${primaryRgbObj.r}, ${primaryRgbObj.g}, ${primaryRgbObj.b}`;

    // 2. Main Background: Pitch-Dark Solid (Rich dark tint maintaining original color vibe)
    // S: ~34-45%, L: ~5.2%
    const bgMainSat = Math.min(48, Math.max(28, Math.round(s * 0.55)));
    const bgMainL = 5.4;
    const bgMainHex = hslToHex(h, bgMainSat, Math.round(bgMainL));
    const bgMainRgbObj = hexToRgb(bgMainHex);
    const bgMainRgb = `${bgMainRgbObj.r}, ${bgMainRgbObj.g}, ${bgMainRgbObj.b}`;

    // 3. Foreground Card & Message Containers ("No Live Exams Found", dialogs, cards)
    // S: ~38-52%, L: ~14.8% -> clearly differentiated from pitch-dark background
    const bgCardSat = Math.min(54, Math.max(34, Math.round(s * 0.65)));
    const bgCardL = 14.8;
    const bgCardHex = hslToHex(h, bgCardSat, Math.round(bgCardL));
    const bgCardHoverHex = hslToHex(h, bgCardSat, Math.round(bgCardL + 3.5));
    const bgCardRgbObj = hexToRgb(bgCardHex);
    const bgCardRgb = `${bgCardRgbObj.r}, ${bgCardRgbObj.g}, ${bgCardRgbObj.b}`;

    // 4. Elevated Surface (Header Navbar, Bottom Nav, Filter bars)
    // In between background and card: L: ~9.2%
    const bgSurfSat = Math.min(46, Math.max(26, Math.round(s * 0.55)));
    const bgSurfL = 9.2;
    const bgSurfaceHex = hslToHex(h, bgSurfSat, Math.round(bgSurfL));
    const bgSurfaceElevated = hslToHex(h, bgSurfSat, Math.round(bgSurfL + 3));

    // 5. Borders: Harmonious color tint
    const borderCard = `rgba(${primaryRgb}, 0.26)`;
    const borderColor = `rgba(${primaryRgb}, 0.18)`;
    const borderStrong = `rgba(${primaryRgb}, 0.45)`;

    // 6. Pill, Badge, and Capsule styling
    const primaryLight = `rgba(${primaryRgb}, 0.18)`;
    const primaryBorder = `rgba(${primaryRgb}, 0.42)`;
    const primaryGlow = `rgba(${primaryRgb}, 0.35)`;

    // 7. Text
    const textTitle = '#f8fafc';
    const textBody = '#e2e8f0';
    const textMuted = hslToHex(h, 20, 72);

    return {
      baseHex,
      isDark: true,
      hue: h,
      bgMain: bgMainHex,
      bgMainRgb,
      bgCard: bgCardHex,
      bgCardHover: bgCardHoverHex,
      bgCardRgb,
      bgSurface: bgSurfaceHex,
      bgSurfaceElevated,
      borderColor,
      borderCard,
      borderStrong,
      primary: primaryHex,
      primaryHover: primaryHoverHex,
      primaryRgb,
      primaryText: '#ffffff',
      primaryLight,
      primaryBorder,
      primaryGlow,
      textTitle,
      textBody,
      textMuted,
    };
  } else {
    // LIGHT THEME FALLBACK
    const primaryL = Math.min(46, Math.max(38, hsl.l));
    const primarySat = Math.max(75, s);
    const primaryHex = hslToHex(h, primarySat, primaryL);
    const primaryHoverHex = hslToHex(h, primarySat, Math.max(30, primaryL - 6));
    const primaryRgbObj = hexToRgb(primaryHex);
    const primaryRgb = `${primaryRgbObj.r}, ${primaryRgbObj.g}, ${primaryRgbObj.b}`;

    const bgMainHex = hslToHex(h, 25, 97);
    const bgMainRgbObj = hexToRgb(bgMainHex);
    const bgMainRgb = `${bgMainRgbObj.r}, ${bgMainRgbObj.g}, ${bgMainRgbObj.b}`;

    const bgCardHex = '#ffffff';
    const bgCardHoverHex = hslToHex(h, 20, 99);
    const bgCardRgb = '255, 255, 255';

    const bgSurfaceHex = hslToHex(h, 25, 99);
    const bgSurfaceElevated = '#ffffff';

    const borderColor = `rgba(${primaryRgb}, 0.15)`;
    const borderCard = `rgba(${primaryRgb}, 0.18)`;
    const borderStrong = `rgba(${primaryRgb}, 0.35)`;

    const primaryLight = `rgba(${primaryRgb}, 0.10)`;
    const primaryBorder = `rgba(${primaryRgb}, 0.28)`;
    const primaryGlow = `rgba(${primaryRgb}, 0.22)`;

    return {
      baseHex,
      isDark: false,
      hue: h,
      bgMain: bgMainHex,
      bgMainRgb,
      bgCard: bgCardHex,
      bgCardHover: bgCardHoverHex,
      bgCardRgb,
      bgSurface: bgSurfaceHex,
      bgSurfaceElevated,
      borderColor,
      borderCard,
      borderStrong,
      primary: primaryHex,
      primaryHover: primaryHoverHex,
      primaryRgb,
      primaryText: '#ffffff',
      primaryLight,
      primaryBorder,
      primaryGlow,
      textTitle: '#0f172a',
      textBody: '#334155',
      textMuted: '#64748b',
    };
  }
}

/**
 * 11 High-Fidelity Presets exactly matching the reference phone screenshot
 */
export interface PresetPalette {
  id: string;
  name: string;
  nameBn: string;
  hex: string;
}

export const PRESET_PALETTES: PresetPalette[] = [
  { id: 'royal_blue', name: 'Royal Midnight Blue', nameBn: 'রয়েল মিডনাইট ব্লু', hex: '#2563EB' },
  { id: 'crimson_maroon', name: 'Crimson Maroon', nameBn: 'মারুন / মার্জিত লাল', hex: '#DC2626' },
  { id: 'forest_emerald', name: 'Forest Emerald', nameBn: 'ফরেস্ট এমারেল্ড সবুজ', hex: '#059669' },
  { id: 'amethyst_purple', name: 'Amethyst Purple', nameBn: 'ডিপ অ্যামেথিস্ট বেগুনি', hex: '#7C3AED' },
  { id: 'golden_ochre', name: 'Golden Amber / Ochre', nameBn: 'গোল্ডেন আম্বার / ওয়ার্ম অকার', hex: '#D97706' },
  { id: 'slate_cyan', name: 'Slate Steel Cyan', nameBn: 'স্লেট স্টিল সায়ান', hex: '#0284C7' },
  { id: 'peacock_teal', name: 'Deep Peacock Teal', nameBn: 'ডিপ পিকক টিল', hex: '#0D9488' },
  { id: 'olive_moss', name: 'Olive Moss Green', nameBn: 'অলিভ মস গ্রিন', hex: '#65A30D' },
  { id: 'sepia_bronze', name: 'Sepia Rust / Bronze', nameBn: 'সেপিয়া রাস্ট / ব্রোঞ্জ', hex: '#B45309' },
  { id: 'ocean_navy', name: 'Deep Ocean Navy', nameBn: 'ডিপ ওশান নেভি', hex: '#1D4ED8' },
  { id: 'caramel_mustard', name: 'Caramel Mustard', nameBn: 'ক্যারামেল মাস্টার্ড / গোল্ড', hex: '#CA8A04' },
];
