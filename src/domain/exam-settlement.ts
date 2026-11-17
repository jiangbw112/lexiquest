/**
 * One snapshot for an exam phase: progress, XP, titles, and inventor records.
 * Old passed phases are legacyNoGrant and are not paid again. XP is not guessed from the total.
 */
import { classById } from "./classes";
import { examAnswerSpelling, sessionFromSchedule, type ExamSchedule, type ExamSession } from "./exam-questions";
import { examById, FINAL_EXAM_IDS, hasClearedAnyFinal, type ExamDef } from "./exams";
import { levelFromXp, noteBattleAnswer } from "./progress";
import { configuredPartIds, grantTitleParts, levelSourceKeysUpTo } from "./titles";
import type { ExamProgressEntry, FirstClearProof, SaveData } from "./types";

export const EXAM_LOCK_KEY = "lexiquest.exam.writer.v1";
export const EXAM_SAVE_FAILED = "还没存好，请再试一次。";
export const EXAM_REVIEW_BLOCK = "记录对不上，先不能开始。";
export const EXAM_LOCK_HELD = "这场考试已在别的页面打开。";

/** Profile id already written into a save snapshot. A blank or broken snapshot has none. */
export function savedProfileId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as { profileId?: unknown };
    return typeof value.profileId === "string" && value.profileId.length > 0 ? value.profileId : null;
  } catch {
    return null;
  }
}

export interface ExamStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface ExamLock {
  token: string;
  profileId: string;
  tabId: string;
  expiresAt: number;
}

export function claimExamLock(store: ExamStore, profileId: string, tabId: string, now: number, token: string, holdMs = 20000): string | null {
  const current = readLock(store);
  if (current && current.expiresAt > now && !(current.profileId === profileId && current.tabId === tabId)) return null;
  const next: ExamLock = { token, profileId, tabId, expiresAt: now + holdMs };
  try {
    store.set(EXAM_LOCK_KEY, JSON.stringify(next));
    const written = readLock(store);
    return written?.token === token ? token : null;
  } catch {
    return null;
  }
}

export function releaseExamLock(store: ExamStore, token: string): void {
  const current = readLock(store);
  if (!current || current.token !== token) return;
  try {
    store.set(EXAM_LOCK_KEY, "");
  } catch {
    /* a failed release expires with the hold */
  }
}

