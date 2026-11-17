import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CHAPTER_BOSS_DISPLAY_HEIGHT } from "../domain/chapter-bosses";
import { EXAM_BOSS_SCALE, EXAM_BOSS_X, EXAM_BOSS_Y, EXAMS } from "../domain/exams";
import { BATTLE_CARD_H, BATTLE_CARD_W } from "../domain/battle-card-layout";
import { CLASS_SIDE_ORIGIN } from "./art/class-atlas";
import { examAtlases, examLayers, type ExamPose } from "./art/exam-art";
import { BOSS_BATTLE_POS, BOSS_ORIGIN, BOSS_SCALE } from "./art/boss-pack";
import {
  BATTLE_ANSWER_REVEAL,
  EXAM_ANSWER_REVEAL,
  answerRevealLayout,
  type ScreenBox,
} from "./answer-reveal-layout";
import {
  BATTLE_ACTION_H,
  BATTLE_ACTION_W,
  BATTLE_ACTION_X,
  BATTLE_ACTION_Y,
  BATTLE_CARD_LEFT,
  BATTLE_CARD_PITCH,
  BATTLE_CARD_TOP,
  BATTLE_FOOT_Y,
  BATTLE_HERO_SCALE,
  BATTLE_HP_ENEMY,
  BATTLE_HP_PLAYER,
  BATTLE_LEAVE,
  BATTLE_NOTE,
  BATTLE_SHAKEN,
  BATTLE_TITLE_Y,
  EXAM_NAME,
  EXAM_PHASE_TEXT,
  EXAM_STRIKE_BUTTON,
  MONSTER_ORIGIN,
  MONSTER_SCALE,
  RANGER_SWAP,
  SCOUT_HINT,
  TITLE_CHIP_H,
  TITLE_CHIP_SCALE,
  TITLE_CHIP_W,
  centerBox,
} from "./battle-hud";
import { PLAYER_BATTLE_X, MONSTER_BATTLE_X } from "./battle-lunge";
import { ATTACK_HINT_TOAST, GAME_H, GAME_W } from "./layout";
import { drawnSpriteBox, naivePivotBox, type AtlasFrame } from "./sprite-screen-box";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const POSES: readonly ExamPose[] = ["idle", "attack", "hit", "defeat"];
const GAP = 8;

function separation(a: ScreenBox, b: ScreenBox): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  if (dx < 0 && dy < 0) return Math.max(dx, dy);
  if (dx < 0) return dy;
  if (dy < 0) return dx;
  return Math.max(dx, dy);
}

function inside(inner: ScreenBox, outer: ScreenBox): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function walkJson(dir: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walkJson(path));
    else if (entry.name.endsWith(".json")) found.push(path);
  }
  return found;
}

function atlasFrames(path: string): { name: string; frame: AtlasFrame }[] {
  const packed = JSON.parse(readFileSync(path, "utf8")) as {
    frames: Record<string, AtlasFrame & { spriteSourceSize?: AtlasFrame["spriteSourceSize"] }>;
  };
  return Object.entries(packed.frames).map(([name, frame]) => {
    if (!frame.spriteSourceSize || !frame.sourceSize) throw new Error(`${path} ${name} is missing trim data`);
    return { name, frame };
  });
}

function worstGap(plate: ScreenBox, boxes: { label: string; box: ScreenBox }[]): { label: string; gap: number } {
  let worst = { label: "none", gap: Number.POSITIVE_INFINITY };
  for (const item of boxes) {
    const gap = separation(plate, item.box);
    if (gap < worst.gap) worst = { label: item.label, gap };
  }
  return worst;
}

