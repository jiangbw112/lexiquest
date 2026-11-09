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
  private grades: GradeBand[] = [];

  constructor() {
    super("create");
  }

  init(data: { grades?: readonly string[] } = {}): void {
    this.grades = normalizeGrades(data.grades);
  }

  create(): void {
    if (this.grades.length === 0) {
      this.scene.start("grades", { mode: "new" });
      return;
    }
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

  private draw(): void {
    this.children.removeAll(true);
    paper(this);
    const chosen = this.grades.map((id) => GRADE_BANDS.find((grade) => grade.id === id)?.label ?? id).join("、");
    this.add.text(180, 64, "给战士起名字", { fontFamily: FONT, fontSize: "40px", color: "#17352a" });
    this.add.text(180, 118, P0_NOTE, { fontFamily: FONT, fontSize: "18px", color: "#3d5c4e", wordWrap: { width: 700 } });
    this.add.text(180, 176, classById(P0_CLASS_ID).blurb, { fontFamily: FONT, fontSize: "18px", color: "#17352a", wordWrap: { width: 700 } });
    this.add.text(180, 470, `已选年级：${chosen}`, { fontFamily: FONT, fontSize: "24px", color: "#17352a" });
    this.add.text(180, 520, "名字在画面中间输入。Enter 出发。年级可以稍后在给家长里改。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: "#3d5c4e",
      wordWrap: { width: 760 },
    });
    this.add.text(180, 700, `${WARRIOR_ART_NOTE}。用键盘输入名字。`, {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#3d5c4e",
    });
    const hero = new WarriorSprite(this, 980, 280, 0.5);
    hero.play("idle");
    button(this, 270, 600, "重选年级", () => this.leave("grades"), { width: 180, fill: 0x5c6b62 });
  }
}
