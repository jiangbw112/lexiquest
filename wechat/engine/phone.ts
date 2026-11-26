/**
 * 原来：横屏把 1280×800 的桌面界面等比塞进窗口，两侧留黑边，按钮和说明再被货架挤到顶栏。
 * 现在：场景用 cover 铺满视口。标题、给家长、衣柜按视口逻辑像素重排，安全区、44 热区、8 间距。
 * 为什么：微信小屏是横屏手机，不是缩小的桌面。快捷键文案在这里不成立。
 */

import { screenFontPx, type ViewBox } from "./coords";
import type { GameNode } from "./node";

export interface PhoneUnit {
  node: GameNode;
  text: string;
  fontPx: number;
  weight: string;
  family: string;
  interactive: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  onPaper?: boolean;
  designX: number;
  designY: number;
}

export interface PhoneImage {
  x: number;
  y: number;
  w: number;
  h: number;
  node?: GameNode;
}

export interface PhonePlate {
  box: { x: number; y: number; w: number; h: number };
  frame: string;
}

export interface PhoneFill {
  x: number;
  y: number;
  w: number;
  h: number;
  color: number;
  role?: "sheet";
}

export interface PhoneContext {
  key: string;
  view: ViewBox;
  scene: { children: { list: GameNode[] } };
  units: PhoneUnit[];
  images: PhoneImage[];
  plates: PhonePlate[];
  fills: PhoneFill[];
  measure?: (text: string, fontPx: number, weight: string, family: string) => number;
  fitText: (unit: PhoneUnit, maxW: number) => void;
}

export interface PhoneHero {
  scale: number;
  ox: number;
  oy: number;
}

export interface PhoneLayout {
  hero: PhoneHero | null;
  skipMasks: boolean;
}

const cameras = new WeakMap<object, PhoneLayout>();

export function rememberPhone(scene: object, layout: PhoneLayout | null): void {
  if (layout) cameras.set(scene, layout);
  else cameras.delete(scene);
}

export function phoneLayoutOf(scene: object): PhoneLayout | null {
  return cameras.get(scene) ?? null;
}

export function wechatCopy(text: string): string {
  if (text === "数据只保存在这台电脑") return "数据保存在当前设备";
  if (text.includes("这一台电脑")) return text.replaceAll("这一台电脑", "这台设备");
  if (text.includes("这台电脑")) return text.replaceAll("这台电脑", "这台设备");
  if (text.includes("把电脑交给")) return text.replaceAll("把电脑交给", "把设备交给");
  if (text.includes("电脑会读出")) return text.replaceAll("电脑会读出", "设备会读出");
  if (text.includes("键盘 3、4、5、6")) return "";
  if (text.startsWith("Enter 出发")) return text.replace(/^Enter 出发。/, "");
  if (text.includes("或按 Enter")) return text.replaceAll("或按 Enter", "").replace(/\s{2,}/g, " ").trim();
  if (text.includes("键盘 1")) return "";
  if (text === "新的冒险 N") return "新的冒险";
  if (text.endsWith(" Enter")) return text.slice(0, -" Enter".length);
  if (text.endsWith(" Esc")) return text.slice(0, -" Esc".length);
  return text;
}

