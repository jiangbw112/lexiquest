import Phaser from "phaser";
import { ensureDailyGoal, goalProgress, goalStatusLine, goalTarget, openingReminder } from "../../domain/parent";
import { dismissReward, questLine, selectedSampleWords, selectionBattleNotice, studyNow } from "../../domain/progress";
import { destroyDrawn } from "../destroy-drawn";
import { redirectUngraded } from "../grade-route";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { containerHitArea, VILLAGE_BUILDING_HEIGHT, VILLAGE_BUILDING_WIDTH, villageSignLocal } from "../hit";
import { listenKeys } from "../ui";
import { LayeredActor } from "../actors";
import { DIALOG_HEADER, PLACES, REWARD_DIALOG, SAFE, cjkWrap, rewardDialogChrome, type Place } from "../layout";
import { warmButton, warmPanel, warmSlice } from "../warm/kit";
import { queueWarm, warmBackground } from "../warm/load";
import { CREAM, FONT_BODY, FONT_TITLE, INK, TEAL_DEEP } from "../warm/theme";

export class OverworldScene extends Phaser.Scene {
  private toast = "";
  private heroRoot?: Phaser.GameObjects.Container;
  private traveling = false;

  constructor() {
    super("overworld");
  }

  preload(): void {
    queueWarm(this, ["atlas_ui_core", "atlas_village"], ["bg_village"]);
  }

  create(): void {
    const save = getSave();
    if (!save) {
      this.scene.start("title");
      return;
    }
    if (redirectUngraded(this, save)) return;
    probeEnter("overworld");
    this.toast = "";
    this.traveling = false;
    mutate((save) => ensureDailyGoal(save, studyNow(save)));
    this.draw();
    listenKeys(this, (event) => this.onKey(event));
    this.measureFps();
  }

  private onKey(event: KeyboardEvent): void {
    const save = getSave();
    if (!save) return;
    if (event.code === "Enter" && save.rewardQueue[0]) {
      mutate((current) => dismissReward(current));
      this.draw();
      return;
    }
    if (this.traveling) return;
    const place = PLACES.find((item) => item.code === event.code);
    if (place) this.go(place.scene);
  }

