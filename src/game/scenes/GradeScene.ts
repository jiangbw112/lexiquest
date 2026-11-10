import Phaser from "phaser";
import { GRADE_BANDS, GRADE_REQUIRED_NOTICE, canConfirmGrades, toggleGradeChoice } from "../../domain/catalog";
import { uiLabel } from "../../domain/ui-label";
import { needsGradeChoice, setSelectedGrades } from "../../domain/progress";
import type { GradeBand } from "../../domain/types";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, listenKeys } from "../ui";
import { warmButton, warmChip, warmPanel } from "../warm/kit";
import { warmBackground } from "../warm/load";
import { ERR_TEXT, FONT_TITLE, INK, MUTED } from "../warm/theme";

export type GradeLaunchMode = "new" | "migrate" | "ask-parent";

/** First step for a new save, and the gate for a save that is already missing a grade. */
export class GradeScene extends Phaser.Scene {
  private mode: GradeLaunchMode = "new";
  private grades: GradeBand[] = [];

  constructor() {
    super("grades");
  }

  init(data: { mode?: GradeLaunchMode } = {}): void {
    this.mode = data.mode === "migrate" || data.mode === "ask-parent" ? data.mode : "new";
    this.grades = [];
  }

  create(): void {
    const gated = this.mode === "migrate" || this.mode === "ask-parent";
    if (gated && !getSave()) {
      this.scene.start("title");
      return;
    }
    if (gated && getSave() && !needsGradeChoice(getSave()!)) {
      this.scene.start("overworld");
      return;
    }
    probeEnter("grades");
    probeNote(`grade:mode:${this.mode}`);
    probeNote(`grades:${this.grades.join(",") || "none"}`);
    listenKeys(this, (event) => {
      if (this.mode === "ask-parent") {
        if (event.code === "Escape") this.scene.start("title");
        if (event.code === "Enter") this.scene.start("guide");
        return;
      }
      const index = ["Digit3", "Digit4", "Digit5", "Digit6"].indexOf(event.code);
      if (index >= 0) this.toggle(GRADE_BANDS[index]!.id);
      if (event.code === "Enter") this.confirm();
      if (event.code === "Escape" && this.mode === "new") this.scene.start("title");
    });
    this.draw();
  }

  private toggle(grade: GradeBand): void {
    this.grades = toggleGradeChoice(this.grades, grade);
    probeNote(`grades:${this.grades.join(",") || "none"}`);
    this.draw();
  }

  private confirm(): void {
    if (!canConfirmGrades(this.grades)) {
      probeNote("grade:blocked");
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
    warmBackground(this, "bg_home");
    this.add.image(640, 71, "logo_title").setDisplaySize(310, 118);
    warmPanel(this, 640, 420, 980, 560);
    if (this.mode === "ask-parent") {
      this.add.text(180, 220, "请家长选年级", { fontFamily: FONT, fontSize: "40px", color: INK });
      this.add.text(180, 300, "年级已经在家长页清空了。请家长打开家长页，输入密码后再选。这一页不能改年级。", {
        fontFamily: FONT,
        fontSize: "20px",
        color: INK,
        wordWrap: { width: 900 },
      });
      warmButton(this, 360, 480, "去给家长", () => this.scene.start("guide"), { width: 220 });
      warmButton(this, 640, 480, uiLabel("返回"), () => this.scene.start("title"), { width: 160, tone: "secondary" });
      return;
    }
    const migrating = this.mode === "migrate";
    this.add.text(180, 180, migrating ? uiLabel("这台存档还没选年级") : uiLabel("先选年级"), {
      fontFamily: FONT_TITLE,
      fontSize: "40px",
      color: INK,
    });
    this.add.text(180, 248, migrating
      ? "以前的存档没有年级。先选三到六年级里的一个或几个，再进村子。学堂和对战在选完之前打不开。"
      : "新的冒险从选年级开始。三到六年级可以多选。选好以后再起名字。", {
      fontFamily: FONT,
      fontSize: "20px",
      color: INK,
      wordWrap: { width: 900 },
    });
    GRADE_BANDS.forEach((grade, index) => {
      const on = this.grades.includes(grade.id);
      warmChip(this, 280 + index * 210, 360, grade.label, on, () => this.toggle(grade.id), { width: 190 });
    });
    this.add.text(180, 420, "键盘 3、4、5、6 切换年级。Enter 确认。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: MUTED,
    });
    const ready = canConfirmGrades(this.grades);
    const chosen = this.grades.map((id) => GRADE_BANDS.find((grade) => grade.id === id)?.label).join("、");
    this.add.text(180, 470, ready ? `已选 ${chosen}。` : GRADE_REQUIRED_NOTICE, {
      fontFamily: FONT,
      fontSize: "20px",
      color: ready ? INK : ERR_TEXT,
      wordWrap: { width: 900 },
    });
    warmButton(this, 360, 560, uiLabel(migrating ? "选好了，继续" : "选好了，去起名字"), () => this.confirm(), {
      width: 280,
      disabled: !ready,
    });
    if (!migrating) {
      warmButton(this, 700, 560, uiLabel("返回"), () => this.scene.start("title"), { width: 160, tone: "secondary" });
    }
  }
}
