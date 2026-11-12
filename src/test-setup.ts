import { readFileSync } from "node:fs";
import { installChapterPlan } from "./domain/chapter-plan";

const chapters = JSON.parse(readFileSync(new URL("./domain/chapters/chapters_v0.2.json", import.meta.url), "utf8"));
const gloss = JSON.parse(readFileSync(new URL("./domain/chapters/gloss_overlap_pairs_v0.2.json", import.meta.url), "utf8"));
installChapterPlan(chapters, gloss);
