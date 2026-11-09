import Phaser from "phaser";
import { queueChapterCosmetics, reportForestLoad } from "../art/chapter-cosmetics";
import { queueWarriorAtlases, reportWarriorLoad } from "../art/warrior-sprite";
import { probeNote } from "../probe";
import { bootSave } from "../session";
import { queueWarm } from "../warm/load";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    this.load.atlas("actors", "assets/atlases/actors.png", "assets/atlases/actors.json");
    this.load.image("village", "assets/map/village.png");
    queueWarriorAtlases(this);
    queueChapterCosmetics(this);
    queueWarm(this, ["atlas_ui_core"], ["bg_forest"]);
  }

  create(): void {
    this.input.keyboard?.disableGlobalCapture();
    bootSave();
    reportWarriorLoad(this);
    reportForestLoad(this);
    const fonts = document.fonts;
    const ready = fonts
      ? Promise.all([
          fonts.load('400 20px "Noto Sans SC"', "学堂"),
          fonts.load('700 20px "Noto Sans SC"', "继续"),
          fonts.load('24px "ZCOOL KuaiLe"', "开始"),
          fonts.load('800 24px "Nunito"', "apple"),
        ]).catch(() => undefined)
      : Promise.resolve();
    const cap = new Promise<void>((resolve) => window.setTimeout(resolve, 1500));
    void Promise.race([ready, cap]).then(() => {
      probeNote("boot:ready", { bootMs: Math.round(performance.now()) });
      this.scene.start("title");
    });
  }
}
