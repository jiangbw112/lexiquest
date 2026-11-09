import Phaser from "phaser";
import { GRADE_BANDS, normalizeGrades } from "../../domain/catalog";
import { createSave } from "../../domain/progress";
import { sanitizeName } from "../../domain/appearance";
import { classById } from "../../domain/classes";
import type { GradeBand } from "../../domain/types";
import { WarriorSprite } from "../art/warrior-sprite";
import { P0_APPEARANCE, P0_CLASS_ID, P0_NOTE, WARRIOR_ART_NOTE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { commit } from "../session";
import { FONT, button, paper } from "../ui";

export class CreateScene extends Phaser.Scene {
  private grades: GradeBand[] = ["G3"];
  private notice = "默认三年级。可以再点其他年级。";

  constructor() {
    super("create");
  }

  create(): void {
    probeEnter("create");
    this.draw();
    probeNote(`grades:${this.grades.join(",")}`);
    const form = document.getElementById("name-form");
    const input = document.getElementById("hero-name");
    const error = document.getElementById("name-error");
    form?.classList.add("open");
    if (input instanceof HTMLInputElement) {
      input.value = "";
      window.setTimeout(() => input.focus(), 30);
    }
    if (error) error.textContent = "";
    const submit = (event: Event) => {
      event.preventDefault();
      const name = input instanceof HTMLInputElement ? sanitizeName(input.value) : null;
      if (!name) {
        if (error) error.textContent = "名字用 1 到 12 个字。";
        return;
      }
      commit(createSave({ name, classId: P0_CLASS_ID, appearance: P0_APPEARANCE, now: Date.now(), grades: this.grades }));
      this.leave("overworld");
    };
    form?.addEventListener("submit", submit);
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      form?.classList.remove("open");
    });
  }

  private leave(scene: string): void {
    document.getElementById("name-form")?.classList.remove("open");
    this.scene.start(scene);
  }

  private toggle(grade: GradeBand): void {
    if (this.grades.includes(grade)) {
      const next = this.grades.filter((item) => item !== grade);
      if (next.length === 0) {
        this.grades = ["G3"];
        this.notice = "至少选一个年级。现在留下三年级。";
      } else {
        this.grades = next;
        this.notice = "";
      }
    } else {
      this.grades = normalizeGrades([...this.grades, grade]);
      this.notice = "";
    }
    this.draw();
    probeNote(`grades:${this.grades.join(",")}`);
  }

  private draw(): void {
    this.children.removeAll(true);
    paper(this);
    this.add.text(180, 64, "给战士起名字", { fontFamily: FONT, fontSize: "40px", color: "#17352a" });
    this.add.text(180, 118, P0_NOTE, { fontFamily: FONT, fontSize: "18px", color: "#3d5c4e", wordWrap: { width: 700 } });
    this.add.text(180, 176, classById(P0_CLASS_ID).blurb, { fontFamily: FONT, fontSize: "18px", color: "#17352a", wordWrap: { width: 700 } });
    this.add.text(180, 470, "学习年级，可以多选", { fontFamily: FONT, fontSize: "24px", color: "#17352a" });
    GRADE_BANDS.forEach((grade, index) => {
      const on = this.grades.includes(grade.id);
      button(this, 280 + index * 190, 540, `${on ? "✓ " : ""}${grade.label}`, () => this.toggle(grade.id), {
        width: 170,
        fill: on ? 0x1f7a4d : 0x5c6b62,
      });
    });
    this.add.text(180, 590, this.notice || "名字在画面中间输入。至少要留一个年级。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
      wordWrap: { width: 760 },
    });
    this.add.text(180, 700, `${WARRIOR_ART_NOTE}。用键盘输入名字，Enter 出发。以后可以在给家长里改年级。`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#3d5c4e",
    });
    const hero = new WarriorSprite(this, 980, 280, 0.5);
    hero.play("idle");
    button(this, 180, 640, "返回", () => this.leave("title"), { width: 140, fill: 0x5c6b62 });
  }
}
