import Phaser from "phaser";
import { MAX_PROFILES, unreadableDeleteStep, type ProfileFailure } from "../../domain/profiles";
import {
  deleteUnreadableProfile,
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
import {
  browserParentPinVault,
  cooldownLabel,
  createParentPinSession,
  pbkdf2PinGate,
  pinFormTitle,
  type ParentPinSession,
} from "../../domain/parent-pin";
import { isDesktopShell } from "../../domain/host-copy";
import { clearPinErrorText } from "../pin-error";
import { paintShellDom } from "../shell-dom";

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
  private armedSlotId: string | null = null;
  private pinSession!: ParentPinSession;
  private pinBusy = false;

  constructor() {
    super("profiles");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_village"], ["bg_home"]);
  }

  create(): void {
    probeEnter("profiles");
    this.pinSession = createParentPinSession({ gate: pbkdf2PinGate, vault: browserParentPinVault() });
    this.pinBusy = false;
    this.armedSlotId = null;
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
    this.bindPinForm();
    clearPinErrorText(document);
    const clock = window.setInterval(() => this.renderPinClock(), 1000);
    this.events.once("shutdown", () => {
      input?.removeEventListener("change", onFile);
      window.clearInterval(clock);
      clearPinErrorText(document);
    });
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
      } else {
        const armed = this.pinSession.unlocked && this.armedSlotId === card.slotId;
        warmButton(this, x, y + 58, armed ? "再按一次" : "请家长删", () => this.askDelete(index), {
          width: armed ? 180 : 160,
          height: 44,
        });
      }
    });
    if (this.notice) {
      warmPanel(this, 640, 620, 560, 48);
      this.add.text(640, 620, this.notice, {
        fontFamily: FONT,
        fontSize: "18px",
        color: ERR_TEXT,
        align: "center",
        wordWrap: { width: 520 },
      }).setOrigin(0.5);
    }
    const full = liveProfileCount() >= MAX_PROFILES;
    warmButton(this, 420, 700, "新建角色", () => this.createNew(), { width: 220, disabled: full });
    warmButton(this, 860, 700, "读入存档", () => this.readFile(), { width: 220, tone: "secondary", disabled: full });
  }

  private askDelete(index: number): void {
    const card = listProfileCards()[index];
    if (!card || card.readable) return;
    if (!this.pinSession.unlocked) {
      this.armedSlotId = null;
      this.notice = "先输入家长密码。";
      this.draw();
      this.renderPinForm();
      return;
    }
    const step = unreadableDeleteStep({
      unlocked: true,
      armedSlotId: this.armedSlotId,
      slotId: card.slotId,
      readable: card.readable,
    });
    this.armedSlotId = step.armedSlotId;
    if (!step.remove) {
      this.notice = "再按一次，删除这个角色";
      this.draw();
      return;
    }
    if (!deleteUnreadableProfile(card.slotId, { unlocked: true, confirmed: true })) {
      this.armedSlotId = null;
      this.notice = "没有删掉，这个角色还在。";
      this.draw();
      return;
    }
    this.armedSlotId = null;
    this.notice = "已删掉读不了的角色。";
    this.draw();
  }

  private bindPinForm(): void {
    const form = document.getElementById("pin-form");
    const forgot = document.getElementById("pin-forgot-button");
    const submit = (event: Event) => {
      event.preventDefault();
      void this.submitPin();
    };
    const startForgot = () => {
      this.pinSession.beginForgot();
      const error = document.getElementById("pin-error");
      if (error) error.textContent = "";
      this.renderPinForm();
    };
    form?.addEventListener("submit", submit);
    forgot?.addEventListener("click", startForgot);
    this.events.once("shutdown", () => {
      form?.removeEventListener("submit", submit);
      forgot?.removeEventListener("click", startForgot);
      form?.classList.remove("open");
      if (form instanceof HTMLFormElement) {
        form.style.left = "";
        form.style.top = "";
        form.style.width = "";
        form.style.transform = "";
      }
    });
  }

  private renderPinForm(): void {
    const form = document.getElementById("pin-form");
    const title = document.getElementById("pin-title");
    const error = document.getElementById("pin-error");
    const confirmLabel = document.getElementById("pin-confirm-label");
    const entry = document.getElementById("pin-entry");
    const forgot = document.getElementById("pin-forgot");
    const challenge = document.getElementById("pin-challenge");
    if (this.pinSession.unlocked) {
      form?.classList.remove("open");
      return;
    }
    paintShellDom(document, isDesktopShell());
    form?.classList.add("open");
    if (title) title.textContent = pinFormTitle(this.pinSession.phase);
    confirmLabel?.classList.toggle("hidden", this.pinSession.phase !== "setup");
    entry?.classList.toggle("hidden", this.pinSession.phase === "forgot");
    forgot?.classList.toggle("hidden", this.pinSession.phase !== "forgot");
    if (challenge) challenge.textContent = this.pinSession.challenge ? `请计算 ${this.pinSession.challenge.prompt}` : "";
    if (error && !error.textContent) error.textContent = this.pinSession.notice ?? "";
    this.renderPinClock();
    this.positionPinForm();
  }

  private positionPinForm(): void {
    const form = document.getElementById("pin-form");
    if (!(form instanceof HTMLFormElement) || !form.classList.contains("open")) return;
    const rect = this.game.canvas.getBoundingClientRect();
    const scale = rect.width / 1280;
    form.style.width = "360px";
    form.style.left = `${rect.left + 460 * scale}px`;
    form.style.top = `${rect.top + 180 * scale}px`;
    form.style.transformOrigin = "top left";
    form.style.transform = `scale(${scale})`;
  }

  private renderPinClock(): void {
    const form = document.getElementById("pin-form");
    if (!form?.classList.contains("open")) return;
    const cooldown = document.getElementById("pin-cooldown");
    const submit = document.getElementById("pin-submit");
    const remaining = this.pinSession.cooldownRemaining(Date.now());
    const waiting = remaining > 0 && this.pinSession.phase !== "forgot";
    if (cooldown) cooldown.textContent = waiting ? cooldownLabel(remaining) : "";
    if (submit instanceof HTMLButtonElement) submit.disabled = waiting || this.pinBusy;
  }

  private async submitPin(): Promise<void> {
    if (this.pinBusy || this.pinSession.unlocked || !this.scene.isActive()) return;
    const input = document.getElementById("pin-input");
    const confirm = document.getElementById("pin-confirm");
    const answer = document.getElementById("pin-answer");
    const error = document.getElementById("pin-error");
    const pin = input instanceof HTMLInputElement ? input.value.trim() : "";
    const again = confirm instanceof HTMLInputElement ? confirm.value.trim() : "";
    const typed = answer instanceof HTMLInputElement ? answer.value.trim() : "";
    this.pinBusy = true;
    this.renderPinClock();
    const result = this.pinSession.phase === "forgot"
      ? this.pinSession.submitForgot(typed, Date.now())
      : await this.pinSession.submitPin(pin, again, Date.now());
    this.pinBusy = false;
    if (!this.scene.isActive()) return;
    if (error) error.textContent = result.ok ? (this.pinSession.notice ?? "") : result.message;
    if (input instanceof HTMLInputElement) input.value = "";
    if (confirm instanceof HTMLInputElement) confirm.value = "";
    if (answer instanceof HTMLInputElement) answer.value = "";
    this.renderPinForm();
    if (result.ok && this.pinSession.unlocked) this.draw();
  }
}
