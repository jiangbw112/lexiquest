import { screenFontPx, screenToWorld, UI_GAP, UI_HIT, worldOffset, worldScale, worldToScreen, type ViewBox } from "./coords";
import { composePhone, coverBox, coverFocusFor, isBackdrop, phoneLayoutOf, rememberPhone, rewriteSceneCopy, usesPhone, type PhoneChrome, type PhoneUnit } from "./phone";
import { glyphTexture, noteGlyphFallback, type GlyphSpec } from "./glyph";
import { displayBox, type GameNode } from "./node";
import { framePlacementOf, frameRectOf, type FrameRect } from "./scene";

/**
 * 原来：外层 ctx.clip 之后子树改走 paintRelative，内层 mask 不再裁。文字每帧 fillText，货架从 (12, 58) 把字排到世界面板上。
 * 现在：每一层 mask 按真实轮廓 clip 并参与命中。文字先画进离屏纹理再 drawImage。UI 按逻辑像素放进不与面板、角色、列表相交的格子，间距用放完后的盒子现算。
 * 为什么：外包盒会把两个分开的矩形并成一块。盖住面板的字不能靠「没画出视口」当成 overflow 0。整屏背景（面积超过视口 62%）是世界底图，不把它当成面板。
 */

type MaskShape =
  | { kind: "poly"; points: Array<{ x: number; y: number }> }
  | { kind: "circle"; x: number; y: number; r: number };

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
  onPaper?: boolean;
  node: GameNode;
  lines?: string[];
  /** Center the glyph inside the box. Used for labels that share the control's box. */
  align?: "center";
  /** Overrides the donor node's ink. Used for badges that do not have their own text node. */
  ink?: string;
  polygon?: Array<{ x: number; y: number }>;
  masks?: MaskShape[][];
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
  fills: Array<{ x: number; y: number; w: number; h: number; color: number; node?: GameNode; role?: "sheet" }>;
  minFont: number;
  minHit: number;
  minGap: number | null;
  gapPairs: number;
  overflow: number;
  overlap: number;
  overlapLabels: string[];
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
  moveTo?: (x: number, y: number) => void;
  lineTo?: (x: number, y: number) => void;
  closePath?: () => void;
  setTransform?: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
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

