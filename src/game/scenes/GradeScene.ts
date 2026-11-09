import Phaser from "phaser";
import { GRADE_BANDS, normalizeGrades } from "../../domain/catalog";
import { needsGradeChoice, setSelectedGrades } from "../../domain/progress";
import type { GradeBand } from "../../domain/types";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, listenKeys, paper } from "../ui";

export type GradeLaunchMode = "new" | "migrate";

/** First step for a new save, and the gate for an older save that never picked a grade. */
export class GradeScene extends Phaser.Scene {
  private mode: GradeLaunchMode = "new";
  private grades: GradeBand[] = [];
  private blocked = false;
  private notice = "可以多选。至少选一个，才能去学堂和对战。这里不替你选三年级。";

  constructor() {
    super("grades");
  }

  init(data: { mode?: GradeLaunchMode } = {}): void {
    this.mode = data.mode === "migrate" ? "migrate" : "new";
    this.grades = [];
    this.blocked = false;
    this.notice = "可以多选。至少选一个，才能去学堂和对战。这里不替你选三年级。";
  }

  create(): void {
    if (this.mode === "migrate" && !getSave()) {
      this.scene.start("title");
      return;
    }
    if (this.mode === "migrate" && getSave() && !needsGradeChoice(getSave()!)) {
      this.scene.start("overworld");
      return;
    }
    probeEnter("grades");
    probeNote(`grade:mode:${this.mode}`);
    probeNote(`grades:${this.grades.join(",") || "none"}`);
    listenKeys(this, (event) => {
      const index = ["Digit3", "Digit4", "Digit5", "Digit6"].indexOf(event.code);
      if (index >= 0) this.toggle(GRADE_BANDS[index]!.id);
      if (event.code === "Enter") this.confirm();
      if (event.code === "Escape" && this.mode === "new") this.scene.start("title");
    });
    this.draw();
  }

  private toggle(grade: GradeBand): void {
    this.grades = this.grades.includes(grade)
      ? this.grades.filter((item) => item !== grade)
      : normalizeGrades([...this.grades, grade]);
    this.blocked = false;
    this.notice = this.grades.length === 0
      ? "还没选年级。学堂和对战会等到你选完。"
      : "";
    probeNote(`grades:${this.grades.join(",") || "none"}`);
    this.draw();
  }

  private confirm(): void {
    if (this.grades.length === 0) {
      this.blocked = true;
      this.notice = "至少选一个年级，才能去学堂和对战。";
      probeNote("grade:blocked");
      this.draw();
      return;
    }
    const picked = [...this.grades];
    probeNote(`grade:picked:${picked.join(",")}`);
    if (this.mode === "migrate") {
      mutate((save) => setSelectedGrades(save, picked));
      this.scene.start("overworld");
      return;
    }
    this.scene.start("create", { grades: picked });
  }

  private draw(): void {
    this.children.removeAll(true);
    paper(this);
    const migrating = this.mode === "migrate";
    this.add.text(180, 72, migrating ? "这台存档还没选年级" : "先选年级", {
      fontFamily: FONT,
      fontSize: "40px",
      color: "#17352a",
    });
    this.add.text(180, 140, migrating
      ? "以前的存档没有年级。先选三到六年级里的一个或几个，再进村子。学堂和对战在选完之前打不开。"
      : "新的冒险从选年级开始。三到六年级可以多选。选好以后再起名字。", {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#3d5c4e",
      wordWrap: { width: 900 },
    });
    GRADE_BANDS.forEach((grade, index) => {
      const on = this.grades.includes(grade.id);
      button(this, 250 + index * 220, 280, `${on ? "✓ " : ""}${grade.label}`, () => this.toggle(grade.id), {
        width: 190,
        height: 64,
        fill: on ? 0x1f7a4d : 0x5c6b62,
      });
    });
    this.add.text(180, 360, "键盘 3、4、5、6 切换年级。Enter 确认。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#8a5a12",
    });
    this.add.text(180, 410, this.notice || `已选 ${this.grades.map((id) => GRADE_BANDS.find((grade) => grade.id === id)?.label).join("、")}。`, {
      fontFamily: FONT,
      fontSize: "20px",
      color: this.blocked ? "#a33b24" : "#17352a",
      wordWrap: { width: 900 },
    });
    button(this, 360, 520, migrating ? "选好了，继续" : "选好了，去起名字", () => this.confirm(), {
      width: 280,
      height: 56,
      fill: this.grades.length === 0 ? 0x5c6b62 : 0x1f7a4d,
    });
    if (!migrating) {
      button(this, 700, 520, "返回", () => this.scene.start("title"), { width: 160, height: 56, fill: 0x5c6b62 });
    }
  }
}
