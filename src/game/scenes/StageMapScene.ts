import Phaser from "phaser";
import { studyNow } from "../../domain/progress";
import {
  chapterDueCount,
  chapterLearnedCount,
  clearedStageCount,
  FOREST_CHAPTER,
  FOREST_WORD_COUNT,
  masteryLabel,
  stageStatuses,
  stageWordIds,
  stageWins,
  wordsUntilBoss,
  type StageStatus,
} from "../../domain/stages";
import { probeEnter, probeNote } from "../probe";
import { getSave } from "../session";
import { FONT, button, listenKeys, paper } from "../ui";

const STATUS_LABEL: Record<StageStatus, string> = {
  locked: "未开启",
  open: "进行中",
  cleared: "已通过",
  skipped: "已跳过",
};

export class StageMapScene extends Phaser.Scene {
  constructor() {
    super("stages");
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("title");
      return;
    }
    probeEnter("stages");
    listenKeys(this, (event) => {
      if (event.code === "Escape") this.scene.start("overworld");
      const index = Number(event.code.replace("Digit", "")) - 1;
      const stage = FOREST_CHAPTER.stages[index];
      if (stage) this.fight(stage.id);
    });
    this.draw();
  }

  private fight(stageId: number): void {
    const save = getSave();
    const stage = FOREST_CHAPTER.stages.find((item) => item.id === stageId);
    if (!save || !stage) return;
    const status = stageStatuses(save)[stage.id - 1];
    if (status !== "open" && status !== "cleared") return;
    probeNote(`stage:fight:${stage.id}`);
    this.scene.start("battle", { stageId: stage.id });
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    paper(this);
    const now = studyNow(save);
    const statuses = stageStatuses(save);
    this.add.text(140, 28, "森林冒险", { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
    this.add.text(140, 76, "学完森林 28 个单词，击败林心守护者，通关森林冒险。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#8a5a12",
    });
    this.add.text(
      140,
      112,
      `已学 ${chapterLearnedCount(save)}/${FOREST_WORD_COUNT}    已清关 ${clearedStageCount(save)}/5    掌握 ${masteryLabel(save, now)}`,
      { fontFamily: FONT, fontSize: "20px", color: "#17352a" },
    );
    this.add.text(140, 146, `本章到期 ${chapterDueCount(save, now)}    距林心守护还差 ${wordsUntilBoss(save)} 个所选年级的词`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#3d5c4e",
    });
    FOREST_CHAPTER.stages.forEach((stage, index) => {
      const status = statuses[index] ?? "locked";
      const y = 210 + index * 100;
      const ids = stageWordIds(save, stage);
      const learned = ids.filter((id) => save.wordCards[id]).length;
      this.add.text(160, y, `${stage.id}  ${stage.name_zh}`, { fontFamily: FONT, fontSize: "26px", color: "#17352a" });
      this.add.text(400, y + 4, STATUS_LABEL[status], { fontFamily: FONT, fontSize: "18px", color: "#8a5a12" });
      const detail = status === "skipped"
        ? "所选年级没有这一关的新词"
        : stage.type === "boss"
          ? `新词 ${learned}/${ids.length}`
          : `新词 ${learned}/${ids.length} · 小战斗 ${stageWins(save, stage.id)} 胜`;
      this.add.text(520, y + 4, detail, { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" });
      if (status === "open" || status === "cleared") {
        button(this, 860, y + 16, "去学堂", () => this.scene.start("learn"), { width: 130, height: 40, fill: 0x3d6ea8 });
        button(
          this,
          1020,
          y + 16,
          stage.type === "boss" ? "挑战" : status === "cleared" ? "再战" : "小战斗",
          () => this.fight(stage.id),
          { width: 130, height: 40, fill: stage.type === "boss" ? 0x1f7a4d : 0xc4533a },
        );
      }
    });
    button(this, 250, 730, "回村子 Esc", () => this.scene.start("overworld"), { width: 180, fill: 0x5c6b62 });
    probeNote("stages:ready");
  }
}
