import Phaser from "phaser";
import { createSave } from "../../domain/progress";
import { sanitizeName } from "../../domain/appearance";
import { classById } from "../../domain/classes";
import { P0_APPEARANCE, P0_CLASS_ID, P0_NOTE, PLACEHOLDER_NOTE } from "../p0";
import { probeEnter } from "../probe";
import { commit } from "../session";
import { FONT, button, paper } from "../ui";
import { LayeredActor } from "../actors";

export class CreateScene extends Phaser.Scene {
  constructor() {
    super("create");
  }

  create(): void {
    probeEnter("create");
    paper(this);
    this.add.text(180, 70, "给战士起名字", { fontFamily: FONT, fontSize: "40px", color: "#17352a" });
    this.add.text(180, 130, P0_NOTE, { fontFamily: FONT, fontSize: "20px", color: "#3d5c4e", wordWrap: { width: 560 } });
    this.add.text(180, 210, classById(P0_CLASS_ID).blurb, { fontFamily: FONT, fontSize: "18px", color: "#17352a", wordWrap: { width: 520 } });
    this.add.text(180, 690, `${PLACEHOLDER_NOTE}。用键盘输入名字，Enter 出发。`, { fontFamily: FONT, fontSize: "16px", color: "#3d5c4e" });
    const hero = new LayeredActor(this, 900, 560, "side");
    hero.applyOutfit("traveler");
    button(this, 300, 620, "返回", () => this.leave("title"), { width: 160, fill: 0x5c6b62 });
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
      commit(createSave({ name, classId: P0_CLASS_ID, appearance: P0_APPEARANCE, now: Date.now() }));
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
}
