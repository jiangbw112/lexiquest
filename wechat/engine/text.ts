import { wrapCjkText } from "../../src/game/layout";
import { GameNode } from "./node";

export const TEXT_CACHE_FIELDS = [
  "text",
  "fontFamily",
  "fontSize",
  "fontStyle",
  "color",
  "stroke",
  "strokeThickness",
  "align",
  "wrapWidth",
  "lineSpacing",
  "maxLines",
  "origin",
] as const;

export interface TextStyle {
  fontFamily?: string;
  fontSize?: string | number;
  fontStyle?: string;
  color?: string;
  stroke?: string;
  strokeThickness?: number;
  align?: string;
  wordWrap?: { width?: number };
  lineSpacing?: number;
  maxLines?: number;
}

const cache = new Map<string, { w: number; h: number }>();
const CACHE_LIMIT = 256;

function fontSizeOf(style: TextStyle): number {
  return Number.parseFloat(String(style.fontSize ?? "16")) || 16;
}

function weightOf(style: TextStyle): string {
  const raw = style.fontStyle;
  if (!raw) return "";
  return String(raw);
}

export class GameText extends GameNode {
  text: string;
  style: TextStyle;
  context: { measureText: (sample: string) => { width: number }; font: string };
  private measuredWith: "canvas" | "fallback" = "fallback";

  constructor(scene: unknown, x: number, y: number, text: string, style: TextStyle = {}) {
    super("text", scene, x, y);
    this.text = text;
    this.style = { ...style };
    this.context = {
      font: "",
      measureText: (sample: string) => ({ width: this.measure(sample) }),
    };
    this.sync();
  }

  private measure(sample: string): number {
    const canvas = (globalThis as { document?: { createElement?: (tag: string) => { getContext?: (kind: string) => { font: string; measureText: (value: string) => { width: number } } | null } } }).document;
    const size = fontSizeOf(this.style);
    const family = this.style.fontFamily || "sans-serif";
    const weight = weightOf(this.style);
    const font = weight ? `${weight} ${size}px ${family}` : `${size}px ${family}`;
    this.context.font = font;
    try {
      const node = canvas?.createElement?.("canvas");
      const ctx = node?.getContext?.("2d");
      if (ctx) {
        ctx.font = font;
        this.measuredWith = "canvas";
        return ctx.measureText(sample).width;
      }
    } catch {
      /* Node has no document canvas. The width below is a fallback and is not a pass for W1. */
    }
    this.measuredWith = "fallback";
    let pixels = 0;
    for (const char of sample) pixels += char.charCodeAt(0) <= 0x7e ? size * 0.55 : size;
    return pixels;
  }

  cacheKey(): string {
    const style = this.style;
    const fields = {
      text: this.wrapped(),
      fontFamily: style.fontFamily || "",
      fontSize: fontSizeOf(style),
      fontStyle: weightOf(style),
      color: style.color || "",
      stroke: style.stroke || "",
      strokeThickness: style.strokeThickness || 0,
      align: style.align || "left",
      wrapWidth: style.wordWrap?.width || 0,
      lineSpacing: style.lineSpacing || 0,
      maxLines: style.maxLines || 0,
      origin: `${this.originX},${this.originY}`,
    };
    return JSON.stringify(fields);
  }

  wrapped(): string {
    const width = this.style.wordWrap?.width;
    if (!width) return this.text;
    return wrapCjkText(this.text, width, (sample) => this.measure(sample));
  }

  private sync(): void {
    const key = this.cacheKey();
    const lines = this.wrapped().split("\n");
    const size = fontSizeOf(this.style);
    const gap = this.style.lineSpacing || 0;
    let width = 0;
    for (const line of lines) width = Math.max(width, this.measure(line));
    const height = lines.length * size + Math.max(0, lines.length - 1) * gap;
    if (!cache.has(key) && cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next().value;
      if (oldest) cache.delete(oldest);
    }
    cache.set(key, { w: width, h: height });
    this.width = width;
    this.height = height;
  }

  setText(text: string): this {
    this.text = text;
    this.sync();
    return this;
  }

  setStyle(style: TextStyle): this {
    this.style = { ...this.style, ...style };
    this.sync();
    return this;
  }

  setColor(color: string): this {
    this.style.color = color;
    this.sync();
    return this;
  }

  setFontSize(size: string | number): this {
    this.style.fontSize = size;
    this.sync();
    return this;
  }

  setWordWrapWidth(width: number): this {
    this.style.wordWrap = { width };
    this.sync();
    return this;
  }

  setLineSpacing(spacing: number): this {
    this.style.lineSpacing = spacing;
    this.sync();
    return this;
  }

  setAlign(align: string): this {
    this.style.align = align;
    this.sync();
    return this;
  }

  measurement(): "canvas" | "fallback" {
    return this.measuredWith;
  }
}

export function textCacheSize(): number {
  return cache.size;
}
