/** Page titles and the map header. Drawn with this fill and no stroke. */
export const INK = "#3B2A20";
export const CREAM = "#FFF4DC";
/** b2.2 battle action fill. */
export const TERRA = "#A9432B";
/** b2.2 deep teal action fill. */
export const TEAL_DEEP = "#1F6F64";
/** b2.2 selected chip fill. */
export const CHIP_ON = "#266B65";
export const MUTED = "#46363A";
export const DIS_TEXT = "#3F2E25";
export const ERR_TEXT = "#834735";
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
