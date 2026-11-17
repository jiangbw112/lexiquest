import Phaser from "phaser";
import { browserSpeaker, speakWord } from "../domain/speech";
import { probeNote } from "./probe";
import { warmButton } from "./warm/kit";
import { FONT_BODY, FONT_LATIN, INK, MUTED } from "./warm/theme";

/** Wrong answers show the word at once. A button reads it; the save is left alone. */
export function paintAnswerReveal(
  scene: Phaser.Scene,
  reveal: { english: string; chinese: string } | null,
  options: { hidden?: boolean; parent?: Phaser.GameObjects.Container; y?: number; plate?: boolean } = {},
): void {
  if (!reveal || options.hidden) return;
  const y = options.y ?? 236;
  const owned: Phaser.GameObjects.GameObject[] = [];
  const keep = (node: Phaser.GameObjects.GameObject) => {
    owned.push(node);
  };
  if (options.plate) {
    keep(scene.add.rectangle(640, y, 1080, 76, 0xfff4dc).setStrokeStyle(3, 0x6b4a2a));
  }
  keep(scene.add.text(170, y, "正确答案", {
    fontFamily: FONT_BODY,
    fontSize: "18px",
    color: MUTED,
  }).setOrigin(0, 0.5));
  const english = scene.add.text(270, y, reveal.english, {
    fontFamily: FONT_LATIN,
    fontSize: "28px",
    fontStyle: "700",
    color: INK,
  }).setOrigin(0, 0.5);
  keep(english);
  const chinese = scene.add.text(270 + english.width + 16, y, reveal.chinese, {
    fontFamily: FONT_BODY,
    fontSize: "22px",
    color: INK,
  }).setOrigin(0, 0.5);
  keep(chinese);
  const limit = 960;
  if (chinese.x + chinese.width > limit) {
    const room = Math.max(40, limit - chinese.x);
    chinese.setScale(room / chinese.width);
  }
  keep(warmButton(scene, 1080, y, "听一听", () => speakWord(reveal.english, browserSpeaker()), {
    width: 140,
    height: 48,
    tone: "secondary",
  }));
  if (options.parent) {
    for (const node of owned) options.parent.add(node);
  }
  probeNote(`reveal:${reveal.english}:${reveal.chinese}`);
}
