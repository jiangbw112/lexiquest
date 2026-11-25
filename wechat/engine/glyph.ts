/**
 * 原来：文本缓存只记测量宽高，每一帧仍对主画布 fillText。
 * 现在：同一组 12 个字段第一次画到离屏 canvas，之后主画布只 drawImage。单张边长不超过 2048，满了按 LRU 丢掉最旧的一张。
 * 为什么：逐帧 fillText 不是字形纹理。没有离屏 canvas 的运行时记一次 fallback，不把那一帧说成缓存命中。
 */

export const GLYPH_EDGE = 2048;
export const GLYPH_LIMIT = 256;

export interface GlyphSpec {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontStyle: string;
  color: string;
  stroke: string;
  strokeThickness: number;
  align: string;
  wrapWidth: number;
  lineSpacing: number;
  maxLines: number;
  origin: string;
  lines: string[];
}

export interface GlyphTexture {
  canvas: unknown;
  w: number;
  h: number;
  key: string;
}

const textures = new Map<string, GlyphTexture>();
const stats = { created: 0, reused: 0, fallback: 0, scaled: 0 };

export function glyphStats(): { created: number; reused: number; fallback: number; scaled: number; size: number } {
  return { ...stats, size: textures.size };
}

export function resetGlyphCache(): void {
  textures.clear();
  stats.created = 0;
  stats.reused = 0;
  stats.fallback = 0;
  stats.scaled = 0;
}

export function noteGlyphFallback(): void {
  stats.fallback += 1;
}

export function glyphKey(spec: GlyphSpec): string {
  return JSON.stringify({
    text: spec.text,
    fontFamily: spec.fontFamily,
    fontSize: spec.fontSize,
    fontStyle: spec.fontStyle,
    color: spec.color,
    stroke: spec.stroke,
    strokeThickness: spec.strokeThickness,
    align: spec.align,
    wrapWidth: spec.wrapWidth,
    lineSpacing: spec.lineSpacing,
    maxLines: spec.maxLines,
    origin: spec.origin,
  });
}

function fontOf(spec: GlyphSpec): string {
  const family = spec.fontFamily || "sans-serif";
  const size = spec.fontSize > 0 ? spec.fontSize : 16;
  return spec.fontStyle ? `${spec.fontStyle} ${size}px ${family}` : `${size}px ${family}`;
}

function makeCanvas(width: number, height: number): { getContext?: (kind: string) => GlyphDraw | null; width?: number; height?: number } | null {
  const offscreen = (globalThis as { OffscreenCanvas?: new (w: number, h: number) => { getContext?: (kind: string) => GlyphDraw | null; width: number; height: number } }).OffscreenCanvas;
  if (typeof offscreen === "function") return new offscreen(width, height);
  const document = (globalThis as { document?: { createElement?: (tag: string) => { getContext?: (kind: string) => GlyphDraw | null; width: number; height: number } } }).document;
  const canvas = document?.createElement?.("canvas");
  if (!canvas) return null;
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

interface GlyphDraw {
  font: string;
  fillStyle: string;
  strokeStyle?: string;
  lineWidth?: number;
  textBaseline: string;
  textAlign: string;
  measureText: (value: string) => { width: number };
  fillText: (value: string, x: number, y: number) => void;
  strokeText?: (value: string, x: number, y: number) => void;
}

export function glyphTexture(spec: GlyphSpec): GlyphTexture | null {
  const key = glyphKey(spec);
  const cached = textures.get(key);
  if (cached) {
    textures.delete(key);
    textures.set(key, cached);
    stats.reused += 1;
    return cached;
  }
  const lines = spec.lines.length ? spec.lines : spec.text ? [spec.text] : [];
  if (!lines.length) return null;
  const font = fontOf(spec);
  const probe = makeCanvas(4, 4);
  const probeCtx = probe?.getContext?.("2d");
  if (!probe || !probeCtx) return null;
  probeCtx.font = font;
  const gap = spec.lineSpacing > 0 ? spec.lineSpacing : 0;
  const size = spec.fontSize > 0 ? spec.fontSize : 16;
  let width = 1;
  for (const line of lines) width = Math.max(width, probeCtx.measureText(line).width || size);
  let height = lines.length * size + Math.max(0, lines.length - 1) * gap;
  width = Math.max(1, Math.ceil(width));
  height = Math.max(1, Math.ceil(height));
  let scale = 1;
  if (width > GLYPH_EDGE || height > GLYPH_EDGE) {
    scale = Math.min(GLYPH_EDGE / width, GLYPH_EDGE / height);
    stats.scaled += 1;
  }
  const canvas = makeCanvas(Math.max(1, Math.floor(width * scale)), Math.max(1, Math.floor(height * scale)));
  const ctx = canvas?.getContext?.("2d");
  if (!canvas || !ctx) return null;
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillStyle = spec.color || "#17352a";
  if (scale !== 1 && (ctx as GlyphDraw & { scale?: (x: number, y: number) => void }).scale) {
    (ctx as GlyphDraw & { scale: (x: number, y: number) => void }).scale(scale, scale);
  }
  lines.forEach((line, index) => {
    const y = index * (size + gap);
    if (spec.strokeThickness > 0 && ctx.strokeText) {
      ctx.strokeStyle = spec.stroke || "#ffffff";
      ctx.lineWidth = spec.strokeThickness;
      ctx.strokeText(line, 0, y);
    }
    ctx.fillText(line, 0, y);
  });
  const texture = { canvas, w: Math.max(1, Math.floor(width * scale)), h: Math.max(1, Math.floor(height * scale)), key };
  if (textures.size >= GLYPH_LIMIT) {
    const oldest = textures.keys().next().value;
    if (oldest) textures.delete(oldest);
  }
  textures.set(key, texture);
  stats.created += 1;
  return texture;
}
