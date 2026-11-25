import { screenFontPx, screenToWorld, UI_GAP, UI_HIT, worldScale, worldToScreen, type ViewBox } from "./coords";
import { displayBox, orderByDepth, type GameNode } from "./node";

/**
 * 原来：场景把字号和按钮都放在 1280×800 里，画布再整体乘 worldScale，18px 会变成约 8.78。
 * 现在：背景和色块仍走世界层。文字用 screenFontPx，热区至少 44，重叠的 UI 往下让出 8px。
 * 为什么：不能改场景文件。命中用这一帧排出的屏幕盒，和文字是同一层。
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
  node: GameNode;
}

export interface FramePlan {
  items: PaintBox[];
  texts: PaintBox[];
  hits: PaintBox[];
  minFont: number;
  minHit: number;
  minGap: number;
}

interface PaintContext {
  fillStyle: string;
  font: string;
  textBaseline: string;
  textAlign: string;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
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

function flatten(nodes: GameNode[], out: GameNode[]): void {
  for (const node of nodes) {
    out.push(node);
    const list = (node as GameNode & { list?: GameNode[] }).list;
    if (node.type === "container" && list) flatten(list, out);
  }
}

function authoredFont(node: GameNode): number {
  const style = (node as GameNode & { style?: { fontSize?: string | number } }).style;
  return Number.parseFloat(String(style?.fontSize ?? "16")) || 16;
}

function axisGap(a: PaintBox, b: PaintBox): { gapX: number; gapY: number } {
  return {
    gapX: Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)),
    gapY: Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)),
  };
}

function farEnough(a: PaintBox, b: PaintBox): boolean {
  const gap = axisGap(a, b);
  return gap.gapX >= UI_GAP || gap.gapY >= UI_GAP;
}

function separate(items: PaintBox[]): void {
  const boxes = items.filter((item) => item.kind === "text" || item.interactive);
  boxes.sort((a, b) => a.y - b.y || a.x - b.x);
  for (let guard = 0; guard < boxes.length * 4; guard += 1) {
    let moved = false;
    for (let index = 0; index < boxes.length; index += 1) {
      for (let earlier = 0; earlier < index; earlier += 1) {
        const prev = boxes[earlier];
        const cur = boxes[index];
        if (farEnough(prev, cur)) continue;
        const nextY = prev.y + prev.h + UI_GAP;
        if (cur.y < nextY) {
          cur.y = nextY;
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
}

export function layoutFrame(scene: { children: { list: GameNode[] } } | null, view: ViewBox): FramePlan {
  const flat: GameNode[] = [];
  if (scene) flatten(scene.children.list, flat);
  const ordered = orderByDepth(flat.filter((node) => node.visible));
  const scale = worldScale(view);
  const items: PaintBox[] = [];
  for (const node of ordered) {
    if (node.type === "container" && !node.inputEnabled) continue;
    const at = worldOf(node);
    const box = displayBox({ ...node, x: at.x, y: at.y });
    if (node.type === "text") {
      const fontPx = screenFontPx(authoredFont(node));
      const authored = Math.max(1, authoredFont(node));
      const ratio = fontPx / authored;
      const screen = worldToScreen({ x: box.x, y: box.y }, view);
      items.push({
        kind: "text",
        text: String((node as GameNode & { text?: string }).text ?? ""),
        fontPx,
        x: screen.x,
        y: screen.y,
        w: Math.max(1, box.w * ratio),
        h: Math.max(fontPx, box.h * ratio),
        interactive: node.inputEnabled,
        node,
      });
      continue;
    }
    const screen = worldToScreen({ x: box.x, y: box.y }, view);
    let w = Math.max(1, box.w * scale);
    let h = Math.max(1, box.h * scale);
    let x = screen.x;
    let y = screen.y;
    if (node.inputEnabled) {
      if (w < UI_HIT) {
        x -= (UI_HIT - w) / 2;
        w = UI_HIT;
      }
      if (h < UI_HIT) {
        y -= (UI_HIT - h) / 2;
        h = UI_HIT;
      }
    }
    items.push({
      kind: node.type,
      text: "",
      fontPx: 0,
      x,
      y,
      w,
      h,
      interactive: node.inputEnabled,
      node,
    });
  }
  separate(items);
  const texts = items.filter((item) => item.kind === "text" && item.text.length > 0);
  const hits = items.filter((item) => item.interactive);
  const fonts = texts.map((item) => item.fontPx);
  const hitSides = hits.flatMap((item) => [item.w, item.h]);
  let minGap = hits.length > 1 ? UI_GAP : UI_GAP;
  for (let left = 0; left < hits.length; left += 1) {
    for (let right = left + 1; right < hits.length; right += 1) {
      const gap = axisGap(hits[left], hits[right]);
      if (gap.gapX >= UI_GAP || gap.gapY >= UI_GAP) continue;
      minGap = Math.min(minGap, Math.max(gap.gapX, gap.gapY));
    }
  }
  return {
    items,
    texts,
    hits,
    minFont: fonts.length ? Math.min(...fonts) : 0,
    minHit: hitSides.length ? Math.min(...hitSides) : 0,
    minGap,
  };
}

function hex(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, "0").slice(-6)}`;
}

export function paintFrame(scene: { children: { list: GameNode[] } } | null, ctx: PaintContext | null, view: ViewBox): FramePlan {
  const plan = layoutFrame(scene, view);
  if (!ctx) return plan;
  for (const item of plan.items) {
    if (item.kind === "text") {
      const style = (item.node as GameNode & { style?: { color?: string; fontFamily?: string; fontStyle?: string } }).style;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = style?.color || "#17352a";
      const weight = style?.fontStyle ? `${style.fontStyle} ` : "";
      ctx.font = `${weight}${item.fontPx}px ${style?.fontFamily || "sans-serif"}`;
      const lines = item.text.split("\n");
      lines.forEach((line, index) => ctx.fillText(line, item.x, item.y + index * item.fontPx));
      continue;
    }
    const fill = (item.node as GameNode & { fillColor?: number }).fillColor;
    ctx.fillStyle = hex(typeof fill === "number" ? fill : 0xc9a06a);
    ctx.fillRect(item.x, item.y, item.w, item.h);
  }
  return plan;
}

export function pressFrame(scene: { children: { list: GameNode[] } } | null, view: ViewBox, x: number, y: number): PaintBox | null {
  const plan = layoutFrame(scene, view);
  const hits = plan.hits.filter((item) => x >= item.x && x < item.x + item.w && y >= item.y && y < item.y + item.h);
  const hit = hits[hits.length - 1] ?? null;
  if (!hit) return null;
  const world = screenToWorld({ x, y }, view);
  hit.node.emit("pointerdown", { x: world.x, y: world.y });
  hit.node.emit("pointerup", { x: world.x, y: world.y });
  return hit;
}
