import { describe, expect, it } from "vitest";
import {
  computeActualHpChange,
  formatFloaterText,
  floaterColor,
  floaterStroke,
  emptyFloaterState,
  pushFloater,
  pruneFloaters,
  activeFloaterCount,
  floaterStackOffset,
  FLOATER_DURATION_MS,
  FLOATER_STACK_OFFSET,
  FLOATER_LAYER_NAME,
  keptAcrossDraw,
} from "./battle-floater";
import { battleMotionBeats } from "./battle-lunge";

describe("computeActualHpChange", () => {
  it("returns negative for damage", () => {
    expect(computeActualHpChange({ hpBefore: 50, hpAfter: 40, maxHp: 100 })).toBe(-10);
  });

  it("returns positive for healing", () => {
    expect(computeActualHpChange({ hpBefore: 40, hpAfter: 50, maxHp: 100 })).toBe(10);
  });

  it("returns zero when no change", () => {
    expect(computeActualHpChange({ hpBefore: 50, hpAfter: 50, maxHp: 100 })).toBe(0);
  });

  it("truncates healing at max HP", () => {
    expect(computeActualHpChange({ hpBefore: 95, hpAfter: 110, maxHp: 100 })).toBe(5);
  });

  it("truncates damage at zero HP", () => {
    expect(computeActualHpChange({ hpBefore: 5, hpAfter: -10, maxHp: 100 })).toBe(-5);
  });

  it("returns zero when healing at full HP", () => {
    expect(computeActualHpChange({ hpBefore: 100, hpAfter: 100, maxHp: 100 })).toBe(0);
  });

  it("returns zero when damage at zero HP", () => {
    expect(computeActualHpChange({ hpBefore: 0, hpAfter: 0, maxHp: 100 })).toBe(0);
  });

  it("handles before already above max", () => {
    expect(computeActualHpChange({ hpBefore: 120, hpAfter: 90, maxHp: 100 })).toBe(-10);
  });

  it("handles before already below zero", () => {
    expect(computeActualHpChange({ hpBefore: -5, hpAfter: 10, maxHp: 100 })).toBe(10);
  });
});

describe("formatFloaterText", () => {
  it("formats negative as -N", () => {
    expect(formatFloaterText(-15)).toBe("-15");
  });

  it("formats positive as +N", () => {
    expect(formatFloaterText(8)).toBe("+8");
  });

  it("returns null for zero", () => {
    expect(formatFloaterText(0)).toBeNull();
  });
});

describe("floaterColor and floaterStroke", () => {
  it("returns coral for damage and teal for healing, both with a light stroke", () => {
    expect(floaterColor(-10)).toBe("#E76F51");
    expect(floaterColor(10)).toBe("#2A9D8F");
    expect(floaterStroke(-10)).toBe("#FFF4DC");
    expect(floaterStroke(10)).toBe("#FFF4DC");
  });
});

describe("FloaterState management", () => {
  it("starts empty", () => {
    const state = emptyFloaterState();
    expect(state.entries).toHaveLength(0);
    expect(state.nextIndex).toBe(0);
  });

  it("pushes non-zero amounts", () => {
    let state = emptyFloaterState();
    state = pushFloater(state, -10, 1000);
    expect(state.entries).toHaveLength(1);
    expect(state.entries[0]).toEqual({ amount: -10, index: 0, startTime: 1000 });
    expect(state.nextIndex).toBe(1);
  });

  it("ignores zero amounts", () => {
    let state = emptyFloaterState();
    state = pushFloater(state, 0, 1000);
    expect(state.entries).toHaveLength(0);
    expect(state.nextIndex).toBe(0);
  });

  it("stacks multiple floaters", () => {
    let state = emptyFloaterState();
    state = pushFloater(state, -10, 1000);
    state = pushFloater(state, -5, 1100);
    state = pushFloater(state, 8, 1200);
    expect(state.entries).toHaveLength(3);
    expect(state.nextIndex).toBe(3);
  });

  it("prunes expired floaters", () => {
    let state = emptyFloaterState();
    state = pushFloater(state, -10, 1000);
    state = pushFloater(state, -5, 1500);
    state = pushFloater(state, 8, 1900);

    state = pruneFloaters(state, 1000 + FLOATER_DURATION_MS - 1);
    expect(state.entries).toHaveLength(3);

    state = pruneFloaters(state, 1000 + FLOATER_DURATION_MS);
    expect(state.entries).toHaveLength(2);

    state = pruneFloaters(state, 1900 + FLOATER_DURATION_MS);
    expect(state.entries).toHaveLength(0);
  });

  it("counts active floaters", () => {
    let state = emptyFloaterState();
    state = pushFloater(state, -10, 1000);
    state = pushFloater(state, -5, 1500);

    expect(activeFloaterCount(state, 1000)).toBe(2);
    expect(activeFloaterCount(state, 1000 + FLOATER_DURATION_MS)).toBe(1);
    expect(activeFloaterCount(state, 1500 + FLOATER_DURATION_MS)).toBe(0);
  });
});

