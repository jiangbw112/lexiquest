import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import {
  answerQuestion,
  questionKindLabel,
  startBattle,
  swapCard,
  swapOffer,
  takeAction,
  type BattleQuestion,
  type BattleState,
} from "./battle";
import {
  CLASS_SWITCH_BUTTON,
  CLASS_SWITCH_HINT,
  CLASS_SWITCH_IN_BATTLE,
  EXPLORER_PREVIEW_HINT,
  EXPLORER_PREVIEW_LABEL,
  PREVIEW_LISTENING,
  PREVIEW_MEANING,
  PREVIEW_SPELLING,
  RANGER_SWAP_BUTTON,
  RANGER_SWAP_HINT,
  RANGER_SWAP_PICK_CARD,
  RANGER_SWAP_PICK_SLOT,
  RANGER_SWAP_USED,
} from "./class-copy";
import { INVENTOR_LOCK_BUTTON, INVENTOR_LOCK_TIP, INVENTOR_UNLOCK_ENABLED } from "./class-unlock";
import { applyBattleOutcome, createSave, equipSkill, learnWord, switchClass, syncUnlocks } from "./progress";
import { skillSlotIndexForKey } from "./skill-card-face";
import { classBasePower, starterSkillId } from "./skills";
import { deserialize, serialize } from "./storage";

const LEARNED = ["tree", "bird", "fish", "sun", "map", "run"];
const NOW = Date.parse("2026-03-01T02:00:00Z");

function fight(classId: BattleState["classId"], extra: Partial<Parameters<typeof startBattle>[0]> = {}): BattleState {
  return startBattle({
    encounterId: "inkling",
    classId,
    learnedIds: LEARNED,
    equippedSkillIds: extra.equippedSkillIds ?? [starterSkillId(classId)],
    skillLevels: extra.skillLevels ?? {},
    seed: extra.seed ?? 42,
    unlockedSkillIds: extra.unlockedSkillIds,
    spellingCap: extra.spellingCap,
    litWordIds: extra.litWordIds,
    enemy: extra.enemy ?? { name: "词灵", maxHp: 100000, attack: 0, sprite: "inkling" },
  });
}

function kinds(classId: BattleState["classId"], seed: number, rounds: number, spellingCap: number | null) {
  let state = fight(classId, { seed, spellingCap, litWordIds: LEARNED, equippedSkillIds: [] });
  const labels: string[] = [];
  const asked: string[] = [];
  for (let i = 0; i < rounds; i += 1) {
    expect(state.phase).toBe("choose");
    labels.push(state.previewLabel ?? "");
    const cast = takeAction(state, { type: "attack" });
    expect(cast.ok).toBe(true);
    const question = cast.state.question;
    if (!question) throw new Error("missing question");
    asked.push(`${question.kind}:${question.wordId}`);
    if (classId === "explorer") {
      expect(labels[i]).toBe(questionKindLabel(question));
      expect([PREVIEW_MEANING, PREVIEW_LISTENING, PREVIEW_SPELLING]).toContain(labels[i]);
      expect(labels[i]).not.toMatch(/[A-Za-z]/);
      const secret = question.kind === "spelling" ? question.answer : `${question.prompt}${question.hint}`;
      expect(labels[i]).not.toContain(secret);
    } else {
      expect(labels[i]).toBe("");
      expect(state.previewLabel).toBeNull();
    }
    const choice = question.kind === "spelling"
      ? "nope"
      : question.choices.find((item) => item.id !== question.answerId)?.id ?? "nope";
    state = answerQuestion(cast.state, choice);
  }
  return { labels, asked };
}

