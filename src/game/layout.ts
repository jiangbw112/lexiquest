export const GAME_W = 1280;
export const GAME_H = 800;

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
  { id: "learn", scene: "learn", label: "学堂", key: "1", code: "Digit1", x: 390, y: 300, color: 0xc9843a },
  { id: "battle", scene: "stages", label: "对战", key: "2", code: "Digit2", x: 900, y: 320, color: 0x8c4a3a },
  { id: "collection", scene: "collection", label: "词卡册", key: "3", code: "Digit3", x: 430, y: 470, color: 0x3d6ea8 },
  { id: "review", scene: "review", label: "复习桌", key: "4", code: "Digit4", x: 820, y: 490, color: 0x6d5bd0 },
  { id: "skills", scene: "skills", label: "技能", key: "5", code: "Digit5", x: 320, y: 620, color: 0x1f7a4d },
  { id: "wardrobe", scene: "wardrobe", label: "衣柜", key: "6", code: "Digit6", x: 640, y: 640, color: 0xb08968 },
  { id: "duel", scene: "duel", label: "同机练习", key: "7", code: "Digit7", x: 980, y: 610, color: 0x2f6f9f },
  { id: "guide", scene: "guide", label: "给家长", key: "8", code: "Digit8", x: 1040, y: 400, color: 0x8a5a12 },
];
