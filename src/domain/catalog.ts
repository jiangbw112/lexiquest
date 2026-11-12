import type { GradeBand, Semester } from "./types";
import { uiLabel } from "./ui-label";
import forestChapterFile from "./chapters/chapter_forest_v1.1.json";

export type SpellingLevel = "basic" | "advanced" | "none";
export type GradeEstimate = 3 | 4 | 5 | 6;

export interface WordSense {
  chinese: string;
  /** Set only when this sense has its own non-empty pos. Otherwise the word's pos is used. */
  pos?: string;
}

export interface WordDef {
  id: string;
  english: string;
  chinese: string;
  /** Set only when the list gives a non-empty string. Shown exactly as written. */
  pos?: string;
  /** Set only when the entry included sense objects that v1 can show. A new_sense is left out. The v1.2.2 loader file has no senses. */
  senses?: WordSense[];
  gradeEst: GradeEstimate;
  grade: GradeBand;
  spelling: SpellingLevel;
  theme: string;
  unitId: string;
  /** True for the Forest Adventure sample. A later file can set this false. */
  sample: boolean;
}

/** One word list. A file may hold every grade, or only one grade. */
export interface WordFile {
  theme?: string;
  sample?: boolean;
  note?: string;
  words: WordFileEntry[];
}

export interface WordFileEntry {
  word: string;
  meaning_zh: string;
  grade_est: number;
  spelling: string;
  /** Opaque. A non-empty string is shown as written. Null, missing, or "" means no prefix. */
  pos?: unknown;
  senses?: unknown;
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
  { id: "G3", label: uiLabel("三年级") },
  { id: "G4", label: uiLabel("四年级") },
  { id: "G5", label: uiLabel("五年级") },
  { id: "G6", label: uiLabel("六年级") },
];

export const SAMPLE_THEME = "Forest Adventure" as const;

const GRADE_OF: Record<GradeEstimate, GradeBand> = { 3: "G3", 4: "G4", 5: "G5", 6: "G6" };

function isGrade(value: number): value is GradeEstimate {
  return value === 3 || value === 4 || value === 5 || value === 6;
}

function isSpelling(value: string): value is SpellingLevel {
  return value === "basic" || value === "advanced" || value === "none";
}

/** A non-empty string is kept exactly. Null, missing, and "" mean there is no prefix. */
function readPos(value: unknown, source: string, english: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") throw new Error(`${source} word ${english} has a bad pos`);
  if (value.length === 0) return undefined;
  return value;
}

function readSenses(value: unknown, source: string, english: string): WordSense[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const senses: WordSense[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)) continue;
    const record = item as { meaning_zh?: unknown; pos?: unknown; relation?: unknown };
    if (record.relation === "new_sense") continue;
    const pos = readPos(record.pos, source, english);
    const chinese = typeof record.meaning_zh === "string" ? record.meaning_zh.trim() : "";
    if (!chinese) continue;
    senses.push({ chinese, ...(pos ? { pos } : {}) });
  }
  return senses.length > 0 ? senses : undefined;
}

function displayPos(value: string | null | undefined): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  return value;
}

/**
 * Part of speech, then the Chinese meaning. No pos means the meaning alone, with no extra space.
 * A sense uses its own pos, and falls back to the word's pos when that sense has none.
 */
const POS_GLOSS: Record<string, string> = {
  "n.": "名词",
  "v.": "动词",
  "adj.": "形容词",
  "adv.": "副词",
  "pron.": "代词",
  "prep.": "介词",
  "conj.": "连词",
  "num.": "数词",
  "interj.": "感叹词",
  "art.": "冠词",
  "phr.": "短语",
  "modal v.": "情态动词",
};

/** Chinese name for a single pos token. Dual forms such as v./n. stay untranslated. */
export function posGloss(pos: string | null | undefined): string | undefined {
  if (!pos) return undefined;
  return POS_GLOSS[pos];
}

export function formatMeaning(
  word: { chinese: string; pos?: string | null },
  sense?: { chinese?: string; pos?: string | null },
): string {
  const chinese = sense?.chinese ? sense.chinese : word.chinese;
  const pos = sense ? displayPos(sense.pos) ?? displayPos(word.pos) : displayPos(word.pos);
  if (!pos) return chinese;
  return `${pos} ${chinese}`;
}