describe("B2-2 ranger swap", () => {
  it("uses the spec copy", () => {
    expect(RANGER_SWAP_BUTTON).toBe("换牌");
    expect(RANGER_SWAP_HINT).toBe("每场一次：把没带的卡换上来。");
    expect(RANGER_SWAP_PICK_CARD).toBe("选一张要换上的卡");
    expect(RANGER_SWAP_PICK_SLOT).toBe("选一张卡换下来");
    expect(RANGER_SWAP_USED).toBe("这场已经换过了");
  });

  it("swaps one unlocked card into the same slot and leaves the save deck alone", () => {
    const save = createSave({ name: "小林", classId: "ranger", appearance: DEFAULT_APPEARANCE, now: NOW, grades: ["G3"] });
    save.equippedSkillIds = ["ranger-aim"];
    save.skillLevels["ranger-aim"] = 2;
    save.skillLevels["ranger-step"] = 3;
    const state = {
      ...fight("ranger", {
        equippedSkillIds: save.equippedSkillIds,
        unlockedSkillIds: ["ranger-aim", "ranger-step", "ranger-herb"],
        skillLevels: save.skillLevels,
      }),
      energy: 4,
      enemyHp: 40,
      turn: 2,
      questionsAsked: 3,
    };
    expect(swapOffer(state)).toBe("ready");
    expect(skillSlotIndexForKey("Digit4")).toBe(0);
    expect(skillSlotIndexForKey("Digit5")).toBe(1);
    expect(skillSlotIndexForKey("Digit6")).toBe(2);
    const baseBefore = state.slots.filter((slot) => slot.origin === "base").map((slot) => slot.fullPower);
    const swapped = swapCard(state, "ranger-step", 0);
    expect(swapped.ok).toBe(true);
    expect(swapped.state.slots.map((slot) => slot.skillId)).toEqual(["ranger-step", "ranger-base", "ranger-base"]);
    expect(swapped.state.slots.map((slot) => slot.index)).toEqual([0, 1, 2]);
    expect(swapped.state.slots[0]?.level).toBe(3);
    expect(swapped.state.slots[0]?.origin).toBe("equipped");
    expect(swapped.state.slots.filter((slot) => slot.origin === "base").map((slot) => slot.fullPower)).toEqual(baseBefore);
    expect(baseBefore.every((power) => power === classBasePower("ranger"))).toBe(true);
    expect(swapped.state.energy).toBe(4);
    expect(swapped.state.enemyHp).toBe(40);
    expect(swapped.state.turn).toBe(2);
    expect(swapped.state.questionsAsked).toBe(3);
    expect(swapped.state.phase).toBe("choose");
    expect(swapped.state.savedEquippedSkillIds).toEqual(["ranger-aim"]);
    expect(swapped.state.skillLevels["ranger-aim"]).toBe(2);
    expect(save.equippedSkillIds).toEqual(["ranger-aim"]);
    expect(swapOffer(swapped.state)).toBe("used");
    const again = swapCard(swapped.state, "ranger-herb", 0);
    expect(again.ok).toBe(false);
    expect(again.reason).toBe(RANGER_SWAP_USED);
    expect(again.state).toBe(swapped.state);
    const won = applyBattleOutcome(save, "win", NOW, "inkling");
    expect(won.equippedSkillIds).toEqual(["ranger-aim"]);
    expect(won.skillLevels["ranger-aim"]).toBe(3);
    expect(won.skillLevels["ranger-step"]).toBe(3);
  });

  it("refuses a base slot, another class, and a fight with nothing to swap", () => {
    const ready = fight("ranger", { unlockedSkillIds: ["ranger-aim", "ranger-step"] });
    const base = swapCard(ready, "ranger-step", 1);
    expect(base.ok).toBe(false);
    expect(base.state.slots[1]?.origin).toBe("base");
    expect(swapOffer(fight("warrior", { unlockedSkillIds: ["warrior-bash", "warrior-shout"] }))).toBe("hidden");
    expect(swapOffer(fight("mage"))).toBe("hidden");
    expect(swapOffer(fight("healer"))).toBe("hidden");
    expect(swapOffer(fight("explorer"))).toBe("hidden");
    expect(swapOffer(fight("inventor"))).toBe("hidden");
    expect(swapOffer(fight("ranger"))).toBe("hidden");
    const full = fight("ranger", {
      equippedSkillIds: ["ranger-aim", "ranger-step", "ranger-herb"],
      unlockedSkillIds: ["ranger-aim", "ranger-step", "ranger-herb"],
    });
    expect(swapOffer(full)).toBe("hidden");
    const asked = takeAction(ready, { type: "attack" });
    expect(swapOffer(asked.state)).toBe("hidden");
    const back = answerQuestion(asked.state, asked.state.question?.kind === "spelling" ? "nope" : asked.state.question?.answerId ?? "nope");
    expect(swapOffer(back)).toBe("ready");
  });
});

