/**
 * Midterm and final exams. Fifteen fixed ids. No grade-6 semester-2 midterm.
 * Chapter ids match chapters_v0.2.json. Positions are the fixed table, not a runtime half-count.
 */
import { gradeChapters, isChapterCleared } from "./chapter-plan";
import { PROVISIONAL } from "./provisional";
import type { ClassId, GradeBand, SaveData } from "./types";

export type ExamKind = "mid" | "final";

export interface ExamDef {
  id: string;
  kind: ExamKind;
  grade: GradeBand;
  semester: 1 | 2;
  /** Pool and, for these rows, the chapter-boss gate. Midterm is the chapters before the node. */
  chapters: readonly string[];
  /** Map page that shows the node: the chapter the node sits after. */
  after: string;
  phases: number;
}

export const EXAMS: readonly ExamDef[] = [
  { id: "exam_g3_s1_mid", kind: "mid", grade: "G3", semester: 1, chapters: ["pep_g3_01", "pep_g3_02"], after: "pep_g3_02", phases: 2 },
  { id: "exam_g3_s1_final", kind: "final", grade: "G3", semester: 1, chapters: ["pep_g3_01", "pep_g3_02", "pep_g3_03", "pep_g3_04"], after: "pep_g3_04", phases: 3 },
  { id: "exam_g3_s2_mid", kind: "mid", grade: "G3", semester: 2, chapters: ["pep_g3_05", "pep_g3_06"], after: "pep_g3_06", phases: 2 },
  { id: "exam_g3_s2_final", kind: "final", grade: "G3", semester: 2, chapters: ["pep_g3_05", "pep_g3_06", "pep_g3_07", "pep_g3_08"], after: "pep_g3_08", phases: 3 },
  { id: "exam_g4_s1_mid", kind: "mid", grade: "G4", semester: 1, chapters: ["pep_g4_01", "pep_g4_02"], after: "pep_g4_02", phases: 2 },
  { id: "exam_g4_s1_final", kind: "final", grade: "G4", semester: 1, chapters: ["pep_g4_01", "pep_g4_02", "pep_g4_03", "pep_g4_04"], after: "pep_g4_04", phases: 3 },
  { id: "exam_g4_s2_mid", kind: "mid", grade: "G4", semester: 2, chapters: ["pep_g4_05", "pep_g4_06"], after: "pep_g4_06", phases: 2 },
  { id: "exam_g4_s2_final", kind: "final", grade: "G4", semester: 2, chapters: ["pep_g4_05", "pep_g4_06", "pep_g4_07", "pep_g4_08"], after: "pep_g4_08", phases: 3 },
  { id: "exam_g5_s1_mid", kind: "mid", grade: "G5", semester: 1, chapters: ["pep_g5_01", "pep_g5_02"], after: "pep_g5_02", phases: 2 },
  { id: "exam_g5_s1_final", kind: "final", grade: "G5", semester: 1, chapters: ["pep_g5_01", "pep_g5_02", "pep_g5_03", "pep_g5_04"], after: "pep_g5_04", phases: 3 },
  { id: "exam_g5_s2_mid", kind: "mid", grade: "G5", semester: 2, chapters: ["pep_g5_05", "pep_g5_06", "pep_g5_07"], after: "pep_g5_07", phases: 2 },
  { id: "exam_g5_s2_final", kind: "final", grade: "G5", semester: 2, chapters: ["pep_g5_05", "pep_g5_06", "pep_g5_07", "pep_g5_08", "pep_g5_09"], after: "pep_g5_09", phases: 3 },
  { id: "exam_g6_s1_mid", kind: "mid", grade: "G6", semester: 1, chapters: ["pep_g6_01", "pep_g6_02"], after: "pep_g6_02", phases: 2 },
  { id: "exam_g6_s1_final", kind: "final", grade: "G6", semester: 1, chapters: ["pep_g6_01", "pep_g6_02", "pep_g6_03", "pep_g6_04"], after: "pep_g6_04", phases: 3 },
  { id: "exam_g6_s2_final", kind: "final", grade: "G6", semester: 2, chapters: ["pep_g6_05", "pep_g6_06"], after: "pep_g6_06", phases: 3 },
];

export const EXAM_ID_LIST: readonly string[] = EXAMS.map((exam) => exam.id);

export const FINAL_EXAM_IDS: readonly string[] = EXAMS.filter((exam) => exam.kind === "final").map((exam) => exam.id);

const BY_ID = new Map(EXAMS.map((exam) => [exam.id, exam]));

