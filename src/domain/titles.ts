/**
 * Two-slot titles and the reward ledger.
 * Grant, equip, and migration are pure. Exam battles and graduation grants are not.
 * Level numbers use the same 40 XP step as progress.XP_PER_LEVEL.
 */
import catalogFile from "./title-parts.json";
import type {
  SaveData,
  TitleDef,
  TitleGrant,
  TitleGrantSource,
  TitleJoin,
  TitleParts,
  TitleReceipt,
  TitleSourceRule,
} from "./types";

const XP_STEP = 40;
const MAX_TITLE_CHARS = 8;
const SAME_CHAR_EXCEPT = new Set(["小", "的"]);

interface LevelRow {
  level: number;
  prefixId: string;
  prefix: string;
  suffixId: string;
  suffix: string;
  join: "de" | "direct";
}
interface ExamRow {
  examId: string;
  prefixId: string;
  prefix: string;
}
interface CatalogFile {
  levels: LevelRow[];
  mids: ExamRow[];
  finals: ExamRow[];
  graduation: {
    bossId: string;
    prefixId: string;
    prefix: string;
    prefixJoin: "de" | "direct";
    suffixId: string;
    suffix: string;
  };
  sharedSuffixes: {
    anyMid: { id: string; text: string };
    anyFinal: { id: string; text: string };
  };
}

export const GRADUATION_BOSS_ID = "grad_primary";

const catalog = catalogFile as CatalogFile;

function def(id: string, slot: TitleDef["slot"], text: string, sourceRule: TitleSourceRule, join?: TitleJoin): TitleDef {
  const row: TitleDef = { id, slot, text, sourceRule };
  if (join) row.join = join;
  return row;
}

function buildCatalog(file: CatalogFile): { parts: TitleDef[]; examIds: string[]; levels: number[] } {
  const parts: TitleDef[] = [];
  const seen = new Set<string>();
  const add = (row: TitleDef) => {
    if (seen.has(row.id) || !row.text) throw new Error(`Bad title part ${row.id}`);
    if (row.slot === "prefix" && !row.id.startsWith("p_")) throw new Error(`Bad title part ${row.id}`);
    if (row.slot === "suffix" && !row.id.startsWith("s_")) throw new Error(`Bad title part ${row.id}`);
    seen.add(row.id);
    parts.push(row);
  };
  const levels: number[] = [];
  for (const row of file.levels) {
    if (!Number.isInteger(row.level) || row.level < 1) throw new Error(`Bad title level ${row.level}`);
    levels.push(row.level);
    add(def(row.prefixId, "prefix", row.prefix, { kind: "level", minLevel: row.level }, row.join));
    add(def(row.suffixId, "suffix", row.suffix, { kind: "level", minLevel: row.level }));
  }
  const examIds: string[] = [];
  for (const row of file.mids) {
    examIds.push(row.examId);
    add(def(row.prefixId, "prefix", row.prefix, { kind: "examPrefix", bossId: row.examId }, "direct"));
  }
  for (const row of file.finals) {
    examIds.push(row.examId);
    add(def(row.prefixId, "prefix", row.prefix, { kind: "examPrefix", bossId: row.examId }, "direct"));
  }
  if (examIds.includes("exam_g6_s2_mid")) throw new Error("exam_g6_s2_mid is not a title source");
  add(def(file.sharedSuffixes.anyMid.id, "suffix", file.sharedSuffixes.anyMid.text, { kind: "anyMid" }));
  add(def(file.sharedSuffixes.anyFinal.id, "suffix", file.sharedSuffixes.anyFinal.text, { kind: "anyFinal" }));
  if (file.graduation.bossId !== GRADUATION_BOSS_ID) throw new Error("Bad graduation boss id");
  add(def(
    file.graduation.prefixId,
    "prefix",
    file.graduation.prefix,
    { kind: "examPrefix", bossId: GRADUATION_BOSS_ID },
    file.graduation.prefixJoin,
  ));
  add(def(file.graduation.suffixId, "suffix", file.graduation.suffix, { kind: "graduation" }));
  return { parts, examIds, levels };
}

