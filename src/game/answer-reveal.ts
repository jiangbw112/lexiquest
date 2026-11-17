import Phaser from "phaser";
import { browserSpeaker, speakWord } from "../domain/speech";
import { answerRevealLayout, type AnswerRevealSpec } from "./answer-reveal-layout";
import { cjkWrap } from "./layout";
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
    spec: AnswerRevealSpec;
  },
): void {
  if (!reveal || options.hidden) return;
  const layout = answerRevealLayout(options.spec);
  const owned: Phaser.GameObjects.GameObject[] = [];
  const keep = (node: Phaser.GameObjects.GameObject) => {
    owned.push(node);
  };
  if (options.plate) {
    keep(scene.add.rectangle(layout.plate.x + layout.plate.w / 2, layout.plate.y + layout.plate.h / 2, layout.plate.w, layout.plate.h, 0xfff4dc).setStrokeStyle(3, 0x6b4a2a));
  }
  keep(scene.add.text(layout.label.x, layout.label.y, "正确答案", {
    fontFamily: FONT_BODY,
    fontSize: `${options.spec.labelPx}px`,
    color: MUTED,
  }).setOrigin(0, 0));
  keep(scene.add.text(layout.english.x, layout.english.y, reveal.english, {
    fontFamily: FONT_LATIN,
    fontSize: `${options.spec.englishPx}px`,
    fontStyle: "700",
    color: INK,
    wordWrap: cjkWrap(layout.english.w),
  }).setOrigin(0, 0));
  keep(scene.add.text(layout.chinese.x, layout.chinese.y, reveal.chinese, {
    fontFamily: FONT_BODY,
    fontSize: `${options.spec.chinesePx}px`,
    color: INK,
    wordWrap: cjkWrap(layout.chinese.w),
  }).setOrigin(0, 0));
  keep(warmButton(
    scene,
    layout.button.x + layout.button.w / 2,
    layout.button.y + layout.button.h / 2,
    "听一听",
    () => speakWord(reveal.english, browserSpeaker()),
    { width: layout.button.w, height: layout.button.h, tone: "secondary" },
  ));
  if (options.parent) {
    for (const node of owned) options.parent.add(node);
  }
  probeNote(`reveal:${reveal.english}:${reveal.chinese}`);
}
