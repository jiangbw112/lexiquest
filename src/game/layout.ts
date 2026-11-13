import { RESULTS_WORD_CHIP } from "../domain/battle-results";

export { RESULTS_WORD_CHIP };

export const GAME_W = 1280;
export const GAME_H = 800;

/** Parchment nine-slice top inset is 40 source pixels, drawn at 0.5, so the frame is 20 logical pixels. */
export const PARCHMENT_FRAME = 20;

/** Top of a top-left title that sits fully inside the parchment frame. */
export function parchmentTitleY(centerY: number, height: number, pad = 4): number {
  return centerY - height / 2 + PARCHMENT_FRAME + pad;
}

/** Central 4:3 area inside the 16:10 design buffer. Interactive UI stays here. */
export const SAFE = { x: 107, y: 16, width: 1066, height: 768 };

export const TITLE_START = { x: 640, y: 560 };
export const CREATE_FOCUS = { x: 820, y: 390 };

export interface Place {
  id: string;
  scene: string;
  label: string;
  key: string;
  code: string;
  x: number;
  y: number;
  color: number;
}

export const PLACES: Place[] = [
  { id: "learn", scene: "learn", label: "学堂", key: "1", code: "Digit1", x: 390, y: 300, color: 0xa9432b },
  { id: "battle", scene: "stages", label: "对战", key: "2", code: "Digit2", x: 900, y: 320, color: 0x8c4a3a },
  { id: "collection", scene: "collection", label: "词卡册", key: "3", code: "Digit3", x: 430, y: 470, color: 0x3d6ea8 },
  { id: "review", scene: "review", label: "复习桌", key: "4", code: "Digit4", x: 820, y: 490, color: 0x6d5bd0 },
  { id: "skills", scene: "skills", label: "技能", key: "5", code: "Digit5", x: 320, y: 620, color: 0x1f7a4d },
  { id: "wardrobe", scene: "wardrobe", label: "衣柜", key: "6", code: "Digit6", x: 640, y: 640, color: 0x5b4b6b },
  { id: "duel", scene: "duel", label: "同机练习", key: "7", code: "Digit7", x: 980, y: 610, color: 0x2f6f9f },
  { id: "guide", scene: "guide", label: "给家长", key: "8", code: "Digit8", x: 1040, y: 400, color: 0x8a5a12 },
];

/** Shared screen numbers so the parent list and the study card can be tested without Phaser. */

export const STRUGGLE_LIST = {
  /** Below the page buttons centered at y=520 (they end at 548). */
  firstY: 556,
  pitch: 26,
  fontSize: 15,
  pageSize: 6,
  collapsed: 4,
  /** Bottom actions. Height 56, so the top edge is center − 28. */
  buttonCenter: 756,
  buttonHeight: 56,
  /** Clearance between the last row box and that top edge. */
  gap: 16,
  screenBottom: 800,
} as const;

/** Top edge of 去复习 / 修改年级 / 返回. */
export function struggleButtonTop(): number {
  return STRUGGLE_LIST.buttonCenter - STRUGGLE_LIST.buttonHeight / 2;
}

export interface StruggleWindow {
  total: number;
  expanded: boolean;
  page: number;
  pages: number;
  start: number;
  count: number;
  /** Bottom of the last visible row. Equals firstY when nothing is drawn. */
  bottom: number;
}

export function struggleWindow(total: number, expanded: boolean, page: number): StruggleWindow {
  const pages = expanded ? Math.max(1, Math.ceil(total / STRUGGLE_LIST.pageSize)) : 1;
  const safePage = Math.min(Math.max(0, page), pages - 1);
  const start = expanded ? safePage * STRUGGLE_LIST.pageSize : 0;
  const room = expanded ? STRUGGLE_LIST.pageSize : STRUGGLE_LIST.collapsed;
  const count = Math.max(0, Math.min(room, total - start));
  const bottom = count === 0 ? STRUGGLE_LIST.firstY : STRUGGLE_LIST.firstY + count * STRUGGLE_LIST.pitch;
  return { total, expanded, page: safePage, pages, start, count, bottom };
}

export const STUDY_CARD = {
  noticeY: 178,
  noticeFont: 18,
  /** 「今天先复习更划算」. It sits under the miss notice and above the English word. */
  reviewHintY: 204,
  reviewHintFont: 18,
  englishSize: 88,
  /** meaningRow y. The English word is drawn 70px above it. */
  missedRowY: 348,
  /** Same row as a missed card, so the hint above the word stays clear at full 88px. */
  restingRowY: 348,
  meaningMaxWidth: 640,
} as const;

