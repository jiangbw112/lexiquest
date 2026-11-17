import Phaser from "phaser";
import { browserSpeaker, speakWord } from "../domain/speech";
import { ANSWER_REVEAL_BUTTON, answerRevealLayout } from "./answer-reveal-layout";
import { probeNote } from "./probe";
import { warmButton } from "./warm/kit";
import { FONT_BODY, FONT_LATIN, INK, MUTED } from "./warm/theme";

export { BATTLE_ANSWER_REVEAL, EXAM_ANSWER_REVEAL, answerRevealLayout } from "./answer-reveal-layout";

/** Wrong answers show the word at once. A button reads it; the save is left alone. */
export function paintAnswerReveal(
  scene: Phaser.Scene,
  reveal: { english: string; chinese: string } | null,
  options: {
    hidden?: boolean;
    parent?: Phaser.GameObjects.Container;
    plate?: boolean;
    x?: number;
    y?: number;
    width?: number;
  } = {},
): void {
  if (!reveal || options.hidden) return;
  const { plate, button } = answerRevealLayout({
    x: options.x ?? 640,
    y: options.y ?? 236,
    width: options.width ?? 1080,
  });
  const owned: Phaser.GameObjects.GameObject[] = [];
  const keep = (node: Phaser.GameObjects.GameObject) => {
    owned.push(node);
  };
  if (options.plate) {
    keep(scene.add.rectangle(plate.x + plate.w / 2, plate.y + plate.h / 2, plate.w, plate.h, 0xfff4dc).setStrokeStyle(3, 0x6b4a2a));
  }
  const label = scene.add.text(plate.x + 20, options.y ?? 236, "正确答案", {
    fontFamily: FONT_BODY,
    fontSize: "18px",
    color: MUTED,
  }).setOrigin(0, 0.5);
  keep(label);
  const english = scene.add.text(label.x + label.width + 12, label.y, reveal.english, {
    fontFamily: FONT_LATIN,
    fontSize: "28px",
    fontStyle: "700",
    color: INK,
  }).setOrigin(0, 0.5);
  keep(english);
  const chinese = scene.add.text(english.x + english.width + 12, label.y, reveal.chinese, {
    fontFamily: FONT_BODY,
    fontSize: "22px",
    color: INK,
  }).setOrigin(0, 0.5);
  keep(chinese);
  const limit = button.x - 12;
  if (chinese.x + chinese.width > limit) {
    const room = Math.max(40, limit - chinese.x);
    chinese.setScale(room / chinese.width);
  }
  keep(warmButton(scene, button.x + button.w / 2, label.y, "听一听", () => speakWord(reveal.english, browserSpeaker()), {
    width: ANSWER_REVEAL_BUTTON.width,
    height: ANSWER_REVEAL_BUTTON.height,
    tone: "secondary",
  }));
  if (options.parent) {
    for (const node of owned) options.parent.add(node);
  }
  probeNote(`reveal:${reveal.english}:${reveal.chinese}`);
}