const built = buildCatalog(catalog);
export const TITLE_PARTS: readonly TitleDef[] = built.parts;
export const EXAM_IDS: readonly string[] = built.examIds;
const LEVELS: readonly number[] = built.levels;
const BY_ID = new Map(TITLE_PARTS.map((row) => [row.id, row]));
const MID_IDS = new Set(catalog.mids.map((row) => row.examId));
const FINAL_IDS = new Set(catalog.finals.map((row) => row.examId));

export function normalizeTitleJoin(join: unknown): TitleJoin {
  return join === "de" ? "de" : "direct";
}

export function titleTextRule(
  prefix: { text: string; join?: TitleJoin | "" },
  suffix: { text: string },
): { ok: true; text: string } | { ok: false; text: string; reason: "same_char" | "too_long" } {
  const join = normalizeTitleJoin(prefix.join);
  const text = join === "de" ? `${prefix.text}的${suffix.text}` : `${prefix.text}${suffix.text}`;
  if (sharesCountedChar(prefix.text, suffix.text)) return { ok: false, text, reason: "same_char" };
  if (Array.from(text).length > MAX_TITLE_CHARS) return { ok: false, text, reason: "too_long" };
  return { ok: true, text };
}

function sharesCountedChar(left: string, right: string): boolean {
  const seen = new Set<string>();
  for (const ch of left) {
    if (!SAME_CHAR_EXCEPT.has(ch)) seen.add(ch);
  }
  for (const ch of right) {
    if (!SAME_CHAR_EXCEPT.has(ch) && seen.has(ch)) return true;
  }
  return false;
}

export function levelSourceKeysUpTo(level: number): string[] {
  if (typeof level !== "number" || !Number.isFinite(level)) return [];
  return LEVELS.filter((step) => step <= level).map((step) => `level:${step}`);
}

export function configuredPartIds(sourceKey: string): readonly string[] | null {
  const level = levelNumber(sourceKey);
  if (level !== null) {
    const pair = levelPair(level);
    return pair ? [pair.prefix.id, pair.suffix.id] : null;
  }
  const bossId = bossIdFromKey(sourceKey);
  if (bossId) {
    const pair = bossPair(bossId);
    return pair ? [pair.prefix.id, pair.suffix.id] : null;
  }
  if (sourceKey.startsWith("legacyTitle:")) {
    const id = sourceKey.slice("legacyTitle:".length);
    return BY_ID.has(id) ? [id] : null;
  }
  return null;
}

export function isLiveTitleSource(sourceKey: string): boolean {
  if (levelNumber(sourceKey) !== null) return configuredPartIds(sourceKey) !== null;
  const bossId = bossIdFromKey(sourceKey);
  return bossId !== null && bossId !== GRADUATION_BOSS_ID && configuredPartIds(sourceKey) !== null;
}

function levelNumber(sourceKey: string): number | null {
  const match = /^level:(\d+)$/.exec(sourceKey);
  if (!match?.[1] || match[1] !== String(Number(match[1]))) return null;
  const level = Number(match[1]);
  return LEVELS.includes(level) ? level : null;
}

function bossIdFromKey(sourceKey: string): string | null {
  const match = /^boss:(.+):firstClear$/.exec(sourceKey);
  if (!match) return null;
  const bossId = match[1] ?? "";
  if (MID_IDS.has(bossId) || FINAL_IDS.has(bossId) || bossId === GRADUATION_BOSS_ID) return bossId;
  return null;
}

function levelPair(level: number): { prefix: TitleDef; suffix: TitleDef } | null {
  const rows = TITLE_PARTS.filter((row) => row.sourceRule.kind === "level" && row.sourceRule.minLevel === level);
  const prefix = rows.find((row) => row.slot === "prefix");
  const suffix = rows.find((row) => row.slot === "suffix");
  return prefix && suffix ? { prefix, suffix } : null;
}

function bossPair(bossId: string): { prefix: TitleDef; suffix: TitleDef } | null {
  const prefix = TITLE_PARTS.find((row) => row.sourceRule.kind === "examPrefix" && row.sourceRule.bossId === bossId);
  const suffixKind = MID_IDS.has(bossId) ? "anyMid" : FINAL_IDS.has(bossId) ? "anyFinal" : bossId === GRADUATION_BOSS_ID ? "graduation" : null;
  const suffix = suffixKind ? TITLE_PARTS.find((row) => row.sourceRule.kind === suffixKind) : undefined;
  return prefix && suffix ? { prefix, suffix } : null;
}