export function studyRowY(missed: boolean): number {
  return missed ? STUDY_CARD.missedRowY : STUDY_CARD.restingRowY;
}

export function studyEnglishCenterY(missed: boolean): number {
  return studyRowY(missed) - 70;
}

/** Space between the miss notice and the top of the English word. */
export function studyNoticeGap(): number {
  const englishTop = studyEnglishCenterY(true) - STUDY_CARD.englishSize / 2;
  const noticeBottom = STUDY_CARD.noticeY + STUDY_CARD.noticeFont / 2;
  return englishTop - noticeBottom;
}

/**
 * Gap between the review hint and the English word.
 * Scale 1 is the tallest word. A smaller scale only pulls the top down, away from the hint.
 */
export function studyReviewHintGap(missed: boolean, englishScale = 1): number {
  const hintBottom = STUDY_CARD.reviewHintY + STUDY_CARD.reviewHintFont / 2;
  const englishTop = studyEnglishCenterY(missed) - (STUDY_CARD.englishSize * englishScale) / 2;
  return englishTop - hintBottom;
}

/** Gap between 「再看一次」 and the review hint when both are on the card. */
export function studyHintStackGap(): number {
  const missBottom = STUDY_CARD.noticeY + STUDY_CARD.noticeFont / 2;
  const hintTop = STUDY_CARD.reviewHintY - STUDY_CARD.reviewHintFont / 2;
  return hintTop - missBottom;
}

/** Logical inset of the option index. The yellow badge center is texture x=44, shown at half scale. */
export const OPTION_BADGE_CENTER = 22;

/** Label inset inside an option button, clear of the index badge and the right rim. */
export const OPTION_TEXT_LEFT = 78;
export const OPTION_TEXT_RIGHT = 16;
export const OPTION_TEXT_PAD_Y = 10;

export function optionTextBounds(width: number, height: number): { maxWidth: number; maxHeight: number } {
  return {
    maxWidth: Math.max(48, width - OPTION_TEXT_LEFT - OPTION_TEXT_RIGHT),
    maxHeight: Math.max(24, height - OPTION_TEXT_PAD_Y * 2),
  };
}

/**
 * 「词卡入手」 sits above the English word. meaningRow draws that word at rowY - 70.
 * The boxes below use the font size as the line box, which is the tight case.
 */
export const CARD_GOT = {
  titleY: 224,
  titleFont: 36,
  rowY: 392,
  englishSize: 64,
  noteY: 488,
  buttonY: 558,
} as const;

export function cardGotTitleGap(): number {
  const titleBottom = CARD_GOT.titleY + CARD_GOT.titleFont / 2;
  const englishTop = CARD_GOT.rowY - 70 - CARD_GOT.englishSize / 2;
  return englishTop - titleBottom;
}

export function cardGotEnglishMeaningGap(): number {
  const englishBottom = CARD_GOT.rowY - 70 + CARD_GOT.englishSize / 2;
  const meaningTop = CARD_GOT.rowY + 20 - 46 / 2;
  return meaningTop - englishBottom;
}

/** Collection card. The badge sits on the top-right, so the English line stops before it. */
export const COLLECTION_CARD = {
  width: 132,
  height: 96,
  padX: 10,
  /** Past the panel's top-left leaf, and still clear of the badge on the right. */
  englishInset: 28,
  englishWidth: 70,
  englishHeight: 24,
  meaningWidth: 112,
  meaningHeight: 30,
} as const;

export function meaningScale(width: number, max = STUDY_CARD.meaningMaxWidth): number {
  if (width <= max) return 1;
  return max / width;
}

export interface TextBox {
  fontSize: number;
  minFontSize: number;
  maxWidth: number;
  maxHeight: number;
  maxLines: number;
}

export interface FittedText {
  fontSize: number;
  lines: string[];
  text: string;
}

/** Clear space between wrapped lines. Never collapse this to a negative value. */
export const FITTED_LINE_GAP = 6;

/** Line boxes plus the gap between them. Scenes keep that gap; they never pull lines together. */
export function fittedBlockHeight(fontSize: number, lines: number): number {
  if (lines <= 1) return Math.max(0, lines) * fontSize;
  return lines * fontSize + (lines - 1) * FITTED_LINE_GAP;
}