  private go(scene: string): void {
    const save = getSave();
    if (!save || this.traveling) return;
    if ((scene === "learn" || scene === "stages") && redirectUngraded(this, save)) return;
    if (scene === "stages") {
      const tooSmall = selectionBattleNotice(selectedSampleWords(save).length);
      if (tooSmall) {
        this.toast = tooSmall;
        probeNote("battle:locked");
        this.draw();
        return;
      }
    }
    const place = PLACES.find((item) => item.scene === scene);
    const root = this.heroRoot;
    if (!place || !root) {
      this.scene.start(scene);
      return;
    }
    this.traveling = true;
    this.tweens.killTweensOf(root);
    this.tweens.add({
      targets: root,
      x: place.x,
      y: place.y + 48,
      duration: 320,
      ease: "Sine.easeInOut",
      onComplete: () => this.scene.start(scene),
    });
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    destroyDrawn(this.children.list);
    warmBackground(this, "bg_village");
    warmPanel(this, SAFE.x + SAFE.width / 2, 62, SAFE.width - 24, 96);
    const quest = questLine(save);
    this.add.text(SAFE.x + 24, 28, `${save.player.name} · ${quest}`, {
      fontFamily: FONT_BODY,
      fontSize: "20px",
      color: INK,
      wordWrap: cjkWrap(SAFE.width - 60),
    });
    const goal = save.dailyGoal;
    const goalText = `${goalStatusLine(goal)}  ·  累计完成 ${save.goalDaysTotal} 天`;
    const progress = goal ? goalProgress(goal) : 0;
    const target = goal ? goalTarget(goal) : 0;
    probeNote(`goal:${progress}/${target}:${goal?.completed ? "done" : "open"}`);
    warmPanel(this, 520, 168, 780, 78);
    this.add.text(160, 142, goalText, { fontFamily: FONT_BODY, fontSize: "18px", color: TEAL_DEEP, wordWrap: cjkWrap(700) });
    this.add.text(160, 174, openingReminder(save, studyNow(save)), {
      fontFamily: FONT_BODY,
      fontSize: "16px",
      color: INK,
      wordWrap: cjkWrap(700),
    });
    for (const place of PLACES) this.building(place);
    // SPEC Part A puts the hero on the plaza. Buildings stay where layout.ts placed them.
    const hero = new LayeredActor(this, 640, 520, "top");
    hero.applyOutfit(save.equippedOutfitId);
    hero.root.setScale(0.85);
    this.heroRoot = hero.root;
    this.tweens.add({
      targets: hero.floatingLayers(),
      y: 508 - 520,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    if (save.chapterCleared) {
      warmButton(this, 1100, 140, "回顾结局", () => this.scene.start("ending"), { width: 160, height: 56 });
    }
    if (this.toast || save.rewardQueue[0]) {
      const notice = save.rewardQueue[0];
      const chrome = rewardDialogChrome();
      const mask = this.add.rectangle(640, 400, 1280, 800, 0x3b2a20, 0.65);
      mask.setInteractive();
      if (mask.input) mask.input.cursor = "default";
      this.add.rectangle(chrome.fillX, chrome.fillY, chrome.fillWidth, chrome.fillHeight, DIALOG_HEADER, 1);
      const dialog = warmSlice(this, "atlas_ui_core", "dialog", REWARD_DIALOG.width, REWARD_DIALOG.height);
      dialog.setPosition(REWARD_DIALOG.x, REWARD_DIALOG.y);
      const title = notice?.title ?? "";
      const detail = notice?.detail ?? this.toast;
      this.add.text(REWARD_DIALOG.x, chrome.titleY, title, { fontFamily: FONT_BODY, fontSize: "22px", fontStyle: "700", color: CREAM }).setOrigin(0.5);
      this.add.text(REWARD_DIALOG.x, 248, detail, { fontFamily: FONT_BODY, fontSize: "18px", color: INK, wordWrap: cjkWrap(760), align: "center" }).setOrigin(0.5);
      this.add.text(REWARD_DIALOG.x, 308, "点击或按 Enter 收下", { fontFamily: FONT_BODY, fontSize: "16px", color: INK }).setOrigin(0.5);
      const hit = this.add.container(REWARD_DIALOG.x, REWARD_DIALOG.y);
      hit.setSize(REWARD_DIALOG.width, REWARD_DIALOG.height);
      const area = containerHitArea(REWARD_DIALOG.width, REWARD_DIALOG.height);
      hit.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
      if (hit.input) hit.input.cursor = "pointer";
      hit.on("pointerdown", () => {
        if (getSave()?.rewardQueue[0]) mutate((current) => dismissReward(current));
        this.toast = "";
        this.draw();
      });
    }
  }

  private building(place: Place): void {
    const sign = villageSignLocal();
    const frame = (state: "normal" | "hover" | "pressed") => `village_bld_${place.id}_${state}`;
    const image = this.add.image(0, 0, "atlas_village", frame("normal")).setScale(0.5);
    const label = this.add.text(sign.x, sign.y, `${place.label} ${place.key}`, {
      fontFamily: FONT_TITLE,
      fontSize: "18px",
      color: INK,
    }).setOrigin(0.5);
    const root = this.add.container(place.x, place.y, [image, label]);
    root.setSize(VILLAGE_BUILDING_WIDTH, VILLAGE_BUILDING_HEIGHT);
    const area = containerHitArea(VILLAGE_BUILDING_WIDTH, VILLAGE_BUILDING_HEIGHT);
    root.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
    if (root.input) root.input.cursor = "pointer";
    let down = false;
    root.on("pointerover", () => {
      if (down) return;
      image.setFrame(frame("hover"));
    });
    root.on("pointerout", () => {
      down = false;
      image.setFrame(frame("normal"));
      label.setY(sign.y);
    });
    root.on("pointerdown", () => {
      down = true;
      image.setFrame(frame("pressed"));
      label.setY(sign.y + 2);
    });
    root.on("pointerup", () => {
      if (!down) return;
      down = false;
      image.setFrame(frame("hover"));
      label.setY(sign.y);
      this.go(place.scene);
    });
  }

  private measureFps(): void {
    let frames = 0;
    const started = performance.now();
    const tick = () => {
      frames += 1;
      if (frames < 45) return;
      this.events.off(Phaser.Scenes.Events.UPDATE, tick);
      const fps = Math.round((frames * 1000) / Math.max(1, performance.now() - started));
      const memory = (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory;
      probeNote("fps", { fps, heapBytes: memory?.usedJSHeapSize ?? null });
    };
    this.events.on(Phaser.Scenes.Events.UPDATE, tick);
  }
}