function grantSource(sourceKey: string): TitleGrantSource | null {
  if (levelNumber(sourceKey) !== null) return "level";
  if (bossIdFromKey(sourceKey)) return "bossFirstClear";
  if (sourceKey.startsWith("legacyTitle:") && configuredPartIds(sourceKey)) return "legacyTitle";
  return null;
}

export function createProfileId(): string {
  return globalThis.crypto.randomUUID();
}

export function createTitleState(profileId: string, now: number): Pick<
  SaveData,
  "profileId" | "titleRulesVersion" | "titleParts" | "titleGrantLedger" | "titleReceipts"
> {
  const pair = levelPair(1);
  if (!pair) throw new Error("Missing level 1 title");
  const key = "level:1";
  return {
    profileId,
    titleRulesVersion: 1,
    titleParts: {
      unlockedPrefixIds: [pair.prefix.id],
      unlockedSuffixIds: [pair.suffix.id],
      equipped: { prefixId: pair.prefix.id, suffixId: pair.suffix.id },
      newIds: [],
      via: {
        [pair.prefix.id]: { source: key, at: now },
        [pair.suffix.id]: { source: key, at: now },
      },
    },
    titleGrantLedger: {
      [key]: {
        grantedAt: now,
        source: "level",
        evidenceId: key,
        partIds: [pair.prefix.id, pair.suffix.id],
        newPartIds: [pair.prefix.id, pair.suffix.id],
      },
    },
    titleReceipts: {},
  };
}

export interface TitleGrantEvent {
  profileId: string;
  eventId: string;
  now: number;
  sourceKeys: readonly string[];
}

export function grantTitleParts(
  save: SaveData,
  sourceKey: string,
  partIds: readonly string[],
  eventId: string,
  now: number,
): { save: SaveData; newPartIds: string[] } {
  const canonical = isLiveTitleSource(sourceKey) ? configuredPartIds(sourceKey) : null;
  if (!canonical || !sameMembers(canonical, partIds)) return { save, newPartIds: [] };
  return applyTitleGrantEvent(save, {
    profileId: save.profileId ?? "",
    eventId,
    now,
    sourceKeys: [sourceKey],
  });
}

export function applyTitleGrantEvent(save: SaveData, event: TitleGrantEvent): { save: SaveData; newPartIds: string[] } {
  if (!eventAccepted(save, event)) return { save, newPartIds: [] };
  const keys = stableSourceKeys(event.sourceKeys.filter(isLiveTitleSource));
  if (keys.length === 0) return { save, newPartIds: [] };
  const drafted = draftFrom(save, event.now);
  const draft = drafted.draft;
  const prior = new Set(Object.keys(draft.ledger));
  const accepted: string[] = [];
  const freshIds: string[] = [];
  let changed = false;
  for (const key of keys) {
    accepted.push(key);
    const written = commitSource(draft, key, {
      now: event.now,
      evidenceId: event.eventId,
      dot: !prior.has(key),
    });
    if (written) changed = true;
    if (!prior.has(key)) {
      const grant = draft.ledger[key];
      for (const id of grant?.newPartIds ?? []) {
        if (!freshIds.includes(id)) freshIds.push(id);
      }
    }
  }
  const receiptId = `title:${event.eventId}`;
  const hadReceipt = draft.receipts[receiptId] !== undefined;
  if (!hadReceipt && accepted.some((key) => !prior.has(key))) {
    draft.receipts[receiptId] = {
      id: receiptId,
      eventId: event.eventId,
      grantKeys: accepted,
      newPartIds: freshIds,
      status: "pending",
    };
    changed = true;
  }
  if (drafted.repaired) changed = true;
  if (!changed) return { save, newPartIds: [] };
  return { save: writeDraft(save, draft), newPartIds: hadReceipt ? [] : freshIds };
}

