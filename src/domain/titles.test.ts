import { describe, expect, it } from "vitest";
import { DEFAULT_APPEARANCE } from "./appearance";
import { createSave, levelFromXp } from "./progress";
import { deserialize, serialize } from "./storage";
import {
  EXAM_IDS,
  GRADUATION_BOSS_ID,
  TITLE_PARTS,
  applyTitleGrantEvent,
  configuredPartIds,
  createTitleState,
  equipTitleParts,
  equippedTitleText,
  grantTitleParts,
  isLiveTitleSource,
  levelSourceKeysUpTo,
  markTitleReceiptPresented,
  migrateTitleSave,
  normalizeTitleJoin,
  titleTextRule,
} from "./titles";
import type { FirstClearProof, SaveData, TitleDef } from "./types";

const NOW = Date.parse("2026-03-01T02:00:00Z");

function fresh(): SaveData {
  return createSave({
    name: "小林",
    classId: "warrior",
    appearance: DEFAULT_APPEARANCE,
    now: NOW,
    grades: ["G3"],
  });
}

function part(id: string): TitleDef {
  const row = TITLE_PARTS.find((item) => item.id === id);
  if (!row) throw new Error(`missing ${id}`);
  return row;
}

function eventId(save: SaveData, name: string): string {
  return `${name}:${save.profileId}`;
}

/** A save from before title fields existed. */
function oldSave(patch: Record<string, unknown> = {}): SaveData {
  const raw = JSON.parse(serialize(fresh())) as Record<string, unknown>;
  delete raw.profileId;
  delete raw.titleRulesVersion;
  delete raw.titleParts;
  delete raw.titleGrantLedger;
  delete raw.titleReceipts;
  return { ...raw, ...patch } as unknown as SaveData;
}

describe("title catalog and combination rules", () => {
  it("lists the 15 exams and keeps graduation out of the live grant set", () => {
    expect(EXAM_IDS).toHaveLength(15);
    expect(EXAM_IDS.filter((id) => id.endsWith("_mid"))).toHaveLength(7);
    expect(EXAM_IDS.filter((id) => id.endsWith("_final"))).toHaveLength(8);
    expect(EXAM_IDS).not.toContain("exam_g6_s2_mid");
    expect(isLiveTitleSource(`boss:${GRADUATION_BOSS_ID}:firstClear`)).toBe(false);
    expect(configuredPartIds(`boss:${GRADUATION_BOSS_ID}:firstClear`)).toEqual(["p_075", "s_044"]);
    expect(part("p_075").join).toBe("de");
    expect(part("s_042").sourceRule).toEqual({ kind: "anyMid" });
    expect(part("s_043").sourceRule).toEqual({ kind: "anyFinal" });
    expect(part("s_044").sourceRule).toEqual({ kind: "graduation" });
  });

  it("accepts every recommended pair and blocks shared characters or 9 or more characters", () => {
    const levels = [...new Set(
      TITLE_PARTS.filter((row) => row.sourceRule.kind === "level" && row.slot === "prefix").map((row) => (
        row.sourceRule.kind === "level" ? row.sourceRule.minLevel : 0
      )),
    )].sort((a, b) => a - b);
    expect(levels).toEqual([1, 2, 3, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50]);
    for (const level of levels) {
      const ids = configuredPartIds(`level:${level}`);
      expect(ids).toHaveLength(2);
      const ruled = titleTextRule(part(ids![0]!), part(ids![1]!));
      expect(ruled.ok).toBe(true);
      expect(Array.from(ruled.text).length).toBeLessThanOrEqual(8);
    }
    for (const examId of EXAM_IDS) {
      const ids = configuredPartIds(`boss:${examId}:firstClear`);
      expect(titleTextRule(part(ids![0]!), part(ids![1]!)).ok).toBe(true);
    }
    const graduation = configuredPartIds(`boss:${GRADUATION_BOSS_ID}:firstClear`)!;
    expect(titleTextRule(part(graduation[0]!), part(graduation[1]!)).ok).toBe(true);
    expect(part("p_011").join).toBe("direct");
    expect(part("p_014").join).toBe("direct");
    expect(part("p_000").join).toBe("de");
    expect(titleTextRule(part("p_011"), part("s_011")).text).toBe(`${part("p_011").text}${part("s_011").text}`);
    expect(titleTextRule(part("p_000"), part("s_000")).text).toBe(`${part("p_000").text}的${part("s_000").text}`);
    expect(Array.from(titleTextRule(part("p_000"), part("s_000")).text).length).toBe(8);
    expect(titleTextRule(part("p_014"), part("s_000")).ok).toBe(false);
    const blocked = titleTextRule({ text: "远行", join: "direct" }, part("s_011"));
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe("same_char");
    expect(titleTextRule({ text: "abc", join: "de" }, { text: "defg" }).ok).toBe(true);
    const long = titleTextRule({ text: "abcdefg", join: "de" }, { text: "h" });
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.reason).toBe("too_long");
    expect(normalizeTitleJoin("")).toBe("direct");
    expect(normalizeTitleJoin("de")).toBe("de");
    expect(normalizeTitleJoin(undefined)).toBe("direct");
  });
});