describe("B2-3 explorer scout", () => {
  it("uses the spec copy and names a listening question without adding one to the fight", () => {
    expect(EXPLORER_PREVIEW_LABEL).toBe("下一题");
    expect(EXPLORER_PREVIEW_HINT).toBe("先看下一题考什么，再选攻击、格挡还是治疗。");
    expect(PREVIEW_MEANING).toBe("认意思");
    expect(PREVIEW_LISTENING).toBe("听一听");
    expect(PREVIEW_SPELLING).toBe("拼写");
    const listening = { kind: "listening", wordId: "tree", prompt: "听一听", hint: "", choices: [], answerId: "tree", direction: "listen-to-zh" } as BattleQuestion;
    expect(questionKindLabel(listening)).toBe("听一听");
  });

  it("keeps the same 200-question sequence with the preview on or off", () => {
    const explorer = kinds("explorer", 42, 200, null);
    const warrior = kinds("warrior", 42, 200, null);
    expect(explorer.asked).toEqual(warrior.asked);
    expect(explorer.labels.every((label) => label === PREVIEW_MEANING)).toBe(true);
    expect(warrior.labels.every((label) => label === "")).toBe(true);
    expect(explorer.asked.some((item) => item.startsWith("listening"))).toBe(false);
  }, 30000);

  it("shows only the kind, and that kind is the question the action uses", () => {
    const spelled = kinds("explorer", 7, 8, 1);
    const plain = kinds("warrior", 7, 8, 1);
    expect(spelled.asked).toEqual(plain.asked);
    expect(spelled.labels).toContain(PREVIEW_SPELLING);
    expect(spelled.labels).toContain(PREVIEW_MEANING);
    expect(spelled.labels).not.toContain(PREVIEW_LISTENING);
  });
});

describe("B2-4 class switch outside battle", () => {
  function veteran() {
    let save = createSave({ name: "小林", classId: "warrior", appearance: DEFAULT_APPEARANCE, now: NOW, grades: ["G3"] });
    const now = new Date(NOW);
    for (const id of ["tree", "bird", "fish", "sun"]) save = learnWord(save, id, now);
    save = syncUnlocks({ ...save, battlesWon: 2, xp: 80, chapterCleared: true });
    const equipped = equipSkill(save, "warrior-shout");
    expect(equipped.ok).toBe(true);
    save = equipped.save;
    save.skillLevels["warrior-shout"] = 2;
    save.equippedByClass = { explorer: ["explorer-staff", "explorer-map"] };
    return save;
  }

  it("parks each deck, keeps shared progress, and refuses inventor and a fight", () => {
    expect(CLASS_SWITCH_BUTTON).toBe("换职业");
    expect(CLASS_SWITCH_HINT).toBe("词卡、等级和进度都不会变。每个职业的卡组分开存。");
    expect(CLASS_SWITCH_IN_BATTLE).toBe("战斗中不能换职业");
    const save = veteran();
    const cards = save.wordCards;
    const memory = save.memory;
    const appearance = save.player.appearance;
    const blocked = switchClass(save, "mage", true);
    expect(blocked).toBe(save);
    const locked = switchClass({ ...save, unlockedClassIds: ["inventor"] }, "inventor");
    expect(locked.player.classId).toBe("warrior");
    expect(locked.equippedSkillIds).toEqual(save.equippedSkillIds);
    const mage = switchClass(save, "mage");
    expect(mage.player.classId).toBe("mage");
    expect(mage.player.name).toBe("小林");
    expect(mage.player.appearance).toEqual(appearance);
    expect(mage.wordCards).toBe(cards);
    expect(mage.memory).toBe(memory);
    expect(mage.xp).toBe(80);
    expect(mage.chapterCleared).toBe(true);
    expect(mage.battlesWon).toBe(2);
    expect(mage.equippedByClass?.warrior).toEqual(["warrior-bash", "warrior-shout"]);
    expect(mage.equippedByClass?.explorer).toEqual(["explorer-staff", "explorer-map"]);
    expect(mage.equippedSkillIds).toEqual(["mage-spark"]);
    expect(mage.skillLevels["warrior-shout"]).toBe(2);
    expect(mage.skillLevels["mage-spark"]).toBe(1);
    const withWard = equipSkill(mage, "mage-ward");
    expect(withWard.ok).toBe(true);
    const back = switchClass(withWard.save, "warrior");
    expect(back.equippedSkillIds).toEqual(["warrior-bash", "warrior-shout"]);
    expect(back.skillLevels["warrior-shout"]).toBe(2);
    expect(back.equippedByClass?.mage).toEqual(["mage-spark", "mage-ward"]);
    expect(back.equippedByClass?.explorer).toEqual(["explorer-staff", "explorer-map"]);
  });
});

