import Phaser from "phaser";
import sliceFile from "./slices.json";
import { blip } from "../audio";
import { containerHitArea } from "../hit";
import { OPTION_BADGE_CENTER } from "../layout";
import { tabFrame, tabLabelY } from "./frames";
import { CREAM, DIS_TEXT, FONT_LATIN, FONT_TITLE, INK, motionOff } from "./theme";

interface SlicePart {
  nineslice?: { left: number; right: number; top: number; bottom: number };
}

const parts = sliceFile.parts as unknown as Record<string, SlicePart>;

type ButtonTone = "primary" | "secondary" | "coral" | "teal" | "sky";
type ButtonState = "normal" | "hover" | "pressed" | "disabled";

const TONE_ATLAS: Record<ButtonTone, string> = {
  primary: "atlas_ui_core",
  secondary: "atlas_ui_core",
  coral: "atlas_battle",
  teal: "atlas_battle",
  sky: "atlas_battle",
};

const TONE_FRAME: Record<ButtonTone, string> = {
  primary: "btn_primary",
  secondary: "btn_secondary",
  coral: "btn_action_coral",
  teal: "btn_action_teal",
  sky: "btn_action_sky",
};

function insets(frame: string): { left: number; right: number; top: number; bottom: number } {
  const slice = parts[frame]?.nineslice;
  if (!slice) throw new Error(`missing nineslice insets for ${frame}`);
  return slice;
}

export function warmSlice(
  scene: Phaser.Scene,
  atlas: string,
  frame: string,
  logicalW: number,
  logicalH: number,
): Phaser.GameObjects.NineSlice {
  const slice = insets(frame);
  return scene.add
    .nineslice(0, 0, atlas, frame, logicalW * 2, logicalH * 2, slice.left, slice.right, slice.top, slice.bottom)
    .setScale(0.5);
}

function showState(slices: Record<ButtonState, Phaser.GameObjects.NineSlice>, state: ButtonState): void {
  (Object.keys(slices) as ButtonState[]).forEach((key) => slices[key].setVisible(key === state));
}

function labelStyle(tone: ButtonTone, disabled: boolean): Phaser.Types.GameObjects.Text.TextStyle {
  if (disabled) {
    return { fontFamily: FONT_TITLE, fontSize: "22px", color: DIS_TEXT };
  }
  const onDark = tone === "coral" || tone === "teal";
  return {
    fontFamily: FONT_TITLE,
    fontSize: "22px",
    color: onDark ? CREAM : INK,
    stroke: onDark ? INK : undefined,
    strokeThickness: onDark ? 5 : 0,
  };
}

export function warmButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: { width?: number; tone?: ButtonTone; disabled?: boolean } = {},
): Phaser.GameObjects.Container {
  const width = options.width ?? 220;
  const height = 56;
  const tone = options.tone ?? "primary";
  const disabled = options.disabled === true;
  const atlas = TONE_ATLAS[tone];
  const prefix = TONE_FRAME[tone];
  const states: ButtonState[] = ["normal", "hover", "pressed", "disabled"];
  const slices = {} as Record<ButtonState, Phaser.GameObjects.NineSlice>;
  for (const state of states) slices[state] = warmSlice(scene, atlas, `${prefix}_${state}`, width, height);
  const text = scene.add.text(0, -3, label, labelStyle(tone, disabled)).setOrigin(0.5);
  const root = scene.add.container(x, y, [...states.map((state) => slices[state]), text]);
  showState(slices, disabled ? "disabled" : "normal");
  root.setSize(width, height);
  if (disabled) return root;
  let down = false;
  const reduce = motionOff();
  const scaleTo = (value: number, duration: number) => {
    if (reduce) {
      root.setScale(value);
      return;
    }
    scene.tweens.add({ targets: root, scale: value, duration, ease: duration === 70 ? "Quad.easeOut" : "Sine.easeOut" });
  };
  const area = containerHitArea(width, height);
  root.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
  if (root.input) root.input.cursor = "pointer";
  root.on("pointerover", () => {
    if (down) return;
    showState(slices, "hover");
    scaleTo(1.03, 120);
  });
  root.on("pointerout", () => {
    down = false;
    showState(slices, "normal");
    text.setY(-3);
    scaleTo(1, 120);
  });
  root.on("pointerdown", () => {
    down = true;
    showState(slices, "pressed");
    text.setY(3);
    scaleTo(0.97, 70);
  });
  root.on("pointerup", () => {
    if (!down) return;
    down = false;
    showState(slices, "hover");
    text.setY(-3);
    scaleTo(1, 140);
    blip();
    onClick();
  });
  return root;
}