export interface LineBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One rectangle per wrapped line, with {@link FITTED_LINE_GAP} between them. */
export function fittedLineBoxes(
  x: number,
  y: number,
  fitted: FittedText,
  widthOf: (line: string) => number,
): LineBox[] {
  return fitted.lines.map((line, index) => ({
    x,
    y: y + index * (fitted.fontSize + FITTED_LINE_GAP),
    w: widthOf(line),
    h: fitted.fontSize,
  }));
}

/**
 * Fit a label into a box: shrink from fontSize down to minFontSize while it stays one line.
 * If it still does not fit, wrap to at most maxLines, preferring the larger size.
 */
export function fitTextBox(
  text: string,
  box: TextBox,
  measure: (sample: string, fontSize: number) => number,
): FittedText {
  for (let size = box.fontSize; size >= box.minFontSize; size -= 1) {
    if (measure(text, size) <= box.maxWidth && fittedBlockHeight(size, 1) <= box.maxHeight) {
      return { fontSize: size, lines: [text], text };
    }
  }
  for (let size = box.fontSize; size >= box.minFontSize; size -= 1) {
    if (fittedBlockHeight(size, box.maxLines) > box.maxHeight) continue;
    const wrapped = wrapCjkText(text, box.maxWidth, (sample) => measure(sample, size));
    const lines = wrapped.split("\n");
    if (lines.length <= box.maxLines && lines.every((line) => measure(line, size) <= box.maxWidth)) {
      return { fontSize: size, lines, text: lines.join("\n") };
    }
  }
  const size = box.minFontSize;
  const wrapped = wrapCjkText(text, box.maxWidth, (sample) => measure(sample, size));
  const lines = wrapped.split("\n").slice(0, box.maxLines);
  return { fontSize: size, lines, text: lines.join("\n") };
}

/** Review desk. The meaning column stops before the 拼写 button, and the status sits inside the row. */
export const REVIEW_ROW = {
  textX: 170,
  gap: 8,
  englishMaxWidth: 168,
  fontSize: 22,
  minFontSize: 13,
  maxLines: 2,
  /** Due date and tone. The fitted block must end above this. */
  statusOffset: 50,
  /** Taller of the two status labels (未熟练 is 18, the due date is 16). */
  statusFont: 18,
  /** Space between the status glyphs and the row's inner bottom. */
  statusPad: 8,
  blockHeight: 44,
  /**
   * list_row nine-slice inset is 40 source pixels, drawn at 0.5,
   * so the painted border is 20 logical pixels.
   */
  sliceBorder: 20,
  /** Inner top, relative to the word text top. */
  innerTop: -8,
  /** Gap between one row slice and the next. */
  rowGap: 4,
  spellCenter: 560,
  spellWidth: 96,
  spellOffset: 36,
  spellHeight: 48,
  revealCenter: 430,
  revealWidth: 140,
  revealOffset: 18,
  revealHeight: 40,
  rateCenter: 706,
  rateWidth: 112,
  rateOffset: 40,
  rateHeight: 48,
} as const;

/** Row slice and the padded interior the status text has to stay inside. */
export function reviewRowSlice(textY = 0): {
  top: number;
  bottom: number;
  height: number;
  centerY: number;
  innerTop: number;
  innerBottom: number;
  pitch: number;
} {
  const innerBottom = textY + REVIEW_ROW.statusOffset + REVIEW_ROW.statusFont + REVIEW_ROW.statusPad;
  const top = textY + REVIEW_ROW.innerTop - REVIEW_ROW.sliceBorder;
  const bottom = innerBottom + REVIEW_ROW.sliceBorder;
  const height = bottom - top;
  return {
    top,
    bottom,
    height,
    centerY: top + height / 2,
    innerTop: textY + REVIEW_ROW.innerTop,
    innerBottom,
    pitch: height + REVIEW_ROW.rowGap,
  };
}

/** Right edge of the english and meaning text. Clears the 拼写 button by `gap`. */
export function reviewTextRight(): number {
  return REVIEW_ROW.spellCenter - REVIEW_ROW.spellWidth / 2 - REVIEW_ROW.gap;
}

export function reviewEnglishBox(): TextBox {
  return {
    fontSize: REVIEW_ROW.fontSize,
    minFontSize: REVIEW_ROW.minFontSize,
    maxWidth: REVIEW_ROW.englishMaxWidth,
    maxHeight: REVIEW_ROW.blockHeight,
    maxLines: REVIEW_ROW.maxLines,
  };
}

