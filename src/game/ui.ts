import Phaser from "phaser";
import { blip } from "./audio";
import { CREAM, CHIP_ON, CONFIRM_REST, FONT_BODY, TEAL_DEEP, TERRA, TERRA_HOVER, TERRA_PRESSED } from "./warm/theme";

export const FONT = FONT_BODY;

export function paper(scene: Phaser.Scene, fill = 0xfff8ee): Phaser.GameObjects.Rectangle {
  scene.add.rectangle(640, 400, 1280, 800, 0x143d2c);
  return scene.add.rectangle(640, 400, 1040, 740, fill);
}

export function heading(scene: Phaser.Scene, title: string, sub = ""): void {
  scene.add.text(180, 56, title, { fontFamily: FONT, fontSize: "36px", color: "#17352a" });
  if (sub) scene.add.text(180, 102, sub, { fontFamily: FONT, fontSize: "18px", color: "#3d5c4e", wordWrap: { width: 920 } });
}

export function hint(scene: Phaser.Scene, text: string, color = "#3d5c4e"): Phaser.GameObjects.Text {
  return scene.add.text(180, 730, text, { fontFamily: FONT, fontSize: "16px", color });
}

function hexNum(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** Rest, hover, and pressed faces. The old hover no longer paints every button #2F9A63. */
function buttonFaces(fill: number): { rest: number; hover: number; pressed: number; restLabel: string; hotLabel: string } {
  if (fill === hexNum(CONFIRM_REST)) {
    return { rest: fill, hover: hexNum(TEAL_DEEP), pressed: hexNum(CHIP_ON), restLabel: "#fffaf3", hotLabel: CREAM };
  }
  if (fill === hexNum(TERRA)) {
    return { rest: fill, hover: hexNum(TERRA_HOVER), pressed: hexNum(TERRA_PRESSED), restLabel: CREAM, hotLabel: CREAM };
  }
  return { rest: fill, hover: fill, pressed: fill, restLabel: "#fffaf3", hotLabel: "#fffaf3" };
}

export function button(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  options: { width?: number; height?: number; fill?: number; disabled?: boolean } = {},
): Phaser.GameObjects.Container {
  const width = options.width ?? 220;
  const height = options.height ?? 54;
  const disabled = options.disabled === true;
  const fill = options.fill ?? (disabled ? 0xd7e0da : hexNum(CONFIRM_REST));
  const faces = buttonFaces(fill);
  const bg = scene.add.rectangle(0, 0, width, height, fill, 1).setStrokeStyle(3, disabled ? 0x9aa8a0 : 0x17352a);
  const labelText = scene.add
    .text(0, 0, label, { fontFamily: FONT, fontSize: "22px", color: disabled ? "#3d5c4e" : faces.restLabel })
    .setOrigin(0.5);
  const root = scene.add.container(x, y, [bg, labelText]);
  root.setSize(width, height);
  if (disabled) return root;
  const paint = (face: number, color: string) => {
    bg.setFillStyle(face);
    labelText.setColor(color);
  };
  let down = false;
  root.setInteractive(new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height), Phaser.Geom.Rectangle.Contains);
  if (root.input) root.input.cursor = "pointer";
  root.on("pointerover", () => {
    if (!down) paint(faces.hover, faces.hotLabel);
  });
  root.on("pointerout", () => {
    down = false;
    paint(faces.rest, faces.restLabel);
  });
  root.on("pointerdown", () => {
    down = true;
    paint(faces.pressed, faces.hotLabel);
  });
  root.on("pointerup", () => {
    if (!down) return;
    down = false;
    paint(faces.hover, faces.hotLabel);
    blip();
    onClick();
  });
  return root;
}

export function listenKeys(scene: Phaser.Scene, onKey: (event: KeyboardEvent) => void): void {
  scene.input.keyboard?.on("keydown", onKey);
  scene.events.once("shutdown", () => scene.input.keyboard?.off("keydown", onKey));
}

export function backButton(scene: Phaser.Scene, go: () => void): void {
  button(scene, 280, 680, "返回 Esc", go, { width: 180, fill: 0x5c6b62 });
  listenKeys(scene, (event) => {
    if (event.code === "Escape") go();
  });
}