export function markTitleReceiptPresented(save: SaveData, eventId: string): SaveData {
  if (!eventId) return save;
  const id = `title:${eventId}`;
  const receipt = save.titleReceipts?.[id];
  if (!receipt || receipt.status !== "pending" || receipt.eventId !== eventId) return save;
  return {
    ...save,
    titleReceipts: { ...save.titleReceipts, [id]: { ...receipt, status: "presented" } },
  };
}

export function equipTitleParts(save: SaveData, prefixId: string | null, suffixId: string | null): SaveData {
  const parts = save.titleParts;
  if (!parts || !equipIsLegal(parts, prefixId, suffixId)) return save;
  if (parts.equipped.prefixId === prefixId && parts.equipped.suffixId === suffixId) return save;
  return {
    ...save,
    titleParts: {
      unlockedPrefixIds: [...parts.unlockedPrefixIds],
      unlockedSuffixIds: [...parts.unlockedSuffixIds],
      equipped: { prefixId, suffixId },
      newIds: [...parts.newIds],
      via: parts.via,
    },
  };
}

export function equippedTitleText(save: SaveData): string | null {
  const equipped = save.titleParts?.equipped;
  if (!equipped?.suffixId) return null;
  const suffix = BY_ID.get(equipped.suffixId);
  if (!suffix || suffix.slot !== "suffix") return null;
  if (!equipped.prefixId) return suffix.text;
  const prefix = BY_ID.get(equipped.prefixId);
  if (!prefix || prefix.slot !== "prefix") return null;
  const ruled = titleTextRule(prefix, suffix);
  return ruled.ok ? ruled.text : null;
}

/**
 * Fills title fields on an old save. SaveData.version is not changed.
 * A save that already has titleRulesVersion 1 is not granted again.
 */
export function migrateTitleSave(save: SaveData, now: number): SaveData {
  const version = titleVersion(save);
  if (typeof version === "number" && version > 1) return save;
  if (version === 1 && titleStateIsLoadStable(save)) return save;
  const stamped = finiteTime(now, save.createdAt);
  if (version === 1) return repairVersionOne(save, stamped);
  return migrateMissingVersion(save, stamped);
}

function titleVersion(save: SaveData): unknown {
  return (save as { titleRulesVersion?: unknown }).titleRulesVersion;
}

function titleLevel(xp: unknown): number {
  if (typeof xp !== "number" || !Number.isFinite(xp) || xp < 0) return 1;
  return Math.floor(xp / XP_STEP) + 1;
}

function migrateMissingVersion(save: SaveData, now: number): SaveData {
  const draft = draftFrom(save, now).draft;
  const profileId = typeof save.profileId === "string" && save.profileId.length > 0 ? save.profileId : createProfileId();
  for (const id of [...draft.prefixes, ...draft.suffixes]) {
    const key = `legacyTitle:${id}`;
    if (coveredByLedger(draft, id) || draft.ledger[key]) continue;
    commitSource(draft, key, { now, evidenceId: key, dot: false });
  }
  for (const examId of EXAM_IDS) {
    if (!strictlyCleared(save, examId)) continue;
    const key = `boss:${examId}:firstClear`;
    commitSource(draft, key, {
      now,
      evidenceId: `legacy:${profileId}:${examId}:cleared`,
      dot: draft.ledger[key] === undefined,
    });
  }
  for (const key of levelSourceKeysUpTo(titleLevel(save.xp))) {
    commitSource(draft, key, { now, evidenceId: key, dot: draft.ledger[key] === undefined });
  }
  return {
    ...writeDraft(save, draft),
    profileId,
    titleRulesVersion: 1,
  };
}

function repairVersionOne(save: SaveData, now: number): SaveData {
  const draft = draftFrom(save, now).draft;
  for (const [key, grant] of Object.entries(draft.ledger)) {
    const canonical = configuredPartIds(key);
    if (!canonical || grant.source !== grantSource(key)) continue;
    for (const id of canonical) {
      if (owns(draft, id)) continue;
      pushOwned(draft, id);
      if (!draft.via[id]) draft.via[id] = { source: key, at: grant.grantedAt };
    }
  }
  draft.newIds = draft.newIds.filter((id) => owns(draft, id));
  draft.equipped = legalEquip(draft, draft.equipped.prefixId, draft.equipped.suffixId);
  return writeDraft(save, draft);
}

