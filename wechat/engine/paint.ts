import { screenFontPx, screenToWorld, UI_GAP, UI_HIT, worldScale, worldToScreen, type ViewBox } from "./coords";
import { displayBox, type GameNode } from "./node";
import { frameRectOf, type FrameRect } from "./scene";

/**
 * 原来：文字和按钮都乘 worldScale，paint 只 fillText / fillRect。minGap 从 8 起算，所以自报 >= 8 不能说明真的量过。
 * 现在：世界层图片按图集 frame 出 drawImage。带 geometry mask 的容器用 ctx.clip，子节点在 clip 里面 save/restore 自己的平移、旋转和翻转。命中盒与 clip 求交。
 * 为什么：衣柜列表滚出 288 高的窗口后不能再画，也不能点到被裁掉的那一截。没有 clip 的上下文不假装裁过。
 */

export interface PaintBox {
  kind: string;
  text: string;
  fontPx: number;
  x: number;
  y: number;
  w: number;
  h: number;
  interactive: boolean;
  nested: boolean;
  node: GameNode;
  lines?: string[];
}

export interface DrawImageOp {
  url: string;
  packed: string;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
  rotation: number;
  flipX: boolean;
  tint: number;
  node?: GameNode;
}

export interface FramePlan {
  items: PaintBox[];
  texts: PaintBox[];
  hits: PaintBox[];
  images: DrawImageOp[];
  fills: Array<{ x: number; y: number; w: number; h: number; color: number; node?: GameNode }>;
  minFont: number;
  minHit: number;
  minGap: number | null;
  gapPairs: number;
  overflow: number;
  measured: boolean;
}

export type MeasureText = (text: string, fontPx: number, weight: string, family: string) => number;

interface PaintContext {
  fillStyle: string;
  font: string;
  textBaseline: string;
  textAlign: string;
  globalAlpha?: number;
  globalCompositeOperation?: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
  drawImage?: (...args: number[] | [unknown, ...number[]]) => void;
  save?: () => void;
  restore?: () => void;
  translate?: (x: number, y: number) => void;
  rotate?: (radians: number) => void;
  scale?: (x: number, y: number) => void;
  measureText?: (text: string) => { width: number };
  beginPath?: () => void;
  rect?: (x: number, y: number, w: number, h: number) => void;
  clip?: () => void;
  arc?: (x: number, y: number, r: number, start: number, end: number) => void;
  stroke?: () => void;
  fill?: () => void;
  strokeStyle?: string;
  lineWidth?: number;
}

function worldOf(node: GameNode): { x: number; y: number } {
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

function designBox(node: GameNode): { x: number; y: number; w: number; h: number } {
  const at = worldOf(node);
  return displayBox({ ...node, x: at.x, y: at.y } as GameNode);
}

function flatten(nodes: GameNode[], out: GameNode[]): void {
  for (const node of nodes) {
    if (!node.visible) continue;
    out.push(node);
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (node.type === "container" && list) flatten(list, out);
  }
}

function authoredFont(node: GameNode): number {
  const style = (node as GameNode & { style?: { fontSize?: string | number } }).style;
  return Number.parseFloat(String(style?.fontSize ?? "16")) || 16;
}

function styleOf(node: GameNode): { color?: string; fontFamily?: string; fontStyle?: string } {
  return (node as GameNode & { style?: { color?: string; fontFamily?: string; fontStyle?: string } }).style ?? {};
}

function outermostHit(node: GameNode): GameNode | null {
  let root: GameNode | null = null;
  let current: GameNode | null = node;
  while (current) {
    if (current.inputEnabled) root = current;
    current = current.parent;
  }
  return root;
}

function estimateWidth(text: string, fontPx: number): number {
  let width = 0;
  for (const char of text) width += char.charCodeAt(0) > 255 ? fontPx : fontPx * 0.56;
  return Math.max(fontPx, width);
}

function wrapText(text: string, fontPx: number, maxW: number, measure: MeasureText | undefined, weight: string, family: string): string[] {
  const widthOf = (value: string) => (measure ? measure(value, fontPx, weight, family) : estimateWidth(value, fontPx));
  if (!text || widthOf(text) <= maxW) return [text];
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    const next = line + char;
    if (line && widthOf(next) > maxW) {
      lines.push(line);
      line = char;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [text];
}

function axisGap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): { gapX: number; gapY: number } {
  return {
    gapX: Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)),
    gapY: Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)),
  };
}

