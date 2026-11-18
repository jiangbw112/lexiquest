import { GRADE_BANDS, isChapterExtra, normalizeGrades, wordById } from "./catalog";
import { activeChapter, forestPlayChapter, isChapterCleared, isChapterUnlocked, type PlayChapter } from "./chapter-plan";
import { FOREST_CHAPTER, forestStudyWordIds, gradeForestStudyWordIds } from "./stages";
import type { GradeBand, SaveData } from "./types";

const GRADE_ORDER: readonly GradeBand[] = ["G3", "G4", "G5", "G6"];
const GRADE_SHORT: Record<GradeBand, string> = { G3: "三", G4: "四", G5: "五", G6: "六" };

/** 「四年级」 for one grade, 「四、六年级」 when several are selected. */
export function selectedGradesLabel(grades: readonly GradeBand[]): string {
  const ordered = GRADE_ORDER.filter((grade) => grades.includes(grade));
  if (ordered.length === 0) return "";
  return `${ordered.map((grade) => GRADE_SHORT[grade]).join("、")}年级`;
}

export function gradeLabel(grade: GradeBand): string {
  return GRADE_BANDS.find((band) => band.id === grade)?.label ?? grade;
}

/** Forest screens count the shared boss list. A later chapter counts its own words. */
export function studyWordIds(save: SaveData, chapter: PlayChapter): string[] {
  if (chapter.id === FOREST_CHAPTER.chapter_id) return forestStudyWordIds(save.selectedGrades);
  return [...chapter.wordIds];
}

export interface StudyBanner {
  title: string;
  encourage: string;
}

/**
 * The same two lines for the village, the map, and the parent page.
 * The chapter argument is the chapter that screen is about.
 */
export function studyBanner(save: SaveData, chapter: PlayChapter): StudyBanner {
  const ids = studyWordIds(save, chapter);
  const learned = ids.filter((id) => save.wordCards[id]).length;
  const total = ids.length;
  const forest = chapter.id === FOREST_CHAPTER.chapter_id;
  const selected = normalizeGrades(save.selectedGrades);
  let title: string;
  const grades = selectedGradesLabel(selected);
  if (total === 0) title = "这一章没有要学的新词。";
  else if (forest) title = grades
    ? `${grades} · ${chapter.name}：已学 ${learned}/${total} 个词`
    : `${chapter.name}：已学 ${learned}/${total} 个词`;
  else {
    const grade = chapter.grade === "mixed" ? selected[0] ?? "G3" : chapter.grade;
    title = `${gradeLabel(grade)} · ${chapter.name}：已学 ${learned}/${total} 个词`;
  }
  return { title, encourage: studyEncouragement(save, chapter, ids) };
}

function studyEncouragement(save: SaveData, chapter: PlayChapter, ids: readonly string[]): string {
  if (ids.length === 0) return "";
  const missing = ids.filter((id) => !save.wordCards[id]);
  const cleared = isChapterCleared(save, chapter);
  if (missing.length === 0) return cleared ? "这一章打完啦，真棒！" : "本章全学会了，真棒！";
  const forest = chapter.id === FOREST_CHAPTER.chapter_id;
  if (!forest && !isChapterUnlocked(save, chapter)) {
    return `还有 ${missing.length} 个没在学堂学过。对战里要先打完上一章。`;
  }
  let line = `还有 ${missing.length} 个没在学堂学过`;
  const formalGrades = GRADE_ORDER.filter((grade) =>
    missing.some((id) => !isChapterExtra(id) && wordById(id)?.grade === grade),
  );
  const selected = normalizeGrades(save.selectedGrades);
  const here: GradeBand | null = forest
    ? (selected.length === 1 ? selected[0]! : null)
    : (chapter.grade === "mixed" ? null : chapter.grade);
  if (formalGrades.length === 1 && formalGrades[0] !== here) line += `。去${gradeLabel(formalGrades[0]!)}学。`;
  return line;
}

/** Forest until that boss is beaten, then the chapter the save is standing in. */
export function villageStudyChapter(save: SaveData): PlayChapter {
  if (!isChapterCleared(save, forestPlayChapter())) return forestPlayChapter();
  return activeChapter(save);
}

