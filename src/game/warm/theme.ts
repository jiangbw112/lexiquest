export const INK = "#3B2A20";
export const CREAM = "#FFF4DC";
export const MUTED = "#46363A";
export const DIS_TEXT = "#3F2E25";
export const ERR_TEXT = "#834735";

/** Text-carrying faces from style_warm v0.3 batch2 (b2.2). */
export const TERRA = "#A9432B";
export const TERRA_HOVER = "#AE4E36";
export const TERRA_PRESSED = "#A04433";
export const TEAL_DEEP = "#1F6F64";
export const TEAL_DEEP_HOVER = "#2C776B";
export const CHIP_ON = "#266B65";

/** Art colours for bars, nodes, icons, and option-slot marks. Not text backgrounds. */
export const CORAL = "#E76F51";
export const TEAL = "#2A9D8F";

/** Median of the stretchable center of panel_wood. Title text sits here with no stroke. */
export const TITLE_PLANK = "#EAD8BD";

/** Readable plum reused for the grey badge, locked skill names, and the wardrobe door. */
export const PLUM = "#5B4B6B";
/** Energy count on the mint battle panel. */
export const ENERGY_INK = "#1F4E3D";
export const MINT_PANEL = "#C9E6D4";
/** Flat disabled face. Text on it is DIS_TEXT. */
export const DIS_FACE = "#CFC4B2";
/** Old confirm button at rest. Hover leaves this for TEAL_DEEP instead of brightening. */
export const CONFIRM_REST = "#1F7A4D";
export const FONT_BODY = '"Noto Sans SC", "WenQuanYi Micro Hei", "PingFang SC", sans-serif';
export const FONT_TITLE = '"ZCOOL KuaiLe", "Noto Sans SC", sans-serif';
export const FONT_LATIN = '"Nunito", "Noto Sans SC", sans-serif';

export function motionOff(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

export function whenGlyphsReady(sample: string, done: () => void): void {
  const fonts = document.fonts;
  if (!sample || !fonts) {
    done();
    return;
  }
  void Promise.all([
    fonts.load(`400 20px "Noto Sans SC"`, sample),
    fonts.load(`700 46px "Noto Sans SC"`, sample),
  ]).then(() => done());
}