function neighborGap(a: PaintBox, b: PaintBox): number | null {
  const gap = axisGap(a, b);
  if (gap.gapX < 0 && gap.gapY < 0) return Math.max(gap.gapX, gap.gapY);
  if (gap.gapY < 0 && gap.gapX >= 0 && gap.gapX <= 80) return gap.gapX;
  if (gap.gapX < 0 && gap.gapY >= 0 && gap.gapY <= 80) return gap.gapY;
  return null;
}

interface Unit {
  node: GameNode;
  text: string;
  fontPx: number;
  interactive: boolean;
  design: { x: number; y: number; w: number; h: number };
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
}

function placeUnits(units: Unit[], view: ViewBox): void {
  const left = 12;
  const top = 58;
  const right = Math.max(left + UI_HIT, view.w - 12);
  const maxW = right - left;
  units.sort((a, b) => a.design.y - b.design.y || a.design.x - b.design.x);
  let x = left;
  let y = top;
  let rowH = 0;
  for (const unit of units) {
    const w = Math.min(maxW, Math.max(unit.interactive ? UI_HIT : 1, unit.w));
    const h = Math.max(unit.interactive ? UI_HIT : unit.fontPx || 14, unit.h);
    if (x > left && x + w > right) {
      x = left;
      y += rowH + UI_GAP;
      rowH = 0;
    }
    unit.x = x;
    unit.y = y;
    unit.w = w;
    unit.h = h;
    x += w + UI_GAP;
    rowH = Math.max(rowH, h);
  }
}

function textureOf(node: GameNode): { image: string; packed: string; frameRect: (frame: string) => FrameRect | null } | null {
  const scene = node.scene as { textures?: { get: (key: string) => { image: string; packed: string; missing: boolean; frameRect: (frame: string) => FrameRect | null } } } | null;
  const key = (node as GameNode & { texture?: string }).texture;
  if (!scene?.textures || !key) return null;
  const texture = scene.textures.get(key);
  if (texture.missing) return null;
  return texture;
}

function pushImage(images: DrawImageOp[], node: GameNode, frame: string, dest: { x: number; y: number; w: number; h: number }, source: FrameRect | null): void {
  const texture = textureOf(node);
  if (!texture || dest.w <= 0 || dest.h <= 0) return;
  const rect = source ?? texture.frameRect(frame) ?? texture.frameRect("");
  images.push({
    url: texture.image,
    packed: texture.packed,
    sx: rect?.x ?? 0,
    sy: rect?.y ?? 0,
    sw: rect?.w ?? 0,
    sh: rect?.h ?? 0,
    x: dest.x,
    y: dest.y,
    w: dest.w,
    h: dest.h,
    alpha: node.alpha,
    rotation: node.rotation,
    flipX: node.flipX,
    tint: node.tint,
    node,
  });
}