/** Button caption on the academy chapter list. */
export function academyProgressLabel(save: SaveData, chapter: PlayChapter): string {
  if (chapter.id === FOREST_CHAPTER.chapter_id && chapter.grade !== "mixed") {
    const all = gradeForestStudyWordIds(chapter.grade);
    const formal = all.filter((id) => !isChapterExtra(id));
    const common = all.filter((id) => isChapterExtra(id));
    const formalDone = formal.filter((id) => save.wordCards[id]).length;
    const commonDone = common.filter((id) => save.wordCards[id]).length;
    if (all.length > 0 && formalDone === formal.length && commonDone === common.length) return "已学完";
    return `${gradeLabel(chapter.grade)}词 ${formalDone}/${formal.length} · 共用 ${commonDone}/${common.length}`;
  }
  if (chapter.wordIds.length === 0) return "";
  const done = chapter.wordIds.filter((id) => save.wordCards[id]).length;
  if (done === chapter.wordIds.length) return "已学完";
  return `${done}/${chapter.wordIds.length}`;
}

export interface NamedWord {
  id: string;
  english: string;
  chinese: string;
  grade: GradeBand;
  extra: boolean;
}

export function namedWords(ids: readonly string[]): NamedWord[] {
  const words: NamedWord[] = [];
  for (const id of ids) {
    const word = wordById(id);
    if (!word) continue;
    words.push({
      id,
      english: word.english,
      chinese: word.chinese,
      grade: word.grade,
      extra: isChapterExtra(id),
    });
  }
  return words;
}

export function wordLine(words: readonly NamedWord[]): string {
  return words.map((word) => `${word.english} ${word.chinese}`).join("、");
}

/**
 * Keep the missing-word list short enough that the buttons under it stay on screen.
 * A cut list ends with how many words were left off.
 */
export function clipMissingWords(lines: readonly string[], maxChars: number): string[] {
  const words = lines.flatMap((line) => line.split("、").filter((part) => part.length > 0));
  if (words.length === 0) return [];
  const full = words.join("、");
  if ([...full].length <= maxChars) return [full];
  const kept: string[] = [];
  for (const word of words) {
    const next = kept.length === 0 ? word : `${kept.join("、")}、${word}`;
    if ([...next].length > maxChars) break;
    kept.push(word);
  }
  const hidden = words.length - kept.length;
  const rest = `还有 ${hidden} 个没在学堂学过`;
  return kept.length > 0 ? [kept.join("、"), rest] : [rest];
}

/** Grade the shared extras attach to when they still need a card. */
export function hostGrade(save: SaveData): GradeBand {
  const selected = normalizeGrades(save.selectedGrades);
  const current = save.learnSelection?.grade;
  if (current && current !== "mixed" && selected.includes(current)) return current;
  return selected[0] ?? "G3";
}

export interface GradePractice {
  grade: GradeBand;
  wordIds: string[];
  label: string;
  line: string;
}

/**
 * One academy entry per grade that still has boss-gate words.
 * Formal words stay with their own grade. Shared extras sit with the chapter being studied.
 */
export function gradePracticeEntries(save: SaveData, missing: readonly NamedWord[]): GradePractice[] {
  const selected = normalizeGrades(save.selectedGrades);
  const buckets = new Map<GradeBand, NamedWord[]>();
  const take = (grade: GradeBand): NamedWord[] => {
    const found = buckets.get(grade);
    if (found) return found;
    const created: NamedWord[] = [];
    buckets.set(grade, created);
    return created;
  };
  for (const word of missing) {
    if (word.extra) continue;
    if (selected.length > 0 && !selected.includes(word.grade)) continue;
    take(word.grade).push(word);
  }
  const extras = missing.filter((word) => word.extra);
  if (extras.length > 0) {
    const grade = selected.includes(hostGrade(save)) ? hostGrade(save) : selected[0];
    if (grade) take(grade).push(...extras);
  }
  const grades = GRADE_ORDER.filter((grade) => (buckets.get(grade)?.length ?? 0) > 0);
  return grades.map((grade) => {
    const words = buckets.get(grade) ?? [];
    return {
      grade,
      wordIds: words.map((word) => word.id),
      label: grades.length === 1 ? "去学堂学" : `去${gradeLabel(grade)}学`,
      line: wordLine(words),
    };
  });
}

/** Settlement line when this forest lesson is done and another grade still has boss words. */
export function otherGradeForestLine(here: GradeBand, groups: readonly GradePractice[]): string {
  const bits = groups.map((group) => {
    const english = group.wordIds.map((id) => wordById(id)?.english ?? id).join("、");
    return `${gradeLabel(group.grade)} ${group.wordIds.length} 个：${english}`;
  });
  const first = groups[0];
  const next = first ? gradeLabel(first.grade) : "";
  return `${gradeLabel(here)}的词学完了。还差${bits.join("。还差")}。去${next}的森林冒险。`;
}
