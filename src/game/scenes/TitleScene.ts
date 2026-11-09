import Phaser from "phaser";
import { DESKTOP_NOTE, PLACEHOLDER_NOTE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { getSave } from "../session";
import { FONT, button, listenKeys } from "../ui";
import { LayeredActor } from "../actors";
import { TITLE_START } from "../layout";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    probeEnter("title");
    this.add.rectangle(640, 400, 1280, 800, 0x143d2c);
    this.add.rectangle(640, 430, 860, 560, 0xfff8ee);
    this.add.text(640, 230, "词境冒险", { fontFamily: FONT, fontSize: "72px", color: "#17352a" }).setOrigin(0.5);
    this.add.text(640, 300, "LexiQuest", { fontFamily: FONT, fontSize: "28px", color: "#1f7a4d" }).setOrigin(0.5);
    this.add.text(640, 360, "认识单词，收集词卡，和词灵比试。", { fontFamily: FONT, fontSize: "22px", color: "#3d5c4e" }).setOrigin(0.5);
    this.add.text(640, 410, `${PLACEHOLDER_NOTE} · SAMPLE DATA`, { fontFamily: FONT, fontSize: "16px", color: "#8a5a12" }).setOrigin(0.5);
    this.add.text(640, 660, DESKTOP_NOTE, { fontFamily: FONT, fontSize: "16px", color: "#d7efe3" }).setOrigin(0.5);
    const hero = new LayeredActor(this, 250, 560, "side");
    hero.applyOutfit("traveler");
    hero.root.setScale(0.7);
    const save = getSave();
    const label = save ? "继续冒险 Enter" : "开始冒险 Enter";
    button(this, TITLE_START.x, TITLE_START.y, label, () => this.go(Boolean(save)), { width: 280, height: 64 });
    if (save) button(this, 640, 640, "新的冒险 N", () => this.scene.start("create"), { width: 220, fill: 0x5c6b62 });
    listenKeys(this, (event) => {
      if (event.code === "Enter") this.go(Boolean(getSave()));
      if (event.code === "KeyN" && getSave()) this.scene.start("create");
    });
    this.measureFps();
  }

  private go(hasSave: boolean): void {
    this.scene.start(hasSave ? "overworld" : "create");
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
