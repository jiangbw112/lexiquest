import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const spec = JSON.parse(readFileSync(new URL("../src/game/art/atlas-spec.json", import.meta.url), "utf8"));

const SKIN = [243, 188, 150, 255];
const HAIR = [107, 62, 46, 255];
const TUNIC = [47, 143, 98, 255];
const CAPE = [24, 110, 72, 255];
const SASH = [240, 180, 41, 255];
const EMBLEM = [196, 83, 58, 255];
const SHOE = [36, 48, 68, 255];
const INK = [42, 49, 72, 255];
const PAPER = [247, 241, 228, 255];
const LEAF = [125, 190, 85, 255];

function blank(width, height) {
  return new PNG({ width, height });
}

function paint(png, x, y, color) {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= png.width || py >= png.height) return;
  const i = (png.width * py + px) << 2;
  const sa = color[3] / 255;
  const da = png.data[i + 3] / 255;
  const out = sa + da * (1 - sa);
  if (out <= 0) return;
  png.data[i] = Math.round((color[0] * sa + png.data[i] * da * (1 - sa)) / out);
  png.data[i + 1] = Math.round((color[1] * sa + png.data[i + 1] * da * (1 - sa)) / out);
  png.data[i + 2] = Math.round((color[2] * sa + png.data[i + 2] * da * (1 - sa)) / out);
  png.data[i + 3] = Math.round(out * 255);
}

function disc(png, cx, cy, radius, color) {
  const r2 = radius * radius;
  for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
    for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      if (dx * dx + dy * dy <= r2) paint(png, x, y, color);
    }
  }
}

function ellipse(png, cx, cy, rx, ry, color) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) paint(png, x, y, color);
    }
  }
}

function fillPoly(png, points, color) {
  const minY = Math.floor(Math.min(...points.map((point) => point.y)));
  const maxY = Math.ceil(Math.max(...points.map((point) => point.y)));
  for (let y = minY; y <= maxY; y += 1) {
    const xs = [];
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      if ((a.y <= y && b.y > y) || (b.y <= y && a.y > y)) {
        const t = (y - a.y) / (b.y - a.y);
        xs.push(a.x + t * (b.x - a.x));
      }
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      for (let x = Math.ceil(xs[i]); x <= Math.floor(xs[i + 1]); x += 1) paint(png, x, y, color);
    }
  }
}

function blit(dest, src, dx, dy) {
  for (let y = 0; y < src.height; y += 1) {
    for (let x = 0; x < src.width; x += 1) {
      const si = (src.width * y + x) << 2;
      if (src.data[si + 3] === 0) continue;
      const di = (dest.width * (y + dy) + (x + dx)) << 2;
      dest.data[di] = src.data[si];
      dest.data[di + 1] = src.data[si + 1];
      dest.data[di + 2] = src.data[si + 2];
      dest.data[di + 3] = src.data[si + 3];
    }
  }
}

function drawFrame(name) {
  if (name.startsWith("side/")) return drawSide(name);
  if (name.startsWith("top/")) return drawTop(name);
  return drawMonster(name);
}

function drawSide(name) {
  const png = blank(spec.side.width, spec.side.height);
  if (name === "side/cape") {
    fillPoly(png, [
      { x: 150, y: 130 },
      { x: 70, y: 150 },
      { x: 48, y: 250 },
      { x: 120, y: 270 },
      { x: 150, y: 200 },
    ], CAPE);
  } else if (name === "side/body") {
    ellipse(png, 116, 250, 16, 42, SKIN);
    ellipse(png, 148, 250, 16, 42, SKIN);
    disc(png, 116, 286, 16, SHOE);
    disc(png, 148, 286, 16, SHOE);
    ellipse(png, 168, 176, 14, 36, SKIN);
    disc(png, 176, 210, 12, SKIN);
    ellipse(png, 128, 168, 38, 48, SKIN);
    disc(png, 146, 92, 36, SKIN);
    disc(png, 160, 90, 5, [255, 250, 243, 255]);
    disc(png, 162, 91, 2.4, [29, 36, 48, 255]);
    disc(png, 132, 104, 1.6, [179, 107, 69, 255]);
    disc(png, 140, 108, 1.4, [179, 107, 69, 255]);
    fillPoly(png, [
      { x: 150, y: 112 },
      { x: 168, y: 116 },
      { x: 158, y: 120 },
    ], [161, 91, 72, 255]);
  } else if (name === "side/tunic") {
    ellipse(png, 128, 176, 40, 46, TUNIC);
    ellipse(png, 168, 168, 16, 28, TUNIC);
    ellipse(png, 118, 214, 18, 22, TUNIC);
    ellipse(png, 150, 214, 18, 22, TUNIC);
  } else if (name === "side/hair") {
    ellipse(png, 136, 74, 40, 28, HAIR);
    disc(png, 108, 96, 14, HAIR);
    ellipse(png, 96, 130, 12, 28, HAIR);
  } else if (name === "side/sash") {
    fillPoly(png, [
      { x: 96, y: 150 },
      { x: 168, y: 138 },
      { x: 176, y: 156 },
      { x: 104, y: 176 },
    ], SASH);
  } else if (name === "side/emblem") {
    fillPoly(png, [
      { x: 132, y: 158 },
      { x: 146, y: 170 },
      { x: 132, y: 184 },
      { x: 118, y: 170 },
    ], EMBLEM);
  } else if (name === "side/hat-leaf") {
    ellipse(png, 168, 52, 18, 8, LEAF);
  } else if (name === "side/hat-star") {
    disc(png, 150, 42, 8, SASH);
    disc(png, 150, 42, 3, [255, 248, 220, 255]);
  }
  return png;
}