describe("equip and a new save", () => {
  it("wears the level 1 pair only on creation, and taking it off stays off", () => {
    const save = fresh();
    expect(save.version).toBe(1);
    expect(save.titleRulesVersion).toBe(1);
    expect(save.titleParts?.equipped).toEqual({ prefixId: "p_000", suffixId: "s_000" });
    expect(save.titleParts?.newIds).toEqual([]);
    expect(save.titleGrantLedger?.["level:1"]?.partIds).toEqual(["p_000", "s_000"]);
    expect(equippedTitleText(save)).toBe(titleTextRule(part("p_000"), part("s_000")).text);
    expect(migrateTitleSave(save, NOW)).toBe(save);

    const off = equipTitleParts(save, null, null);
    expect(off.titleParts?.equipped).toEqual({ prefixId: null, suffixId: null });
    expect(equippedTitleText(off)).toBeNull();
    expect(off.titleParts?.unlockedPrefixIds).toEqual(["p_000"]);
    const loaded = deserialize(serialize(off));
    expect(loaded?.titleParts?.equipped).toEqual({ prefixId: null, suffixId: null });
    expect(migrateTitleSave(loaded!, NOW)).toBe(loaded);
  });

  it("allows a suffix alone and rejects a prefix alone, an unowned part, or a shared character", () => {
    const save = fresh();
    const suffixOnly = equipTitleParts(save, null, "s_000");
    expect(suffixOnly.titleParts?.equipped).toEqual({ prefixId: null, suffixId: "s_000" });
    expect(equippedTitleText(suffixOnly)).toBe(part("s_000").text);
    expect(equipTitleParts(save, "p_000", null)).toBe(save);
    expect(equipTitleParts(save, null, "s_014")).toBe(save);
    const owned = migrateTitleSave(oldSave({ xp: 1960 }), NOW);
    expect(equipTitleParts(owned, "p_014", "s_000")).toBe(owned);
    const worn = equipTitleParts(owned, "p_014", "s_014");
    expect(worn.titleParts?.equipped).toEqual({ prefixId: "p_014", suffixId: "s_014" });
    expect(worn.titleGrantLedger).toBe(owned.titleGrantLedger);
    expect(worn.equippedTitleId).toBe(owned.equippedTitleId);
  });
});