export function warmChip(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  selected: boolean,
  onClick: () => void,
  options: { width?: number; disabled?: boolean } = {},
): Phaser.GameObjects.Container {
  const width = options.width ?? 180;
  const height = 56;
  const disabled = options.disabled === true;
  const prefix = selected ? "chip_on" : "chip_off";
  const states: ButtonState[] = ["normal", "hover", "pressed", "disabled"];
  const slices = {} as Record<ButtonState, Phaser.GameObjects.NineSlice>;
  for (const state of states) slices[state] = warmSlice(scene, "atlas_ui_core", `${prefix}_${state}`, width, height);
  const text = scene.add
    .text(selected ? 12 : 0, -3, label, {
      fontFamily: FONT_TITLE,
      fontSize: "24px",
      color: disabled ? DIS_TEXT : selected ? CREAM : INK,
      stroke: selected && !disabled ? INK : undefined,
      strokeThickness: selected && !disabled ? 4 : 0,
    })
    .setOrigin(0.5);
  const badge = scene.add.graphics();
  badge.fillStyle(0xfff4dc, 1);
  badge.fillCircle(-width / 2 + 30, -3, 16);
  badge.setVisible(selected);
  const mark = scene.add.image(-width / 2 + 30, -3, "atlas_ui_core", "icon_check").setScale(28 / 96);
  mark.setVisible(selected);
  const root = scene.add.container(x, y, [...states.map((state) => slices[state]), badge, mark, text]);
  showState(slices, disabled ? "disabled" : "normal");
  root.setSize(width, height);
  if (!disabled && selected && !motionOff()) {
    root.setScale(0.94);
    scene.tweens.add({ targets: root, scale: 1, duration: 160, ease: "Back.easeOut" });
  }
  if (disabled) return root;
  let down = false;
  const area = containerHitArea(width, height);
  root.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
  if (root.input) root.input.cursor = "pointer";
  root.on("pointerover", () => {
    if (!down) showState(slices, "hover");
  });
  root.on("pointerout", () => {
    down = false;
    showState(slices, "normal");
    text.setY(-3);
  });
  root.on("pointerdown", () => {
    down = true;
    showState(slices, "pressed");
    text.setY(3);
  });
  root.on("pointerup", () => {
    if (!down) return;
    down = false;
    blip();
    onClick();
  });
  return root;
}

export interface WarmOption {
  id: string;
  root: Phaser.GameObjects.Container;
  setResult(state: "correct" | "wrong" | "disabled"): void;
}

export function warmOption(
  scene: Phaser.Scene,
  x: number,
  y: number,
  index: number,
  id: string,
  label: string,
  onClick: () => void,
): WarmOption {
  const width = 640;
  const height = 56;
  const frames = ["normal", "hover", "pressed", "disabled", "correct", "wrong"] as const;
  const slices = {} as Record<(typeof frames)[number], Phaser.GameObjects.NineSlice>;
  for (const frame of frames) slices[frame] = warmSlice(scene, "atlas_ui_core", `option_${frame}`, width, height);
  const show = (frame: (typeof frames)[number]) => {
    frames.forEach((key) => slices[key].setVisible(key === frame));
  };
  show("normal");
  const number = scene.add
    .text(-width / 2 + OPTION_BADGE_CENTER, -2, String(index + 1), {
      fontFamily: FONT_LATIN,
      fontSize: "28px",
      fontStyle: "900",
      color: INK,
    })
    .setOrigin(0.5);
  const text = scene.add
    .text(-width / 2 + 78, -2, label, {
      fontFamily: /^[\u0020-\u007e]*$/.test(label) ? FONT_LATIN : '"Noto Sans SC", "Nunito", sans-serif',
      fontSize: "24px",
      fontStyle: "700",
      color: INK,
    })
    .setOrigin(0, 0.5);
  const root = scene.add.container(x, y, [...frames.map((frame) => slices[frame]), number, text]);
  root.setSize(width, height);
  let down = false;
  let locked = false;
  const area = containerHitArea(width, height);
  root.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
  if (root.input) root.input.cursor = "pointer";
  root.on("pointerover", () => {
    if (!locked && !down) show("hover");
  });
  root.on("pointerout", () => {
    if (locked) return;
    down = false;
    show("normal");
  });
  root.on("pointerdown", () => {
    if (locked) return;
    down = true;
    show("pressed");
  });
  root.on("pointerup", () => {
    if (locked || !down) return;
    down = false;
    blip();
    onClick();
  });
  return {
    id,
    root,
    setResult(state) {
      locked = true;
      root.disableInteractive();
      show(state);
      if (state === "correct" || state === "wrong") number.setVisible(false);
      if (state === "wrong" && !motionOff()) {
        scene.tweens.add({ targets: root, x: x + 6, duration: 50, yoyo: true, repeat: 3, ease: "Sine.easeInOut" });
      }
      if (state === "correct" && !motionOff()) {
        scene.tweens.add({ targets: root, scale: 1.05, duration: 120, yoyo: true, ease: "Quad.easeOut" });
      }
    },
  };
}