function readLock(store: ExamStore): ExamLock | null {
  let raw: string | null;
  try {
    raw = store.get(EXAM_LOCK_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<ExamLock>;
    if (!value || typeof value.token !== "string" || typeof value.profileId !== "string") return null;
    if (typeof value.tabId !== "string" || typeof value.expiresAt !== "number") return null;
    return { token: value.token, profileId: value.profileId, tabId: value.tabId, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

/** Writes only when the stored text is still the snapshot this attempt started from. */
export function commitExamSnapshot(store: ExamStore, key: string, baseRaw: string, nextRaw: string): boolean {
  let current: string | null;
  try {
    current = store.get(key);
  } catch {
    return false;
  }
  if (current !== baseRaw) return false;
  try {
    store.set(key, nextRaw);
    return store.get(key) === nextRaw;
  } catch {
    return false;
  }
}

export function examRewardBlocked(save: SaveData, examId: string): boolean {
  return save.examProgress?.[examId]?.migrationReviewRequired === true;
}

export function migrateExamRewards(save: SaveData, now: number): SaveData {
  const version = save.examRewardSchemaVersion;
  if (typeof version === "number" && version > 1) return save;
  if (version === 1) return repairVersionOne(save);
  return migrateMissing(save, now);
}

function migrateMissing(save: SaveData, now: number): SaveData {
  const progress = { ...(save.examProgress ?? {}) };
  let changed = save.examRewardSchemaVersion !== 1;
  for (const id of Object.keys(progress)) {
    const exam = examById(id);
    const entry = progress[id];
    if (!entry) continue;
    if (!exam) continue;
    const migrated = migrateOldEntry(save, exam, entry, now);
    if (migrated !== entry) {
      progress[id] = migrated;
      changed = true;
    }
  }
  if (!changed) return save.examRewardSchemaVersion === 1 ? save : { ...save, examRewardSchemaVersion: 1 };
  return { ...save, examRewardSchemaVersion: 1, examProgress: progress };
}

function migrateOldEntry(save: SaveData, exam: ExamDef, entry: ExamProgressEntry, now: number): ExamProgressEntry {
  if (entry.rewardMigration?.version === 1 || entry.migrationReviewRequired) return entry;
  const cleared = entry.cleared === true;
  const best = entry.bestPhase;
  const bestLegal = typeof best === "number" && Number.isInteger(best) && best >= 1 && best <= exam.phases;
  const clearedKnown = entry.cleared === undefined || entry.cleared === true || entry.cleared === false;
  if (!clearedKnown || (best !== undefined && !bestLegal && !cleared)) {
    return {
      ...entry,
      migrationReviewRequired: true,
      rewardMigration: {
        version: 1,
        legacyPassedThrough: 0,
        evidence: "oldBestPhase",
        migratedAt: now,
      },
    };
  }
  const through = cleared ? exam.phases : bestLegal ? (best as number) - 1 : 0;
  const evidence = cleared ? "oldCleared" : bestLegal ? "oldBestPhase" : "newSave";
  return {
    ...entry,
    bestPhase: cleared ? exam.phases : bestLegal ? best : entry.bestPhase,
    phaseRecords: legacyRecords(save, exam.id, through),
    rewardMigration: { version: 1, legacyPassedThrough: through, evidence, migratedAt: now },
  };
}

function legacyRecords(save: SaveData, examId: string, through: number): ExamProgressEntry["phaseRecords"] {
  const profileId = save.profileId ?? "";
  const records: NonNullable<ExamProgressEntry["phaseRecords"]> = {};
  for (let phase = 1; phase <= through; phase += 1) {
    records[String(phase)] = {
      passed: true,
      xpDisposition: "legacyNoGrant",
      xpAmount: 0,
      settlementKey: phaseKey(profileId, examId, phase),
      origin: "legacyProgress",
    };
  }
  return records;
}

function repairVersionOne(save: SaveData): SaveData {
  const progress = save.examProgress;
  if (!progress) return save;
  let changed = false;
  const next = { ...progress };
  for (const id of Object.keys(progress)) {
    const exam = examById(id);
    const entry = progress[id];
    if (!exam || !entry || entry.migrationReviewRequired) continue;
    if (entry.rewardMigration?.version === 1 && recordsCover(entry)) continue;
    if (!entry.rewardMigration && entry.cleared === undefined && entry.bestPhase === undefined && !entry.phaseRecords) continue;
    next[id] = { ...entry, migrationReviewRequired: true };
    changed = true;
  }
  return changed ? { ...save, examProgress: next } : save;
}

function recordsCover(entry: ExamProgressEntry): boolean {
  const through = entry.rewardMigration?.legacyPassedThrough ?? 0;
  for (let phase = 1; phase <= through; phase += 1) {
    const record = entry.phaseRecords?.[String(phase)];
    if (record?.passed !== true) return false;
  }
  return true;
}

export function backfillInventorRecord(save: SaveData): SaveData {
  if (!hasClearedAnyFinal(save)) return save;
  const source = earliestFinal(save);
  if (!source) return save;
  let changed = false;
  const next: SaveData = { ...save };
  if (!next.unlockedClassIds?.includes("inventor")) {
    next.unlockedClassIds = [...(next.unlockedClassIds ?? []), "inventor"];
    changed = true;
  }
  if (!next.inventorUnlockedBy) {
    next.inventorUnlockedBy = source.id;
    changed = true;
  }
  if (next.inventorUnlockedAt === undefined && source.clearedAt !== undefined && !save.inventorUnlockedBy) {
    next.inventorUnlockedAt = source.clearedAt;
    changed = true;
  }
  return changed ? next : save;
}

function earliestFinal(save: SaveData): { id: string; clearedAt?: number } | null {
  const found = FINAL_EXAM_IDS.filter((id) => save.examProgress?.[id]?.cleared === true);
  if (found.length === 0) return null;
  const dated = found
    .map((id) => ({ id, clearedAt: save.examProgress?.[id]?.clearedAt }))
    .filter((item): item is { id: string; clearedAt: number } => typeof item.clearedAt === "number" && Number.isFinite(item.clearedAt));
  if (dated.length === 0) return { id: found[0]! };
  dated.sort((a, b) => a.clearedAt - b.clearedAt || FINAL_EXAM_IDS.indexOf(a.id) - FINAL_EXAM_IDS.indexOf(b.id));
  return dated[0]!;
}

export interface ExamAttemptResult {
  ok: boolean;
  save: SaveData;
  xpGained: number;
  titleNewIds: string[];
  inventorFresh: boolean;
  alreadyPassed: boolean;
  clearedNow: boolean;
  reason?: "review" | "unknown" | "profile";
}

export function settleExamAttempt(
  save: SaveData,
  input: {
    examId: string;
    phaseNo: number;
    now: number;
    won: boolean;
    schedule: ExamSchedule;
    /** Raw save text that was already written. Events use only the profileId inside it. */
    persistedRaw: string;
  },
): ExamAttemptResult {
  const exam = examById(input.examId);
  if (!exam || !Number.isInteger(input.phaseNo) || input.phaseNo < 1 || input.phaseNo > exam.phases) {
    return { ok: false, save, xpGained: 0, titleNewIds: [], inventorFresh: false, alreadyPassed: false, clearedNow: false, reason: "unknown" };
  }
  const profileId = savedProfileId(input.persistedRaw);
  if (!profileId || profileId !== save.profileId) {
    return { ok: false, save, xpGained: 0, titleNewIds: [], inventorFresh: false, alreadyPassed: false, clearedNow: false, reason: "profile" };
  }
  if (examRewardBlocked(save, exam.id)) {
    return { ok: false, save, xpGained: 0, titleNewIds: [], inventorFresh: false, alreadyPassed: false, clearedNow: false, reason: "review" };
  }
  const prior = save.examProgress?.[exam.id];
  const passed = prior?.phaseRecords?.[String(input.phaseNo)]?.passed === true;
  const session = sessionFromSchedule(input.schedule, input.won && !passed);
  const keptSession = passed ? keepPaidCounts(prior?.session, session) : session;
  if (passed) {
    return {
      ok: true,
      save: writeEntry(save, exam, prior, { session: keptSession, attempts: (prior?.attempts ?? 0) + 1 }),
      xpGained: 0,
      titleNewIds: [],
      inventorFresh: false,
      alreadyPassed: true,
      clearedNow: false,
    };
  }
  if (!input.won) {
    return {
      ok: true,
      save: writeEntry(save, exam, prior, {
        session,
        phaseLosses: bumpLoss(prior?.phaseLosses, input.phaseNo),
        sawLoss: true,
        attempts: (prior?.attempts ?? 0) + 1,
      }),
      xpGained: 0,
      titleNewIds: [],
      inventorFresh: false,
      alreadyPassed: false,
      clearedNow: false,
    };
  }
  const bonus = classById(save.player.classId).xpBonus;
  const xpGained = Math.round(20 * bonus);
  const beforeLevel = levelFromXp(save.xp).level;
  const xp = save.xp + xpGained;
  const afterLevel = levelFromXp(xp).level;
  const clearing = input.phaseNo === exam.phases && prior?.cleared !== true;
  const wasFinal = hasClearedAnyFinal(save);
  let next = writeEntry({ ...save, xp }, exam, prior, {
    session,
    phaseLosses: { ...(prior?.phaseLosses ?? {}), [String(input.phaseNo)]: 0 },
    attempts: (prior?.attempts ?? 0) + 1,
    bestPhase: input.phaseNo < exam.phases ? input.phaseNo + 1 : exam.phases,
    cleared: prior?.cleared === true || clearing,
    clearedAt: clearing ? input.now : prior?.clearedAt,
    paidPhase: input.phaseNo,
    xpGained,
    now: input.now,
    firstClear: clearing ? clearProof(profileId, exam, input.now) : undefined,
  });
  const titleNewIds: string[] = [];
  const eventId = `exam:${profileId}:${exam.id}:${input.phaseNo}`;
  if (clearing) {
    const key = `boss:${exam.id}:firstClear`;
    const parts = configuredPartIds(key);
    if (parts) {
      const granted = grantTitleParts(next, key, parts, eventId, input.now);
      next = granted.save;
      titleNewIds.push(...granted.newPartIds);
    }
  }
  if (afterLevel > beforeLevel) {
    for (const key of levelSourceKeysUpTo(afterLevel)) {
      const level = Number(key.slice("level:".length));
      if (!Number.isInteger(level) || level <= beforeLevel) continue;
      const parts = configuredPartIds(key);
      if (!parts) continue;
      const granted = grantTitleParts(next, key, parts, `${eventId}:${key}`, input.now);
      next = granted.save;
      titleNewIds.push(...granted.newPartIds);
    }
  }
  let inventorFresh = false;
  if (clearing && exam.kind === "final" && !wasFinal) {
    inventorFresh = true;
    next = {
      ...next,
      unlockedClassIds: next.unlockedClassIds?.includes("inventor") ? next.unlockedClassIds : [...(next.unlockedClassIds ?? []), "inventor"],
      inventorUnlockedAt: input.now,
      inventorUnlockedBy: exam.id,
      inventorUnlockReceipt: { eventId, status: "pending" },
    };
  }
  return { ok: true, save: next, xpGained, titleNewIds, inventorFresh, alreadyPassed: false, clearedNow: clearing };
}

function clearProof(profileId: string, exam: ExamDef, now: number): FirstClearProof {
  return {
    kind: "finalPhaseVictory",
    phaseCount: exam.phases,
    clearEventId: `exam:${profileId}:${exam.id}:clear`,
    firstClearAt: now,
    configPhaseCount: exam.phases,
  };
}

function bumpLoss(losses: Record<string, number> | undefined, phaseNo: number): Record<string, number> {
  const key = String(phaseNo);
  return { ...(losses ?? {}), [key]: (losses?.[key] ?? 0) + 1 };
}

/** A second settlement must not pay the phase again, and must not wipe the count already paid. */
function keepPaidCounts(saved: ExamSession | undefined, next: ExamSession): ExamSession {
  const questions = typeof saved?.fightQuestions === "number" && Number.isFinite(saved.fightQuestions) ? saved.fightQuestions : 0;
  const spelling = typeof saved?.fightSpelling === "number" && Number.isFinite(saved.fightSpelling) ? saved.fightSpelling : 0;
  return {
    ...next,
    fightQuestions: Math.max(questions, next.fightQuestions),
    fightSpelling: Math.max(spelling, next.fightSpelling),
  };
}

function phaseKey(profileId: string, examId: string, phaseNo: number): string {
  return `examPhase:${profileId}:${examId}:${phaseNo}:firstPass`;
}

function writeEntry(
  save: SaveData,
  exam: ExamDef,
  prior: ExamProgressEntry | undefined,
  patch: {
    session: ExamSession;
    phaseLosses?: Record<string, number>;
    sawLoss?: boolean;
    attempts?: number;
    bestPhase?: number;
    cleared?: boolean;
    clearedAt?: number;
    paidPhase?: number;
    xpGained?: number;
    now?: number;
    firstClear?: FirstClearProof;
  },
): SaveData {
  const profileId = save.profileId ?? "";
  const records = { ...(prior?.phaseRecords ?? {}) };
  if (patch.paidPhase && patch.now !== undefined) {
    records[String(patch.paidPhase)] = {
      passed: true,
      xpDisposition: "paid",
      xpAmount: patch.xpGained ?? 0,
      settledAt: patch.now,
      settlementKey: phaseKey(profileId, exam.id, patch.paidPhase),
      origin: "newPass",
    };
  }
  const entry: ExamProgressEntry = {
    ...prior,
    cleared: patch.cleared ?? prior?.cleared,
    bestPhase: patch.bestPhase ?? prior?.bestPhase ?? 1,
    clearedAt: patch.clearedAt ?? prior?.clearedAt,
    phaseLosses: patch.phaseLosses ?? prior?.phaseLosses,
    attempts: patch.attempts ?? prior?.attempts,
    sawLoss: patch.sawLoss || prior?.sawLoss === true ? true : prior?.sawLoss,
    phaseRecords: records,
    session: patch.session,
    rewardMigration: prior?.rewardMigration ?? {
      version: 1,
      legacyPassedThrough: 0,
      evidence: "newSave",
      migratedAt: patch.now ?? save.createdAt,
    },
  };
  if (patch.firstClear) {
    entry.firstClearProof = patch.firstClear;
    entry.titleGrantedAt = prior?.titleGrantedAt ?? patch.now;
    entry.firstTryClear = prior?.sawLoss !== true && patch.sawLoss !== true;
  }
  if (entry.cleared === true && entry.bestPhase !== undefined && entry.bestPhase < exam.phases) entry.bestPhase = exam.phases;
  delete entry.phaseRun;
  return {
    ...save,
    examRewardSchemaVersion: 1,
    examProgress: { ...(save.examProgress ?? {}), [exam.id]: entry },
  };
}

/** Recognition, and any excluded id, does not write independent spelling. */
export function noteExamAnswer(
  save: SaveData,
  input: {
    wordId: string;
    correct: boolean;
    now: Date;
    dueAtStart: readonly string[];
    spelling: boolean;
    timeZone?: string;
  },
): SaveData {
  return noteBattleAnswer(save, { ...input, spelling: examAnswerSpelling(input.wordId, input.spelling) });
}

export function markInventorUnlockPresented(save: SaveData): SaveData {
  const receipt = save.inventorUnlockReceipt;
  if (!receipt || receipt.status !== "pending") return save;
  return { ...save, inventorUnlockReceipt: { ...receipt, status: "presented" } };
}
