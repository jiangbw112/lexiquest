/**
 * Exam atlases stay out of BootScene. The map and the exam fight load them.
 * Compass files are queued only for exam_g6_s2_final.
 */
import type Phaser from "phaser";
import { examShowsCompass, type ExamDef } from "../../domain/exams";
import type { GradeBand } from "../../domain/types";

export type ExamPose = "idle" | "attack" | "hit" | "defeat";

export interface ExamAtlas {
  key: string;
  imageUrl: string;
  dataUrl: string;
}

export interface ExamLayer {
  key: string;
  /** Null plays every frame. A pose keeps frames whose names contain `_pose_`. */
  pose: ExamPose | null;
}

const POSES: readonly ExamPose[] = ["idle", "attack", "hit", "defeat"];

export const EXAM_UI_KEY = "atlas_exam_ui";

export function examUiAtlas(): ExamAtlas {
  return {
    key: EXAM_UI_KEY,
    imageUrl: "/assets/exam/ui/atlas_exam_ui.png",
    dataUrl: "/assets/exam/ui/atlas_exam_ui.json",
  };
}

export function examBackground(kind: ExamDef["kind"]): { key: string; url: string } {
  const name = kind === "mid" ? "bg_exam_midterm_battle_2x" : "bg_exam_final_battle_2x";
  return { key: name, url: `/assets/exam/bg/${name}.webp` };
}

function gradeNo(grade: GradeBand): number {
  return Number(grade.slice(1));
}

function badgeHex(grade: GradeBand): string {
  if (grade === "G5") return "EECF83";
  if (grade === "G6") return "EAC670";
  return "EBC873";
}

function cloakHex(grade: GradeBand): string {
  if (grade === "G4") return "21786D";
  if (grade === "G6") return "316E60";
  return "379786";
}

function atlas(dir: string, name: string): ExamAtlas {
  return {
    key: name,
    imageUrl: `${dir}/${name}@2x.png`,
    dataUrl: `${dir}/${name}@2x.json`,
  };
}

function midDir(grade: GradeBand): string {
  return `/assets/exam/midterm/boss/exam_midterm/g${gradeNo(grade)}/v0.1/atlas`;
}

function midShared(): string {
  return "/assets/exam/midterm/boss/exam_midterm/shared/v0.1/atlas";
}

function finalDir(grade: GradeBand): string {
  return `/assets/exam/final/boss/exam_final/g${gradeNo(grade)}/v0.1/atlas`;
}

function finalShared(): string {
  return "/assets/exam/final/boss/exam_final/shared/v0.1/atlas";
}

export function examAtlases(exam: ExamDef): ExamAtlas[] {
  const list: ExamAtlas[] = [examUiAtlas()];
  if (exam.kind === "mid") {
    const g = gradeNo(exam.grade);
    for (const pose of POSES) list.push(atlas(midDir(exam.grade), `boss_exam_midterm_g${g}_w_${pose}`));
    list.push(atlas(midShared(), "boss_exam_midterm_shared_glow_w"));
    list.push(atlas(midShared(), `boss_exam_midterm_shared_badge_${badgeHex(exam.grade)}_w`));
    list.push(atlas(midShared(), "fx_exam_midterm_shared_w_phasechange"));
    return list;
  }
  const g = gradeNo(exam.grade);
  const cloak = cloakHex(exam.grade);
  const gold = badgeHex(exam.grade);
  for (const pose of POSES) {
    list.push(atlas(finalDir(exam.grade), `boss_exam_final_g${g}_w_${pose}`));
    list.push(atlas(finalShared(), `boss_exam_final_shared_cloak_${cloak}_w_${pose}`));
    list.push(atlas(finalShared(), `boss_exam_final_shared_cloak_gold_${gold}_w_${pose}`));
    list.push(atlas(finalShared(), `boss_exam_final_shared_cover_gold_p1_${gold}_w_${pose}`));
    list.push(atlas(finalShared(), `boss_exam_final_shared_cover_gold_p3_${gold}_w_${pose}`));
  }
  list.push(atlas(finalShared(), `boss_exam_final_shared_crown_base_${gold}_w`));
  list.push(atlas(finalShared(), `boss_exam_final_shared_crown_enhanced_${gold}_w`));
  if (examShowsCompass(exam.id)) list.push(atlas(finalDir(exam.grade), "boss_exam_final_g6_compass_w"));
  list.push(atlas(finalShared(), "fx_exam_final_shared_w_phasechange12"));
  list.push(atlas(finalShared(), "fx_exam_final_shared_w_phasechange23"));
  return list;
}

/** Back to front. Phase numbers are 1-based. Compass is not included for any other exam. */
export function examLayers(exam: ExamDef, phase: number, pose: ExamPose): ExamLayer[] {
  if (exam.kind === "mid") {
    const g = gradeNo(exam.grade);
    const layers: ExamLayer[] = [{ key: `boss_exam_midterm_g${g}_w_${pose}`, pose }];
    if (phase >= 2) layers.push({ key: "boss_exam_midterm_shared_glow_w", pose });
    layers.push({ key: `boss_exam_midterm_shared_badge_${badgeHex(exam.grade)}_w`, pose });
    return layers;
  }
  const g = gradeNo(exam.grade);
  const cloak = cloakHex(exam.grade);
  const gold = badgeHex(exam.grade);
  const cover = phase >= 3 ? "p3" : "p1";
  const crown = phase >= 3 ? "enhanced" : "base";
  const layers: ExamLayer[] = [
    { key: `boss_exam_final_shared_cloak_${cloak}_w_${pose}`, pose },
    { key: `boss_exam_final_g${g}_w_${pose}`, pose },
  ];
  if (phase >= 2) layers.splice(1, 0, { key: `boss_exam_final_shared_cloak_gold_${gold}_w_${pose}`, pose });
  layers.push({ key: `boss_exam_final_shared_cover_gold_${cover}_${gold}_w_${pose}`, pose });
  layers.push({ key: `boss_exam_final_shared_crown_${crown}_${gold}_w`, pose });
  if (examShowsCompass(exam.id)) layers.push({ key: "boss_exam_final_g6_compass_w", pose });
  return layers;
}

export function examPhaseFxKey(exam: ExamDef, fromPhase: number): string | null {
  if (fromPhase < 1) return null;
  if (exam.kind === "mid") return "fx_exam_midterm_shared_w_phasechange";
  if (fromPhase === 1) return "fx_exam_final_shared_w_phasechange12";
  if (fromPhase === 2) return "fx_exam_final_shared_w_phasechange23";
  return null;
}

export function queueExamUi(scene: Phaser.Scene): void {
  const atlasFile = examUiAtlas();
  if (scene.textures.exists(atlasFile.key)) return;
  scene.load.atlas(atlasFile.key, atlasFile.imageUrl, atlasFile.dataUrl);
}

export function queueExamArt(scene: Phaser.Scene, exam: ExamDef): void {
  queueExamUi(scene);
  const bg = examBackground(exam.kind);
  if (!scene.textures.exists(bg.key)) scene.load.image(bg.key, bg.url);
  for (const file of examAtlases(exam)) {
    if (file.key === EXAM_UI_KEY || scene.textures.exists(file.key)) continue;
    scene.load.atlas(file.key, file.imageUrl, file.dataUrl);
  }
}
