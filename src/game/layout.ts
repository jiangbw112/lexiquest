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
  englishSize: 88,
  /** meaningRow y. The English word is drawn 70px above it. */
  missedRowY: 348,
  restingRowY: 300,
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

/** Logical inset of the option index. The yellow badge center is texture x=44, shown at half scale. */
export const OPTION_BADGE_CENTER = 22;

export function meaningScale(width: number, max = STUDY_CARD.meaningMaxWidth): number {
  if (width <= max) return 1;
  return max / width;
}
