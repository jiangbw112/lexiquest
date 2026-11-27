/**
 * 原来：横屏把按钮收成一排米色方块，村子建筑和羊皮纸都不在画面上。
 * 现在：按已审的 v0.2 844×390 逻辑像素排标题、村子、家长密码、衣柜、学堂、年级、建角色、技能、关卡、战斗、结算和考试。
 * 为什么：这是 Bowen 2026-11-26 审过的横屏稿。坐标是建议，安全区不是实机测量。九宫格仍用仓库里的 @2x 切线，不改契约。
 */

import type { GameNode } from "./node";
import type { PhoneBar, PhoneCaption, PhoneChrome, PhoneContext, PhoneHero, PhoneImage, PhoneLayout, PhoneMark, PhonePortrait, PhoneUnit } from "./phone";

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function scaler(view: { w: number; h: number }) {
  const sx = view.w / 844;
  const sy = view.h / 390;
  return {
    sx,
    sy,
    box(x: number, y: number, w: number, h: number): Box {
      return { x: x * sx, y: y * sy, w: Math.max(1, w * sx), h: Math.max(1, h * sy) };
    },
  };
}

function place(unit: PhoneUnit, box: Box, font: number, center = false): void {
  unit.x = box.x;
  unit.y = box.y;
  unit.w = box.w;
  unit.h = box.h;
  unit.fontPx = font;
  unit.onPaper = true;
  unit.clip = undefined;
  if (center && unit.node.type !== "container") unit.label = "center";
  if (center) unit.suppressFace = true;
  if (unit.text.trim()) unit.lines = [unit.text];
  const list = (unit.node as GameNode & { list?: GameNode[] }).list;
  const text = list?.find((child) => child.type === "text") as (GameNode & { style?: { fontSize?: string } }) | undefined;
  if (text?.style && font > 0) text.style.fontSize = `${font}px`;
}

function write(ctx: PhoneContext, unit: PhoneUnit, x: number, y: number, maxW: number, font: number): number {
  unit.fontPx = font;
  ctx.fitText(unit, Math.max(font, maxW));
  unit.x = x;
  unit.y = y;
  unit.onPaper = true;
  return y + unit.h;
}

function hide(unit: PhoneUnit): void {
  unit.x = 0;
  unit.y = 0;
  unit.w = 0;
  unit.h = 0;
  unit.fontPx = 0;
  unit.lines = [];
  unit.onPaper = true;
  unit.clip = undefined;
}

function ink(unit: PhoneUnit, color = "#3B2A20"): void {
  const paint = (node: GameNode) => {
    const styled = node as GameNode & { style?: { color?: string } };
    if (styled.style) styled.style.color = color;
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (!list) return;
    for (const child of list) if (child.type === "text") paint(child);
  };
  paint(unit.node);
}

function find(units: PhoneUnit[], text: string): PhoneUnit | undefined {
  return units.find((unit) => unit.text === text) ?? units.find((unit) => unit.text.includes(text));
}

function textWidth(ctx: PhoneContext, text: string, font: number): number {
  if (ctx.measure) return ctx.measure(text, font, "700", "sans-serif");
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 255 ? font : font * 0.56;
  return width;
}

function inkWidth(ctx: PhoneContext, text: string, font: number, weight: string, family: string): number {
  if (ctx.measure) return ctx.measure(text, font, weight, family);
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 255 ? font : font * 0.56;
  return width;
}

function worldPoint(node: GameNode): { x: number; y: number } {
  let x = node.x;
  let y = node.y;
  let parent = node.parent;
  while (parent) {
    x += parent.x;
    y += parent.y;
    parent = parent.parent;
  }
  return { x, y };
}

