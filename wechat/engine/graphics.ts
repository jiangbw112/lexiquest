import { GameNode } from "./node";

export function tintMultiply(source: number, tint: number): number {
  const sr = (source >> 16) & 255;
  const sg = (source >> 8) & 255;
  const sb = source & 255;
  const tr = (tint >> 16) & 255;
  const tg = (tint >> 8) & 255;
  const tb = tint & 255;
  const r = Math.round((sr * tr) / 255);
  const g = Math.round((sg * tg) / 255);
  const b = Math.round((sb * tb) / 255);
  return (r << 16) | (g << 8) | b;
}

type Command =
  | { op: "fill"; color: number; alpha: number }
  | { op: "line"; width: number; color: number; alpha: number }
  | { op: "fillRect"; x: number; y: number; w: number; h: number }
  | { op: "fillRounded"; x: number; y: number; w: number; h: number; r: number }
  | { op: "strokeRounded"; x: number; y: number; w: number; h: number; r: number }
  | { op: "fillCircle"; x: number; y: number; r: number }
  | { op: "strokePath"; points: { x: number; y: number }[] }
  | { op: "strokeCircle"; x: number; y: number; r: number };

export class GameGraphics extends GameNode {
  commands: Command[] = [];
  fillColor = 0xffffff;
  fillAlpha = 1;
  lineWidth = 1;
  lineColor = 0x000000;
  lineAlpha = 1;
  private path: { x: number; y: number }[] = [];

  constructor(scene: unknown, x = 0, y = 0) {
    super("graphics", scene, x, y);
  }

  fillStyle(color: number, alpha = 1): this {
    this.fillColor = color;
    this.fillAlpha = alpha;
    this.commands.push({ op: "fill", color, alpha });
    return this;
  }

  lineStyle(width: number, color: number, alpha = 1): this {
    this.lineWidth = width;
    this.lineColor = color;
    this.lineAlpha = alpha;
    this.commands.push({ op: "line", width, color, alpha });
    return this;
  }

  fillRect(x: number, y: number, w: number, h: number): this {
    this.commands.push({ op: "fillRect", x, y, w, h });
    return this;
  }

  fillRoundedRect(x: number, y: number, w: number, h: number, r = 0): this {
    this.commands.push({ op: "fillRounded", x, y, w, h, r });
    return this;
  }

  strokeRoundedRect(x: number, y: number, w: number, h: number, r = 0): this {
    this.commands.push({ op: "strokeRounded", x, y, w, h, r });
    return this;
  }

  fillCircle(x: number, y: number, r: number): this {
    this.commands.push({ op: "fillCircle", x, y, r });
    return this;
  }

  beginPath(): this {
    this.path = [];
    return this;
  }

  moveTo(x: number, y: number): this {
    this.path = [{ x, y }];
    return this;
  }

  lineTo(x: number, y: number): this {
    this.path.push({ x, y });
    return this;
  }

  closePath(): this {
    return this;
  }

  strokeCircle(x: number, y: number, r: number): this {
    this.commands.push({ op: "strokeCircle", x, y, r });
    return this;
  }

  strokePath(): this {
    this.commands.push({ op: "strokePath", points: this.path.slice() });
    return this;
  }

  clear(): this {
    this.commands = [];
    return this;
  }

  createGeometryMask(): { graphics: GameGraphics } {
    return { graphics: this };
  }
}
