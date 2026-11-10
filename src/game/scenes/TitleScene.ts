import Phaser from "phaser";
import { WarriorSprite } from "../art/warrior-sprite";
import { DESKTOP_NOTE, WARRIOR_ART_NOTE } from "../p0";
import { probeEnter, probeNote } from "../probe";
import { redirectUngraded } from "../grade-route";
import { getSave } from "../session";
import { listenKeys } from "../ui";
import { TITLE_START } from "../layout";
import { warmButton } from "../warm/kit";
import { warmBackground, warmInBackground } from "../warm/load";
import { CREAM, FONT_BODY, INK, MUTED } from "../warm/theme";

export class TitleScene extends Phaser.Scene {
  constructor() {
    super("title");
  }

  create(): void {
    probeEnter("title");
    warmInBackground(this, ["atlas_village"], ["bg_village"]);
    warmBackground(this, "bg_home");
    this.add.image(640, 196, "logo_title").setDisplaySize(620, 236);
    this.creamLine(640, 365, "认识单词，收集词卡，和词灵比试。", {
      fontFamily: FONT_BODY,
      fontSize: "22px",
      color: INK,
    }, { height: 46, padX: 28, radius: 23 });
    this.creamLine(640, 414, `${WARRIOR_ART_NOTE} · SAMPLE DATA`, {
      fontFamily: FONT_BODY,
      fontSize: "14px",
      color: MUTED,
    });
    const hero = new WarriorSprite(this, 250, 640, 0.5);
    hero.play("idle");
    const save = getSave();
    const label = save ? "继续冒险 Enter" : "开始冒险 Enter";
    warmButton(this, TITLE_START.x, TITLE_START.y, label, () => this.go(Boolean(save)), { width: 280, height: 64 });
    if (save) warmButton(this, 640, 640, "新的冒险 N", () => this.scene.start("grades", { mode: "new" }), { width: 220, height: 56, tone: "secondary" });
    this.creamLine(640, 700, DESKTOP_NOTE, {
      fontFamily: FONT_BODY,
      fontSize: "15px",
      color: INK,
    });
    listenKeys(this, (event) => {
      if (event.code === "Enter") this.go(Boolean(getSave()));
      if (event.code === "KeyN" && getSave()) this.scene.start("grades", { mode: "new" });
    });
    this.measureFps();
  }

  private creamLine(
    x: number,
    y: number,
    text: string,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    plateSize?: { height: number; padX: number; radius: number },
  ): void {
    const label = this.add.text(x, y, text, style).setOrigin(0.5);
    const width = label.width + (plateSize ? plateSize.padX * 2 : 48);
    const height = plateSize ? plateSize.height : label.height + 16;
    const radius = plateSize ? plateSize.radius : 16;
    const fill = Number.parseInt(CREAM.slice(1), 16);
    const ink = Number.parseInt(INK.slice(1), 16);
    const plate = this.add.graphics();
    plate.fillStyle(fill, 1);
    plate.lineStyle(2, ink, 1);
    plate.fillRoundedRect(x - width / 2, y - height / 2, width, height, radius);
    plate.strokeRoundedRect(x - width / 2, y - height / 2, width, height, radius);
    this.children.moveBelow(plate, label);
  }

  private go(hasSave: boolean): void {
    const save = getSave();
    if (hasSave && save && redirectUngraded(this, save)) {
      return;
    }
    this.scene.start(hasSave ? "overworld" : "grades", hasSave ? undefined : { mode: "new" });
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