function findActor(scene: PhoneContext["scene"]): GameNode | null {
  let found: GameNode | null = null;
  const visit = (node: GameNode) => {
    const key = (node as GameNode & { texture?: string }).texture ?? "";
    if (!found && key.startsWith("cls:") && !/portrait/i.test(key) && node.name !== "exam:player" && node.parent) found = node.parent;
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
  return found;
}

function placeHero(ctx: PhoneContext, footX: number, footY: number, desired: number): PhoneHero | null {
  const heroNode = findActor(ctx.scene);
  if (!heroNode) return null;
  const at = worldPoint(heroNode);
  const parentScale = Math.abs(heroNode.scaleX || 0.5) || 0.5;
  const scale = desired / (512 * parentScale);
  return { scale, ox: footX - scale * at.x, oy: footY - scale * at.y };
}

function frameOf(image: PhoneImage): string {
  return String((image.node as GameNode & { frame?: string }).frame ?? "");
}

function textureOf(image: PhoneImage): string {
  return String((image.node as GameNode & { texture?: string }).texture ?? "");
}

function keepSceneArt(ctx: PhoneContext): void {
  for (const image of ctx.images) {
    const key = textureOf(image);
    const frame = frameOf(image);
    if (key === "logo_title") {
      image.w = 0;
      image.h = 0;
      image.placed = true;
      continue;
    }
    if (key.startsWith("bg_") || image.w >= ctx.view.w * 0.9) {
      image.placed = true;
      continue;
    }
    if (frame === "panel_parchment" || frame === "panel_wood" || frame === "dialog" || frame === "dialog_shadow" || frame === "list_row" || frame.startsWith("list_row")) {
      image.w = 0;
      image.h = 0;
      image.placed = true;
    }
  }
}

function dropUnplaced(ctx: PhoneContext): void {
  for (const image of ctx.images) {
    if (image.placed) continue;
    image.w = 0;
    image.h = 0;
  }
}

function placeImage(image: PhoneImage, box: Box): void {
  image.x = box.x;
  image.y = box.y;
  image.w = box.w;
  image.h = box.h;
  image.placed = true;
}

function blankFullScreen(ctx: PhoneContext, except: PhoneUnit | null): void {
  for (const unit of ctx.units) {
    if (unit === except || unit.onPaper) continue;
    if (!unit.interactive || unit.text.trim()) continue;
    if (unit.design.w >= 900 || unit.design.h >= 600) hide(unit);
  }
}

function layoutTitle(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const brand = ctx.units.find((unit) => unit.text === "词境练习家");
  const sub = ctx.units.find((unit) => unit.text === "LexiQuest");
  const tag = ctx.units.find((unit) => unit.text.includes("认识单词"));
  const cont = ctx.units.find((unit) => unit.interactive && unit.text.includes("继续"));
  const again = ctx.units.find((unit) => unit.interactive && unit.text.includes("重新开始"));
  const swap = ctx.units.find((unit) => unit.interactive && unit.text === "换角色");
  if (brand) place(brand, s.box(318, 46, 300, 32), 0);
  if (sub) place(sub, s.box(318, 82, 300, 20), 0);
  if (tag) {
    ink(tag);
    place(tag, s.box(232, 136, 380, 28), 14);
  }
  if (cont) place(cont, s.box(222, 300, 168, 48), 17);
  if (again) place(again, s.box(398, 300, 168, 48), 17);
  if (swap) place(swap, s.box(574, 300, 140, 48), 17);
  const plaque = s.box(318, 40, 300, 92);
  for (const image of ctx.images) {
    if (textureOf(image).includes("logo_lexiquest")) placeImage(image, plaque);
  }
  const foot = s.box(158, 336, 0, 0);
  return {
    hero: placeHero(ctx, foot.x, foot.y, 200 * s.sy),
    skipMasks: true,
    chrome,
    logo: s.box(318, 40, 300, 92),
  };
}

const VILLAGE: Array<[string, number, number]> = [
  ["学堂", 168, 78],
  ["对战", 372, 28],
  ["给家长", 598, 72],
  ["词卡册", 96, 168],
  ["复习桌", 640, 156],
  ["技能", 150, 248],
  ["衣柜", 372, 258],
  ["同机练习", 560, 236],
];

const HUD_INK = "#3B2A20";
const HUD_TEAL = "#1F6F64";
const HUD_MUTED = "#46363A";
const HUD_BODY = '"Noto Sans SC", "WenQuanYi Micro Hei", "PingFang SC", sans-serif';
const HUD_TITLE = '"ZCOOL KuaiLe", "Noto Sans SC", sans-serif';

function pushSheet(chrome: PhoneChrome[], box: Box, padX: number, padY: number): void {
  chrome.push({ frame: "panel_wood", box, sourceHalf: true });
  chrome.push({
    frame: "panel_parchment",
    box: { x: box.x + padX, y: box.y + padY, w: Math.max(1, box.w - padX * 2), h: Math.max(1, box.h - padY * 2) },
    sourceHalf: true,
  });
}

function castLine(unit: PhoneUnit, text: string, family: string, size: number, weight: string, color: string): void {
  unit.text = text;
  unit.lines = [text];
  unit.fontPx = size;
  unit.weight = weight;
  unit.family = family;
  face(unit, family, color, weight);
  const node = unit.node as GameNode & { style?: { fontSize?: string } };
  if (node.style) node.style.fontSize = `${size}px`;
}

function pinLine(ctx: PhoneContext, unit: PhoneUnit, x: number, originY: number, size: number): void {
  const sample = unit.lines[0] || unit.text;
  const width = ctx.measure ? ctx.measure(sample, size, unit.weight, unit.family) : textWidth(ctx, sample, size);
  unit.x = x;
  unit.y = originY - size / 2;
  unit.w = Math.max(size, Math.ceil(width) + 2);
  unit.h = size + 2;
  unit.onPaper = true;
}

function captionLine(ctx: PhoneContext, text: string, x: number, originY: number, size: number, color: string, family: string, weight: string): PhoneCaption {
  const width = ctx.measure ? ctx.measure(text, size, weight, family) : textWidth(ctx, text, size);
  return {
    text,
    x,
    y: originY - size / 2,
    w: Math.max(size, Math.ceil(width)),
    h: size,
    color,
    font: size,
    family,
    weight,
  };
}

/** The live goal sentence keeps every character. 「今日目标」 starts the teal run when it is not already the first clause. */
function splitGoal(text: string): { status: string; goal: string } {
  const at = text.indexOf("今日目标");
  if (at > 0) return { status: text.slice(0, at).trim(), goal: text.slice(at).trim() };
  return { status: "", goal: text.trim() };
}

function layoutVillage(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const padX = 8 * s.sx;
  const padY = 8 * s.sy;
  // 三行官方句子写在同一块木框羊皮纸上。牌面盖住学堂屋顶尖，名称牌仍在牌下。
  pushSheet(chrome, s.box(56, 16, 308, 84), padX, padY);
  const lines = ctx.units.filter((unit) => !unit.interactive && unit.text.trim()).sort((a, b) => a.designY - b.designY);
  const title = lines.find((unit) => unit.text.includes("·") && /已学\s*\d+\//.test(unit.text));
  const goal = lines.find((unit) => unit !== title && (unit.text.includes("累计完成") || unit.text.includes("今日目标") || unit.text.includes("也算完成")));
  const captions: PhoneCaption[] = [];
  const textX = s.box(80, 0, 0, 0).x;
  if (title) {
    castLine(title, title.text, HUD_BODY, 15, "600", HUD_INK);
    pinLine(ctx, title, textX, s.box(0, 37, 0, 0).y, 15);
  }
  if (goal) {
    const parts = splitGoal(goal.text);
    if (parts.status) {
      castLine(goal, parts.status, HUD_BODY, 14, "500", HUD_INK);
      pinLine(ctx, goal, textX, s.box(0, 55, 0, 0).y, 14);
      captions.push(captionLine(ctx, parts.goal, textX, s.box(0, 73, 0, 0).y, 14, HUD_TEAL, HUD_BODY, "600"));
    } else {
      castLine(goal, parts.goal, HUD_BODY, 14, "600", HUD_TEAL);
      pinLine(ctx, goal, textX, s.box(0, 55, 0, 0).y, 14);
    }
  }
  for (const line of lines) {
    if (line !== title && line !== goal) hide(line);
  }
  const swap = ctx.units.find((unit) => unit.interactive && unit.text === "换角色");
  if (swap) place(swap, s.box(592, 16, 140, 48), 17);
  for (const [label, x, y0] of VILLAGE) {
    const unit = ctx.units.find((item) => item.interactive && item.text === label);
    if (!unit) continue;
    place(unit, s.box(x, y0, 112, 104), 14);
    unit.label = "sign";
    face(unit, HUD_TITLE, HUD_INK, "");
  }
  const foot = s.box(430, 214, 0, 0);
  return { hero: placeHero(ctx, foot.x, foot.y, 86 * s.sy), skipMasks: true, chrome, captions };
}

function layoutGuide(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const pins = ctx.units.filter((unit) => String(unit.node.name || "").startsWith("pin:"));
  const unlocked = ctx.units.some((unit) => unit.text.includes("学习进度"));
  const back = ctx.units.find((unit) => unit.interactive && (unit.text === "返回" || unit.text.startsWith("返回")));
  if (!pins.length || unlocked) {
    if (back) place(back, s.box(56, 16, 100, 44), 16);
    const actions = ctx.units.filter((unit) => unit.interactive && unit !== back && unit.text.trim());
    const rowH = s.box(0, 0, 0, 44).h;
    const gap = 8 * s.sx;
    const widths = actions.map((action) => Math.max(s.box(0, 0, 88, 0).w, Math.min(s.box(0, 0, 160, 0).w, textWidth(ctx, action.text, 16) + 28 * s.sx)));
    const maxW = ctx.view.w - s.box(56, 0, 0, 0).x - 8;
    let rows = 1;
    let used = 0;
    for (const width of widths) {
      if (used > 0 && used + width > maxW) {
        rows += 1;
        used = 0;
      }
      used += width + gap;
    }
    const barH = rows * rowH + Math.max(0, rows - 1) * 8 * s.sy;
    let x = s.box(56, 0, 0, 0).x;
    let y = ctx.view.h - 8 - barH;
    actions.forEach((action, index) => {
      const width = widths[index] ?? s.box(0, 0, 100, 0).w;
      if (x > s.box(56, 0, 0, 0).x && x + width > ctx.view.w - 8) {
        x = s.box(56, 0, 0, 0).x;
        y += rowH + 8 * s.sy;
      }
      place(action, { x, y, w: width, h: rowH }, 16);
      x += width + gap;
    });
    const sheet = { x: s.box(56, 0, 0, 0).x, y: s.box(0, 68, 0, 0).y, w: s.box(0, 0, 732, 0).w, h: Math.max(rowH, y - s.box(0, 80, 0, 0).y) };
    chrome.push({ frame: "panel_parchment", box: sheet });
    let textY = sheet.y + 16 * s.sy;
    const textLimit = y - 8;
    for (const unit of ctx.units.filter((item) => !item.interactive && item.text.trim() && !item.onPaper).sort((a, b) => a.designY - b.designY)) {
      if (textY + 14 > textLimit) break;
      ink(unit);
      const next = write(ctx, unit, sheet.x + 24 * s.sx, textY, sheet.w - 48 * s.sx, 14);
      if (next > textLimit) {
        hide(unit);
        break;
      }
      textY = next + 4 * s.sy;
    }
    return { hero: null, skipMasks: true, chrome };
  }
  const panel = s.box(152, 27, 540, 336);
  chrome.push({ frame: "panel_wood", box: panel });
  chrome.push({ frame: "panel_parchment", box: s.box(164, 39, 516, 312) });
  const title = pins.find((unit) => unit.node.name === "pin:title") ?? ctx.units.find((unit) => unit.text === "给家长");
  const dots = pins.find((unit) => unit.node.name === "pin:first");
  const hint = pins.find((unit) => unit.node.name === "pin:hint");
  const error = pins.find((unit) => unit.node.name === "pin:error");
  const again = pins.find((unit) => unit.node.name === "pin:again");
  if (again && !again.text.trim()) hide(again);
  const slots = [0, 1, 2, 3]
    .map((index) => pins.find((unit) => unit.node.name === `pin:slot:${index}`))
    .filter((unit): unit is PhoneUnit => Boolean(unit));
  const reenter = Boolean(title && title.text.startsWith("再输入一次"));
  let y = s.box(0, 46, 0, 0).y;
  const sceneTitle = ctx.units.find((unit) => !unit.interactive && unit.text === "给家长" && unit.node.name !== "pin:title");
  if (reenter && title) {
    if (sceneTitle) hide(sceneTitle);
    ink(title);
    y = write(ctx, title, s.box(176, 0, 0, 0).x, y, s.box(0, 0, 280, 0).w, 22) + 8 * s.sy;
  } else {
    if (sceneTitle) {
      ink(sceneTitle);
      y = write(ctx, sceneTitle, s.box(176, 0, 0, 0).x, y, s.box(0, 0, 240, 0).w, 22) + 6 * s.sy;
    }
    if (title && title !== sceneTitle) {
      ink(title);
      y = write(ctx, title, s.box(176, 0, 0, 0).x, y, s.box(0, 0, 250, 0).w, 14) + 8 * s.sy;
    }
  }
  const field = s.box(176, 0, 200, 48);
  field.y = y;
  if (slots.length === 4) {
    if (dots) hide(dots);
    chrome.push({ frame: "input_normal", box: field });
    const slotW = field.w / slots.length;
    slots.forEach((slot, index) => {
      const box = { x: field.x + index * slotW, y: field.y, w: slotW, h: field.h };
      ink(slot);
      place(slot, box, 18, true);
    });
  } else {
    chrome.push({ frame: "input_normal", box: field });
    if (dots) {
      ink(dots);
      place(dots, field, 18, true);
    }
  }
  y = field.y + field.h + 8 * s.sy;
  if (hint && hint.text.trim()) {
    ink(hint, "#61402D");
    y = write(ctx, hint, s.box(176, 0, 0, 0).x, y, s.box(0, 0, 250, 0).w, 14) + 8 * s.sy;
  }
  if (error && error.text.trim()) {
    ink(error, "#A9432B");
    write(ctx, error, s.box(176, 0, 0, 0).x, y, s.box(0, 0, 250, 0).w, 14);
  }
  const note = ctx.units.find((unit) => !unit.interactive && unit.text.includes("不是安全登录"));
  if (note) {
    ink(note);
    write(ctx, note, s.box(176, 0, 0, 0).x, s.box(0, 210, 0, 0).y, s.box(0, 0, 250, 0).w, 14);
  }
  if (back) {
    if (back.text === "返回" || back.text.startsWith("返回")) {
      back.text = "取消";
      back.lines = ["取消"];
    }
    place(back, s.box(176, 300, 100, 44), 16);
  }
  const pad = s.box(452, 70, 224, 216);
  const key = (text: string) => pins.find((unit) => unit.interactive && unit.text === text);
  const digit = s.box(0, 0, 48, 48);
  const gap = 8 * s.sx;
  const rowW = digit.w * 3 + gap * 2;
  const originX = pad.x + (pad.w - rowW) / 2;
  for (let n = 1; n <= 9; n += 1) {
    const unit = key(String(n));
    if (!unit) continue;
    const col = (n - 1) % 3;
    const row = Math.floor((n - 1) / 3);
    place(unit, { x: originX + col * (digit.w + gap), y: pad.y + row * (digit.h + 8 * s.sy), w: digit.w, h: digit.h }, 20);
    chrome.push({ frame: "btn_secondary_normal", box: { x: unit.x, y: unit.y, w: unit.w, h: unit.h } });
  }
  const bottomY = pad.y + 3 * (digit.h + 8 * s.sy);
  const wide = s.box(0, 0, 80, 48);
  const zero = key("0");
  const clear = key("清除");
  const ok = key("确认");
  if (clear) {
    place(clear, { x: pad.x, y: bottomY, w: wide.w, h: digit.h }, 16);
    chrome.push({ frame: "btn_secondary_normal", box: { x: clear.x, y: clear.y, w: clear.w, h: clear.h } });
  }
  if (zero) {
    place(zero, { x: pad.x + (pad.w - digit.w) / 2, y: bottomY, w: digit.w, h: digit.h }, 20);
    chrome.push({ frame: "btn_secondary_normal", box: { x: zero.x, y: zero.y, w: zero.w, h: zero.h } });
  }
  if (ok) {
    const box = { x: pad.x + pad.w - wide.w, y: bottomY, w: wide.w, h: digit.h };
    place(ok, box, 16, true);
    ink(ok, "#FFF4DC");
    chrome.push({ frame: "btn_action_teal_normal", box });
  }
  for (const unit of pins) if (!unit.onPaper) hide(unit);
  for (const unit of ctx.units) {
    if (!unit.onPaper && !unit.interactive && unit.text.trim()) hide(unit);
  }
  return { hero: null, skipMasks: true, chrome };
}

function layoutWardrobe(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const back = ctx.units.find((unit) => unit.interactive && unit.text.startsWith("返回"));
  const title = ctx.units.find((unit) => unit.text === "衣柜");
  if (back) place(back, s.box(56, 18, 100, 44), 16);
  if (title) {
    ink(title);
    place(title, s.box(168, 20, 120, 36), 22);
  }
  chrome.push({ frame: "panel_wood", box: s.box(152, 16, 140, 44) });
  const sheet = s.box(56, 70, 420, 280);
  chrome.push({ frame: "panel_parchment", box: sheet });
  const order = ["已有装备", "花环", "旅行短衣", "就是职业", "穿着", "称号", "一次只戴", "还没有称号"];
  const body = ctx.units.filter((unit) => !unit.interactive && unit.text.trim() && unit !== title).sort((a, b) => {
    const ai = order.findIndex((item) => a.text.includes(item));
    const bi = order.findIndex((item) => b.text.includes(item));
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });
  let y = sheet.y + 28 * s.sy;
  for (const unit of body) {
    if (unit.text.length <= 1) continue;
    ink(unit);
    const font = unit.text === "旅行短衣" || unit.text === "已有装备" || unit.text.startsWith("称号") ? 16 : 14;
    y = write(ctx, unit, sheet.x + 24 * s.sx, y, sheet.w - 120 * s.sx, font) + 6 * s.sy;
  }
  const outfit = body.find((unit) => unit.text === "旅行短衣");
  const mark = body.find((unit) => unit.text.length === 1);
  if (outfit && mark) {
    ink(mark, "#61402D");
    place(mark, { x: outfit.x + outfit.w + 8 * s.sx, y: outfit.y, w: 24 * s.sx, h: Math.max(outfit.h, 16 * s.sy) }, 14);
  }
  const worn = body.find((unit) => unit.text === "穿着");
  if (worn) {
    const chip = { x: sheet.x + sheet.w - 112 * s.sx, y: worn.y - 8 * s.sy, w: Math.max(88, 88 * s.sx), h: Math.max(44, 44 * s.sy) };
    chrome.push({ frame: "btn_action_teal_normal", box: chip });
    ink(worn, "#FFF4DC");
    place(worn, chip, 14, true);
  }
  for (const image of ctx.images) {
    const frame = frameOf(image);
    if (frame.includes("wardrobe_arch") || frame.includes("arch")) placeImage(image, s.box(590, 48, 200, 300));
    else if (frame.includes("wardrobe_stage") || frame.includes("stage")) placeImage(image, s.box(600, 250, 180, 48));
  }
  const foot = s.box(690, 300, 0, 0);
  return { hero: placeHero(ctx, foot.x, foot.y, 170 * s.sy), skipMasks: true, chrome };
}

function layoutSkills(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const back = ctx.units.find((unit) => unit.interactive && unit.text.startsWith("返回"));
  const job = ctx.units.find((unit) => unit.interactive && unit.text === "换职业");
  const title = ctx.units.find((unit) => unit.text === "技能卡" || unit.text.startsWith("技能卡"));
  const rule = ctx.units.find((unit) => unit.text.includes("最多带"));
  const hint = ctx.units.find((unit) => unit.text.includes("卡组分开存"));
  if (back) place(back, s.box(56, 16, 100, 44), 16);
  if (title) {
    ink(title);
    place(title, s.box(168, 18, 140, 36), 20);
  }
  chrome.push({ frame: "panel_wood", box: s.box(160, 14, 150, 44) });
  if (rule) {
    ink(rule, "#46363A");
    write(ctx, rule, s.box(324, 14, 0, 0).x, s.box(0, 14, 0, 0).y, s.box(0, 0, 500, 0).w, 12);
  }
  const captions: PhoneCaption[] = [];
  const toggles = ctx.units.filter((unit) => unit.interactive && (unit.text === "卸下" || unit.text === "装备" || unit.text === "已装备" || unit.text === "未装备"));
  const usedToggles = new Set<PhoneUnit>();
  const texts = ctx.units.filter((unit) => !unit.interactive && unit.text.trim() && unit !== title && unit !== rule && unit !== hint).sort((a, b) => a.designY - b.designY || a.designX - b.designX);
  const used = new Set<PhoneUnit>();
  const names = ["盾击", "战吼", "坚守", "旋风斩"].map((label) => texts.find((unit) => unit.text === label)).filter((unit): unit is PhoneUnit => Boolean(unit));
  names.forEach((name, index) => {
    used.add(name);
    const desc = texts.find((unit) => !used.has(unit) && !unit.text.startsWith("★") && unit.text.length > 4 && unit.designY >= name.designY - 8 && unit.designY <= name.designY + 90);
    if (desc) used.add(desc);
    const star = texts.find((unit) => !used.has(unit) && unit.text.startsWith("★") && Math.abs(unit.designY - name.designY) < 48);
    if (star) used.add(star);
    const col = index % 2;
    const line = Math.floor(index / 2);
    const card = s.box(56 + col * 310, 72 + line * 96, 300, 88);
    chrome.push({ frame: "panel_parchment", box: card });
    ink(name);
    place(name, { x: card.x + 64 * s.sx, y: card.y + 10 * s.sy, w: card.w - 168 * s.sx, h: 20 * s.sy }, 16);
    if (star) {
      ink(star, "#61402D");
      place(star, { x: name.x + 64 * s.sx, y: name.y, w: 48 * s.sx, h: 20 * s.sy }, 14);
    }
    if (desc) {
      ink(desc, "#46363A");
      write(ctx, desc, card.x + 64 * s.sx, card.y + 46 * s.sy, card.w - 80 * s.sx, 14);
    }
    const badge = { x: card.x + card.w - 96 * s.sx, y: card.y + 8 * s.sy, w: 88 * s.sx, h: 32 * s.sy };
    const toggle = toggles
      .filter((unit) => !usedToggles.has(unit))
      .sort((a, b) => Math.abs(a.designY - name.designY) - Math.abs(b.designY - name.designY))[0];
    if (toggle && Math.abs(toggle.designY - name.designY) < 160) {
      usedToggles.add(toggle);
      const equipped = toggle.text === "卸下" || toggle.text === "已装备";
      toggle.text = equipped ? "已装备" : "未装备";
      toggle.lines = [toggle.text];
      ink(toggle, toggle.text === "未装备" ? "#46363A" : "#FFF4DC");
      place(toggle, badge, 14, true);
      chrome.push({ frame: toggle.text === "未装备" ? "btn_secondary_normal" : "btn_action_teal_normal", box: badge });
    } else {
      // 新存档里旋风斩还锁着，场景不给它卸下按钮。牌子仍按稿子标未装备，不解锁、不改装备张数。
      captions.push({ text: "未装备", x: badge.x, y: badge.y, w: badge.w, h: badge.h, color: "#46363A", font: 14 });
      chrome.push({ frame: "btn_secondary_normal", box: badge });
    }
  });
  for (const toggle of toggles) if (!usedToggles.has(toggle)) hide(toggle);
  for (const unit of texts) if (!used.has(unit)) hide(unit);
  if (hint) {
    ink(hint, "#46363A");
    write(ctx, hint, s.box(68, 280, 0, 0).x, s.box(0, 276, 0, 0).y, s.box(0, 0, 400, 0).w, 14);
  }
  if (job) place(job, s.box(628, 312, 140, 48), 17);
  const icons = ctx.images.filter((image) => textureOf(image).includes("skill") || frameOf(image).includes("skill"));
  icons.forEach((image, index) => {
    const col = index % 2;
    const line = Math.floor(index / 2);
    placeImage(image, s.box(68 + col * 310, 86 + line * 96, 48, 48));
  });
  return { hero: null, skipMasks: true, chrome, captions };
}

function chapterNameOf(title: string): string {
  const parts = title.split("·").map((part) => part.trim()).filter(Boolean);
  if (parts[0] === "学堂") parts.shift();
  return parts.join(" · ");
}

/**
 * The book already ends at 732. A live chapter name uses the header slot first.
 * If it still overflows, the header grows to 72 and the name wraps at 16. Never below 14.
 */
function chapterOnBook(ctx: PhoneContext, name: string, maxW: number): { font: number; lines: string[] } {
  const width = (value: string, size: number) => inkWidth(ctx, value, size, "", FONT_TITLE);
  const wrap = (size: number): string[] | null => {
    if (width(name, size) <= maxW + 0.5) return [name];
    const parts = name.split(" · ");
    if (parts.length < 2) return null;
    let left = parts[0] ?? name;
    let index = 1;
    while (index < parts.length) {
      const next = `${left} · ${parts[index]}`;
      if (width(next, size) > maxW) break;
      left = next;
      index += 1;
    }
    const right = parts.slice(index).join(" · ");
    if (!right || width(left, size) > maxW + 0.5 || width(right, size) > maxW + 0.5) return null;
    return [left, right];
  };
  const at16 = wrap(16);
  if (at16) return { font: 16, lines: at16 };
  const at14 = wrap(14);
  if (at14) return { font: 14, lines: at14 };
  return { font: 14, lines: [name] };
}

function phraseLines(ctx: PhoneContext, text: string, font: number, maxW: number, weight: string, family: string): string[] {
  const width = (value: string) => inkWidth(ctx, value, font, weight, family);
  if (width(text) <= maxW) return [text];
  const parts = text.split(/(?<=[。！？，、；])/).map((part) => part.trim()).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const part of parts.length ? parts : [text]) {
    const next = line ? `${line}${part}` : part;
    if (line && width(next) > maxW) {
      lines.push(line);
      line = part;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function layoutLearn(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const back = ctx.units.find((unit) => unit.interactive && (unit.text.startsWith("返回") || unit.text.startsWith("回村子")) && !unit.text.includes("换一章"));
  const confirm = ctx.units.find((unit) => unit.interactive && unit.text === "确认");
  const cancel = ctx.units.find((unit) => unit.interactive && unit.text === "取消");
  const study = ctx.units.find((unit) => unit.text === "学一学" || unit.node.name === "learn:study");
  const modes = ["听一听", "选意思", "拼一拼"].map((label) => ctx.units.find((unit) => unit.interactive && unit.text === label)).filter((unit): unit is PhoneUnit => Boolean(unit));
  if (study && !modes.length) hide(study);
  const studying = modes.length > 0;
  if (back) {
    if (studying) {
      const box = s.box(68, 24, 100, 48);
      face(back, FONT_TITLE, INK, "");
      place(back, box, 16, true);
      chrome.push({ frame: "btn_secondary_normal", box, layer: "over" });
    } else place(back, s.box(56, 16, Math.max(100, textWidth(ctx, back.text, 16) + 36), 48), 16);
  }
  const heading = ctx.units.find((unit) => !unit.interactive && (unit.text.startsWith("学堂") || unit.text === "请选章"));
  if (!studying) {
    if (heading) {
      ink(heading);
      place(heading, s.box(176, 20, 280, 32), 20);
    }
    chrome.push({ frame: "panel_wood", box: s.box(164, 14, 320, 44) });
  }
  if (studying) {
    // One study book. Title, status, modes, the word, and the actions share this face.
    // Nunito 800 and Noto 500/600 are requested here. Packed faces stay 400 and 700; nothing remaps those weights.
    const captions: PhoneCaption[] = [];
    const marks: PhoneMark[] = [];
    const phase = String((ctx.scene as { phase?: string }).phase ?? "study");
    const selected = phase === "listen" ? "听一听" : phase === "quiz" ? "选意思" : phase === "spell" ? "拼一拼" : "学一学";
    const book = s.box(56, 16, 676, 350);
    chrome.push({ frame: "panel_wood", box: book, sourceHalf: true });
    chrome.push({
      frame: "panel_parchment",
      box: {
        x: book.x + 16 * s.sx,
        y: book.y + 10 * s.sy,
        w: Math.max(1, book.w - 32 * s.sx),
        h: Math.max(1, book.h - 20 * s.sy),
      },
      sourceHalf: true,
    });
    const titleText = "学堂";
    const titleW = inkWidth(ctx, titleText, 20, "", FONT_TITLE);
    const titleX = s.box(202, 0, 0, 0).x;
    const titleMid = s.box(0, 48, 0, 0).y;
    captions.push({
      text: titleText,
      x: titleX,
      y: titleMid - 10 * s.sy,
      w: Math.max(20 * s.sx, titleW),
      h: 20 * s.sy,
      color: INK,
      font: 20,
      family: FONT_TITLE,
      weight: "",
    });
    const ruleX = titleX + titleW + 14 * s.sx;
    marks.push({ kind: "rule", x: ruleX, y: s.box(0, 32, 0, 0).y, w: Math.max(2, 2 * s.sx), h: 32 * s.sy, fill: WOOD });
    if (heading) {
      const chapter = chapterNameOf(heading.text);
      if (!chapter) hide(heading);
      else {
        const textX = ruleX + 36 * s.sx;
        const textMax = Math.max(16, s.box(716, 0, 0, 0).x - 16 * s.sx - textX);
        const laid = chapterOnBook(ctx, chapter, textMax);
        const lineH = laid.font * s.sy;
        const gap = laid.lines.length > 1 ? 4 * s.sy : 0;
        const blockH = laid.lines.length * lineH + Math.max(0, laid.lines.length - 1) * gap;
        const bandTop = s.box(0, 16, 0, 0).y;
        const bandH = (laid.lines.length > 1 ? 72 : 48) * s.sy;
        const y = laid.lines.length > 1 ? bandTop + Math.max(0, (bandH - blockH) / 2) : titleMid - lineH / 2;
        const widest = laid.lines.reduce((wide, line) => Math.max(wide, inkWidth(ctx, line, laid.font, "", FONT_TITLE)), 0);
        face(heading, FONT_TITLE, INK, "");
        heading.text = chapter;
        heading.lines = laid.lines;
        heading.fontPx = laid.font;
        heading.label = undefined;
        heading.x = textX;
        heading.y = y;
        heading.w = Math.max(lineH, Math.min(textMax, Math.ceil(widest) + 2));
        heading.h = blockH;
        heading.onPaper = true;
        const styled = heading.node as GameNode & { style?: { fontSize?: string; lineSpacing?: number } };
        if (styled.style) {
          styled.style.fontSize = `${laid.font}px`;
          styled.style.lineSpacing = laid.lines.length > 1 ? 4 : 0;
        }
      }
    }
    const remaining = ctx.units.find((unit) => !unit.interactive && unit.text.includes("本章还可学"));
    const today = ctx.units.find((unit) => !unit.interactive && unit.text.startsWith("今日"));
    const progress = ctx.units.find((unit) => !unit.interactive && /^\d+\/\d+$/.test(unit.text.trim()));
    let afterChip = s.box(72, 0, 0, 0).x;
    let chipMid = s.box(0, 99, 0, 0).y;
    if (remaining) {
      const label = remaining.text.trim();
      const width = Math.max(142, Math.ceil(inkWidth(ctx, label, 14, "600", FONT_BODY) + 36));
      const box = s.box(72, 80, width, 38);
      chrome.push({ frame: "panel_parchment", box });
      face(remaining, FONT_BODY, TEAL, "600");
      remaining.text = label;
      remaining.lines = [label];
      remaining.fontPx = 14;
      remaining.x = box.x + 20 * s.sx;
      remaining.y = box.y + (box.h - 14 * s.sy) / 2;
      remaining.w = Math.max(14, box.w - 36 * s.sx);
      remaining.h = 14 * s.sy;
      remaining.onPaper = true;
      afterChip = box.x + box.w;
      chipMid = box.y + box.h / 2;
    }
    const inkStatus = (unit: PhoneUnit, label: string, x: number) => {
      face(unit, FONT_BODY, INK, "500");
      unit.text = label;
      unit.lines = [label];
      unit.fontPx = 14;
      unit.x = x;
      unit.y = chipMid - 7 * s.sy;
      unit.w = Math.max(14, Math.ceil(inkWidth(ctx, label, 14, "500", FONT_BODY)) + 2);
      unit.h = 14 * s.sy;
      unit.onPaper = true;
      unit.label = undefined;
    };
    let pen = afterChip + 20 * s.sx;
    if (progress) {
      inkStatus(progress, `本关 ${progress.text.trim()}`, pen);
      pen += progress.w;
    }
    if (progress && today) {
      const dot = 4 * Math.min(s.sx, s.sy);
      marks.push({ kind: "dot", x: pen + 12 * s.sx + dot / 2, y: chipMid, w: dot, h: dot, fill: WOOD });
      pen += 12 * s.sx + dot + 12 * s.sx;
    } else if (today) pen += 8 * s.sx;
    if (today) inkStatus(today, today.text.trim(), pen);
    const well = s.box(72, 126, 440, 48);
    marks.push({
      kind: "well",
      x: well.x,
      y: well.y,
      w: well.w,
      h: well.h,
      radius: 14 * Math.min(s.sx, s.sy),
      fill: "#F6E6C4",
      stroke: WOOD,
      strokeWidth: Math.max(2, 2 * Math.min(s.sx, s.sy)),
    });
    marks.push({
      kind: "rule",
      x: s.box(524, 0, 0, 0).x,
      y: well.y,
      w: Math.max(2, 2 * s.sx),
      h: Math.max(2, s.box(0, 356, 0, 0).y - well.y),
      fill: WOOD,
    });
    const modeSlots: Array<[string, number]> = [["学一学", 84], ["听一听", 188], ["选意思", 292], ["拼一拼", 396]];
    const tabs = modeSlots.map(([label]) => ctx.units.find((unit) => unit.interactive && (unit.text === label || (label === "学一学" && unit.node.name === "learn:study")))).filter((unit): unit is PhoneUnit => Boolean(unit));
    const seen = new Set<PhoneUnit>();
    modeSlots.forEach(([label, x], index) => {
      const tab = tabs.find((unit) => !seen.has(unit) && (unit.text === label || (label === "学一学" && unit.node.name === "learn:study")));
      if (!tab) return;
      seen.add(tab);
      const box = s.box(x, 126, 104, 48);
      face(tab, FONT_TITLE, INK, "");
      place(tab, box, 16, true);
      if (tab.text === selected || (selected === "学一学" && tab.node.name === "learn:study")) {
        const bw = Math.max(44 * s.sx, box.w - 6 * s.sx);
        const bh = 40 * s.sy;
        chrome.push({
          frame: "btn_primary_normal",
          box: { x: box.x + (box.w - bw) / 2, y: box.y + (box.h - bh) / 2, w: bw, h: bh },
          layer: "over",
        });
      } else if (index > 0) {
        marks.push({
          kind: "rule",
          x: box.x,
          y: box.y + 10 * s.sy,
          w: Math.max(2, 2 * s.sx),
          h: Math.max(2, box.h - 20 * s.sy),
          fill: WOOD,
        });
      }
    });
    const aa = s.box(84, 196, 88, 88);
    chrome.push({ frame: "panel_parchment", box: aa });
    // The formal board draws a leaf on this card. That leaf is not a packed asset, so the card stays the parchment Aa placeholder.
    captions.push({ text: "Aa", x: aa.x, y: aa.y, w: aa.w, h: aa.h, color: MUTED, font: 26, family: FONT_LATIN, weight: "800" });
    const held = new Set<PhoneUnit>([heading, remaining, today, progress].filter((unit): unit is PhoneUnit => Boolean(unit)));
    const latin = ctx.units.filter((unit) => !unit.interactive && !held.has(unit) && /^[A-Za-z][A-Za-z' -]*$/.test(unit.text) && unit.text.length < 24 && !/^(n\.|v\.|adj\.|adv\.|pron\.|prep\.|conj\.|num\.|interj\.|art\.|phr\.|modal v\.)$/.test(unit.text.trim()));
    const word = latin.sort((a, b) => a.text.length - b.text.length)[0];
    const pos = ctx.units.find((unit) => !unit.interactive && !held.has(unit) && /^(n\.|v\.|adj\.|adv\.|pron\.|prep\.|conj\.|num\.|interj\.|art\.|phr\.|modal v\.)$/.test(unit.text.trim()));
    const gloss = ctx.units.find((unit) => !unit.interactive && !held.has(unit) && unit !== word && unit !== pos && /^[\u4e00-\u9fff；，、（）()]{1,16}$/.test(unit.text.trim()));
    const meta = ctx.units.find((unit) => !unit.interactive && !held.has(unit) && unit !== gloss && (unit.text.includes("·") || unit.text.includes("先认读") || unit.text.includes("要会拼")));
    const pinWord = (unit: PhoneUnit, x: number, y: number, font: number, family: string, weight: string, color: string, maxW: number) => {
      let size = font;
      let width = inkWidth(ctx, unit.text, size, weight, family);
      while (size > 14 && width > maxW) {
        size -= 2;
        width = inkWidth(ctx, unit.text, size, weight, family);
      }
      face(unit, family, color, weight);
      unit.fontPx = size;
      unit.lines = [unit.text];
      unit.x = x;
      unit.y = y;
      unit.w = Math.max(size, Math.min(maxW, Math.ceil(width) + 2));
      unit.h = size + 2;
      unit.onPaper = true;
      unit.label = undefined;
    };
    const wordX = s.box(220, 0, 0, 0).x;
    const wordMax = Math.max(40, s.box(504, 0, 0, 0).x - wordX);
    if (word) pinWord(word, wordX, s.box(0, 190, 0, 0).y, 52, FONT_LATIN, "800", INK, wordMax);
    if (gloss) pinWord(gloss, wordX, s.box(0, 228, 0, 0).y, 40, FONT_TITLE, "", TEAL, wordMax);
    let rowX = wordX;
    const rowY = s.box(0, 276, 0, 0).y;
    if (pos) {
      pinWord(pos, rowX, rowY, 14, FONT_BODY, "500", MUTED, wordMax);
      rowX += pos.w + 6 * s.sx;
      captions.push({ text: "·", x: rowX, y: rowY, w: 12 * s.sx, h: 16 * s.sy, color: MUTED, font: 14, family: FONT_BODY, weight: "500" });
      rowX += 16 * s.sx;
    }
    if (meta) pinWord(meta, rowX, rowY, 14, FONT_BODY, "500", MUTED, Math.max(40, wordX + wordMax - rowX));
    const noted = new Set<PhoneUnit>([word, pos, gloss, meta].filter((unit): unit is PhoneUnit => Boolean(unit)));
    let noteY = s.box(0, 246, 0, 0).y;
    const noteLimit = s.box(0, 300, 0, 0).y;
    const noteX = s.box(540, 0, 0, 0).x;
    const noteW = s.box(0, 0, 160, 0).w;
    for (const unit of ctx.units) {
      if (unit.interactive || unit.onPaper || held.has(unit) || noted.has(unit) || !unit.text.trim()) continue;
      if (unit.text.startsWith("学堂") || unit.text === "请选章") {
        hide(unit);
        continue;
      }
      const lines = phraseLines(ctx, unit.text, 14, noteW, "500", FONT_BODY);
      const block = lines.length * 16 * s.sy;
      if (noteY + block > noteLimit) {
        hide(unit);
        continue;
      }
      face(unit, FONT_BODY, MUTED, "500");
      unit.lines = lines;
      unit.fontPx = 14;
      unit.x = noteX;
      unit.y = noteY;
      unit.w = noteW;
      unit.h = block;
      unit.onPaper = true;
      unit.label = undefined;
      const styled = unit.node as GameNode & { style?: { lineSpacing?: number; fontSize?: string } };
      if (styled.style) {
        styled.style.fontSize = "14px";
        styled.style.lineSpacing = 2;
      }
      noteY += block + 2 * s.sy;
    }
    const column = (unit: PhoneUnit | undefined, x: number, y: number, w: number, h: number, frame: string, font: number) => {
      if (!unit) return;
      const box = s.box(x, y, w, h);
      face(unit, FONT_TITLE, INK, "");
      place(unit, box, font, true);
      chrome.push({ frame, box, layer: "over" });
    };
    const prev = ctx.units.find((unit) => unit.text === "上一个" || unit.node.name === "learn:prev");
    const next = ctx.units.find((unit) => unit.text === "下一个" || unit.node.name === "learn:next");
    const change = ctx.units.find((unit) => unit.interactive && unit.text.includes("换一章"));
    column(prev, 532, 126, 176, 48, "btn_secondary_normal", 16);
    column(next, 532, 190, 176, 48, "btn_secondary_normal", 16);
    column(confirm, 532, 308, 176, 48, "btn_primary_normal", 18);
    column(change, 72, 308, 120, 48, "btn_secondary_normal", 16);
    for (const unit of ctx.units) if (!unit.onPaper) hide(unit);
    return { hero: null, skipMasks: true, chrome, captions, marks };
  }
  if (confirm) place(confirm, s.box(604, 308, 180, 48), 18);
  if (cancel) place(cancel, s.box(480, 308, 112, 48), 16);
  const region = s.box(56, 72, 732, 220);
  let x = region.x;
  let y = region.y;
  const buttons = ctx.units.filter((unit) => unit.interactive && !unit.onPaper && unit.text.trim());
  for (const button of buttons) {
    const width = Math.max(s.box(0, 0, 108, 0).w, Math.min(region.w, textWidth(ctx, button.text, 16) + 32 * s.sx));
    if (x > region.x && x + width > region.x + region.w) {
      x = region.x;
      y += s.box(0, 0, 0, 52).h;
    }
    place(button, { x, y, w: width, h: s.box(0, 0, 0, 44).h }, 16);
    x += width + 8 * s.sx;
  }
  let noteY = y + s.box(0, 0, 0, 52).h;
  for (const unit of ctx.units.filter((item) => !item.onPaper && !item.interactive && item.text.trim())) {
    ink(unit);
    noteY = write(ctx, unit, region.x, noteY, region.w, 14) + 4 * s.sy;
  }
  return { hero: null, skipMasks: true, chrome };
}

function layoutGrades(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const back = ctx.units.find((unit) => unit.interactive && unit.text === "返回");
  const go = ctx.units.find((unit) => unit.interactive && unit.text.includes("选好了"));
  const title = ctx.units.find((unit) => unit.text.includes("先选年级") || unit.text.includes("选年级"));
  if (back && back !== go) place(back, s.box(56, 18, 100, 44), 16);
  if (title) {
    ink(title);
    place(title, s.box(168, 18, 180, 32), 20);
  }
  chrome.push({ frame: "panel_wood", box: s.box(160, 14, 180, 44) });
  const grades = ["三年级", "四年级", "五年级", "六年级"].map((label) => ctx.units.find((unit) => unit.interactive && unit.text === label));
  grades.forEach((chip, index) => {
    if (!chip) return;
    place(chip, s.box(150 + index * 132, 140, 120, 52), 18);
  });
  if (go) place(go, s.box(250, 248, 240, 52), 16);
  const back2 = ctx.units.find((unit) => unit.interactive && unit.text === "返回" && unit !== back);
  if (back2) place(back2, s.box(506, 248, 120, 52), 16);
  else if (back && go && back.y < 80) {
    /* top back already placed */
  }
  let y = s.box(0, 78, 0, 0).y;
  for (const unit of ctx.units.filter((item) => !item.onPaper && !item.interactive && item.text.trim()).sort((a, b) => a.designY - b.designY)) {
    ink(unit, unit.text.includes("已选") ? "#1F6F64" : "#46363A");
    const width = textWidth(ctx, unit.text, 14);
    unit.fontPx = 14;
    ctx.fitText(unit, Math.min(s.box(0, 0, 520, 0).w, Math.max(width, 40)));
    unit.x = (ctx.view.w - unit.w) / 2;
    unit.y = unit.text.includes("已选") ? s.box(0, 320, 0, 0).y : y;
    unit.onPaper = true;
    if (!unit.text.includes("已选")) y += unit.h + 6 * s.sy;
  }
  return { hero: null, skipMasks: true, chrome };
}

const CARD_SHORT: Record<string, string> = {
  战士: "攻击和格挡更强",
  法师: "技能伤害更高",
  游侠: "答对能量来得快",
  治愈师: "治疗更强",
  探险家: "能先看到下一题",
};

function lockLines(text: string): string[] {
  if (text === "打败期末大 Boss 后解锁") return ["打败期末大 Boss", "后解锁"];
  const at = text.lastIndexOf(" ");
  if (at > 0) return [text.slice(0, at), text.slice(at + 1)];
  return [text];
}

function layoutCreate(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const captions: PhoneCaption[] = [];
  for (const node of walk(ctx.scene)) {
    const key = (node as GameNode & { texture?: string }).texture ?? "";
    if (key.startsWith("cls:") && !key.includes("portrait")) node.visible = false;
  }
  const back = ctx.units.find((unit) => unit.interactive && unit.text.startsWith("返回"));
  const sign = ctx.units.find((unit) => unit.text.includes("选一个职业"));
  const retry = ctx.units.find((unit) => unit.interactive && unit.text.includes("重选年级"));
  const go = ctx.units.find((unit) => unit.interactive && (unit.text === "出发" || unit.node.name === "name:go"));
  const name = ctx.units.find((unit) => unit.node.name === "name:field" || unit.text === "给角色起个名字");
  if (back) {
    const box = s.box(56, 16, 96, 48);
    face(back, FONT_TITLE, INK, "");
    place(back, box, 16, true);
    chrome.push({ frame: "btn_secondary_normal", box });
  }
  chrome.push({ frame: "panel_wood", box: s.box(160, 16, 170, 48) });
  if (sign) {
    face(sign, FONT_TITLE, INK, "");
    place(sign, s.box(160, 16, 170, 48), 20, true);
  }
  const cards = ctx.units.filter((unit) => unit.interactive && !unit.text.trim() && unit.design.w >= 80 && unit.design.w < 400).sort((a, b) => a.designY - b.designY || a.designX - b.designX);
  const sheets = walk(ctx.scene).filter((node) => /portrait/i.test(String((node as GameNode & { texture?: string }).texture ?? "")));
  let selectedX = cards[0]?.node.x ?? 0;
  for (const node of walk(ctx.scene)) {
    if (node.type === "rectangle" && Number(node.data.get("strokeWidth") || 0) >= 6) selectedX = node.x;
  }
  const portraits: PhonePortrait[] = [];
  const rings: Array<{ x: number; y: number; w: number; h: number }> = [];
  let previewName = "";
  let previewBlurb: PhoneUnit | undefined;
  let previewTalent: PhoneUnit | undefined;
  let previewStarter = "";
  let previewSheet: GameNode | null = null;
  const textsOn = (card: PhoneUnit) => ctx.units.filter((unit) => {
    if (unit.interactive || !unit.text.trim() || unit === sign || unit === name) return false;
    if (/选一个职业|已选年级|重选年级|给角色起个名字|给家长/.test(unit.text)) return false;
    const cx = unit.design.x + unit.design.w / 2;
    const cy = unit.design.y + unit.design.h / 2;
    return cx >= card.design.x - 8 && cx <= card.design.x + card.design.w + 8 && cy >= card.design.y - 12 && cy <= card.design.y + card.design.h + 12;
  });
  const isLockedCard = (card: PhoneUnit) => textsOn(card).some((unit) => unit.text.includes("后解锁") || unit.text.includes("打败期末") || unit.text === "藏起来的职业");
  // Accepted board: five open classes in order, locked class in the last cell (bottom right).
  const ordered = [...cards.filter((card) => !isLockedCard(card)), ...cards.filter((card) => isLockedCard(card))];
  ordered.forEach((card, index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const box = s.box(56 + col * 160, 72 + row * 136, 152, 128);
    place(card, box, 0);
    chrome.push({ frame: "panel_parchment", box });
    const texts = textsOn(card).sort((a, b) => a.designY - b.designY);
    const starter = texts.find((unit) => unit.text.startsWith("起始卡"));
    const blurb = texts.find((unit) => unit !== starter && /。/.test(unit.text));
    const lock = texts.find((unit) => unit.text.includes("后解锁") || unit.text.includes("打败期末"));
    const title = texts.find((unit) => unit !== starter && unit !== blurb && unit !== lock && (unit.text in CARD_SHORT || unit.text === "藏起来的职业" || unit.text.length <= 4));
    const talent = texts.find((unit) => unit !== starter && unit !== blurb && unit !== lock && unit !== title);
    const locked = Boolean(lock) || title?.text === "藏起来的职业";
    const selected = Math.abs(card.node.x - selectedX) < 80;
    if (title) {
      face(title, FONT_TITLE, INK, "");
      place(title, { x: box.x, y: box.y + (locked ? 56 : 64) * s.sy, w: box.w, h: 18 * s.sy }, 15, true);
    }
    if (locked && lock) {
      const lines = lockLines(lock.text);
      face(lock, FONT_BODY, MUTED, "500");
      place(lock, { x: box.x + 8 * s.sx, y: box.y + 78 * s.sy, w: box.w - 16 * s.sx, h: 36 * s.sy }, 14, true);
      lock.lines = lines;
      const styled = lock.node as GameNode & { style?: { lineSpacing?: number } };
      if (styled.style) styled.style.lineSpacing = 4;
      captions.push({ text: "？", x: box.x, y: box.y + 12 * s.sy, w: box.w, h: 28 * s.sy, color: NOTE, font: 28, family: FONT_TITLE, weight: "" });
      for (const extra of texts) if (extra !== title && extra !== lock) hide(extra);
    } else {
      const short = title ? CARD_SHORT[title.text] : undefined;
      if (short) {
        captions.push({ text: short, x: box.x, y: box.y + 84 * s.sy, w: box.w, h: 16 * s.sy, color: MUTED, font: 14, family: FONT_BODY, weight: "500" });
      }
      if (starter) {
        face(starter, FONT_BODY, TEAL, "600");
        place(starter, { x: box.x, y: box.y + 102 * s.sy, w: box.w, h: 16 * s.sy }, 14, true);
      }
      const sheet = sheets.find((node) => Math.abs(node.x - card.node.x) < 80 && !/locked/i.test(String((node as GameNode & { texture?: string }).texture ?? "")));
      if (sheet) portraits.push({ node: sheet, box: { x: box.x + 44 * s.sx, y: box.y + 6 * s.sy, w: 64 * s.sx, h: 54 * s.sy } });
      if (selected) {
        rings.push(box);
        previewName = title?.text ?? "";
        previewBlurb = blurb;
        previewTalent = talent;
        previewStarter = starter?.text ?? "";
        previewSheet = sheet ?? null;
      } else {
        if (blurb) hide(blurb);
        if (talent) hide(talent);
      }
      for (const extra of texts) {
        if (extra === title || extra === starter || extra === blurb || extra === talent) continue;
        hide(extra);
      }
    }
  });
  const preview = s.box(540, 16, 248, 204);
  chrome.push({ frame: "panel_parchment", box: preview });
  if (previewName) {
    captions.push({ text: previewName, x: preview.x, y: preview.y + 14 * s.sy, w: preview.w, h: 22 * s.sy, color: INK, font: 18, family: FONT_TITLE, weight: "" });
  }
  if (previewSheet) portraits.push({ node: previewSheet, box: s.box(616, 46, 96, 102) });
  const longLines = [previewBlurb, previewTalent].filter((unit): unit is PhoneUnit => Boolean(unit));
  longLines.forEach((unit, index) => {
    face(unit, FONT_BODY, INK, "500");
    unit.lines = [unit.text];
    unit.fontPx = 14;
    unit.label = undefined;
    unit.x = s.box(564, 0, 0, 0).x;
    unit.y = s.box(0, 156 + index * 18, 0, 0).y;
    unit.w = Math.max(14, Math.ceil(inkWidth(ctx, unit.text, 14, "500", FONT_BODY)) + 2);
    unit.h = 16 * s.sy;
    unit.onPaper = true;
  });
  if (previewStarter) {
    const width = Math.max(14, Math.ceil(inkWidth(ctx, previewStarter, 14, "600", FONT_BODY)) + 2);
    captions.push({
      text: previewStarter,
      x: s.box(564, 0, 0, 0).x,
      y: s.box(0, 156 + longLines.length * 18, 0, 0).y,
      w: width,
      h: 16 * s.sy,
      color: TEAL,
      font: 14,
      family: FONT_BODY,
      weight: "600",
    });
  }
  const grade = ctx.units.find((unit) => !unit.interactive && unit.text.includes("已选年级"));
  const gradeNote = ctx.units.find((unit) => !unit.interactive && unit.text.includes("给家长"));
  if (grade) {
    grade.lines = [grade.text];
    face(grade, FONT_BODY, TEAL, "500");
    pinLine(ctx, grade, s.box(340, 0, 0, 0).x, s.box(0, 28, 0, 0).y, 14);
  }
  if (gradeNote) {
    gradeNote.lines = [gradeNote.text];
    face(gradeNote, FONT_BODY, MUTED, "500");
    pinLine(ctx, gradeNote, s.box(340, 0, 0, 0).x, s.box(0, 50, 0, 0).y, 14);
  }
  captions.push({
    text: "名字",
    x: s.box(540, 0, 0, 0).x,
    y: s.box(0, 224, 0, 0).y,
    w: Math.ceil(inkWidth(ctx, "名字", 14, "600", FONT_BODY)) + 2,
    h: 16 * s.sy,
    color: INK,
    font: 14,
    family: FONT_BODY,
    weight: "600",
  });
  if (name) {
    const field = s.box(540, 242, 248, 48);
    chrome.push({ frame: "input_normal", box: field });
    const placeholder = name.text === "给角色起个名字";
    face(name, FONT_BODY, placeholder ? "#766758" : INK, "500");
    name.fontPx = 14;
    name.lines = [name.text];
    name.x = field.x + 16 * s.sx;
    name.y = field.y + (field.h - 16 * s.sy) / 2;
    name.w = Math.max(14, field.w - 28 * s.sx);
    name.h = 16 * s.sy;
    name.onPaper = true;
    name.label = undefined;
  }
  if (go) {
    const box = s.box(540, 306, 118, 48);
    face(go, FONT_TITLE, INK, "");
    place(go, box, 18, true);
    chrome.push({ frame: "btn_primary_normal", box });
  }
  if (retry) {
    const box = s.box(666, 306, 122, 48);
    face(retry, FONT_TITLE, INK, "");
    place(retry, box, 16, true);
    chrome.push({ frame: "btn_secondary_normal", box });
  }
  for (const unit of ctx.units) {
    if (unit.onPaper || unit.interactive || !unit.text.trim()) continue;
    hide(unit);
  }
  return { hero: null, skipMasks: true, chrome, captions, portraits, skipSheets: sheets, rings };
}

function walk(scene: PhoneContext["scene"]): GameNode[] {
  const out: GameNode[] = [];
  const visit = (node: GameNode) => {
    out.push(node);
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
  return out;
}

function labelExamHits(ctx: PhoneContext): void {
  for (const unit of ctx.units) {
    if (!unit.interactive || unit.text.trim()) continue;
    const frame = String((unit.node as GameNode & { frame?: string }).frame ?? "");
    if (frame.includes("exam_mid")) {
      unit.text = "期中挑战";
      unit.lines = ["期中挑战"];
    } else if (frame.includes("exam_final")) {
      unit.text = "期末大挑战";
      unit.lines = ["期末大挑战"];
    } else if (unit.node.type === "image" || unit.node.type === "sprite") hide(unit);
  }
}

function splitBanner(text: string): { unit: string; learned: string } {
  const at = text.indexOf("：");
  if (at > 0 && text.slice(at + 1).includes("已学")) return { unit: text.slice(0, at).trim(), learned: text.slice(at + 1).trim() };
  return { unit: text.trim(), learned: "" };
}

function statClauses(text: string): { lead: string; stats: string } {
  const parts = text.split(/\s{2,}/).map((part) => part.trim()).filter(Boolean);
  const leadIndex = parts.findIndex((part) => /学堂|真棒|学过|学完/.test(part));
  if (leadIndex < 0) return { lead: "", stats: parts.join("  ·  ") };
  const lead = parts[leadIndex] ?? "";
  const stats = parts.filter((_, index) => index !== leadIndex).join("  ·  ");
  return { lead, stats };
}

function layoutStages(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const banner = ctx.units.find((unit) => !unit.interactive && unit.text.includes("·") && /已学\s*\d+\//.test(unit.text));
  if (!banner) return layoutStagesLoose(ctx, chrome);
  return layoutStagesHud(ctx, chrome, banner);
}

/** Accepted crop slots for this 844 landscape map. Not a conversion of desktop NODE_AT. */
const STAGE_NODE_SLOTS: Array<[number, number, number, number]> = [
  [126, 226, 64, 64],
  [204, 196, 64, 64],
  [366, 86, 64, 64],
  [458, 120, 64, 64],
  [560, 148, 80, 80],
];

function stageNodeFrame(frame: string): boolean {
  if (!frame.startsWith("map_node_") || frame.includes("exam")) return false;
  return frame === "map_node_current" || frame === "map_node_locked" || frame === "map_node_cleared" || frame.startsWith("map_node_boss");
}

/** One line at the spec origin. A live line that is wider wraps inside the board and stays at least 14. */
function seatLine(ctx: PhoneContext, unit: PhoneUnit, x: number, originY: number, size: number, maxW: number): void {
  const sample = unit.lines[0] || unit.text;
  const width = ctx.measure ? ctx.measure(sample, size, unit.weight, unit.family) : textWidth(ctx, sample, size);
  if (width <= maxW + 0.5) {
    pinLine(ctx, unit, x, originY, size);
    return;
  }
  unit.fontPx = Math.max(14, size);
  ctx.fitText(unit, Math.max(14, maxW));
  unit.x = x;
  unit.y = originY - size / 2;
  unit.onPaper = true;
}

function placeStageNodes(ctx: PhoneContext, s: ReturnType<typeof scaler>, open: boolean): void {
  const images = ctx.images.filter((image) => stageNodeFrame(frameOf(image)));
  images.forEach((image, index) => {
    const slot = STAGE_NODE_SLOTS[index];
    if (!slot) return;
    const box = s.box(slot[0], slot[1], slot[2], slot[3]);
    placeImage(image, box);
    const unit = ctx.units.find((item) => item.node === image.node);
    if (!unit) return;
    unit.x = box.x;
    unit.y = box.y;
    unit.w = box.w;
    unit.h = box.h;
    unit.onPaper = true;
    unit.fontPx = 0;
    unit.lines = [];
    // Expanded board covers nodes 3 and 4. Their hits stay quiet so the board can be read.
    if (open && (index === 2 || index === 3)) unit.interactive = false;
  });
}

/**
 * 原来：第一眼把整章统计和本关句子堆在 360×276 的左牌里，右边再空一块羊皮纸。
 * 现在：第一眼只留这一关。整章统计在「本章详情」展开后的右牌上。空右牌收掉。
 * 为什么：方案甲先看这一关。句子用存档里的原文和活数字，不改写，不把示例 3/7、7/7 写死。
 */
function layoutStagesHud(ctx: PhoneContext, chrome: PhoneChrome[], banner: PhoneUnit): PhoneLayout {
  const s = scaler(ctx.view);
  const padX = 8 * s.sx;
  const padY = 8 * s.sy;
  const open = (ctx.scene as { __mapChapterDetail?: boolean }).__mapChapterDetail === true;
  pushSheet(chrome, s.box(56, 16, 300, 170), padX, padY);
  if (open) pushSheet(chrome, s.box(364, 16, 320, 176), padX, padY);
  chrome.push({ frame: "panel_wood", box: s.box(56, 300, 732, 64), sourceHalf: true });
  const back = ctx.units.find((unit) => unit.interactive && (unit.text.startsWith("回村子") || unit.text.startsWith("返回")));
  if (back) place(back, s.box(72, 28, 120, 48), 16);
  const detailButton = ctx.units.find((unit) => unit.interactive && unit.text === "本章详情");
  if (detailButton) {
    const box = s.box(200, 28, 136, 48);
    face(detailButton, HUD_TITLE, HUD_INK, "");
    place(detailButton, box, 16, true);
    chrome.push({ frame: open ? "btn_secondary_pressed" : "btn_secondary_normal", box });
  }
  const bar: Array<[string, number, number]> = [
    ["上一章", 64, 154],
    ["下一章", 226, 154],
    ["去学堂", 388, 170],
    ["小战斗", 566, 214],
    ["再战", 566, 214],
  ];
  const placedBar = new Set<PhoneUnit>();
  for (const [label, x, width] of bar) {
    const unit = ctx.units.find((item) => item.interactive && item.text === label && !placedBar.has(item));
    if (!unit) continue;
    placedBar.add(unit);
    place(unit, s.box(x, 308, width, 48), 16);
  }
  const texts = ctx.units.filter((unit) => !unit.interactive && unit.text.trim());
  const duplicate = texts.find((unit) => unit !== banner && banner.text.includes(`· ${unit.text}：`));
  if (duplicate) hide(duplicate);
  for (const unit of texts) {
    if (unit.text.trim() === "?") hide(unit);
  }
  const captions: PhoneCaption[] = [];
  const textX = s.box(80, 0, 0, 0).x;
  const glanceMax = s.box(0, 0, 260, 0).w;
  const parts = splitBanner(banner.text);
  castLine(banner, parts.unit, HUD_BODY, 15, "600", HUD_INK);
  seatLine(ctx, banner, textX, s.box(0, 92, 0, 0).y, 15, glanceMax);
  const detail = texts.find((unit) => unit !== banner && !unit.onPaper && (unit.text.includes("熟练") || unit.text.includes("关通过") || unit.text.includes("没在学堂") || unit.text.includes("真棒")));
  const index = texts.find((unit) => !unit.onPaper && /第\s*\d+\s*\/\s*\d+\s*章/.test(unit.text));
  const stageName = texts.find((unit) => !unit.onPaper && unit !== duplicate && unit !== detail && unit !== index && unit.family.includes("ZCOOL") && unit.text.length <= 12);
  const status = texts.find((unit) => !unit.onPaper && unit !== stageName && /^(进行中|未开启|可挑战|已通过|已学完)$/.test(unit.text));
  const learned = texts.find((unit) => !unit.onPaper && unit !== detail && /^(本关|本章)已学/.test(unit.text));
  const wins = texts.find((unit) => !unit.onPaper && unit.text.includes("小战斗") && unit.text.includes("胜"));
  const hint = texts.find((unit) => !unit.onPaper && unit !== wins && (unit.text.includes("可以去学堂") || unit.text.includes("没有要学的新词") || (unit.text.includes("赢") && unit.text.includes("小战斗"))));
  if (stageName && stageName !== banner) {
    castLine(stageName, stageName.text, HUD_TITLE, 18, "", HUD_INK);
    seatLine(ctx, stageName, textX, s.box(0, 114, 0, 0).y, 18, glanceMax);
    if (status) {
      const stageWidth = ctx.measure ? ctx.measure(stageName.text, 18, "", HUD_TITLE) : textWidth(ctx, stageName.text, 18);
      castLine(status, status.text, HUD_BODY, 14, "600", HUD_TEAL);
      pinLine(ctx, status, textX + stageWidth + 12 * s.sx, s.box(0, 114, 0, 0).y, 14);
    }
  } else if (status) {
    castLine(status, status.text, HUD_BODY, 14, "600", HUD_TEAL);
    pinLine(ctx, status, textX, s.box(0, 114, 0, 0).y, 14);
  }
  if (learned) {
    castLine(learned, learned.text, HUD_BODY, 14, "600", HUD_TEAL);
    seatLine(ctx, learned, textX, s.box(0, 136, 0, 0).y, 14, glanceMax);
  }
  if (hint) {
    castLine(hint, hint.text, HUD_BODY, 14, "500", HUD_MUTED);
    seatLine(ctx, hint, textX, s.box(0, 156, 0, 0).y, 14, glanceMax);
  }
  const detailX = s.box(388, 0, 0, 0).x;
  const detailMax = s.box(0, 0, 280, 0).w;
  if (open) {
    if (parts.learned) captions.push(captionLine(ctx, parts.learned, detailX, s.box(0, 44, 0, 0).y, 14, HUD_TEAL, HUD_BODY, "600"));
    if (detail) {
      const stats = statClauses(detail.text);
      if (stats.lead && stats.stats) {
        castLine(detail, stats.lead, HUD_BODY, 14, "500", HUD_INK);
        seatLine(ctx, detail, detailX, s.box(0, 66, 0, 0).y, 14, detailMax);
        captions.push(captionLine(ctx, stats.stats, detailX, s.box(0, 88, 0, 0).y, 14, HUD_MUTED, HUD_BODY, "500"));
      } else if (stats.lead) {
        castLine(detail, stats.lead, HUD_BODY, 14, "500", HUD_INK);
        seatLine(ctx, detail, detailX, s.box(0, 66, 0, 0).y, 14, detailMax);
      } else if (stats.stats) {
        castLine(detail, stats.stats, HUD_BODY, 14, "500", HUD_MUTED);
        seatLine(ctx, detail, detailX, s.box(0, 88, 0, 0).y, 14, detailMax);
      } else hide(detail);
    }
    if (index) {
      castLine(index, index.text, HUD_BODY, 14, "500", HUD_MUTED);
      seatLine(ctx, index, detailX, s.box(0, 110, 0, 0).y, 14, detailMax);
    }
    if (wins) {
      castLine(wins, wins.text, HUD_BODY, 14, "500", HUD_INK);
      seatLine(ctx, wins, detailX, s.box(0, 132, 0, 0).y, 14, detailMax);
    }
  } else {
    if (detail) hide(detail);
    if (index) hide(index);
    if (wins) hide(wins);
  }
  placeStageNodes(ctx, s, open);
  for (const unit of texts) {
    if (unit.onPaper || !unit.text.trim()) continue;
    hide(unit);
  }
  for (const unit of ctx.units) {
    if (!unit.interactive || unit.onPaper || !unit.text.trim()) continue;
    hide(unit);
  }
  return { hero: null, skipMasks: true, chrome, captions };
}

function layoutStagesLoose(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  for (const unit of ctx.units) {
    if (unit.text.trim() === "?" || unit.text === "本章详情") hide(unit);
  }
  const back = ctx.units.find((unit) => unit.interactive && (unit.text.startsWith("回村子") || unit.text.startsWith("返回")));
  if (back) place(back, s.box(68, 28, Math.max(100, textWidth(ctx, back.text, 16) + 28), 44), 16);
  chrome.push({ frame: "panel_parchment", box: s.box(56, 16, 360, 260) });
  chrome.push({ frame: "panel_parchment", box: s.box(428, 16, 360, 260) });
  const bar = ["上一章", "下一章", "去学堂", "再战", "小战斗", "期中挑战", "期末大挑战"];
  let x = s.box(64, 0, 0, 0).x;
  const y = s.box(0, 312, 0, 0).y;
  const h = s.box(0, 0, 0, 48).h;
  chrome.push({ frame: "panel_wood", box: s.box(56, 300, 732, 64) });
  for (const label of bar) {
    const unit = ctx.units.find((item) => item.interactive && item.text === label);
    if (!unit) continue;
    const exam = label === "期中挑战" || label === "期末大挑战";
    const width = exam ? s.box(0, 0, 148, 0).w : s.box(0, 0, 108, 0).w;
    place(unit, { x, y, w: width, h }, 16, exam);
    if (exam) chrome.push({ frame: "btn_primary_normal", box: { x: unit.x, y: unit.y, w: unit.w, h: unit.h } });
    x += width + 8 * s.sx;
  }
  let extraX = s.box(430, 0, 0, 0).x;
  const extraY = s.box(0, 248, 0, 0).y;
  for (const unit of ctx.units.filter((item) => item.interactive && !item.onPaper && item.text.trim())) {
    const width = Math.max(s.box(0, 0, 96, 0).w, Math.min(s.box(0, 0, 140, 0).w, textWidth(ctx, unit.text, 14) + 24 * s.sx));
    if (extraX + width > ctx.view.w - 8) break;
    place(unit, { x: extraX, y: extraY, w: width, h: s.box(0, 0, 0, 44).h }, 14);
    extraX += width + 8 * s.sx;
  }
  const words = ctx.units.filter((unit) => !unit.onPaper && !unit.interactive && unit.node.name !== "stage:gloss" && /^[A-Za-z][A-Za-z' -]*$/.test(unit.text));
  const glosses = ctx.units.filter((unit) => unit.node.name === "stage:gloss");
  const usedGloss = new Set<PhoneUnit>();
  let wordY = s.box(0, 28, 0, 0).y;
  const wordLimit = s.box(0, 250, 0, 0).y;
  for (const word of words) {
    if (wordY > wordLimit) {
      hide(word);
      continue;
    }
    ink(word);
    place(word, { x: s.box(444, 0, 0, 0).x, y: wordY, w: s.box(0, 0, 120, 0).w, h: s.box(0, 0, 0, 20).h }, 14);
    const gloss = glosses.find((item) => !usedGloss.has(item) && String(item.node.data.get("en") || "") === word.text.toLowerCase());
    if (gloss) {
      usedGloss.add(gloss);
      ink(gloss, "#46363A");
      place(gloss, { x: s.box(570, 0, 0, 0).x, y: wordY, w: s.box(0, 0, 190, 0).w, h: s.box(0, 0, 0, 20).h }, 14);
    }
    wordY += s.box(0, 0, 0, 22).h;
  }
  for (const gloss of glosses) if (!usedGloss.has(gloss)) hide(gloss);
  let yText = s.box(0, 78, 0, 0).y;
  for (const unit of ctx.units.filter((item) => !item.onPaper && !item.interactive && item.text.trim() && item.node.name !== "stage:gloss" && item.text.trim() !== "?").sort((a, b) => a.designY - b.designY)) {
    ink(unit, unit.text.includes("已通过") || unit.text.includes("已学") ? "#1F6F64" : "#3B2A20");
    yText = write(ctx, unit, s.box(76, 0, 0, 0).x, yText, s.box(0, 0, 320, 0).w, unit.text.length <= 8 ? 16 : 14) + 4 * s.sy;
  }
  return { hero: null, skipMasks: true, chrome };
}

function lifeReadout(scene: PhoneContext["scene"]): { asked: number | null; player: number | null; enemy: number | null } {
  const host = scene as {
    state?: { questionsAsked?: number; phase?: string; playerHp?: number; playerMaxHp?: number; enemyHp?: number; enemyMaxHp?: number };
    displayHp?: { playerHp?: number; enemyHp?: number };
  };
  const state = host.state;
  if (!state) return { asked: null, player: null, enemy: null };
  const asked = state.phase === "question" && typeof state.questionsAsked === "number" && Number.isFinite(state.questionsAsked) && state.questionsAsked >= 1
    ? state.questionsAsked
    : null;
  const ratio = (hp: number | undefined, max: number | undefined): number | null => {
    if (typeof hp !== "number" || typeof max !== "number" || !(max > 0) || !Number.isFinite(hp)) return null;
    return Math.max(0, Math.min(1, hp / max));
  };
  const playerHp = typeof host.displayHp?.playerHp === "number" ? host.displayHp.playerHp : state.playerHp;
  const enemyHp = typeof host.displayHp?.enemyHp === "number" ? host.displayHp.enemyHp : state.enemyHp;
  return { asked, player: ratio(playerHp, state.playerMaxHp), enemy: ratio(enemyHp, state.enemyMaxHp) };
}

function parkBar(bars: PhoneBar[], x: number, y: number, w: number, h: number, ratio: number | null, tone: PhoneBar["tone"], floorY: number): void {
  if (ratio == null || !(w > 8) || !(h > 4)) return;
  let top = y;
  if (top + h > floorY - 4) top = floorY - 4 - h;
  if (top < y - 1 || top < 8) return;
  bars.push({ x, y: top, w, h, ratio, tone });
}

function layoutBattle(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const actions = ["攻击", "格挡", "治疗"];
  const skillish = (text: string) => /★|基础招式|盾击|战吼|坚守|旋风斩/.test(text);
  const prompt = ctx.units.find((unit) => !unit.interactive && (unit.text.includes("意思") || unit.text.includes("？") || unit.text.includes("?") || unit.text.includes("怎么说")));
  const options = ctx.units.filter((unit) => unit.interactive && unit.text.trim() && !actions.includes(unit.text) && !skillish(unit.text) && !unit.text.startsWith("返回") && !unit.text.startsWith("回"));
  if (prompt && options.length) {
    chrome.push({ frame: "panel_parchment", box: s.box(56, 228, 732, 126) });
    ink(prompt);
    place(prompt, s.box(80, 240, 680, 28), 18);
    options.slice(0, 4).forEach((option, index) => {
      const box = s.box(76 + index * 176, 278, 160, 48);
      place(option, box, 16, true);
      chrome.push({ frame: "option_normal", box });
    });
  }
  const actionUnits = actions.map((label) => ctx.units.find((unit) => unit.interactive && unit.text === label)).filter((unit): unit is PhoneUnit => Boolean(unit));
  if (!prompt && actionUnits.length) {
    actionUnits.forEach((unit, index) => {
      const box = s.box(220 + index * 140, 300, 128, 48);
      place(unit, box, 18, true);
      chrome.push({ frame: index === 0 ? "btn_primary_normal" : "btn_secondary_normal", box });
    });
  }
  const leave = ctx.units.find((unit) => unit.interactive && (unit.text.startsWith("回") || unit.text.includes("再试") || unit.text.includes("结局")));
  if (leave) place(leave, s.box(56, 16, Math.max(100, textWidth(ctx, leave.text, 16) + 24), 44), 16);
  const hud = ctx.units.filter((unit) => !unit.onPaper && !unit.interactive && unit.text.trim());
  const life = lifeReadout(ctx.scene);
  if (prompt && life.asked != null) {
    const name = hud.find((unit) => unit.designX < 500 && unit.designY < 120 && unit.text.length <= 12 && !/[？?题]/.test(unit.text));
    if (name) {
      name.text = `${name.text} · 第${life.asked}题`;
      name.lines = [name.text];
    }
  }
  let leftY = s.box(0, 20, 0, 0).y;
  let rightY = leftY;
  for (const unit of hud.sort((a, b) => a.designY - b.designY)) {
    const top = unit.designY < 160 && unit.text.length <= 22 && !/效果|基础|★|答对/.test(unit.text);
    if (!top) {
      hide(unit);
      continue;
    }
    ink(unit);
    if (unit.designX > 700) rightY = write(ctx, unit, s.box(620, 0, 0, 0).x, rightY, s.box(0, 0, 110, 0).w, 14);
    else leftY = write(ctx, unit, s.box(72, 0, 0, 0).x, leftY, s.box(0, 0, 220, 0).w, 14);
  }
  const bars: PhoneBar[] = [];
  if (prompt) {
    const barH = 16 * s.sy;
    parkBar(bars, s.box(72, 0, 0, 0).x, leftY + 4 * s.sy, 168 * s.sx, barH, life.player, "teal", s.box(0, 68, 0, 0).y);
    parkBar(bars, s.box(620, 0, 0, 0).x, rightY + 4 * s.sy, 110 * s.sx, barH, life.enemy, "coral", s.box(0, 64, 0, 0).y);
  }
  const skills = ctx.units.filter((unit) => unit.interactive && !unit.onPaper && unit.text.trim());
  skills.slice(0, 3).forEach((unit, index) => place(unit, s.box(300 + index * 72, 148, 64, 52), 12));
  for (const unit of skills.slice(3)) hide(unit);
  for (const image of ctx.images) {
    const key = `${textureOf(image)} ${frameOf(image)}`;
    if (/monster|enemy|pawn|spirit/i.test(key) && !/card_frame_|skill_/.test(key)) placeImage(image, s.box(640, 64, 140, 140));
  }
  const foot = s.box(160, 200, 0, 0);
  return { hero: placeHero(ctx, foot.x, foot.y, 130 * s.sy), skipMasks: true, chrome, bars };
}

interface ResultsWord {
  english?: string;
  gloss?: string;
  correct?: boolean;
}

interface ResultsCard {
  id?: string;
  name?: string;
  from?: number;
  to?: number;
}

interface ResultsItem {
  id?: string;
  heading?: string;
  line?: string;
  atlas?: string;
  frame?: string;
}

interface ResultsView {
  won?: boolean;
  correct?: number;
  total?: number;
  words?: ResultsWord[];
  xpBefore?: number;
  xpAfter?: number;
  practiceOnly?: boolean;
  card?: ResultsCard | null;
  items?: ResultsItem[];
}

interface ResultsHost {
  view?: ResultsView;
  __resultsWordScroll?: number;
  __resultsWordMax?: number;
  __resultsWordClip?: Box;
  __resultsRewardScroll?: number;
  __resultsRewardMax?: number;
  __resultsRewardClip?: Box;
}

const FONT_TITLE = '"ZCOOL KuaiLe", "Noto Sans SC", sans-serif';
const FONT_BODY = '"Noto Sans SC", "WenQuanYi Micro Hei", sans-serif';
const FONT_LATIN = '"Nunito", "Noto Sans SC", sans-serif';
/** ZCOOL 「胜利！」 ink center is 275 units left of the advance center, and 21 units below the em center. upem 1000. */
const VICTORY_INK_LEFT_EM = 275 / 1000;
const VICTORY_INK_BELOW_EM = 21 / 1000;
const TEAL = "#1F6F64";
const INK = "#3B2A20";
const CREAM = "#FFF4DC";
const MUTED = "#46363A";
const WOOD = "#9A6B47";
const NOTE = "#61402D";
const LOSS_LINE = "打输了不会丢东西，放心再来！";

function resultsView(ctx: PhoneContext): ResultsView | null {
  const view = (ctx.scene as ResultsHost).view;
  if (!view || typeof view !== "object") return null;
  if (typeof view.won !== "boolean" && !Array.isArray(view.words)) return null;
  return view;
}

function wonBattle(ctx: PhoneContext): boolean {
  const view = resultsView(ctx);
  if (view && typeof view.won === "boolean") return view.won;
  return ctx.units.some((unit) => unit.text.includes("胜利") || unit.text.includes("打败了"));
}

function skillFrame(id: string): string {
  if (id.endsWith("-base") || id.startsWith("basic-")) return "skill_base";
  return `skill_${id.replaceAll("-", "_")}`;
}

function face(unit: PhoneUnit, family: string, color: string, weight = ""): void {
  unit.family = family;
  unit.weight = weight;
  const paint = (node: GameNode) => {
    const styled = node as GameNode & { style?: { fontFamily?: string; color?: string; fontStyle?: string } };
    if (!styled.style) styled.style = {};
    styled.style.fontFamily = family;
    styled.style.color = color;
    styled.style.fontStyle = weight;
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (!list) return;
    for (const child of list) paint(child);
  };
  paint(unit.node);
}

function characterSheets(scene: PhoneContext["scene"]): GameNode[] {
  const sheets: GameNode[] = [];
  const visit = (node: GameNode) => {
    const key = String((node as GameNode & { texture?: string }).texture ?? "");
    if (key.startsWith("cls:")) sheets.push(node);
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
  return sheets;
}

/**
 * 原来：胜利页把桌面的「答对 / 一共 / 经验 / 获得物品」再堆进一张小木牌。
 * 现在：按已采用的 v0.3 结算稿排横屏胜利页。分数、单词和奖励读这一场的结果。
 * 为什么：稿上的 5/5 和 flower 只是样子。坐标是稿面假设，不是实机安全区。
 */
function layoutVictory(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const view = resultsView(ctx);
  const host = ctx.scene as ResultsHost;
  for (const fill of ctx.fills) {
    fill.w = 0;
    fill.h = 0;
  }
  const board = s.box(56, 72, 732, 228);
  chrome.push({ frame: "panel_parchment", box: board });
  ctx.fills.push({
    x: 372 * s.sx,
    y: 116 * s.sy,
    w: Math.max(1, 2 * s.sx),
    h: 168 * s.sy,
    color: 0xd9c7a6,
    role: "sheet",
  });

  const cont = ctx.units.find((unit) => unit.interactive && (unit.text === "继续" || unit.text.includes("结局")));
  const academy = ctx.units.find((unit) => unit.interactive && unit !== cont && /学堂/.test(unit.text));
  const title = ctx.units.find((unit) => !unit.interactive && (unit.text.includes("胜利") || unit.text.includes("打败了")));
  const used = new Set<PhoneUnit>();
  if (title) used.add(title);
  if (cont) used.add(cont);
  if (academy) used.add(academy);
  const claim = (pred?: (unit: PhoneUnit) => boolean): PhoneUnit | null => {
    const found = ctx.units.find((unit) => !unit.interactive && !used.has(unit) && (!pred || pred(unit)));
    if (!found) return null;
    used.add(found);
    return found;
  };
  const widthOf = (text: string, font: number, weight: string, family: string): number => {
    if (ctx.measure) return Math.max(1, Math.ceil(ctx.measure(text, font, weight, family)));
    return Math.max(1, Math.ceil(textWidth(ctx, text, font)));
  };
  for (const unit of ctx.units) hide(unit);

  if (cont) {
    const box = s.box(628, 308, 160, 48);
    place(cont, box, 18 * s.sy, true);
    face(cont, FONT_TITLE, INK, "");
    chrome.push({ frame: "btn_primary_normal", box });
  }
  if (academy) {
    const font = 16 * s.sy;
    const width = Math.max(120 * s.sx, Math.min(200 * s.sx, widthOf(academy.text || "去学堂", font, "700", FONT_BODY) + 28 * s.sx));
    const box = { x: 628 * s.sx - 8 * s.sx - width, y: 308 * s.sy, w: width, h: 48 * s.sy };
    place(academy, box, font, true);
    face(academy, FONT_BODY, INK, "700");
    chrome.push({ frame: "btn_secondary_normal", box });
  }

  const floats: PhoneImage[] = [];
  const take = (pred: (image: PhoneImage) => boolean): PhoneImage | null => {
    const index = ctx.images.findIndex(pred);
    if (index < 0) return null;
    const [image] = ctx.images.splice(index, 1);
    return image ?? null;
  };
  const floatAt = (image: PhoneImage | null, box: Box) => {
    if (!image) return;
    placeImage(image, box);
    floats.push(image);
  };
  const banner = take((image) => frameOf(image) === "result_banner" || frameOf(image) === "result_banner_boss");
  const bossBanner = banner ? frameOf(banner) === "result_banner_boss" : false;
  const bannerBox = bossBanner ? s.box(122, 12, 600, 99) : s.box(162, 20, 520, 82);
  floatAt(banner, bannerBox);

  if (title) {
    const victoryMark = title.text === "胜利！";
    const font = (victoryMark ? 28 : 22) * s.sy;
    const plaqueCx = victoryMark ? 421.75 * s.sx : bannerBox.x + bannerBox.w / 2;
    const plaqueCy = victoryMark ? 58.25 * s.sy : bannerBox.y + bannerBox.h * 0.46;
    const typoCx = plaqueCx + (victoryMark ? VICTORY_INK_LEFT_EM * font : 0);
    const typoCy = plaqueCy - (victoryMark ? VICTORY_INK_BELOW_EM * font : 0);
    const textW = widthOf(title.text, font, "", FONT_TITLE) + 2;
    place(title, { x: typoCx - textW / 2, y: typoCy - font / 2, w: textW, h: font }, font, true);
    face(title, FONT_TITLE, CREAM, "");
  }

  const correct = typeof view?.correct === "number" ? view.correct : null;
  const total = typeof view?.total === "number" ? view.total : null;
  const scoreText = correct !== null && total !== null ? `${correct}/${total}` : "";
  const scoreUnit = claim((unit) => /答对/.test(unit.text)) ?? (scoreText ? claim() : null);
  claim((unit) => /一共/.test(unit.text));
  const scoreBox = s.box(88, 110, 36, 36);
  floatAt(take((image) => textureOf(image) === "results_ico_score"), scoreBox);
  if (scoreUnit && scoreText) {
    const font = 22 * s.sy;
    scoreUnit.text = scoreText;
    const textW = widthOf(scoreText, font, "700", FONT_LATIN);
    place(scoreUnit, { x: scoreBox.x + scoreBox.w + 8 * s.sx, y: scoreBox.y + (scoreBox.h - font) / 2, w: textW + 2, h: font }, font);
    face(scoreUnit, FONT_LATIN, TEAL, "700");
  }

  const words = (view?.words ?? []).filter((word) => word.english).map((word) => ({
    en: String(word.english),
    zh: word.gloss ? String(word.gloss) : "",
  }));
  const heading = words.length ? claim((unit) => unit.text.includes("本场单词")) ?? claim() : null;
  if (heading) {
    const font = 16 * s.sy;
    heading.text = "本场单词";
    const textW = widthOf(heading.text, font, "700", FONT_BODY);
    place(heading, { x: 88 * s.sx, y: 147 * s.sy, w: textW + 2, h: font }, font);
    face(heading, FONT_BODY, INK, "700");
  }

  const rowFont = 15 * s.sy;
  const pitch = 23 * s.sy;
  const clip: Box = { x: 72 * s.sx, y: 171 * s.sy, w: 290 * s.sx, h: 117 * s.sy };
  const maxScroll = Math.max(0, words.length * pitch - clip.h);
  const scroll = Math.max(0, Math.min(maxScroll, host.__resultsWordScroll || 0));
  host.__resultsWordScroll = scroll;
  host.__resultsWordMax = maxScroll;
  host.__resultsWordClip = maxScroll > 0 ? clip : undefined;
  words.forEach((word, index) => {
    const y = clip.y + index * pitch - scroll;
    const enUnit = claim((unit) => unit.text === word.en) ?? claim();
    const zhUnit = word.zh ? claim((unit) => unit.text === word.zh) ?? claim() : null;
    const visible = y >= clip.y - 0.5 && y + rowFont <= clip.y + clip.h + 0.5;
    if (!visible) return;
    const enW = Math.min(140 * s.sx, widthOf(word.en, rowFont, "700", FONT_LATIN));
    const zhW = word.zh ? Math.min(108 * s.sx, widthOf(word.zh, rowFont, "", FONT_BODY)) : 0;
    const enX = 88 * s.sx;
    let zhX = 348 * s.sx - zhW;
    if (word.zh && zhX < enX + enW + 8 * s.sx) zhX = enX + enW + 8 * s.sx;
    if (enUnit) {
      enUnit.text = word.en;
      place(enUnit, { x: enX, y, w: Math.max(enW, 8), h: rowFont }, rowFont);
      face(enUnit, FONT_LATIN, INK, "700");
      enUnit.clip = clip;
    }
    if (zhUnit && word.zh) {
      zhUnit.text = word.zh;
      place(zhUnit, { x: zhX, y, w: Math.max(zhW, 8), h: rowFont }, rowFont);
      face(zhUnit, FONT_BODY, INK, "");
      zhUnit.clip = clip;
    }
  });

  interface RewardRow {
    id: string;
    label: string;
    image: PhoneImage | null;
  }
  const rows: RewardRow[] = [];
  const seen = new Set<string>();
  const addRow = (row: RewardRow) => {
    if (!row.label || seen.has(row.id)) return;
    seen.add(row.id);
    rows.push(row);
  };
  if (view && typeof view.xpBefore === "number" && typeof view.xpAfter === "number") {
    const delta = Math.round(view.xpAfter - view.xpBefore);
    if (delta > 0) addRow({ id: "xp", label: `+${delta}`, image: take((image) => textureOf(image) === "results_ico_xp") });
  } else if (view && !view.practiceOnly) {
    addRow({ id: "xp", label: "+经验", image: take((image) => textureOf(image) === "results_ico_xp") });
  }
  const items = view?.items ?? [];
  const labelOf = (item: ResultsItem): string => {
    if (item.id === "forest-cape" || item.frame === "thumb_outfit_forest_cape") return "林间斗篷";
    if (item.atlas === "atlas_skills") {
      const name = (item.line || "").trim();
      if (!name || /新技能|获得|升级|已经穿上|经验/.test(name)) return "";
      return name.includes("★") ? name : `${name} ★1`;
    }
    const named = (item.heading || "").includes("·") ? (item.heading || "").split("·").pop()?.trim() || "" : "";
    if (!named || /新外观|新称号|获得|已经穿上|升级|经验/.test(named)) return "";
    return named;
  };
  for (const item of items) {
    if (item.id !== "forest-cape" && item.frame !== "thumb_outfit_forest_cape") continue;
    addRow({
      id: "forest-cape",
      label: "林间斗篷",
      image: take((image) => frameOf(image) === (item.frame || "thumb_outfit_forest_cape")),
    });
  }
  for (const item of items) {
    if (item.atlas === "atlas_skills" || item.id === "forest-cape" || item.frame === "thumb_outfit_forest_cape") continue;
    addRow({
      id: item.id || item.frame || labelOf(item),
      label: labelOf(item),
      image: item.frame ? take((image) => frameOf(image) === item.frame && (!item.atlas || textureOf(image) === item.atlas)) : null,
    });
  }
  if (view?.card?.name) {
    const card = view.card;
    const from = Math.round(card.from ?? 1);
    const to = Math.round(card.to ?? from);
    addRow({
      id: card.id || card.name,
      label: `${card.name} ★${from}→★${to}`,
      image: card.id ? take((image) => frameOf(image) === skillFrame(card.id || "") && textureOf(image) === "atlas_skills") : null,
    });
  }
  for (const item of items) {
    if (item.atlas !== "atlas_skills") continue;
    addRow({
      id: item.id || item.frame || item.line || "",
      label: labelOf(item),
      image: item.frame ? take((image) => frameOf(image) === item.frame && textureOf(image) === "atlas_skills") : null,
    });
  }

  // 原来：五行 36px 奖励把行距压到大约 2px，才能塞进右栏。
  // 现在：多于一行时行距固定 8px。放不下就在羊皮纸里滚动，裁切和左侧单词列一样。
  // 为什么：2px 读不清。不能画出板外，也不能盖住继续、无字印章和胶囊。
  const icon = 36 * s.sy;
  const gap = rows.length <= 1 ? 0 : 8 * s.sy;
  const iconTop = 110 * s.sy;
  const column: Box = {
    x: 380 * s.sx,
    y: iconTop,
    w: Math.max(1, (772 - 380) * s.sx),
    h: Math.max(1, 292 * s.sy - iconTop),
  };
  const content = rows.length * icon + Math.max(0, rows.length - 1) * gap;
  const rewardMax = Math.max(0, content - column.h);
  const rewardScroll = Math.max(0, Math.min(rewardMax, host.__resultsRewardScroll || 0));
  host.__resultsRewardScroll = rewardScroll;
  host.__resultsRewardMax = rewardMax;
  host.__resultsRewardClip = rewardMax > 0 ? column : undefined;
  const scrolling = rewardMax > 0;
  const hitsColumn = (top: number, height: number) => top + height > column.y + 0.5 && top < column.y + column.h - 0.5;
  const fitsColumn = (top: number, height: number) => top >= column.y - 0.5 && top + height <= column.y + column.h + 0.5;
  rows.forEach((row, index) => {
    const y = iconTop + index * (icon + gap) - rewardScroll;
    const iconBox = { x: 396 * s.sx, y, w: icon, h: icon };
    const font = 15 * s.sy;
    const textY = y + (icon - font) / 2;
    const iconHits = !scrolling || hitsColumn(y, icon);
    // 整字才画，和左侧单词列一样。半截「+20」会读成别的字。
    const textFits = !scrolling || fitsColumn(textY, font);
    if (!iconHits && !textFits) return;
    if (row.image && iconHits) {
      if (scrolling) row.image.clip = column;
      floatAt(row.image, iconBox);
    }
    if (!textFits) return;
    const label = claim();
    if (!label) return;
    label.text = row.label;
    const textW = Math.min(300 * s.sx, widthOf(row.label, font, "700", FONT_BODY));
    place(label, { x: iconBox.x + iconBox.w + 8 * s.sx, y: textY, w: textW + 2, h: font }, font);
    face(label, FONT_BODY, TEAL, "700");
    if (scrolling) label.clip = column;
  });

  floatAt(take((image) => textureOf(image) === "results_ico_stamp"), s.box(744, 80, 28, 28));
  return { hero: null, skipMasks: true, chrome, floats, skipSheets: characterSheets(ctx.scene) };
}

function layoutResults(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  if (wonBattle(ctx)) return layoutVictory(ctx, chrome);
  return layoutResultsLoss(ctx, chrome);
}

interface LossWordRow {
  en: string;
  zh: string;
  ok: boolean;
}

function lossFacts(ctx: PhoneContext): { correct: number; words: LossWordRow[] } {
  const view = resultsView(ctx);
  if (view && view.won === false) {
    return {
      correct: typeof view.correct === "number" ? view.correct : 0,
      words: (view.words ?? []).filter((word) => word.english).map((word) => ({
        en: String(word.english),
        zh: word.gloss ? String(word.gloss) : "",
        ok: word.correct === true,
      })),
    };
  }
  const page = (ctx.scene as ResultsHost & { __lossPage?: { correct?: number; words?: LossWordRow[] } }).__lossPage;
  if (page && typeof page.correct === "number" && Array.isArray(page.words)) {
    return { correct: page.correct, words: page.words.filter((word) => word.en) };
  }
  return { correct: 0, words: [] };
}

/**
 * 原来：失败页把桌面的安慰句和经验再堆进木牌，题数还会带上总题数。
 * 现在：按失败结算 r2 排。标题「差一点点！」，题数是本场答对数「答对 N 题」，右栏只有心和整句。
 * 为什么：不写总题数，也不放假奖励。再试一次和回地图在板外。考试未通过走同一页。
 */
function layoutResultsLoss(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const facts = lossFacts(ctx);
  const host = ctx.scene as ResultsHost;
  for (const fill of ctx.fills) {
    fill.w = 0;
    fill.h = 0;
  }
  chrome.push({ frame: "panel_parchment", box: s.box(56, 72, 732, 228) });
  ctx.fills.push({
    x: 332 * s.sx,
    y: 96 * s.sy,
    w: Math.max(1, s.sx),
    h: (284 - 96) * s.sy,
    color: 0xb4966e,
    role: "sheet",
  });

  const retry = ctx.units.find((unit) => unit.interactive && unit.text.includes("再试一次"));
  const map = ctx.units.find((unit) => unit.interactive && /^回地图/.test(unit.text));
  for (const unit of ctx.units) {
    if (unit === retry || unit === map) continue;
    hide(unit);
  }
  if (retry) {
    const box = s.box(620, 308, 168, 48);
    place(retry, box, 18 * s.sy, true);
    face(retry, FONT_TITLE, INK, "");
    chrome.push({ frame: "btn_primary_normal", box });
  }
  if (map) {
    const box = s.box(472, 308, 140, 48);
    place(map, box, 18 * s.sy, true);
    face(map, FONT_TITLE, INK, "");
    chrome.push({ frame: "btn_secondary_normal", box });
  }

  const used = new Set<PhoneUnit>();
  const claim = (pred?: (unit: PhoneUnit) => boolean): PhoneUnit | null => {
    const found = ctx.units.find((unit) => !unit.interactive && !used.has(unit) && unit.text.trim() && (!pred || pred(unit)));
    if (!found) return null;
    used.add(found);
    return found;
  };
  const widthOf = (text: string, font: number, weight: string, family: string): number => {
    if (ctx.measure) return Math.max(1, Math.ceil(ctx.measure(text, font, weight, family)));
    return Math.max(1, Math.ceil(textWidth(ctx, text, font)));
  };
  const title = claim((unit) => unit.text.includes("差一点点")) ?? claim((unit) => unit.text.includes("没关系"));
  const calm = claim((unit) => unit.text.includes("打输了不会丢东西")) ?? claim((unit) => unit.text.includes("不会丢东西"));
  const heading = facts.words.length ? claim((unit) => unit.text.includes("本场单词")) : null;
  const scorePrefix = claim((unit) => unit.text === "答对" || /^答对 \d+ 题$/.test(unit.text) || unit.text.startsWith("这次的词"));
  const rows = facts.words.map((word) => ({
    word,
    en: claim((unit) => unit.text === word.en),
    zh: word.zh ? claim((unit) => unit.text === word.zh) : null,
    note: word.ok ? null : claim((unit) => unit.text === "下次再见"),
  }));
  const scoreNum = claim((unit) => unit.text === String(facts.correct));
  const scoreSuffix = claim((unit) => unit.text === "题");

  const floats: PhoneImage[] = [];
  const take = (pred: (image: PhoneImage) => boolean): PhoneImage | null => {
    const index = ctx.images.findIndex(pred);
    if (index < 0) return null;
    const [image] = ctx.images.splice(index, 1);
    return image ?? null;
  };
  const floatAt = (image: PhoneImage | null, box: Box) => {
    if (!image) return;
    placeImage(image, box);
    floats.push(image);
  };
  floatAt(take((image) => frameOf(image) === "result_banner"), s.box(162, 20, 520, 82));
  if (title) {
    const font = 22 * s.sy;
    title.text = "差一点点！";
    const textW = widthOf(title.text, font, "", FONT_TITLE) + 2;
    const plaqueCx = 422 * s.sx;
    const plaqueCy = 58.25 * s.sy;
    place(title, { x: plaqueCx - textW / 2, y: plaqueCy - font / 2, w: textW, h: font }, font, true);
    face(title, FONT_TITLE, CREAM, "");
  }

  const scoreBox = s.box(92, 100, 36, 36);
  floatAt(take((image) => textureOf(image) === "results_ico_score"), scoreBox);
  const scoreY = 118 * s.sy;
  let scoreX = 136 * s.sx;
  const writeScore = (unit: PhoneUnit | null, text: string, font: number, family: string, weight: string) => {
    const piece = unit ?? claim();
    if (!piece) return;
    piece.text = text;
    const textW = widthOf(text, font, weight, family) + 2;
    place(piece, { x: scoreX, y: scoreY - font / 2, w: textW, h: font }, font);
    face(piece, family, TEAL, weight);
    scoreX += textW + 8 * s.sx;
  };
  writeScore(scorePrefix, "答对", 16 * s.sy, FONT_BODY, "700");
  writeScore(scoreNum, String(facts.correct), 22 * s.sy, FONT_LATIN, "700");
  writeScore(scoreSuffix, "题", 16 * s.sy, FONT_BODY, "700");

  if (heading) {
    const font = 15 * s.sy;
    heading.text = "本场单词";
    const textW = widthOf(heading.text, font, "", FONT_TITLE) + 2;
    place(heading, { x: 92 * s.sx, y: 144 * s.sy, w: textW, h: font }, font);
    face(heading, FONT_TITLE, INK, "");
  }

  const checks: PhoneImage[] = [];
  for (;;) {
    const image = take((item) => textureOf(item) === "results_ico_word_check" || frameOf(item) === "icon_check");
    if (!image) break;
    checks.push(image);
  }
  const rowFont = 15 * s.sy;
  const noteFont = 14 * s.sy;
  const pitch = 23 * s.sy;
  const rowTop0 = 175 * s.sy;
  const listBottom = 284 * s.sy;
  const clip: Box = { x: 80 * s.sx, y: rowTop0 - 8 * s.sy, w: 244 * s.sx, h: Math.max(1, listBottom - (rowTop0 - 8 * s.sy)) };
  const maxScroll = Math.max(0, facts.words.length === 0 ? 0 : rowTop0 + (facts.words.length - 1) * pitch + rowFont - listBottom);
  const scroll = Math.max(0, Math.min(maxScroll, host.__resultsWordScroll || 0));
  host.__resultsWordScroll = scroll;
  host.__resultsWordMax = maxScroll;
  host.__resultsWordClip = maxScroll > 0 ? clip : undefined;
  host.__resultsRewardScroll = 0;
  host.__resultsRewardMax = 0;
  host.__resultsRewardClip = undefined;
  const columnRight = 324 * s.sx;
  rows.forEach((row, index) => {
    const word = row.word;
    const y = rowTop0 + index * pitch - scroll;
    const visible = y + 0.5 >= rowTop0 && y + rowFont <= listBottom + 0.5;
    if (!visible) return;
    const en = row.en ?? claim();
    const zh = word.zh ? row.zh ?? claim() : null;
    const note = word.ok ? null : row.note ?? claim();
    const enX = 116 * s.sx;
    const enW = Math.min(108 * s.sx, widthOf(word.en, rowFont, "700", FONT_LATIN));
    const naturalZh = word.zh ? widthOf(word.zh, rowFont, "", FONT_BODY) : 0;
    const noteW = note ? widthOf("下次再见", noteFont, "", FONT_BODY) : 0;
    let zhX = Math.max(230 * s.sx, enX + enW + 8 * s.sx);
    let noteX = columnRight;
    if (note) {
      noteX = Math.max(252 * s.sx, zhX + naturalZh + 8 * s.sx);
      if (noteX + noteW > columnRight) noteX = Math.max(zhX + 8 * s.sx, columnRight - noteW);
    }
    const zhMax = Math.max(rowFont, (note ? noteX - 8 * s.sx : columnRight) - zhX);
    if (word.ok && checks.length) {
      const icon = checks.shift() ?? null;
      if (icon) {
        if (maxScroll > 0) icon.clip = clip;
        floatAt(icon, { x: 92 * s.sx, y: y - 8 * s.sy, w: 16 * s.sx, h: 16 * s.sy });
      }
    }
    if (en) {
      en.text = word.en;
      place(en, { x: enX, y, w: Math.max(enW, 8), h: rowFont }, rowFont);
      face(en, FONT_LATIN, word.ok ? INK : MUTED, "700");
      if (maxScroll > 0) en.clip = clip;
    }
    if (zh && word.zh) {
      zh.text = word.zh;
      const zhW = Math.min(zhMax, widthOf(word.zh, rowFont, "", FONT_BODY));
      place(zh, { x: zhX, y, w: Math.max(zhW, 8), h: rowFont }, rowFont);
      face(zh, FONT_BODY, MUTED, "");
      if (maxScroll > 0) zh.clip = clip;
    }
    if (note) {
      note.text = "下次再见";
      place(note, { x: noteX, y: y + (rowFont - noteFont) / 2, w: Math.max(noteW, 8), h: noteFont }, noteFont);
      face(note, FONT_BODY, NOTE, "");
      if (maxScroll > 0) note.clip = clip;
    }
  });

  const heart = take((image) => textureOf(image) === "results_ico_heart") ?? take((image) => frameOf(image) === "icon_heart");
  floatAt(heart, s.box(356, 164, 36, 36));
  const calmUnit = calm ?? claim();
  if (calmUnit) {
    const font = 16 * s.sy;
    calmUnit.text = LOSS_LINE;
    const textW = widthOf(LOSS_LINE, font, "", FONT_TITLE) + 2;
    const mid = 182 * s.sy;
    place(calmUnit, { x: 400 * s.sx, y: mid - font / 2, w: textW, h: font }, font);
    face(calmUnit, FONT_TITLE, INK, "");
  }
  return { hero: null, skipMasks: true, chrome, floats, skipSheets: characterSheets(ctx.scene) };
}

function bossArt(image: PhoneImage): boolean {
  return /boss_exam|exam:boss/i.test(`${textureOf(image)} ${frameOf(image)} ${image.node?.name ?? ""}`);
}

function bossBody(image: PhoneImage): boolean {
  if (!bossArt(image)) return false;
  if (image.node?.name === "exam:boss") return true;
  const name = `${textureOf(image)} ${frameOf(image)}`;
  if (/badge|glow|fx|cloak|cover|crown|compass|shadow/i.test(name)) return false;
  return /body/i.test(frameOf(image));
}

function placeBoss(ctx: PhoneContext, box: Box): void {
  const bodies = ctx.images.filter(bossBody);
  const portrait = bodies.find((image) => image.node?.name !== "exam:boss") ?? bodies[0];
  if (portrait) placeImage(portrait, box);
  for (const image of ctx.images) {
    if (!bossArt(image) || image === portrait) continue;
    image.x = 0;
    image.y = 0;
    image.w = 0;
    image.h = 0;
    image.placed = true;
  }
}

function layoutExam(ctx: PhoneContext, chrome: PhoneChrome[], intro: PhoneUnit | null): PhoneLayout {
  const s = scaler(ctx.view);
  if (intro) {
    chrome.push({ frame: "panel_parchment", box: s.box(100, 85, 480, 140) });
    const start = s.box(250, 292, 180, 52);
    place(intro, start, 18, true);
    chrome.push({ frame: "btn_primary_normal", box: start });
    const title = ctx.units.find((unit) => unit !== intro && (unit.text.includes("期中") || unit.text.includes("期末")));
    if (title) {
      ink(title);
      place(title, s.box(140, 100, 400, 28), 20);
    }
    const body = ctx.units.find((unit) => /准备好了|最近学过|这次练习/.test(unit.text));
    if (body) {
      ink(body, "#46363A");
      write(ctx, body, s.box(130, 136, 0, 0).x, s.box(0, 136, 0, 0).y, s.box(0, 0, 420, 0).w, 14);
    }
    placeBoss(ctx, s.box(600, 36, 170, 220));
    const portraits = placeExamAvatar(ctx, s, true);
    return { hero: placeHero(ctx, s.box(180, 220, 0, 0).x, s.box(0, 220, 0, 0).y, 130 * s.sy), skipMasks: true, chrome, portraits, skipSheets: portraits.map((item) => item.node) };
  }
  for (const unit of ctx.units) {
    if (!unit.interactive && /准备好了|最近学过|这次练习/.test(unit.text)) hide(unit);
  }
  chrome.push({ frame: "panel_parchment", box: s.box(604, 16, 184, 32) });
  const right = ctx.units.find((unit) => unit.text === "期中挑战" || unit.text === "期末大挑战");
  if (right) {
    ink(right);
    place(right, s.box(604, 16, 184, 32), 14, true);
  }
  const prompt = ctx.units.find((unit) => !unit.interactive && (unit.text.includes("意思") || unit.text.includes("？") || unit.text.includes("怎么说") || unit.text.includes("?")));
  const options = ctx.units.filter((unit) => unit.interactive && unit.text.trim() && unit.text !== "攻击" && !/返回|回地图|休息/.test(unit.text));
  if (prompt) {
    chrome.push({ frame: "panel_parchment", box: s.box(56, 228, 732, 126) });
    ink(prompt);
    place(prompt, s.box(80, 240, 680, 28), 18);
    options.slice(0, 4).forEach((option, index) => {
      const box = s.box(76 + index * 176, 278, 160, 48);
      place(option, box, 16, true);
      chrome.push({ frame: "option_normal", box });
    });
  }
  const attack = ctx.units.find((unit) => unit.interactive && unit.text === "攻击");
  if (attack && !prompt) {
    const box = s.box(332, 300, 160, 48);
    place(attack, box, 18, true);
    chrome.push({ frame: "btn_primary_normal", box });
  }
  const life = lifeReadout(ctx.scene);
  const captions: PhoneCaption[] = [];
  let hudY = s.box(0, 22, 0, 0).y;
  let named = false;
  for (const unit of ctx.units) {
    if (unit.onPaper || unit.interactive || !unit.text.trim()) continue;
    if (unit.text.length > 22 || unit.designY > 180) {
      hide(unit);
      continue;
    }
    if (prompt && life.asked != null && !named && unit.designX < 500 && !/[？?]/.test(unit.text)) {
      unit.text = `${unit.text} · 第${life.asked}题`;
      unit.lines = [unit.text];
      named = true;
    }
    ink(unit);
    hudY = write(ctx, unit, s.box(108, 0, 0, 0).x, hudY, s.box(0, 0, 220, 0).w, 14);
  }
  if (prompt && life.asked != null && !named) {
    const tag = { x: s.box(108, 0, 0, 0).x, y: hudY, w: 140 * s.sx, h: 22 * s.sy };
    captions.push({ text: `第${life.asked}题`, x: tag.x, y: tag.y, w: tag.w, h: tag.h, color: "#3B2A20", font: 14 });
    hudY = tag.y + tag.h;
  }
  const bars: PhoneBar[] = [];
  if (prompt) {
    const barH = 16 * s.sy;
    parkBar(bars, s.box(108, 0, 0, 0).x, hudY + 4 * s.sy, 150 * s.sx, barH, life.player, "teal", s.box(0, 68, 0, 0).y);
    parkBar(bars, s.box(620, 0, 0, 0).x, s.box(0, 50, 0, 0).y, 110 * s.sx, barH, life.enemy, "coral", s.box(0, 70, 0, 0).y);
  }
  placeBoss(ctx, prompt && life.enemy != null ? s.box(620, 70, 150, 148) : s.box(620, 48, 160, 170));
  const portraits = placeExamAvatar(ctx, s, false);
  return { hero: placeHero(ctx, s.box(150, 190, 0, 0).x, s.box(0, 190, 0, 0).y, 120 * s.sy), skipMasks: true, chrome, bars, captions, portraits, skipSheets: portraits.map((item) => item.node) };
}

function placeExamAvatar(ctx: PhoneContext, s: ReturnType<typeof scaler>, intro: boolean): PhonePortrait[] {
  const node = walk(ctx.scene).find((item) => item.name === "exam:player");
  if (!node) return [];
  const image = ctx.images.find((item) => item.node === node);
  if (image) {
    image.w = 0;
    image.h = 0;
    image.placed = true;
  }
  return [{ node, box: intro ? s.box(16, 240, 80, 112) : s.box(16, 48, 72, 100) }];
}

function layoutGeneric(ctx: PhoneContext, chrome: PhoneChrome[]): PhoneLayout {
  const s = scaler(ctx.view);
  const back = ctx.units.find((unit) => unit.interactive && /^(返回|回村子|回地图|取消)/.test(unit.text));
  if (back) place(back, s.box(56, 16, Math.max(100, textWidth(ctx, back.text, 16) + 28), 44), 16);
  chrome.push({ frame: "panel_parchment", box: s.box(56, 68, 732, 220) });
  let y = s.box(0, 92, 0, 0).y;
  for (const unit of ctx.units.filter((item) => !item.onPaper && !item.interactive && item.text.trim()).sort((a, b) => a.designY - b.designY)) {
    ink(unit);
    y = write(ctx, unit, s.box(80, 0, 0, 0).x, y, s.box(0, 0, 680, 0).w, 14) + 6 * s.sy;
  }
  let x = s.box(56, 0, 0, 0).x;
  const by = s.box(0, 308, 0, 0).y;
  for (const unit of ctx.units.filter((item) => item.interactive && !item.onPaper && item.text.trim())) {
    const width = Math.max(s.box(0, 0, 100, 0).w, Math.min(s.box(0, 0, 220, 0).w, textWidth(ctx, unit.text, 16) + 32 * s.sx));
    place(unit, { x, y: by, w: width, h: s.box(0, 0, 0, 48).h }, 16);
    x += width + 8 * s.sx;
  }
  return { hero: null, skipMasks: true, chrome };
}

function quietDim(ctx: PhoneContext): void {
  if (ctx.key !== "battle-results") return;
  for (const fill of ctx.fills) {
    if (fill.w >= ctx.view.w * 0.9 && fill.h >= ctx.view.h * 0.9) {
      fill.w = 0;
      fill.h = 0;
    }
  }
}

function bindButtonLabels(ctx: PhoneContext): void {
  if (ctx.key !== "exam-battle") return;
  const labels = ctx.units.filter((unit) => !unit.interactive && unit.node.type === "text" && unit.text.trim().length > 0 && unit.text.length <= 24);
  for (const unit of ctx.units) {
    if (!unit.interactive || unit.text.trim()) continue;
    if (unit.node.type !== "rectangle" && unit.node.type !== "zone") continue;
    if (unit.design.w >= 900 || unit.design.h >= 200) continue;
    const host = unit.design;
    const label = labels.find((item) => {
      if (!item.text.trim() || /什么|意思|怎么说|准备好了|最近学过|这次练习/.test(item.text)) return false;
      const cx = item.design.x + item.design.w / 2;
      const cy = item.design.y + item.design.h / 2;
      return cx >= host.x - 4 && cx <= host.x + host.w + 4 && cy >= host.y - 4 && cy <= host.y + host.h + 4;
    });
    if (!label) continue;
    unit.text = label.text;
    unit.lines = [label.text];
    label.text = "";
    label.lines = [];
  }
}

export function composeV2(ctx: PhoneContext): PhoneLayout {
  keepSceneArt(ctx);
  quietDim(ctx);
  bindButtonLabels(ctx);
  labelExamHits(ctx);
  const chrome: PhoneChrome[] = [];
  const intro = ctx.key === "exam-battle" ? claimIntro(ctx) : null;
  blankFullScreen(ctx, intro);
  let layout: PhoneLayout;
  if (ctx.key === "title") layout = layoutTitle(ctx, chrome);
  else if (ctx.key === "overworld") layout = layoutVillage(ctx, chrome);
  else if (ctx.key === "guide") layout = layoutGuide(ctx, chrome);
  else if (ctx.key === "wardrobe") layout = layoutWardrobe(ctx, chrome);
  else if (ctx.key === "skills") layout = layoutSkills(ctx, chrome);
  else if (ctx.key === "learn") layout = layoutLearn(ctx, chrome);
  else if (ctx.key === "grades") layout = layoutGrades(ctx, chrome);
  else if (ctx.key === "create") layout = layoutCreate(ctx, chrome);
  else if (ctx.key === "stages") layout = layoutStages(ctx, chrome);
  else if (ctx.key === "battle") layout = layoutBattle(ctx, chrome);
  else if (ctx.key === "battle-results") layout = layoutResults(ctx, chrome);
  else if (ctx.key === "exam-battle") layout = (ctx.scene as { __failShare?: boolean }).__failShare ? layoutResultsLoss(ctx, chrome) : layoutExam(ctx, chrome, intro);
  else layout = layoutGeneric(ctx, chrome);
  for (const unit of ctx.units) {
    if (!unit.onPaper && !unit.interactive) hide(unit);
  }
  dropUnplaced(ctx);
  return layout;
}

function claimIntro(ctx: PhoneContext): PhoneUnit | null {
  if (ctx.units.some((unit) => unit.text === "攻击")) return null;
  const zone = ctx.units.find((unit) => unit.interactive && !unit.text.trim() && unit.design.w >= 900);
  if (!zone) return null;
  zone.text = "开始答题";
  zone.lines = ["开始答题"];
  return zone;
}