describe("D-19 deck persistence", () => {
  it("keeps a normal switched save through two reloads", () => {
    let save = createSave({ name: "小林", classId: "warrior", appearance: DEFAULT_APPEARANCE, now: NOW, grades: ["G3"] });
    const now = new Date(NOW);
    for (const id of ["tree", "bird", "fish", "sun"]) save = learnWord(save, id, now);
    save = syncUnlocks({ ...save, battlesWon: 1, xp: 40 });
    save = equipSkill(save, "warrior-shout").save;
    const switched = switchClass(save, "ranger");
    const raw = serialize(switched);
    const loaded = deserialize(raw);
    expect(loaded).not.toBeNull();
    expect(serialize(loaded!)).toBe(raw);
    const again = deserialize(serialize(loaded!));
    expect(serialize(again!)).toBe(raw);
    expect(again?.player.classId).toBe("ranger");
    expect(again?.equippedSkillIds).toEqual([starterSkillId("ranger")]);
    expect(again?.equippedByClass?.warrior).toEqual(save.equippedSkillIds);
    const restored = switchClass(again!, "warrior");
    expect(restored.equippedSkillIds).toEqual(save.equippedSkillIds);
  });

  it("keeps a parked inventor deck after fallback, a switch, and a second load", () => {
    const save = createSave({ name: "小林", classId: "explorer", appearance: DEFAULT_APPEARANCE, now: NOW, grades: ["G3"] });
    const raw = JSON.parse(serialize(save)) as {
      player: { classId: string };
      equippedSkillIds: string[];
      skillLevels: Record<string, number>;
      unlockedClassIds?: string[];
      equippedByClass?: { warrior?: string[] };
    };
    raw.player.classId = "inventor";
    raw.equippedSkillIds = ["inventor-gear"];
    raw.skillLevels["inventor-gear"] = 2;
    raw.unlockedClassIds = ["inventor"];
    raw.equippedByClass = { warrior: ["warrior-shout"] };
    const loaded = deserialize(JSON.stringify(raw));
    expect(loaded?.player.classId).toBe("warrior");
    expect(loaded?.equippedByClass?.inventor).toEqual(["inventor-gear"]);
    expect(loaded?.skillLevels["inventor-gear"]).toBe(2);
    const switched = switchClass(loaded!, "mage");
    expect(switched.player.classId).toBe("mage");
    expect(switched.equippedByClass?.inventor).toEqual(["inventor-gear"]);
    expect(switched.equippedByClass?.warrior).toEqual(loaded!.equippedSkillIds);
    const again = deserialize(serialize(switched));
    expect(again?.player.classId).toBe("mage");
    expect(again?.equippedByClass?.inventor).toEqual(["inventor-gear"]);
    expect(again?.skillLevels["inventor-gear"]).toBe(2);
    expect(switchClass(again!, "inventor")).toBe(again);
    expect(INVENTOR_UNLOCK_ENABLED).toBe(false);
  });
});

describe("batch 2 scene locks", () => {
  const battle = readFileSync(new URL("../game/scenes/BattleScene.ts", import.meta.url), "utf8");
  const skills = readFileSync(new URL("../game/scenes/SkillsScene.ts", import.meta.url), "utf8");
  const unlock = readFileSync(new URL("./class-unlock.ts", import.meta.url), "utf8");

  it("shows swap and scout from the battle scene and keeps the class switch off that scene", () => {
    expect(battle).toContain("RANGER_SWAP_BUTTON");
    expect(battle).toContain("EXPLORER_PREVIEW_LABEL");
    expect(battle).toContain("EXPLORER_PREVIEW_HINT");
    expect(battle).not.toContain("heldQuestion");
    expect(battle).not.toContain("换职业");
    expect(battle).not.toContain("switchClass");
    expect(battle).not.toContain("equippedSkillIds =");
  });

  it("switches outside battle and keeps the long inventor lock tip", () => {
    expect(skills).toContain("CLASS_SWITCH_BUTTON");
    expect(skills).toContain("CLASS_SWITCH_HINT");
    expect(skills).toContain("INVENTOR_LOCK_TIP");
    expect(skills).toContain("INVENTOR_LOCK_BUTTON");
    expect(skills).not.toContain("INVENTOR_SWITCH_LOCKED_TIP");
    expect(INVENTOR_LOCK_TIP.startsWith("这里藏着一位新朋友")).toBe(true);
    expect(INVENTOR_LOCK_BUTTON).toBe("好的");
    expect(unlock).toContain("INVENTOR_UNLOCK_ENABLED = false as const");
  });
});