function strictlyCleared(save: SaveData, examId: string): boolean {
  const entry = save.examProgress?.[examId];
  return entry?.cleared === true;
}

function coveredByLedger(draft: Draft, id: string): boolean {
  return Object.entries(draft.ledger).some(([key, grant]) => {
    const canonical = configuredPartIds(key);
    return grant.source === grantSource(key) && canonical?.includes(id) === true;
  });
}

interface Draft {
  prefixes: string[];
  suffixes: string[];
  equipped: { prefixId: string | null; suffixId: string | null };
  newIds: string[];
  via: Record<string, { source: string; at: number }>;
  ledger: Record<string, TitleGrant>;
  extraLedger: Record<string, unknown>;
  receipts: Record<string, TitleReceipt>;
}

function draftFrom(save: SaveData, now: number): { draft: Draft; repaired: boolean } {
  const rawParts: Record<string, unknown> = isRecord(save.titleParts) ? save.titleParts : {};
  const prefixes = knownIds(rawParts.unlockedPrefixIds, "prefix");
  const suffixes = knownIds(rawParts.unlockedSuffixIds, "suffix");
  const draft: Draft = {
    prefixes,
    suffixes,
    equipped: { prefixId: null, suffixId: null },
    newIds: [],
    via: {},
    ledger: {},
    extraLedger: {},
    receipts: {},
  };
  let repaired = false;
  const equipped = isRecord(rawParts.equipped) ? rawParts.equipped : {};
  // Worn ids are not ownership. An unowned or illegal part clears both slots.
  draft.equipped = legalEquip(
    draft,
    typeof equipped.prefixId === "string" ? equipped.prefixId : null,
    typeof equipped.suffixId === "string" ? equipped.suffixId : null,
  );
  draft.newIds = dedupe(stringList(rawParts.newIds).filter((id) => BY_ID.has(id)));
  if (isRecord(rawParts.via)) {
    for (const [id, via] of Object.entries(rawParts.via)) {
      if (!BY_ID.has(id) || !isRecord(via)) continue;
      if (typeof via.source !== "string" || via.source.length === 0) continue;
      if (typeof via.at !== "number" || !Number.isFinite(via.at)) continue;
      draft.via[id] = { source: via.source, at: via.at };
    }
  }
  if (isRecord(save.titleGrantLedger)) {
    for (const [key, value] of Object.entries(save.titleGrantLedger)) {
      if (grantSource(key)) {
        const grant = absorbGrant(key, value, now);
        if (!grant) continue;
        if (!grantIsStable(key, value)) repaired = true;
        draft.ledger[key] = grant;
      } else if (isRecord(value)) draft.extraLedger[key] = structuredClone(value);
    }
  }
  if (isRecord(save.titleReceipts)) {
    for (const [key, value] of Object.entries(save.titleReceipts)) {
      if (isReceipt(key, value)) draft.receipts[key] = value;
    }
  }
  return { draft, repaired };
}

function grantIsStable(key: string, value: unknown): boolean {
  const source = grantSource(key);
  const canonical = configuredPartIds(key);
  if (!source || !canonical || !isRecord(value)) return false;
  if (value.source !== source) return false;
  if (typeof value.grantedAt !== "number" || !Number.isFinite(value.grantedAt)) return false;
  if (typeof value.evidenceId !== "string" || value.evidenceId.length === 0) return false;
  if (!sameMembers(stringList(value.partIds), canonical)) return false;
  if (!isStringList(value.newPartIds) || new Set(value.newPartIds).size !== value.newPartIds.length) return false;
  return value.newPartIds.every((id) => canonical.includes(id));
}

function absorbGrant(key: string, value: unknown, now: number): TitleGrant | null {
  const source = grantSource(key);
  const canonical = configuredPartIds(key);
  if (!source || !canonical || !isRecord(value)) return null;
  if (grantIsStable(key, value)) return value as unknown as TitleGrant;
  const grantedAt = typeof value.grantedAt === "number" && Number.isFinite(value.grantedAt) ? value.grantedAt : now;
  const evidenceId = typeof value.evidenceId === "string" && value.evidenceId.length > 0 ? value.evidenceId : key;
  return {
    grantedAt,
    source,
    evidenceId,
    partIds: [...canonical],
    newPartIds: dedupe(stringList(value.newPartIds).filter((id) => canonical.includes(id))),
  };
}