function drawTop(name) {
  const png = blank(spec.top.width, spec.top.height);
  if (name === "top/shadow") {
    ellipse(png, 64, 142, 28, 8, [20, 40, 28, 70]);
  } else if (name === "top/cape") {
    ellipse(png, 64, 104, 34, 40, CAPE);
  } else if (name === "top/body") {
    ellipse(png, 64, 108, 24, 30, TUNIC);
    disc(png, 64, 62, 20, SKIN);
    disc(png, 58, 62, 2, [29, 36, 48, 255]);
    disc(png, 70, 62, 2, [29, 36, 48, 255]);
  } else if (name === "top/hair") {
    ellipse(png, 64, 50, 22, 14, HAIR);
    disc(png, 46, 66, 8, HAIR);
  } else if (name === "top/sash") {
    fillPoly(png, [
      { x: 44, y: 96 },
      { x: 86, y: 90 },
      { x: 90, y: 102 },
      { x: 48, y: 110 },
    ], SASH);
  }
  return png;
}

function drawMonster(name) {
  const png = blank(spec.monster.width, spec.monster.height);
  if (name === "monster/inkling") {
    ellipse(png, 128, 236, 46, 10, [20, 40, 28, 80]);
    disc(png, 78, 196, 16, INK);
    disc(png, 176, 188, 18, INK);
    disc(png, 128, 132, 72, INK);
    disc(png, 128, 150, 40, [62, 72, 98, 255]);
    disc(png, 104, 124, 12, [255, 250, 243, 255]);
    disc(png, 142, 124, 12, [255, 250, 243, 255]);
    disc(png, 102, 126, 5, [29, 36, 48, 255]);
    disc(png, 140, 126, 5, [29, 36, 48, 255]);
    disc(png, 86, 146, 6, [239, 139, 154, 180]);
  } else {
    ellipse(png, 128, 236, 40, 10, [20, 40, 28, 80]);
    fillPoly(png, [
      { x: 70, y: 70 },
      { x: 190, y: 78 },
      { x: 184, y: 210 },
      { x: 64, y: 200 },
    ], PAPER);
    fillPoly(png, [
      { x: 168, y: 78 },
      { x: 196, y: 86 },
      { x: 188, y: 214 },
      { x: 160, y: 206 },
    ], [215, 180, 138, 255]);
    disc(png, 104, 130, 8, [255, 255, 255, 255]);
    disc(png, 140, 132, 8, [255, 255, 255, 255]);
    disc(png, 102, 132, 3, [36, 48, 68, 255]);
    disc(png, 138, 134, 3, [36, 48, 68, 255]);
  }
  return png;
}

function drawVillage() {
  const png = blank(1280, 800);
  for (let y = 0; y < 800; y += 1) {
    const t = y / 800;
    const sky = y < 280;
    const color = sky
      ? [140 + t * 40, 206, 232, 255]
      : [y < 430 ? 92 : 54, y < 430 ? 168 : 120, y < 430 ? 86 : 62, 255];
    for (let x = 0; x < 1280; x += 1) paint(png, x, y, color);
  }
  fillPoly(png, [
    { x: 180, y: 300 },
    { x: 1100, y: 280 },
    { x: 1240, y: 760 },
    { x: 40, y: 760 },
  ], [70, 150, 78, 255]);
  fillPoly(png, [
    { x: 560, y: 340 },
    { x: 760, y: 330 },
    { x: 820, y: 740 },
    { x: 470, y: 750 },
  ], [214, 186, 120, 255]);
  disc(png, 180, 460, 36, [36, 110, 58, 255]);
  disc(png, 1120, 500, 42, [36, 110, 58, 255]);
  disc(png, 250, 180, 28, [255, 255, 255, 180]);
  disc(png, 980, 140, 22, [255, 255, 255, 170]);
  return png;
}

const views = ["side", "top", "monster"];
const queue = views.flatMap((view) => spec[view].frames.map((name) => ({ name, view })));
let cursorX = 0;
let cursorY = 0;
let rowH = 0;
let width = 0;
const placed = [];
for (const item of queue) {
  const frameW = spec[item.view].width;
  const frameH = spec[item.view].height;
  if (cursorX + frameW > 1024) {
    cursorX = 0;
    cursorY += rowH;
    rowH = 0;
  }
  placed.push({ ...item, x: cursorX, y: cursorY, w: frameW, h: frameH });
  cursorX += frameW;
  rowH = Math.max(rowH, frameH);
  width = Math.max(width, cursorX);
}
const height = cursorY + rowH;
const sheet = blank(width, height);
const frames = {};
for (const item of placed) {
  blit(sheet, drawFrame(item.name), item.x, item.y);
  frames[item.name] = {
    frame: { x: item.x, y: item.y, w: item.w, h: item.h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: item.w, h: item.h },
    sourceSize: { w: item.w, h: item.h },
  };
}
const atlas = {
  frames,
  meta: {
    app: "lexiquest-placeholder",
    image: "actors.png",
    format: "RGBA8888",
    size: { w: width, h: height },
    scale: "1",
    lexiquest: spec,
  },
};

mkdirSync(new URL("../public/assets/atlases/", import.meta.url), { recursive: true });
mkdirSync(new URL("../public/assets/map/", import.meta.url), { recursive: true });
writeFileSync(new URL("../public/assets/atlases/actors.png", import.meta.url), PNG.sync.write(sheet));
writeFileSync(new URL("../public/assets/atlases/actors.json", import.meta.url), JSON.stringify(atlas));
writeFileSync(new URL("../public/assets/map/village.png", import.meta.url), PNG.sync.write(drawVillage()));
console.log(`actors ${width}x${height}, frames ${Object.keys(frames).length}`);
