export type ThemeTokens = {
  primary: string;
  primaryContrast: string;
  primaryHover: string;
  primaryActive: string;
  ring: string;
  borderAccent: string;
  bgAccent: string;
  bgPage: string;
  bgPanel: string;
  border: string;
  text: string;
  muted: string;
};

type Hsl = { h: number; s: number; l: number };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const sanitized = hex.replace("#", "").trim();
  const normalized = sanitized.length === 3
    ? sanitized.split("").map((char) => `${char}${char}`).join("")
    : sanitized;

  if (!/^[\da-fA-F]{6}$/.test(normalized)) {
    return { r: 47, g: 133, b: 90 };
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }): Hsl {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  const l = (max + min) / 2;
  const s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));

  return { h, s: s * 100, l: l * 100 };
}

function hslToRgb({ h, s, l }: Hsl): { r: number; g: number; b: number } {
  const sat = clamp(s, 0, 100) / 100;
  const light = clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;

  let rr = 0;
  let gg = 0;
  let bb = 0;

  if (h >= 0 && h < 60) [rr, gg, bb] = [c, x, 0];
  else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x];
  else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];

  return {
    r: Math.round((rr + m) * 255),
    g: Math.round((gg + m) * 255),
    b: Math.round((bb + m) * 255),
  };
}

function adjustLightness(hex: string, delta: number): string {
  const hsl = rgbToHsl(hexToRgb(hex));
  const adjusted: Hsl = { ...hsl, l: clamp(hsl.l + delta, 0, 100) };
  const { r, g, b } = hslToRgb(adjusted);
  return rgbToHex(r, g, b);
}

function hslToHex(h: number, s: number, l: number): string {
  const { r, g, b } = hslToRgb({ h, s, l });
  return rgbToHex(r, g, b);
}

export function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1)})`;
}

function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const srgb = [r, g, b].map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

export function getReadableTextColor(backgroundHex: string): string {
  const luminance = relativeLuminance(backgroundHex);
  return luminance > 0.52 ? "#111111" : "#ffffff";
}

export function deriveThemeTokens(baseHex: string): ThemeTokens {
  const hsl = rgbToHsl(hexToRgb(baseHex));
  const h = hsl.h;
  const s = hsl.s;

  return {
    primary: baseHex,
    primaryContrast: getReadableTextColor(baseHex),
    primaryHover: adjustLightness(baseHex, -8),
    primaryActive: adjustLightness(baseHex, -14),
    ring: withAlpha(baseHex, 0.35),
    borderAccent: withAlpha(baseHex, 0.3),
    bgAccent: withAlpha(baseHex, 0.12),
    bgPage: hslToHex(h, clamp(s, 0, 65), 96),
    bgPanel: hslToHex(h, clamp(s * 0.35, 0, 20), 97),
    border: hslToHex(h, clamp(s * 0.30, 0, 20), 83),
    text: hslToHex(h, clamp(s * 0.50, 0, 30), 15),
    muted: hslToHex(h, clamp(s * 0.25, 0, 20), 35),
  };
}
