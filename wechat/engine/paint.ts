import { screenFontPx, screenToWorld, UI_GAP, UI_HIT, worldOffset, worldScale, worldToScreen, type ViewBox } from "./coords";
import { glyphTexture, noteGlyphFallback, type GlyphSpec } from "./glyph";
import { displayBox, type GameNode } from "./node";
import { frameRectOf, type FrameRect } from "./scene";

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
  fills: Array<{ x: number; y: number; w: number; h: number; color: number; node?: GameNode }>;
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
  worldBoxes: WorldRect[],
  measure: MeasureText | undefined,
): void {
  // 原来：占视口 18% 的羊皮纸整张不算障碍，标题就排到纸面上，结算左侧还留着场景自己的字。
  // 现在：整屏底图不占格。羊皮纸只留内边距给说明文字，木框、角色和图标占格。说明字放不进纸面就落到视口下沿，不再铺到左侧空白上。
  // 为什么：把大图排除出 overlap，会把压在面板上的字算成 0。
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
  const interiors: WorldRect[] = [];
  for (const box of worldBoxes) {
    if (box.w <= 0 || box.h <= 0 || plateKind(box, view) !== "paper") continue;
    const interior = paperInterior(box);
    interiors.push(interior);
    markBox(grid, box);
    markBox(grid, interior, 0);
  }
  for (const box of worldBoxes) {
    if (box.w <= 0 || box.h <= 0 || plateKind(box, view) !== "art") continue;
    markBox(grid, box);
  }
  if (scene) {
    const mask = firstMask(scene);
    if (mask) {
      const band = shapeBounds(screenShapes(mask.shapes, view));
      if (band) markBox(grid, band);
    }
  }
  const flow = interiors.map((region) => ({ region, x: region.x, y: region.y, rowH: 0 }));
  const placeFlow = (unit: Unit): boolean => {
    for (const row of flow) {
      const width = Math.max(28, row.region.w);
      fitText(unit, width, measure);
      if (unit.h > row.region.h) continue;
      const advance = () => {
        row.x = row.region.x;
        row.y += row.rowH + UI_GAP;
        row.rowH = 0;
      };
      if (row.x > row.region.x && row.x + unit.w > row.region.x + row.region.w) advance();
      if (row.y + unit.h > row.region.y + row.region.h) continue;
      if (!cellFree(grid, row.x, row.y, unit.w, unit.h)) {
        row.x += grid.step;
        if (row.x + unit.w > row.region.x + row.region.w) advance();
        if (row.y + unit.h > row.region.y + row.region.h || !cellFree(grid, row.x, row.y, unit.w, unit.h)) continue;
      }
      unit.x = row.x;
      unit.y = row.y;
      unit.onPaper = true;
      markBox(grid, { x: unit.x - UI_GAP, y: unit.y - UI_GAP, w: unit.w + UI_GAP * 2, h: unit.h + UI_GAP * 2 });
      row.x += unit.w + UI_GAP;
      row.rowH = Math.max(row.rowH, unit.h);
      return true;
    }
    return false;
  };
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
    const natural = Math.max(16, unit.w);
    const regions = unit.interactive || interiors.length === 0 ? null : interiors;
    if (!unit.interactive && regions && placeFlow(unit)) continue;
    if (tryPlace(unit, natural, regions)) continue;
    if (!unit.interactive && unit.text.length > 1) {
      const snapshot = grid.blocked.slice();
      let split = false;
      for (const width of [160, 112, 80, 56, 40, 28]) {
        grid.blocked.set(snapshot);
        const lines = wrapText(unit.text, unit.fontPx, width, measure, unit.weight, unit.family);
        const pieces: Unit[] = [];
        let all = true;
        for (const line of lines) {
          const piece: Unit = { ...unit, text: line, lines: [line], w: width, h: unit.fontPx };
          if (!tryPlace(piece, width, regions)) {
            all = false;
            break;
          }
          pieces.push(piece);
        }
        if (all && pieces.length) {
          const index = units.indexOf(unit);
          if (index >= 0) units.splice(index, 1, ...pieces);
          split = true;
          break;
        }
      }
      if (split) continue;
      grid.blocked.set(snapshot);
    }
    if (regions && tryPlace(unit, natural, null)) continue;
    unit.x = 8;
    unit.y = overflowY;
    overflowY += Math.max(unit.h, unit.fontPx || UI_HIT) + UI_GAP;
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

function paintedByTree(node: GameNode): boolean {
  let current: GameNode | null = node;
  while (current) {
    if (maskShapesWorld(current) || current.rotation || current.flipX) return true;
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
    if (paintedByTree(node)) continue;
    if (outermostHit(node)) continue;
    if (node.type !== "image" && node.type !== "sprite" && node.type !== "nineslice" && node.type !== "rectangle") continue;
    const box = designBox(node);
    const screen = worldToScreen({ x: box.x, y: box.y }, view);
    emitArt(images, fills, node, { x: screen.x, y: screen.y, w: Math.max(1, box.w * scale), h: Math.max(1, box.h * scale) });
  }

  for (const node of visible) {
    if (paintedByTree(node)) continue;
    const root = outermostHit(node);
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
      weight,
      family,
      interactive: owner.inputEnabled,
      design,
      x: 0,
      y: 0,
      w: owner.inputEnabled ? Math.min(144, Math.max(UI_HIT, Math.min(design.w || UI_HIT, 144), Math.min(nestedWidth + 16, 144))) : Math.max(1, measured || fontPx),
      h: owner.inputEnabled ? UI_HIT : Math.max(fontPx, fontPx * Math.max(1, lines.length)),
      lines,
    });
  }
  const worldBoxes: WorldRect[] = [
    ...images.map((op) => ({ x: op.x, y: op.y, w: op.w, h: op.h })),
    ...fills.map((op) => ({ x: op.x, y: op.y, w: op.w, h: op.h })),
  ];
  placeUnits(units, view, scene, worldBoxes, measure);

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
      onPaper: unit.onPaper,
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
        const style = styleOf(child);
        const text = String((child as GameNode & { text?: string }).text ?? "");
        const weight = style.fontStyle ?? "";
        const family = style.fontFamily ?? "sans-serif";
        let fontPx = screenFontPx(authoredFont(child));
        let width = measure ? measure(text, fontPx, weight, family) : estimateWidth(text, fontPx);
        const limit = Math.max(12, unit.w - 12);
        while (fontPx > 14 && width > limit) {
          fontPx -= 1;
          width = measure ? measure(text, fontPx, weight, family) : estimateWidth(text, fontPx);
        }
        const textX = Math.max(unit.x + 4, unit.x + (unit.w - Math.min(width, unit.w - 8)) / 2);
        items.push({
          kind: "text",
          text,
          fontPx,
          x: textX,
          y: unit.y + Math.max(0, (unit.h - fontPx) / 2),
          w: Math.min(width, Math.max(1, unit.x + unit.w - 4 - textX)),
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
  const overflow = items.filter((item) => item.y < 50 || item.y + item.h > view.h - 4 || item.x < 8 || item.x + item.w > view.w - 4).length;
  const mask = scene ? firstMask(scene) : null;
  const maskShapes = mask ? screenShapes(mask.shapes, view) : [];
  const overlapLabels: string[] = [];
  for (const item of texts) {
    const before = overlapLabels.length;
    const box = { x: item.x, y: item.y, w: item.w, h: item.h };
    for (const art of worldBoxes) {
      if (art.w <= 0 || art.h <= 0 || !intersectsBox(box, art)) continue;
      const kind = plateKind(art, view);
      if (kind === "room") continue;
      if (kind === "paper") {
        const interior = paperInterior(art);
        const slack = { x: interior.x - 4, y: interior.y - 4, w: interior.w + 8, h: interior.h + 8 };
        if (boxInside(box, slack)) continue;
      }
      overlapLabels.push(`${item.text.slice(0, 16)} on ${kind} ${Math.round(art.x)},${Math.round(art.y)} ${Math.round(art.w)}x${Math.round(art.h)}`);
      break;
    }
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

function paintGlyph(ctx: PaintContext, node: GameNode, lines: string[], fontPx: number, x: number, y: number, boxW: number, boxH: number): void {
  const texture = glyphTexture(glyphSpec(node, lines, fontPx));
  if (texture && ctx.drawImage) {
    if (texture.w <= boxW + 0.5 && texture.h <= boxH + 0.5) ctx.drawImage(texture.canvas, x, y);
    else ctx.drawImage(texture.canvas, x, y, boxW, boxH);
    return;
  }
  noteGlyphFallback();
  const style = styleOf(node);
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = style.color || "#17352a";
  ctx.font = `${style.fontStyle ? `${style.fontStyle} ` : ""}${fontPx}px ${style.fontFamily || "sans-serif"}`;
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * fontPx));
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

function applyScreen(ctx: PaintContext, mat: Mat, view: ViewBox): void {
  const scale = worldScale(view);
  const offset = worldOffset(view);
  ctx.setTransform?.(scale * mat.a, scale * mat.b, scale * mat.c, scale * mat.d, offset.x + scale * mat.e, offset.y + scale * mat.f);
}

function paintTree(ctx: PaintContext, node: GameNode, parent: Mat, view: ViewBox, inherited: boolean): void {
  if (!node.visible) return;
  const mat = mul(parent, localMat(node));
  const shapes = maskShapesWorld(node);
  const draw = inherited || Boolean(node.rotation) || node.flipX || Boolean(shapes);
  const body = () => {
    if (draw && node.type !== "container") {
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

function paintMaskedTrees(scene: { children: { list: GameNode[] } }, ctx: PaintContext, view: ViewBox): void {
  if (!canClip(ctx)) return;
  for (const node of scene.children.list) paintTree(ctx, node, IDENTITY, view, false);
}

function paintItems(ctx: PaintContext, plan: FramePlan): void {
  for (const item of plan.items) {
    if (item.kind === "text" && item.text) {
      if (!item.nested && !item.onPaper) {
        ctx.fillStyle = "#f3e2c2";
        ctx.fillRect(item.x, item.y, item.w, item.h);
      }
      const lines = item.lines && item.lines.length ? item.lines : [item.text];
      paintGlyph(ctx, item.node, lines, item.fontPx, item.x, item.y, item.w, item.h);
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