describe("answer reveal plate", () => {
  const battle = answerRevealLayout(BATTLE_ANSWER_REVEAL);
  const exam = answerRevealLayout(EXAM_ANSWER_REVEAL);

  it("puts English and Chinese on their own lines and keeps the listen button in its column", () => {
    const painter = readFileSync(new URL("./answer-reveal.ts", import.meta.url), "utf8");
    expect(painter).not.toContain("setScale");
    for (const layout of [battle, exam]) {
      expect(inside(layout.button, layout.plate)).toBe(true);
      expect(inside(layout.label, layout.plate)).toBe(true);
      expect(inside(layout.english, layout.plate)).toBe(true);
      expect(inside(layout.chinese, layout.plate)).toBe(true);
      expect(layout.english.y).toBeGreaterThan(layout.label.y + layout.label.h);
      expect(layout.chinese.y).toBeGreaterThan(layout.english.y + layout.english.h);
      expect(separation(layout.english, layout.chinese)).toBeGreaterThan(0);
      expect(separation(layout.label, layout.button)).toBeGreaterThanOrEqual(GAP);
      expect(separation(layout.english, layout.button)).toBeGreaterThanOrEqual(GAP);
      expect(separation(layout.chinese, layout.button)).toBeGreaterThanOrEqual(GAP);
      expect(layout.button.w).toBe(140);
      expect(layout.button.h).toBe(48);
    }
    expect(BATTLE_ANSWER_REVEAL.englishPx).toBeGreaterThanOrEqual(24);
    expect(BATTLE_ANSWER_REVEAL.chinesePx).toBeGreaterThanOrEqual(22);
    expect(EXAM_ANSWER_REVEAL.englishPx).toBeGreaterThanOrEqual(28);
    expect(EXAM_ANSWER_REVEAL.labelPx).toBeGreaterThanOrEqual(18);
  });

  it("clears the choose-phase fighters, the swap control, and the other battle controls", () => {
    const boxes: { label: string; box: ScreenBox }[] = [];
    const push = (label: string, box: ScreenBox) => boxes.push({ label, box });
    for (const path of walkJson(join(ROOT, "public/assets/classes/v1.0/side"))) {
      for (const { name, frame } of atlasFrames(path)) {
        push(`hero ${name}`, drawnSpriteBox(frame, PLAYER_BATTLE_X, BATTLE_FOOT_Y, BATTLE_HERO_SCALE, "origin", CLASS_SIDE_ORIGIN));
      }
    }
    for (const path of walkJson(join(ROOT, "public/assets/boss/canopy/v0.1/atlas"))) {
      for (const { name, frame } of atlasFrames(path)) {
        const pivot = frame.pivot ?? BOSS_ORIGIN;
        push(`canopy ${name}`, drawnSpriteBox(frame, BOSS_BATTLE_POS.x, BOSS_BATTLE_POS.y, BOSS_SCALE, "origin", pivot));
      }
    }
    for (const path of walkJson(join(ROOT, "public/assets/chapter/bosses"))) {
      for (const { name, frame } of atlasFrames(path)) {
        const pivot = frame.pivot ?? { x: 0.5, y: 1 };
        const scale = CHAPTER_BOSS_DISPLAY_HEIGHT / frame.sourceSize.h;
        push(`chapter ${name}`, drawnSpriteBox(frame, BOSS_BATTLE_POS.x, BOSS_BATTLE_POS.y, scale, "plant", pivot));
      }
    }
    const minionDirs = [
      join(ROOT, "public/assets/warm/atlas/atlas_monsters.json"),
      ...walkJson(join(ROOT, "public/assets/chapter/scenes/minions")),
    ];
    for (const path of minionDirs) {
      for (const { name, frame } of atlasFrames(path)) {
        push(`minion ${name}`, drawnSpriteBox(frame, MONSTER_BATTLE_X, BATTLE_FOOT_Y, MONSTER_SCALE, "origin", MONSTER_ORIGIN));
      }
    }
    push("note", centerBox(BATTLE_NOTE.x, BATTLE_NOTE.y, BATTLE_NOTE.w, BATTLE_NOTE.h));
    push("player hp", centerBox(BATTLE_HP_PLAYER.x, BATTLE_HP_PLAYER.y, BATTLE_HP_PLAYER.w, BATTLE_HP_PLAYER.h));
    push("enemy hp", centerBox(BATTLE_HP_ENEMY.x, BATTLE_HP_ENEMY.y, BATTLE_HP_ENEMY.w, BATTLE_HP_ENEMY.h));
    push("title", centerBox(PLAYER_BATTLE_X, BATTLE_TITLE_Y, TITLE_CHIP_W * TITLE_CHIP_SCALE, TITLE_CHIP_H * TITLE_CHIP_SCALE));
    push("shaken", { x: BATTLE_SHAKEN.x, y: BATTLE_SHAKEN.y, w: BATTLE_SHAKEN.wrap, h: BATTLE_SHAKEN.fontPx * 3 });
    push("scout", { x: SCOUT_HINT.x - SCOUT_HINT.wrap / 2, y: SCOUT_HINT.y, w: SCOUT_HINT.wrap, h: SCOUT_HINT.fontPx * 2 });
    push("toast", centerBox(ATTACK_HINT_TOAST.x, ATTACK_HINT_TOAST.y, 480, 52));
    for (const x of BATTLE_ACTION_X) push("action", centerBox(x, BATTLE_ACTION_Y, BATTLE_ACTION_W, BATTLE_ACTION_H));
    push("leave", centerBox(BATTLE_LEAVE.x, BATTLE_LEAVE.y, BATTLE_LEAVE.w, BATTLE_LEAVE.h));
    for (let index = 0; index < 3; index += 1) {
      push("card", { x: BATTLE_CARD_LEFT + index * BATTLE_CARD_PITCH, y: BATTLE_CARD_TOP, w: BATTLE_CARD_W, h: BATTLE_CARD_H });
    }
    push("swap ready", centerBox(RANGER_SWAP.x, RANGER_SWAP.y, RANGER_SWAP.readyW, RANGER_SWAP.readyH));
    push("swap used", centerBox(RANGER_SWAP.x, RANGER_SWAP.y, RANGER_SWAP.usedW, RANGER_SWAP.usedH));
    const worst = worstGap(battle.plate, boxes);
    expect(worst.gap, worst.label).toBeGreaterThanOrEqual(GAP);
    expect(worstGap(battle.button, boxes).gap).toBeGreaterThanOrEqual(GAP);
    expect(RANGER_SWAP).toEqual({ x: 640, y: 300, readyW: 140, readyH: 48, usedW: 240, usedH: 48 });
    const scene = readFileSync(new URL("./scenes/BattleScene.ts", import.meta.url), "utf8");
    expect(scene).toContain("swapOffer(this.state)");
    expect(scene).toContain("RANGER_SWAP.x");
    expect(scene).toContain('hidden: this.state.phase === "question"');
    expect(boxes.length).toBeGreaterThan(100);
  });

  it("clears the exam boss where the planter actually draws it", () => {
    const boxes: { label: string; box: ScreenBox }[] = [];
    const seen = new Set<string>();
    let midTop = Number.POSITIVE_INFINITY;
    let midNaive = Number.POSITIVE_INFINITY;
    let cloakTop = Number.POSITIVE_INFINITY;
    let coverTop = Number.POSITIVE_INFINITY;
    let compassBottom = Number.NEGATIVE_INFINITY;
    let compassNaive: ScreenBox | null = null;
    for (const exam of EXAMS) {
      const files = new Map(examAtlases(exam).map((file) => [file.key, join(ROOT, "public", file.dataUrl.replace(/^\//, ""))]));
      for (let phase = 1; phase <= exam.phases; phase += 1) {
        for (const pose of POSES) {
          for (const layer of examLayers(exam, phase, pose)) {
            const path = files.get(layer.key);
            if (!path || seen.has(`${exam.id}:${path}`)) continue;
            seen.add(`${exam.id}:${path}`);
            for (const { name, frame } of atlasFrames(path)) {
              const pivot = frame.pivot ?? { x: 0.5, y: 0.875 };
              const drawn = drawnSpriteBox(frame, EXAM_BOSS_X, EXAM_BOSS_Y, EXAM_BOSS_SCALE, "plant", pivot);
              boxes.push({ label: `${exam.id} ${name}`, box: drawn });
              if (exam.id === "exam_g3_s1_mid" && name.includes("body") && name.includes("idle")) {
                const naive = naivePivotBox(frame, EXAM_BOSS_X, EXAM_BOSS_Y, EXAM_BOSS_SCALE, pivot);
                midTop = Math.min(midTop, drawn.y);
                midNaive = Math.min(midNaive, naive.y);
              }
              if (exam.id === "exam_g6_s2_final" && name.includes("cloak") && name.includes("idle") && !name.includes("gold")) {
                cloakTop = Math.min(cloakTop, drawn.y);
              }
              if (exam.id === "exam_g6_s2_final" && name.includes("cover_gold_p1") && name.includes("idle")) {
                coverTop = Math.min(coverTop, drawn.y);
              }
              if (name.includes("compass")) {
                compassBottom = Math.max(compassBottom, drawn.y + drawn.h);
                const naive = naivePivotBox(frame, EXAM_BOSS_X, EXAM_BOSS_Y, EXAM_BOSS_SCALE, pivot);
                compassNaive = compassNaive
                  ? {
                      x: Math.min(compassNaive.x, naive.x),
                      y: Math.min(compassNaive.y, naive.y),
                      w: Math.max(compassNaive.x + compassNaive.w, naive.x + naive.w) - Math.min(compassNaive.x, naive.x),
                      h: Math.max(compassNaive.y + compassNaive.h, naive.y + naive.h) - Math.min(compassNaive.y, naive.y),
                    }
                  : naive;
              }
            }
          }
        }
      }
    }
    expect(midNaive).toBeGreaterThan(270);
    expect(midNaive).toBeLessThan(278);
    expect(midNaive - midTop).toBeGreaterThan(30);
    expect(midTop).toBeLessThan(246);
    expect(cloakTop).toBeLessThan(246);
    expect(cloakTop).toBeGreaterThan(200);
    expect(coverTop).toBeLessThan(160);
    expect(coverTop).toBeGreaterThan(100);
    expect(compassBottom).toBeLessThan(0);
    expect(compassNaive).not.toBeNull();
    expect(separation(exam.plate, compassNaive!)).toBeGreaterThanOrEqual(GAP);
    const onScreen = boxes.filter((item) => item.box.x < GAME_W && item.box.x + item.box.w > 0 && item.box.y < GAME_H && item.box.y + item.box.h > 0);
    const worst = worstGap(exam.plate, onScreen);
    expect(worst.gap, worst.label).toBeGreaterThanOrEqual(GAP);
    expect(worstGap(exam.button, onScreen).gap).toBeGreaterThanOrEqual(GAP);
    const controls = [
      centerBox(EXAM_STRIKE_BUTTON.x, EXAM_STRIKE_BUTTON.y, EXAM_STRIKE_BUTTON.w, EXAM_STRIKE_BUTTON.h),
      { x: EXAM_NAME.x, y: EXAM_NAME.y - EXAM_NAME.fontPx / 2, w: 400, h: EXAM_NAME.fontPx },
      { x: EXAM_PHASE_TEXT.x, y: EXAM_PHASE_TEXT.y, w: 200, h: EXAM_PHASE_TEXT.fontPx },
    ];
    expect(worstGap(exam.plate, controls.map((box, index) => ({ label: `exam control ${index}`, box }))).gap).toBeGreaterThanOrEqual(GAP);
    const scene = readFileSync(new URL("./scenes/ExamBattleScene.ts", import.meta.url), "utf8");
    const buttonFn = scene.slice(scene.indexOf("private textButton"), scene.indexOf("private wipe"));
    expect(buttonFn).toContain("Math.max(180, label.length * 28)");
    expect(buttonFn).toContain("56");
    expect(EXAM_STRIKE_BUTTON.w).toBe(Math.max(180, "攻击".length * 28));
    expect(EXAM_STRIKE_BUTTON.h).toBe(56);
    expect(scene).toContain('hidden: state.phase === "question"');
    expect(onScreen.length).toBeGreaterThan(20);
  });
});