describe("grant ledger", () => {
  it("grants one exam pair, then a second exam adds only the new prefix", () => {
    const save = fresh();
    const first = grantTitleParts(
      save,
      "boss:exam_g3_s1_mid:firstClear",
      ["s_042", "p_060"],
      eventId(save, "mid-g3"),
      NOW,
    );
    expect(first.newPartIds).toEqual(["p_060", "s_042"]);
    expect(first.save.titleParts?.equipped).toEqual(save.titleParts?.equipped);
    expect(first.save.titleParts?.newIds).toEqual(["p_060", "s_042"]);
    expect(first.save.titleGrantLedger?.["boss:exam_g3_s1_mid:firstClear"]?.partIds).toEqual(["p_060", "s_042"]);
    expect(first.save.titleReceipts?.[`title:${eventId(save, "mid-g3")}`]?.status).toBe("pending");
    const again = applyTitleGrantEvent(first.save, {
      profileId: save.profileId!,
      eventId: eventId(save, "mid-g3"),
      now: NOW + 5,
      sourceKeys: ["boss:exam_g3_s1_mid:firstClear"],
    });
    expect(again.newPartIds).toEqual([]);
    expect(again.save).toBe(first.save);

    const second = grantTitleParts(
      first.save,
      "boss:exam_g4_s1_mid:firstClear",
      configuredPartIds("boss:exam_g4_s1_mid:firstClear")!,
      eventId(save, "mid-g4"),
      NOW + 10,
    );
    expect(second.newPartIds).toEqual(["p_062"]);
    expect(second.save.titleParts?.unlockedSuffixIds.filter((id) => id === "s_042")).toEqual(["s_042"]);
    expect(second.save.titleGrantLedger?.["boss:exam_g4_s1_mid:firstClear"]?.partIds).toEqual(["p_062", "s_042"]);
    expect(second.save.titleGrantLedger?.["boss:exam_g4_s1_mid:firstClear"]?.newPartIds).toEqual(["p_062"]);
    expect(second.save.titleParts?.via.s_042?.source).toBe("boss:exam_g3_s1_mid:firstClear");
    expect(second.save.titleParts?.via.p_062?.source).toBe("boss:exam_g4_s1_mid:firstClear");
  });

  it("orders one settlement as boss parts, then level pairs, and presents once", () => {
    const save = fresh();
    const id = eventId(save, "bundle");
    const granted = applyTitleGrantEvent(save, {
      profileId: save.profileId!,
      eventId: id,
      now: NOW,
      sourceKeys: ["level:5", "boss:exam_g4_s1_mid:firstClear", "level:2", "level:2"],
    });
    expect(granted.newPartIds).toEqual(["p_062", "s_042", "p_001", "s_001", "p_003", "s_003"]);
    expect(granted.save.titleReceipts?.[`title:${id}`]?.grantKeys).toEqual([
      "boss:exam_g4_s1_mid:firstClear",
      "level:2",
      "level:5",
    ]);
    const shown = markTitleReceiptPresented(granted.save, id);
    expect(shown.titleReceipts?.[`title:${id}`]?.status).toBe("presented");
    const replay = applyTitleGrantEvent(shown, {
      profileId: save.profileId!,
      eventId: id,
      now: NOW + 1,
      sourceKeys: ["level:5", "boss:exam_g4_s1_mid:firstClear", "level:2"],
    });
    expect(replay.save).toBe(shown);
    expect(replay.save.titleReceipts?.[`title:${id}`]?.status).toBe("presented");
  });

  it("repairs a ledger hole without a new dot or a second receipt", () => {
    const save = fresh();
    const id = eventId(save, "repair");
    const granted = grantTitleParts(save, "boss:exam_g3_s1_final:firstClear", ["p_067", "s_043"], id, NOW);
    const broken: SaveData = {
      ...granted.save,
      titleParts: {
        ...granted.save.titleParts!,
        unlockedPrefixIds: granted.save.titleParts!.unlockedPrefixIds.filter((partId) => partId !== "p_067"),
      },
    };
    const repaired = grantTitleParts(broken, "boss:exam_g3_s1_final:firstClear", ["p_067", "s_043"], id, NOW + 9);
    expect(repaired.newPartIds).toEqual([]);
    expect(repaired.save.titleParts?.unlockedPrefixIds).toContain("p_067");
    expect(repaired.save.titleParts?.newIds).toEqual(["p_067", "s_043"]);
    expect(repaired.save.titleReceipts?.[`title:${id}`]?.newPartIds).toEqual(["p_067", "s_043"]);
    expect(repaired.save.titleGrantLedger?.["boss:exam_g3_s1_final:firstClear"]?.grantedAt).toBe(NOW);
  });

  it("rejects another profile, a mismatched part list, and graduation", () => {
    const save = fresh();
    const before = serialize(save);
    expect(applyTitleGrantEvent(save, {
      profileId: "other-profile",
      eventId: `mid:${save.profileId}`,
      now: NOW,
      sourceKeys: ["boss:exam_g3_s1_mid:firstClear"],
    }).save).toBe(save);
    expect(grantTitleParts(save, "boss:exam_g3_s1_mid:firstClear", ["p_060"], eventId(save, "mid"), NOW).save).toBe(save);
    expect(grantTitleParts(
      save,
      `boss:${GRADUATION_BOSS_ID}:firstClear`,
      ["p_075", "s_044"],
      eventId(save, "grad"),
      NOW,
    ).save).toBe(save);
    expect(serialize(save)).toBe(before);
  });
});

