import Phaser from "phaser";
import { ensureDailyGoal, goalProgress, goalStatusLine, goalTarget, openingReminder } from "../../domain/parent";
import { dismissReward, questLine, selectedSampleWords, selectionBattleNotice, studyNow } from "../../domain/progress";
import { DESKTOP_NOTE, PLACEHOLDER_NOTE } from "../p0";
import { redirectUngraded } from "../grade-route";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, button, listenKeys } from "../ui";
import { LayeredActor } from "../actors";
import { PLACES, SAFE } from "../layout";

export class OverworldScene extends Phaser.Scene {
  private toast = "";
  private heroRoot?: Phaser.GameObjects.Container;
  private traveling = false;

  constructor() {
    super("overworld");
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
    this.children.removeAll(true);
    this.add.image(0, 0, "village").setOrigin(0, 0);
    this.add.rectangle(SAFE.x + SAFE.width / 2, 62, SAFE.width - 24, 96, 0xfff8ee, 0.94).setStrokeStyle(3, 0x17352a);
    const quest = questLine(save);
    this.add.text(SAFE.x + 24, 28, `${save.player.name} · ${quest}`, {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#17352a",
      wordWrap: { width: SAFE.width - 60 },
    });
    const goal = save.dailyGoal;
    const goalText = `${goalStatusLine(goal)}  ·  累计完成 ${save.goalDaysTotal} 天`;
    const progress = goal ? goalProgress(goal) : 0;
    const target = goal ? goalTarget(goal) : 0;
    probeNote(`goal:${progress}/${target}:${goal?.completed ? "done" : "open"}`);
    this.add.rectangle(520, 168, 780, 78, 0xfff8ee, 0.96).setStrokeStyle(3, 0x1f7a4d);
    this.add.text(160, 142, goalText, { fontFamily: FONT, fontSize: "18px", color: "#1f7a4d", wordWrap: { width: 700 } });
    this.add.text(160, 174, openingReminder(save, studyNow(save)), {
      fontFamily: FONT,
      fontSize: "16px",
      color: "#17352a",
      wordWrap: { width: 700 },
    });
    for (const place of PLACES) {
      const house = this.add.polygon(
        place.x,
        place.y,
        [0, -28, 54, -8, 54, 34, 0, 54, -54, 34, -54, -8],
        place.color,
        1,
      );
      house.setStrokeStyle(3, 0x17352a);
      house.setInteractive({ useHandCursor: true });
      house.on("pointerdown", () => this.go(place.scene));
      this.add.text(place.x, place.y + 4, `${place.label} ${place.key}`, {
        fontFamily: FONT,
        fontSize: "18px",
        color: "#fffaf3",
      }).setOrigin(0.5);
    }
    const hero = new LayeredActor(this, 640, 760, "top");
    hero.applyOutfit(save.equippedOutfitId);
    hero.root.setScale(0.85);
    this.heroRoot = hero.root;
    this.tweens.add({
      targets: hero.root,
      y: 748,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });
    this.add.text(140, 760, `地图小人是${PLACEHOLDER_NOTE} · ${DESKTOP_NOTE}`, { fontFamily: FONT, fontSize: "16px", color: "#e8f5ee" });
    if (save.chapterCleared) {
      button(this, 1100, 140, "回顾结局", () => this.scene.start("ending"), { width: 160, height: 44 });
    }
    if (this.toast || save.rewardQueue[0]) {
      const notice = save.rewardQueue[0];
      const text = notice ? `${notice.title}。${notice.detail}` : this.toast;
      const banner = this.add.rectangle(640, 188, 860, 128, 0x17352a, 0.92);
      banner.setInteractive({ useHandCursor: true });
      banner.on("pointerdown", () => {
        if (getSave()?.rewardQueue[0]) mutate((current) => dismissReward(current));
        this.toast = "";
        this.draw();
      });
      this.add.text(640, 168, text, { fontFamily: FONT, fontSize: "18px", color: "#fffaf3", wordWrap: { width: 800 } }).setOrigin(0.5);
      this.add.text(640, 224, "点击或按 Enter 收下", { fontFamily: FONT, fontSize: "16px", color: "#d7ecdf" }).setOrigin(0.5);
    }
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
