/** WCAG 2.x contrast of a declared text color against a declared fill. Not a pixel sample. */

function channel(value: number): number {
  const scaled = value / 255;
  return scaled <= 0.04045 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = Number.parseInt(h.slice(0, 2), 16);
  const g = Number.parseInt(h.slice(2, 4), 16);
  const b = Number.parseInt(h.slice(4, 6), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: string, background: string): number {
  const hi = Math.max(luminance(foreground), luminance(background));
  const lo = Math.min(luminance(foreground), luminance(background));
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Text colors are the theme constants. Fills for coral, teal, and the disabled
 * button are the painted colors measured on the warm art, which are not theme tokens.
 */
export const WARM_TEXT_PAIRS = [
  { name: "ink on cream", fg: "#3B2A20", bg: "#FFF4DC" },
  { name: "muted on cream", fg: "#46363A", bg: "#FFF4DC" },
  { name: "error on cream", fg: "#834735", bg: "#FFF4DC" },
  { name: "disabled label on disabled fill", fg: "#3F2E25", bg: "#CFC4B2" },
  { name: "cream on coral button", fg: "#FFF4DC", bg: "#E76F51" },
  { name: "cream on selected chip", fg: "#FFF4DC", bg: "#30938B" },
] as const;
