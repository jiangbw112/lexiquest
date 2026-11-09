import Phaser from "phaser";
import { queueChapterCosmetics, reportForestLoad } from "../art/chapter-cosmetics";
import { queueWarriorAtlases, reportWarriorLoad } from "../art/warrior-sprite";
import { probeNote } from "../probe";
import { bootSave } from "../session";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.atlas("actors", "assets/atlases/actors.png", "assets/atlases/actors.json");
    this.load.image("village", "assets/map/village.png");
    queueWarriorAtlases(this);
    queueChapterCosmetics(this);
  }

  create(): void {
    this.input.keyboard?.disableGlobalCapture();
    bootSave();
    reportWarriorLoad(this);
    reportForestLoad(this);
    const fonts = document.fonts;
    const ready = fonts ? fonts.load('16px "WenQuanYi Micro Hei"').catch(() => undefined) : Promise.resolve();
    const cap = new Promise<void>((resolve) => window.setTimeout(resolve, 1200));
    void Promise.race([ready, cap]).then(() => {
      probeNote("boot:ready", { bootMs: Math.round(performance.now()) });
      this.scene.start("title");
    });
  }
}
