import Phaser from "phaser";
import { MAX_PROFILES, type ProfileFailure } from "../../domain/profiles";
import {
  importProfileText,
  listProfileCards,
  liveProfileCount,
  profileBootIssue,
  selectProfile,
} from "../session";
import { probeEnter } from "../probe";
import { FONT, listenKeys } from "../ui";
import { warmButton, warmPanel } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { ERR_TEXT, FONT_TITLE, INK, MUTED } from "../warm/theme";

const FAILURE: Record<ProfileFailure, string> = {
  full: "已经有 6 个角色，没有写入。",
  corrupt: "这个存档读不了，没有改动已有角色。",
  collision: "这个存档和已有角色重复，没有写入。",
  write: "没有存进去，已有角色保持原样。",
  roster: "角色名单读不了，没有改动存档。",
  "corrupt-legacy": "原来的存档读不了，文件还在，没有新建角色。",
  missing: "没有找到这个角色，没有改动已有角色。",
};

export class ProfilesScene extends Phaser.Scene {
  private notice = "";

  constructor() {
    super("profiles");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_village"], ["bg_home"]);
  }

  create(): void {
    probeEnter("profiles");
    const issue = profileBootIssue();
    this.notice = issue ? FAILURE[issue] : "";
    const input = document.getElementById("profile-import");
    const onFile = () => {
      const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;
      if (!(input instanceof HTMLInputElement) || !file) return;
      input.value = "";
      void file.text().then((text) => {
        if (!this.scene.isActive()) return;
        const added = importProfileText(text);
        this.notice = added.ok ? "已加入一个新角色。" : FAILURE[added.reason];
        this.draw();
      });
    };
    input?.addEventListener("change", onFile);
    this.events.once("shutdown", () => input?.removeEventListener("change", onFile));
    listenKeys(this, (event) => {
      if (event.target instanceof HTMLInputElement) return;
      const index = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(event.code);
      if (index >= 0) this.choose(index);
      if (event.code === "KeyN") this.createNew();
    });
    this.draw();
  }

  private choose(index: number): void {
    const card = listProfileCards()[index];
    if (!card?.readable) return;
    if (!selectProfile(card.slotId)) {
      this.notice = FAILURE.missing;
      this.draw();
      return;
    }
    this.scene.start("title");
  }

  private createNew(): void {
    if (liveProfileCount() >= MAX_PROFILES) {
      this.notice = FAILURE.full;
      this.draw();
      return;
    }
    this.scene.start("grades", { mode: "new" });
  }

  private readFile(): void {
    if (liveProfileCount() >= MAX_PROFILES) {
      this.notice = FAILURE.full;
      this.draw();
      return;
    }
    const input = document.getElementById("profile-import");
    if (input instanceof HTMLInputElement) input.click();
  }

  private draw(): void {
    this.children.removeAll(true);
    warmBackground(this, "bg_home");
    this.add.text(640, 78, "先选角色", {
      fontFamily: FONT_TITLE,
      fontSize: "48px",
      color: INK,
    }).setOrigin(0.5);
    this.add.text(640, 132, "每次打开都先到这里。这台电脑最多 6 个角色。没有角色密码。", {
      fontFamily: FONT,
      fontSize: "20px",
      color: INK,
    }).setOrigin(0.5);
    const cards = listProfileCards();
    if (cards.length === 0) {
      this.add.text(640, 250, "还没有角色。", { fontFamily: FONT, fontSize: "22px", color: MUTED }).setOrigin(0.5);
    }
    cards.slice(0, MAX_PROFILES).forEach((card, index) => {
      const column = index % 3;
      const row = Math.floor(index / 3);
      const x = 250 + column * 390;
      const y = 300 + row * 170;
      warmPanel(this, x, y, 360, 150);
      const title = `${index + 1}  ${card.name}`;
      this.add.text(x, y - 42, title, { fontFamily: FONT, fontSize: "24px", color: INK }).setOrigin(0.5);
      const detail = card.readable
        ? `${card.grades}  ·  已学 ${card.learned} 个词  ·  ${card.cleared ? "已通关" : "未通关"}`
        : "这个角色读不了，没有改动已有角色。";
      this.add.text(x, y - 4, detail, {
        fontFamily: FONT,
        fontSize: "16px",
        color: MUTED,
        align: "center",
        wordWrap: { width: 320 },
      }).setOrigin(0.5);
      const preset = card.readable && card.preset ? `每日目标 ${card.preset}` : "";
      if (preset) this.add.text(x, y + 28, preset, { fontFamily: FONT, fontSize: "16px", color: INK }).setOrigin(0.5);
      if (card.readable) {
        warmButton(this, x, y + 58, "选这个", () => this.choose(index), { width: 140, height: 44 });
      }
    });
    if (this.notice) {
      this.add.text(640, 620, this.notice, {
        fontFamily: FONT,
        fontSize: "18px",
        color: ERR_TEXT,
        align: "center",
        wordWrap: { width: 900 },
      }).setOrigin(0.5);
    }
    const full = liveProfileCount() >= MAX_PROFILES;
    warmButton(this, 420, 700, "新建角色", () => this.createNew(), { width: 220, disabled: full });
    warmButton(this, 860, 700, "读入存档", () => this.readFile(), { width: 220, tone: "secondary", disabled: full });
  }
}