function sliceDest(width: number, height: number, insets: { left: number; right: number; top: number; bottom: number }, frame: FrameRect): Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }> {
  const left = Math.min(insets.left, frame.w / 2, width / 2);
  const right = Math.min(insets.right, frame.w / 2, width / 2);
  const top = Math.min(insets.top, frame.h / 2, height / 2);
  const bottom = Math.min(insets.bottom, frame.h / 2, height / 2);
  const srcLeft = Math.min(insets.left, frame.w / 2);
  const srcRight = Math.min(insets.right, frame.w / 2);
  const srcTop = Math.min(insets.top, frame.h / 2);
  const srcBottom = Math.min(insets.bottom, frame.h / 2);
  const cols = [0, left, width - right];
  const rows = [0, top, height - bottom];
  const widths = [left, Math.max(0, width - left - right), right];
  const heights = [top, Math.max(0, height - top - bottom), bottom];
  const sx = [frame.x, frame.x + srcLeft, frame.x + frame.w - srcRight];
  const sy = [frame.y, frame.y + srcTop, frame.y + frame.h - srcBottom];
  const sw = [srcLeft, Math.max(0, frame.w - srcLeft - srcRight), srcRight];
  const sh = [srcTop, Math.max(0, frame.h - srcTop - srcBottom), srcBottom];
  const parts = [];
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (widths[col] <= 0 || heights[row] <= 0 || sw[col] <= 0 || sh[row] <= 0) continue;
      parts.push({ sx: sx[col], sy: sy[row], sw: sw[col], sh: sh[row], dx: cols[col], dy: rows[row], dw: widths[col], dh: heights[row] });
    }
  }
  return parts;
}

function emitArt(images: DrawImageOp[], fills: Array<{ x: number; y: number; w: number; h: number; color: number; node?: GameNode }>, node: GameNode, dest: { x: number; y: number; w: number; h: number }): void {
  if (node.type === "rectangle") {
    const fill = (node as GameNode & { fillColor?: number }).fillColor;
    fills.push({ ...dest, color: typeof fill === "number" ? fill : 0xc9a06a, node });
    return;
  }
  if (node.type === "nineslice") {
    const slice = node as GameNode & { frame?: string; insets?: { left: number; right: number; top: number; bottom: number } };
    const texture = textureOf(node);
    const frame = texture?.frameRect(slice.frame ?? "") ?? null;
    if (frame && slice.insets) {
      for (const part of sliceDest(dest.w, dest.h, slice.insets, frame)) {
        images.push({
          url: texture?.image ?? "",
          packed: texture?.packed ?? "",
          sx: part.sx,
          sy: part.sy,
          sw: part.sw,
          sh: part.sh,
          x: dest.x + part.dx,
          y: dest.y + part.dy,
          w: part.dw,
          h: part.dh,
          alpha: node.alpha,
          rotation: 0,
          flipX: false,
          tint: node.tint,
          node,
        });
      }
    }
    return;
  }
  const image = node as GameNode & { frame?: string };
  pushImage(images, node, image.frame ?? "", dest, null);
}

interface WorldRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function childList(node: GameNode): GameNode[] | null {
  const list = (node as GameNode & { list?: GameNode[] }).list;
  return node.type === "container" && list ? list : null;
}

function maskWorldRect(node: GameNode): WorldRect | null {
  if (node.type !== "container") return null;
  const mask = node.data.get("mask") as { graphics?: GameNode & { commands?: Array<{ op: string; x: number; y: number; w: number; h: number }> } } | undefined;
  const graphics = mask?.graphics;
  if (!graphics || graphics.visible === false) return null;
  const at = worldOf(graphics);
  let rect: WorldRect | null = null;
  for (const command of graphics.commands ?? []) {
    if (command.op !== "fillRect") continue;
    const scaleX = graphics.scaleX || 1;
    const scaleY = graphics.scaleY || 1;
    const next = {
      x: at.x + command.x * scaleX,
      y: at.y + command.y * scaleY,
      w: command.w * scaleX,
      h: command.h * scaleY,
    };
    if (!rect) {
      rect = next;
      continue;
    }
    const x = Math.min(rect.x, next.x);
    const y = Math.min(rect.y, next.y);
    rect = {
      x,
      y,
      w: Math.max(rect.x + rect.w, next.x + next.w) - x,
      h: Math.max(rect.y + rect.h, next.y + next.h) - y,
    };
  }
  return rect && rect.w > 0 && rect.h > 0 ? rect : null;
}

function underMask(node: GameNode): boolean {
  let current: GameNode | null = node;
  while (current) {
    if (maskWorldRect(current)) return true;
    current = current.parent;
  }
  return false;
}

