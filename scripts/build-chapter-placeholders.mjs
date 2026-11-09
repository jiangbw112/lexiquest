/**
 * Single-color silhouette placeholders for the forest chapter cosmetics.
 * Same frame grid as the warrior: 512², foot pivot (256, 448), 21 frames.
 * Trimmed into a Phaser JSON Hash atlas no larger than 2048².
 * Replacing the png/json later does not require a code change.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

const manifest = JSON.parse(readFileSync("public/assets/warrior/v0.1/manifest.json", "utf8"));
const outDir = "public/assets/chapter/forest/v0.1-placeholder";
mkdirSync(outDir, { recursive: true });

const ANIMS = [
  ["idle", 4],
  ["walk", 6],
  ["attack", 5],
  ["hit", 2],
  ["victory", 4],
];

const FRAMES = ANIMS.flatMap(([name, count]) =>
  Array.from({ length: count }, (_, index) => `${name}_${String(index).padStart(2, "0")}`),
);

const COLORS = {
  forest_leaf_cape: [47, 107, 69, 255],
  acorn_pin: [138, 90, 18, 255],
  forest_wreath: [31, 122, 77, 255],
};

function anchor(frame, name) {
  const point = manifest.anchorsPerFrame[frame]?.[name];
  if (!point) throw new Error(`missing ${name} anchor for ${frame}`);
  return [Math.round(point[0]), Math.round(point[1])];
}

function fill(png, x, y, color) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const index = (png.width * y + x) << 2;
  png.data[index] = color[0];
  png.data[index + 1] = color[1];
  png.data[index + 2] = color[2];
  png.data[index + 3] = color[3];
}

function disc(png, cx, cy, radius, color, hole = 0) {
  const r2 = radius * radius;
  const h2 = hole * hole;
  for (let y = cy - radius; y <= cy + radius; y += 1) {
    for (let x = cx - radius; x <= cx + radius; x += 1) {
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (d <= r2 && d >= h2) fill(png, x, y, color);
    }
  }
}

function paint(kind, frame) {
  const png = new PNG({ width: 512, height: 512 });
  const color = COLORS[kind];
  if (kind === "forest_leaf_cape") {
    const [x, y] = anchor(frame, "back");
    disc(png, x - 28, y + 46, 62, color);
  } else if (kind === "acorn_pin") {
    const [x, y] = anchor(frame, "chest");
    disc(png, x + 18, y + 8, 16, color);
  } else {
    const [x, y] = anchor(frame, "head");
    disc(png, x, y - 26, 30, color, 18);
  }
  return png;
}

function trim(png) {
  let minX = png.width;
  let minY = png.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      if (png.data[(png.width * y + x) * 4 + 3] === 0) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const cropped = new PNG({ width, height });
  PNG.bitblt(png, cropped, minX, minY, width, height, 0, 0);
  return { png: cropped, x: minX, y: minY, width, height };
}

function pack(kind) {
  const frames = FRAMES.map((name) => ({ name: `${kind}_${name}`, ...trim(paint(kind, name)) }));
  const padding = 2;
  let cursorX = padding;
  let cursorY = padding;
  let rowH = 0;
  let width = 0;
  const placed = [];
  for (const frame of frames) {
    if (cursorX + frame.width + padding > 2048) {
      cursorX = padding;
      cursorY += rowH + padding;
      rowH = 0;
    }
    placed.push({ ...frame, atlasX: cursorX, atlasY: cursorY });
    cursorX += frame.width + padding;
    rowH = Math.max(rowH, frame.height);
    width = Math.max(width, cursorX);
  }
  const height = cursorY + rowH + padding;
  if (width > 2048 || height > 2048) throw new Error(`${kind} atlas is ${width}x${height}`);
  const atlas = new PNG({ width, height });
  const jsonFrames = {};
  for (const frame of placed) {
    PNG.bitblt(frame.png, atlas, 0, 0, frame.width, frame.height, frame.atlasX, frame.atlasY);
    jsonFrames[frame.name] = {
      frame: { x: frame.atlasX, y: frame.atlasY, w: frame.width, h: frame.height },
      rotated: false,
      trimmed: true,
      spriteSourceSize: { x: frame.x, y: frame.y, w: frame.width, h: frame.height },
      sourceSize: { w: 512, h: 512 },
      pivot: { x: 0.5, y: 0.875 },
    };
  }
  const json = {
    frames: jsonFrames,
    meta: {
      app: "lexiquest chapter placeholder",
      version: "0.1-placeholder",
      image: `${kind}.png`,
      format: "RGBA8888",
      size: { w: width, h: height },
      scale: "2",
      placeholder: true,
      note: "单色剪影占位，不是成品图。同名同帧规格替换即可，不必改代码。",
    },
  };
  writeFileSync(`${outDir}/${kind}.png`, PNG.sync.write(atlas));
  writeFileSync(`${outDir}/${kind}.json`, JSON.stringify(json));
  return { width, height, frames: frames.length };
}

function leafIcon() {
  const png = new PNG({ width: 64, height: 64 });
  const color = [31, 122, 77, 255];
  disc(png, 32, 34, 18, color);
  disc(png, 24, 22, 10, color);
  writeFileSync(`${outDir}/title_leaf_icon.png`, PNG.sync.write(png));
}

if (FRAMES.length !== 21) throw new Error(`expected 21 frames, got ${FRAMES.length}`);
const written = {};
for (const kind of Object.keys(COLORS)) written[kind] = pack(kind);
leafIcon();
writeFileSync(
  `${outDir}/README.txt`,
  "单色剪影占位，不是成品图。正式绘制排在林冠 Boss 剩余部分之后。替换同名 png/json 即可，不必改代码。\n",
);
console.log(JSON.stringify(written));