describe("title migration", () => {
  it("backfills levels with the live XP curve and does not equip them", () => {
    for (const xp of [0, 39, 40, 159, 160, 1360, 1960]) {
      const migrated = migrateTitleSave(oldSave({ xp }), NOW);
      const keys = levelSourceKeysUpTo(levelFromXp(xp).level);
      expect(Object.keys(migrated.titleGrantLedger ?? {}).filter((key) => key.startsWith("level:")).sort()).toEqual([...keys].sort());
      expect(migrated.titleParts?.equipped).toEqual({ prefixId: null, suffixId: null });
      expect(migrated.titleRulesVersion).toBe(1);
      expect(migrated.version).toBe(1);
      expect(migrated.xp).toBe(xp);
    }
    expect(levelSourceKeysUpTo(9)).toEqual(["level:1", "level:2", "level:3", "level:5", "level:8"]);
    expect(levelSourceKeysUpTo(Number.NaN)).toEqual([]);
    expect(configuredPartIds("level:01")).toBeNull();
  });

  it("keeps an old save intact while granting a strict clear and skipping bad evidence", () => {
    const examProgress = {
      exam_g3_s2_mid: { cleared: true, bestPhase: 0, clearedAt: 1234, attempts: 2 },
      exam_g3_s1_mid: { cleared: "true", bestPhase: 9 },
      exam_g6_s2_mid: { cleared: true },
      garbage_final: { cleared: true, bestPhase: 3 },
      grad_primary: { cleared: true, bestPhase: 4 },
      exam_g6_s2_final: { cleared: false, bestPhase: 3 },
    };
    const proof = { kind: "legacyCleared", clearEventId: "not-written" } satisfies Partial<FirstClearProof>;
    expect(proof.kind).toBe("legacyCleared");
    const old = oldSave({
      xp: 80,
      titles: ["林间行者"],
      unlockedTitleIds: ["forest_walker"],
      equippedTitleId: "forest_walker",
      unlockedClassIds: ["inventor"],
      inventorUnlockedAt: 1_700_000_000_000,
      inventorUnlockedBy: "exam_g3_s1_final",
      finalBossCleared: true,
      keptNote: "stay",
      wordCards: { tree: { wordId: "tree", collectedAt: NOW, masteryBadge: false } },
      examProgress,
      titleGrantLedger: ["bad"],
      titleParts: "bad",
      titleReceipts: null,
    });
    const snapshot = serialize(old);
    const migrated = migrateTitleSave(old, NOW);
    expect(serialize(old)).toBe(snapshot);
    expect(migrated.titles).toEqual(["林间行者"]);
    expect(migrated.unlockedTitleIds).toEqual(["forest_walker"]);
    expect(migrated.equippedTitleId).toBe("forest_walker");
    expect(migrated.unlockedClassIds).toEqual(["inventor"]);
    expect(migrated.inventorUnlockedAt).toBe(1_700_000_000_000);
    expect(migrated.inventorUnlockedBy).toBe("exam_g3_s1_final");
    expect(migrated.finalBossCleared).toBe(true);
    expect(migrated.wordCards.tree?.collectedAt).toBe(NOW);
    expect(migrated.examProgress).toEqual(examProgress);
    expect(JSON.parse(serialize(migrated)).keptNote).toBe("stay");
    expect(serialize(migrated)).not.toContain("firstClearAt");
    expect(serialize(migrated)).not.toContain("titleGrantedAt");
    expect(migrated.titleParts?.unlockedPrefixIds).toContain("p_061");
    expect(migrated.titleParts?.unlockedPrefixIds).not.toContain("p_060");
    expect(migrated.titleParts?.unlockedPrefixIds).not.toContain("p_074");
    expect(migrated.titleParts?.unlockedPrefixIds).not.toContain("p_075");
    expect(migrated.titleParts?.unlockedSuffixIds).toContain("s_042");
    expect(migrated.titleParts?.unlockedSuffixIds).not.toContain("s_043");
    expect(migrated.titleParts?.unlockedSuffixIds).not.toContain("s_044");
    expect(migrated.titleGrantLedger?.["boss:exam_g3_s2_mid:firstClear"]?.evidenceId).toBe(
      `legacy:${migrated.profileId}:exam_g3_s2_mid:cleared`,
    );
    expect(migrated.titleGrantLedger?.["boss:exam_g3_s2_mid:firstClear"]?.grantedAt).toBe(NOW);
    expect(migrated.titleGrantLedger?.["boss:exam_g6_s2_mid:firstClear"]).toBeUndefined();
    expect(migrated.titleReceipts).toEqual({});
    expect(migrated.titleParts?.newIds).toEqual(expect.arrayContaining(["p_061", "s_042", "p_000", "s_000"]));
    expect(migrated.titleParts?.equipped).toEqual({ prefixId: null, suffixId: null });

    const loaded = deserialize(serialize(migrated));
    expect(loaded).not.toBeNull();
    const loadedRaw = serialize(loaded!);
    const loadedAgain = deserialize(loadedRaw);
    expect(loadedAgain).not.toBeNull();
    expect(serialize(loadedAgain!)).toBe(loadedRaw);
    expect(loaded?.examProgress).toEqual(examProgress);
    expect(loaded?.titleParts?.unlockedPrefixIds).toEqual(migrated.titleParts?.unlockedPrefixIds);
  });

  it("keeps a legal equipped suffix and the first via when the level pair is already owned", () => {
    const migrated = migrateTitleSave(oldSave({
      xp: 360,
      titleParts: {
        unlockedPrefixIds: ["p_005", "p_005", "forest_walker"],
        unlockedSuffixIds: ["s_005"],
        equipped: { prefixId: null, suffixId: "s_005" },
        newIds: ["s_005", "nope"],
        via: { p_005: { source: "kept-source", at: 50 } },
      },
    }), NOW);
    expect(migrated.titleParts?.unlockedPrefixIds.filter((id) => id === "p_005")).toEqual(["p_005"]);
    expect(migrated.titleParts?.unlockedPrefixIds).not.toContain("forest_walker");
    expect(migrated.titleParts?.equipped).toEqual({ prefixId: null, suffixId: "s_005" });
    expect(migrated.titleParts?.via.p_005).toEqual({ source: "kept-source", at: 50 });
    expect(migrated.titleGrantLedger?.["level:10"]?.partIds).toEqual(["p_005", "s_005"]);
    expect(migrated.titleGrantLedger?.["level:10"]?.newPartIds).toEqual([]);
    expect(migrated.titleGrantLedger?.["legacyTitle:p_005"]?.newPartIds).toEqual([]);
    expect(migrated.titleParts?.newIds).toContain("s_005");
    expect(migrated.titleParts?.newIds).not.toContain("nope");
    expect(migrated.titleParts?.newIds).not.toContain("p_005");
    expect(migrateTitleSave(migrated, NOW + 1)).toBe(migrated);
  });

  it("does not grant again on a version 1 save, and repairs a missing ledger part without a dot", () => {
    const created = fresh();
    created.xp = 5000;
    created.examProgress = { exam_g6_s2_final: { cleared: true, bestPhase: 3 } };
    expect(migrateTitleSave(created, NOW)).toBe(created);
    expect(created.titleGrantLedger?.["boss:exam_g6_s2_final:firstClear"]).toBeUndefined();

    const holed: SaveData = {
      ...created,
      titleParts: {
        ...created.titleParts!,
        unlockedSuffixIds: [],
        equipped: { prefixId: null, suffixId: null },
        newIds: [],
      },
    };
    const repaired = migrateTitleSave(holed, NOW + 4);
    expect(repaired.titleParts?.unlockedSuffixIds).toEqual(["s_000"]);
    expect(repaired.titleParts?.newIds).toEqual([]);
    expect(repaired.titleParts?.equipped).toEqual({ prefixId: null, suffixId: null });
    expect(repaired.titleGrantLedger?.["level:1"]?.newPartIds).toEqual(["p_000", "s_000"]);
    expect(repaired.titleGrantLedger?.["boss:exam_g6_s2_final:firstClear"]).toBeUndefined();
    expect(migrateTitleSave(repaired, NOW + 8)).toBe(repaired);
  });

  it("clears a prefix-only equip and still migrates a string version mark", () => {
    const migrated = migrateTitleSave(oldSave({
      xp: 0,
      titleRulesVersion: "1",
      titleParts: {
        unlockedPrefixIds: ["p_000"],
        unlockedSuffixIds: ["s_000"],
        equipped: { prefixId: "p_000", suffixId: null },
        newIds: [],
        via: {},
      },
    }), NOW);
    expect(migrated.titleRulesVersion).toBe(1);
    expect(migrated.titleParts?.equipped).toEqual({ prefixId: null, suffixId: null });
    expect(migrated.titleParts?.unlockedPrefixIds).toContain("p_000");
    expect(migrated.titleParts?.unlockedSuffixIds).toContain("s_000");
    expect(migrateTitleSave(migrated, NOW + 1)).toBe(migrated);
  });

  it("leaves a higher titleRulesVersion untouched and drops only unreadable title values", () => {
    const future = oldSave({ titleRulesVersion: 2, titles: ["林间行者"], xp: 400 });
    expect(migrateTitleSave(future, NOW)).toBe(future);
    expect(future.titleParts).toBeUndefined();

    const messy = oldSave({
      xp: 0,
      titleGrantLedger: {
        "level:1": { grantedAt: NOW, source: "level", evidenceId: "level:1", partIds: ["p_000"], newPartIds: [] },
        "custom-note": { keep: true },
        dropped: "nope",
      },
    });
    const migrated = migrateTitleSave(messy, NOW);
    expect(migrated.titleParts?.unlockedPrefixIds).toContain("p_000");
    expect(migrated.titleParts?.unlockedSuffixIds).toContain("s_000");
    expect(migrated.titleParts?.newIds).not.toContain("s_000");
    expect(migrated.titleGrantLedger?.["level:1"]?.partIds).toEqual(["p_000", "s_000"]);
    expect(migrated.titleGrantLedger?.["level:1"]?.grantedAt).toBe(NOW);
    expect(JSON.parse(serialize(migrated)).titleGrantLedger["custom-note"]).toEqual({ keep: true });
    expect(migrated.titleGrantLedger?.dropped).toBeUndefined();
  });

  it("round-trips a migrated save through deserialize", () => {
    const old = oldSave({
      xp: 40,
      titles: ["林间行者"],
      equippedTitleId: "forest_walker",
      unlockedTitleIds: ["forest_walker"],
    });
    const once = deserialize(JSON.stringify(old));
    expect(once?.version).toBe(1);
    expect(once?.titleRulesVersion).toBe(1);
    expect(once?.titles).toEqual(["林间行者"]);
    expect(once?.equippedTitleId).toBe("forest_walker");
    expect(once?.titleParts?.unlockedPrefixIds).toEqual(expect.arrayContaining(["p_000", "p_001"]));
    const raw = serialize(once!);
    const twice = deserialize(raw);
    expect(twice).not.toBeNull();
    expect(serialize(twice!)).toBe(raw);
    expect(createTitleState(once!.profileId!, NOW).titleRulesVersion).toBe(1);
  });
});