/** Sprites that never call setDisplaySize stay 1×1. Their picture is the atlas trim at the foot pivot. */
function spriteTrimBox(node: GameNode): { x: number; y: number; w: number; h: number } | null {
  if (node.displaySized || (node.type !== "sprite" && node.type !== "image")) return null;
  const scene = node.scene as { textures?: { get: (key: string) => { data: unknown; missing: boolean } } } | null;
  const key = (node as GameNode & { texture?: string }).texture ?? "";
  const data = key && scene?.textures ? scene.textures.get(key) : null;
  const frameName = (node as GameNode & { frame?: string }).frame ?? "";
  const placed = data && !data.missing ? framePlacementOf(data.data, frameName) : null;
  if (!placed || placed.trimW < 8 || placed.trimH < 8) return null;
  const at = worldOf(node);
  const sx = node.scaleX || 1;
  const sy = node.scaleY || 1;
  return {
    x: at.x + (-node.originX * placed.sourceW + placed.trimX) * sx,
    y: at.y + (-node.originY * placed.sourceH + placed.trimY) * sy,
    w: placed.trimW * sx,
    h: placed.trimH * sy,
  };
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

function styleOf(node: GameNode): {
  color?: string;
  fontFamily?: string;
  fontStyle?: string;
  stroke?: string;
  strokeThickness?: number;
  align?: string;
  wordWrap?: { width?: number };
  lineSpacing?: number;
  maxLines?: number;
} {
  return (node as GameNode & { style?: ReturnType<typeof styleOf> }).style ?? {};
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

function buttonShell(node: GameNode): boolean {
  const list = childList(node);
  if (!list) return false;
  const hasSlice = list.some((child) => child.type === "nineslice" && child.visible);
  const labels = list.filter((child) => child.type === "text" && String((child as GameNode & { text?: string }).text ?? "").trim().length > 0);
  return hasSlice && labels.length > 0 && labels.length <= 2;
}

function buttonShellOwner(node: GameNode): GameNode | null {
  let current: GameNode | null = node;
  while (current) {
    if (buttonShell(current)) return current;
    current = current.parent;
  }
  return null;
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

function tooClose(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  const gap = axisGap(a, b);
  if (gap.gapX < 0 && gap.gapY < 0) return true;
  if (gap.gapY < 0 && gap.gapX < UI_GAP) return true;
  if (gap.gapX < 0 && gap.gapY < UI_GAP) return true;
  return false;
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
  weight: string;
  family: string;
  interactive: boolean;
  design: { x: number; y: number; w: number; h: number };
  x: number;
  y: number;
  w: number;
  h: number;
  lines: string[];
  onPaper?: boolean;
  label?: "center" | "sign";
  signFrac?: number;
  suppressFace?: boolean;
  designX: number;
  designY: number;
}

function shapeBounds(shapes: MaskShape[]): WorldRect | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  const take = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const shape of shapes) {
    if (shape.kind === "circle") {
      take(shape.x - shape.r, shape.y - shape.r);
      take(shape.x + shape.r, shape.y + shape.r);
      continue;
    }
    for (const point of shape.points) take(point.x, point.y);
  }
  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function firstMask(scene: { children: { list: GameNode[] } }): { bounds: WorldRect; shapes: MaskShape[] } | null {
  let shapes: MaskShape[] | null = null;
  const visit = (node: GameNode) => {
    if (shapes) return;
    const found = maskShapesWorld(node);
    if (found) {
      shapes = found;
      return;
    }
    const list = childList(node);
    if (list) for (const child of list) visit(child);
  };
  for (const node of scene.children.list) visit(node);
  if (!shapes) return null;
  const bounds = shapeBounds(shapes);
  return bounds ? { bounds, shapes } : null;
}

function intersectsBox(a: WorldRect, b: WorldRect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function plateKind(box: WorldRect, view: ViewBox): "room" | "paper" | "art" {
  const area = box.w * box.h;
  const viewArea = Math.max(1, view.w * view.h);
  if (area >= viewArea * 0.62) return "room";
  if (area >= viewArea * 0.18) return "paper";
  return "art";
}

function paperInterior(box: WorldRect): WorldRect {
  const inset = Math.max(16, Math.round(Math.min(box.w, box.h) * 0.08));
  const w = box.w - inset * 2;
  const h = box.h - inset * 2;
  if (w < 48 || h < 48) return box;
  return { x: box.x + inset, y: box.y + inset, w, h };
}

function clipInterior(box: WorldRect, view: ViewBox): WorldRect {
  const x = Math.max(8, box.x);
  const y = Math.max(52, box.y);
  const right = Math.min(view.w - 4, box.x + box.w);
  const bottom = Math.min(view.h - 4, box.y + box.h);
  return { x, y, w: right - x, h: bottom - y };
}

function isPaperFrame(frame: string): boolean {
  return frame === "panel_parchment" || frame === "panel_wood" || frame === "list_row" || frame.startsWith("word_chip");
}

interface Plate {
  box: WorldRect;
  kind: "room" | "paper" | "art";
  frame: string;
}

export interface LayoutOptions {
  trial?: "cross-bar";
}

function sceneKeyOf(scene: { children: { list: GameNode[] } } | null): string {
  if (scene && "key" in scene) return String((scene as { key?: string }).key ?? "");
  return "";
}

function nestedPanels(plates: Plate[]): Plate[] {
  const panels = plates.filter((plate) => plate.frame === "panel_parchment" || plate.frame === "panel_wood");
  return panels.filter((plate) => panels.some((host) => host !== plate && boxInside(plate.box, host.box) && host.box.w * host.box.h > plate.box.w * plate.box.h * 1.2));
}

function boxInside(inner: WorldRect, outer: WorldRect): boolean {
  return inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5;
}

interface Occupancy {
  blocked: Uint8Array;
  cols: number;
  rows: number;
  step: number;
}

function markBox(grid: Occupancy, box: WorldRect, value = 1): void {
  const x0 = Math.max(0, Math.floor(box.x / grid.step));
  const y0 = Math.max(0, Math.floor(box.y / grid.step));
  const x1 = Math.min(grid.cols - 1, Math.floor((box.x + Math.max(0, box.w) - 0.01) / grid.step));
  const y1 = Math.min(grid.rows - 1, Math.floor((box.y + Math.max(0, box.h) - 0.01) / grid.step));
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) grid.blocked[y * grid.cols + x] = value;
  }
}

function cellFree(grid: Occupancy, x: number, y: number, w: number, h: number): boolean {
  const x0 = Math.floor(x / grid.step);
  const y0 = Math.floor(y / grid.step);
  const x1 = Math.floor((x + w - 0.01) / grid.step);
  const y1 = Math.floor((y + h - 0.01) / grid.step);
  if (x0 < 0 || y0 < 0 || x1 >= grid.cols || y1 >= grid.rows) return false;
  for (let yy = y0; yy <= y1; yy += 1) {
    for (let xx = x0; xx <= x1; xx += 1) if (grid.blocked[yy * grid.cols + xx]) return false;
  }
  return true;
}

function fitText(unit: Unit, maxW: number, measure: MeasureText | undefined): void {
  const lines = wrapText(unit.text, unit.fontPx, Math.max(14, maxW), measure, unit.weight, unit.family);
  const widthOf = (line: string) => (measure ? measure(line, unit.fontPx, unit.weight, unit.family) : estimateWidth(line, unit.fontPx));
  unit.lines = lines;
  unit.w = Math.max(1, Math.min(maxW, lines.reduce((max, line) => Math.max(max, widthOf(line)), unit.fontPx)));
  unit.h = Math.max(unit.fontPx, lines.length * unit.fontPx);
}

function placeUnits(
  units: Unit[],
  view: ViewBox,
  scene: { children: { list: GameNode[] } } | null,
  plates: Plate[],
  fills: Array<{ x: number; y: number; w: number; h: number; color: number; node?: GameNode; role?: "sheet" }>,
  measure: MeasureText | undefined,
  options?: LayoutOptions,
): void {
  // 原来：羊皮纸九宫格被拆开，中心块不够大时整段说明落到纸外，再铺一条和字一样大的奶油底。
  // 现在：整张羊皮纸、木牌和列表行是一张纸。说明按行排进纸心，字号可以收到 14，不再铺纸外条。没有纸的画面另开一张有内边距的纸。
  // 为什么：纸外条把字留在绿底上。结算和指南要能在纸里面读完，不删句子。
  const step = 4;
  const grid: Occupancy = {
    blocked: new Uint8Array(Math.ceil(view.w / step) * Math.ceil(view.h / step)),
    cols: Math.ceil(view.w / step),
    rows: Math.ceil(view.h / step),
    step,
  };
  markBox(grid, { x: 0, y: 0, w: view.w, h: 52 });
  markBox(grid, { x: 0, y: view.h - 4, w: view.w, h: 4 });
  markBox(grid, { x: 0, y: 0, w: 8, h: view.h });
  markBox(grid, { x: view.w - 4, y: 0, w: 4, h: view.h });
  const papers = plates
    .filter((plate) => plate.kind === "paper" && plate.box.w > 0 && plate.box.h > 0)
    .map((plate) => ({ outer: plate.box, inner: clipInterior(paperInterior(plate.box), view) }))
    .filter((plate) => plate.inner.w >= 48 && plate.inner.h >= 28)
    .sort((a, b) => b.inner.w * b.inner.h - a.inner.w * a.inner.h);
  const packing = papers.length > 1
    ? [papers[0], ...papers.slice(1).filter((plate) => !boxInside(plate.outer, papers[0].outer))]
    : papers;
  for (const plate of packing) {
    markBox(grid, plate.outer);
    markBox(grid, plate.inner, 0);
  }
  for (const plate of plates) {
    if (plate.kind !== "art" || plate.box.w <= 0 || plate.box.h <= 0) continue;
    markBox(grid, plate.box);
  }
  if (scene) {
    const mask = firstMask(scene);
    if (mask) {
      const band = shapeBounds(screenShapes(mask.shapes, view));
      if (band) markBox(grid, band);
    }
  }
  const copy = units.filter((unit) => !unit.interactive && unit.text.length > 0 && unit.text !== "词境练习家" && !String(unit.node.name || "").startsWith("pin:")).sort((a, b) => a.design.y - b.design.y || a.design.x - b.design.x);
  const separated = (rect: WorldRect, prev: WorldRect): boolean => {
    const gapX = Math.max(rect.x - (prev.x + prev.w), prev.x - (rect.x + rect.w));
    const gapY = Math.max(rect.y - (prev.y + prev.h), prev.y - (rect.y + rect.h));
    if (gapX < 0 && gapY < 0) return false;
    if (gapY < 0 && gapX < UI_GAP) return false;
    if (gapX < 0 && gapY < UI_GAP) return false;
    return true;
  };
  const maskBand = scene ? firstMask(scene) : null;
  const maskHits = maskBand ? screenShapes(maskBand.shapes, view) : [];
  const shelfInto = (region: WorldRect): boolean => {
    const originals = copy.map((unit) => unit.fontPx);
    const arts = plates.filter((plate) => plate.kind === "art" && intersectsBox(plate.box, region));
    const blocked = (rect: WorldRect) => arts.some((plate) => intersectsBox(rect, plate.box)) || maskHits.some((shape) => boxHitsShape(rect, shape));
    const maxFont = Math.max(14, ...originals, 14);
    for (let cap = maxFont; cap >= 14; cap -= 1) {
      const placed: WorldRect[] = [];
      let x = region.x;
      let y = region.y;
      let rowH = 0;
      let ok = true;
      for (let index = 0; index < copy.length; index += 1) {
        const unit = copy[index];
        unit.fontPx = Math.max(14, Math.min(originals[index], cap));
        fitText(unit, Math.max(28, region.w), measure);
        const accept = (px: number, py: number) => {
          const rect = { x: px, y: py, w: unit.w, h: unit.h };
          if (py + rect.h > region.y + region.h + 0.1 || px + rect.w > region.x + region.w + 0.1) return false;
          if (blocked(rect) || placed.some((prev) => !separated(rect, prev))) return false;
          unit.x = px;
          unit.y = py;
          return true;
        };
        if (x > region.x && x + unit.w > region.x + region.w) {
          x = region.x;
          y += rowH + UI_GAP;
          rowH = 0;
        }
        let parked = y + unit.h <= region.y + region.h + 0.1 && accept(x, y);
        if (!parked) {
          for (let yy = y; yy + unit.h <= region.y + region.h && !parked; yy += Math.max(14, unit.h)) {
            for (let xx = region.x; xx + unit.w <= region.x + region.w && !parked; xx += 12) {
              if (!accept(xx, yy)) continue;
              x = xx;
              y = yy;
              rowH = 0;
              parked = true;
            }
          }
        }
        if (!parked) {
          ok = false;
          break;
        }
        unit.onPaper = true;
        placed.push({ x: unit.x, y: unit.y, w: unit.w, h: unit.h });
        x = unit.x + unit.w + UI_GAP;
        rowH = Math.max(rowH, unit.h);
      }
      if (ok) {
        for (const rect of placed) markBox(grid, { x: rect.x - UI_GAP, y: rect.y - UI_GAP, w: rect.w + UI_GAP * 2, h: rect.h + UI_GAP * 2 });
        return true;
      }
    }
    copy.forEach((unit, index) => {
      unit.fontPx = originals[index];
      unit.onPaper = false;
    });
    return false;
  };
  const shelfSome = (region: WorldRect, group: Unit[], obstacles: WorldRect[]): Unit[] => {
    if (group.length === 0) return [];
    if (region.w < 28 || region.h < 14) return group.slice();
    const originals = group.map((unit) => unit.fontPx);
    const arts = plates.filter((plate) => plate.kind === "art" && intersectsBox(plate.box, region) && !(options?.trial === "cross-bar" && plate.frame === "progress_frame"));
    const maskBand = scene ? firstMask(scene) : null;
    const maskHits = maskBand ? screenShapes(maskBand.shapes, view) : [];
    const blocked = (rect: WorldRect) => obstacles.some((box) => tooClose(rect, box)) || arts.some((plate) => intersectsBox(rect, plate.box)) || maskHits.some((shape) => boxHitsShape(rect, shape));
    const bags: WorldRect[][] = [];
    const run = (cap: number): Unit[] => {
      const placed: WorldRect[] = [];
      bags.push(placed);
      const missed: Unit[] = [];
      let x = region.x;
      let y = region.y;
      let rowH = 0;
      for (let index = 0; index < group.length; index += 1) {
        const unit = group[index];
        unit.fontPx = Math.max(14, Math.min(originals[index], cap));
        fitText(unit, Math.max(28, region.w), measure);
        const accept = (px: number, py: number) => {
          const rect = { x: px, y: py, w: unit.w, h: unit.h };
          if (py + rect.h > region.y + region.h + 0.1 || px + rect.w > region.x + region.w + 0.1) return false;
          if (blocked(rect) || placed.some((prev) => tooClose(rect, prev))) return false;
          unit.x = px;
          unit.y = py;
          return true;
        };
        if (x > region.x && x + unit.w > region.x + region.w) {
          x = region.x;
          y += rowH + UI_GAP;
          rowH = 0;
        }
        let parked = y + unit.h <= region.y + region.h + 0.1 && accept(x, y);
        if (!parked) {
          for (let yy = y; yy + unit.h <= region.y + region.h && !parked; yy += Math.max(14, unit.h)) {
            for (let xx = region.x; xx + unit.w <= region.x + region.w && !parked; xx += 12) {
              if (!accept(xx, yy)) continue;
              x = xx;
              y = yy;
              rowH = 0;
              parked = true;
            }
          }
        }
        if (!parked) {
          unit.onPaper = false;
          missed.push(unit);
          continue;
        }
        unit.onPaper = true;
        placed.push({ x: unit.x, y: unit.y, w: unit.w, h: unit.h });
        x = unit.x + unit.w + UI_GAP;
        rowH = Math.max(rowH, unit.h);
      }
      return missed;
    };
    let bestCap = Math.max(14, ...originals, 14);
    let bestMiss = group.length + 1;
    for (let cap = bestCap; cap >= 14; cap -= 1) {
      const missed = run(cap);
      if (missed.length < bestMiss) {
        bestMiss = missed.length;
        bestCap = cap;
      }
    }
    const missed = run(bestCap);
    const placed = bags[bags.length - 1] ?? [];
    for (const rect of placed) markBox(grid, { x: rect.x - UI_GAP, y: rect.y - UI_GAP, w: rect.w + UI_GAP * 2, h: rect.h + UI_GAP * 2 });
    return missed;
  };
  const openSheet = (group: Unit[]): boolean => {
    if (group.length === 0) return true;
    const sheetOriginals = group.map((unit) => unit.fontPx);
    const maxFont = Math.max(14, ...sheetOriginals, 14);
    const originOf = (unit: Unit) => sheetOriginals[group.indexOf(unit)] ?? unit.fontPx;
    const layoutColumns = (columns: Unit[][], innerW: number, cap: number): number => {
      let height = 0;
      for (const column of columns) {
        let y = 0;
        for (const unit of column) {
          unit.fontPx = Math.max(14, Math.min(originOf(unit), cap));
          fitText(unit, Math.max(28, innerW), measure);
          if (y > 0) y += UI_GAP;
          y += unit.h;
        }
        height = Math.max(height, y);
      }
      return height;
    };
    const paintColumns = (outer: WorldRect, columns: Unit[][], innerW: number): void => {
      columns.forEach((column, columnIndex) => {
        let penY = outer.y + 16;
        const penX = outer.x + 20 + columnIndex * (innerW + UI_GAP);
        for (const unit of column) {
          unit.x = penX;
          unit.y = penY;
          unit.onPaper = true;
          penY += unit.h + UI_GAP;
          markBox(grid, { x: unit.x - UI_GAP, y: unit.y - UI_GAP, w: unit.w + UI_GAP * 2, h: unit.h + UI_GAP * 2 });
        }
      });
    };
    const tryCard = (columns: Unit[][], innerW: number, cap: number): boolean => {
      const height = layoutColumns(columns, innerW, cap);
      const outerH = Math.max(72, height + 32);
      const outerW = 40 + columns.length * innerW + Math.max(0, columns.length - 1) * UI_GAP;
      if (height <= 0 || outerH > view.h - 56 || outerW > view.w - 16) return false;
      for (let y = 52; y + outerH <= view.h - 4; y += step) {
        for (let x = 8; x + outerW <= view.w - 4; x += step) {
          if (!cellFree(grid, x, y, outerW, outerH)) continue;
          const outer = { x, y, w: outerW, h: outerH };
          if (sceneKeyOf(scene) === "stages" && plates.some((plate) => (plate.frame === "panel_parchment" || plate.frame === "panel_wood") && tooClose(outer, plate.box))) continue;
          fills.push({ ...outer, color: 0xfff4dc, role: "sheet" });
          plates.push({ box: outer, kind: "paper", frame: "sheet" });
          markBox(grid, outer);
          paintColumns(outer, columns, innerW);
          return true;
        }
      }
      return false;
    };
    const columnWidths = [440, 360, 300, 240, 180, 150]
      .map((value) => Math.min(value, view.w - 72))
      .filter((value, index, list) => value >= 120 && list.indexOf(value) === index);
    for (const innerW of columnWidths) {
      for (let cap = maxFont; cap >= 14; cap -= 1) {
        if (tryCard([group], innerW, cap)) return true;
      }
    }
    if (group.length > 1) {
      const mid = Math.ceil(group.length / 2);
      const pairWidths = [220, 180, 150, 120]
        .map((value) => Math.min(value, Math.floor((view.w - 88) / 2)))
        .filter((value, index, list) => value >= 100 && list.indexOf(value) === index);
      for (const innerW of pairWidths) {
        for (let cap = maxFont; cap >= 14; cap -= 1) {
          if (tryCard([group.slice(0, mid), group.slice(mid)], innerW, cap)) return true;
        }
      }
    }
    const packHole = (): boolean => {
      for (const bandH of [150, 180, 210, 240, 280, 320]) {
        if (bandH > view.h - 56) continue;
        let best: { x: number; y: number; w: number } | null = null;
        for (let y = 52; y + bandH <= view.h - 4; y += 8) {
          let run = 0;
          let runX = 8;
          for (let x = 8; x <= view.w - 4; x += 4) {
            if (cellFree(grid, x, y, 4, bandH)) {
              if (run === 0) runX = x;
              run += 4;
              if (!best || run > best.w) best = { x: runX, y, w: run };
            } else run = 0;
          }
        }
        if (!best || best.w < 140) continue;
        if (sceneKeyOf(scene) === "stages" && plates.some((plate) => (plate.frame === "panel_parchment" || plate.frame === "panel_wood") && tooClose({ x: best.x, y: best.y, w: best.w, h: bandH }, plate.box))) continue;
        const innerW = best.w - 40;
        const innerH = bandH - 32;
        for (let cap = maxFont; cap >= 14; cap -= 1) {
          const spots: Array<{ unit: Unit; x: number; y: number }> = [];
          let penX = 0;
          let penY = 0;
          let rowH = 0;
          let fits = true;
          for (let index = 0; index < group.length; index += 1) {
            const unit = group[index];
            unit.fontPx = Math.max(14, Math.min(sheetOriginals[index], cap));
            fitText(unit, Math.max(28, innerW), measure);
            if (penX > 0 && penX + unit.w > innerW) {
              penX = 0;
              penY += rowH + UI_GAP;
              rowH = 0;
            }
            if (unit.w > innerW || penY + unit.h > innerH) {
              fits = false;
              break;
            }
            spots.push({ unit, x: penX, y: penY });
            penX += unit.w + UI_GAP;
            rowH = Math.max(rowH, unit.h);
          }
          if (!fits || spots.length !== group.length) continue;
          const outer = { x: best.x, y: best.y, w: best.w, h: bandH };
          fills.push({ ...outer, color: 0xfff4dc, role: "sheet" });
          plates.push({ box: outer, kind: "paper", frame: "sheet" });
          markBox(grid, outer);
          for (const spot of spots) {
            spot.unit.x = outer.x + 20 + spot.x;
            spot.unit.y = outer.y + 16 + spot.y;
            spot.unit.onPaper = true;
            markBox(grid, { x: spot.unit.x - UI_GAP, y: spot.unit.y - UI_GAP, w: spot.unit.w + UI_GAP * 2, h: spot.unit.h + UI_GAP * 2 });
          }
          return true;
        }
      }
      return false;
    };
    if (packHole()) return true;
    const width = Math.min(480, view.w - 32);
    for (let cap = maxFont; cap >= 14; cap -= 1) {
      const innerW = width - 40;
      let cursorX = 0;
      let cursorY = 0;
      let rowH = 0;
      let tooTall = false;
      for (let index = 0; index < group.length; index += 1) {
        const unit = group[index];
        unit.fontPx = Math.max(14, Math.min(sheetOriginals[index], cap));
        fitText(unit, Math.max(28, innerW), measure);
        if (cursorX > 0 && cursorX + unit.w > innerW) {
          cursorX = 0;
          cursorY += rowH + UI_GAP;
          rowH = 0;
        }
        if (cursorY + unit.h > view.h - 80) tooTall = true;
        cursorX += unit.w + UI_GAP;
        rowH = Math.max(rowH, unit.h);
      }
      if (tooTall) continue;
      const outerH = Math.max(72, cursorY + rowH + 32);
      const outerW = width;
      for (let y = 52; y + outerH <= view.h - 4; y += step) {
        for (let x = 8; x + outerW <= view.w - 4; x += step) {
          if (!cellFree(grid, x, y, outerW, outerH)) continue;
          const outer = { x, y, w: outerW, h: outerH };
          if (sceneKeyOf(scene) === "stages" && plates.some((plate) => (plate.frame === "panel_parchment" || plate.frame === "panel_wood") && tooClose(outer, plate.box))) continue;
          const inner = { x: x + 20, y: y + 16, w: innerW, h: outerH - 32 };
          fills.push({ ...outer, color: 0xfff4dc, role: "sheet" });
          plates.push({ box: outer, kind: "paper", frame: "sheet" });
          markBox(grid, outer);
          let penX = inner.x;
          let penY = inner.y;
          let lineH = 0;
          for (const unit of group) {
            if (penX > inner.x && penX + unit.w > inner.x + inner.w) {
              penX = inner.x;
              penY += lineH + UI_GAP;
              lineH = 0;
            }
            unit.x = penX;
            unit.y = penY;
            unit.onPaper = true;
            penX += unit.w + UI_GAP;
            lineH = Math.max(lineH, unit.h);
            markBox(grid, { x: unit.x - UI_GAP, y: unit.y - UI_GAP, w: unit.w + UI_GAP * 2, h: unit.h + UI_GAP * 2 });
          }
          return true;
        }
      }
    }
    group.forEach((unit, index) => {
      unit.fontPx = sheetOriginals[index];
      unit.onPaper = false;
    });
    return false;
  };
  const sceneKey = sceneKeyOf(scene);
  // 原来：关卡图把未解锁词的「?」和说明排进同一张垫纸，右列几乎全是问号。
  // 现在：「?」回到词卡中心，说明单独排。问号仍在，不删。
  // 为什么：问号是词卡上的标记，不是说明句子。留在右列会把左侧纸挤成两列。
  const stageFaces = sceneKey === "stages" ? copy.filter((unit) => unit.text.trim() === "?") : [];
  if (stageFaces.length > 0) {
    for (let index = copy.length - 1; index >= 0; index -= 1) {
      if (copy[index]?.text.trim() === "?") copy.splice(index, 1);
    }
  }
  const parkStageFaces = (): void => {
    if (stageFaces.length === 0) return;
    const cards = plates
      .filter((plate) => plate.frame === "map_word_unknown" || plate.frame === "map_word_card")
      .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
    stageFaces.forEach((unit, index) => {
      const card = cards[index];
      if (!card) return;
      unit.fontPx = 14;
      fitText(unit, Math.max(14, card.box.w - 8), measure);
      unit.x = card.box.x + Math.max(0, (card.box.w - unit.w) / 2);
      unit.y = card.box.y + Math.max(0, (card.box.h - unit.h) / 2);
      unit.onPaper = true;
    });
  };
  const authoredPx = copy.map((unit) => unit.fontPx);
  const restoreAuthored = (): void => {
    copy.forEach((unit, index) => {
      unit.fontPx = authoredPx[index] ?? unit.fontPx;
    });
  };
  const skillName = (unit: Unit): boolean => unit.weight.includes("700") && unit.text.trim().length > 0 && unit.text.trim().length <= 6 && !unit.text.includes("。");
  const skillStar = (unit: Unit): boolean => unit.text.trim().startsWith("★");
  const skillBlocks = (): Array<{ units: Unit[]; skill: boolean }> => {
    const blocks: Array<{ units: Unit[]; skill: boolean }> = [];
    let index = 0;
    while (index < copy.length) {
      const unit = copy[index];
      if (!unit || !skillName(unit)) {
        if (unit) blocks.push({ units: [unit], skill: false });
        index += 1;
        continue;
      }
      const group = [unit];
      const originY = unit.design.y;
      index += 1;
      if (index < copy.length && copy[index] && skillStar(copy[index]) && copy[index].design.y - originY < 48) {
        group.push(copy[index]);
        index += 1;
      }
      if (index < copy.length && copy[index] && !skillName(copy[index]) && !skillStar(copy[index]) && copy[index].design.y - originY < 100) {
        group.push(copy[index]);
        index += 1;
      }
      blocks.push({ units: group, skill: true });
    }
    return blocks;
  };
  const cornerOf = (box: WorldRect): number => Math.min(40, box.w / 2, box.h / 2);
  const roomIn = (box: WorldRect, left: number, top: number, right: number, bottom: number): WorldRect => {
    const x = box.x + left;
    const y = Math.max(52, box.y + top);
    const rightEdge = Math.min(view.w - 4, box.x + box.w - right);
    const bottomEdge = Math.min(view.h - 4, box.y + box.h - bottom);
    return { x, y, w: rightEdge - x, h: bottomEdge - y };
  };
  const layoutBlocks = (blocks: Array<{ units: Unit[]; skill: boolean }>, region: WorldRect, cap: number): { height: number; spots: Array<{ unit: Unit; x: number; y: number }> } | null => {
    restoreAuthored();
    const spots: Array<{ unit: Unit; x: number; y: number }> = [];
    let y = 0;
    const capOf = (unit: Unit) => Math.max(14, Math.min(authoredPx[copy.indexOf(unit)] ?? unit.fontPx, cap));
    for (const block of blocks) {
      if (y > 0) y += UI_GAP;
      if (!block.skill) {
        const unit = block.units[0];
        if (!unit) continue;
        unit.fontPx = capOf(unit);
        fitText(unit, Math.max(28, region.w), measure);
        if (y + unit.h > region.h + 0.1) return null;
        spots.push({ unit, x: 0, y });
        y += unit.h;
        continue;
      }
      const name = block.units[0];
      const star = block.units.find((unit) => skillStar(unit));
      const desc = block.units.find((unit) => unit !== name && unit !== star);
      if (!name) continue;
      name.fontPx = capOf(name);
      fitText(name, Math.max(28, region.w), measure);
      let rowH = name.h;
      if (star) {
        star.fontPx = capOf(star);
        fitText(star, Math.max(28, region.w), measure);
        if (name.w + UI_GAP + star.w <= region.w) {
          if (y + Math.max(name.h, star.h) > region.h + 0.1) return null;
          spots.push({ unit: name, x: 0, y });
          spots.push({ unit: star, x: name.w + UI_GAP, y: y + Math.max(0, (name.h - star.h) / 2) });
          rowH = Math.max(name.h, star.h);
        } else {
          if (y + name.h > region.h + 0.1) return null;
          spots.push({ unit: name, x: 0, y });
          y += name.h + UI_GAP;
          if (y + star.h > region.h + 0.1) return null;
          spots.push({ unit: star, x: 0, y });
          rowH = star.h;
        }
      } else if (y + name.h > region.h + 0.1) return null;
      else spots.push({ unit: name, x: 0, y });
      y += rowH;
      if (!desc) continue;
      y += UI_GAP;
      desc.fontPx = capOf(desc);
      fitText(desc, Math.max(28, region.w), measure);
      if (y + desc.h > region.h + 0.1) return null;
      spots.push({ unit: desc, x: 0, y });
      y += desc.h;
    }
    return { height: y, spots };
  };
  const commitStack = (region: WorldRect, placed: { height: number; spots: Array<{ unit: Unit; x: number; y: number }> }, sheet: boolean, coverRows: boolean): void => {
    for (const spot of placed.spots) {
      spot.unit.x = region.x + spot.x;
      spot.unit.y = region.y + spot.y;
      spot.unit.onPaper = true;
      markBox(grid, { x: spot.unit.x - UI_GAP, y: spot.unit.y - UI_GAP, w: spot.unit.w + UI_GAP * 2, h: spot.unit.h + UI_GAP * 2 });
    }
    if (!sheet || placed.spots.length === 0) return;
    const pad = 12;
    const panel = plates.find((plate) => plate.frame === "panel_parchment");
    let left = region.x - pad;
    let right = region.x + region.w + pad;
    if (coverRows) {
      const top = region.y;
      const bottom = region.y + placed.height;
      for (const row of plates) {
        if (row.frame !== "list_row") continue;
        if (row.box.y + row.box.h < top - pad || row.box.y > bottom + pad) continue;
        left = Math.min(left, row.box.x);
        right = Math.max(right, row.box.x + row.box.w);
      }
    }
    if (panel) {
      left = Math.max(left, panel.box.x + UI_GAP);
      right = Math.min(right, panel.box.x + panel.box.w - UI_GAP);
    }
    const outer = {
      x: left,
      y: region.y - pad,
      w: Math.max(1, right - left),
      h: placed.height + pad * 2,
    };
    fills.push({ ...outer, color: 0xfff4dc, role: "sheet" });
    plates.push({ box: outer, kind: "paper", frame: "sheet" });
    markBox(grid, outer);
  };
  // 原来：技能末行把「盾击」、说明和下一张卡的名字排在同一行。指南标题落在羊皮纸左上角的叶子上。
  // 现在：每张技能卡先写名字和星，下一行只写它自己的说明。指南标题从叶子和上沿下面起排。
  // 为什么：名字和说明要成对，标题要离开叶子。垫纸仍然盖住列表行，说明不回到行框上。
  const stackSkills = (): boolean => {
    const panel = plates.find((plate) => plate.frame === "panel_parchment");
    if (!panel || copy.length === 0) return false;
    const blocks = skillBlocks();
    const corner = cornerOf(panel.box);
    const rooms = [
      roomIn(panel.box, corner + 20, corner + 20, corner + UI_GAP, corner + UI_GAP),
      roomIn(panel.box, corner + 20, corner + 20, corner + UI_GAP, 12),
    ];
    for (const region of rooms) {
      if (region.w < 80 || region.h < 40) continue;
      for (let cap = Math.max(14, ...authoredPx, 14); cap >= 14; cap -= 1) {
        const placed = layoutBlocks(blocks, region, cap);
        if (!placed) continue;
        commitStack(region, placed, true, true);
        return true;
      }
    }
    restoreAuthored();
    return false;
  };
  const stackGuide = (): boolean => {
    const panel = plates.find((plate) => plate.frame === "panel_parchment");
    if (!panel || copy.length === 0) return false;
    const corner = cornerOf(panel.box);
    const region = roomIn(panel.box, corner + UI_GAP, corner + UI_GAP, 12, 12);
    if (region.w < 80 || region.h < 28) return false;
    const blocks = copy.map((unit) => ({ units: [unit], skill: false }));
    for (let cap = Math.max(14, ...authoredPx, 14); cap >= 14; cap -= 1) {
      const placed = layoutBlocks(blocks, region, cap);
      if (!placed) continue;
      commitStack(region, placed, false, false);
      return true;
    }
    restoreAuthored();
    return false;
  };
  const strictRows = sceneKey === "battle-results" || sceneKey === "skills";
  const strictBar = sceneKey === "battle-results" && options?.trial !== "cross-bar";
  const strictNest = sceneKey === "duel";
  const nests = strictNest ? nestedPanels(plates) : [];
  const bars = plates.filter((plate) => (strictRows && plate.frame === "list_row") || (strictBar && plate.frame === "progress_frame"));
  let onPaper = false;
  if (sceneKey === "guide" && stackGuide()) {
    onPaper = true;
  } else if (sceneKey === "skills" && stackSkills()) {
    onPaper = true;
  } else if (!strictRows && !strictNest) {
    for (const plate of packing) {
      if (shelfInto(plate.inner)) {
        onPaper = true;
        break;
      }
    }
    if (!onPaper) onPaper = openSheet(copy);
  } else {
    // 原来：结算句子排进整张纸心，后两行盖住奖励卡并贴着经验条。技能说明穿过列表行。对战说明穿过内层小纸。overlap 仍是 0。
    // 现在：这些框计入阻挡。纸心排得下的留在纸内，排不下的改放到有内边距的垫纸。穿过经验条只在 trial=cross-bar 时出现，页面不会打开它。
    // 为什么：垫纸把排不下的句子留在可读的纸上，不再靠 overlap 0 把字留在卡或经验条上。
    const inflate = (box: WorldRect): WorldRect => ({ x: box.x - UI_GAP, y: box.y - UI_GAP, w: box.w + UI_GAP * 2, h: box.h + UI_GAP * 2 });
    for (const plate of bars) markBox(grid, inflate(plate.box));
    for (const plate of nests) markBox(grid, inflate(plate.box));
    const host = packing[0];
    const missed: Unit[] = [];
    const rest = copy;
    const obstacles = [
      ...bars.flatMap((plate) => plate.frame === "progress_frame" && host
        ? [{ x: host.inner.x, y: plate.box.y - UI_GAP, w: host.inner.w, h: plate.box.h + UI_GAP * 2 }]
        : [plate.box]),
      ...nests.map((plate) => plate.box),
    ];
    if (host) missed.push(...shelfSome(host.inner, rest, obstacles));
    else missed.push(...rest);
    if (host) {
      markBox(host.outer, 0);
      for (const unit of copy) {
        if (!unit.onPaper) continue;
        markBox(grid, { x: unit.x - UI_GAP, y: unit.y - UI_GAP, w: unit.w + UI_GAP * 2, h: unit.h + UI_GAP * 2 });
      }
      for (const plate of plates) if (plate.kind === "art") markBox(grid, plate.box);
      for (const plate of bars) if (plate.frame !== "list_row") markBox(grid, inflate(plate.box));
      for (const plate of nests) markBox(grid, inflate(plate.box));
    }
    onPaper = openSheet(missed);
  }
  // 原来：给家长的密码只在 DOM 里，画布上没有可点的数字键。
  // 现在：pin: 开头的字和键排成一块小键盘，宽屏放在说明纸旁边，窄屏放在纸下面。
  // 为什么：这是微信自己的数字键，不把网页右侧那张设密码卡搬过来。键仍写入原来的家长密码字段。
  const stackPin = (): void => {
    const pinNamed = (unit: Unit) => String(unit.node.name || "").startsWith("pin:");
    const labels = units.filter((unit) => pinNamed(unit) && !unit.interactive && unit.text.length > 0);
    const keys = units.filter((unit) => pinNamed(unit) && unit.interactive);
    if (labels.length === 0 && keys.length === 0) return;
    const panel = plates.find((plate) => plate.frame === "panel_parchment" || plate.frame === "panel_wood");
    const gap = UI_GAP;
    const keyH = UI_HIT;
    const fitCols = (cols: number) => cols * UI_HIT + Math.max(0, cols - 1) * gap + 16;
    const cols = fitCols(4) <= Math.max(220, view.w * 0.42) ? 4 : 3;
    const rows = Math.max(1, Math.ceil(keys.length / cols));
    let labelH = 0;
    for (const unit of labels) {
      unit.fontPx = Math.max(14, Math.min(unit.fontPx, 18));
      labelH += unit.fontPx + 4;
    }
    const blockH = labelH + rows * keyH + Math.max(0, rows - 1) * gap + 16;
    const blockW = fitCols(cols);
    let band = { x: Math.max(8, view.w - blockW - 8), y: Math.max(56, view.h - blockH - 8), w: blockW, h: blockH };
    if (panel) {
      const rightX = panel.box.x + panel.box.w + 12;
      const rightW = view.w - rightX - 8;
      const belowY = panel.box.y + panel.box.h + 8;
      if (rightW >= blockW) band = { x: rightX, y: Math.max(56, panel.box.y + 8), w: Math.min(rightW, 320), h: blockH };
      else if (view.h - belowY >= blockH) band = { x: Math.max(8, panel.box.x), y: belowY, w: Math.min(panel.box.w, blockW), h: blockH };
      else band = { x: Math.max(8, view.w - blockW - 8), y: Math.max(56, Math.min(panel.box.y + 8, view.h - blockH - 8)), w: blockW, h: blockH };
    }
    if (band.x + band.w > view.w - 4) band.x = Math.max(8, view.w - 4 - band.w);
    if (band.y + band.h > view.h - 4) band.y = Math.max(56, view.h - 4 - band.h);
    fills.push({ x: band.x, y: band.y, w: Math.min(band.w, view.w - band.x - 4), h: band.h, color: 0xfff4dc, role: "sheet" });
    markBox(grid, { x: band.x - UI_GAP, y: band.y - UI_GAP, w: band.w + UI_GAP * 2, h: band.h + UI_GAP * 2 });
    let y = band.y + 8;
    for (const unit of labels) {
      fitText(unit, Math.max(28, band.w - 16), measure);
      unit.x = band.x + 8;
      unit.y = y;
      unit.onPaper = true;
      y += unit.h + 4;
    }
    const keyW = Math.max(UI_HIT, Math.min(72, Math.floor((band.w - 16 - gap * (cols - 1)) / cols)));
    keys.forEach((unit, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      unit.w = keyW;
      unit.h = keyH;
      unit.x = band.x + 8 + col * (keyW + gap);
      unit.y = y + row * (keyH + gap);
      unit.onPaper = true;
    });
  };
  stackPin();
  parkStageFaces();
  if (sceneKey === "stages") {
    for (const plate of plates) {
      if (plate.frame !== "panel_parchment" && plate.frame !== "panel_wood") continue;
      markBox(grid, { x: plate.box.x - 16, y: plate.box.y - 16, w: plate.box.w + 32, h: plate.box.h + 32 });
    }
  }
  const ordered = [...units].sort((a, b) => Number(b.interactive) - Number(a.interactive) || a.design.y - b.design.y || a.design.x - b.design.x);
  let overflowY = view.h;
  const spansAt = (y: number, h: number) => {
    const spans: Array<{ x: number; w: number }> = [];
    let run = -1;
    const xEnd = view.w - 4;
    for (let x = 8; x <= xEnd; x += step) {
      const probe = Math.min(step, xEnd - x);
      const open = probe >= 1 && cellFree(grid, x, y, probe, h);
      if (open && run < 0) run = x;
      if (!open && run >= 0) {
        spans.push({ x: run, w: x - run });
        run = -1;
      }
    }
    if (run >= 0) spans.push({ x: run, w: xEnd - run });
    return spans.filter((span) => span.w >= 16);
  };
  const tryPlace = (unit: Unit, natural: number, regions: WorldRect[] | null): boolean => {
    const probes = unit.interactive ? [UI_HIT] : [1, 2, 3, 4, 6, 8, 12].map((lines) => Math.max(14, unit.fontPx) * lines);
    for (const probe of probes) {
      const yMax = view.h - 4 - probe;
      for (let y = 52; y <= yMax; y += step) {
        const spans = spansAt(y, probe).sort((a, b) => b.w - a.w);
        for (const span of spans) {
          if (unit.interactive) {
            if (span.w < UI_HIT) continue;
            unit.w = Math.min(span.w, Math.max(UI_HIT, Math.min(natural, 144)));
            unit.h = UI_HIT;
          } else {
            fitText(unit, Math.min(span.w, natural), measure);
            if (unit.h > probe) continue;
          }
          if (y + unit.h > view.h - 4) continue;
          if (regions && regions.length && !regions.some((region) => boxInside({ x: span.x, y, w: unit.w, h: unit.h }, region))) continue;
          if (!cellFree(grid, span.x, y, unit.w, unit.h)) continue;
          unit.x = span.x;
          unit.y = y;
          markBox(grid, { x: unit.x - UI_GAP, y: unit.y - UI_GAP, w: unit.w + UI_GAP * 2, h: unit.h + UI_GAP * 2 });
          return true;
        }
      }
    }
    return false;
  };
  for (const unit of ordered) {
    if (String(unit.node.name || "").startsWith("pin:") || unit.text === "词境练习家") continue;
    if (!unit.interactive && unit.text.length > 0 && unit.onPaper) continue;
    const natural = Math.max(16, unit.w);
    if (tryPlace(unit, natural, null)) {
      if (!unit.interactive) unit.onPaper = false;
      continue;
    }
    unit.x = 8;
    unit.y = overflowY;
    unit.onPaper = false;
    overflowY += Math.max(unit.h, unit.fontPx || UI_HIT) + UI_GAP;
  }
  if (sceneKey === "title") {
    const brand = units.find((unit) => unit.text === "词境练习家");
    if (brand) {
      brand.fontPx = Math.max(22, Math.min(40, Math.floor(view.w / 14)));
      fitText(brand, Math.max(80, view.w - 48), measure);
      brand.x = Math.max(16, (view.w - brand.w) / 2);
      brand.y = 14;
      brand.onPaper = true;
      fills.push({ x: brand.x - 16, y: Math.max(4, brand.y - 6), w: brand.w + 32, h: brand.h + 12, color: 0xfff4dc, role: "sheet" });
    }
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

function sliceDest(width: number, height: number, insets: { left: number; right: number; top: number; bottom: number }, frame: FrameRect, source?: { left: number; right: number; top: number; bottom: number }): Array<{ sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number }> {
  const srcInsets = source ?? insets;
  const left = Math.min(insets.left, width / 2);
  const right = Math.min(insets.right, width / 2);
  const top = Math.min(insets.top, height / 2);
  const bottom = Math.min(insets.bottom, height / 2);
  const srcLeft = Math.min(srcInsets.left, frame.w / 2);
  const srcRight = Math.min(srcInsets.right, frame.w / 2);
  const srcTop = Math.min(srcInsets.top, frame.h / 2);
  const srcBottom = Math.min(srcInsets.bottom, frame.h / 2);
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

interface Mat {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

const IDENTITY: Mat = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mul(m: Mat, n: Mat): Mat {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

function applyMat(m: Mat, x: number, y: number): { x: number; y: number } {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

function localMat(node: GameNode): Mat {
  const sx = (node.flipX ? -1 : 1) * (node.scaleX || 1);
  const sy = node.scaleY || 1;
  const cos = Math.cos(node.rotation || 0);
  const sin = Math.sin(node.rotation || 0);
  return { a: cos * sx, b: sin * sx, c: -sin * sy, d: cos * sy, e: node.x, f: node.y };
}

function worldMat(node: GameNode): Mat {
  const chain: GameNode[] = [];
  let current: GameNode | null = node;
  while (current) {
    chain.push(current);
    current = current.parent;
  }
  let mat = IDENTITY;
  for (let index = chain.length - 1; index >= 0; index -= 1) mat = mul(mat, localMat(chain[index]));
  return mat;
}

function rectPoints(mat: Mat, x: number, y: number, w: number, h: number): Array<{ x: number; y: number }> {
  return [applyMat(mat, x, y), applyMat(mat, x + w, y), applyMat(mat, x + w, y + h), applyMat(mat, x, y + h)];
}

function circleShape(mat: Mat, x: number, y: number, r: number): MaskShape | null {
  if (!(r > 0)) return null;
  const sx = Math.hypot(mat.a, mat.b);
  const sy = Math.hypot(mat.c, mat.d);
  if (sx < 1e-6 || sy < 1e-6) return null;
  if (Math.abs(sx - sy) <= 1e-3 * Math.max(sx, sy)) {
    const center = applyMat(mat, x, y);
    return { kind: "circle", x: center.x, y: center.y, r: r * sx };
  }
  const points = [];
  for (let step = 0; step < 32; step += 1) {
    const angle = (step / 32) * Math.PI * 2;
    points.push(applyMat(mat, x + Math.cos(angle) * r, y + Math.sin(angle) * r));
  }
  return { kind: "poly", points };
}

function roundedPoints(mat: Mat, x: number, y: number, w: number, h: number, radius: number): Array<{ x: number; y: number }> {
  const limit = Math.min(Math.abs(w) / 2, Math.abs(h) / 2);
  const r = Math.max(0, Math.min(radius || 0, limit));
  if (r <= 0) return rectPoints(mat, x, y, w, h);
  const corners = [
    { cx: x + r, cy: y + r, a0: Math.PI, a1: Math.PI * 1.5 },
    { cx: x + w - r, cy: y + r, a0: Math.PI * 1.5, a1: Math.PI * 2 },
    { cx: x + w - r, cy: y + h - r, a0: 0, a1: Math.PI * 0.5 },
    { cx: x + r, cy: y + h - r, a0: Math.PI * 0.5, a1: Math.PI },
  ];
  const points = [];
  for (const corner of corners) {
    for (let step = 0; step < 4; step += 1) {
      const angle = corner.a0 + ((corner.a1 - corner.a0) * step) / 4;
      points.push(applyMat(mat, corner.cx + Math.cos(angle) * r, corner.cy + Math.sin(angle) * r));
    }
  }
  return points;
}

function maskShapesWorld(node: GameNode): MaskShape[] | null {
  if (node.type !== "container") return null;
  const mask = node.data.get("mask") as { graphics?: GameNode & { commands?: Array<Record<string, number> & { op: string }> } } | undefined;
  const graphics = mask?.graphics;
  if (!graphics || graphics.visible === false) return null;
  const mat = worldMat(graphics);
  const shapes: MaskShape[] = [];
  for (const command of graphics.commands ?? []) {
    if (command.op === "fillRect") shapes.push({ kind: "poly", points: rectPoints(mat, command.x, command.y, command.w, command.h) });
    else if (command.op === "fillRounded") shapes.push({ kind: "poly", points: roundedPoints(mat, command.x, command.y, command.w, command.h, command.r) });
    else if (command.op === "fillCircle") {
      const circle = circleShape(mat, command.x, command.y, command.r);
      if (circle) shapes.push(circle);
    }
  }
  return shapes.length ? shapes : null;
}

function characterSheet(node: GameNode): boolean {
  if (node.type !== "image" && node.type !== "sprite") return false;
  if (node.displaySized || node.width > 1.5 || node.height > 1.5) return false;
  const key = (node as GameNode & { texture?: string }).texture ?? "";
  return key.startsWith("cls:");
}

function paintedByTree(node: GameNode): boolean {
  let current: GameNode | null = node;
  while (current) {
    if (maskShapesWorld(current) || current.rotation || current.flipX || characterSheet(current)) return true;
    current = current.parent;
  }
  return false;
}

function pointInPoly(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    const crosses = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / ((b.y - a.y) || 1e-12) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInShape(x: number, y: number, shape: MaskShape): boolean {
  if (shape.kind === "circle") {
    const dx = x - shape.x;
    const dy = y - shape.y;
    return dx * dx + dy * dy <= shape.r * shape.r + 1e-6;
  }
  return pointInPoly(x, y, shape.points);
}

function segmentsCross(a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }, d: { x: number; y: number }): boolean {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const acx = c.x - a.x;
  const acy = c.y - a.y;
  const adx = d.x - a.x;
  const ady = d.y - a.y;
  const cdx = d.x - c.x;
  const cdy = d.y - c.y;
  const cax = a.x - c.x;
  const cay = a.y - c.y;
  const cbx = b.x - c.x;
  const cby = b.y - c.y;
  const ab = abx * acy - aby * acx;
  const ab2 = abx * ady - aby * adx;
  const cd = cdx * cay - cdy * cax;
  const cd2 = cdx * cby - cdy * cbx;
  return ab * ab2 < 0 && cd * cd2 < 0;
}

function boxHitsShape(box: WorldRect, shape: MaskShape): boolean {
  if (shape.kind === "circle") {
    const cx = Math.max(box.x, Math.min(shape.x, box.x + box.w));
    const cy = Math.max(box.y, Math.min(shape.y, box.y + box.h));
    const dx = cx - shape.x;
    const dy = cy - shape.y;
    return dx * dx + dy * dy <= shape.r * shape.r;
  }
  const corners = [
    { x: box.x, y: box.y },
    { x: box.x + box.w, y: box.y },
    { x: box.x + box.w, y: box.y + box.h },
    { x: box.x, y: box.y + box.h },
  ];
  if (corners.some((point) => pointInPoly(point.x, point.y, shape.points))) return true;
  if (shape.points.some((point) => point.x >= box.x && point.x <= box.x + box.w && point.y >= box.y && point.y <= box.y + box.h)) return true;
  for (let index = 0; index < shape.points.length; index += 1) {
    const a = shape.points[index];
    const b = shape.points[(index + 1) % shape.points.length];
    for (let edge = 0; edge < corners.length; edge += 1) {
      if (segmentsCross(a, b, corners[edge], corners[(edge + 1) % corners.length])) return true;
    }
  }
  return false;
}

function screenShapes(shapes: MaskShape[], view: ViewBox): MaskShape[] {
  const scale = worldScale(view);
  return shapes.map((shape) => {
    if (shape.kind === "circle") {
      const center = worldToScreen(shape, view);
      return { kind: "circle" as const, x: center.x, y: center.y, r: shape.r * scale };
    }
    return { kind: "poly" as const, points: shape.points.map((point) => worldToScreen(point, view)) };
  });
}

function transformed(mat: Mat): boolean {
  return Math.abs(mat.b) > 1e-6 || Math.abs(mat.c) > 1e-6 || mat.a < 0 || mat.d < 0;
}

function hitCorners(node: GameNode, mat: Mat): Array<{ x: number; y: number }> | null {
  if (!node.inputEnabled) return null;
  const rect = node.hitRect ?? { x: 0, y: 0, width: node.width, height: node.height };
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const left = -node.originX * node.width + rect.x;
  const top = -node.originY * node.height + rect.y;
  return [
    applyMat(mat, left, top),
    applyMat(mat, left + rect.width, top),
    applyMat(mat, left + rect.width, top + rect.height),
    applyMat(mat, left, top + rect.height),
  ];
}

function collectTreeHits(scene: { children: { list: GameNode[] } }, view: ViewBox): PaintBox[] {
  const hits: PaintBox[] = [];
  const visit = (node: GameNode, parent: Mat, masks: MaskShape[][]) => {
    if (!node.visible) return;
    const mat = mul(parent, localMat(node));
    const own = maskShapesWorld(node);
    const next = own ? masks.concat([own]) : masks;
    const corners = hitCorners(node, mat);
    if (corners && (next.length > 0 || transformed(mat))) {
      const screen = corners.map((point) => worldToScreen(point, view));
      const xs = screen.map((point) => point.x);
      const ys = screen.map((point) => point.y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      hits.push({
        kind: node.type,
        text: "",
        fontPx: 0,
        x,
        y,
        w: Math.max(...xs) - x,
        h: Math.max(...ys) - y,
        interactive: true,
        nested: true,
        node,
        polygon: screen,
        masks: next.map((group) => screenShapes(group, view)),
      });
    }
    const list = childList(node);
    if (list) for (const child of list) visit(child, mat, next);
  };
  for (const node of scene.children.list) visit(node, IDENTITY, []);
  return hits;
}

const PHONE_SLICE: Record<string, { left: number; right: number; top: number; bottom: number }> = {
  btn_primary_normal: { left: 32, right: 32, top: 30, bottom: 40 },
  btn_secondary_normal: { left: 32, right: 32, top: 30, bottom: 40 },
  btn_action_teal_normal: { left: 32, right: 32, top: 30, bottom: 40 },
  panel_parchment: { left: 40, right: 40, top: 40, bottom: 40 },
  panel_wood: { left: 48, right: 48, top: 48, bottom: 48 },
  input_normal: { left: 40, right: 40, top: 40, bottom: 40 },
  option_normal: { left: 36, right: 36, top: 24, bottom: 24 },
  hp_frame: { left: 24, right: 24, top: 0, bottom: 0 },
  hp_fill_teal: { left: 16, right: 16, top: 0, bottom: 0 },
  hp_fill_coral: { left: 16, right: 16, top: 0, bottom: 0 },
};

function phoneDestInsets(source: { left: number; right: number; top: number; bottom: number }, box: { w: number; h: number }): { left: number; right: number; top: number; bottom: number } {
  const square = box.w > 0 && box.h > 0 && box.w / box.h > 0.85 && box.w / box.h < 1.15;
  if (square) return { left: 3, right: 3, top: 3, bottom: 3 };
  const capX = Math.max(4, box.w * 0.18);
  const capY = Math.max(4, box.h * 0.22);
  return {
    left: Math.min(source.left / 2, capX),
    right: Math.min(source.right / 2, capX),
    top: Math.min(source.top / 2, capY),
    bottom: Math.min(source.bottom / 2, capY),
  };
}

function emitPhoneChrome(scene: { children: { list: GameNode[] } }, images: DrawImageOp[], chrome: PhoneChrome[]): void {
  const textures = (scene as { textures?: { get: (key: string) => { image: string; packed: string; missing: boolean; frameRect: (frame: string) => FrameRect | null } } }).textures;
  if (!textures) return;
  const keys = ["atlas_ui_core", "atlas_ui_pages", "atlas_battle", "atlas_parent"];
  for (const piece of chrome) {
    const names = [piece.frame];
    let image = "";
    let packed = "";
    let rect: FrameRect | null = null;
    let used = piece.frame;
    for (const name of names) {
      for (const key of keys) {
        const texture = textures.get(key);
        if (!texture || texture.missing) continue;
        const found = texture.frameRect(name);
        if (!found) continue;
        image = texture.image;
        packed = texture.packed;
        rect = found;
        used = name;
        break;
      }
      if (rect) break;
    }
    if (!rect) continue;
    const source = PHONE_SLICE[used] ?? { left: 32, right: 32, top: 30, bottom: 40 };
    for (const part of sliceDest(piece.box.w, piece.box.h, phoneDestInsets(source, piece.box), rect, source)) {
      images.push({
        url: image,
        packed,
        sx: part.sx,
        sy: part.sy,
        sw: part.sw,
        sh: part.sh,
        x: piece.box.x + part.dx,
        y: piece.box.y + part.dy,
        w: part.dw,
        h: part.dh,
        alpha: 1,
        rotation: 0,
        flipX: false,
        tint: 0xffffff,
      });
    }
  }
}

export function layoutFrame(scene: { children: { list: GameNode[] } } | null, view: ViewBox, measure?: MeasureText, options?: LayoutOptions): FramePlan {
  if (scene) rewriteSceneCopy(scene);
  const flat: GameNode[] = [];
  if (scene) flatten(scene.children.list, flat);
  const visible = flat.filter((node) => node.visible);
  const images: DrawImageOp[] = [];
  const fills: Array<{ x: number; y: number; w: number; h: number; color: number; node?: GameNode; role?: "sheet" }> = [];
  const scale = worldScale(view);
  const units: Unit[] = [];
  const used = new Set<GameNode>();
  const plates: Plate[] = [];

  for (const node of visible) {
    if (paintedByTree(node)) continue;
    if (outermostHit(node) || buttonShellOwner(node)) continue;
    if (node.type !== "image" && node.type !== "sprite" && node.type !== "nineslice" && node.type !== "rectangle") continue;
    const box = designBox(node);
    const screen = worldToScreen({ x: box.x, y: box.y }, view);
    const phoneKey = sceneKeyOf(scene);
    const covered = usesPhone(phoneKey) && isBackdrop(node) ? coverBox(view, coverFocusFor(phoneKey)) : null;
    const sceneCover = usesPhone(phoneKey) && phoneKey === "exam-battle" ? coverBox(view) : null;
    const sceneScale = sceneCover ? sceneCover.w / 1280 : 0;
    const trim = sceneCover && !covered ? spriteTrimBox(node) : null;
    const dest = covered ?? (sceneCover
      ? {
          x: sceneCover.x + (trim ? trim.x : box.x) * sceneScale,
          y: sceneCover.y + (trim ? trim.y : box.y) * sceneScale,
          w: Math.max(1, (trim ? trim.w : box.w) * sceneScale),
          h: Math.max(1, (trim ? trim.h : box.h) * sceneScale),
        }
      : { x: screen.x, y: screen.y, w: Math.max(1, box.w * scale), h: Math.max(1, box.h * scale) });
    const frame = node.type === "nineslice" ? String((node as GameNode & { frame?: string }).frame ?? "") : "";
    const kind = isPaperFrame(frame) ? "paper" : plateKind(dest, view);
    plates.push({ box: dest, kind, frame });
    emitArt(images, fills, node, dest);
  }

  const liftMaskText = usesPhone(sceneKeyOf(scene));
  for (const node of visible) {
    if (paintedByTree(node) && !(liftMaskText && node.type === "text")) continue;
    const root = outermostHit(node) ?? buttonShellOwner(node);
    const owner = root ?? (node.type === "text" ? node : null);
    if (!owner || used.has(owner)) continue;
    used.add(owner);
    const design = designBox(owner);
    const fontPx = owner.type === "text" ? screenFontPx(authoredFont(owner)) : 16;
    const text = owner.type === "text" ? String((owner as GameNode & { text?: string }).text ?? "") : "";
    const style = styleOf(owner);
    const weight = style.fontStyle ?? "";
    const family = style.fontFamily ?? "sans-serif";
    const maxLine = Math.max(80, view.w - 24);
    const lines = text ? wrapText(text, fontPx, maxLine, measure, weight, family) : [];
    const lineWidth = (line: string) => (measure ? measure(line, fontPx, weight, family) : estimateWidth(line, fontPx));
    const measured = lines.reduce((max, line) => Math.max(max, lineWidth(line)), 0);
    const nestedBits = owner.type !== "text"
      ? visible.filter((child) => child.type === "text" && (outermostHit(child) === owner || buttonShellOwner(child) === owner)).map((child) => String((child as GameNode & { text?: string }).text ?? "")).filter((bit) => bit.length > 0)
      : [];
    const labeled = nestedBits.filter((bit) => !/^\d$/.test(bit));
    const chosenBits = labeled.length ? labeled : nestedBits;
    const nestedText = chosenBits.join(chosenBits.length > 1 ? " " : "");
    const nestedFont = 16;
    const nestedWidth = nestedText
      ? (measure ? measure(nestedText, nestedFont, "700", "sans-serif") : estimateWidth(nestedText, nestedFont))
      : 0;
    units.push({
      node: owner,
      text: owner.type === "text" ? text : nestedText,
      fontPx: owner.type === "text" ? fontPx : nestedText ? nestedFont : 0,
      weight,
      family,
      interactive: owner.inputEnabled || buttonShell(owner),
      design,
      designX: design.x,
      designY: design.y,
      x: 0,
      y: 0,
      w: owner.inputEnabled || buttonShell(owner) ? Math.min(144, Math.max(UI_HIT, Math.min(design.w || UI_HIT, 144), Math.min(nestedWidth + 16, 144))) : Math.max(1, measured || fontPx),
      h: owner.inputEnabled || buttonShell(owner) ? UI_HIT : Math.max(fontPx, fontPx * Math.max(1, lines.length)),
      lines: owner.type === "text" ? lines : nestedText ? [nestedText] : [],
    });
  }
  const phone = scene
    ? composePhone({
      key: sceneKeyOf(scene),
      view,
      scene,
      units,
      images,
      plates,
      fills,
      measure,
      fitText: (unit: PhoneUnit, maxW: number) => fitText(unit, maxW, measure),
    })
    : null;
  if (scene) rememberPhone(scene, phone);
  if (phone?.chrome?.length && scene) emitPhoneChrome(scene, images, phone.chrome);
  if (phone?.bars?.length && scene) {
    for (const bar of phone.bars) {
      if (!(bar.w > 8) || !(bar.h > 4) || !(bar.ratio >= 0)) continue;
      emitPhoneChrome(scene, images, [{ frame: "hp_frame", box: bar }]);
      if (bar.ratio <= 0) continue;
      const inner = Math.max(12, Math.min(bar.w - 8, (bar.w - 8) * bar.ratio));
      emitPhoneChrome(scene, images, [{
        frame: bar.tone === "coral" ? "hp_fill_coral" : "hp_fill_teal",
        box: { x: bar.x + 4, y: bar.y + 2, w: inner, h: Math.max(6, bar.h - 4) },
      }]);
    }
  }
  if (phone?.portraits?.length) {
    for (const portrait of phone.portraits) {
      const frame = String((portrait.node as GameNode & { frame?: string }).frame ?? "");
      pushImage(images, portrait.node, frame, portrait.box, null);
    }
  }
  if (!phone) placeUnits(units, view, scene, plates, fills, measure, options);

  const items: PaintBox[] = [];
  for (const unit of units) {
    if (unit.w < 1 || unit.h < 1) continue;
    items.push({
      kind: unit.node.type,
      text: unit.text,
      fontPx: unit.node.type === "text" || unit.label === "center" || ((unit.node.type === "rectangle" || unit.node.type === "zone") && unit.lines.length > 0) ? unit.fontPx : 0,
      align: unit.label === "center" ? "center" : undefined,
      x: unit.x,
      y: unit.y,
      w: unit.w,
      h: unit.h,
      interactive: unit.interactive,
      nested: false,
      node: unit.node,
      lines: unit.lines,
      onPaper: unit.onPaper,
    });
    if (!unit.interactive) continue;
    const phoneButton = scene ? Boolean(phoneLayoutOf(scene)) : false;
    let phoneLabelDrawn = false;
    const design = unit.design;
    for (const child of visible) {
      if ((outermostHit(child) ?? buttonShellOwner(child)) !== unit.node || child === unit.node) continue;
      const childBox = designBox(child);
      const rx = design.w > 0 ? (childBox.x - design.x) / design.w : 0;
      const ry = design.h > 0 ? (childBox.y - design.y) / design.h : 0;
      const rw = design.w > 0 ? childBox.w / design.w : 1;
      const rh = design.h > 0 ? childBox.h / design.h : 1;
      // Phone buttons are sized in viewport pixels. Mapping a world sprite
      // through the old design box paints it outside the hit and onto the next control.
      const dest = phoneButton
        ? { x: unit.x, y: unit.y, w: Math.max(1, unit.w), h: Math.max(1, unit.h) }
        : {
            x: unit.x + rx * unit.w,
            y: unit.y + ry * unit.h,
            w: Math.max(1, rw * unit.w),
            h: Math.max(1, rh * unit.h),
          };
      if (phoneButton && (child.type === "image" || child.type === "sprite")) {
        const frameName = String((child as GameNode & { frame?: string }).frame ?? "");
        if (unit.label !== "sign" && !frameName.startsWith("village_bld_")) continue;
        const image = child as GameNode & { frame?: string };
        pushImage(images, child, image.frame ?? "", dest, null);
        continue;
      }
      if (phoneButton && unit.suppressFace && child.type === "nineslice") continue;
      if (child.type === "text") {
        if (unit.label === "center") continue;
        if (phoneButton && phoneLabelDrawn) continue;
        if (phoneButton) phoneLabelDrawn = true;
        const style = styleOf(child);
        const text = phoneButton ? unit.text : String((child as GameNode & { text?: string }).text ?? "");
        const weight = style.fontStyle ?? "";
        const family = style.fontFamily ?? "sans-serif";
        let fontPx = phoneButton ? Math.max(14, unit.fontPx || screenFontPx(authoredFont(child))) : screenFontPx(authoredFont(child));
        let width = measure ? measure(text, fontPx, weight, family) : estimateWidth(text, fontPx);
        const limit = Math.max(12, unit.w - (unit.label === "sign" ? 8 : 12));
        while (fontPx > 14 && width > limit) {
          fontPx -= 1;
          width = measure ? measure(text, fontPx, weight, family) : estimateWidth(text, fontPx);
        }
        const textX = Math.max(unit.x + 4, unit.x + (unit.w - Math.min(width, unit.w - 8)) / 2);
        const textY = unit.label === "sign" ? unit.y + unit.h * (unit.signFrac ?? 0.72) : unit.y + Math.max(0, (unit.h - fontPx) / 2);
        items.push({
          kind: "text",
          text,
          fontPx,
          x: textX,
          y: textY,
          w: Math.min(width, Math.max(1, unit.x + unit.w - 4 - textX)),
          h: fontPx,
          interactive: false,
          nested: true,
          node: child,
        });
        continue;
      }
      if (phoneButton && unit.suppressFace && (child.type === "image" || child.type === "sprite" || child.type === "nineslice")) continue;
      if (child.type === "image" || child.type === "sprite") {
        const image = child as GameNode & { frame?: string };
        pushImage(images, child, image.frame ?? "", dest, null);
      } else if (child.type === "nineslice") {
        const slice = child as GameNode & { frame?: string; insets?: { left: number; right: number; top: number; bottom: number } };
        const texture = textureOf(child);
        const frame = texture?.frameRect(slice.frame ?? "") ?? null;
        if (frame && slice.insets) {
          const destInsets = phoneButton ? phoneDestInsets(slice.insets, dest) : slice.insets;
          for (const part of sliceDest(dest.w, dest.h, destInsets, frame, slice.insets)) {
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

  const donor = visible.find((node) => node.type === "text");
  if (donor && phone?.captions?.length) {
    for (const caption of phone.captions) {
      if (!caption.text.trim() || caption.w < 8 || caption.h < 8) continue;
      items.push({
        kind: "text",
        text: caption.text,
        fontPx: caption.font,
        align: "center",
        x: caption.x,
        y: caption.y,
        w: caption.w,
        h: caption.h,
        interactive: false,
        nested: true,
        node: donor,
        lines: [caption.text],
        ink: caption.color,
      });
    }
  }

  const texts = items.filter((item) => item.kind === "text" && item.text.length > 0);
  const shelfHits = items.filter((item) => item.interactive);
  // 裁剪后的热区可能只剩一条。44 像素是货架按钮的规则，不拿裁剪余量去改它。
  const hits = shelfHits.concat(scene ? collectTreeHits(scene, view) : []);
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
  const phoneOn = scene ? Boolean(phoneLayoutOf(scene)) : false;
  const overflow = items.filter((item) => item.y < (phoneOn ? 4 : 50) || item.y + item.h > view.h - 4 || item.x < 4 || item.x + item.w > view.w - 4).length;
  const mask = scene ? firstMask(scene) : null;
  const maskShapes = mask ? screenShapes(mask.shapes, view) : [];
  const overlapLabels: string[] = [];
  const watchKey = sceneKeyOf(scene);
  const watchRows = watchKey === "battle-results" || watchKey === "skills";
  const watchBar = watchKey === "battle-results";
  const watchNest = watchKey === "duel" ? nestedPanels(plates) : [];
  for (const item of texts) {
    const before = overlapLabels.length;
    const box = { x: item.x, y: item.y, w: item.w, h: item.h };
    let insidePaper = false;
    let onFrame = false;
    let artHit = "";
    for (const art of plates) {
      if (art.box.w <= 0 || art.box.h <= 0) continue;
      if (watchBar && art.frame === "progress_frame" && box.y < art.box.y + art.box.h + UI_GAP && box.y + box.h > art.box.y - UI_GAP && box.x < art.box.x + art.box.w + UI_GAP && box.x + box.w > art.box.x - UI_GAP) {
        overlapLabels.push(`${item.text.slice(0, 16)} on progress_frame`);
        continue;
      }
      if (watchRows && art.frame === "list_row" && tooClose(box, art.box)) {
        const covered = plates.some((plate) => plate.frame === "sheet" && boxInside(box, { x: plate.box.x + 12, y: plate.box.y + 12, w: plate.box.w - 24, h: plate.box.h - 24 }));
        if (!covered) overlapLabels.push(`${item.text.slice(0, 16)} on list_row`);
        continue;
      }
      if (watchNest.some((panel) => panel === art) && tooClose(box, art.box)) {
        const room = { x: art.box.x + 10, y: art.box.y + 10, w: art.box.w - 20, h: art.box.h - 20 };
        if (!(room.w >= 14 && room.h >= 14 && boxInside(box, room))) overlapLabels.push(`${item.text.slice(0, 16)} on inner`);
        continue;
      }
      if (!intersectsBox(box, art.box)) continue;
      if (art.kind === "room" || art.box.w < 4 || art.box.h < 4) continue;
      if (art.frame === "sheet") {
        const pad = { x: art.box.x + 8, y: art.box.y + 8, w: Math.max(1, art.box.w - 16), h: Math.max(1, art.box.h - 16) };
        if (boxInside(box, pad)) insidePaper = true;
        continue;
      }
      if (art.kind === "paper") {
        const interior = paperInterior(art.box);
        const slack = { x: interior.x - 4, y: interior.y - 4, w: interior.w + 8, h: interior.h + 8 };
        if (boxInside(box, slack)) insidePaper = true;
        else onFrame = true;
        continue;
      }
      if ((art.frame === "map_word_unknown" || art.frame === "map_word_card") && boxInside(box, art.box)) continue;
      artHit = `${item.text.slice(0, 16)} on art ${Math.round(art.box.x)},${Math.round(art.box.y)} ${Math.round(art.box.w)}x${Math.round(art.box.h)}`;
      break;
    }
    if (artHit) overlapLabels.push(artHit);
    else if (onFrame && !insidePaper && !item.nested) overlapLabels.push(`${item.text.slice(0, 16)} on frame`);
    if (overlapLabels.length === before && maskShapes.some((shape) => boxHitsShape(box, shape))) overlapLabels.push(`${item.text.slice(0, 16)} on mask`);
  }
  const overlap = overlapLabels.length;
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
    overlap,
    overlapLabels,
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
  return Boolean(ctx.save && ctx.restore && ctx.beginPath && ctx.clip && ctx.moveTo && ctx.lineTo && ctx.closePath && ctx.arc && ctx.setTransform);
}

function sceneIndex(scene: { children: { list: GameNode[] } }, node: GameNode | undefined): number {
  if (!node) return -1;
  return scene.children.list.indexOf(node);
}

function firstMaskIndex(scene: { children: { list: GameNode[] } }): number {
  let index = Number.POSITIVE_INFINITY;
  scene.children.list.forEach((node, at) => {
    if (maskShapesWorld(node) && at < index) index = at;
  });
  return index;
}

function glyphSpec(node: GameNode, lines: string[], fontPx: number): GlyphSpec {
  const style = styleOf(node);
  return {
    text: lines.join("\n"),
    fontFamily: style.fontFamily || "sans-serif",
    fontSize: fontPx,
    fontStyle: style.fontStyle || "",
    color: style.color || "#17352a",
    stroke: style.stroke || "",
    strokeThickness: style.strokeThickness || 0,
    align: style.align || "left",
    wrapWidth: style.wordWrap?.width || 0,
    lineSpacing: style.lineSpacing || 0,
    maxLines: style.maxLines || 0,
    origin: `${node.originX},${node.originY}`,
    lines,
  };
}

function paintGlyph(ctx: PaintContext, node: GameNode, lines: string[], fontPx: number, x: number, y: number, boxW: number, boxH: number, align: "left" | "center" = "left", ink?: string): void {
  const spec = glyphSpec(node, lines, fontPx);
  if (ink) {
    spec.color = ink;
    spec.stroke = "";
    spec.strokeThickness = 0;
  }
  const texture = glyphTexture(spec);
  if (texture && ctx.drawImage) {
    const fit = Math.min(1, boxW / Math.max(1, texture.w), boxH / Math.max(1, texture.h));
    const dw = Math.max(1, texture.w * fit);
    const dh = Math.max(1, texture.h * fit);
    if (align === "center") {
      ctx.drawImage(texture.canvas, x + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh);
      return;
    }
    if (texture.w <= boxW + 0.5 && texture.h <= boxH + 0.5) ctx.drawImage(texture.canvas, x, y);
    else ctx.drawImage(texture.canvas, x + (boxW - dw) / 2, y + (boxH - dh) / 2, dw, dh);
    return;
  }
  noteGlyphFallback();
  const style = styleOf(node);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = ink || style.color || "#17352a";
  ctx.font = `${style.fontStyle ? `${style.fontStyle} ` : ""}${fontPx}px ${style.fontFamily || "sans-serif"}`;
  const textH = fontPx * Math.max(1, lines.length);
  const drawY = align === "center" ? y + Math.max(0, (boxH - textH) / 2) : y;
  lines.forEach((line, index) => ctx.fillText(line, x, drawY + index * fontPx));
}

function drawLocal(ctx: PaintContext, node: GameNode): void {
  if (node.type === "image" || node.type === "sprite") {
    const texture = textureOf(node);
    const bitmap = texture ? bitmapFor(texture.image) : null;
    const frameName = (node as GameNode & { frame?: string }).frame ?? "";
    if (!texture || !bitmap || !ctx.drawImage) return;
    // 原来：没调用 setDisplaySize 的角色层停在 1×1，镜子里看起来是空的。
    // 现在：按图集源画布和裁切偏移来画，父容器的缩放仍由矩阵承担。
    // 为什么：侧视层共用 512 的脚点。已经 setDisplaySize 的背景和木牌仍走原来的宽高。
    if (!node.displaySized) {
      const scene = node.scene as { textures?: { get: (key: string) => { data: unknown; missing: boolean } } } | null;
      const key = (node as GameNode & { texture?: string }).texture;
      const data = key && scene?.textures ? scene.textures.get(key) : null;
      const placed = data && !data.missing ? framePlacementOf(data.data, frameName) : null;
      if (placed) {
        const dx = -node.originX * placed.sourceW + placed.trimX;
        const dy = -node.originY * placed.sourceH + placed.trimY;
        ctx.drawImage(bitmap, placed.cut.x, placed.cut.y, placed.cut.w, placed.cut.h, dx, dy, placed.trimW, placed.trimH);
        return;
      }
    }
    const frame = texture.frameRect(frameName) ?? texture.frameRect("");
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
    const fontPx = authoredFont(node);
    const lines = text.split("\n");
    paintGlyph(ctx, node, lines, fontPx, -node.originX * node.width, -node.originY * node.height, node.width || fontPx, node.height || fontPx * lines.length);
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

function traceClip(ctx: PaintContext, shapes: MaskShape[], view: ViewBox): void {
  ctx.beginPath?.();
  for (const shape of screenShapes(shapes, view)) {
    if (shape.kind === "circle") {
      ctx.moveTo?.(shape.x + shape.r, shape.y);
      ctx.arc?.(shape.x, shape.y, shape.r, 0, Math.PI * 2);
      continue;
    }
    const [first, ...rest] = shape.points;
    if (!first) continue;
    ctx.moveTo?.(first.x, first.y);
    for (const point of rest) ctx.lineTo?.(point.x, point.y);
    ctx.closePath?.();
  }
  ctx.clip?.();
}

function applyScreen(ctx: PaintContext, mat: Mat, view: ViewBox, camera?: { scale: number; ox: number; oy: number } | null): void {
  const scale = camera ? camera.scale : worldScale(view);
  const offset = camera ? { x: camera.ox, y: camera.oy } : worldOffset(view);
  ctx.setTransform?.(scale * mat.a, scale * mat.b, scale * mat.c, scale * mat.d, offset.x + scale * mat.e, offset.y + scale * mat.f);
}

function paintTree(ctx: PaintContext, node: GameNode, parent: Mat, view: ViewBox, inherited: boolean): void {
  if (!node.visible) return;
  const mat = mul(parent, localMat(node));
  const shapes = maskShapesWorld(node);
  const draw = inherited || Boolean(node.rotation) || node.flipX || Boolean(shapes) || characterSheet(node);
  const body = () => {
    if (draw && node.type !== "container" && !characterSheet(node)) {
      ctx.save?.();
      applyScreen(ctx, mat, view);
      if ("globalAlpha" in ctx) ctx.globalAlpha = node.alpha;
      drawLocal(ctx, node);
      ctx.restore?.();
    }
    const list = childList(node);
    if (list) for (const child of list) paintTree(ctx, child, mat, view, draw);
  };
  if (shapes) {
    if (!canClip(ctx)) return;
    ctx.save?.();
    traceClip(ctx, shapes, view);
    body();
    ctx.restore?.();
    return;
  }
  if (draw) body();
  else {
    const list = childList(node);
    if (list) for (const child of list) paintTree(ctx, child, mat, view, false);
  }
}

function paintCharacters(scene: { children: { list: GameNode[] } }, ctx: PaintContext, view: ViewBox): void {
  const camera = phoneLayoutOf(scene)?.hero ?? null;
  const skipped = new Set(phoneLayoutOf(scene)?.skipSheets ?? []);
  const visit = (node: GameNode, parent: Mat) => {
    if (!node.visible) return;
    const mat = mul(parent, localMat(node));
    if (characterSheet(node) && !skipped.has(node)) {
      ctx.save?.();
      applyScreen(ctx, mat, view, camera);
      if ("globalAlpha" in ctx) ctx.globalAlpha = node.alpha;
      drawLocal(ctx, node);
      ctx.restore?.();
    }
    const list = childList(node);
    if (list) for (const child of list) visit(child, mat);
  };
  for (const node of scene.children.list) visit(node, IDENTITY);
}

function paintMaskedTrees(scene: { children: { list: GameNode[] } }, ctx: PaintContext, view: ViewBox): void {
  if (phoneLayoutOf(scene)?.skipMasks) return;
  if (!canClip(ctx)) return;
  for (const node of scene.children.list) paintTree(ctx, node, IDENTITY, view, false);
}

function paintItems(ctx: PaintContext, plan: FramePlan): void {
  const sheetCovers = (item: PaintBox) => plan.fills.some((fill) => fill.role === "sheet" && fill.w > 0 && fill.h > 0 && fill.x <= item.x + 2 && fill.y <= item.y + 2 && fill.x + fill.w >= item.x + item.w - 2 && fill.y + fill.h >= item.y + item.h - 2);
  for (const item of plan.items) {
    if (item.kind === "text") continue;
    if (item.onPaper) continue;
    if (sheetCovers(item)) continue;
    if (item.kind === "rectangle" || (item.interactive && !plan.images.some((op) => op.x >= item.x && op.x < item.x + item.w && op.y >= item.y && op.y < item.y + item.h))) {
      const fill = (item.node as GameNode & { fillColor?: number }).fillColor;
      ctx.fillStyle = hex(typeof fill === "number" ? fill : 0xc9a06a);
      ctx.fillRect(item.x, item.y, item.w, item.h);
    }
  }
  for (const item of plan.items) {
    if (item.text && item.fontPx > 0) {
      const lines = item.lines && item.lines.length ? item.lines : [item.text];
      paintGlyph(ctx, item.node, lines, item.fontPx, item.x, item.y, item.w, item.h, item.align === "center" ? "center" : "left", item.ink);
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
  const sheet = (fill: { role?: "sheet" }) => fill.role === "sheet";
  for (const fill of plan.fills.filter((fill) => before(fill) && !sheet(fill))) {
    ctx.fillStyle = hex(fill.color);
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  for (const op of plan.images.filter(before)) paintImage(ctx, op);
  if (scene) paintMaskedTrees(scene, ctx, view);
  for (const fill of plan.fills.filter((op) => !before(op) && !sheet(op))) {
    ctx.fillStyle = hex(fill.color);
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  for (const op of plan.images.filter((op) => !before(op))) paintImage(ctx, op);
  // 原来：衣柜镜子的拱和图是在遮罩之后画的，角色先画就被拱心盖住。
  // 现在：角色层等全部图片画完再画。
  // 为什么：拱心不是透明的。角色要站在镜子里，不能留在拱的后面。
  if (scene) paintCharacters(scene, ctx, view);
  for (const fill of plan.fills.filter(sheet)) {
    ctx.fillStyle = hex(fill.color);
    ctx.fillRect(fill.x, fill.y, fill.w, fill.h);
  }
  paintItems(ctx, plan);
  return plan;
}

function containsHit(item: PaintBox, x: number, y: number): boolean {
  if (item.polygon && item.polygon.length >= 3) {
    if (!pointInPoly(x, y, item.polygon)) return false;
  } else if (x < item.x || y < item.y || x >= item.x + item.w || y >= item.y + item.h) return false;
  if (item.masks) {
    for (const group of item.masks) {
      if (!group.some((shape) => pointInShape(x, y, shape))) return false;
    }
  }
  return true;
}

export function pressFrame(scene: { children: { list: GameNode[] } } | null, view: ViewBox, x: number, y: number, measure?: MeasureText): PaintBox | null {
  const plan = layoutFrame(scene, view, measure);
  const world = screenToWorld({ x, y }, view);
  const input = (scene as { input?: { activePointer?: { x: number; y: number } } } | null)?.input;
  if (input) input.activePointer = { x: world.x, y: world.y };
  const hits = plan.hits.filter((item) => containsHit(item, x, y));
  const hit = hits[hits.length - 1] ?? null;
  if (!hit) return null;
  const box = designBox(hit.node);
  hit.node.emit("pointerdown", { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  hit.node.emit("pointerup", { x: box.x + box.w / 2, y: box.y + box.h / 2 });
  return hit;
}