/** Meaning starts after the fitted english word and ends at {@link reviewTextRight}. */
export function reviewMeaningBox(englishWidth: number): TextBox & { x: number } {
  const width = Math.min(englishWidth, REVIEW_ROW.englishMaxWidth);
  const x = REVIEW_ROW.textX + width + REVIEW_ROW.gap;
  return {
    x,
    fontSize: REVIEW_ROW.fontSize,
    minFontSize: REVIEW_ROW.minFontSize,
    maxWidth: reviewTextRight() - x,
    maxHeight: REVIEW_ROW.blockHeight,
    maxLines: REVIEW_ROW.maxLines,
  };
}

/** Gloss box inside the victory chip. Two lines have to fit here with padding. */
export function resultsGlossBox(): TextBox {
  return {
    fontSize: RESULTS_WORD_CHIP.fontSize,
    minFontSize: RESULTS_WORD_CHIP.minFontSize,
    maxWidth: RESULTS_WORD_CHIP.width - RESULTS_WORD_CHIP.glossX - RESULTS_WORD_CHIP.glossRight,
    maxHeight: RESULTS_WORD_CHIP.height - RESULTS_WORD_CHIP.glossY - RESULTS_WORD_CHIP.glossBottom,
    maxLines: RESULTS_WORD_CHIP.maxLines,
  };
}

export function applyFittedText(
  target: {
    setFontSize(size: string): unknown;
    setText(value: string): unknown;
    setLineSpacing(padding: number): unknown;
    width: number;
    height: number;
  },
  content: string,
  box: TextBox,
): FittedText {
  const measure = (sample: string, fontSize: number) => {
    target.setFontSize(`${fontSize}px`);
    target.setLineSpacing(FITTED_LINE_GAP);
    target.setText(sample);
    return target.width;
  };
  let fitted = fitTextBox(content, box, measure);
  const paint = (next: FittedText) => {
    target.setFontSize(`${next.fontSize}px`);
    target.setLineSpacing(FITTED_LINE_GAP);
    target.setText(next.text);
  };
  paint(fitted);
  while (target.height > box.maxHeight && fitted.fontSize > box.minFontSize) {
    const size = fitted.fontSize - 1;
    fitted = fitTextBox(content, { ...box, fontSize: size }, measure);
    paint(fitted);
    if (fitted.fontSize > size) break;
  }
  return fitted;
}

/** Phaser's basic wrap does not break Chinese. Advanced wrap honors `width`. */
const LINE_START_PUNCT = new Set("，。！？；：、」』）】》".split(""));
const UNBROKEN_WORDS = ["这台电脑", "浏览器"];
const HAN = /\p{Script=Han}/u;

function isHan(char: string): boolean {
  return HAN.test(char);
}

/**
 * Split at Latin words and the phrases that must stay whole.
 * Every other character, including each Han character, is its own token.
 */
function breakTokens(text: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < text.length) {
    const kept = UNBROKEN_WORDS.find((word) => text.startsWith(word, index));
    if (kept) {
      tokens.push(kept);
      index += kept.length;
      continue;
    }
    const char = text[index] ?? "";
    if (/[A-Za-z0-9]/.test(char)) {
      let word = char;
      index += 1;
      while (index < text.length && /[A-Za-z0-9]/.test(text[index] ?? "")) {
        word += text[index];
        index += 1;
      }
      tokens.push(word);
      continue;
    }
    tokens.push(char);
    index += 1;
  }
  return tokens;
}

/**
 * Same as {@link breakTokens}, except a run of Han characters is one word.
 * A run stops before 这台电脑 or 浏览器 so those phrases stay intact.
 * Wrap breaks at punctuation and at these word boundaries. A word wider than
 * the line is the only case that falls back to characters.
 */
export function cjkTokens(text: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < text.length) {
    const kept = UNBROKEN_WORDS.find((word) => text.startsWith(word, index));
    if (kept) {
      tokens.push(kept);
      index += kept.length;
      continue;
    }
    const char = text[index] ?? "";
    if (/[A-Za-z0-9]/.test(char)) {
      let word = char;
      index += 1;
      while (index < text.length && /[A-Za-z0-9]/.test(text[index] ?? "")) {
        word += text[index];
        index += 1;
      }
      tokens.push(word);
      continue;
    }
    if (isHan(char)) {
      let word = char;
      index += 1;
      while (index < text.length && isHan(text[index] ?? "") && !UNBROKEN_WORDS.some((kept) => text.startsWith(kept, index))) {
        word += text[index];
        index += 1;
      }
      tokens.push(word);
      continue;
    }
    tokens.push(char);
    index += 1;
  }
  return tokens;
}