export function readWordFile(file: WordFile, source = "word file"): WordDef[] {
  if (!Array.isArray(file.words)) throw new Error(`${source} needs a words array`);
  const theme = file.theme?.trim() || SAMPLE_THEME;
  const sample = file.sample !== false;
  return file.words.map((entry) => {
    const english = typeof entry.word === "string" ? entry.word.trim().toLowerCase() : "";
    if (!english || typeof entry.meaning_zh !== "string" || !entry.meaning_zh.trim()) {
      throw new Error(`${source} has a word entry missing word or meaning_zh`);
    }
    if (!isGrade(entry.grade_est) || !isSpelling(entry.spelling)) {
      throw new Error(`${source} word ${english} has a bad grade or spelling`);
    }
    const pos = readPos(entry.pos, source, english);
    const senses = readSenses(entry.senses, source, english);
    const grade = GRADE_OF[entry.grade_est];
    return {
      id: english,
      english,
      chinese: entry.meaning_zh.trim(),
      ...(pos ? { pos } : {}),
      ...(senses ? { senses } : {}),
      gradeEst: entry.grade_est,
      grade,
      spelling: entry.spelling,
      theme,
      unitId: `${grade}-S1-U1`,
      sample,
    };
  });
}

/** Merges every list. Adding a JSON file does not require a code change. Duplicate ids are refused. */
export function mergeWordFiles(files: Record<string, WordFile>): WordDef[] {
  const merged: WordDef[] = [];
  const seen = new Map<string, string>();
  for (const path of Object.keys(files).sort()) {
    const file = files[path];
    if (!file) continue;
    for (const word of readWordFile(file, path)) {
      const previous = seen.get(word.id);
      if (previous) throw new Error(`Word ${word.id} is in both ${previous} and ${path}`);
      seen.set(word.id, path);
      merged.push(word);
    }
  }
  return merged;
}

interface WordGlob {
  glob(pattern: string, options: { eager: true; import: "default" }): Record<string, WordFile>;
}

function isWordFile(file: unknown): file is WordFile {
  return typeof file === "object" && file !== null && Array.isArray((file as WordFile).words);
}

interface ForestChapterFile {
  word_refs_formal: string[];
  chapter_extra_words: WordFileEntry[];
  stages: { id: number; word_refs: string[] }[];
}

const forestChapter = forestChapterFile as ForestChapterFile;

/**
 * Word lists live only in this directory. A JSON file without a words array is
 * refused, which is why the forest chapter config stays in chapters/.
 */
const loadedFiles = (import.meta as unknown as WordGlob).glob("./data/**/*.json", { eager: true, import: "default" });
const wordFiles: Record<string, WordFile> = {};
for (const [path, file] of Object.entries(loadedFiles)) {
  if (!isWordFile(file)) throw new Error(`${path} needs a words array`);
  wordFiles[path] = file;
}

export const CATALOG_WORDS: WordDef[] = mergeWordFiles(wordFiles);
export const SAMPLE_WORDS: WordDef[] = CATALOG_WORDS.filter((word) => word.sample);

/** Chapter-only words. They resolve for this chapter and stay out of the grade pools. */
const CHAPTER_EXTRAS: WordDef[] = readWordFile(
  { theme: SAMPLE_THEME, sample: false, words: forestChapter.chapter_extra_words },
  "chapter_forest_v1.1.json",
);

const LIBRARY_IDS = new Set(CATALOG_WORDS.map((word) => word.id));
const EXTRA_BY_ID = new Map<string, WordDef>();
for (const extra of CHAPTER_EXTRAS) {
  if (LIBRARY_IDS.has(extra.id)) throw new Error(`chapter extra ${extra.id} is already in the word library`);
  if (EXTRA_BY_ID.has(extra.id)) throw new Error(`chapter extra ${extra.id} is repeated`);
  EXTRA_BY_ID.set(extra.id, extra);
}

const FORMAL_REFS = forestChapter.word_refs_formal;
for (const id of FORMAL_REFS) {
  if (!LIBRARY_IDS.has(id)) throw new Error(`forest ref ${id} is not in the word library`);
  if (EXTRA_BY_ID.has(id)) throw new Error(`forest ref ${id} collides with a chapter extra`);
}
const stageRefs = forestChapter.stages.flatMap((stage) => stage.word_refs);
if (new Set(stageRefs).size !== stageRefs.length) throw new Error("a forest word is in two stages");
for (const id of stageRefs) {
  const inLibrary = LIBRARY_IDS.has(id);
  const extra = EXTRA_BY_ID.has(id);
  if (inLibrary === extra) throw new Error(`stage word ${id} does not resolve to exactly one definition`);
}

export function chapterExtraWords(): WordDef[] {
  return CHAPTER_EXTRAS;
}

/** True for an id listed in the chapter file's chapter_extra_words array. */
export function isChapterExtra(id: string): boolean {
  return EXTRA_BY_ID.has(id);
}

/**
 * Forest lessons for the selected grades. Extra words whose own grade is off
 * still appear, on the first open lesson, because they always count.
 * Words after the forest set belong to later chapters, not these lessons.
 */