function commitSource(draft: Draft, key: string, input: { now: number; evidenceId: string; dot: boolean }): boolean {
  const source = grantSource(key);
  const canonical = configuredPartIds(key);
  if (!source || !canonical || !input.evidenceId) return false;
  const existing = draft.ledger[key];
  if (existing) {
    let changed = false;
    for (const id of canonical) {
      if (owns(draft, id)) continue;
      pushOwned(draft, id);
      if (!draft.via[id]) draft.via[id] = { source: key, at: existing.grantedAt };
      changed = true;
    }
    if (!sameList(existing.partIds, canonical)) {
      draft.ledger[key] = { ...existing, partIds: [...canonical] };
      changed = true;
    }
    return changed;
  }
  const fresh = canonical.filter((id) => !owns(draft, id));
  for (const id of canonical) {
    pushOwned(draft, id);
    if (!draft.via[id]) draft.via[id] = { source: key, at: input.now };
  }
  if (input.dot) {
    for (const id of fresh) {
      if (!draft.newIds.includes(id)) draft.newIds.push(id);
    }
  }
  draft.ledger[key] = {
    grantedAt: input.now,
    source,
    evidenceId: input.evidenceId,
    partIds: [...canonical],
    newPartIds: input.dot ? [...fresh] : [],
  };
  return true;
}

function writeDraft(save: SaveData, draft: Draft): SaveData {
  return {
    ...save,
    titleParts: {
      unlockedPrefixIds: [...draft.prefixes],
      unlockedSuffixIds: [...draft.suffixes],
      equipped: { prefixId: draft.equipped.prefixId, suffixId: draft.equipped.suffixId },
      newIds: draft.newIds.filter((id) => owns(draft, id)),
      via: Object.fromEntries(Object.entries(draft.via).map(([id, via]) => [id, { source: via.source, at: via.at }])),
    },
    titleGrantLedger: { ...draft.extraLedger, ...draft.ledger } as Record<string, TitleGrant>,
    titleReceipts: { ...draft.receipts },
  };
}

function titleStateIsLoadStable(save: SaveData): boolean {
  if (typeof save.profileId !== "string" || save.profileId.length === 0) return false;
  if (!isRecord(save.titleParts) || !isRecord(save.titleGrantLedger) || !isRecord(save.titleReceipts)) return false;
  const parts = save.titleParts;
  if (!isStringList(parts.unlockedPrefixIds) || !isStringList(parts.unlockedSuffixIds) || !isStringList(parts.newIds)) return false;
  if (new Set(parts.unlockedPrefixIds).size !== parts.unlockedPrefixIds.length) return false;
  if (new Set(parts.unlockedSuffixIds).size !== parts.unlockedSuffixIds.length) return false;
  if (parts.unlockedPrefixIds.some((id) => BY_ID.get(id)?.slot !== "prefix")) return false;
  if (parts.unlockedSuffixIds.some((id) => BY_ID.get(id)?.slot !== "suffix")) return false;
  if (!isRecord(parts.equipped) || !isRecord(parts.via)) return false;
  const prefixId = parts.equipped.prefixId;
  const suffixId = parts.equipped.suffixId;
  if (!nullableId(prefixId) || !nullableId(suffixId)) return false;
  if (!equipIsLegal(parts as unknown as TitleParts, prefixId as string | null, suffixId as string | null)) return false;
  const owned = new Set([...parts.unlockedPrefixIds, ...parts.unlockedSuffixIds]);
  if (new Set(parts.newIds).size !== parts.newIds.length || parts.newIds.some((id) => !owned.has(id))) return false;
  for (const [id, via] of Object.entries(parts.via)) {
    if (!BY_ID.has(id) || !isRecord(via)) return false;
    if (typeof via.source !== "string" || via.source.length === 0) return false;
    if (typeof via.at !== "number" || !Number.isFinite(via.at)) return false;
  }
  for (const [key, value] of Object.entries(save.titleGrantLedger)) {
    if (grantSource(key)) {
      if (!grantIsStable(key, value)) return false;
      const canonical = configuredPartIds(key) ?? [];
      if (canonical.some((id) => !owned.has(id))) return false;
    } else if (!isRecord(value)) return false;
  }
  for (const [key, value] of Object.entries(save.titleReceipts)) {
    if (!isReceipt(key, value)) return false;
  }
  return true;
}

