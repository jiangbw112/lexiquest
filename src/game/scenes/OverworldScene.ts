import Phaser from "phaser";
import { dismissReward } from "../../domain/progress";
import { canStartBattle } from "../../domain/battle";
import { MIN_LEARNED_FOR_BATTLE } from "../../domain/battle";
import { DESKTOP_NOTE, PLACEHOLDER_NOTE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { getSave, mutate } from "../session";
import { FONT, listenKeys } from "../ui";
import { LayeredActor } from "../actors";
import { PLACES, SAFE } from "../layout";

export class OverworldScene extends Phaser.Scene {
  private toast = "";

  constructor() {
    super("overworld");
  }

  create(): void {
    if (!getSave()) {
      this.scene.start("title");
      return;
    }
    probeEnter("overworld");
    this.toast = "";
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
    const place = PLACES.find((item) => item.code === event.code);
    if (place) this.go(place.scene);
  }

  private go(scene: string): void {
    const save = getSave();
    if (!save) return;
    if (scene === "battle") {
      const learned = Object.keys(save.wordCards).length;
      if (!canStartBattle(learned)) {
        this.toast = `再认识 ${MIN_LEARNED_FOR_BATTLE - learned} 个词，就能去对战。`;
        probeNote("battle:locked");
        this.draw();
        return;
      }
    }
    this.scene.start(scene);
  }

  private draw(): void {
    const save = getSave();
    if (!save) return;
    this.children.removeAll(true);
    this.add.image(0, 0, "village").setOrigin(0, 0);
    this.add.rectangle(SAFE.x + SAFE.width / 2, 58, SAFE.width - 24, 76, 0xfff8ee, 0.94).setStrokeStyle(3, 0x17352a);
    const learned = Object.keys(save.wordCards).length;
    const quest =
      learned < 4
        ? `去学堂认识单词。还差 ${4 - learned} 张词卡才能对战。`
        : save.battlesWon < 1
          ? "可以去对战词灵了。打出技能卡时要答一道学过的词。"
          : "林间斗篷已经在衣柜里。复习桌会按你的记忆安排。";
    this.add.text(SAFE.x + 24, 36, `${save.player.name} · ${quest}`, {
      fontFamily: FONT,
      fontSize: "20px",
      color: "#17352a",
      wordWrap: { width: SAFE.width - 60 },
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
    this.add.text(140, 760, `地图小人是${PLACEHOLDER_NOTE} · ${DESKTOP_NOTE}`, { fontFamily: FONT, fontSize: "16px", color: "#e8f5ee" });
    if (this.toast || save.rewardQueue[0]) {
      const notice = save.rewardQueue[0];
      const text = notice ? `${notice.title}。${notice.detail}` : this.toast;
      const banner = this.add.rectangle(640, 150, 760, 64, 0x17352a, 0.92);
      banner.setInteractive({ useHandCursor: true });
      banner.on("pointerdown", () => {
        if (getSave()?.rewardQueue[0]) mutate((current) => dismissReward(current));
        this.toast = "";
        this.draw();
      });
      this.add.text(640, 150, text, { fontFamily: FONT, fontSize: "18px", color: "#fffaf3", wordWrap: { width: 720 } }).setOrigin(0.5);
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
