import forest from "./data/forest-adventure.json";
import type { GradeBand, Semester } from "./types";

export type SpellingLevel = "basic" | "advanced" | "none";
export type GradeEstimate = 3 | 4 | 5 | 6;

export interface WordDef {
  id: string;
  english: string;
  chinese: string;
  gradeEst: GradeEstimate;
  grade: GradeBand;
  spelling: SpellingLevel;
  theme: "Forest Adventure";
  unitId: string;
  /** Original sample content. Not textbook text. */
  sample: true;
}

export interface UnitDef {
  id: string;
  grade: GradeBand;
  semester: Semester;
  index: number;
  title: string;
  status: "sample" | "planned";
  wordIds: string[];
}

export const GRADE_BANDS: { id: GradeBand; label: string }[] = [
  { id: "G3", label: "三年级" },
  { id: "G4", label: "四年级" },
  { id: "G5", label: "五年级" },
  { id: "G6", label: "六年级" },
];

export const SAMPLE_THEME = "Forest Adventure" as const;
export const SAMPLE_DATA_LABEL = "SAMPLE DATA";

const GRADE_OF: Record<GradeEstimate, GradeBand> = { 3: "G3", 4: "G4", 5: "G5", 6: "G6" };

function isGrade(value: number): value is GradeEstimate {
  return value === 3 || value === 4 || value === 5 || value === 6;
}

function isSpelling(value: string): value is SpellingLevel {
  return value === "basic" || value === "advanced" || value === "none";
}

export const SAMPLE_WORDS: WordDef[] = forest.words.map((entry) => {
  if (!isGrade(entry.grade_est) || !isSpelling(entry.spelling)) {
    throw new Error(`Bad sample word: ${entry.word}`);
  }
  const grade = GRADE_OF[entry.grade_est];
  return {
    id: entry.word,
    english: entry.word,
    chinese: entry.meaning_zh,
    gradeEst: entry.grade_est,
    grade,
    spelling: entry.spelling,
    theme: SAMPLE_THEME,
    unitId: `${grade}-S1-U1`,
    sample: true,
  };
});

export function listUnits(): UnitDef[] {
  const grades: GradeBand[] = ["G3", "G4", "G5", "G6"];
  const semesters: Semester[] = [1, 2];
  const units: UnitDef[] = [];
  for (const grade of grades) {
    for (const semester of semesters) {
      for (let index = 1; index <= 6; index += 1) {
        const id = `${grade}-S${semester}-U${index}`;
        const wordIds = SAMPLE_WORDS.filter((word) => word.unitId === id).map((word) => word.id);
        const sample = wordIds.length > 0;
        units.push({
          id,
          grade,
          semester,
          index,
          title: sample ? "森林冒险" : "待编写",
          status: sample ? "sample" : "planned",
          wordIds,
        });
      }
    }
  }
  return units;
}

export function sampleUnits(): UnitDef[] {
  return listUnits().filter((unit) => unit.status === "sample");
}

export function unitById(id: string): UnitDef | undefined {
  return listUnits().find((unit) => unit.id === id);
}

export function sampleWords(): WordDef[] {
  return SAMPLE_WORDS;
}

const GRADE_ORDER: GradeBand[] = ["G3", "G4", "G5", "G6"];

/** At least one grade. An empty choice falls back to grade 3. */
export function normalizeGrades(input: readonly string[] | undefined): GradeBand[] {
  const picked = new Set(input ?? []);
  const grades = GRADE_ORDER.filter((grade) => picked.has(grade));
  return grades.length > 0 ? grades : ["G3"];
}

/** Sample words whose estimated grade is one of the selected grades. */
export function wordsForGrades(grades: readonly string[] | undefined): WordDef[] {
  const selected = new Set(normalizeGrades(grades));
  return SAMPLE_WORDS.filter((word) => selected.has(word.grade));
}

export function wordById(id: string): WordDef | undefined {
  return SAMPLE_WORDS.find((word) => word.id === id);
}

export function wordsInUnit(unitId: string): WordDef[] {
  const unit = unitById(unitId);
  if (!unit) return [];
  return unit.wordIds.map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word));
}