export function lessonUnits(grades: readonly string[] | undefined): UnitDef[] {
  const selected = new Set(normalizeGrades(grades));
  const units = forestLearnUnits().filter((unit) => selected.has(unit.grade));
  if (units.length === 0) return [];
  const shown = new Set(units.flatMap((unit) => unit.wordIds));
  const missing = CHAPTER_EXTRAS.map((word) => word.id).filter((id) => !shown.has(id));
  if (missing.length === 0 || !units[0]) return units;
  return [{ ...units[0], wordIds: [...units[0].wordIds, ...missing] }, ...units.slice(1)];
}

/**
 * Official library words of this grade that the forest chapter does not already teach.
 * File order. These are the words after the 28, not a second copy of that chapter.
 */
export function continuationWordIds(grade: GradeBand): string[] {
  const forest = new Set(chapterWords().map((word) => word.id));
  return CATALOG_WORDS.filter((word) => word.grade === grade && !forest.has(word.id)).map((word) => word.id);
}

export function listUnits(): UnitDef[] {
  const grades: GradeBand[] = ["G3", "G4", "G5", "G6"];
  const semesters: Semester[] = [1, 2];
  const units: UnitDef[] = [];
  for (const grade of grades) {
    for (const semester of semesters) {
      for (let index = 1; index <= 6; index += 1) {
        const id = `${grade}-S${semester}-U${index}`;
        // unitId is still hard-coded as grade-S1-U1, so a filled slot is that one unit.
        const words = CATALOG_WORDS.filter((word) => word.unitId === id);
        const sample = words.some((word) => word.sample);
        units.push({
          id,
          grade,
          semester,
          index,
          title: words.length > 0 ? words[0]!.theme : "待编写",
          status: sample ? "sample" : "planned",
          wordIds: words.map((word) => word.id),
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

/**
 * The forest chapter's 20 library refs plus its 8 extras, in stage order.
 * This is the playable lesson. It is not the grade pool.
 */
export function chapterWords(): WordDef[] {
  return stageRefs.map((id) => {
    const word = LIBRARY_IDS.has(id) ? CATALOG_WORDS.find((item) => item.id === id) : EXTRA_BY_ID.get(id);
    if (!word) throw new Error(`stage word ${id} is not in the catalog`);
    return word;
  });
}

/** Same list as chapterWords. Older call sites still use this name for the forest lesson. */
export function sampleWords(): WordDef[] {
  return chapterWords();
}

/** One school unit per grade that this chapter actually teaches. */
export function forestLearnUnits(): UnitDef[] {
  const groups = new Map<GradeBand, string[]>();
  for (const word of chapterWords()) {
    const ids = groups.get(word.grade) ?? [];
    ids.push(word.id);
    groups.set(word.grade, ids);
  }
  return GRADE_BANDS.flatMap((grade, index) => {
    const wordIds = groups.get(grade.id) ?? [];
    if (wordIds.length === 0) return [];
    return [{
      id: `forest-${grade.id}`,
      grade: grade.id,
      semester: 1 as Semester,
      index: index + 1,
      title: "森林冒险",
      status: "sample" as const,
      wordIds,
    }];
  });
}

export function catalogWords(): WordDef[] {
  return CATALOG_WORDS;
}

const GRADE_ORDER: GradeBand[] = ["G3", "G4", "G5", "G6"];

/** Shown on the grade picker, and on 给家长, while the selection is empty. */
export const GRADE_REQUIRED_NOTICE = "至少选一个年级";

/**
 * Keeps known grades, in order. An empty or missing choice stays empty.
 * The player has to pick at least one before learning or battle. Grade 3 is not filled in.
 */
export function normalizeGrades(input: readonly string[] | undefined): GradeBand[] {
  const picked = new Set(input ?? []);
  return GRADE_ORDER.filter((grade) => picked.has(grade));
}

/** Adds or removes one grade. Clearing the last grade stays empty. */
export function toggleGradeChoice(current: readonly string[] | undefined, grade: string): GradeBand[] {
  const selected = normalizeGrades(current);
  if (!GRADE_ORDER.includes(grade as GradeBand)) return selected;
  const next = selected.includes(grade as GradeBand)
    ? selected.filter((item) => item !== grade)
    : [...selected, grade];
  return normalizeGrades(next);
}

/** Continue stays off until at least one grade is selected. */
export function canConfirmGrades(grades: readonly string[] | undefined): boolean {
  return normalizeGrades(grades).length > 0;
}

/** Library words in the selected grades. Chapter-only extras are not included. */
export function wordsForGrades(grades: readonly string[] | undefined): WordDef[] {
  const selected = new Set(normalizeGrades(grades));
  return CATALOG_WORDS.filter((word) => selected.has(word.grade));
}

export function wordById(id: string): WordDef | undefined {
  return CATALOG_WORDS.find((word) => word.id === id) ?? EXTRA_BY_ID.get(id);
}

export function wordsInUnit(unitId: string): WordDef[] {
  const unit = unitById(unitId);
  if (!unit) return [];
  return unit.wordIds.map((id) => wordById(id)).filter((word): word is WordDef => Boolean(word));
}
