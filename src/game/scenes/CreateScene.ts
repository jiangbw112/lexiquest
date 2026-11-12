import Phaser from "phaser";
import { GRADE_BANDS, normalizeGrades } from "../../domain/catalog";
import { CLASSES } from "../../domain/classes";
import {
  INVENTOR_LOCK_NOTE,
  INVENTOR_LOCK_TIP,
  INVENTOR_LOCK_TIP_BUTTON,
  INVENTOR_LOCK_TITLE,
  isClassUnlocked,
  resolvedClassId,
  selectClass,
} from "../../domain/class-unlock";
import { createSave } from "../../domain/progress";
import { sanitizeName } from "../../domain/appearance";
import type { ClassId, GradeBand } from "../../domain/types";
import { PORTRAIT_LOCKED_ATLAS, PORTRAIT_LOCKED_FRAME, portraitFrame } from "../art/class-atlas";
import { queueClassPortraits } from "../art/class-load";
import { cjkWrap } from "../layout";
import { P0_APPEARANCE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { commit, getSave } from "../session";
import { FONT, listenKeys, paper } from "../ui";
import { warmButton, warmPanel } from "../warm/kit";
import { paintRoom, queueWarm } from "../warm/load";
import { INK, MUTED } from "../warm/theme";

const CARD_KEYS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"];

export class CreateScene extends Phaser.Scene {
  private grades: GradeBand[] = [];
  private classId: ClassId = "warrior";
  private lockTip = false;

  constructor() {
    super("create");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core"], ["bg_room"]);
    queueClassPortraits(this);
  }

  init(data: { grades?: readonly string[] } = {}): void {
    this.grades = normalizeGrades(data.grades);
    this.classId = "warrior";
    this.lockTip = false;
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
      const classId = resolvedClassId(this.classId, getSave());
      commit(createSave({ name, classId, appearance: P0_APPEARANCE, now: Date.now(), grades: this.grades }));
      probeNote(`class:${this.classId}`);
      this.leave("overworld");
    };
    form?.addEventListener("submit", submit);
    listenKeys(this, (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const index = CARD_KEYS.indexOf(event.code);
      if (index < 0) return;
      this.pick(CLASSES[index].id);
    });
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      form?.classList.remove("open");
    });
  }

  private pick(id: ClassId): void {
    const save = getSave();
    const next = selectClass(this.classId, id, save);
    if (next === this.classId) {
      if (!isClassUnlocked(id, save)) {
        this.lockTip = true;
        this.draw();
      }
      return;
    }
    this.classId = next;
    this.lockTip = false;
    this.draw();
  }

  private leave(scene: string): void {
    document.getElementById("name-form")?.classList.remove("open");
    this.scene.start(scene);
  }

  private draw(): void {
    this.children.removeAll(true);
    if (!paintRoom(this)) paper(this);
    warmPanel(this, 640, 400, 1040, 740);
    const progress = getSave();
    CLASSES.forEach((def, index) => {
      const cx = 124 + index * 206;
      const unlocked = isClassUnlocked(def.id, progress);
      const selected = unlocked && def.id === this.classId;
      const box = this.add.rectangle(cx, 132, 196, 220, unlocked ? 0xfff4dc : 0xc8bfb0, selected ? 0.96 : 0.55);
      box.setStrokeStyle(selected ? 6 : 2, selected ? 0xc4533a : 0x3b2a20);
      const portrait = unlocked
        ? this.add.image(cx, 118, "cls:portraits", portraitFrame(def.id, "side"))
        : this.add.image(cx, 118, PORTRAIT_LOCKED_ATLAS, PORTRAIT_LOCKED_FRAME);
      portrait.setOrigin(0.5, 0.875);
      portrait.setScale(0.18);
      this.add.text(cx, 148, unlocked ? `${index + 1} ${def.name}` : INVENTOR_LOCK_TITLE, {
        fontFamily: FONT,
        fontSize: unlocked ? "20px" : "18px",
        color: unlocked ? INK : MUTED,
      }).setOrigin(0.5, 0);
      this.add.text(cx, 176, unlocked ? def.blurb : INVENTOR_LOCK_NOTE, {
        fontFamily: FONT,
        fontSize: unlocked ? "14px" : "13px",
        color: MUTED,
        align: "center",
        wordWrap: cjkWrap(176),
      }).setOrigin(0.5, 0);
      const zone = this.add.zone(cx, 132, 196, 220).setInteractive({ useHandCursor: true });
      zone.on("pointerdown", () => this.pick(def.id));
      if (!unlocked) return;
    });
    const chosen = this.grades.map((id) => GRADE_BANDS.find((grade) => grade.id === id)?.label ?? id).join("、");
    this.add.text(160, 320, "选一个职业", { fontFamily: FONT, fontSize: "32px", color: INK });
    this.add.text(160, 368, "按 1 到 6，或点一张卡片。名字在右边输入。", {
      fontFamily: FONT,
      fontSize: "18px",
      color: MUTED,
      wordWrap: cjkWrap(280),
    });
    if (this.lockTip) {
      this.add.text(160, 408, INVENTOR_LOCK_TIP, {
        fontFamily: FONT,
        fontSize: "15px",
        color: INK,
        wordWrap: cjkWrap(270),
      });
      warmButton(this, 250, 530, INVENTOR_LOCK_TIP_BUTTON, () => {
        this.lockTip = false;
        this.draw();
      }, { width: 120, height: 44 });
    }
    this.add.text(160, this.lockTip ? 578 : 500, `已选年级：${chosen}`, { fontFamily: FONT, fontSize: "22px", color: INK });
    if (!this.lockTip) {
      this.add.text(160, 548, "Enter 出发。年级可以稍后在给家长里改。", {
        fontFamily: FONT,
        fontSize: "18px",
        color: MUTED,
        wordWrap: cjkWrap(280),
      });
    }
    warmButton(this, 250, 640, "重选年级", () => this.leave("grades"), { width: 180, tone: "secondary" });
  }
}