/**
 * Wrap Chinese so a line never starts with a fullwidth punctuation mark,
 * and a Han word is not cut unless that word alone is wider than the line.
 * Punctuation stays with the previous word. If that would spill past the width,
 * the whole previous word moves down with the punctuation.
 */
export function wrapCjkText(text: string, maxWidth: number, measure: (sample: string) => number): string {
  const lines: string[] = [];
  let line = "";
  const pending = cjkTokens(text);
  while (pending.length > 0) {
    const token = pending.shift() ?? "";
    if (token === "\n") {
      lines.push(line);
      line = "";
      continue;
    }
    if (measure(token) > maxWidth && token.length > 1 && !UNBROKEN_WORDS.includes(token)) {
      const pieces = breakTokens(token);
      if (pieces.length > 1) {
        pending.unshift(...pieces);
        continue;
      }
    }
    const next = line + token;
    if (!(line && measure(next) > maxWidth)) {
      line = next;
      continue;
    }
    if (!LINE_START_PUNCT.has(token)) {
      lines.push(line);
      line = token;
      continue;
    }
    const parts = cjkTokens(line);
    const last = parts.length > 1 ? parts[parts.length - 1] ?? "" : "";
    const rest = last ? parts.slice(0, -1).join("") : "";
    const moved = last + token;
    if (rest && last && !LINE_START_PUNCT.has(last) && measure(rest) <= maxWidth && measure(moved) <= maxWidth) {
      lines.push(rest);
      line = moved;
    } else {
      line = next;
    }
  }
  if (line || lines.length === 0) lines.push(line);
  return lines.join("\n");
}

export function cjkWrap(width: number): {
  width: number;
  useAdvancedWrap: true;
  callback: (
    text: string,
    gameObject?: { context?: { measureText(sample: string): { width: number } }; style?: { fontSize?: string | number } },
  ) => string;
} {
  return {
    width,
    useAdvancedWrap: true,
    callback(text, gameObject) {
      const fontSize = Number.parseFloat(String(gameObject?.style?.fontSize ?? "18")) || 18;
      const measure = (sample: string) => {
        if (gameObject?.context) return gameObject.context.measureText(sample).width;
        let pixels = 0;
        for (const char of sample) pixels += char.charCodeAt(0) <= 0x7e ? fontSize * 0.55 : fontSize;
        return pixels;
      };
      return wrapCjkText(text, width, measure);
    },
  };
}

/**
 * Wardrobe preview only. The chip is 36 logical pixels tall, so a center of 200
 * ends at 218, above the head and the wreath (the wreath sits near y=330).
 */
export const WARDROBE_TITLE_Y = 200;

/** Village reward dialog. The slice is drawn at this size, centered on x/y. */
export const REWARD_DIALOG = { x: 640, y: 230, width: 860, height: 220 } as const;

/** Left of the default toast so the bar stays clear of the boss and both health bars. */
export const ATTACK_HINT_TOAST = { x: 560, y: 420 } as const;

/**
 * Opaque header behind the dialog art. The wood grain has transparent stripes,
 * so the title is painted on this fill (#775036), not on the cream body.
 */
export const DIALOG_HEADER = 0x775036;

export interface RewardDialogChrome {
  top: number;
  titleY: number;
  fillX: number;
  fillY: number;
  fillWidth: number;
  fillHeight: number;
  fillTop: number;
  fillBottom: number;
  /** Bottom of the wood band, before the cream body. */
  headerBottom: number;
}

export function rewardDialogChrome(): RewardDialogChrome {
  const top = REWARD_DIALOG.y - REWARD_DIALOG.height / 2;
  const fillHeight = 40;
  const fillTop = top + 4;
  return {
    top,
    titleY: top + 26,
    fillX: REWARD_DIALOG.x,
    fillY: fillTop + fillHeight / 2,
    fillWidth: REWARD_DIALOG.width - 16,
    fillHeight,
    fillTop,
    fillBottom: fillTop + fillHeight,
    headerBottom: top + 48,
  };
}