/** Wood title plank. The label is ink and has no stroke. */
export function warmTitlePlank(scene: Phaser.Scene, x: number, y: number, width: number, title: string): Phaser.GameObjects.Text {
  warmPanel(scene, x, y, width, 58, "panel_wood");
  const text = scene.add
    .text(x, y, title, {
      fontFamily: FONT_TITLE,
      fontSize: "28px",
      color: INK,
    })
    .setOrigin(0.5);
  const limit = width - 48;
  if (text.width > limit) text.setScale(limit / text.width);
  return text;
}

export function warmPanel(scene: Phaser.Scene, x: number, y: number, width: number, height: number, frame = "panel_parchment"): Phaser.GameObjects.NineSlice {
  const slice = warmSlice(scene, "atlas_ui_core", frame, width, height);
  slice.setPosition(x, y);
  return slice;
}

export function warmBar(scene: Phaser.Scene, x: number, y: number, width: number, ratio: number, fill: "gold" | "leaf"): void {
  const frame = warmSlice(scene, "atlas_ui_core", "progress_frame", width, 24);
  frame.setPosition(x, y);
  const clamped = Math.max(0, Math.min(1, ratio));
  if (clamped <= 0) return;
  const inner = Math.max(16, (width - 8) * clamped);
  const bar = warmSlice(scene, "atlas_ui_core", fill === "gold" ? "progress_fill_gold" : "progress_fill_leaf", inner, 16);
  bar.setPosition(x - width / 2 + 4 + inner / 2, y);
}

export function warmTab(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  selected: boolean,
  onClick: () => void,
  width = 180,
): Phaser.GameObjects.Container {
  const height = 52;
  const states: ButtonState[] = ["normal", "hover", "pressed", "disabled"];
  const slices = {} as Record<ButtonState, Phaser.GameObjects.NineSlice>;
  for (const state of states) {
    const frame = state === "disabled" ? (selected ? "tab_selected" : "tab_disabled") : tabFrame(selected, state);
    slices[state] = warmSlice(scene, "atlas_ui_core", frame, width, height);
  }
  const text = scene.add
    .text(0, tabLabelY(selected, "normal"), label, {
      fontFamily: FONT_TITLE,
      fontSize: "22px",
      color: INK,
      stroke: INK,
      strokeThickness: selected ? 3 : 0,
    })
    .setOrigin(0.5);
  const root = scene.add.container(x, y, [...states.map((state) => slices[state]), text]);
  showState(slices, "normal");
  root.setSize(width, height);
  let down = false;
  const area = containerHitArea(width, height);
  root.setInteractive(new Phaser.Geom.Rectangle(area.x, area.y, area.width, area.height), Phaser.Geom.Rectangle.Contains);
  if (root.input) root.input.cursor = "pointer";
  root.on("pointerover", () => {
    if (!selected && !down) showState(slices, "hover");
  });
  root.on("pointerout", () => {
    down = false;
    showState(slices, "normal");
    text.setY(tabLabelY(selected, "normal"));
  });
  root.on("pointerdown", () => {
    down = true;
    if (selected) return;
    showState(slices, "pressed");
    text.setY(tabLabelY(false, "pressed"));
  });
  root.on("pointerup", () => {
    if (!down) return;
    down = false;
    if (!selected) {
      slices.normal.setFrame(tabFrame(false, "released"));
      showState(slices, "normal");
    }
    text.setY(tabLabelY(true, "released"));
    blip();
    onClick();
  });
  return root;
}