export const EXAM_ATTACK = 4;
export const EXAM_SHAKEN_AFTER = 10;
export const EXAM_INTRO_MS = 1300;
export const EXAM_BOSS_SCALE = 0.5;
export const EXAM_BOSS_X = 980;
export const EXAM_BOSS_Y = 520;

export function examById(id: string): ExamDef | undefined {
  return BY_ID.get(id);
}

export function isExamId(id: string): boolean {
  return BY_ID.has(id);
}

export function examsOnChapter(chapterId: string): ExamDef[] {
  return EXAMS.filter((exam) => exam.after === chapterId);
}

/** Compass layer is only the grade-6 semester-2 final. defaultOn false is the art default. */
export function examShowsCompass(examId: string): boolean {
  return examId === "exam_g6_s2_final";
}

export function examEnemyName(kind: ExamKind): string {
  return kind === "mid" ? "期中守护者" : "期末守护者";
}

const GRADE_LABEL: Record<GradeBand, string> = {
  G3: "三年级",
  G4: "四年级",
  G5: "五年级",
  G6: "六年级",
};

export function examBannerTitle(exam: ExamDef): string {
  const half = exam.semester === 1 ? "上" : "下";
  const kind = exam.kind === "mid" ? "期中挑战" : "期末大挑战";
  return `${GRADE_LABEL[exam.grade]}${half} · ${kind}`;
}

/**
 * Chapter bosses keep the phase suffix. Exam fights do not.
 * The two spaces match the existing chapter label.
 */
export function battleEnemyName(name: string, phaseIndex: number, phaseCount: number, exam: boolean): string {
  if (exam || phaseCount <= 1) return name;
  return `${name}  阶段 ${phaseIndex + 1}/${phaseCount}`;
}

export function examPhaseHp(classId: ClassId, kind: ExamKind, losses: number): number {
  const table = kind === "mid"
    ? PROVISIONAL.chapterEnding.examBossPhaseHp.midterm
    : PROVISIONAL.chapterEnding.examBossPhaseHp.final;
  const base = table[classId];
  const factor = losses >= 3 ? 0.7 : losses >= 2 ? 0.85 : 1;
  return Math.round(base * factor);
}

/** G3 and G4 spelling turns counter at 2. Other grades keep the exam attack of 4. */
export function examSpellingCounter(grade: GradeBand): number | null {
  return grade === "G3" || grade === "G4" ? 2 : null;
}

export function examUnlocked(save: SaveData, exam: ExamDef): boolean {
  return exam.chapters.every((id) => {
    const chapter = gradeChapters(exam.grade).find((item) => item.id === id);
    return chapter ? isChapterCleared(save, chapter) : false;
  });
}

export type ExamNodeStatus = "hidden" | "locked" | "ready" | "cleared";

export function examNodeStatus(save: SaveData, exam: ExamDef): ExamNodeStatus {
  if (!save.selectedGrades.includes(exam.grade)) return "hidden";
  if (save.examProgress?.[exam.id]?.cleared === true) return "cleared";
  if (examUnlocked(save, exam)) return "ready";
  return "locked";
}

export function hasClearedAnyFinal(save: { examProgress?: Record<string, { cleared?: boolean } | undefined> } | null | undefined): boolean {
  return FINAL_EXAM_IDS.some((id) => save?.examProgress?.[id]?.cleared === true);
}

export function examIntroParts(open: boolean): { hud: boolean; phase: boolean; question: boolean; answers: boolean } {
  if (open) return { hud: false, phase: false, question: false, answers: false };
  return { hud: true, phase: true, question: true, answers: true };
}

/** Shown once the next question is about to be dealt. Same words as the chapter line. */
export function examShakenLine(enemyName: string, lastPhase: boolean): string {
  return lastPhase
    ? `${enemyName}动摇了！答对并出手攻击，就能赢！`
    : `${enemyName}动摇了！答对并出手攻击，就能突破！`;
}

/** A banner click only closes the banner. It never answers the question. */
export function deliverExamPointer(open: boolean, onClose: () => void): void {
  if (open) onClose();
}

/** Next phase to play. A cleared exam replays from phase 1. bestPhase is the next unpassed phase. */
export function resumeExamPhase(save: SaveData, exam: ExamDef): number {
  const entry = save.examProgress?.[exam.id];
  if (entry?.cleared === true) return 1;
  const best = entry?.bestPhase;
  if (typeof best === "number" && Number.isInteger(best) && best >= 1 && best <= exam.phases) return best;
  return 1;
}