export function rewriteSceneCopy(scene: { children: { list: GameNode[] } }): void {
  const visit = (node: GameNode) => {
    const labeled = node as GameNode & { text?: string; setText?: (value: string) => void };
    if (node.type === "text" && typeof labeled.text === "string") {
      const next = wechatCopy(labeled.text);
      if (next !== labeled.text) {
        if (labeled.setText) labeled.setText(next);
        else labeled.text = next;
      }
    }
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
}

export function isBackdrop(node: GameNode): boolean {
  const key = (node as GameNode & { texture?: string }).texture ?? "";
  return key.startsWith("bg_");
}

export function coverBox(view: ViewBox): { x: number; y: number; w: number; h: number } {
  const scale = Math.max(view.w / 1280, view.h / 800);
  const w = 1280 * scale;
  const h = 800 * scale;
  return { x: (view.w - w) / 2, y: (view.h - h) / 2, w, h };
}

interface Safe {
  x: number;
  y: number;
  w: number;
  h: number;
}

function safeOf(view: ViewBox): Safe {
  const left = 28;
  const right = 28;
  const top = 16;
  const bottom = 16;
  return { x: left, y: top, w: Math.max(44, view.w - left - right), h: Math.max(44, view.h - top - bottom) };
}

function wrapFallback(text: string, fontPx: number, maxW: number, measure: PhoneContext["measure"]): string[] {
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    const next = line + char;
    if (line && textWidth(next, fontPx, measure) > maxW) {
      lines.push(line);
      line = char;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function textWidth(text: string, fontPx: number, measure: PhoneContext["measure"], weight = "", family = "sans-serif"): number {
  if (measure) return measure(text, fontPx, weight, family);
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 255 ? fontPx : fontPx * 0.56;
  return Math.max(fontPx, width);
}

function labelStyle(unit: PhoneUnit): { fontPx: number; weight: string; family: string; stroke: number } {
  const list = (unit.node as GameNode & { list?: GameNode[] }).list ?? [];
  const text = list.find((child) => child.type === "text") as (GameNode & { style?: { fontSize?: string; fontStyle?: string; fontFamily?: string; strokeThickness?: number } }) | undefined;
  const style = text?.style ?? {};
  const design = Number.parseFloat(String(style.fontSize ?? "22")) || 22;
  return {
    fontPx: screenFontPx(design),
    weight: style.fontStyle || "",
    family: style.fontFamily || '"Noto Sans SC", "WenQuanYi Micro Hei", "PingFang SC", sans-serif',
    stroke: Number(style.strokeThickness) || 0,
  };
}

function buttonWidth(unit: PhoneUnit, measure: PhoneContext["measure"]): number {
  const style = labelStyle(unit);
  const label = unit.text.trim() || "按钮";
  const width = textWidth(label, style.fontPx, measure, style.weight, style.family) + style.stroke + 36;
  return Math.max(44, Math.ceil(width));
}

function flowButtons(buttons: PhoneUnit[], x: number, y: number, maxW: number, measure: PhoneContext["measure"], fontPx: number): number {
  let cursor = x;
  let rowY = y;
  for (const button of buttons) {
    const width = Math.min(maxW, buttonWidth(button, measure));
    if (cursor > x && cursor + width > x + maxW) {
      cursor = x;
      rowY += 44 + 8;
    }
    button.x = cursor;
    button.y = rowY;
    button.w = width;
    button.h = 44;
    button.onPaper = true;
    cursor += width + 8;
  }
  return buttons.length ? rowY + 44 : y;
}

function placeSentences(unit: PhoneUnit, x: number, y: number, maxW: number, ctx: PhoneContext, fontPx: number): number {
  const sentences = unit.text.split(/(?<=。)/).map((part) => part.trim()).filter(Boolean);
  unit.fontPx = fontPx;
  unit.lines = [];
  let width = 0;
  for (const sentence of sentences.length ? sentences : [unit.text]) {
    if (textWidth(sentence, fontPx, ctx.measure) <= maxW) {
      unit.lines.push(sentence);
      width = Math.max(width, textWidth(sentence, fontPx, ctx.measure));
    } else {
      const wrapped = wrapFallback(sentence, fontPx, maxW, ctx.measure);
      unit.lines.push(...wrapped);
      width = maxW;
    }
  }
  unit.w = Math.max(fontPx, width);
  unit.h = Math.max(fontPx, unit.lines.length * fontPx);
  unit.x = x;
  unit.y = y;
  unit.onPaper = true;
  return y + unit.h + 8;
}

function stackSentences(units: PhoneUnit[], x: number, y: number, maxW: number, ctx: PhoneContext, fontPx: number): number {
  let cursor = y;
  for (const unit of units) cursor = placeSentences(unit, x, cursor, maxW, ctx, fontPx);
  return cursor;
}

function stackTexts(units: PhoneUnit[], x: number, y: number, maxW: number, fitText: PhoneContext["fitText"], fontPx: number): number {
  let cursor = y;
  for (const unit of units) {
    unit.fontPx = fontPx;
    fitText(unit, maxW);
    unit.x = x;
    unit.y = cursor;
    unit.onPaper = true;
    cursor += unit.h + 8;
  }
  return cursor;
}

function dropDesktopFrames(ctx: PhoneContext): void {
  const frames = new Set(["panel_parchment", "panel_wood"]);
  const doomed = new Set<GameNode>();
  for (const image of ctx.images) {
    const node = image.node as (GameNode & { frame?: string; texture?: string }) | undefined;
    if (!node) continue;
    if (frames.has(node.frame ?? "") || node.texture === "logo_title") doomed.add(node);
  }
  const kept = ctx.images.filter((image) => !image.node || !doomed.has(image.node));
  ctx.images.splice(0, ctx.images.length, ...kept);
  for (let index = ctx.plates.length - 1; index >= 0; index -= 1) {
    if (frames.has(ctx.plates[index].frame)) ctx.plates.splice(index, 1);
  }
}

function findHero(scene: { children: { list: GameNode[] } }): GameNode | null {
  let found: GameNode | null = null;
  const visit = (node: GameNode) => {
    const key = (node as GameNode & { texture?: string }).texture ?? "";
    if (!found && key.startsWith("cls:") && key.includes(":side") && node.parent) found = node.parent;
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
  return found;
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

function nodeBox(node: GameNode): { x: number; y: number; w: number; h: number } {
  const width = node.width * Math.abs(node.scaleX || 1);
  const height = node.height * Math.abs(node.scaleY || 1);
  const at = worldPoint(node);
  return { x: at.x - node.originX * width, y: at.y - node.originY * height, w: width, h: height };
}

function findFrame(scene: { children: { list: GameNode[] } }, frame: string): GameNode | null {
  let found: GameNode | null = null;
  const visit = (node: GameNode) => {
    if (!found && (node as GameNode & { frame?: string }).frame === frame) found = node;
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
  return found;
}

function placeImage(images: PhoneImage[], node: GameNode, box: { x: number; y: number; w: number; h: number }): void {
  for (const image of images) {
    if (image.node !== node) continue;
    image.x = box.x;
    image.y = box.y;
    image.w = box.w;
    image.h = box.h;
  }
}

function composeTitle(ctx: PhoneContext): PhoneLayout {
  dropDesktopFrames(ctx);
  const safe = safeOf(ctx.view);
  const brand = ctx.units.find((unit) => unit.text === "词境练习家");
  const sub = ctx.units.find((unit) => unit.text === "LexiQuest");
  const tag = ctx.units.find((unit) => unit.text.includes("认识单词"));
  const rank = (text: string) => (text.includes("继续") || text.includes("开始") ? 0 : text.includes("新的冒险") ? 1 : text.includes("换角色") ? 2 : 3);
  const buttons = ctx.units.filter((unit) => unit.interactive).sort((a, b) => rank(a.text) - rank(b.text) || a.designX - b.designX);
  const widths = buttons.map((button) => buttonWidth(button, ctx.measure));
  let rows = 1;
  let used = 0;
  for (const width of widths) {
    if (used > 0 && used + width > safe.w) {
      rows += 1;
      used = 0;
    }
    used += width + 8;
  }
  const blockH = rows * 44 + Math.max(0, rows - 1) * 8;
  const startY = safe.y + safe.h - blockH;
  flowButtons(buttons, safe.x, startY, safe.w, ctx.measure, 20);
  if (rows === 1 && buttons.length) {
    const rowWidth = buttons.reduce((sum, button) => sum + button.w, 0) + (buttons.length - 1) * 8;
    const shift = Math.max(0, (safe.w - rowWidth) / 2);
    for (const button of buttons) button.x += shift;
  }
  const topLimit = startY - 8;
  let y = safe.y;
  if (brand) {
    brand.fontPx = Math.max(28, Math.min(40, Math.floor(ctx.view.w / 22)));
    ctx.fitText(brand, safe.w);
    brand.x = safe.x + (safe.w - brand.w) / 2;
    brand.y = y;
    brand.onPaper = true;
    ctx.fills.push({ x: brand.x - 16, y: brand.y - 6, w: brand.w + 32, h: brand.h + 12, color: 0xfff4dc, role: "sheet" });
    y = brand.y + brand.h + 8;
  }
  if (sub) {
    sub.fontPx = 14;
    ctx.fitText(sub, safe.w);
    sub.x = safe.x + (safe.w - sub.w) / 2;
    sub.y = y;
    sub.onPaper = true;
    y = sub.y + sub.h + 8;
  }
  if (tag) {
    tag.fontPx = 16;
    ctx.fitText(tag, Math.min(safe.w, 640));
    tag.x = safe.x + (safe.w - tag.w) / 2;
    tag.y = y;
    tag.onPaper = true;
    y = tag.y + tag.h + 8;
  }
  const heroNode = findHero(ctx.scene);
  let hero: PhoneHero | null = null;
  if (heroNode) {
    const at = worldPoint(heroNode);
    const desired = Math.max(120, Math.min(240, topLimit - y - 8));
    const parentScale = heroNode.scaleX || 0.5;
    const scale = desired / (512 * parentScale);
    const footY = topLimit - desired * 0.125;
    const footX = safe.x + desired * 0.5;
    hero = { scale, ox: footX - scale * at.x, oy: footY - scale * at.y };
  }
  return { hero, skipMasks: false };
}

function composeGuide(ctx: PhoneContext): PhoneLayout {
  dropDesktopFrames(ctx);
  const safe = safeOf(ctx.view);
  const unlocked = ctx.units.some((unit) => unit.text.includes("学习进度"));
  const back = ctx.units.find((unit) => unit.interactive && (unit.text === "返回" || unit.text.startsWith("返回")));
  const buttons = ctx.units.filter((unit) => unit.interactive && !String(unit.node.name || "").startsWith("pin:") && unit !== back);
  const pinLabels = ctx.units.filter((unit) => String(unit.node.name || "").startsWith("pin:") && !unit.interactive && unit.text.trim().length > 0);
  const pinKeys = ctx.units.filter((unit) => String(unit.node.name || "").startsWith("pin:") && unit.interactive);
  let y = safe.y;
  if (back) {
    back.w = Math.min(safe.w, buttonWidth(back, ctx.measure));
    back.h = 44;
    back.x = safe.x;
    back.y = y;
    back.onPaper = true;
  }
  const title = ctx.units.find((unit) => unit.text === "给家长");
  if (title) {
    title.fontPx = 22;
    ctx.fitText(title, safe.w - (back ? back.w + 8 : 0));
    title.x = back ? back.x + back.w + 8 : safe.x;
    title.y = y + Math.max(0, (44 - title.h) / 2);
    title.onPaper = true;
  }
  y += 44 + 8;
  if (!unlocked) {
    const note = ctx.units.find((unit) => !String(unit.node.name || "").startsWith("pin:") && (unit.text.includes("不是安全登录") || unit.text.includes("家长密码")));
    if (note && note !== title) {
      const sentences = note.text.split(/(?<=。)/).map((part) => part.trim()).filter(Boolean);
      note.fontPx = 16;
      note.lines = [];
      let width = 0;
      for (const sentence of sentences) {
        if (textWidth(sentence, 16, ctx.measure) <= safe.w) {
          note.lines.push(sentence);
          width = Math.max(width, textWidth(sentence, 16, ctx.measure));
        } else {
          note.lines.push(...wrapFallback(sentence, 16, safe.w, ctx.measure));
          width = safe.w;
        }
      }
      note.w = Math.max(16, width);
      note.h = note.lines.length * 16;
      note.x = safe.x;
      note.y = y;
      note.onPaper = true;
      ctx.fills.push({ x: note.x - 12, y: note.y - 8, w: Math.min(safe.w, note.w + 24), h: note.h + 16, color: 0xfff4dc, role: "sheet" });
      y = note.y + note.h + 8;
    }
    const labelBottom = stackTexts(pinLabels, safe.x, y, safe.w, ctx.fitText, 16);
    const keyRank = (text: string) => {
      if (/^[1-9]$/.test(text)) return Number(text);
      if (text === "0") return 10;
      if (text === "退格") return 20;
      if (text === "再输" || text === "清空") return 21;
      if (text === "确定") return 22;
      return 30;
    };
    pinKeys.sort((a, b) => keyRank(a.text) - keyRank(b.text));
    const keyFont = 16;
    const keyW = Math.max(52, ...pinKeys.map((key) => Math.ceil(textWidth(key.text, keyFont, ctx.measure) + 20)));
    const cols = Math.max(1, Math.min(pinKeys.length, Math.floor((safe.w + 8) / (keyW + 8))));
    const rowW = cols * keyW + Math.max(0, cols - 1) * 8;
    const keyX = safe.x + Math.max(0, (safe.w - rowW) / 2);
    const keyY = Math.max(labelBottom, safe.y + safe.h - (Math.ceil(pinKeys.length / cols) * 44 + Math.max(0, Math.ceil(pinKeys.length / cols) - 1) * 8));
    pinKeys.forEach((key, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      key.w = keyW;
      key.h = 44;
      key.x = keyX + col * (keyW + 8);
      key.y = keyY + row * (44 + 8);
      key.onPaper = true;
    });
    return { hero: null, skipMasks: false };
  }
  const actionBottom = flowButtons(buttons, safe.x, y, safe.w, ctx.measure, 16);
  y = actionBottom + 8;
  const body = ctx.units.filter((unit) => !unit.interactive && unit !== title && unit.text.trim().length > 0 && !String(unit.node.name || "").startsWith("pin:"));
  body.sort((a, b) => a.designY - b.designY);
  const area = { x: safe.x, y, w: safe.w, h: safe.y + safe.h - y };
  const fitColumn = (columns: number): boolean => {
    const gap = 8;
    const colW = (area.w - gap * (columns - 1)) / columns;
    const groups: PhoneUnit[][] = Array.from({ length: columns }, () => []);
    const chunk = Math.ceil(body.length / columns);
    body.forEach((unit, index) => groups[Math.min(columns - 1, Math.floor(index / chunk))].push(unit));
    let ok = true;
    groups.forEach((group, index) => {
      let cursor = area.y;
      const x = area.x + index * (colW + gap);
      for (const unit of group) {
        unit.fontPx = 14;
        ctx.fitText(unit, colW);
        if (cursor + unit.h > area.y + area.h + 0.5) ok = false;
        unit.x = x;
        unit.y = cursor;
        unit.onPaper = true;
        cursor += unit.h + gap;
      }
    });
    return ok;
  };
  if (!fitColumn(1)) fitColumn(2);
  if (body.length) {
    const left = Math.min(...body.map((unit) => unit.x));
    const top = Math.min(...body.map((unit) => unit.y));
    const right = Math.max(...body.map((unit) => unit.x + unit.w));
    const bottom = Math.max(...body.map((unit) => unit.y + unit.h));
    ctx.fills.push({ x: left - 12, y: top - 8, w: right - left + 24, h: bottom - top + 16, color: 0xfff4dc, role: "sheet" });
  }
  return { hero: null, skipMasks: false };
}

function composeWardrobe(ctx: PhoneContext): PhoneLayout {
  dropDesktopFrames(ctx);
  const safe = safeOf(ctx.view);
  const back = ctx.units.find((unit) => unit.interactive && unit.text.startsWith("返回"));
  const cardText = new Set(["整", "旅行短衣", "就是职业原本的衣服", "穿着", "只给战士"]);
  const title = ctx.units.find((unit) => unit.text === "衣柜");
  const notes = ctx.units.filter((unit) => unit.text.includes("花环") || unit.text.includes("羽饰") || unit.text.includes("这身衣服"));
  const equipped = ctx.units.find((unit) => unit.text === "已有装备");
  const titles = ctx.units.filter((unit) => unit.text.includes("称号"));
  const cardUnits = ctx.units.filter((unit) => cardText.has(unit.text));
  const arch = findFrame(ctx.scene, "wardrobe_arch");
  const stage = findFrame(ctx.scene, "wardrobe_stage");
  const archBox = arch ? nodeBox(arch) : null;
  let mirror: { x: number; y: number; w: number; h: number; scale: number } | null = null;
  if (arch && archBox && archBox.w > 0 && archBox.h > 0) {
    const maxH = safe.h;
    const maxW = Math.min(300, safe.w * 0.38);
    const scale = Math.min(maxW / archBox.w, maxH / archBox.h);
    const drawW = archBox.w * scale;
    const drawH = archBox.h * scale;
    const x = safe.x + safe.w - drawW;
    const y = safe.y + (safe.h - drawH) / 2;
    mirror = { x, y, w: drawW, h: drawH, scale };
    placeImage(ctx.images, arch, { x, y, w: drawW, h: drawH });
    if (stage) {
      const stageBox = nodeBox(stage);
      placeImage(ctx.images, stage, {
        x: x + (stageBox.x - archBox.x) * scale,
        y: y + (stageBox.y - archBox.y) * scale,
        w: stageBox.w * scale,
        h: stageBox.h * scale,
      });
    }
  }
  const leftW = mirror ? Math.max(160, mirror.x - safe.x - 12) : safe.w;
  let y = safe.y;
  if (back) {
    back.w = Math.min(160, buttonWidth(back, ctx.measure));
    back.h = 44;
    back.x = safe.x;
    back.y = y;
    back.onPaper = true;
  }
  if (title) {
    title.fontPx = 26;
    ctx.fitText(title, leftW - (back ? back.w + 8 : 0));
    title.x = back ? Math.min(back.x + back.w + 8, safe.x + leftW - title.w) : safe.x;
    title.y = y + Math.max(0, (44 - title.h) / 2);
    title.onPaper = true;
  }
  y += 44 + 8;
  const notesTop = y;
  y = stackSentences(notes.sort((a, b) => a.designY - b.designY), safe.x, y, leftW, ctx, 16);
  if (equipped) {
    equipped.fontPx = 18;
    ctx.fitText(equipped, leftW);
    equipped.x = safe.x;
    equipped.y = y;
    equipped.onPaper = true;
    y = equipped.y + equipped.h + 12;
  }
  if (y > notesTop + 8) {
    ctx.fills.push({ x: safe.x - 8, y: notesTop - 6, w: leftW + 8, h: y - notesTop + 4, color: 0xfff4dc, role: "sheet" });
  }
  const cardH = 64;
  if (cardUnits.length) {
    ctx.fills.push({ x: safe.x, y, w: leftW, h: cardH, color: 0xd5e0cf, role: "sheet" });
    const mark = cardUnits.find((unit) => unit.text === "整");
    const name = cardUnits.find((unit) => unit.text === "旅行短衣");
    const note = cardUnits.find((unit) => unit.text.includes("衣服"));
    const worn = cardUnits.find((unit) => unit.text === "穿着" || unit.text === "只给战士");
    if (mark) {
      mark.fontPx = 16;
      ctx.fitText(mark, 32);
      mark.x = safe.x + 12;
      mark.y = y + (cardH - mark.h) / 2;
      mark.onPaper = true;
    }
    if (name) {
      name.fontPx = 18;
      ctx.fitText(name, leftW - 140);
      name.x = safe.x + 48;
      name.y = y + 8;
      name.onPaper = true;
    }
    if (note) {
      note.fontPx = 14;
      ctx.fitText(note, leftW - 140);
      note.x = safe.x + 48;
      note.y = y + 34;
      note.onPaper = true;
    }
    if (worn) {
      worn.fontPx = 16;
      ctx.fitText(worn, 80);
      worn.x = safe.x + leftW - worn.w - 12;
      worn.y = y + (cardH - worn.h) / 2;
      worn.onPaper = true;
    }
    y += cardH + 8;
  }
  const titlesTop = y;
  const titlesBottom = stackSentences(titles.sort((a, b) => a.designY - b.designY), safe.x, y, leftW, ctx, 16);
  if (titlesBottom > titlesTop + 8) {
    ctx.fills.push({ x: safe.x - 8, y: titlesTop - 4, w: leftW + 8, h: titlesBottom - titlesTop + 4, color: 0xfff4dc, role: "sheet" });
  }
  const heroNode = findHero(ctx.scene);
  let hero: PhoneHero | null = null;
  if (heroNode && mirror && archBox) {
    const at = worldPoint(heroNode);
    const screenX = mirror.x + (at.x - archBox.x) * mirror.scale;
    const screenY = mirror.y + (at.y - archBox.y) * mirror.scale;
    hero = { scale: mirror.scale, ox: screenX - mirror.scale * at.x, oy: screenY - mirror.scale * at.y };
  }
  return { hero, skipMasks: true };
}

function parkLeftovers(ctx: PhoneContext, layout: PhoneLayout): PhoneLayout {
  const safe = safeOf(ctx.view);
  for (const unit of ctx.units) {
    if (unit.onPaper || unit.interactive || unit.text.trim()) continue;
    unit.x = 8;
    unit.y = 8;
    unit.w = 0;
    unit.h = 0;
    unit.onPaper = true;
  }
  const pending = ctx.units.filter((unit) => !unit.onPaper && (unit.interactive || unit.text.trim().length > 0));
  if (pending.length === 0) return layout;
  const buttons = pending.filter((unit) => unit.interactive);
  const texts = pending.filter((unit) => !unit.interactive);
  let y = safe.y + safe.h - 44;
  if (buttons.length) y = flowButtons(buttons, safe.x, Math.max(safe.y, y - (buttons.length > 3 ? 52 : 0)), safe.w, ctx.measure, 16) - 44;
  stackTexts(texts, safe.x, safe.y, Math.max(80, safe.w * 0.4), ctx.fitText, 14);
  return layout;
}

const PHONE_KEYS = new Set([
  "title",
  "guide",
  "wardrobe",
  "skills",
  "ending",
  "battle",
  "exam-battle",
  "stages",
  "review",
  "collection",
  "duel",
  "overworld",
  "learn",
  "profiles",
  "grades",
  "create",
  "battle-results",
]);

export function usesPhone(key: string): boolean {
  return PHONE_KEYS.has(key);
}

function buttonBlockHeight(buttons: PhoneUnit[], maxW: number, measure: PhoneContext["measure"]): number {
  let rows = 1;
  let used = 0;
  for (const button of buttons) {
    const width = Math.min(maxW, buttonWidth(button, measure));
    if (used > 0 && used + width > maxW) {
      rows += 1;
      used = 0;
    }
    used += width + 8;
  }
  return buttons.length ? rows * 44 + (rows - 1) * 8 : 0;
}

function hideLooseArt(ctx: PhoneContext): void {
  for (const image of ctx.images) {
    const node = image.node as (GameNode & { texture?: string; frame?: string }) | undefined;
    if (!node || isBackdrop(node)) continue;
    const frame = node.frame ?? "";
    if (frame === "panel_parchment" || frame === "panel_wood") continue;
    image.w = 0;
    image.h = 0;
  }
}

function composeRest(ctx: PhoneContext): PhoneLayout {
  dropDesktopFrames(ctx);
  hideLooseArt(ctx);
  const safe = safeOf(ctx.view);
  const backLike = /^(返回|回村子|回地图|取消)/;
  const backs = ctx.units.filter((unit) => unit.interactive && backLike.test(unit.text));
  const back = backs[0];
  for (const unit of ctx.units) {
    const blank = unit.interactive ? !unit.text.trim() : unit.text.trim() === "?";
    if (!blank) continue;
    unit.x = 8;
    unit.y = 8;
    unit.w = 0;
    unit.h = 0;
    unit.onPaper = true;
  }
  const actions = ctx.units.filter((unit) => unit.interactive && unit !== back && unit.text.trim().length > 0).sort((a, b) => a.designY - b.designY || a.designX - b.designX);
  const texts = ctx.units.filter((unit) => !unit.interactive && unit.text.trim().length > 0 && unit.text.trim() !== "?").sort((a, b) => a.designY - b.designY || a.designX - b.designX);
  let y = safe.y;
  if (back) {
    back.w = Math.min(safe.w, buttonWidth(back, ctx.measure));
    back.h = 44;
    back.x = safe.x;
    back.y = y;
    back.onPaper = true;
  }
  const heading = texts.find((unit) => unit.text.length > 0 && unit.text.length <= 12 && !unit.text.includes("。"));
  if (heading) {
    heading.fontPx = 22;
    ctx.fitText(heading, safe.w - (back ? back.w + 8 : 0));
    heading.x = back ? back.x + back.w + 8 : safe.x;
    heading.y = y + Math.max(0, (44 - heading.h) / 2);
    heading.onPaper = true;
  }
  if (back || heading) y += 44 + 8;
  const blockH = buttonBlockHeight(actions, safe.w, ctx.measure);
  const buttonTop = safe.y + safe.h - blockH;
  if (actions.length) flowButtons(actions, safe.x, buttonTop, safe.w, ctx.measure, 20);
  const body = texts.filter((unit) => unit !== heading);
  const area = { x: safe.x, y, w: safe.w, h: Math.max(16, buttonTop - 8 - y) };
  const fitColumn = (columns: number): boolean => {
    const gap = 8;
    const colW = (area.w - gap * (columns - 1)) / columns;
    const chunk = Math.ceil(body.length / columns);
    const groups: PhoneUnit[][] = Array.from({ length: columns }, () => []);
    body.forEach((unit, index) => groups[Math.min(columns - 1, Math.floor(index / chunk))].push(unit));
    let ok = true;
    groups.forEach((group, index) => {
      let cursor = area.y;
      const x = area.x + index * (colW + gap);
      for (const unit of group) {
        const next = placeSentences(unit, x, cursor, colW, ctx, unit.text.length <= 12 ? 16 : 14);
        if (next - 8 > area.y + area.h + 0.5) ok = false;
        cursor = next;
      }
    });
    return ok;
  };
  if (body.length && area.h >= 16) {
    if (!fitColumn(1) && area.w >= 360) fitColumn(2);
    const top = Math.min(...body.map((unit) => unit.y));
    const bottom = Math.max(...body.map((unit) => unit.y + unit.h));
    const left = Math.min(...body.map((unit) => unit.x));
    const right = Math.max(...body.map((unit) => unit.x + unit.w));
    ctx.fills.push({ x: left - 12, y: top - 8, w: Math.max(48, right - left + 24), h: Math.max(24, bottom - top + 16), color: 0xfff4dc, role: "sheet" });
  }
  for (const button of [back, ...actions].filter((unit): unit is PhoneUnit => Boolean(unit))) {
    ctx.fills.push({ x: button.x, y: button.y, w: button.w, h: button.h, color: 0xf0d7a2, role: "sheet" });
  }
  const heroNode = findHero(ctx.scene);
  let hero: PhoneHero | null = null;
  if (heroNode) {
    const at = worldPoint(heroNode);
    const room = Math.max(0, buttonTop - y - 16);
    const desired = Math.min(150, room);
    if (desired >= 72) {
      const scale = desired / (512 * (heroNode.scaleX || 0.5));
      const footX = safe.x + safe.w * 0.72;
      const footY = buttonTop - 8 - desired * 0.125;
      hero = { scale, ox: footX - scale * at.x, oy: footY - scale * at.y };
    }
  }
  return { hero, skipMasks: true };
}

export function composePhone(ctx: PhoneContext): PhoneLayout | null {
  let layout: PhoneLayout | null = null;
  if (ctx.key === "title") layout = composeTitle(ctx);
  else if (ctx.key === "guide") layout = composeGuide(ctx);
  else if (ctx.key === "wardrobe") layout = composeWardrobe(ctx);
  else if (usesPhone(ctx.key)) layout = composeRest(ctx);
  if (!layout) return null;
  return parkLeftovers(ctx, layout);
}