function equipIsLegal(parts: TitleParts, prefixId: string | null, suffixId: string | null): boolean {
  if (prefixId === null && suffixId === null) return true;
  if (suffixId === null) return false;
  const suffix = BY_ID.get(suffixId);
  if (!suffix || suffix.slot !== "suffix" || !parts.unlockedSuffixIds.includes(suffixId)) return false;
  if (prefixId === null) return true;
  const prefix = BY_ID.get(prefixId);
  if (!prefix || prefix.slot !== "prefix" || !parts.unlockedPrefixIds.includes(prefixId)) return false;
  return titleTextRule(prefix, suffix).ok;
}

function legalEquip(
  draft: Draft,
  prefixId: string | null,
  suffixId: string | null,
): { prefixId: string | null; suffixId: string | null } {
  const parts = toParts(draft);
  if (equipIsLegal(parts, prefixId, suffixId)) return { prefixId, suffixId };
  return { prefixId: null, suffixId: null };
}

function toParts(draft: Draft): TitleParts {
  return {
    unlockedPrefixIds: draft.prefixes,
    unlockedSuffixIds: draft.suffixes,
    equipped: draft.equipped,
    newIds: draft.newIds,
    via: draft.via,
  };
}

function owns(draft: Draft, id: string): boolean {
  const row = BY_ID.get(id);
  if (!row) return false;
  return row.slot === "prefix" ? draft.prefixes.includes(id) : draft.suffixes.includes(id);
}

function pushOwned(draft: Draft, id: string): void {
  const row = BY_ID.get(id);
  if (!row) return;
  if (row.slot === "prefix") {
    if (!draft.prefixes.includes(id)) draft.prefixes.push(id);
  } else if (!draft.suffixes.includes(id)) draft.suffixes.push(id);
}

function knownIds(value: unknown, slot: TitleDef["slot"]): string[] {
  return dedupe(stringList(value).filter((id) => BY_ID.get(id)?.slot === slot));
}

function eventAccepted(save: SaveData, event: TitleGrantEvent): boolean {
  return typeof save.profileId === "string"
    && save.profileId.length > 0
    && event.profileId === save.profileId
    && typeof event.eventId === "string"
    && event.eventId.includes(save.profileId)
    && typeof event.now === "number"
    && Number.isFinite(event.now);
}

function stableSourceKeys(keys: readonly string[]): string[] {
  const unique = dedupe(keys);
  return unique.sort((left, right) => sourceOrder(left) - sourceOrder(right) || left.localeCompare(right));
}

function sourceOrder(key: string): number {
  const bossId = bossIdFromKey(key);
  if (bossId && bossId !== GRADUATION_BOSS_ID) return EXAM_IDS.indexOf(bossId);
  const level = levelNumber(key);
  if (level !== null) return 1000 + level;
  return 2000;
}

function isReceipt(key: string, value: unknown): value is TitleReceipt {
  if (!isRecord(value)) return false;
  if (value.status !== "pending" && value.status !== "presented") return false;
  if (typeof value.id !== "string" || typeof value.eventId !== "string") return false;
  if (value.id !== key || value.id !== `title:${value.eventId}`) return false;
  return isStringList(value.grantKeys) && isStringList(value.newPartIds);
}

function sameMembers(left: readonly string[], right: readonly string[]): boolean {
  return new Set(left).size === left.length
    && new Set(right).size === new Set(left).size
    && right.every((id) => left.includes(id));
}

function sameList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function dedupe(ids: readonly string[]): string[] {
  const out: string[] = [];
  for (const id of ids) if (!out.includes(id)) out.push(id);
  return out;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function nullableId(value: unknown): boolean {
  return value === null || typeof value === "string";
}

function finiteTime(now: number, createdAt: unknown): number {
  if (typeof now === "number" && Number.isFinite(now)) return now;
  if (typeof createdAt === "number" && Number.isFinite(createdAt)) return createdAt;
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