function screenBox(rect: WorldRect, view: ViewBox): WorldRect {
  const origin = worldToScreen({ x: rect.x, y: rect.y }, view);
  const scale = worldScale(view);
  return { x: origin.x, y: origin.y, w: rect.w * scale, h: rect.h * scale };
}

function intersectBox(a: WorldRect, b: WorldRect): WorldRect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right - x <= 0 || bottom - y <= 0) return null;
  return { x, y, w: right - x, h: bottom - y };
}

function collectMaskedHits(scene: { children: { list: GameNode[] } }, view: ViewBox): PaintBox[] {
  const hits: PaintBox[] = [];
  const walk = (child: GameNode, clip: WorldRect) => {
    if (!child.visible) return;
    if (child.inputEnabled) {
      const visible = intersectBox(screenBox(designBox(child), view), clip);
      if (visible) {
        hits.push({
          kind: child.type,
          text: "",
          fontPx: 0,
          x: visible.x,
          y: visible.y,
          w: visible.w,
          h: visible.h,
          interactive: true,
          nested: true,
          node: child,
        });
      }
    }
    const list = childList(child);
    if (list) for (const next of list) walk(next, clip);
  };
  const visit = (node: GameNode) => {
    if (!node.visible) return;
    const mask = maskWorldRect(node);
    if (mask) {
      const list = childList(node);
      const clip = screenBox(mask, view);
      if (list) for (const child of list) walk(child, clip);
      return;
    }
    const list = childList(node);
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
  return hits;
}

export function layoutFrame(scene: { children: { list: GameNode[] } } | null, view: ViewBox, measure?: MeasureText): FramePlan {
  const flat: GameNode[] = [];
  if (scene) flatten(scene.children.list, flat);
  const visible = flat.filter((node) => node.visible);
  const images: DrawImageOp[] = [];
  const fills: Array<{ x: number; y: number; w: number; h: number; color: number; node?: GameNode }> = [];
  const scale = worldScale(view);
  const units: Unit[] = [];
  const used = new Set<GameNode>();

  for (const node of visible) {
    if (underMask(node)) continue;
    if (outermostHit(node)) continue;
    if (node.type !== "image" && node.type !== "sprite" && node.type !== "nineslice" && node.type !== "rectangle") continue;
    const box = designBox(node);
    const screen = worldToScreen({ x: box.x, y: box.y }, view);
    emitArt(images, fills, node, { x: screen.x, y: screen.y, w: Math.max(1, box.w * scale), h: Math.max(1, box.h * scale) });
  }

  for (const node of visible) {
    if (underMask(node)) continue;
    const root = outermostHit(node);
    const owner = root ?? (node.type === "text" ? node : null);
    if (!owner || used.has(owner)) continue;
    used.add(owner);
    const design = designBox(owner);
    const fontPx = owner.type === "text" ? screenFontPx(authoredFont(owner)) : 16;
    const text = owner.type === "text" ? String((owner as GameNode & { text?: string }).text ?? "") : "";
    const style = styleOf(owner);
    const maxLine = Math.max(80, view.w - 24);
    const lines = text ? wrapText(text, fontPx, maxLine, measure, style.fontStyle ?? "", style.fontFamily ?? "sans-serif") : [];
    const lineWidth = (line: string) => (measure ? measure(line, fontPx, style.fontStyle ?? "", style.fontFamily ?? "sans-serif") : estimateWidth(line, fontPx));
    const measured = lines.reduce((max, line) => Math.max(max, lineWidth(line)), 0);
    const nestedText = owner.type !== "text"
      ? visible.filter((child) => child.type === "text" && outermostHit(child) === owner).map((child) => String((child as GameNode & { text?: string }).text ?? "")).join("")
      : "";
    const nestedFont = 16;
    const nestedWidth = nestedText
      ? (measure ? measure(nestedText, nestedFont, "700", "sans-serif") : estimateWidth(nestedText, nestedFont))
      : 0;
    units.push({
      node: owner,
      text,
      fontPx: owner.type === "text" ? fontPx : nestedText ? nestedFont : 0,
      interactive: owner.inputEnabled,
      design,
      x: 0,
      y: 0,
      w: owner.inputEnabled ? Math.min(144, Math.max(UI_HIT, Math.min(design.w || UI_HIT, 144), Math.min(nestedWidth + 16, 144))) : Math.max(1, measured || fontPx),
      h: owner.inputEnabled ? UI_HIT : Math.max(fontPx, fontPx * Math.max(1, lines.length)),
      lines,
    });
  }
  placeUnits(units, view);

  const items: PaintBox[] = [];
  for (const unit of units) {
    items.push({
      kind: unit.node.type,
      text: unit.text,
      fontPx: unit.node.type === "text" ? unit.fontPx : 0,
      x: unit.x,
      y: unit.y,
      w: unit.w,
      h: unit.h,
      interactive: unit.interactive,
      nested: false,
      node: unit.node,
      lines: unit.lines,
    });
    if (!unit.interactive) continue;
    const design = unit.design;
    for (const child of visible) {
      if (outermostHit(child) !== unit.node || child === unit.node) continue;
      const childBox = designBox(child);
      const rx = design.w > 0 ? (childBox.x - design.x) / design.w : 0;
      const ry = design.h > 0 ? (childBox.y - design.y) / design.h : 0;
      const rw = design.w > 0 ? childBox.w / design.w : 1;
      const rh = design.h > 0 ? childBox.h / design.h : 1;
      const dest = {
        x: unit.x + rx * unit.w,
        y: unit.y + ry * unit.h,
        w: Math.max(1, rw * unit.w),
        h: Math.max(1, rh * unit.h),
      };
      if (child.type === "text") {
        const fontPx = screenFontPx(authoredFont(child));
        const textX = Math.min(unit.x + unit.w - 8, Math.max(unit.x + 4, dest.x));
        items.push({
          kind: "text",
          text: String((child as GameNode & { text?: string }).text ?? ""),
          fontPx,
          x: textX,
          y: unit.y + Math.max(0, (unit.h - fontPx) / 2),
          w: Math.max(1, unit.x + unit.w - 4 - textX),
          h: fontPx,
          interactive: false,
          nested: true,
          node: child,
        });
        continue;
      }
      if (child.type === "image" || child.type === "sprite") {
        const image = child as GameNode & { frame?: string };
        pushImage(images, child, image.frame ?? "", dest, null);
      } else if (child.type === "nineslice") {
        const slice = child as GameNode & { frame?: string; insets?: { left: number; right: number; top: number; bottom: number } };
        const texture = textureOf(child);
        const frame = texture?.frameRect(slice.frame ?? "") ?? null;
        if (frame && slice.insets) {
          for (const part of sliceDest(dest.w, dest.h, slice.insets, frame)) {
            images.push({
              url: texture?.image ?? "",
              packed: texture?.packed ?? "",
              sx: part.sx,
              sy: part.sy,
              sw: part.sw,
              sh: part.sh,
              x: dest.x + part.dx,
              y: dest.y + part.dy,
              w: part.dw,
              h: part.dh,
              alpha: child.alpha,
              rotation: 0,
              flipX: false,
              tint: child.tint,
              node: child,
            });
          }
        }
      }
    }
  }

  const texts = items.filter((item) => item.kind === "text" && item.text.length > 0);
  const shelfHits = items.filter((item) => item.interactive);
  // 裁剪后的热区可能只剩一条。44 像素是货架按钮的规则，不拿裁剪余量去改它。
  const hits = shelfHits.concat(scene ? collectMaskedHits(scene, view) : []);
  const fonts = texts.map((item) => item.fontPx);
  const hitSides = shelfHits.flatMap((item) => [item.w, item.h]);
  const gaps: number[] = [];
  const gapItems = items.filter((item) => !item.nested && (item.kind === "text" || item.interactive));
  for (let left = 0; left < gapItems.length; left += 1) {
    for (let right = left + 1; right < gapItems.length; right += 1) {
      const gap = neighborGap(gapItems[left], gapItems[right]);
      if (gap !== null) gaps.push(Math.round(gap * 1000) / 1000);
    }
  }
  const overflow = items.filter((item) => item.y < 50 || item.y + item.h > view.h - 4 || item.x < 8 || item.x + item.w > view.w - 4).length;
  return {
    items,
    texts,
    hits,
    images,
    fills,
    minFont: fonts.length ? Math.min(...fonts) : 0,
    minHit: hitSides.length ? Math.min(...hitSides) : 0,
    minGap: gaps.length ? Math.min(...gaps) : null,
    gapPairs: gaps.length,
    overflow,
    measured: Boolean(measure),
  };
}

function hex(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
}

function bitmapFor(url: string): { width?: number; height?: number } | null {
  const table = (globalThis as { __LEXI_IMAGE_BITMAPS__?: Record<string, { width?: number; height?: number }> }).__LEXI_IMAGE_BITMAPS__;
  return table?.[url] ?? null;
}

function paintImage(ctx: PaintContext, op: DrawImageOp): void {
  const bitmap = bitmapFor(op.url);
  if (!bitmap || !ctx.drawImage || !ctx.save || !ctx.restore || !ctx.translate) return;
  ctx.save();
  if (typeof ctx.globalAlpha === "number" || "globalAlpha" in ctx) ctx.globalAlpha = op.alpha;
  const cx = op.x + op.w / 2;
  const cy = op.y + op.h / 2;
  ctx.translate(cx, cy);
  if (op.rotation && ctx.rotate) ctx.rotate(op.rotation);
  if (op.flipX && ctx.scale) ctx.scale(-1, 1);
  const sw = op.sw > 0 ? op.sw : bitmap.width ?? 0;
  const sh = op.sh > 0 ? op.sh : bitmap.height ?? 0;
  if (sw > 0 && sh > 0) ctx.drawImage(bitmap, op.sx, op.sy, sw, sh, -op.w / 2, -op.h / 2, op.w, op.h);
  else ctx.drawImage(bitmap, -op.w / 2, -op.h / 2, op.w, op.h);
  if (op.tint !== 0xffffff && ctx.globalCompositeOperation && sw > 0 && sh > 0) {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = hex(op.tint);
    ctx.fillRect(-op.w / 2, -op.h / 2, op.w, op.h);
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(bitmap, op.sx, op.sy, sw, sh, -op.w / 2, -op.h / 2, op.w, op.h);
  }
  ctx.restore();
}

function canClip(ctx: PaintContext): boolean {
  return Boolean(ctx.save && ctx.restore && ctx.beginPath && ctx.rect && ctx.clip);
}

function sceneIndex(scene: { children: { list: GameNode[] } }, node: GameNode | undefined): number {
  if (!node) return -1;
  return scene.children.list.indexOf(node);
}

function firstMaskIndex(scene: { children: { list: GameNode[] } }): number {
  let index = Number.POSITIVE_INFINITY;
  scene.children.list.forEach((node, at) => {
    if (maskWorldRect(node) && at < index) index = at;
  });
  return index;
}

function drawLocal(ctx: PaintContext, node: GameNode): void {
  if (node.type === "image" || node.type === "sprite") {
    const texture = textureOf(node);
    const bitmap = texture ? bitmapFor(texture.image) : null;
    const frame = texture?.frameRect((node as GameNode & { frame?: string }).frame ?? "") ?? texture?.frameRect("") ?? null;
    if (!texture || !bitmap || !ctx.drawImage) return;
    const ox = node.originX * node.width;
    const oy = node.originY * node.height;
    if (frame && frame.w > 0 && frame.h > 0) ctx.drawImage(bitmap, frame.x, frame.y, frame.w, frame.h, -ox, -oy, node.width, node.height);
    else ctx.drawImage(bitmap, -ox, -oy, node.width, node.height);
    return;
  }
  if (node.type === "nineslice") {
    const slice = node as GameNode & { frame?: string; insets?: { left: number; right: number; top: number; bottom: number } };
    const texture = textureOf(node);
    const frame = texture?.frameRect(slice.frame ?? "") ?? null;
    const bitmap = texture ? bitmapFor(texture.image) : null;
    if (!frame || !slice.insets || !bitmap || !ctx.drawImage) return;
    const ox = node.originX * node.width;
    const oy = node.originY * node.height;
    for (const part of sliceDest(node.width, node.height, slice.insets, frame)) {
      ctx.drawImage(bitmap, part.sx, part.sy, part.sw, part.sh, -ox + part.dx, -oy + part.dy, part.dw, part.dh);
    }
    return;
  }
  if (node.type === "rectangle") {
    const fill = (node as GameNode & { fillColor?: number }).fillColor;
    ctx.fillStyle = hex(typeof fill === "number" ? fill : 0xc9a06a);
    ctx.fillRect(-node.originX * node.width, -node.originY * node.height, node.width, node.height);
    return;
  }
  if (node.type === "text") {
    const text = String((node as GameNode & { text?: string }).text ?? "");
    if (!text) return;
    const style = styleOf(node);
    const fontPx = authoredFont(node);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillStyle = style.color || "#17352a";
    ctx.font = `${style.fontStyle ? `${style.fontStyle} ` : ""}${fontPx}px ${style.fontFamily || "sans-serif"}`;
    ctx.fillText(text, -node.originX * node.width, -node.originY * node.height);
    return;
  }
  if (node.type !== "graphics") return;
  const commands = (node as GameNode & { commands?: Array<Record<string, number> & { op: string }> }).commands ?? [];
  let fill = "#ffffff";
  let stroke = "#000000";
  let width = 1;
  for (const command of commands) {
    if (command.op === "fill") fill = hex(command.color);
    else if (command.op === "line") {
      stroke = hex(command.color);
      width = command.width;
    } else if (command.op === "fillRect") {
      ctx.fillStyle = fill;
      ctx.fillRect(command.x, command.y, command.w, command.h);
    } else if (command.op === "fillCircle" && ctx.beginPath && ctx.arc && ctx.fill) {
      ctx.beginPath();
      ctx.arc(command.x, command.y, command.r, 0, Math.PI * 2);
      ctx.fillStyle = fill;
      ctx.fill();
    } else if (command.op === "strokeCircle" && ctx.beginPath && ctx.arc && ctx.stroke) {
      ctx.beginPath();
      ctx.arc(command.x, command.y, command.r, 0, Math.PI * 2);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = width;
      ctx.stroke();
    }
  }
}

function paintRelative(ctx: PaintContext, node: GameNode): void {
  if (!node.visible || !ctx.save || !ctx.restore || !ctx.translate) return;
  ctx.save();
  ctx.translate(node.x, node.y);
  if (node.rotation && ctx.rotate) ctx.rotate(node.rotation);
  const sx = (node.flipX ? -1 : 1) * (node.scaleX || 1);
  const sy = node.scaleY || 1;
  if ((sx !== 1 || sy !== 1) && ctx.scale) ctx.scale(sx, sy);
  if (typeof ctx.globalAlpha === "number" || "globalAlpha" in ctx) ctx.globalAlpha = node.alpha;
  drawLocal(ctx, node);
  const list = childList(node);
  if (list) for (const child of list) paintRelative(ctx, child);
  ctx.restore();
}

function paintMaskedTrees(scene: { children: { list: GameNode[] } }, ctx: PaintContext, view: ViewBox): void {
  if (!canClip(ctx) || !ctx.save || !ctx.restore || !ctx.translate || !ctx.scale) return;
  const visit = (node: GameNode) => {
    if (!node.visible) return;
    const mask = maskWorldRect(node);
    if (!mask) {
      const list = childList(node);
      if (list) for (const child of list) visit(child);
      return;
    }
    const clip = screenBox(mask, view);
    ctx.save!();
    ctx.beginPath!();
    ctx.rect!(clip.x, clip.y, clip.w, clip.h);
    ctx.clip!();
    const origin = worldToScreen(worldOf(node), view);
    ctx.save!();
    ctx.translate!(origin.x, origin.y);
    ctx.scale!(worldScale(view), worldScale(view));
    if (node.rotation && ctx.rotate) ctx.rotate(node.rotation);
    const sx = (node.flipX ? -1 : 1) * (node.scaleX || 1);
    const sy = node.scaleY || 1;
    if (sx !== 1 || sy !== 1) ctx.scale!(sx, sy);
    const list = childList(node);
    if (list) for (const child of list) paintRelative(ctx, child);
    ctx.restore!();
    ctx.restore!();
  };
  for (const node of scene.children.list) visit(node);
}

function paintItems(ctx: PaintContext, plan: FramePlan): void {
  for (const item of plan.items) {
    if (item.kind === "text" && item.text) {
      const style = styleOf(item.node);
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = style.color || "#17352a";
      const weight = style.fontStyle ? `${style.fontStyle} ` : "";
      ctx.font = `${weight}${item.fontPx}px ${style.fontFamily || "sans-serif"}`;
      const lines = item.lines && item.lines.length ? item.lines : [item.text];
      lines.forEach((line, index) => ctx.fillText(line, item.x, item.y + index * item.fontPx));
      continue;
    }
    if (item.kind === "rectangle" || (item.interactive && !plan.images.some((op) => op.x >= item.x && op.x < item.x + item.w && op.y >= item.y && op.y < item.y + item.h))) {
      const fill = (item.node as GameNode & { fillColor?: number }).fillColor;
      ctx.fillStyle = hex(typeof fill === "number" ? fill : 0xc9a06a);
      ctx.fillRect(item.x, item.y, item.w, item.h);
    }
  }
}

export function paintFrame(scene: { children: { list: GameNode[] } } | null, ctx: PaintContext | null, view: ViewBox, measure?: MeasureText): FramePlan {
  const used = ctx?.measureText
    ? (text: string, fontPx: number, weight: string, family: string) => {
        ctx.font = `${weight ? `${weight} ` : ""}${fontPx}px ${family || "sans-serif"}`;
        return ctx.measureText?.(text).width ?? estimateWidth(text, fontPx);
      }
    : measure;
  const plan = layoutFrame(scene, view, used);
  if (!ctx) return plan;
  const maskAt = scene ? firstMaskIndex(scene) : Number.POSITIVE_INFINITY;
  const before = <T extends { node?: GameNode }>(op: T) => !scene || sceneIndex(scene, op.node) <= maskAt;
  for (const fill of plan.fills.filter(before)) {
    ctx.fillStyle = hex(fill.color);
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  for (const op of plan.images.filter(before)) paintImage(ctx, op);
  if (scene) paintMaskedTrees(scene, ctx, view);
  for (const fill of plan.fills.filter((op) => !before(op))) {
    ctx.fillStyle = hex(fill.color);
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  for (const op of plan.images.filter((op) => !before(op))) paintImage(ctx, op);
  paintItems(ctx, plan);
  return plan;
}

export function pressFrame(scene: { children: { list: GameNode[] } } | null, view: ViewBox, x: number, y: number, measure?: MeasureText): PaintBox | null {
  const plan = layoutFrame(scene, view, measure);
  const world = screenToWorld({ x, y }, view);
  const input = (scene as { input?: { activePointer?: { x: number; y: number } } } | null)?.input;
  if (input) input.activePointer = { x: world.x, y: world.y };
  const hits = plan.hits.filter((item) => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h);
  const hit = hits[hits.length - 1] ?? null;
  if (!hit) return null;
  const box = designBox(hit.node);
  hit.node.emit("pointerdown", { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  hit.node.emit("pointerup", { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  return hit;
}