describe("floater appears on the hit and survives draw", () => {
  it("spawns the defender number on the hit beat, before the return", () => {
    const beats = battleMotionBeats({
      playerLunge: true,
      enemyLunge: true,
      enemyAmount: -8,
      playerEffect: 0,
      playerHit: -5,
    });
    const log: string[] = [];
    const layer = { name: FLOATER_LAYER_NAME, texts: [] as string[] };
    for (const beat of beats) {
      if (beat.kind === "lunge") log.push(`lunge:${beat.attacker}`);
      if (beat.kind === "hit") {
        log.push(`hit:${beat.attacker}`);
        if (beat.amount !== 0) {
          layer.texts.push(`${beat.target}:${formatFloaterText(beat.amount)}`);
          log.push(`spawn:${beat.target}`);
        }
      }
      if (beat.kind === "return") log.push(`return:${beat.attacker}`);
    }
    expect(log).toEqual([
      "lunge:player",
      "hit:player",
      "spawn:enemy",
      "return:player",
      "lunge:enemy",
      "hit:enemy",
      "spawn:player",
      "return:enemy",
    ]);
    const spawnEnemy = log.indexOf("spawn:enemy");
    const returnPlayer = log.indexOf("return:player");
    expect(spawnEnemy).toBeGreaterThan(log.indexOf("hit:player"));
    expect(spawnEnemy).toBeLessThan(returnPlayer);
    expect(layer.texts).toEqual(["enemy:-8", "player:-5"]);
  });

  it("keeps the floater layer after draw", () => {
    const beats = battleMotionBeats({
      playerLunge: true,
      enemyLunge: false,
      enemyAmount: -8,
      playerEffect: 0,
      playerHit: 0,
    });
    const layer = { name: FLOATER_LAYER_NAME, texts: [] as string[] };
    const world = [{ name: "hero" }, { name: "monster" }, layer, { name: "hud" }];
    for (const beat of beats) {
      if (beat.kind === "hit" && beat.amount !== 0) {
        layer.texts.push(formatFloaterText(beat.amount) ?? "");
      }
    }
    expect(layer.texts).toEqual(["-8"]);
    const kept = keptAcrossDraw(world);
    expect(kept).toEqual([layer]);
    expect(layer.texts).toEqual(["-8"]);
  });

  it("spawns a heal number with no lunge and skips a zero change", () => {
    const heal = battleMotionBeats({
      playerLunge: false,
      enemyLunge: true,
      enemyAmount: 0,
      playerEffect: 8,
      playerHit: -5,
    });
    expect(heal).toEqual([
      { kind: "floater", target: "player", amount: 8 },
      { kind: "lunge", attacker: "enemy" },
      { kind: "hit", attacker: "enemy", target: "player", amount: -5 },
      { kind: "return", attacker: "enemy" },
    ]);
    const blocked = battleMotionBeats({
      playerLunge: false,
      enemyLunge: false,
      enemyAmount: 0,
      playerEffect: 0,
      playerHit: 0,
    });
    expect(blocked).toEqual([]);
  });
});

describe("floaterStackOffset", () => {
  it("returns zero for first floater", () => {
    expect(floaterStackOffset(0)).toBe(0);
  });

  it("returns increasing offsets for stacked floaters", () => {
    expect(floaterStackOffset(1)).toBe(FLOATER_STACK_OFFSET);
    expect(floaterStackOffset(2)).toBe(FLOATER_STACK_OFFSET * 2);
  });
});
